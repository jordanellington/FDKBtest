import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/fdkb.sqlite');

const db = new Database(DB_PATH);

// Performance pragmas
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    modified_at TEXT,
    cached_at INTEGER,
    created_at INTEGER DEFAULT (unixepoch())
  );

  CREATE TABLE IF NOT EXISTS chunks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    doc_id INTEGER NOT NULL,
    text TEXT NOT NULL,
    page INTEGER NOT NULL,
    section_header TEXT DEFAULT '',
    embedding BLOB NOT NULL,
    seq INTEGER NOT NULL,
    FOREIGN KEY (doc_id) REFERENCES documents(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chunks_doc ON chunks(doc_id);
`);

// Prepared statements
const stmts = {
  upsertDoc: db.prepare(`
    INSERT INTO documents (node_id, name, modified_at, cached_at)
    VALUES (@nodeId, @name, @modifiedAt, @cachedAt)
    ON CONFLICT(node_id) DO UPDATE SET
      name = @name,
      modified_at = @modifiedAt,
      cached_at = @cachedAt
    RETURNING id
  `),

  getDoc: db.prepare('SELECT * FROM documents WHERE node_id = ?'),
  getDocCount: db.prepare('SELECT COUNT(*) as count FROM documents'),
  getAllDocs: db.prepare('SELECT * FROM documents'),

  insertChunk: db.prepare(`
    INSERT INTO chunks (doc_id, text, page, section_header, embedding, seq)
    VALUES (@docId, @text, @page, @sectionHeader, @embedding, @seq)
  `),

  deleteDocChunks: db.prepare('DELETE FROM chunks WHERE doc_id = ?'),
  deleteDoc: db.prepare('DELETE FROM documents WHERE node_id = ?'),

  getDocChunks: db.prepare('SELECT * FROM chunks WHERE doc_id = ? ORDER BY seq'),

  loadAllEmbeddings: db.prepare(`
    SELECT c.text, c.page, c.section_header, c.embedding, d.node_id, d.name
    FROM chunks c
    JOIN documents d ON c.doc_id = d.id
    ORDER BY d.id, c.seq
  `),

  loadFilteredEmbeddings: db.prepare(`
    SELECT c.text, c.page, c.section_header, c.embedding, d.node_id, d.name
    FROM chunks c
    JOIN documents d ON c.doc_id = d.id
    WHERE d.node_id IN (SELECT value FROM json_each(?))
    ORDER BY d.id, c.seq
  `),

  clearAll: db.prepare('DELETE FROM documents'),
};

// Transactional bulk insert for chunks
const insertChunksTransaction = db.transaction((docId, chunks, embeddings) => {
  stmts.deleteDocChunks.run(docId);
  for (let i = 0; i < chunks.length; i++) {
    const embedding = Buffer.from(embeddings[i].buffer, embeddings[i].byteOffset, embeddings[i].byteLength);
    stmts.insertChunk.run({
      docId,
      text: chunks[i].text,
      page: chunks[i].page,
      sectionHeader: chunks[i].sectionHeader || '',
      embedding,
      seq: i,
    });
  }
});

export default {
  /** Upsert a document and return its rowid */
  upsertDoc(nodeId, name, modifiedAt) {
    const row = stmts.upsertDoc.get({ nodeId, name, modifiedAt, cachedAt: Date.now() });
    return row.id;
  },

  /** Get a document by nodeId */
  getDoc(nodeId) {
    return stmts.getDoc.get(nodeId) || null;
  },

  /** Count indexed documents */
  getDocCount() {
    return stmts.getDocCount.get().count;
  },

  /** Get all documents */
  getAllDocs() {
    return stmts.getAllDocs.all();
  },

  /** Insert chunks + embeddings for a document (replaces existing) */
  insertChunks(docId, chunks, embeddings) {
    insertChunksTransaction(docId, chunks, embeddings);
  },

  /** Delete a document and its chunks */
  deleteDoc(nodeId) {
    stmts.deleteDoc.run(nodeId);
  },

  /** Get chunks for a document (embeddings returned as Buffers) */
  getDocChunks(docId) {
    return stmts.getDocChunks.all(docId);
  },

  /** Load all embeddings for corpus search, optionally filtered by nodeIds */
  loadAllEmbeddings(nodeIds) {
    const rows = nodeIds
      ? stmts.loadFilteredEmbeddings.all(JSON.stringify(nodeIds))
      : stmts.loadAllEmbeddings.all();

    return rows.map(row => ({
      text: row.text,
      page: row.page,
      sectionHeader: row.section_header,
      embedding: new Float32Array(row.embedding.buffer, row.embedding.byteOffset, row.embedding.byteLength / 4),
      docId: row.node_id,
      docName: row.name,
    }));
  },

  /** Clear all data */
  clearAll() {
    stmts.clearAll.run();
  },

  /** Close the database */
  close() {
    db.close();
  },
};
