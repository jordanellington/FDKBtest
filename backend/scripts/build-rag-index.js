#!/usr/bin/env node
/**
 * Batch RAG Index Builder
 *
 * Fetches all 351 PDFs from Alfresco section 12.1, extracts text via pymupdf4llm,
 * chunks and embeds with Titan Embed v2, saves to data/rag-cache/.
 * Resume-capable: skips documents that already have a valid cache file.
 *
 * Usage:
 *   ALFRESCO_COOKIE="JSESSIONID=...; ..." node scripts/build-rag-index.js
 *
 * Or inside Docker:
 *   docker compose exec backend sh -c 'ALFRESCO_COOKIE="..." node scripts/build-rag-index.js'
 */

import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);
import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { chunkDocument, embedChunks, getCachePath, saveToDisk } from '../src/rag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env from project root
const envPath = join(__dirname, '../../.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^\s*([^#=]+?)\s*=\s*(.*?)\s*$/);
    if (match && !process.env[match[1]]) {
      process.env[match[1]] = match[2];
    }
  }
} catch { /* .env not found */ }

// ── Config ──────────────────────────────────────────────────────────────────

const ALFRESCO_API = 'https://secure.covi3.com/share/proxy/alfresco-api/-default-/public';
const DOC_CONCURRENCY = 5;

const ALFRESCO_COOKIE = process.env.ALFRESCO_COOKIE;
if (!ALFRESCO_COOKIE) {
  console.error('ERROR: Set ALFRESCO_COOKIE env var with your active session cookie.');
  console.error('Example: ALFRESCO_COOKIE="JSESSIONID=ABC123" node scripts/build-rag-index.js');
  process.exit(1);
}

const bedrock = new BedrockRuntimeClient({
  region: process.env.AWS_BEDROCK_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
  },
});

// ── Load document list ──────────────────────────────────────────────────────

const resultsPath = join(__dirname, '../data/ccc-pilot-results.json');
const allDocs = JSON.parse(readFileSync(resultsPath, 'utf8'));
// Filter out docs that had errors during CCC extraction
const docs = allDocs.filter(d => !d.error);

// ── Alfresco PDF fetch ──────────────────────────────────────────────────────

async function fetchPdf(nodeId) {
  const url = `${ALFRESCO_API}/alfresco/versions/1/nodes/${nodeId}/content`;
  const resp = await fetch(url, {
    headers: { 'Cookie': ALFRESCO_COOKIE },
  });
  if (!resp.ok) throw new Error(`Fetch failed: ${resp.status}`);
  return Buffer.from(await resp.arrayBuffer());
}

// ── Text extraction via pymupdf4llm ─────────────────────────────────────────

async function extractText(pdfBuffer) {
  const { stdout } = await execFileAsync('python3', ['scripts/extract_text.py'], {
    input: pdfBuffer,
    maxBuffer: 50 * 1024 * 1024, // 50MB
    timeout: 60000,
    encoding: 'utf-8',
  });
  return stdout;
}

// ── Check if doc is already cached ──────────────────────────────────────────

function isAlreadyCached(nodeId) {
  const cachePath = getCachePath(nodeId);
  if (!existsSync(cachePath)) return false;
  try {
    const data = JSON.parse(readFileSync(cachePath, 'utf8'));
    return data.chunks && data.chunks.length > 0 && data.embeddings && data.embeddings.length > 0;
  } catch {
    return false;
  }
}

// ── Process a single document ───────────────────────────────────────────────

async function processDoc(doc, idx, total) {
  const label = `[${idx}/${total}] ${doc.name}`;

  if (isAlreadyCached(doc.nodeId)) {
    console.log(`${label} — cached, skipping`);
    return { status: 'skipped' };
  }

  try {
    // 1. Fetch PDF
    process.stdout.write(`${label} — fetching... `);
    const pdfBuffer = await fetchPdf(doc.nodeId);
    process.stdout.write(`${(pdfBuffer.byteLength / 1024).toFixed(0)}KB... `);

    // 2. Extract text
    process.stdout.write('extracting... ');
    const text = await extractText(pdfBuffer);
    if (!text || text.trim().length < 50) {
      console.log('no text extracted');
      return { status: 'empty' };
    }
    process.stdout.write(`${text.length} chars... `);

    // 3. Chunk
    const chunks = chunkDocument(text);
    process.stdout.write(`${chunks.length} chunks... `);

    // 4. Embed
    process.stdout.write('embedding... ');
    const embeddings = await embedChunks(chunks, bedrock);

    // 5. Save to disk cache
    const modifiedAt = doc.publicationDate || 'unknown';
    const entry = { chunks, embeddings, cachedAt: Date.now() };
    saveToDisk(doc.nodeId, modifiedAt, entry);

    console.log('done');
    return { status: 'ok', chunks: chunks.length };
  } catch (err) {
    console.log(`error: ${err.message}`);
    return { status: 'error', error: err.message };
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log(`║  RAG Index Builder — ${docs.length} documents${' '.repeat(Math.max(0, 26 - String(docs.length).length))}║`);
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const stats = { ok: 0, skipped: 0, empty: 0, error: 0, totalChunks: 0 };
  const errors = [];
  const startTime = Date.now();

  // Process in batches of DOC_CONCURRENCY
  for (let i = 0; i < docs.length; i += DOC_CONCURRENCY) {
    const batch = docs.slice(i, i + DOC_CONCURRENCY);
    const results = await Promise.all(
      batch.map((doc, j) => processDoc(doc, i + j + 1, docs.length))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      stats[r.status]++;
      if (r.status === 'ok') stats.totalChunks += r.chunks;
      if (r.status === 'error') errors.push({ name: batch[j].name, error: r.error });
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);

  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('RESULTS\n');
  console.log(`  Indexed:  ${stats.ok} (${stats.totalChunks} total chunks)`);
  console.log(`  Skipped:  ${stats.skipped} (already cached)`);
  console.log(`  Empty:    ${stats.empty} (no text extracted)`);
  console.log(`  Errors:   ${stats.error}`);
  console.log(`  Time:     ${elapsed}s`);

  if (errors.length > 0) {
    console.log('\nFailed documents:');
    for (const e of errors) {
      console.log(`  - ${e.name}: ${e.error}`);
    }
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
