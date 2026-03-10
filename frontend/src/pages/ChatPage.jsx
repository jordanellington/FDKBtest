import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, ChevronDown, ChevronUp, FileText, Sparkles, Database, Loader2 } from 'lucide-react';
import Markdown from 'react-markdown';
import { chatFdkbStream, getRagStatus, buildRagIndex } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';

const MODELS = [
  { id: 'haiku', label: 'Haiku 4.5' },
  { id: 'sonnet', label: 'Sonnet 4.6' },
  { id: 'opus', label: 'Opus 4.6' },
];

const SUGGESTIONS = [
  'What cloning legislation was proposed in 2001?',
  'Which publications cover FDA\'s stance on biotech?',
  'Summarize the key regulatory developments',
];

export default function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [model, setModel] = useState(() => localStorage.getItem('fdkb_chat_model') || 'haiku');
  const [viewerDoc, setViewerDoc] = useState(null);
  const [indexStatus, setIndexStatus] = useState(null); // { indexed, total }
  const [building, setBuilding] = useState(false);
  const [buildProgress, setBuildProgress] = useState(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const userScrolledUp = useRef(false);

  useEffect(() => {
    localStorage.setItem('fdkb_chat_model', model);
  }, [model]);

  // Check RAG index status on mount
  useEffect(() => {
    getRagStatus().then(setIndexStatus).catch(() => {});
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

  return (
    <div className="flex h-full overflow-hidden">
      {/* Chat pane */}
      <div className="flex flex-col flex-1 min-w-0" style={{ background: 'var(--color-bg-primary)' }}>
        {/* Messages area */}
        <div
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto"
          style={{ minHeight: 0 }}
        >
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
            {messages.length === 0 ? (
              <WelcomeScreen
                onSend={sendMessage}
                indexStatus={indexStatus}
                building={building}
                buildProgress={buildProgress}
                onBuildIndex={(clearExisting) => {
                  setBuilding(true);
                  setBuildProgress(null);
                  buildRagIndex(
                    (progress) => setBuildProgress(progress),
                    (result) => {
                      setBuilding(false);
                      setBuildProgress(null);
                      setIndexStatus({ indexed: result.indexed + result.skipped, total: result.total });
                    },
                    (error) => {
                      setBuilding(false);
                      setBuildProgress({ type: 'error', message: error });
                    },
                    { clearExisting }
                  );
                }}
              />
            ) : (
              <div className="flex flex-col gap-6">
                {messages.map((msg, i) => (
                  <MessageBubble key={i} msg={msg} onOpenDoc={openDoc} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Input bar */}
        <div style={{ borderTop: '1px solid var(--color-border)', background: 'var(--color-bg-secondary)' }}>
          <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 24px 12px' }}>
            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: 'var(--color-bg-primary)',
                  border: '1px solid var(--color-border-mid)',
                  borderRadius: 12,
                  padding: '10px 14px',
                }}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply..."
                  disabled={streaming}
                  style={{
                    flex: 1,
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    fontSize: 14,
                    color: 'var(--color-text-primary)',
                    fontFamily: 'var(--font-body)',
                  }}
                />
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
            </form>
            <p style={{
              fontSize: 11,
              color: 'var(--color-text-muted)',
              textAlign: 'center',
              marginTop: 8,
              fontFamily: 'var(--font-body)',
            }}>
              AI can make mistakes. Please double-check responses.
            </p>
          </div>
        </div>
      </div>

      {/* Document viewer pane */}
      {viewerDoc && (
        <div style={{ width: '50%', maxWidth: 700, minWidth: 400, borderLeft: '1px solid var(--color-border)' }}>
          <DocumentViewer
            document={viewerDoc}
            onClose={() => setViewerDoc(null)}
          />
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function WelcomeScreen({ onSend, indexStatus, building, buildProgress, onBuildIndex }) {
  const hasIndex = indexStatus && indexStatus.indexed > 0;

  return (
    <div style={{ paddingTop: '12vh', textAlign: 'center' }}>
      <div style={{ marginBottom: 16 }}>
        <Sparkles size={28} style={{ color: 'var(--color-accent-gold)', margin: '0 auto 12px' }} />
        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontSize: 28,
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

      {/* Index status / build button */}
      <div style={{ margin: '24px auto', maxWidth: 420 }}>
        {building ? (
          <div style={{
            background: 'var(--color-bg-elevated)',
            border: '1px solid var(--color-border-mid)',
            borderRadius: 10,
            padding: '16px 20px',
            textAlign: 'left',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Loader2 size={14} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
              <span style={{ fontSize: 13, color: 'var(--color-text-primary)', fontWeight: 500 }}>
                Building RAG Index...
              </span>
            </div>
            {buildProgress?.type === 'progress' && (
              <>
                <div style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 6 }}>
                  {buildProgress.current}/{buildProgress.total}: {buildProgress.name}
                </div>
                <div style={{
                  height: 4,
                  background: 'var(--color-bg-primary)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}>
                  <div style={{
                    height: '100%',
                    width: `${(buildProgress.current / buildProgress.total) * 100}%`,
                    background: 'var(--color-accent)',
                    borderRadius: 2,
                    transition: 'width 0.3s',
                  }} />
                </div>
                <div style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                  {buildProgress.indexed} indexed, {buildProgress.skipped} cached, {buildProgress.errors} errors
                </div>
              </>
            )}
            {buildProgress?.type === 'status' && (
              <div style={{ fontSize: 12, color: 'var(--color-text-secondary)' }}>{buildProgress.message}</div>
            )}
            {buildProgress?.type === 'error' && (
              <div style={{ fontSize: 12, color: 'var(--color-status-red)' }}>{buildProgress.message}</div>
            )}
          </div>
        ) : (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}>
            {indexStatus && (
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                {hasIndex
                  ? `${indexStatus.indexed}/${indexStatus.total} documents indexed`
                  : 'No RAG index found'}
              </span>
            )}
            <button
              onClick={() => onBuildIndex(hasIndex)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                background: hasIndex ? 'transparent' : 'var(--color-accent)',
                color: hasIndex ? 'var(--color-accent)' : 'var(--color-bg-primary)',
                border: hasIndex ? '1px solid var(--color-border-accent)' : 'none',
                borderRadius: 8,
                padding: '8px 14px',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
              }}
            >
              <Database size={13} />
              {hasIndex ? 'Rebuild Index' : 'Create RAG Index'}
            </button>
          </div>
        )}
      </div>

      {/* Suggestion chips — only show if index exists */}
      {hasIndex && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 }}>
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => onSend(s)}
              style={{
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border-mid)',
                borderRadius: 10,
                padding: '10px 16px',
                fontSize: 13,
                color: 'var(--color-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'var(--font-body)',
                transition: 'border-color 0.15s',
              }}
              onMouseEnter={(e) => e.target.style.borderColor = 'var(--color-border-strong)'}
              onMouseLeave={(e) => e.target.style.borderColor = 'var(--color-border-mid)'}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ModelSelector({ model, onChange, disabled }) {
  return (
    <select
      value={model}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      style={{
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 6,
        padding: '4px 8px',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        cursor: 'pointer',
        fontFamily: 'var(--font-body)',
        outline: 'none',
      }}
    >
      {MODELS.map((m) => (
        <option key={m.id} value={m.id}>{m.label}</option>
      ))}
    </select>
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
            Searched {msg.sources.length} document{msg.sources.length !== 1 ? 's' : ''}
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
            <Markdown>{msg.content}</Markdown>
          </div>
        ) : (
          msg.streaming && <span className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }}>...</span>
        )}
        {msg.streaming && !msg.status && msg.content && (
          <span className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }}>|</span>
        )}
      </div>

      {/* Source document cards — shown after response is done */}
      {!msg.streaming && msg.sources && msg.sources.length > 0 && (
        <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {msg.sources.map((src, i) => (
            <SourceCard key={i} source={src} onClick={() => onOpenDoc(src)} />
          ))}
        </div>
      )}
    </div>
  );
}

function SourceCard({ source, onClick }) {
  const title = source.displayTitle && source.displayTitle !== source.name
    ? source.displayTitle
    : source.name;
  const displayTitle = title.length > 50 ? title.slice(0, 47) + '...' : title;

  return (
    <button
      onClick={onClick}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border-mid)',
        borderRadius: 5,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s',
        fontFamily: 'var(--font-body)',
        fontSize: 11,
        color: 'var(--color-text-secondary)',
        textDecoration: 'none',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--color-accent)'; e.currentTarget.style.color = 'var(--color-text-primary)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--color-border-mid)'; e.currentTarget.style.color = 'var(--color-text-secondary)'; }}
    >
      <FileText size={10} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
      {displayTitle}
    </button>
  );
}
