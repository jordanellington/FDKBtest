import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import Anthropic from '@anthropic-ai/sdk';

const app = express();
const PORT = process.env.PORT || 3001;
const ALFRESCO_BASE = process.env.ALFRESCO_BASE_URL || 'https://secure.covi3.com';
const ALFRESCO_API = `${ALFRESCO_BASE}/alfresco/api/-default-/public`;
const SHARE_PROXY = `${ALFRESCO_BASE}/share/proxy/alfresco`;

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Store sessions in memory (dev only)
const sessions = new Map();

// --------------- Auth ---------------

// Login: accepts JSESSIONID cookie from covi3.com for CAS SSO passthrough
app.post('/api/auth/login', async (req, res) => {
  const { username, password, jsessionId } = req.body;

  // Strategy 1: JSESSIONID cookie forwarding (CAS SSO)
  if (jsessionId) {
    try {
      const profileResp = await fetch(`${SHARE_PROXY}/api/people/${encodeURIComponent(username || 'admin')}`, {
        headers: { 'Cookie': `JSESSIONID=${jsessionId}` }
      });
      if (!profileResp.ok) {
        return res.status(401).json({ error: 'Invalid session' });
      }
      const profile = await profileResp.json();
      const sessionId = Buffer.from(`${profile.userName}:${Date.now()}`).toString('base64');
      sessions.set(sessionId, { jsessionId, username: profile.userName });

      return res.json({
        sessionId,
        user: {
          username: profile.userName,
          firstName: profile.firstName || profile.userName,
          lastName: profile.lastName || '',
          email: profile.email || ''
        }
      });
    } catch (err) {
      console.error('JSESSIONID login error:', err);
      return res.status(500).json({ error: 'Session validation failed' });
    }
  }

  // Strategy 2: Direct ticket API (works when CAS is not enforced)
  try {
    const resp = await fetch(`${ALFRESCO_API}/authentication/versions/1/tickets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: username, password })
    });

    if (!resp.ok) {
      const text = await resp.text();
      console.error('Alfresco ticket auth failed:', resp.status, text);
      // Fall back: try Share proxy with Basic auth
      const basicAuth = Buffer.from(`${username}:${password}`).toString('base64');
      const shareResp = await fetch(`${SHARE_PROXY}/api/people/${encodeURIComponent(username)}`, {
        headers: { 'Authorization': `Basic ${basicAuth}` }
      });
      if (!shareResp.ok) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const profile = await shareResp.json();
      const sessionId = Buffer.from(`${username}:${Date.now()}`).toString('base64');
      // Store with basic auth for subsequent calls
      sessions.set(sessionId, { basicAuth, username });
      return res.json({
        sessionId,
        user: {
          username,
          firstName: profile.firstName || username,
          lastName: profile.lastName || '',
          email: profile.email || ''
        }
      });
    }

    const data = await resp.json();
    const ticket = data.entry.id;
    const sessionId = Buffer.from(`${username}:${Date.now()}`).toString('base64');
    sessions.set(sessionId, { ticket, username });

    const profileResp = await fetch(
      `${ALFRESCO_API}/alfresco/versions/1/people/${encodeURIComponent(username)}?alf_ticket=${encodeURIComponent(ticket)}`
    );
    const profile = profileResp.ok ? await profileResp.json() : null;

    res.json({
      sessionId,
      user: {
        username,
        firstName: profile?.entry?.firstName || username,
        lastName: profile?.entry?.lastName || '',
        email: profile?.entry?.email || ''
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Authentication failed' });
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
  next();
}

// Unified fetch helper: uses ticket, JSESSIONID cookie, or basic auth depending on session
async function alfrescoFetch(url, session, options = {}) {
  const { ticket, jsessionId, basicAuth } = session;

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
      'Cookie': `JSESSIONID=${jsessionId}`
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

async function alfrescoGet(url, session) {
  return alfrescoFetch(url, session);
}

async function alfrescoPost(url, session, body) {
  return alfrescoFetch(url, session, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
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
    res.json(data);
  } catch (err) {
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
    res.json(data.entry);
  } catch (err) {
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
    res.json(data);
  } catch (err) {
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
      totalDocuments: data.list?.pagination?.totalItems || 368261,
      practiceAreas: foldersData.list?.pagination?.totalItems || 22,
      yearRange: '1947 - Present'
    });
  } catch (err) {
    console.error('Stats error:', err);
    res.json({
      totalDocuments: 368261,
      practiceAreas: 22,
      yearRange: '1947 - Present'
    });
  }
});

// --------------- AI Chat ---------------

const anthropic = process.env.ANTHROPIC_API_KEY
  ? new Anthropic()
  : null;

app.post('/api/chat', requireAuth, async (req, res) => {
  const { messages, document: doc } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // If real API key is configured, use Claude
  if (anthropic) {
    const systemPrompt = doc
      ? `You are a helpful legal document assistant for Covington & Burling's Food & Drug Knowledge Base (FDKB). You are analyzing the document "${doc.name}".\n\nDocument metadata:\n- Author: ${doc.author || 'Unknown'}\n- Modified: ${doc.modified || 'Unknown'}\n- Pages: ${doc.pages || 'Unknown'}\n- Path: ${doc.path || 'Unknown'}\n\nProvide concise, professional answers. If you don't have enough information from the document metadata to answer a question, say so clearly. When the user asks about document contents, note that you can see the metadata but not the full document text in this POC version.`
      : 'You are a helpful legal document assistant for the FDKB (Food & Drug Knowledge Base).';

    try {
      const stream = await anthropic.messages.stream({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      });
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          res.write(`data: ${JSON.stringify({ type: 'delta', text: event.delta.text })}\n\n`);
        }
      }
      res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
      return res.end();
    } catch (err) {
      console.error('Chat error:', err);
      res.write(`data: ${JSON.stringify({ type: 'error', message: err.message })}\n\n`);
      return res.end();
    }
  }

  // Mock mode — simulate a streamed response
  const lastMsg = messages[messages.length - 1]?.content?.toLowerCase() || '';
  let mockReply;
  if (doc && (lastMsg.includes('summar') || lastMsg.includes('about'))) {
    mockReply = `This is "${doc.name}", a ${doc.pages || 'multi'}-page document authored by ${doc.author || 'the editorial team'}. It was last modified on ${doc.modified ? new Date(doc.modified).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : 'an unspecified date'}.\n\nBased on the metadata, this document is located in the ${doc.path || 'FDKB'} collection. In a production version, I would analyze the full text to provide a detailed summary of its contents, key regulatory citations, and actionable findings.\n\n*Note: This is a demo response. Connect an Anthropic API key for real AI analysis.*`;
  } else if (lastMsg.includes('regulat') || lastMsg.includes('citat') || lastMsg.includes('cfr')) {
    mockReply = `In a production implementation, I would scan the full document text and extract all regulatory citations including CFR references, Federal Register notices, and agency guidance documents.\n\nFor this POC, I can see from the metadata that this document is part of the FDKB collection, which typically contains FDA regulatory materials.\n\n*Note: This is a demo response. Connect an Anthropic API key for real AI analysis.*`;
  } else if (lastMsg.includes('key finding') || lastMsg.includes('important')) {
    mockReply = `Based on the document metadata, here are the key observations:\n\n1. **Document type**: This appears to be a regulatory document in the FDKB collection\n2. **Author**: ${doc?.author || 'Administrator'}\n3. **Scope**: ${doc?.pages || 'Multiple'} pages of regulatory content\n\nA full-text analysis would identify specific findings, compliance requirements, and action items.\n\n*Note: This is a demo response. Connect an Anthropic API key for real AI analysis.*`;
  } else {
    mockReply = `Thank you for your question about "${doc?.name || 'this document'}". In a production deployment, I would analyze the full document text to provide a detailed, accurate response.\n\nCurrently I can see the document metadata (author, date, page count, path) but not the full text content. The FDKB integration will support full-text analysis in a future release.\n\n*Note: This is a demo response. Connect an Anthropic API key for real AI analysis.*`;
  }

  // Stream the mock reply word by word
  const words = mockReply.split(' ');
  for (let i = 0; i < words.length; i++) {
    const chunk = (i === 0 ? '' : ' ') + words[i];
    res.write(`data: ${JSON.stringify({ type: 'delta', text: chunk })}\n\n`);
    await new Promise(r => setTimeout(r, 30));
  }
  res.write(`data: ${JSON.stringify({ type: 'done' })}\n\n`);
  res.end();
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`FDKB Navigator backend running on port ${PORT}`);
});
