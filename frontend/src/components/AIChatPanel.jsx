import { useState, useRef, useEffect } from 'react';
import { X, Send, Sparkles } from 'lucide-react';
import { chatStream } from '../lib/api';
import { extractMetadata } from '../lib/copyright';

export default function AIChatPanel({ doc, onClose }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  // Clear chat when switching documents
  useEffect(() => {
    setMessages([]);
    setInput('');
    setStreaming(false);
  }, [doc?.id]);

  const meta = doc ? extractMetadata(doc) : null;

  const docContext = doc ? {
    id: doc.id,
    name: doc.name,
    author: meta?.author,
    modified: doc.modifiedAt,
    pages: doc.properties?.['eci:pages'],
    path: doc.path?.name?.replace('/Company Home/Sites/FDKB-staging/documentlibrary/', ''),
  } : null;

  const sendMessage = async (text) => {
    if (!text.trim() || streaming) return;

    const userMsg = { role: 'user', content: text };
    const newMessages = [...messages, userMsg];
    setMessages([...newMessages, { role: 'assistant', content: '', streaming: true }]);
    setInput('');
    setStreaming(true);

    let accumulated = '';

    await chatStream(
      newMessages,
      docContext,
      (delta) => {
        accumulated += delta;
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated, streaming: true };
          return updated;
        });
      },
      () => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: accumulated };
          return updated;
        });
        setStreaming(false);
      },
      (error) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: `Error: ${error}`, error: true };
          return updated;
        });
        setStreaming(false);
      },
      (status) => {
        setMessages(prev => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: status, streaming: true, status: true };
          return updated;
        });
      }
    );
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    sendMessage(input);
  };

  const suggestions = [
    'Summarize this document',
    'What are the key findings?',
    'List all regulatory citations',
  ];

  return (
    <div
      className="flex flex-col"
      style={{
        height: '100%',
        background: 'var(--color-bg-secondary)',
        borderTop: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between shrink-0"
        style={{ padding: '8px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div className="flex items-center gap-2">
          <Sparkles size={13} style={{ color: 'var(--color-accent-gold)' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#fff' }}>Document AI</span>
          <span
            style={{
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--color-accent-gold)',
              background: 'rgba(200,164,78,0.12)',
              border: '1px solid rgba(200,164,78,0.3)',
              padding: '1px 6px',
              borderRadius: 3,
            }}
          >
            Beta
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
        >
          <X size={13} />
        </button>
      </div>

      {/* Messages */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto"
        style={{ padding: '12px 16px', minHeight: 0 }}
      >
        {messages.length === 0 ? (
          <div>
            <p style={{ fontSize: 12, color: 'var(--color-text-secondary)', marginBottom: 10, lineHeight: 1.5 }}>
              Ask me anything about <strong style={{ color: '#fff' }}>{doc?.name}</strong>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => sendMessage(s)}
                  style={{
                    background: 'var(--color-bg-elevated)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    borderRadius: 6,
                    padding: '5px 10px',
                    fontSize: 11,
                    color: 'var(--color-text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                <div
                  style={{
                    maxWidth: '85%',
                    padding: '8px 12px',
                    borderRadius: msg.role === 'user' ? '10px 10px 4px 10px' : '10px 10px 10px 4px',
                    fontSize: 12,
                    lineHeight: 1.6,
                    color: msg.error ? 'var(--color-status-red)' : msg.role === 'user' ? 'var(--color-bg-primary)' : 'var(--color-text-secondary)',
                    background: msg.role === 'user'
                      ? 'var(--color-accent)'
                      : 'var(--color-bg-elevated)',
                    borderLeft: msg.role === 'assistant' && !msg.error ? '2px solid var(--color-accent-gold)' : undefined,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                  }}
                >
                  {msg.content || (msg.streaming ? '...' : '')}
                  {msg.streaming && <span className="animate-pulse" style={{ color: 'var(--color-accent-gold)' }}>|</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0"
        style={{ padding: '8px 16px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}
      >
        <div
          className="flex items-center gap-2"
          style={{
            background: 'var(--color-bg-primary)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 8,
            padding: '6px 10px',
          }}
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this document..."
            disabled={streaming}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              fontSize: 12,
              color: 'var(--color-text-primary)',
            }}
          />
          <button
            type="submit"
            disabled={!input.trim() || streaming}
            style={{
              background: input.trim() && !streaming ? 'var(--color-accent)' : 'rgba(255,255,255,0.04)',
              border: 'none',
              borderRadius: 6,
              padding: '5px 7px',
              cursor: input.trim() && !streaming ? 'pointer' : 'default',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <Send
              size={12}
              style={{ color: input.trim() && !streaming ? 'var(--color-bg-primary)' : 'var(--color-text-muted)' }}
            />
          </button>
        </div>
      </form>
    </div>
  );
}
