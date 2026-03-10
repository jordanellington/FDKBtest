import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

/** Spawn python and stream pdfBuffer via stdin (avoids pipe deadlock with large inputs). */
function extractTextFromPdf(pdfBuffer, scriptPath, timeout = 300000) {
  return new Promise((resolve, reject) => {
    const proc = spawn('python3', [scriptPath], { timeout });
    const chunks = [];
    let stderr = '';

    proc.stdout.on('data', (d) => chunks.push(d));
    proc.stderr.on('data', (d) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(`python3 exited ${code}: ${stderr.slice(0, 200)}`));
      resolve(Buffer.concat(chunks).toString('utf-8'));
    });
    proc.on('error', reject);
    proc.stdin.write(pdfBuffer);
    proc.stdin.end();
  });
}
import { readFileSync, existsSync } from 'fs';
import { BedrockRuntimeClient, InvokeModelWithResponseStreamCommand } from '@aws-sdk/client-bedrock-runtime';
import { getOrBuildCache, retrieveChunks, isCached, isIndexed, retrieveAcrossDocs, getCorpusIndex, chunkDocument, embedChunks, saveToDB, loadCorpusIndex, getDocCount, migrateJsonToSqlite } from './rag.js';
import db from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── CCC enrichment data ─────────────────────────────────────────────────────
// Loaded from batch extraction results (keyed by Alfresco nodeId)
const cccDataPath = path.join(__dirname, '../data/ccc-pilot-results.json');
const cccMap = new Map();
if (existsSync(cccDataPath)) {
  try {
    const cccData = JSON.parse(readFileSync(cccDataPath, 'utf8'));
    for (const record of cccData) {
      if (record.nodeId) {
        // Errors default to Not Covered
        if (record.error) {
          record.cccDistroLevel = 'Not Covered';
          record.cccMatchedOn = 'Extraction failed — defaulting to most restrictive';
        }
        cccMap.set(record.nodeId, record);
      }
    }
    console.log(`[ccc] Loaded ${cccMap.size} CCC enrichment records`);
  } catch (err) {
    console.warn('[ccc] Failed to load CCC data:', err.message);
  }
}

function enrichWithCcc(entries) {
  if (!entries || !Array.isArray(entries) || cccMap.size === 0) return;
  let matched = 0;
  for (const entry of entries) {
    const node = entry.entry || entry;
    const record = cccMap.get(node.id);
    if (!record) continue;
    matched++;
    if (!node.properties) node.properties = {};
    node.properties['ccc:distroLevel'] = record.cccDistroLevel;
    node.properties['ccc:matchedOn'] = record.cccMatchedOn;
    node.properties['ccc:articleTitle'] = record.articleTitle || null;
    node.properties['ccc:publicationTitle'] = record.publicationTitle || null;
    node.properties['ccc:publisher'] = record.publisher || null;
    node.properties['ccc:issn'] = record.issn || null;
    node.properties['ccc:authors'] = record.authors || null;
    node.properties['ccc:publicationDate'] = record.publicationDate || null;
    node.properties['ccc:copyrightHolder'] = record.copyrightHolder || null;
    node.properties['ccc:confidence'] = record.confidence || null;
  }
  if (entries.length > 0) console.log(`[ccc] Enriched ${matched}/${entries.length} entries`);
}

const app = express();
const PORT = process.env.PORT || 3001;
const ALFRESCO_BASE = process.env.ALFRESCO_BASE_URL || 'https://secure.covi3.com';
const ALFRESCO_API = `${ALFRESCO_BASE}/alfresco/api/-default-/public`;
const SHARE_PROXY = `${ALFRESCO_BASE}/share/proxy/alfresco`;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Store sessions in memory (dev only)
const sessions = new Map();

// --------------- CAS SSO Login Helper ---------------

// Authenticates through CAS SSO and returns a JSESSIONID for Alfresco Share
async function casLogin(username, password) {
  const CAS_LOGIN = `${ALFRESCO_BASE.replace('secure.', 'secure-login.')}/cas/login`;
  const SERVICE_URL = `${ALFRESCO_BASE}/share/page/`;
  const casUrl = `${CAS_LOGIN}?service=${encodeURIComponent(SERVICE_URL)}`;

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  };

  // Step 1: GET the CAS login page — follow redirects to land on the final page
  const loginPageResp = await fetch(casUrl, { headers: browserHeaders });
  const loginPageHtml = await loginPageResp.text();

  // Collect all cookies from the response
  const setCookies = loginPageResp.headers.raw()['set-cookie'] || [];
  const cookieStr = setCookies.map(c => c.split(';')[0]).join('; ');
  console.log('[auth] CAS GET status:', loginPageResp.status, '| cookies:', setCookies.length, '| url:', loginPageResp.url);

  // Extract hidden form fields
  const executionMatch = loginPageHtml.match(/name="execution"\s+value="([^"]+)"/);
  if (!executionMatch) throw new Error('Could not parse CAS login page');
  const execution = executionMatch[1];

  // Step 2: POST credentials to CAS
  const formBody = `username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&execution=${encodeURIComponent(execution)}&_eventId=submit&geolocation=`;

  const casPostResp = await fetch(casUrl, {
    method: 'POST',
    headers: {
      ...browserHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Cookie': cookieStr,
      'Origin': 'https://secure-login.covi3.com',
      'Referer': casUrl,
    },
    body: formBody,
    redirect: 'manual',
  });

  const casRedirectUrl = casPostResp.headers.get('location');
  console.log('[auth] CAS POST status:', casPostResp.status, '| redirect:', casRedirectUrl?.substring(0, 150));

  if (!casRedirectUrl || !casRedirectUrl.includes('ticket=')) {
    const body = await casPostResp.text();
    const snippet = body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').substring(0, 400);
    console.log('[auth] CAS response snippet:', snippet);
    if (body.includes('credentials') || body.includes('nvalid') || body.includes('denied')) {
      throw new Error('INVALID_CREDENTIALS');
    }
    throw new Error('CAS did not redirect with ticket');
  }

  // Step 3: Follow redirect to Share (this sets the JSESSIONID + other cookies)
  const shareResp = await fetch(casRedirectUrl, { redirect: 'manual' });
  const shareCookies = shareResp.headers.raw()['set-cookie'] || [];
  let allCookies = shareCookies.map(c => c.split(';')[0]);
  console.log('[auth] Share redirect cookies:', allCookies);

  // Sometimes Share does another redirect — follow it to finalize the session
  if (shareResp.headers.get('location')) {
    const nextResp = await fetch(shareResp.headers.get('location'), {
      redirect: 'manual',
      headers: { 'Cookie': allCookies.join('; ') },
    });
    const nextCookies = nextResp.headers.raw()['set-cookie'] || [];
    const nextParsed = nextCookies.map(c => c.split(';')[0]);
    console.log('[auth] Share follow-up cookies:', nextParsed);
    // Merge: newer cookies override older ones with same name
    const cookieMap = new Map();
    for (const c of [...allCookies, ...nextParsed]) {
      const name = c.split('=')[0];
      cookieMap.set(name, c);
    }
    allCookies = [...cookieMap.values()];
  }

  // Extract JSESSIONID for backward compat
  let jsessionId = null;
  for (const c of allCookies) {
    const match = c.match(/JSESSIONID=([^;]+)/);
    if (match) { jsessionId = match[1]; break; }
  }
  if (!jsessionId) throw new Error('Failed to obtain JSESSIONID from Share');

  // Extract CSRF token for POST requests
  let csrfToken = null;
  for (const c of allCookies) {
    const match = c.match(/Alfresco-CSRFToken=(.+)/);
    if (match) { csrfToken = decodeURIComponent(match[1]); break; }
  }

  const cookieString = allCookies.join('; ');
  console.log('[auth] Full cookie string:', cookieString);
  console.log('[auth] CSRF token:', csrfToken ? 'found' : 'not found');
  return { jsessionId, cookieString, csrfToken };
}

// --------------- Auth ---------------

app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    // Authenticate through CAS SSO
    const { jsessionId, cookieString, csrfToken } = await casLogin(username, password);
    console.log('[auth] CAS login succeeded for', username);

    // Validate session and get profile
    const profileResp = await fetch(`${SHARE_PROXY}/api/people/${encodeURIComponent(username)}`, {
      headers: { 'Cookie': cookieString }
    });
    const profile = profileResp.ok ? await profileResp.json() : null;
    const resolvedUsername = profile?.userName || username;

    const sessionId = Buffer.from(`${resolvedUsername}:${Date.now()}`).toString('base64');
    sessions.set(sessionId, { jsessionId, cookieString, csrfToken, username: resolvedUsername });

    res.json({
      sessionId,
      user: {
        username: resolvedUsername,
        firstName: profile?.firstName || resolvedUsername,
        lastName: profile?.lastName || '',
        email: profile?.email || ''
      }
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    if (err.message === 'INVALID_CREDENTIALS') {
      return res.status(401).json({ error: 'Invalid username or password' });
    }
    res.status(401).json({ error: 'Authentication failed' });
  }
});

// Dev endpoint: login using a JSESSIONID grabbed from browser
app.post('/api/auth/dev-login', async (req, res) => {
  const { jsessionId } = req.body;
  if (!jsessionId) {
    return res.status(400).json({ error: 'jsessionId required' });
  }

  try {
    // Validate the session by fetching current user
    const resp = await fetch(`${SHARE_PROXY}/api/people/admin`, {
      headers: { 'Cookie': `JSESSIONID=${jsessionId}` }
    });
    if (!resp.ok) {
      return res.status(401).json({ error: 'Invalid or expired JSESSIONID' });
    }
    const profile = await resp.json();
    const sessionId = Buffer.from(`${profile.userName}:${Date.now()}`).toString('base64');
    sessions.set(sessionId, { jsessionId, username: profile.userName });

    res.json({
      sessionId,
      user: {
        username: profile.userName,
        firstName: profile.firstName || profile.userName,
        lastName: profile.lastName || '',
        email: profile.email || ''
      }
    });
  } catch (err) {
    console.error('Dev login error:', err);
    res.status(500).json({ error: 'Session validation failed' });
  }
});

app.get('/api/auth/heartbeat', requireAuth, async (req, res) => {
  try {
    await alfrescoGet(
      `${ALFRESCO_API}/alfresco/versions/1/nodes/${FDKB_DOCLIB_ID}`,
      req.session
    );
    res.json({ ok: true });
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    console.error('[heartbeat] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/logout', (req, res) => {
  const sessionId = req.headers['x-session-id'];
  sessions.delete(sessionId);
  res.json({ ok: true });
});

// --------------- Middleware ---------------

function requireAuth(req, res, next) {
  const sessionId = req.headers['x-session-id'] || req.query.sid;
  const session = sessions.get(sessionId);
  if (!session) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  req.session = session;
  req.sessionId = sessionId; // for cleanup on expiry
  next();
}

// Error handler: catch expired Alfresco sessions, clean up, return 401
function handleAlfrescoExpiry(err, req, res) {
  if (err.alfrescoExpired) {
    console.error('[auth] Alfresco session expired, clearing session:', req.sessionId);
    sessions.delete(req.sessionId);
    return res.status(401).json({ error: 'Session expired' });
  }
  return false;
}

// Unified fetch helper: uses ticket, JSESSIONID cookie, or basic auth depending on session
async function alfrescoFetch(url, session, options = {}) {
  const { ticket, jsessionId, cookieString, csrfToken, basicAuth } = session;

  if (ticket) {
    // Use alf_ticket param
    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${sep}alf_ticket=${encodeURIComponent(ticket)}`;
    return fetch(fullUrl, options);
  }

  if (jsessionId) {
    // Use Share proxy with JSESSIONID cookie
    // Share proxy path: /share/proxy/alfresco-api/-default-/public/...
    const SHARE_API_PROXY = `${ALFRESCO_BASE}/share/proxy/alfresco-api`;
    const shareUrl = url.replace(
      `${ALFRESCO_API}`,
      `${SHARE_API_PROXY}/-default-/public`
    );
    const headers = {
      ...options.headers,
      'Cookie': cookieString || `JSESSIONID=${jsessionId}`,
      ...(csrfToken ? { 'Alfresco-CSRFToken': csrfToken } : {}),
    };
    return fetch(shareUrl, { ...options, headers });
  }

  if (basicAuth) {
    const headers = {
      ...options.headers,
      'Authorization': `Basic ${basicAuth}`
    };
    return fetch(url, { ...options, headers });
  }

  throw new Error('No valid auth method in session');
}

// Check if Alfresco response indicates an expired session
function checkAlfrescoSession(resp, url) {
  if (resp.status === 401 || resp.status === 403) {
    const err = new Error('Alfresco session expired');
    err.alfrescoExpired = true;
    throw err;
  }
  const ct = resp.headers.get('content-type') || '';
  // API calls returning HTML means Alfresco redirected to login page
  // (skip content endpoints which legitimately return non-JSON)
  if (ct.includes('text/html') && !url.includes('/content')) {
    console.error('[alfresco] Got HTML instead of JSON — session expired. URL:', url.substring(0, 120));
    const err = new Error('Alfresco session expired');
    err.alfrescoExpired = true;
    throw err;
  }
}

async function alfrescoGet(url, session) {
  const resp = await alfrescoFetch(url, session);
  checkAlfrescoSession(resp, url);
  return resp;
}

async function alfrescoPost(url, session, body) {
  const resp = await alfrescoFetch(url, session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  checkAlfrescoSession(resp, url);
  return resp;
}

// --------------- Sites ---------------

const FDKB_SITE_ID = 'suZZiAUQ8bDifGvD';
const FDKB_DOCLIB_ID = '2205d84c-8da9-461a-9c7d-e121ca22856e';

app.get('/api/site', requireAuth, async (req, res) => {
  try {
    const resp = await alfrescoGet(
      `${ALFRESCO_API}/alfresco/versions/1/sites/${FDKB_SITE_ID}`,
      req.session
    );

    const data = await resp.json();
    res.json(data.entry);
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    res.status(500).json({ error: err.message });
  }
});

// --------------- Nodes / Browsing ---------------

app.get('/api/nodes/:nodeId/children', requireAuth, async (req, res) => {
  const { nodeId } = req.params;
  const resolvedId = nodeId === 'root' ? FDKB_DOCLIB_ID : nodeId;
  const { maxItems = 100, skipCount = 0, orderBy = 'name', foldersOnly } = req.query;

  let url = `${ALFRESCO_API}/alfresco/versions/1/nodes/${resolvedId}/children?maxItems=${maxItems}&skipCount=${skipCount}&orderBy=${orderBy}&include=properties,path`;
  if (foldersOnly === 'true') {
    url += `&where=(isFolder=true)`;
  }

  try {
    const resp = await alfrescoGet(url, req.session);

    const data = await resp.json();
    if (!resp.ok) {
      console.error('Children API error:', resp.status, JSON.stringify(data));
    }
    // Enrich with CCC metadata if available
    if (data.list?.entries) enrichWithCcc(data.list.entries);
    res.json(data);
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    console.error('Children error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/nodes/:nodeId', requireAuth, async (req, res) => {
  const { nodeId } = req.params;
  try {
    const resp = await alfrescoGet(
      `${ALFRESCO_API}/alfresco/versions/1/nodes/${nodeId}?include=properties,aspectNames,path`,
      req.session
    );

    const data = await resp.json();
    // Enrich single node with CCC metadata
    if (data.entry) enrichWithCcc([data]);
    res.json(data.entry);
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    res.status(500).json({ error: err.message });
  }
});

// --------------- Search ---------------

app.post('/api/search', requireAuth, async (req, res) => {
  const { query, maxItems = 25, skipCount = 0, exact = false, sort = 'relevance', ascending = false } = req.body;

  const SORT_MAP = {
    date: [{ type: 'FIELD', field: 'cm:modified', ascending }],
    size: [{ type: 'FIELD', field: 'content.size', ascending }],
  };

  try {
    // Exact phrase: wrap in double quotes per AFTS syntax
    // Non-exact: raw terms (Alfresco defaults to OR between words)
    const searchTerm = exact ? `"${query}"` : query;
    const aftsQuery = `SITE:${FDKB_SITE_ID} AND TYPE:"fdkb:document" AND (${searchTerm})`;
    console.log('[search] exact:', exact, '| sort:', sort, '| query:', aftsQuery);
    const resp = await alfrescoPost(
      `${ALFRESCO_API}/search/versions/1/search`,
      req.session,
      {
        query: {
          query: aftsQuery,
          language: 'afts'
        },
        paging: { maxItems, skipCount },
        include: ['properties', 'path'],
        ...(SORT_MAP[sort] ? { sort: SORT_MAP[sort] } : {}),
      }
    );

    const data = await resp.json();
    // Enrich search results with CCC metadata
    if (data.list?.entries) enrichWithCcc(data.list.entries);
    res.json(data);
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    console.error('[search] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// --------------- Document Content / Preview ---------------

app.get('/api/nodes/:nodeId/content', requireAuth, async (req, res) => {
  const { nodeId } = req.params;
  try {
    const resp = await alfrescoFetch(
      `${ALFRESCO_API}/alfresco/versions/1/nodes/${nodeId}/content`,
      req.session
    );

    // Content endpoint: check for 401/403 (HTML check skipped since content is binary)
    if (resp.status === 401 || resp.status === 403) {
      sessions.delete(req.sessionId);
      return res.status(401).json({ error: 'Session expired' });
    }

    const contentType = resp.headers.get('content-type');
    res.set('Content-Type', contentType);
    // Use inline disposition so PDFs render in iframes instead of downloading
    const disposition = req.query.download === 'true'
      ? resp.headers.get('content-disposition')
      : `inline`;
    res.set('Content-Disposition', disposition);
    const buffer = await resp.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    res.status(500).json({ error: err.message });
  }
});

// --------------- Stats ---------------

app.get('/api/stats', requireAuth, async (req, res) => {
  try {
    const resp = await alfrescoPost(
      `${ALFRESCO_API}/search/versions/1/search`,
      req.session,
      {
        query: {
          query: `SITE:${FDKB_SITE_ID} AND TYPE:content`,
          language: 'afts'
        },
        paging: { maxItems: 0 }
      }
    );

    const data = await resp.json();

    const foldersResp = await alfrescoGet(
      `${ALFRESCO_API}/alfresco/versions/1/nodes/${FDKB_DOCLIB_ID}/children?maxItems=1&where=(isFolder=true)`,
      req.session
    );
    const foldersData = await foldersResp.json();

    res.json({
      totalDocuments: data.list?.pagination?.totalItems ?? 0,
      practiceAreas: foldersData.list?.pagination?.totalItems ?? 0,
      yearRange: '1947 - Present'
    });
  } catch (err) {
    if (handleAlfrescoExpiry(err, req, res)) return;
    console.error('Stats error:', err);
    res.status(500).json({ error: err.message });
  }
});

// --------------- AI Chat (AWS Bedrock) ---------------

const bedrockClient = process.env.AWS_BEDROCK_ACCESS_KEY_ID
  ? new BedrockRuntimeClient({
      region: process.env.AWS_BEDROCK_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.AWS_BEDROCK_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_BEDROCK_SECRET_ACCESS_KEY,
      },
    })
  : null;

const BEDROCK_MODEL_ID = process.env.AWS_BEDROCK_MODEL_ID || 'us.anthropic.claude-haiku-4-5-20251001-v1:0';

const MODEL_MAP = {
  haiku: 'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  sonnet: 'us.anthropic.claude-sonnet-4-6-20250514-v1:0',
  opus: 'us.anthropic.claude-opus-4-6-20250514-v1:0',
};

function resolveModelId(model) {
  return MODEL_MAP[model] || BEDROCK_MODEL_ID;
}

// Load CCC results array for corpus index doc name lookups
const cccResults = existsSync(cccDataPath)
  ? JSON.parse(readFileSync(cccDataPath, 'utf8'))
  : [];

app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages, document: doc, model } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!bedrockClient) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI not configured — AWS Bedrock credentials missing' })}\n\n`);
    return res.end();
  }

  let extractedText = null;
  const pageCount = parseInt(doc?.pages, 10) || 0;
  const cachedAlready = doc?.id && isCached(doc.id, doc.modified || '');

  // Skip PDF fetch if RAG cache already has this document
  if (doc?.id && !cachedAlready) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Downloading document...' })}\n\n`);
      const pdfResp = await alfrescoFetch(
        `${ALFRESCO_API}/alfresco/versions/1/nodes/${doc.id}/content`,
        req.session
      );
      if (pdfResp.ok) {
        const buffer = Buffer.from(await pdfResp.arrayBuffer());
        console.log(`[chat] Fetched PDF for ${doc.name}: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

        const pageInfo = pageCount ? ` (${pageCount} pages)` : '';
        res.write(`data: ${JSON.stringify({ type: 'status', message: `Extracting text${pageInfo}...` })}\n\n`);
        const scriptPath = path.join(__dirname, '../scripts/extract_text.py');
        extractedText = await extractTextFromPdf(buffer, scriptPath);
        console.log(`[chat] Extracted ${extractedText.length} chars of text from ${doc.name}`);
      }
    } catch (err) {
      console.error('[chat] Failed to extract PDF text:', err.message);
    }
  }

  // Determine if we need RAG (large doc) or can send full text (small doc)
  const useRag = cachedAlready || (extractedText && (extractedText.length > 120_000 || pageCount > 40));
  let retrievedChunks = null;

  if (useRag) {
    try {
      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Building document index...' })}\n\n`);
      await getOrBuildCache(doc.id, doc.modified || '', extractedText, bedrockClient, doc.name);

      const latestQuestion = messages[messages.length - 1]?.content || '';
      res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching document...' })}\n\n`);
      retrievedChunks = await retrieveChunks(latestQuestion, doc.id, doc.modified || '', bedrockClient);
      console.log(`[chat] RAG: retrieved ${retrievedChunks.length} chunks for question`);
    } catch (err) {
      console.error('[chat] RAG error, falling back to truncated text:', err.message);
      // Fall back to truncated text if RAG fails
      extractedText = extractedText.slice(0, 120_000) + '\n\n[Document truncated due to size]';
    }
  }

  const metadataBlock = doc
    ? `Document metadata:\n- Author: ${doc.author || 'Unknown'}\n- Modified: ${doc.modified || 'Unknown'}\n- Pages: ${doc.pages || 'Unknown'}\n- Path: ${doc.path || 'Unknown'}`
    : '';

  let systemPrompt;
  if (!doc) {
    systemPrompt = 'You are a helpful legal document assistant for the FDKB (Food & Drug Knowledge Base).';
  } else if (retrievedChunks) {
    systemPrompt = `You are a helpful legal document assistant for Covington & Burling's Food & Drug Knowledge Base (FDKB). You are analyzing the document "${doc.name}".\n\n${metadataBlock}\n\nRelevant sections from the document have been retrieved and provided with each question. Base your answers on these sections. Reference page numbers and section headers when available. If the retrieved sections reference other sections not included, note this and tell the user which section to look up. Do not fabricate content not present in the provided sections.`;
  } else if (extractedText) {
    systemPrompt = `You are a helpful legal document assistant for Covington & Burling's Food & Drug Knowledge Base (FDKB). You are analyzing the document "${doc.name}".\n\n${metadataBlock}\n\nThe full document text has been extracted and provided. Provide concise, professional answers based on the document content. Reference specific sections, page numbers, or regulatory citations when relevant.`;
  } else {
    systemPrompt = `You are a helpful legal document assistant for Covington & Burling's Food & Drug Knowledge Base (FDKB). You are analyzing the document "${doc.name}".\n\n${metadataBlock}\n\nThe document content could not be extracted. Answer based on metadata only and let the user know.`;
  }

  try {
    // Build messages
    let bedrockMessages;
    if (retrievedChunks) {
      // RAG path: inject chunks into the latest user message only
      const latestMsg = messages[messages.length - 1];
      const chunkText = retrievedChunks.map((c, i) =>
        `[Section ${i + 1}${c.sectionHeader ? ': ' + c.sectionHeader : ''} (Page ${c.page})]\n${c.text}`
      ).join('\n\n---\n\n');

      bedrockMessages = [
        ...messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
        {
          role: 'user',
          content: `[Retrieved document sections]\n\n${chunkText}\n\n[User question]\n${latestMsg.content}`,
        },
      ];
    } else {
      // Full text path (small docs)
      bedrockMessages = messages.map((m, i) => {
        if (i === 0 && m.role === 'user' && extractedText) {
          return {
            role: 'user',
            content: `[Document content]\n${extractedText}\n\n[User question]\n${m.content}`,
          };
        }
        return { role: m.role, content: m.content };
      });
    }

    const selectedModel = resolveModelId(model);
    console.log(`[chat] Using model: ${selectedModel}`);

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: selectedModel,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: systemPrompt,
        messages: bedrockMessages,
      }),
    });

    const response = await bedrockClient.send(command);

    for await (const event of response.body) {
      if (event.chunk) {
        const parsed = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[chat] Bedrock error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// --------------- FDKB Cross-Document Chat ---------------

app.post('/api/chat/fdkb', requireAuth, async (req, res) => {
  const { messages, model, nodeIds, folder } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!bedrockClient) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'AI not configured — AWS Bedrock credentials missing' })}\n\n`);
    return res.end();
  }

  try {
    // Retrieve relevant chunks across all indexed documents
    const latestQuestion = messages[messages.length - 1]?.content || '';
    res.write(`data: ${JSON.stringify({ type: 'status', message: 'Searching knowledge base...' })}\n\n`);

    // Resolve folder name to nodeIds if provided (e.g., "12.1" filters to docs starting with "12.1.")
    let resolvedNodeIds = nodeIds || null;
    if (folder && !resolvedNodeIds) {
      resolvedNodeIds = cccResults
        .filter(d => !d.error && d.name.startsWith(folder))
        .map(d => d.nodeId);
    }

    const chunks = await retrieveAcrossDocs(latestQuestion, bedrockClient, cccResults, { nodeIds: resolvedNodeIds });

    // Build source documents list (deduplicated, ordered by best score)
    const sourcesMap = new Map();
    for (const chunk of chunks) {
      if (!sourcesMap.has(chunk.docId)) {
        const cccRecord = cccMap.get(chunk.docId);
        sourcesMap.set(chunk.docId, {
          nodeId: chunk.docId,
          name: chunk.docName,
          displayTitle: cccRecord?.articleTitle || chunk.docName,
          publicationTitle: cccRecord?.publicationTitle || null,
          publisher: cccRecord?.publisher || null,
          distroLevel: cccRecord?.cccDistroLevel || null,
          publicationDate: cccRecord?.publicationDate || null,
          page: chunk.page,
          score: chunk.score,
        });
      }
    }
    const sources = [...sourcesMap.values()];

    // Send sources event before streaming
    res.write(`data: ${JSON.stringify({ type: 'sources', documents: sources })}\n\n`);

    // Build context from retrieved chunks
    const chunkText = chunks.map((c, i) =>
      `[Source: ${c.docName}, p.${c.page}${c.sectionHeader ? ', ' + c.sectionHeader : ''}]\n${c.text}`
    ).join('\n\n---\n\n');

    const corpus = getCorpusIndex();
    const docCount = corpus?.docCount || 0;

    const systemPrompt = `You are a knowledgeable assistant for Covington & Burling's Food & Drug Knowledge Base (FDKB). You have access to a corpus of ${docCount} indexed documents covering FDA policy, biotech regulation, cloning legislation, and related topics.

Relevant sections from multiple documents have been retrieved based on the user's question. Base your answers on these sections.

CITATION RULES:
- Always cite your sources using the format [DocumentName, p.N] (e.g., [12.1.0003.PDF, p.2])
- When synthesizing across documents, cite each document that contributed to your answer
- If retrieved sections don't contain enough information to fully answer, say so
- Do not fabricate content not present in the provided sections`;

    const bedrockMessages = [
      ...messages.slice(0, -1).map(m => ({ role: m.role, content: m.content })),
      {
        role: 'user',
        content: `[Retrieved sections from ${sources.length} documents]\n\n${chunkText}\n\n[User question]\n${latestQuestion}`,
      },
    ];

    const selectedModel = resolveModelId(model);

    const command = new InvokeModelWithResponseStreamCommand({
      modelId: selectedModel,
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 4096,
        system: systemPrompt,
        messages: bedrockMessages,
      }),
    });

    const response = await bedrockClient.send(command);

    for await (const event of response.body) {
      if (event.chunk) {
        const parsed = JSON.parse(new TextDecoder().decode(event.chunk.bytes));
        if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: parsed.delta.text })}\n\n`);
        }
      }
    }

    res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
    res.end();
  } catch (err) {
    console.error('[fdkb-chat] Error:', err);
    res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
    res.end();
  }
});

// --------------- RAG Index Management ---------------

app.get('/api/rag/status', requireAuth, (req, res) => {
  try {
    const indexed = getDocCount();
    const totalDocs = cccResults.filter(d => !d.error).length;
    res.json({ indexed, total: totalDocs });
  } catch (err) {
    res.json({ indexed: 0, total: 0 });
  }
});

// Track build state so we don't run two at once
let buildInProgress = false;

app.post('/api/rag/build-index', requireAuth, async (req, res) => {
  if (buildInProgress) {
    return res.status(409).json({ error: 'Index build already in progress' });
  }
  if (!bedrockClient) {
    return res.status(500).json({ error: 'AWS Bedrock not configured' });
  }

  buildInProgress = true;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  // Clear existing cache if requested
  const { clearExisting } = req.body || {};
  if (clearExisting) {
    const prevCount = getDocCount();
    db.clearAll();
    send({ type: 'status', message: `Cleared ${prevCount} cached documents` });
  }

  const docs = cccResults.filter(d => !d.error);
  const session = req.session;
  const SHARE_API_PROXY = `${ALFRESCO_BASE}/share/proxy/alfresco-api/-default-/public`;

  let indexed = 0, skipped = 0, errors = 0;
  const BATCH_SIZE = 5;

  try {
    send({ type: 'status', message: `Starting index build for ${docs.length} documents...` });

    // Filter out already-indexed docs
    const toProcess = [];
    for (const doc of docs) {
      if (isIndexed(doc.nodeId)) {
        skipped++;
        continue;
      }
      toProcess.push(doc);
    }

    const scriptPath = path.join(__dirname, '../scripts/extract_text.py');

    // Process one doc at a time (CPU-bound text extraction on small instance)
    for (let i = 0; i < toProcess.length; i++) {
      const doc = toProcess[i];
      const current = skipped + indexed + errors + i + 1;

      send({ type: 'progress', current, total: docs.length, name: doc.name, indexed, skipped, errors });

      try {
        const pdfResp = await alfrescoFetch(
          `${SHARE_API_PROXY}/alfresco/versions/1/nodes/${doc.nodeId}/content`,
          session
        );
        if (!pdfResp.ok) throw new Error(`Fetch failed: ${pdfResp.status}`);
        const pdfBuffer = Buffer.from(await pdfResp.arrayBuffer());

        const text = await extractTextFromPdf(pdfBuffer, scriptPath);

        if (!text || text.trim().length < 50) {
          errors++;
          continue;
        }

        const chunks = chunkDocument(text);
        const embeddings = await embedChunks(chunks, bedrockClient);
        const modifiedAt = doc.publicationDate || 'unknown';
        saveToDB(doc.nodeId, doc.name, modifiedAt, { chunks, embeddings });
        indexed++;
      } catch (err) {
        console.error(`[rag-build] Error on ${doc.name}:`, err.message);
        errors++;
      }
    }

    // Reload corpus index with new data
    loadCorpusIndex();

    send({ type: 'complete', indexed, skipped, errors, total: docs.length });
    res.end();
  } catch (err) {
    console.error('[rag-build] Fatal error:', err);
    send({ type: 'error', message: err.message });
    res.end();
  } finally {
    buildInProgress = false;
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FDKB Navigator backend running on port ${PORT}`);

  // One-time migration: import old JSON cache files into SQLite if DB is empty
  migrateJsonToSqlite(cccResults);

  // Pre-load corpus index from SQLite
  loadCorpusIndex();
});
