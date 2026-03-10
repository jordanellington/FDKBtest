import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Download, FileText, Calendar, Layers, Shield, ExternalLink, User, ChevronDown, ChevronUp, Sparkles, Search } from 'lucide-react';
import { classifyDocument, extractMetadata } from '../lib/copyright';
import { getContentUrl } from '../lib/api';

import { Worker, Viewer } from '@react-pdf-viewer/core';
import { toolbarPlugin } from '@react-pdf-viewer/toolbar';
import { searchPlugin } from '@react-pdf-viewer/search';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/toolbar/lib/styles/index.css';
import '@react-pdf-viewer/search/lib/styles/index.css';

import AIChatPanel from './AIChatPanel';

const WORKER_URL = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString();

function DistributionBadge({ classification }) {
  const config = {
    green: { color: '#4db8a4', bg: 'rgba(77,184,164,0.10)', border: 'rgba(77,184,164,0.20)' },
    amber: { color: '#c8a44e', bg: 'rgba(200,164,78,0.10)', border: 'rgba(200,164,78,0.20)' },
    blue:  { color: '#6ba3e8', bg: 'rgba(107,163,232,0.10)', border: 'rgba(107,163,232,0.20)' },
    red:   { color: '#C75B5B', bg: 'rgba(199,91,91,0.10)', border: 'rgba(199,91,91,0.20)' },
  };
  const c = config[classification.color] || config.red;

  return (
    <span
      title={classification.tooltip}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}
    >
      <Shield size={11} />
      {classification.label}
    </span>
  );
}

function PdfViewer({ fileUrl, searchQuery }) {
  const toolbarPluginInstance = toolbarPlugin();
  const searchPluginInstance = searchPlugin(searchQuery ? { keyword: searchQuery } : undefined);
  const { Toolbar } = toolbarPluginInstance;
  const { ShowSearchPopover } = searchPluginInstance;

  const searchPluginRef = useRef(searchPluginInstance);
  searchPluginRef.current = searchPluginInstance;
  const highlightDone = useRef(false);

  useEffect(() => {
    highlightDone.current = false;
  }, [fileUrl]);

  useEffect(() => {
    if (!searchQuery || highlightDone.current) return;
    const timer = setTimeout(() => {
      highlightDone.current = true;
      searchPluginRef.current.highlight(searchQuery).then((matches) => {
        if (matches.length > 0) {
          searchPluginRef.current.jumpToMatch(1);
        }
      }).catch(() => {});
    }, 2000);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  return (
    <Worker workerUrl={WORKER_URL}>
      <div className="h-full flex flex-col rpv-dark-theme" style={{ backgroundColor: 'var(--color-bg-elevated)' }}>
        {/* Custom toolbar */}
        <div
          className="viewer-toolbar shrink-0 flex items-center justify-between"
          style={{
            padding: '6px 12px',
            background: 'var(--color-bg-secondary)',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}
        >
          <Toolbar>
            {(props) => {
              const {
                CurrentPageInput,
                GoToNextPage,
                GoToPreviousPage,
                NumberOfPages,
                ZoomIn,
                ZoomOut,
                Zoom,
              } = props;
              return (
                <div className="flex items-center gap-1 w-full" style={{ fontSize: 12 }}>
                  {/* Page navigation */}
                  <div className="flex items-center gap-1">
                    <GoToPreviousPage>
                      {(props) => (
                        <button
                          onClick={props.onClick}
                          disabled={props.isDisabled}
                          style={{
                            background: 'none', border: 'none', cursor: props.isDisabled ? 'default' : 'pointer',
                            color: props.isDisabled ? '#3c4b46' : '#9aa69f', padding: '4px 6px', borderRadius: 4,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          ‹
                        </button>
                      )}
                    </GoToPreviousPage>
                    <div className="flex items-center gap-1" style={{ color: '#9aa69f' }}>
                      <CurrentPageInput />
                      <span style={{ color: '#5f706a' }}>/</span>
                      <NumberOfPages />
                    </div>
                    <GoToNextPage>
                      {(props) => (
                        <button
                          onClick={props.onClick}
                          disabled={props.isDisabled}
                          style={{
                            background: 'none', border: 'none', cursor: props.isDisabled ? 'default' : 'pointer',
                            color: props.isDisabled ? '#3c4b46' : '#9aa69f', padding: '4px 6px', borderRadius: 4,
                            display: 'flex', alignItems: 'center',
                          }}
                        >
                          ›
                        </button>
                      )}
                    </GoToNextPage>
                  </div>

                  {/* Spacer */}
                  <div style={{ flex: 1 }} />

                  {/* Search */}
                  <ShowSearchPopover>
                    {(props) => (
                      <button
                        onClick={props.onClick}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          color: '#9aa69f', padding: '4px 6px', borderRadius: 4,
                          display: 'flex', alignItems: 'center',
                        }}
                      >
                        <Search size={13} />
                      </button>
                    )}
                  </ShowSearchPopover>

                  {/* Zoom */}
                  <div className="flex items-center gap-1">
                    <ZoomOut>
                      {(props) => (
                        <button
                          onClick={props.onClick}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#9aa69f', padding: '4px 8px', borderRadius: 4, fontSize: 14,
                          }}
                        >
                          −
                        </button>
                      )}
                    </ZoomOut>
                    <Zoom>
                      {(props) => (
                        <span style={{ color: '#9aa69f', fontSize: 11, minWidth: 40, textAlign: 'center' }}>
                          {Math.round(props.scale * 100)}%
                        </span>
                      )}
                    </Zoom>
                    <ZoomIn>
                      {(props) => (
                        <button
                          onClick={props.onClick}
                          style={{
                            background: 'none', border: 'none', cursor: 'pointer',
                            color: '#9aa69f', padding: '4px 8px', borderRadius: 4, fontSize: 14,
                          }}
                        >
                          +
                        </button>
                      )}
                    </ZoomIn>
                  </div>
                </div>
              );
            }}
          </Toolbar>
        </div>

        {/* PDF pages */}
        <div className="flex-1 min-h-0" style={{ background: '#3a3d41' }}>
          <Viewer
            fileUrl={fileUrl}
            plugins={[toolbarPluginInstance, searchPluginInstance]}
            theme="dark"
          />
        </div>
      </div>
    </Worker>
  );
}

export default function DocumentViewer({ document: doc, searchQuery, onClose, fillContainer }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);

  if (!doc) return null;

  const contentUrl = getContentUrl(doc.id);
  const isPdf = doc?.name?.toLowerCase().endsWith('.pdf');

  const path = doc.path?.name?.replace('/Company Home/Sites/FDKB-staging/documentlibrary/', '') || '';
  const pages = doc.properties?.['eci:pages'] || '—';
  const size = doc.content?.sizeInBytes
    ? (doc.content.sizeInBytes / 1024 / 1024).toFixed(2) + ' MB'
    : '—';
  const classification = classifyDocument(doc);
  const meta = extractMetadata(doc);

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      className="document-viewer-panel flex flex-col h-full"
      style={fillContainer ? {
        width: '100%',
        height: '100%',
        background: 'var(--color-bg-secondary)',
        borderLeft: 'none',
      } : {
        width: chatOpen ? '70vw' : 728,
        maxWidth: chatOpen ? '75%' : '50%',
        minWidth: 340,
        flex: '0 1 auto',
        background: 'var(--color-bg-secondary)',
        borderLeft: 'none',
        transition: 'width 0.3s ease, max-width 0.3s ease',
      }}
    >
      {/* Header */}
      <div
        className="viewer-header flex items-center justify-between gap-3 shrink-0"
        style={{
          padding: '12px 16px',
          background: 'var(--color-bg-elevated)',
          borderBottom: '1px solid var(--color-border)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <FileText size={15} style={{ color: 'var(--color-accent)' }} className="shrink-0" strokeWidth={1.5} />
          <h2 className="text-[14px] font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>{doc.name}</h2>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <DistributionBadge classification={classification} />
          <button
            onClick={onClose}
            className="p-1.5 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Document Preview + Chat */}
      <div className={`flex-1 min-h-0 flex ${chatOpen ? 'flex-row' : 'flex-col'}`}>
        {/* PDF / Document area */}
        <div
          className="min-h-0 overflow-hidden"
          style={{ flex: '1 1 0%' }}
        >
          {isPdf ? (
            <PdfViewer fileUrl={contentUrl} searchQuery={searchQuery} />
          ) : (
            <div className="flex items-center justify-center h-full p-6" style={{ background: '#3a3d41' }}>
              <div className="text-center">
                <FileText size={40} className="text-text-muted mx-auto mb-4" strokeWidth={1} />
                <p className="text-text-muted text-sm mb-4">{doc.content?.mimeType || 'Document'}</p>
                <a
                  href={contentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2 bg-accent text-text-on-dark rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
                >
                  <ExternalLink size={14} />
                  Open File
                </a>
              </div>
            </div>
          )}
        </div>

        {/* AI Chat Right Column */}
        {chatOpen && (
          <div
            style={{
              width: '35%',
              minWidth: 280,
              borderLeft: 'none',
              minHeight: 0,
            }}
          >
            <AIChatPanel doc={doc} onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>

      {/* Compact metadata bar + expandable details */}
      <div style={{
        background: 'var(--color-bg-elevated)',
        borderTop: '1px solid var(--color-border)',
      }} className="shrink-0">
        <div className="viewer-meta-bar flex items-center gap-5 text-[11px] text-text-secondary" style={{ padding: '10px 12px 10px 16px' }}>
          <span className="flex items-center gap-1.5">
            <User size={10} className="text-text-muted" />
            {meta.author}
          </span>
          <span className="flex items-center gap-1.5">
            <Calendar size={10} className="text-text-muted" />
            {meta.date}
          </span>
          <span className="flex items-center gap-1.5">
            <Layers size={10} className="text-text-muted" />
            {pages} pg
          </span>
          <span className="text-text-muted">{size}</span>
          <a
            href={getContentUrl(doc.id, true)}
            download={doc.name}
            className="inline-flex items-center gap-1.5 px-3 py-1 bg-accent text-text-on-dark rounded-md text-[10px] font-semibold hover:bg-accent-hover transition-colors"
          >
            <Download size={11} />
            Download
          </a>
          <button
            onClick={() => setDetailsOpen(!detailsOpen)}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title={detailsOpen ? 'Hide details' : 'Show details'}
          >
            {detailsOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
          </button>
          {isPdf && (
            <button
              onClick={() => setChatOpen(!chatOpen)}
              title={chatOpen ? 'Close AI chat' : 'Chat with document'}
              className="ml-auto shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold transition-all"
              style={{
                background: chatOpen ? 'rgba(200,164,78,0.15)' : 'rgba(255,255,255,0.04)',
                color: chatOpen ? 'var(--color-accent-gold)' : 'var(--color-text-secondary)',
                border: chatOpen ? '1px solid var(--color-border-gold)' : '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <Sparkles size={11} />
              Ask AI
              {chatOpen ? <ChevronDown size={10} /> : <ChevronUp size={10} />}
            </button>
          )}
        </div>

        {detailsOpen && (
          <div style={{ padding: '4px 16px 14px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
            {/* Article title if CCC-enriched */}
            {meta.articleTitle && (
              <div style={{ marginBottom: 10 }}>
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Article Title</p>
                <p className="text-[12px] text-text-primary font-medium leading-snug">{meta.articleTitle}</p>
              </div>
            )}
            <div className="details-grid grid grid-cols-3 gap-3">
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">{meta.publicationTitle ? 'Publication' : 'Topic'}</p>
                <p className="text-[11px] text-text-secondary">{meta.publicationTitle || meta.topic}</p>
              </div>
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Publisher</p>
                <p className="text-[11px] text-text-secondary">{meta.publisher}</p>
              </div>
              <div>
                <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Distribution</p>
                <p className="text-[11px] text-text-secondary">{classification.tooltip?.split('\n')[0]}</p>
              </div>
            </div>
            {/* Extra CCC fields */}
            {meta.cccEnriched && (
              <div className="details-grid grid grid-cols-3 gap-3" style={{ marginTop: 8 }}>
                {meta.issn && (
                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">ISSN</p>
                    <p className="text-[11px] text-text-secondary">{meta.issn}</p>
                  </div>
                )}
                {meta.copyrightHolder && (
                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Copyright</p>
                    <p className="text-[11px] text-text-secondary">{meta.copyrightHolder}</p>
                  </div>
                )}
                {meta.publicationDate && (
                  <div>
                    <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Published</p>
                    <p className="text-[11px] text-text-secondary">{meta.publicationDate}</p>
                  </div>
                )}
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <p className="text-[9px] text-text-muted uppercase tracking-wider mb-1">Path</p>
              <p className="text-[10px] text-text-muted bg-bg-elevated rounded-md p-2 break-all leading-relaxed">{path || '—'}</p>
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}
