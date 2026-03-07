import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { getChildren, getNode } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';
import { Folder, FileText, ChevronRight, Home, ArrowLeft, Layers } from 'lucide-react';
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
          {i === visible.length - 1 ? (
            <span className="text-white font-semibold text-[15px]">{el.name}</span>
          ) : (
            <button onClick={() => onNavigate(el.id)} className="text-text-muted hover:text-accent transition-colors">{el.name}</button>
          )}
        </span>
      ))}
    </div>
  );
}

const BADGE_CONFIG = {
  green: { color: '#4db8a4', bg: 'rgba(77,184,164,0.07)' },
  amber: { color: '#6ba3e8', bg: 'rgba(107,163,232,0.07)' },
  red:   { color: '#e8836e', bg: 'rgba(232,131,110,0.07)' },
};

export default function Browser() {
  const { nodeId } = useParams();
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [currentNode, setCurrentNode] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [pagination, setPagination] = useState(null);
  const [hoveredArea, setHoveredArea] = useState(null);
  const [hoveredCol, setHoveredCol] = useState(null);
  const currentId = nodeId || 'root';
  const isRoot = currentId === 'root';

  useEffect(() => {
    async function load() {
      setLoading(true);
      setSelectedDoc(null);
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
              className="px-4 pt-8 mb-6 sm:px-8 sm:pt-10 md:px-14 md:pt-11 md:mb-8"
            >
              <h1 className="font-display text-[28px] sm:text-[36px] md:text-[42px] font-light text-white leading-[1.08] tracking-[-0.02em]" style={{ marginBottom: 10 }}>
                Documents
              </h1>
              <p className="text-text-muted text-[14px]">Browse the complete FDKB document library</p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex items-center gap-3 px-4 pt-4 mb-4 sm:px-8 md:px-14 md:pt-5 md:mb-5"
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
                  className="px-4 pb-10 sm:px-8 md:px-14 md:pb-14"
                >
                  <div className="flex items-baseline justify-between" style={{ marginBottom: 20 }}>
                    <h2 className="font-display text-[24px] font-normal text-white">Subject Areas</h2>
                    <span className="text-[11px] font-medium text-text-muted">{numbered.length} areas</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5">
                    {numbered.map(folder => {
                      const num = folder.name.match(/^[\d.]+/)?.[0] || '';
                      const title = folder.name.replace(/^[\d.]+ /, '');
                      const h = hoveredArea === folder.id;
                      return (
                        <div
                          key={folder.id}
                          onMouseEnter={() => setHoveredArea(folder.id)}
                          onMouseLeave={() => setHoveredArea(null)}
                          onClick={() => handleNavigate(folder.id)}
                          className="flex items-center gap-3 px-4 py-3.5 rounded-lg cursor-pointer transition-all duration-200"
                          style={{
                            background: h ? 'var(--color-bg-hover)' : 'var(--color-bg-secondary)',
                            boxShadow: h ? 'var(--shadow-md)' : 'var(--shadow-card)',
                            border: `1px solid ${h ? 'rgba(255,255,255,0.11)' : 'rgba(255,255,255,0.04)'}`,
                            transform: h ? 'translateY(-1px)' : 'none',
                          }}
                        >
                          <span
                            className="text-[11px] font-bold min-w-[22px] tracking-[0.02em] transition-colors duration-200"
                            style={{ color: h ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                          >{num}</span>
                          <span
                            className="text-[13px] font-medium leading-snug transition-colors duration-150"
                            style={{ color: h ? '#fff' : 'var(--color-text-primary)' }}
                          >{title}</span>
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
                  className="px-4 pb-14 sm:px-8 md:px-14 md:pb-20"
                >
                  <h2 className="font-display text-[24px] font-normal text-white" style={{ marginBottom: 20 }}>Special Collections</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8">
                    {special.map((f, i) => {
                      const h = hoveredCol === i;
                      return (
                        <div
                          key={f.id}
                          onMouseEnter={() => setHoveredCol(i)}
                          onMouseLeave={() => setHoveredCol(null)}
                          onClick={() => handleNavigate(f.id)}
                          className="py-2.5 border-b border-border cursor-pointer"
                        >
                          <span
                            className="text-[13px] transition-colors duration-150"
                            style={{ color: h ? 'var(--color-accent-bright)' : 'var(--color-text-secondary)' }}
                          >{f.name}</span>
                        </div>
                      );
                    })}
                  </div>
                </motion.div>
              )}
            </>
          ) : (
            /* Sub-folder level */
            <div className="px-4 pb-10 sm:px-8 md:px-14 md:pb-14">
              {/* Folders */}
              {folders.length > 0 && (
                <div className="mb-10">
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold" style={{ marginBottom: 20 }}>
                    Folders ({folders.length})
                  </p>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-1.5">
                    {folders.map((folder, i) => (
                      <motion.div
                        key={folder.id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.015 }}
                        onClick={() => handleNavigate(folder.id)}
                        className="bg-bg-secondary rounded-lg px-4 py-3.5 cursor-pointer hover:bg-bg-elevated transition-all group flex items-center gap-3"
                        style={{ boxShadow: 'var(--shadow-card)', border: '1px solid rgba(255,255,255,0.04)' }}
                      >
                        <Folder size={15} className="text-accent/50 group-hover:text-accent transition-colors shrink-0" strokeWidth={1.5} />
                        <span className="text-[13px] text-text-secondary group-hover:text-text-primary transition-colors truncate">
                          {folder.name}
                        </span>
                        <ChevronRight size={12} className="text-text-muted/0 group-hover:text-text-muted/60 transition-all ml-auto shrink-0" />
                      </motion.div>
                    ))}
                  </div>
                </div>
              )}

              {/* Files */}
              {files.length > 0 && (
                <div>
                  <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold" style={{ marginBottom: 16 }}>
                    Documents ({files.length})
                  </p>
                  <div>
                    {files.map((file, i) => {
                      const meta = extractMetadata(file);
                      const pages = file.properties?.['eci:pages'] || '—';
                      const size = file.content?.sizeInBytes
                        ? file.content.sizeInBytes >= 1048576
                          ? (file.content.sizeInBytes / 1048576).toFixed(2) + ' MB'
                          : (file.content.sizeInBytes / 1024).toFixed(0) + ' KB'
                        : '—';
                      const modified = file.modifiedAt ? new Date(file.modifiedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                      const cls = classifyDocument(file);
                      const bc = BADGE_CONFIG[cls.color] || BADGE_CONFIG.red;
                      const isSelected = selectedDoc?.id === file.id;

                      return (
                        <motion.div
                          key={file.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: i * 0.01 }}
                          onClick={() => setSelectedDoc(file)}
                          style={{
                            padding: '12px 16px',
                            borderRadius: 8,
                            marginBottom: 4,
                            cursor: 'pointer',
                            border: isSelected ? '1px solid rgba(255,255,255,0.07)' : '1px solid transparent',
                            background: isSelected ? 'var(--color-bg-elevated)' : 'transparent',
                            transition: 'all 0.12s ease',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => { if (!isSelected) e.currentTarget.style.background = 'var(--color-bg-secondary)'; }}
                          onMouseLeave={(e) => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                        >
                          {isSelected && (
                            <div style={{
                              position: 'absolute', left: 0, top: 8, bottom: 8,
                              width: 3, borderRadius: 2, background: 'var(--color-accent)',
                            }} />
                          )}

                          <div className="flex items-center" style={{ gap: 10, marginBottom: 5 }}>
                            <FileText
                              size={13}
                              className="shrink-0"
                              style={{ color: isSelected ? 'var(--color-accent)' : 'var(--color-text-muted)' }}
                              strokeWidth={1.5}
                            />
                            <span style={{
                              fontSize: 13, fontWeight: 600,
                              color: isSelected ? '#fff' : 'var(--color-text-secondary)',
                            }}>
                              {file.name}
                            </span>
                            <div style={{ flex: 1 }} />
                            <span className="hidden sm:inline" style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pages} pg</span>
                            <span className="hidden md:inline" style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 54, textAlign: 'right' }}>{size}</span>
                            <span className="hidden sm:inline" style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>{modified}</span>
                          </div>

                          <div className="flex items-center" style={{ paddingLeft: 23, gap: 10 }}>
                            <span style={{
                              fontSize: 11,
                              color: isSelected ? 'var(--color-text-secondary)' : 'var(--color-text-muted)',
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              minWidth: 0,
                              flex: 1,
                            }}>
                              {meta.publisher}
                            </span>
                            <span
                              title={cls.tooltip}
                              className="inline-flex items-center"
                              style={{
                                fontSize: 9, fontWeight: 700,
                                letterSpacing: '0.06em', textTransform: 'uppercase',
                                padding: '3px 10px', borderRadius: 4,
                                color: bc.color, background: bc.bg,
                                flexShrink: 0, marginLeft: 'auto',
                              }}
                            >
                              {cls.label}
                            </span>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                </div>
              )}

              {folders.length === 0 && files.length === 0 && (
                <div className="text-center py-20">
                  <Folder size={40} className="text-text-muted mx-auto mb-3" strokeWidth={1} />
                  <p className="text-text-secondary">This folder is empty</p>
                </div>
              )}

              {pagination && (
                <p className="mt-4 text-xs text-text-muted text-center">
                  Showing {items.length} of {pagination.totalItems} items
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
