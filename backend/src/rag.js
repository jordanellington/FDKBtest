import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBED_DIMENSIONS = 512;
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 300;
const CONCURRENCY = 10;
const DEFAULT_K = 5;
const BROAD_K = 10;
const CITATION_BOOST = 0.15;
const SIMILARITY_THRESHOLD = 0.05;

// In-memory cache for single-doc chat: key = "nodeId:modifiedAt"
const embedCache = new Map();

// Section header patterns for legal documents
const SECTION_PATTERN = /^(?:(?:SECTION|Section|PART|Part|CHAPTER|Chapter|ARTICLE|Article)\s+[\dIVXivx]+|(?:§\s*\d+)|(?:\d+\.\d+)|(?:[A-Z][A-Z\s]{5,})$|(?:[IVXLCDM]+\.\s)|(?:[A-Z]\.\s+[A-Z]))/m;

const BROAD_KEYWORDS = /\b(all|every|list|summarize|summary|overview|entire|whole|throughout|complete)\b/i;

const CITATION_PATTERN = /(?:§\s*\d+[\d.]*|\d+\s*CFR\s*[\d.]+|\d+\s*U\.S\.C\.\s*§?\s*\d+|Section\s+\d+[\d.()a-z]*)/gi;

/**
 * Split text into chunks on section boundaries first, then by character limit.
 */
export function chunkDocument(text) {
  const chunks = [];
  const pages = text.split(/\n--- Page \d+ ---\n/).filter(Boolean);

  let currentChunk = '';
  let currentHeader = '';
  let pageNum = 1;

  for (const page of pages) {
    const lines = page.split('\n');

    for (const line of lines) {
      if (SECTION_PATTERN.test(line.trim()) && line.trim().length < 120) {
        if (currentChunk.trim().length > 200) {
          chunks.push({
            text: currentChunk.trim(),
            sectionHeader: currentHeader,
            page: pageNum,
          });
        }
        currentHeader = line.trim();
        currentChunk = currentHeader + '\n';
        continue;
      }

      currentChunk += line + '\n';

      if (currentChunk.length >= CHUNK_SIZE) {
        chunks.push({
          text: currentChunk.trim(),
          sectionHeader: currentHeader,
          page: pageNum,
        });
        const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
        currentChunk = currentHeader ? currentHeader + '\n' + overlapText : overlapText;
      }
    }
    pageNum++;
  }

  if (currentChunk.trim().length > 50) {
    chunks.push({
      text: currentChunk.trim(),
      sectionHeader: currentHeader,
      page: pageNum,
    });
  }

  return chunks;
}

/**
 * Embed a single text using Titan Embed v2.
 */
export async function embedSingle(text, bedrockClient) {
  const truncated = text.length > 30000 ? text.slice(0, 30000) : text;

  const response = await bedrockClient.send(new InvokeModelCommand({
    modelId: EMBED_MODEL,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify({
      inputText: truncated,
      dimensions: EMBED_DIMENSIONS,
      normalize: true,
    }),
  }));

  const result = JSON.parse(new TextDecoder().decode(response.body));
  return new Float32Array(result.embedding);
}

/**
 * Embed multiple chunks with concurrency pool.
 */
export async function embedChunks(chunks, bedrockClient) {
  const results = new Array(chunks.length);

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map((chunk, j) =>
        embedSingle(chunk.text, bedrockClient).then(vec => ({ idx: i + j, vec }))
      )
    );
    for (const { idx, vec } of batchResults) {
      results[idx] = vec;
    }
  }

  return results;
}

/**
 * Dot product (vectors are pre-normalized, so this equals cosine similarity).
 */
export function dotProduct(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

// ── SQLite-backed persistence ───────────────────────────────────────────────

/**
 * Save document chunks and embeddings to SQLite.
 */
export function saveToDB(nodeId, name, modifiedAt, entry) {
  const docId = db.upsertDoc(nodeId, name, modifiedAt);
  db.insertChunks(docId, entry.chunks, entry.embeddings);
}

/**
 * Check if a document is already cached (memory or SQLite).
 */
export function isCached(docId, modifiedAt) {
  const cacheKey = `${docId}:${modifiedAt}`;
  if (embedCache.has(cacheKey)) return true;

  const doc = db.getDoc(docId);
  if (doc) {
    // Load from SQLite into memory cache
    const rows = db.getDocChunks(doc.id);
    if (rows.length > 0) {
      const chunks = rows.map(r => ({ text: r.text, page: r.page, sectionHeader: r.section_header }));
      const embeddings = rows.map(r => new Float32Array(r.embedding.buffer, r.embedding.byteOffset, r.embedding.byteLength / 4));
      embedCache.set(cacheKey, { chunks, embeddings, cachedAt: doc.cached_at });
      return true;
    }
  }
  return false;
}

/**
 * Check if a document exists in SQLite (by nodeId only, ignoring modifiedAt).
 */
export function isIndexed(nodeId) {
  const doc = db.getDoc(nodeId);
  return doc !== null;
}

/**
 * Get or build the embedding cache for a document.
 */
export async function getOrBuildCache(docId, modifiedAt, text, bedrockClient, docName) {
  const cacheKey = `${docId}:${modifiedAt}`;

  if (embedCache.has(cacheKey)) {
    return embedCache.get(cacheKey);
  }

  const chunks = chunkDocument(text);
  const embeddings = await embedChunks(chunks, bedrockClient);

  const entry = { chunks, embeddings, cachedAt: Date.now() };
  embedCache.set(cacheKey, entry);
  saveToDB(docId, docName || docId, modifiedAt, entry);

  // LRU eviction: keep max 50 entries in memory
  if (embedCache.size > 50) {
    const oldest = embedCache.keys().next().value;
    embedCache.delete(oldest);
  }

  return entry;
}

/**
 * Retrieve the most relevant chunks for a question (single document).
 */
export async function retrieveChunks(question, docId, modifiedAt, bedrockClient) {
  const cached = embedCache.get(`${docId}:${modifiedAt}`);
  if (!cached) throw new Error('Document not indexed');

  const { chunks, embeddings } = cached;
  const questionVec = await embedSingle(question, bedrockClient);
  const k = BROAD_KEYWORDS.test(question) ? BROAD_K : DEFAULT_K;
  const questionCitations = question.match(CITATION_PATTERN) || [];

  const scored = chunks.map((chunk, i) => {
    let score = dotProduct(questionVec, embeddings[i]);
    if (questionCitations.length > 0) {
      for (const cite of questionCitations) {
        if (chunk.text.includes(cite)) {
          score += CITATION_BOOST;
          break;
        }
      }
    }
    return { chunk, score, index: i };
  });

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, k).filter(s => s.score >= SIMILARITY_THRESHOLD);
  topK.sort((a, b) => a.index - b.index);

  return topK.map(s => ({
    text: s.chunk.text,
    page: s.chunk.page,
    sectionHeader: s.chunk.sectionHeader,
    score: s.score,
  }));
}

// ── Cross-document corpus index ─────────────────────────────────────────────

let corpusIndex = null;

/**
 * Load all embeddings from SQLite into the in-memory corpus index.
 */
export function loadCorpusIndex() {
  const entries = db.loadAllEmbeddings();
  const docCount = db.getDocCount();
  corpusIndex = { entries, docCount };
  console.log(`[rag] Corpus index loaded: ${entries.length} chunks from ${docCount} documents`);
  return corpusIndex;
}

/**
 * Get the corpus index, loading from SQLite if needed.
 */
export function getCorpusIndex() {
  if (!corpusIndex) {
    loadCorpusIndex();
  }
  return corpusIndex;
}

/**
 * Get the document count from SQLite (always accurate, no in-memory dependency).
 */
export function getDocCount() {
  return db.getDocCount();
}

const CROSS_DOC_K = 10;

/**
 * Retrieve the most relevant chunks across all indexed documents.
 */
export async function retrieveAcrossDocs(question, bedrockClient, cccResults, { nodeIds } = {}) {
  const corpus = getCorpusIndex();
  if (!corpus || corpus.entries.length === 0) {
    throw new Error('No documents indexed. Use the Build Index button first.');
  }

  const searchEntries = nodeIds
    ? corpus.entries.filter(e => nodeIds.includes(e.docId))
    : corpus.entries;

  if (searchEntries.length === 0) {
    throw new Error('No matching documents found in index for the given filter.');
  }

  const questionVec = await embedSingle(question, bedrockClient);
  const k = BROAD_KEYWORDS.test(question) ? CROSS_DOC_K * 2 : CROSS_DOC_K;

  const scored = searchEntries.map((entry, i) => ({
    entry,
    score: dotProduct(questionVec, entry.embedding),
    index: i,
  }));

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, k).filter(s => s.score >= SIMILARITY_THRESHOLD);

  return topK.map(s => ({
    text: s.entry.text,
    page: s.entry.page,
    sectionHeader: s.entry.sectionHeader,
    score: s.score,
    docId: s.entry.docId,
    docName: s.entry.docName,
  }));
}

// ── JSON-to-SQLite migration ────────────────────────────────────────────────

const OLD_CACHE_DIR = path.join(__dirname, '../data/rag-cache');

/**
 * One-time migration: import old JSON cache files into SQLite.
 * Called on startup if SQLite is empty but JSON files exist.
 */
export function migrateJsonToSqlite(cccResults) {
  if (db.getDocCount() > 0) return; // Already migrated

  if (!fs.existsSync(OLD_CACHE_DIR)) return;
  const cacheFiles = fs.readdirSync(OLD_CACHE_DIR).filter(f => f.endsWith('.json'));
  if (cacheFiles.length === 0) return;

  const docNames = new Map();
  if (cccResults) {
    for (const doc of cccResults) {
      if (!doc.error) docNames.set(doc.nodeId, doc.name);
    }
  }

  let migrated = 0;
  for (const file of cacheFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(OLD_CACHE_DIR, file), 'utf-8'));
      const docId = file.replace('.json', '').replace(/_/g, '-');
      const docName = docNames.get(docId) || file.replace('.json', '');

      if (!data.chunks || !data.embeddings) continue;

      const embeddings = data.embeddings.map(e => new Float32Array(e));
      saveToDB(docId, docName, data.modifiedAt || 'unknown', {
        chunks: data.chunks,
        embeddings,
        cachedAt: data.cachedAt || Date.now(),
      });
      migrated++;
    } catch (err) {
      console.error(`[rag] Migration failed for ${file}:`, err.message);
    }
  }

  console.log(`[rag] Migrated ${migrated}/${cacheFiles.length} JSON cache files to SQLite`);
}
