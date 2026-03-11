import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getChildren, getNode, getFolderStats, discoverDocuments, buildSectionIndex } from '../lib/api';
import Counter from '../components/Counter';
import DocumentViewer from '../components/DocumentViewer';
import { Folder, FileText, ChevronRight, Home, ArrowLeft, Layers, MessageSquare, Database, X } from 'lucide-react';
import { classifyDocument, extractMetadata } from '../lib/copyright';

function Breadcrumbs({ path, onNavigate }) {
  if (!path) return null;
  const elements = path.elements || [];
  const dlIndex = elements.findIndex(e => e.name === 'documentlibrary');
  const visible = dlIndex >= 0 ? elements.slice(dlIndex + 1) : elements;

  return (
    <div className="flex items-center gap-1.5 text-[13px] flex-wrap">
      <button onClick={() => onNavigate('root')} className="text-text-muted hover:text-accent transition-colors flex items-center gap-1">
        <Home size={12} />
        FDKB
      </button>
      {visible.map((el, i) => (
        <span key={el.id} className="flex items-center gap-1.5">
          <ChevronRight size={11} className="text-text-dim" />
          <button onClick={() => onNavigate(el.id)} className="text-text-muted hover:text-accent transition-colors">{el.name}</button>
        </span>
      ))}
    </div>
  );
}

const BADGE_CONFIG = {
  green: { color: '#4db8a4', bg: 'rgba(77,184,164,0.07)' },
  amber: { color: '#c8a44e', bg: 'rgba(200,164,78,0.07)' },
  blue:  { color: '#6ba3e8', bg: 'rgba(107,163,232,0.07)' },
  red:   { color: '#e8836e', bg: 'rgba(232,131,110,0.07)' },
};

function zeroPad(numStr) {
  const n = parseInt(numStr, 10);
  return isNaN(n) ? numStr : String(n).padStart(2, '0');
}

export default function Browser() {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [folderStats, setFolderStats] = useState(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [discovering, setDiscovering] = useState(false);
  const [discoverResult, setDiscoverResult] = useState(null);
  const [indexing, setIndexing] = useState(null); // { current, total, name, indexed, errors } or null
  const sentinelRef = useRef(null);
  const currentId = nodeId || 'root';
  const isRoot = currentId === 'root';

  // Async folder stats (non-blocking)
  useEffect(() => {
    if (currentId === 'root') { setFolderStats(null); return; }
    setFolderStats(null);
    getFolderStats(currentId).then(setFolderStats).catch(() => {});
  }, [currentId]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setSelectedDoc(null);
      setCurrentNode(null);
      try {
        const [childrenData, nodeData] = await Promise.all([
          getChildren(currentId, { maxItems: 100 }),
          currentId !== 'root' ? getNode(currentId) : Promise.resolve(null),
        ]);
        setItems(childrenData.list?.entries?.map(e => e.entry) || []);
        setPagination(childrenData.list?.pagination);
        setCurrentNode(nodeData);
      } catch (err) {
        console.error('Browser load error:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [currentId]);

  // Infinite scroll: load next page
  const loadMore = useCallback(async () => {
    if (loadingMore || !pagination?.hasMoreItems) return;
    setLoadingMore(true);
    try {
      const data = await getChildren(currentId, {
        maxItems: 100,
        skipCount: items.length,
      });
      const newEntries = data.list?.entries?.map(e => e.entry) || [];
      setItems(prev => [...prev, ...newEntries]);
      setPagination(data.list?.pagination);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [currentId, items.length, loadingMore, pagination]);

  // Intersection observer for infinite scroll sentinel
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { rootMargin: '200px' }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const folders = items.filter(i => i.isFolder);
  const files = items.filter(i => i.isFile);

  const numbered = isRoot
    ? folders.filter(f => /^\d/.test(f.name)).sort((a, b) =>
        parseFloat(a.name.match(/^[\d.]+/)?.[0] || '0') -
        parseFloat(b.name.match(/^[\d.]+/)?.[0] || '0')
      )
    : [];
  const special = isRoot ? folders.filter(f => !/^\d/.test(f.name)) : [];

  const handleNavigate = (id) => {
    if (id === 'root') navigate('/browse');
    else navigate(`/browse/${id}`);
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    setDiscoverResult(null);
    try {
      const result = await discoverDocuments(currentId);
      setDiscoverResult(result);
    } catch (err) {
      console.error('Discover error:', err);
    } finally {
      setDiscovering(false);
    }
  };

  const handleBuildSection = async (maxDocs) => {
    setDiscoverResult(null);
    setIndexing({ current: 0, total: 0, name: '', indexed: 0, errors: 0, status: 'Starting...' });
    await buildSectionIndex(currentId, {
      maxDocs: maxDocs || undefined,
      onProgress: (data) => {
        if (data.type === 'status') setIndexing(prev => ({ ...prev, status: data.message }));
        else setIndexing(prev => ({ ...prev, ...data, status: null }));
      },
      onComplete: (data) => {
        setIndexing(null);
        getFolderStats(currentId).then(setFolderStats).catch(() => {});
      },
      onError: (msg) => {
        console.error('Build section error:', msg);
        setIndexing(null);
      },
    });
  };

  return (
    <div className="flex h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-[1100px]">
          {/* Header */}
          {isRoot ? (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="page-section-hero"
              style={{ padding: '44px 56px 0', marginBottom: 32 }}
            >
              <h1 className="page-title font-display text-[42px] font-light text-text-primary leading-[1.08] tracking-[-0.02em]" style={{ marginBottom: 10 }}>
                Documents
              </h1>
              <p className="text-text-muted text-[14px]">Browse the complete FDKB document library</p>
            </motion.div>
          ) : (
            <>
              {/* Breadcrumb row */}
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="page-section flex items-center gap-3"
                style={{ padding: '20px 56px 0', marginBottom: 0 }}
              >
                <button
                  onClick={() => {
                    if (currentNode?.parentId) handleNavigate(currentNode.parentId);
                    else handleNavigate('root');
                  }}
                  className="p-1.5 rounded-md text-text-muted hover:text-accent hover:bg-bg-elevated transition-colors shrink-0"
                >
                  <ArrowLeft size={15} />
                </button>
                <div className="flex items-center gap-2 min-w-0">
                  <Breadcrumbs path={currentNode?.path} onNavigate={handleNavigate} />
                </div>
              </motion.div>

              {/* Folder hero with stats */}
              <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45 }}
                className="page-section-hero"
                style={{ padding: '8px 56px 0', marginBottom: 0 }}
              >
                <h1 className="page-title font-body text-[24px] font-medium text-text-primary leading-[1.12] tracking-[-0.02em]"
                  style={{ marginBottom: 0 }}>
                  {currentNode?.name}
                </h1>

                <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--color-border)' }} />

                {/* Discover result confirmation */}
                {discoverResult && (
                  <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-[14px] font-medium text-text-primary mb-1">
                          {discoverResult.toIndex > 0
                            ? `${discoverResult.toIndex.toLocaleString()} documents to index`
                            : 'All documents already indexed'}
                        </p>
                        <p className="text-[12px] text-text-muted">
                          {discoverResult.totalDocuments.toLocaleString()} total &middot; {discoverResult.alreadyIndexed.toLocaleString()} already indexed
                        </p>
                      </div>
                      <button onClick={() => setDiscoverResult(null)} className="text-text-dim hover:text-text-muted transition-colors p-1">
                        <X size={14} />
                      </button>
                    </div>
                    {discoverResult.toIndex > 0 && (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label className="text-[11px] text-text-muted">Batch size:</label>
                          <input
                            type="number"
                            defaultValue={100}
                            min={1}
                            max={discoverResult.toIndex}
                            id="batchSizeInput"
                            className="w-20 px-2 py-1 text-[12px] rounded border bg-transparent text-text-primary"
                            style={{ borderColor: 'var(--color-border)' }}
                          />
                          <span className="text-[11px] text-text-dim">0 = all</span>
                        </div>
                        <button
                          onClick={() => {
                            const val = parseInt(document.getElementById('batchSizeInput')?.value) || 0;
                            handleBuildSection(val);
                          }}
                          className="text-[12px] font-semibold px-4 py-2 rounded-md transition-colors"
                          style={{
                            background: 'var(--color-accent)',
                            color: 'var(--color-bg-primary)',
                          }}
                        >
                          Start Indexing
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Indexing progress */}
                {indexing && (
                  <div className="mt-4 p-4 rounded-lg" style={{ background: 'var(--color-bg-elevated)', border: '1px solid var(--color-border)' }}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[13px] font-medium text-text-primary">
                        {indexing.status || `Indexing: ${indexing.name}`}
                      </span>
                      <span className="text-[11px] text-text-muted">
                        {indexing.total > 0 ? `${indexing.current} / ${indexing.total}` : ''}
                      </span>
                    </div>
                    {indexing.total > 0 && (
                      <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--color-bg-primary)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${Math.round((indexing.current / indexing.total) * 100)}%`,
                            background: 'var(--color-accent)',
                          }}
                        />
                      </div>
                    )}
                    {(indexing.indexed > 0 || indexing.errors > 0) && (
                      <p className="text-[11px] text-text-muted mt-2">
                        {indexing.indexed} indexed &middot; {indexing.errors} errors &middot; {indexing.skipped || 0} skipped
                      </p>
                    )}
                  </div>
                )}
              </motion.div>
            </>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-7 h-7 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
            </div>
          ) : isRoot ? (
            <>
              {/* Subject Areas — 4-col compact with shadows */}
              {numbered.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05, duration: 0.45 }}
                  className="page-section"
                  style={{ padding: '0 56px 56px' }}
                >
                  <div className="flex items-baseline justify-between" style={{ marginBottom: 20 }}>
                    <h2 className="section-heading font-display text-[24px] font-normal text-text-primary">Subject Areas</h2>
                    <span className="text-[11px] font-medium text-text-muted">{numbered.length} areas</span>
                  </div>
                  <div className="subject-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
                    {numbered.map(folder => {
                      const rawNum = folder.name.match(/^[\d.]+/)?.[0] || '';
                      const num = zeroPad(rawNum);
                      const title = folder.name.replace(/^[\d.]+ /, '');
                      return (
                        <div
                          key={folder.id}
                          onClick={() => handleNavigate(folder.id)}
                          className="subject-card flex items-center cursor-pointer transition-all duration-200"
                          style={{
                            gap: 12,
                            padding: '14px 16px',
                            borderRadius: 8,
                            background: 'var(--color-bg-secondary)',
                            boxShadow: 'var(--shadow-card)',
                            border: '1px solid var(--color-border)',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--color-bg-hover)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                            e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                            e.currentTarget.style.transform = 'translateY(-1px)';
                            e.currentTarget.querySelector('.card-id').style.color = 'var(--color-accent)';
                            e.currentTarget.querySelector('.card-name').style.color = 'var(--color-text-primary)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'var(--color-bg-secondary)';
                            e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                            e.currentTarget.style.borderColor = 'var(--color-border)';
                            e.currentTarget.style.transform = 'none';
                            e.currentTarget.querySelector('.card-id').style.color = 'var(--color-text-muted)';
                            e.currentTarget.querySelector('.card-name').style.color = 'var(--color-text-primary)';
                          }}
                        >
                          <span className="card-id text-[11px] font-bold tracking-[0.02em] transition-colors duration-200"
                            style={{ color: 'var(--color-text-muted)', minWidth: 22 }}>
                            {num}
                          </span>
                          <span className="card-name text-[13px] font-medium leading-snug transition-colors duration-150"
                            style={{ color: 'var(--color-text-primary)', flex: 1 }}>
                            {title}
                          </span>
                          <div
                            className="card-chat-icon"
                            title={`Chat about ${title}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate('/chat', { state: { folderNodeId: folder.id, folderName: folder.name } });
                            }}
                            style={{
                              width: 26, height: 26, borderRadius: 6,
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
                              e.stopPropagation();
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
                            <MessageSquare size={14} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}

              {/* Special Collections — text list */}
              {special.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1, duration: 0.45 }}
                  className="page-section"
                  style={{ padding: '0 56px 80px' }}
                >
                  <h2 className="section-heading font-display text-[24px] font-normal text-text-primary" style={{ marginBottom: 20 }}>Special Collections</h2>
                  <div className="collections-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 32px' }}>
                    {special.map((f) => (
                      <div
                        key={f.id}
                        onClick={() => handleNavigate(f.id)}
                        className="cursor-pointer"
                        style={{ padding: '10px 0', borderBottom: '1px solid var(--color-border)' }}
                      >
                        <span className="text-[13px] text-text-secondary hover:text-accent-bright transition-colors duration-150">
                          {f.name}
                        </span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            /* Sub-folder level */
            <div className="page-section" style={{ padding: '0 56px 56px' }}>
              {/* Folders */}
              {folders.length > 0 && (
                <div className="mb-10">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold" style={{ marginBottom: 20 }}>
                    Folders ({folders.length})
                  </p>
                  <div className="subject-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                    {folders.map((folder, i) => (
                      <motion.div
                        key={folder.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.015 }}
                        onClick={() => handleNavigate(folder.id)}
                        className="subject-card flex items-center cursor-pointer transition-all duration-200"
                        style={{
                          gap: 10,
                          padding: '14px 16px',
                          borderRadius: 8,
                          background: 'var(--color-bg-secondary)',
                          boxShadow: 'var(--shadow-card)',
                          border: '1px solid var(--color-border)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-hover)';
                          e.currentTarget.style.boxShadow = 'var(--shadow-md)';
                          e.currentTarget.style.borderColor = 'var(--color-border-strong)';
                          e.currentTarget.style.transform = 'translateY(-1px)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'var(--color-bg-secondary)';
                          e.currentTarget.style.boxShadow = 'var(--shadow-card)';
                          e.currentTarget.style.borderColor = 'var(--color-border)';
                          e.currentTarget.style.transform = 'none';
                        }}
                      >
                        <Folder size={14} className="text-accent/50 shrink-0" strokeWidth={1.5} />
                        <span className="text-[13px] font-medium leading-snug text-text-primary truncate" style={{ flex: 1 }}>
                          {folder.name}
                        </span>
                        <div
                          className="card-chat-icon"
                          title={`Chat about ${folder.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/chat', { state: { folderNodeId: folder.id, folderName: folder.name } });
                          }}
                          style={{
                            width: 26, height: 26, borderRadius: 6,
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
                            e.stopPropagation();
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
                          <MessageSquare size={14} />
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files */}
              {files.length > 0 && (
                <div>
                  {files.map((file, i) => {
                    const meta = extractMetadata(file);
                    const pages = file.properties?.['eci:pages'] || '—';
                    const modified = meta.cccEnriched ? meta.date : (file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
                    const cls = classifyDocument(file);
                    const bc = BADGE_CONFIG[cls.color] || BADGE_CONFIG.red;
                    const isSelected = selectedDoc?.id === file.id;
                    const isNotCovered = cls.label === 'NOT COVERED';
                    const source = meta.cccEnriched ? (meta.publicationTitle || meta.publisher) : meta.publisher;

                    return (
                      <motion.div
                        key={file.id}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.01 }}
                        onClick={() => setSelectedDoc(file)}
                        style={{
                          padding: '14px 16px',
                          cursor: 'pointer',
                          borderBottom: '1px solid var(--color-border)',
                          background: isSelected ? 'var(--color-bg-elevated)' : 'transparent',
                          transition: 'all 0.12s ease',
                          position: 'relative',
                          borderLeft: isNotCovered ? '3px solid #c87a4e' : '3px solid transparent',
                        }}
                        onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
                        onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = isSelected ? 'var(--color-bg-elevated)' : 'transparent'; }}
                      >
                        {isSelected && (
                          <div style={{
                            position: 'absolute', left: 0, top: 8, bottom: 8,
                            width: 3, borderRadius: 2, background: 'var(--color-accent)',
                          }} />
                        )}

                        <div className="flex items-center" style={{ gap: 12, marginBottom: 4 }}>
                          <span style={{
                            fontSize: 14, fontWeight: 600,
                            color: isSelected ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1,
                          }} title={meta.displayTitle ? `${file.name}\n${meta.articleTitle}` : file.name}>
                            {meta.displayTitle || file.name}
                          </span>
                          <span
                            data-tooltip={cls.tooltip}
                            className="inline-flex items-center"
                            style={{
                              fontSize: 9, fontWeight: 700,
                              letterSpacing: '0.06em', textTransform: 'uppercase',
                              padding: '3px 10px', borderRadius: 4,
                              color: bc.color, background: bc.bg,
                              flexShrink: 0,
                            }}
                          >
                            {cls.label}
                          </span>
                        </div>

                        <div className="flex items-center" style={{ gap: 6 }}>
                          <span style={{
                            fontSize: 12,
                            color: 'var(--color-text-muted)',
                          }}>
                            {source}{source && pages !== '—' ? ' \u00A0\u00B7\u00A0 ' : ''}{pages !== '—' ? `${pages} pg` : ''}{(source || pages !== '—') && modified !== '—' ? ' \u00A0\u00B7\u00A0 ' : ''}{modified !== '—' ? modified : ''}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}

              {folders.length === 0 && files.length === 0 && (
                <div className="text-center py-20">
                  <Folder size={40} className="text-text-muted mx-auto mb-3" strokeWidth={1} />
                  <p className="text-text-secondary">This folder is empty</p>
                </div>
              )}

              {/* Infinite scroll sentinel */}
              {pagination?.hasMoreItems && (
                <div ref={sentinelRef} className="flex justify-center py-8">
                  {loadingMore && (
                    <div className="w-5 h-5 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                  )}
                </div>
              )}
              {pagination && !pagination.hasMoreItems && items.length > 100 && (
                <p className="mt-4 text-xs text-text-muted text-center">
                  {pagination.totalItems} items
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedDoc && <DocumentViewer document={selectedDoc} onClose={() => setSelectedDoc(null)} />}
      </AnimatePresence>
    </div>
  );
}
