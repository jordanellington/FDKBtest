import { useState, useRef, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, ChevronDown, ChevronUp, FileText, Sparkles, Plus, X, Check } from 'lucide-react';
import Markdown from 'react-markdown';
import { chatFdkbStream } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';
import ScopeNavigator from '../components/ScopeNavigator';

const MODELS = [
  { id: 'haiku', label: 'Haiku 4.5' },
  { id: 'sonnet', label: 'Sonnet 4.6' },
  { id: 'opus', label: 'Opus 4.6' },
];

// Strip brackets from citations so markdown renders them as plain text.
function stripCitationBrackets(text) {
  return text.replace(/\[([^\]]+?\.PDF),\s*p\.?\s*(\d+)\]/gi, '$1, p.$2');
}

// Process direct children of a React element: find citation patterns in strings,
// replace with clickable spans. Passes non-string children through unchanged.
const CITE_TEXT_RE = /(\d[\d.]+\.PDF,\s*p\.?\s*\d+)/gi;

function linkCitations(children, sources, onOpenDoc) {
  if (!children) return children;
  const arr = Array.isArray(children) ? children : [children];
  return arr.flatMap((child, ci) => {
    if (typeof child !== 'string') return child;
    const parts = child.split(CITE_TEXT_RE);
    if (parts.length === 1) return child;
    return parts.map((part, i) => {
      if (i % 2 === 0) return part;
      const m = part.match(/^(.+?\.PDF),\s*p\.?\s*\d+$/i);
      if (!m) return part;
      const docName = m[1];
      const source = sources?.find(s =>
        s.name === docName || s.name?.startsWith(docName.replace(/\.PDF$/i, ''))
      );
      if (!source) return part;
      return (
        <span
          key={`${ci}-${i}`}
          role="button"
          tabIndex={0}
          onClick={() => onOpenDoc(source)}
          onKeyDown={(e) => e.key === 'Enter' && onOpenDoc(source)}
          style={{
            color: 'var(--color-accent)',
            cursor: 'pointer',
            textDecoration: 'underline',
            textDecorationStyle: 'dotted',
            textUnderlineOffset: 2,
          }}
          title={source.displayTitle || docName}
        >
          {part}
        </span>
      );
    });
  });
}

function formatDate(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export default function ChatPage() {
  const location = useLocation();
  const [scope, setScope] = useState(() => {
    const id = location.state?.folderNodeId || null;
    const name = location.state?.folderName || null;
    return id ? { folderNodeId: id, folderName: name } : null;
  });
  const [showScopeNav, setShowScopeNav] = useState(false);
  const folderNodeId = scope?.folderNodeId || null;

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState(() => localStorage.getItem('fdkb_chat_model') || 'haiku');
  const [viewerDoc, setViewerDoc] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    localStorage.setItem('fdkb_chat_model', model);
  }, [model]);

  // Listen for clear-chat event from sidebar
  useEffect(() => {
    const handleClear = () => { setMessages([]); setViewerDoc(null); setScope(null); };
    window.addEventListener('fdkb-clear-chat', handleClear);
    return () => window.removeEventListener('fdkb-clear-chat', handleClear);
  }, []);

  // Auto-scroll unless user scrolled up
  useEffect(() => {
    if (!userScrolledUp.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleScroll = useCallback(() => {
    if (!scrollRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    userScrolledUp.current = scrollHeight - scrollTop - clientHeight > 80;
  }, []);

  const openDoc = (doc) => {
    setViewerDoc({
      id: doc.nodeId,
      name: doc.name,
      content: { mimeType: 'application/pdf' },
    });
  };

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setStreaming(true);
    userScrolledUp.current = false;

    let accumulated = '';

    await chatFdkbStream(newMessages, {
      model,
      folderNodeId,
      onDelta: (delta) => {
        accumulated += delta;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: accumulated, streaming: true, status: false };
          return updated;
        });
      },
      onDone: () => {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          updated[updated.length - 1] = { ...last, content: accumulated, streaming: false };
          return updated;
        });
        setStreaming(false);
      },
      onError: (error) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${error}`, error: true };
          return updated;
        });
        setStreaming(false);
      },
      onStatus: (status) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], content: status, streaming: true, status: true };
          return updated;
        });
      },
      onSources: (documents) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { ...updated[updated.length - 1], sources: documents };
          return updated;
        });
      },
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const isEmpty = messages.length === 0;

  const inputBar = (
    <div style={{ maxWidth: isEmpty ? 640 : 900, margin: '0 auto', width: '100%', padding: isEmpty ? '0 24px' : '16px 24px 12px' }}>
      <form onSubmit={handleSubmit}>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            background: isEmpty ? 'var(--color-bg-elevated)' : 'var(--color-bg-primary)',
            border: '1px solid var(--color-border-mid)',
            borderRadius: isEmpty ? 24 : 16,
            padding: isEmpty ? '16px 20px 12px' : '12px 16px 8px',
            minHeight: isEmpty ? 80 : 'auto',
            position: 'relative',
            boxShadow: isEmpty ? '0 4px 24px rgba(0,0,0,0.12)' : 'none',
            transition: 'all 0.3s ease',
          }}
        >
          {/* Scope navigator popup */}
          {showScopeNav && (
            <ScopeNavigator
              onSelect={(folderId, folderName) => {
                setScope({ folderNodeId: folderId, folderName });
                setShowScopeNav(false);
              }}
              onClose={() => setShowScopeNav(false)}
            />
          )}

          {/* Top row: scope tag + text input */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {scope && (
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 8px 3px 10px',
                background: 'rgba(86, 191, 168, 0.1)',
                border: '1px solid rgba(86, 191, 168, 0.25)',
                borderRadius: 12,
                fontSize: 11, fontWeight: 600,
                color: 'var(--color-accent)',
                whiteSpace: 'nowrap', flexShrink: 0,
              }}>
                {scope.folderName?.replace(/^[\d.]+ /, '') || 'Folder'}
                <X
                  size={12}
                  style={{ cursor: 'pointer', opacity: 0.7 }}
                  onClick={() => setScope(null)}
                />
              </span>
            )}
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={scope ? `Ask about ${scope.folderName?.replace(/^[\d.]+ /, '')}...` : (isEmpty ? 'How can I help you today?' : 'Reply...')}
              disabled={streaming}
              style={{
                flex: 1,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                fontSize: isEmpty ? 16 : 14,
                color: 'var(--color-text-primary)',
                fontFamily: 'var(--font-body)',
              }}
            />
          </div>

          {/* Bottom row: + Scope on left, model selector + send on right */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 }}>
            <button
              type="button"
              onClick={() => setShowScopeNav(!showScopeNav)}
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                width: 28, height: 28,
                background: 'transparent',
                border: '1px solid var(--color-border)',
                borderRadius: '50%',
                color: 'var(--color-text-muted)',
                cursor: 'pointer',
                transition: 'all 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-accent)';
                e.currentTarget.style.color = 'var(--color-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--color-border)';
                e.currentTarget.style.color = 'var(--color-text-muted)';
              }}
              title="Scope to folder"
            >
              <Plus size={14} />
            </button>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <ModelSelector model={model} onChange={setModel} disabled={streaming} />
              {input.trim() && (
                <button
                  type="submit"
                  disabled={streaming}
                  style={{
                    background: 'var(--color-accent)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '6px 8px',
                    cursor: streaming ? 'default' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    opacity: streaming ? 0.5 : 1,
                  }}
                >
                  <Send size={14} style={{ color: 'var(--color-bg-primary)' }} />
                </button>
              )}
            </div>
          </div>
        </div>
      </form>
      <p style={{
        fontSize: 11,
        color: 'var(--color-text-muted)',
        textAlign: 'center',
        marginTop: 8,
        fontFamily: 'var(--font-body)',
      }}>
        Private AI for Covington &amp; Burling LLP. Conversations are confidential. Always verify responses.
      </p>
    </div>
  );

  return (
    <div className="flex h-full overflow-hidden">
      {/* Chat pane */}
      <div className="flex flex-col min-w-0" style={{ background: 'var(--color-bg-primary)', width: viewerDoc ? '50%' : '100%', flex: 'none' }}>

        {isEmpty ? (
          /* ── Empty state: everything centered vertically ── */
          <div style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            minHeight: 0,
            padding: '0 24px',
            /* sit in upper-center like Claude's welcome */
            marginTop: '-12vh',
          }}>
            <div style={{ textAlign: 'center', maxWidth: 680 }}>
              <Sparkles size={28} style={{ color: 'var(--color-accent-gold)', margin: '0 auto 12px' }} />
              <h2 style={{
                fontFamily: 'var(--font-display)',
                fontSize: 32,
                fontWeight: 400,
                color: 'var(--color-text-primary)',
                marginBottom: 8,
              }}>
                Ask anything about the FDKB
              </h2>
              <p style={{
                fontSize: 14,
                color: 'var(--color-text-secondary)',
                maxWidth: 420,
                margin: '0 auto',
                lineHeight: 1.6,
              }}>
                Search across hundreds of FDA, biotech, and regulatory documents. Responses include citations to source documents.
              </p>
            </div>
            <div style={{ width: '100%', marginTop: 40 }}>
              {inputBar}
            </div>
          </div>
        ) : (
          /* ── Conversation state: messages scroll, input pinned to bottom ── */
          <>
            <div
              ref={scrollRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto"
              style={{ minHeight: 0 }}
            >
              <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
                <div className="flex flex-col gap-6">
                  {messages.map((msg, i) => (
                    <MessageBubble key={i} msg={msg} onOpenDoc={openDoc} />
                  ))}
                </div>
              </div>
            </div>
            <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
              {inputBar}
            </div>
          </>
        )}
      </div>

      {/* Document viewer pane */}
      {viewerDoc && (
        <div style={{ flex: 1, minWidth: 400, borderLeft: '1px solid var(--color-border)' }}>
          <DocumentViewer
            document={viewerDoc}
            onClose={() => setViewerDoc(null)}
            fillContainer
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function ModelSelector({ model, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const current = MODELS.find((m) => m.id === model);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(!open)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          background: 'transparent',
          border: 'none',
          padding: '2px 6px',
          fontSize: 13,
          color: 'var(--color-text-muted)',
          cursor: disabled ? 'default' : 'pointer',
          fontFamily: 'var(--font-body)',
          borderRadius: 6,
          transition: 'color 0.15s',
          opacity: disabled ? 0.5 : 1,
        }}
        onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.color = 'var(--color-text-primary)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--color-text-muted)'; }}
      >
        {current?.label}
        <ChevronDown size={13} style={{ transition: 'transform 0.15s', transform: open ? 'rotate(180deg)' : 'none' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          bottom: '100%',
          right: 0,
          marginBottom: 6,
          background: 'var(--color-bg-elevated)',
          border: '1px solid var(--color-border-mid)',
          borderRadius: 12,
          padding: '6px',
          minWidth: 160,
          boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
          zIndex: 50,
        }}>
          {MODELS.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m.id); setOpen(false); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                padding: '8px 12px',
                background: 'transparent',
                border: 'none',
                borderRadius: 8,
                fontSize: 13,
                fontFamily: 'var(--font-body)',
                color: m.id === model ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                cursor: 'pointer',
                transition: 'background 0.1s',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
            >
              {m.label}
              {m.id === model && <Check size={14} style={{ color: 'var(--color-accent)' }} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function MessageBubble({ msg, onOpenDoc }) {
  const [sourcesExpanded, setSourcesExpanded] = useState(false);

  if (msg.role === 'user') {
    return (
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          maxWidth: '80%',
          padding: '10px 16px',
          borderRadius: '16px 16px 4px 16px',
          fontSize: 14,
          lineHeight: 1.6,
          color: 'var(--color-bg-primary)',
          background: 'var(--color-accent)',
          whiteSpace: 'pre-wrap',
          fontFamily: 'var(--font-body)',
        }}>
          {msg.content}
        </div>
      </div>
    );
  }

  // Assistant message
  return (
    <div>
      {/* Collapsible sources indicator */}
      {msg.sources && msg.sources.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <button
            onClick={() => setSourcesExpanded(!sourcesExpanded)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 12,
              color: 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)',
              padding: 0,
            }}
          >
            {msg.sources.length} source{msg.sources.length !== 1 ? 's' : ''} found
            {sourcesExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          {sourcesExpanded && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {msg.sources.map((src, i) => (
                <div key={i} style={{
                  fontSize: 11,
                  color: 'var(--color-text-muted)',
                  paddingLeft: 12,
                }}>
                  {src.name} (score: {src.score?.toFixed(3)})
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Message content */}
      <div style={{
        fontSize: 14,
        lineHeight: 1.7,
        color: msg.error ? 'var(--color-status-red)' : 'var(--color-text-primary)',
        fontFamily: 'var(--font-body)',
      }}>
        {msg.status ? (
          <span style={{ color: 'var(--color-text-muted)', fontStyle: 'italic', fontSize: 13 }}>{msg.content}</span>
        ) : msg.content ? (
          <div className="chat-markdown chat-markdown-lg">
            <Markdown components={{
              p: ({ children }) => <p>{linkCitations(children, msg.sources, onOpenDoc)}</p>,
              li: ({ children }) => <li>{linkCitations(children, msg.sources, onOpenDoc)}</li>,
              td: ({ children }) => <td>{linkCitations(children, msg.sources, onOpenDoc)}</td>,
            }}>
              {stripCitationBrackets(msg.content)}
            </Markdown>
          </div>
        ) : (
          msg.streaming && <span className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }}>...</span>
        )}
        {msg.streaming && !msg.status && msg.content && (
          <span className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }}>|</span>
        )}
      </div>

      {/* Source document list — shown after response is done */}
      {!msg.streaming && msg.sources && msg.sources.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: '0.06em', color: 'var(--color-text-muted)',
            marginBottom: 6,
          }}>
            Sources
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {msg.sources.map((src, i) => (
              <SourceCard key={i} source={src} onClick={() => onOpenDoc(src)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, onClick }) {
  const title = source.displayTitle && source.displayTitle !== source.name
    ? source.displayTitle
    : source.name;
  const pub = source.publicationTitle;
  const date = formatDate(source.publicationDate);
  const meta = [pub, date].filter(Boolean).join(' · ');

  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: 'transparent',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.15s',
        fontFamily: 'var(--font-body)',
        textDecoration: 'none',
        width: '100%',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
    >
      <FileText size={13} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
      <span style={{
        fontSize: 12, color: 'var(--color-text-primary)',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        flex: 1, minWidth: 0,
      }}>
        {title}
      </span>
      {meta && (
        <span style={{
          fontSize: 11, color: 'var(--color-text-muted)',
          whiteSpace: 'nowrap', flexShrink: 0,
        }}>
          {meta}
        </span>
      )}
    </button>
  );
}
