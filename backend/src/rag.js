import { InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CACHE_DIR = path.join(__dirname, '../../data/rag-cache');

// Ensure cache directory exists
fs.mkdirSync(CACHE_DIR, { recursive: true });

const EMBED_MODEL = 'amazon.titan-embed-text-v2:0';
const EMBED_DIMENSIONS = 512;
const CHUNK_SIZE = 1500;
const CHUNK_OVERLAP = 300;
const CONCURRENCY = 10;
const DEFAULT_K = 5;
const BROAD_K = 10;
const CITATION_BOOST = 0.15;
const SIMILARITY_THRESHOLD = 0.05;

// In-memory cache: key = "nodeId:modifiedAt"
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
  // Split on page markers and section headers
  const pages = text.split(/\n--- Page \d+ ---\n/).filter(Boolean);

  let currentChunk = '';
  let currentHeader = '';
  let pageNum = 1;

  for (const page of pages) {
    const lines = page.split('\n');

    for (const line of lines) {
      // Detect section headers
      if (SECTION_PATTERN.test(line.trim()) && line.trim().length < 120) {
        // Flush current chunk if it has content
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

      // Check chunk size limit
      if (currentChunk.length >= CHUNK_SIZE) {
        chunks.push({
          text: currentChunk.trim(),
          sectionHeader: currentHeader,
          page: pageNum,
        });
        // Overlap: carry forward last portion with section header
        const overlapText = currentChunk.slice(-CHUNK_OVERLAP);
        currentChunk = currentHeader ? currentHeader + '\n' + overlapText : overlapText;
      }
    }
    pageNum++;
  }

  // Flush remaining
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
  // Titan Embed v2 max input is ~8K tokens; truncate if needed
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

/**
 * Get the disk cache file path for a document.
 */
export function getCachePath(docId) {
  return path.join(CACHE_DIR, `${docId.replace(/[^a-zA-Z0-9-]/g, '_')}.json`);
}

/**
 * Save cache entry to disk.
 */
export function saveToDisk(docId, modifiedAt, entry) {
  try {
    const data = {
      modifiedAt,
      cachedAt: entry.cachedAt,
      chunks: entry.chunks,
      embeddings: entry.embeddings.map(e => Array.from(e)),
    };
    fs.writeFileSync(getCachePath(docId), JSON.stringify(data));
    console.log(`[rag] Saved cache to disk for ${docId}`);
  } catch (err) {
    console.error('[rag] Failed to save cache to disk:', err.message);
  }
}

/**
 * Load cache entry from disk if it exists and modifiedAt matches.
 */
function loadFromDisk(docId, modifiedAt) {
  try {
    const filePath = getCachePath(docId);
    if (!fs.existsSync(filePath)) return null;

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    if (data.modifiedAt !== modifiedAt) {
      console.log(`[rag] Disk cache stale for ${docId} (${data.modifiedAt} != ${modifiedAt})`);
      return null;
    }

    const entry = {
      chunks: data.chunks,
      embeddings: data.embeddings.map(e => new Float32Array(e)),
      cachedAt: data.cachedAt,
    };
    console.log(`[rag] Loaded cache from disk for ${docId} (${entry.chunks.length} chunks)`);
    return entry;
  } catch (err) {
    console.error('[rag] Failed to load cache from disk:', err.message);
    return null;
  }
}

/**
 * Check if a document is already cached (memory or disk).
 */
export function isCached(docId, modifiedAt) {
  const cacheKey = `${docId}:${modifiedAt}`;
  if (embedCache.has(cacheKey)) return true;

  // Check disk
  const diskEntry = loadFromDisk(docId, modifiedAt);
  if (diskEntry) {
    embedCache.set(cacheKey, diskEntry);
    return true;
  }
  return false;
}

/**
 * Get or build the embedding cache for a document.
 */
export async function getOrBuildCache(docId, modifiedAt, text, bedrockClient) {
  const cacheKey = `${docId}:${modifiedAt}`;

  if (embedCache.has(cacheKey)) {
    console.log(`[rag] Cache hit for ${cacheKey}`);
    return embedCache.get(cacheKey);
  }

  console.log(`[rag] Cache miss — building index for ${cacheKey}`);
  const chunks = chunkDocument(text);
  console.log(`[rag] Created ${chunks.length} chunks`);

  const embeddings = await embedChunks(chunks, bedrockClient);
  console.log(`[rag] Embedded ${embeddings.length} chunks`);

  const entry = { chunks, embeddings, cachedAt: Date.now() };
  embedCache.set(cacheKey, entry);
  saveToDisk(docId, modifiedAt, entry);

  // LRU eviction: keep max 50 entries
  if (embedCache.size > 50) {
    const oldest = embedCache.keys().next().value;
    embedCache.delete(oldest);
  }

  return entry;
}

/**
 * Retrieve the most relevant chunks for a question.
 */
export async function retrieveChunks(question, docId, modifiedAt, bedrockClient) {
  const cached = embedCache.get(`${docId}:${modifiedAt}`);
  if (!cached) throw new Error('Document not indexed');

  const { chunks, embeddings } = cached;

  // Embed the question
  const questionVec = await embedSingle(question, bedrockClient);

  // Determine k based on question type
  const k = BROAD_KEYWORDS.test(question) ? BROAD_K : DEFAULT_K;

  // Extract citations from the question for boosting
  const questionCitations = question.match(CITATION_PATTERN) || [];

  // Score all chunks
  const scored = chunks.map((chunk, i) => {
    let score = dotProduct(questionVec, embeddings[i]);

    // Citation boost: if question mentions a specific citation and chunk contains it
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

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top k, filtering by similarity threshold
  const topK = scored.slice(0, k).filter(s => s.score >= SIMILARITY_THRESHOLD);

  // Sort selected chunks by document order for coherent reading
  topK.sort((a, b) => a.index - b.index);

  console.log(`[rag] Retrieved ${topK.length} chunks (k=${k}, top score=${scored[0]?.score.toFixed(3)})`);

  return topK.map(s => ({
    text: s.chunk.text,
    page: s.chunk.page,
    sectionHeader: s.chunk.sectionHeader,
    score: s.score,
  }));
}

// ── Cross-document corpus index ─────────────────────────────────────────────

// Flat index of all chunks across all cached documents
let corpusIndex = null; // { entries: [{text, page, sectionHeader, embedding, docId, docName}], docCount }

/**
 * Load all cached embeddings from disk into a flat corpus index.
 * Called once on first FDKB chat request.
 */
export function loadCorpusIndex(cccResults) {
  const cacheFiles = fs.readdirSync(CACHE_DIR).filter(f => f.endsWith('.json'));
  const entries = [];
  const docNames = new Map(); // docId → name

  // Build docId → name/metadata lookup from CCC results
  if (cccResults) {
    for (const doc of cccResults) {
      if (!doc.error) {
        docNames.set(doc.nodeId, doc.name);
      }
    }
  }

  for (const file of cacheFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(CACHE_DIR, file), 'utf-8'));
      // Extract docId from filename (reverse of getCachePath sanitization)
      const docId = file.replace('.json', '').replace(/_/g, '-');
      const docName = docNames.get(docId) || file.replace('.json', '');

      if (!data.chunks || !data.embeddings) continue;

      for (let i = 0; i < data.chunks.length; i++) {
        entries.push({
          text: data.chunks[i].text,
          page: data.chunks[i].page,
          sectionHeader: data.chunks[i].sectionHeader,
          embedding: new Float32Array(data.embeddings[i]),
          docId,
          docName,
        });
      }
    } catch (err) {
      console.error(`[rag] Failed to load corpus file ${file}:`, err.message);
    }
  }

  corpusIndex = { entries, docCount: cacheFiles.length };
  console.log(`[rag] Corpus index loaded: ${entries.length} chunks from ${cacheFiles.length} documents`);
  return corpusIndex;
}

/**
 * Get the corpus index, loading it if needed.
 */
export function getCorpusIndex(cccResults) {
  if (!corpusIndex) {
    loadCorpusIndex(cccResults);
  }
  return corpusIndex;
}

const CROSS_DOC_K = 10;

/**
 * Retrieve the most relevant chunks across all indexed documents.
 * @param {string[]} [nodeIds] - Optional list of nodeIds to restrict search to. If omitted, searches all.
 */
export async function retrieveAcrossDocs(question, bedrockClient, cccResults, { nodeIds } = {}) {
  const corpus = getCorpusIndex(cccResults);
  if (!corpus || corpus.entries.length === 0) {
    throw new Error('No documents indexed. Run build-rag-index.js first.');
  }

  // Filter corpus entries if nodeIds provided
  const searchEntries = nodeIds
    ? corpus.entries.filter(e => nodeIds.includes(e.docId))
    : corpus.entries;

  if (searchEntries.length === 0) {
    throw new Error('No matching documents found in index for the given filter.');
  }

  const questionVec = await embedSingle(question, bedrockClient);
  const k = BROAD_KEYWORDS.test(question) ? CROSS_DOC_K * 2 : CROSS_DOC_K;

  // Score filtered chunks
  const scored = searchEntries.map((entry, i) => ({
    entry,
    score: dotProduct(questionVec, entry.embedding),
    index: i,
  }));

  scored.sort((a, b) => b.score - a.score);

  const topK = scored.slice(0, k).filter(s => s.score >= SIMILARITY_THRESHOLD);

  // Deduplicate: if multiple chunks from the same doc, keep the best ones
  const byDoc = new Map();
  for (const s of topK) {
    const key = s.entry.docId;
    if (!byDoc.has(key)) byDoc.set(key, []);
    byDoc.get(key).push(s);
  }

  console.log(`[rag] Cross-doc retrieval: ${topK.length} chunks from ${byDoc.size} documents (top score=${scored[0]?.score.toFixed(3)})`);

  return topK.map(s => ({
    text: s.entry.text,
    page: s.entry.page,
    sectionHeader: s.entry.sectionHeader,
    score: s.score,
    docId: s.entry.docId,
    docName: s.entry.docName,
  }));
}
