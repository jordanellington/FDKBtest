const API_URL = import.meta.env.VITE_API_URL !== undefined ? import.meta.env.VITE_API_URL : 'http://localhost:3001';

let sessionId = localStorage.getItem('fdkb_session');

export function setSession(id) {
  sessionId = id;
  if (id) {
    localStorage.setItem('fdkb_session', id);
  } else {
    localStorage.removeItem('fdkb_session');
  }
}

export function getSession() {
  return sessionId;
}

async function request(path, options = {}) {
  const resp = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
      ...options.headers,
    },
  });

  if (resp.status === 401) {
    setSession(null);
    window.location.href = '/login';
    throw new Error('Session expired');
  }

  return resp;
}

// Session keep-alive heartbeat (10 minutes)
let heartbeatInterval = null;

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(async () => {
    if (!sessionId) return stopHeartbeat();
    try {
      await request('/api/auth/heartbeat');
    } catch {
      // 401 is handled inside request() — redirects to login
    }
  }, 10 * 60 * 1000);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

// Validate session immediately on load, then start heartbeat
if (sessionId) {
  // Fire-and-forget: check if session is still valid right away
  fetch(`${API_URL}/api/auth/heartbeat`, {
    headers: { 'x-session-id': sessionId },
  }).then(resp => {
    if (resp.status === 401) {
      setSession(null);
      window.location.href = '/login';
    } else {
      startHeartbeat();
    }
  }).catch(() => {
    // Network error — start heartbeat anyway, it'll retry
    startHeartbeat();
  });
}

export async function login(username, password) {
  const resp = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  });
  if (!resp.ok) throw new Error('Invalid credentials');
  const data = await resp.json();
  setSession(data.sessionId);
  startHeartbeat();
  return data;
}

export async function devLoginApi(jsessionId) {
  const resp = await fetch(`${API_URL}/api/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsessionId }),
  });
  if (!resp.ok) throw new Error('Invalid session');
  const data = await resp.json();
  setSession(data.sessionId);
  startHeartbeat();
  return data;
}

export async function logout() {
  stopHeartbeat();
  await request('/api/auth/logout', { method: 'POST' });
  setSession(null);
}

export async function getSiteInfo() {
  const resp = await request('/api/site');
  return resp.json();
}

export async function getStats() {
  const resp = await request('/api/stats');
  return resp.json();
}

export async function getFolderStats(nodeId) {
  const resp = await request(`/api/stats/${nodeId}`);
  return resp.json();
}

export async function getChildren(nodeId = 'root', options = {}) {
  const params = new URLSearchParams({
    maxItems: options.maxItems || 100,
    skipCount: options.skipCount || 0,
    orderBy: options.orderBy || 'name',
    ...(options.foldersOnly ? { foldersOnly: 'true' } : {}),
  });
  const resp = await request(`/api/nodes/${nodeId}/children?${params}`);
  return resp.json();
}

export async function getNode(nodeId) {
  const resp = await request(`/api/nodes/${nodeId}`);
  return resp.json();
}

export async function search(query, maxItems = 25, skipCount = 0, exact = false, sort = 'relevance', ascending = false) {
  const resp = await request('/api/search', {
    method: 'POST',
    body: JSON.stringify({ query, maxItems, skipCount, exact, sort, ascending }),
  });
  return resp.json();
}

export async function getRagStatus() {
  const resp = await request('/api/rag/status');
  return resp.json();
}

export async function buildRagIndex(onProgress, onComplete, onError, { clearExisting = false } = {}) {
  const resp = await fetch(`${API_URL}/api/rag/build-index`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    },
    body: JSON.stringify({ clearExisting }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Build request failed' }));
    onError(err.error || 'Build request failed');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' || data.type === 'status') onProgress(data);
          else if (data.type === 'complete') onComplete(data);
          else if (data.type === 'error') onError(data.message);
        } catch {}
      }
    }
  }
}

export async function discoverDocuments(nodeId) {
  const resp = await request('/api/rag/discover', {
    method: 'POST',
    body: JSON.stringify({ nodeId }),
  });
  return resp.json();
}

export async function buildSectionIndex(nodeId, { maxDocs, onProgress, onComplete, onError } = {}) {
  const resp = await fetch(`${API_URL}/api/rag/build-section`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    },
    body: JSON.stringify({ nodeId, maxDocs }),
  });

  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Build request failed' }));
    if (onError) onError(err.error || 'Build request failed');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'progress' || data.type === 'status') { if (onProgress) onProgress(data); }
          else if (data.type === 'complete') { if (onComplete) onComplete(data); }
          else if (data.type === 'error') { if (onError) onError(data.message); }
        } catch {}
      }
    }
  }
}

export function getContentUrl(nodeId, download = false) {
  return `${API_URL}/api/nodes/${nodeId}/content?sid=${sessionId}${download ? '&download=true' : ''}`;
}

export function getPreviewUrl(nodeId) {
  return `${API_URL}/api/nodes/${nodeId}/preview?sid=${sessionId}`;
}

export async function chatStream(messages, doc, onDelta, onDone, onError, onStatus, model) {
  const resp = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    },
    body: JSON.stringify({ messages, document: doc, model }),
  });

  if (resp.status === 401) {
    setSession(null);
    window.location.href = '/login';
    return;
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Chat request failed' }));
    onError(err.error || 'Chat request failed');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.type === 'delta') onDelta(data.text);
          else if (data.type === 'done') onDone();
          else if (data.type === 'error') onError(data.message);
          else if (data.type === 'status' && onStatus) onStatus(data.message);
        } catch {}
      }
    }
  }
}

export async function chatFdkbStream(messages, { onDelta, onDone, onError, onStatus, onSources, onHighlights, model, folderNodeId, signal }) {
  const body = { messages, model };
  if (folderNodeId) body.folderNodeId = folderNodeId;
  const resp = await fetch(`${API_URL}/api/chat/fdkb`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-session-id': sessionId || '',
    },
    body: JSON.stringify(body),
    signal,
  });

  if (resp.status === 401) {
    setSession(null);
    window.location.href = '/login';
    return;
  }
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ error: 'Chat request failed' }));
    onError(err.error || 'Chat request failed');
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === 'delta') onDelta(data.text);
            else if (data.type === 'done') onDone();
            else if (data.type === 'error') onError(data.message);
            else if (data.type === 'status' && onStatus) onStatus(data.message);
            else if (data.type === 'sources' && onSources) onSources(data.documents);
            else if (data.type === 'highlights' && onHighlights) onHighlights(data.highlights);
          } catch {}
        }
      }
    }
  } catch (err) {
    if (err.name === 'AbortError') return; // stopped by user — ChatPage handles cleanup
    throw err;
  }
}
