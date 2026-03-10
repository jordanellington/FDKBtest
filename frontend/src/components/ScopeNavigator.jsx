import { useState, useEffect, useRef } from 'react';
import { getChildren } from '../lib/api';
import { Folder, ArrowLeft, MessageSquare, ChevronRight, Loader2 } from 'lucide-react';

/**
 * Drillable folder navigator popup for scoping chat to a folder.
 * Mirrors the Dashboard/Browser card layout.
 *
 * Props:
 *  - onSelect(folderNodeId, folderName) — called when user picks a folder
 *  - onClose() — close the popup
 */
export default function ScopeNavigator({ onSelect, onClose }) {
  const [path, setPath] = useState([{ id: 'root', name: 'FDKB' }]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const popupRef = useRef(null);

  const currentFolder = path[path.length - 1];

  // Close on outside click
  useEffect(() => {
    function handleClick(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  // Fetch children when navigating
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getChildren(currentFolder.id, { maxItems: 100 }).then(data => {
      if (cancelled) return;
      const entries = data.list?.entries?.map(e => e.entry) || [];
      setItems(entries);
      setLoading(false);
    }).catch(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [currentFolder.id]);

  const folders = items.filter(i => i.isFolder);
  const isRoot = path.length === 1;

  // Separate numbered vs special at root level
  const numbered = isRoot
    ? folders.filter(f => /^\d/.test(f.name)).sort((a, b) =>
        parseFloat(a.name.match(/^[\d.]+/)?.[0] || '0') -
        parseFloat(b.name.match(/^[\d.]+/)?.[0] || '0')
      )
    : folders.sort((a, b) => a.name.localeCompare(b.name));

  function drillInto(folder) {
    setPath(prev => [...prev, { id: folder.id, name: folder.name }]);
  }

  function goBack() {
    setPath(prev => prev.slice(0, -1));
  }

  function goTo(index) {
    setPath(prev => prev.slice(0, index + 1));
  }

  function zeroPad(numStr) {
    const n = parseInt(numStr, 10);
    return isNaN(n) ? numStr : String(n).padStart(2, '0');
  }

  return (
    <div
      ref={popupRef}
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        background: 'var(--color-bg-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 12,
        boxShadow: '0 -8px 32px rgba(0,0,0,0.5)',
        zIndex: 20,
        maxHeight: 360,
        overflowY: 'auto',
      }}
    >
      {/* Header with back + breadcrumb + chat-here button */}
      {!isRoot && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px 8px',
          borderBottom: '1px solid var(--color-border)',
          position: 'sticky',
          top: 0,
          background: 'var(--color-bg-elevated)',
          zIndex: 1,
        }}>
          <button
            onClick={goBack}
            style={{
              width: 26, height: 26, borderRadius: 6,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-muted)',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <ArrowLeft size={13} />
          </button>

          {/* Breadcrumb */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4,
            fontSize: 11, color: 'var(--color-text-muted)',
            flex: 1, minWidth: 0, overflow: 'hidden',
          }}>
            {path.map((p, i) => (
              <span key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {i > 0 && <ChevronRight size={10} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />}
                {i === path.length - 1 ? (
                  <span style={{ color: 'var(--color-text-primary)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {p.name.replace(/^[\d.]+ /, '')}
                  </span>
                ) : (
                  <span
                    onClick={() => goTo(i)}
                    style={{ cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0 }}
                    onMouseEnter={(e) => e.target.style.color = 'var(--color-accent)'}
                    onMouseLeave={(e) => e.target.style.color = 'var(--color-text-muted)'}
                  >
                    {i === 0 ? p.name : p.name.replace(/^[\d.]+ /, '')}
                  </span>
                )}
              </span>
            ))}
          </div>

          {/* Chat here button */}
          <button
            onClick={() => onSelect(currentFolder.id, currentFolder.name)}
            style={{
              fontSize: 10, fontWeight: 600,
              color: 'var(--color-accent)',
              background: 'rgba(86, 191, 168, 0.1)',
              border: '1px solid rgba(86, 191, 168, 0.25)',
              borderRadius: 6,
              padding: '4px 10px',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Chat here
          </button>
        </div>
      )}

      {/* Body */}
      <div style={{ padding: 10 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 20 }}>
            <Loader2 size={18} className="animate-spin" style={{ color: 'var(--color-accent)' }} />
          </div>
        ) : numbered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 20, fontSize: 12, color: 'var(--color-text-muted)' }}>
            No subfolders found
          </div>
        ) : (
          <>
            <div style={{
              fontSize: 10, color: 'var(--color-text-muted)',
              textTransform: 'uppercase', letterSpacing: '0.06em',
              fontWeight: 600, marginBottom: 8, paddingLeft: 4,
            }}>
              {isRoot ? 'Subject Areas' : `Subfolders (${numbered.length})`}
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: isRoot ? 'repeat(2, 1fr)' : 'repeat(2, 1fr)',
              gap: 5,
            }}>
              {numbered.map(folder => {
                const rawNum = folder.name.match(/^[\d.]+/)?.[0] || '';
                const num = zeroPad(rawNum);
                const title = folder.name.replace(/^[\d.]+ /, '');
                const hasNum = /^\d/.test(folder.name);

                return (
                  <div
                    key={folder.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '9px 11px',
                      borderRadius: 7,
                      background: 'var(--color-bg-secondary)',
                      border: '1px solid var(--color-border)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                    onClick={() => drillInto(folder)}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'rgba(86, 191, 168, 0.08)';
                      e.currentTarget.style.borderColor = 'rgba(86, 191, 168, 0.3)';
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 3px 10px rgba(0,0,0,0.2)';
                      const numEl = e.currentTarget.querySelector('.scope-card-num');
                      if (numEl) numEl.style.color = 'var(--color-accent)';
                      const chatEl = e.currentTarget.querySelector('.scope-card-chat');
                      if (chatEl) chatEl.style.opacity = '1';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--color-bg-secondary)';
                      e.currentTarget.style.borderColor = 'var(--color-border)';
                      e.currentTarget.style.transform = 'none';
                      e.currentTarget.style.boxShadow = 'none';
                      const numEl = e.currentTarget.querySelector('.scope-card-num');
                      if (numEl) numEl.style.color = 'var(--color-text-muted)';
                      const chatEl = e.currentTarget.querySelector('.scope-card-chat');
                      if (chatEl) chatEl.style.opacity = '0';
                    }}
                  >
                    {hasNum ? (
                      <span className="scope-card-num" style={{
                        fontSize: 11, fontWeight: 700,
                        color: 'var(--color-text-muted)',
                        minWidth: 20, letterSpacing: '0.02em',
                        transition: 'color 0.15s',
                      }}>
                        {num}
                      </span>
                    ) : (
                      <Folder size={13} style={{ color: 'var(--color-text-dim)', flexShrink: 0 }} />
                    )}

                    <span style={{
                      fontSize: 12, fontWeight: 500,
                      color: 'var(--color-text-primary)',
                      flex: 1,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}>
                      {title}
                    </span>

                    {/* Chat icon — click to scope to this folder */}
                    <div
                      className="scope-card-chat"
                      title={`Chat about ${title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(folder.id, folder.name);
                      }}
                      style={{
                        width: 24, height: 24, borderRadius: 5,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent',
                        border: '1px solid transparent',
                        color: 'var(--color-text-muted)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                        opacity: 0,
                        flexShrink: 0,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(86, 191, 168, 0.15)';
                        e.currentTarget.style.borderColor = 'rgba(86, 191, 168, 0.4)';
                        e.currentTarget.style.color = 'var(--color-accent)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                        e.currentTarget.style.borderColor = 'transparent';
                        e.currentTarget.style.color = 'var(--color-text-muted)';
                      }}
                    >
                      <MessageSquare size={13} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
