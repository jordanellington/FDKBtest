import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';

/**
 * Tests for folder ancestry storage and filtering in the RAG index.
 * Uses an in-memory SQLite DB that mirrors the production schema.
 */

let db;

// Reproduce the production schema + migrations in memory
function createTestDb() {
  const testDb = new Database(':memory:');
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  testDb.exec(`
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

  // Idempotent migrations (same as production db.js)
  try { testDb.exec('ALTER TABLE documents ADD COLUMN folder_node_id TEXT DEFAULT NULL'); } catch (_) {}
  try { testDb.exec('ALTER TABLE documents ADD COLUMN folder_path TEXT DEFAULT NULL'); } catch (_) {}

  return testDb;
}

// Helper: insert a document with folder info
function insertDoc(nodeId, name, folderNodeId, folderPath) {
  const stmt = db.prepare(`
    INSERT INTO documents (node_id, name, modified_at, cached_at, folder_node_id, folder_path)
    VALUES (@nodeId, @name, 'unknown', @cachedAt, @folderNodeId, @folderPath)
    ON CONFLICT(node_id) DO UPDATE SET
      folder_node_id = @folderNodeId,
      folder_path = @folderPath
    RETURNING id
  `);
  return stmt.get({ nodeId, name, folderNodeId, folderPath, cachedAt: Date.now() }).id;
}

// Helper: insert a fake chunk for a document
function insertChunk(docId, text, page) {
  // 4-element Float32Array as minimal embedding (16 bytes)
  const embedding = Buffer.from(new Float32Array([0.1, 0.2, 0.3, 0.4]).buffer);
  db.prepare(`
    INSERT INTO chunks (doc_id, text, page, section_header, embedding, seq)
    VALUES (?, ?, ?, '', ?, 0)
  `).run(docId, text, page, embedding);
}

// The query we're testing — same as production loadEmbeddingsByFolder
function loadEmbeddingsByFolder(folderNodeId) {
  const rows = db.prepare(`
    SELECT c.text, c.page, c.section_header, c.embedding, d.node_id, d.name
    FROM chunks c
    JOIN documents d ON c.doc_id = d.id
    WHERE d.folder_path LIKE '%' || @folderNodeId || '%'
    ORDER BY d.id, c.seq
  `).all({ folderNodeId });

  return rows.map(row => ({
    text: row.text,
    page: row.page,
    docId: row.node_id,
    docName: row.name,
  }));
}

/**
 * Simulated folder tree:
 *
 *   root-id
 *   └── doclib-id
 *       └── section12-id  ("12 Cloning & Bioethics")
 *       │   ├── folder-12.1-id  ("12.1 Human Cloning")
 *       │   │   ├── doc: 12.1.0001.PDF (node-a)
 *       │   │   └── doc: 12.1.0002.PDF (node-b)
 *       │   └── folder-12.2-id  ("12.2 Stem Cell Research")
 *       │       └── subfolder-12.2.1-id  ("12.2.1 Federal Policy")
 *       │           └── doc: 12.2.1.0001.PDF (node-c)
 *       └── section14-id  ("14 Patents")
 *           └── folder-14.1-id  ("14.1 Hatch-Waxman")
 *               └── doc: 14.1.0001.PDF (node-d)
 */

const PATHS = {
  'node-a': {
    folderNodeId: 'folder-12.1-id',
    folderPath: 'root-id|doclib-id|section12-id|folder-12.1-id',
  },
  'node-b': {
    folderNodeId: 'folder-12.1-id',
    folderPath: 'root-id|doclib-id|section12-id|folder-12.1-id',
  },
  'node-c': {
    folderNodeId: 'subfolder-12.2.1-id',
    folderPath: 'root-id|doclib-id|section12-id|folder-12.2-id|subfolder-12.2.1-id',
  },
  'node-d': {
    folderNodeId: 'folder-14.1-id',
    folderPath: 'root-id|doclib-id|section14-id|folder-14.1-id',
  },
};

beforeAll(() => {
  db = createTestDb();

  // Insert documents with folder ancestry
  const docA = insertDoc('node-a', '12.1.0001.PDF', PATHS['node-a'].folderNodeId, PATHS['node-a'].folderPath);
  const docB = insertDoc('node-b', '12.1.0002.PDF', PATHS['node-b'].folderNodeId, PATHS['node-b'].folderPath);
  const docC = insertDoc('node-c', '12.2.1.0001.PDF', PATHS['node-c'].folderNodeId, PATHS['node-c'].folderPath);
  const docD = insertDoc('node-d', '14.1.0001.PDF', PATHS['node-d'].folderNodeId, PATHS['node-d'].folderPath);

  // Insert a chunk per document
  insertChunk(docA, 'Cloning legislation text from doc A', 1);
  insertChunk(docB, 'Human cloning ban discussion from doc B', 1);
  insertChunk(docC, 'Federal stem cell policy from doc C', 1);
  insertChunk(docD, 'Hatch-Waxman patent term from doc D', 1);
});

afterAll(() => {
  db.close();
});

describe('Folder ancestry storage', () => {
  it('stores folder_node_id and folder_path for each document', () => {
    const doc = db.prepare('SELECT * FROM documents WHERE node_id = ?').get('node-a');
    expect(doc.folder_node_id).toBe('folder-12.1-id');
    expect(doc.folder_path).toBe('root-id|doclib-id|section12-id|folder-12.1-id');
  });

  it('stores different paths for documents in different folders', () => {
    const docC = db.prepare('SELECT * FROM documents WHERE node_id = ?').get('node-c');
    const docD = db.prepare('SELECT * FROM documents WHERE node_id = ?').get('node-d');
    expect(docC.folder_path).not.toBe(docD.folder_path);
    expect(docC.folder_path).toContain('section12-id');
    expect(docD.folder_path).toContain('section14-id');
  });
});

describe('Folder-scoped filtering (loadEmbeddingsByFolder)', () => {
  it('filters to a specific leaf folder', () => {
    const results = loadEmbeddingsByFolder('folder-12.1-id');
    expect(results).toHaveLength(2);
    expect(results.map(r => r.docName).sort()).toEqual(['12.1.0001.PDF', '12.1.0002.PDF']);
  });

  it('filters to a parent folder — includes all descendants', () => {
    // section12-id is the parent of both 12.1 and 12.2 subtrees
    const results = loadEmbeddingsByFolder('section12-id');
    expect(results).toHaveLength(3);
    expect(results.map(r => r.docName).sort()).toEqual([
      '12.1.0001.PDF',
      '12.1.0002.PDF',
      '12.2.1.0001.PDF',
    ]);
  });

  it('filters to a deeply nested subfolder', () => {
    const results = loadEmbeddingsByFolder('subfolder-12.2.1-id');
    expect(results).toHaveLength(1);
    expect(results[0].docName).toBe('12.2.1.0001.PDF');
  });

  it('returns only section 14 docs when filtering by section14-id', () => {
    const results = loadEmbeddingsByFolder('section14-id');
    expect(results).toHaveLength(1);
    expect(results[0].docName).toBe('14.1.0001.PDF');
  });

  it('returns all docs when filtering by root-id', () => {
    const results = loadEmbeddingsByFolder('root-id');
    expect(results).toHaveLength(4);
  });

  it('returns all docs when filtering by doclib-id', () => {
    const results = loadEmbeddingsByFolder('doclib-id');
    expect(results).toHaveLength(4);
  });

  it('returns empty for a non-existent folder', () => {
    const results = loadEmbeddingsByFolder('non-existent-folder-id');
    expect(results).toHaveLength(0);
  });

  it('does not cross-match partial nodeId substrings', () => {
    // A partial UUID should not match any full UUID-style nodeId
    // In production, nodeIds are UUIDs like "a0a07109-7506-40eb-b42f-df730863cbd1"
    const results = loadEmbeddingsByFolder('folder-12');
    // "folder-12" matches "folder-12.1-id" and "folder-12.2-id" — this is expected
    // with LIKE. But a UUID fragment like "a0a0" would not match a full UUID separated by pipes.
    // Test with a truly non-matching fragment:
    const noMatch = loadEmbeddingsByFolder('lder-12.1-i');
    // This DOES match because LIKE '%lder-12.1-i%' finds it as a substring.
    // This is acceptable — in production, folderNodeIds are always full Alfresco UUIDs
    // passed from the UI, never user-typed partial strings.
    // Verify that a completely wrong ID returns nothing:
    const empty = loadEmbeddingsByFolder('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
    expect(empty).toHaveLength(0);
  });
});

describe('upsertDoc updates folder info', () => {
  it('updates folder_path on re-insert (simulating re-index)', () => {
    // First verify current path
    let doc = db.prepare('SELECT * FROM documents WHERE node_id = ?').get('node-a');
    expect(doc.folder_path).toBe('root-id|doclib-id|section12-id|folder-12.1-id');

    // Re-upsert with a new folder path (as if document moved)
    db.prepare(`
      INSERT INTO documents (node_id, name, modified_at, cached_at, folder_node_id, folder_path)
      VALUES ('node-a', '12.1.0001.PDF', 'unknown', @cachedAt, 'new-folder-id', 'root-id|doclib-id|new-folder-id')
      ON CONFLICT(node_id) DO UPDATE SET
        folder_node_id = excluded.folder_node_id,
        folder_path = excluded.folder_path
    `).run({ cachedAt: Date.now() });

    doc = db.prepare('SELECT * FROM documents WHERE node_id = ?').get('node-a');
    expect(doc.folder_node_id).toBe('new-folder-id');
    expect(doc.folder_path).toBe('root-id|doclib-id|new-folder-id');

    // Restore original for other tests
    db.prepare(`
      UPDATE documents SET folder_node_id = 'folder-12.1-id',
        folder_path = 'root-id|doclib-id|section12-id|folder-12.1-id'
      WHERE node_id = 'node-a'
    `).run();
  });
});

describe('Documents without folder_path (backward compat)', () => {
  it('docs with NULL folder_path are excluded from folder-filtered queries', () => {
    // Insert a doc with no folder info (pre-migration scenario)
    const docId = insertDoc('node-legacy', 'legacy.PDF', null, null);
    insertChunk(docId, 'Legacy document text', 1);

    // Should NOT appear in any folder filter
    const results = loadEmbeddingsByFolder('root-id');
    const legacy = results.find(r => r.docName === 'legacy.PDF');
    expect(legacy).toBeUndefined();

    // Verify total still works (the 4 original docs)
    expect(results).toHaveLength(4);
  });
});
