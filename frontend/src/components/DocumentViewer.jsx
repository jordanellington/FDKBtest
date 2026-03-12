import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Download, FileText, Shield, ExternalLink, Sparkles, Search, Mail } from 'lucide-react';
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

function formatDateStr(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d)) return null;
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

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
      data-tooltip={classification.tooltip}
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
      style={{ color: c.color, background: c.bg, border: `1px solid ${c.border}` }}
    >
      <Shield size={11} />
      {classification.label}
    </span>
  );
}

function PdfViewer({ fileUrl, searchQuery }) {
  // searchQuery can be a string (legacy) or array of strings (AI highlight terms)
  const firstKeyword = Array.isArray(searchQuery) ? searchQuery[0] : searchQuery;
  const toolbarPluginInstance = toolbarPlugin();
  const searchPluginInstance = searchPlugin(firstKeyword ? { keyword: firstKeyword } : undefined);
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
    const terms = Array.isArray(searchQuery) ? searchQuery : [searchQuery];
    const timer = setTimeout(() => {
      highlightDone.current = true;
      // highlight() accepts SingleKeyword[] — highlight all terms at once
      searchPluginRef.current.highlight(terms).then((matches) => {
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
  const [chatOpen, setChatOpen] = useState(false);

  if (!doc) return null;

  // Extract CCC metadata — use pre-set fields (from chat sources) or derive from Alfresco properties
  const meta = extractMetadata(doc);
  const displayTitle = doc.displayTitle || meta.displayTitle || null;
  const pubTitle = doc.publicationTitle || meta.publicationTitle || meta.publisher || null;
  const pubDate = doc.publicationDate || meta.publicationDate || null;

  const contentUrl = getContentUrl(doc.id);
  const isPdf = doc?.name?.toLowerCase().endsWith('.pdf');

  const classification = classifyDocument(doc);

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
          <FileText size={15} style={{ color: 'var(--color-accent)', marginTop: 2 }} className="shrink-0 self-start" strokeWidth={1.5} />
          <div className="min-w-0">
            <h2 className="text-[14px] font-semibold truncate" style={{ fontFamily: 'var(--font-display)' }}>
              {displayTitle && displayTitle !== doc.name ? displayTitle : doc.name}
            </h2>
            {(pubTitle || pubDate) && (
              <p className="text-[11px] truncate" style={{ color: 'var(--color-text-muted)', marginTop: 1 }}>
                {[pubTitle, pubDate ? formatDateStr(pubDate) : null].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
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

      {/* Action bar */}
      <div style={{
        background: 'var(--color-bg-elevated)',
        borderTop: '1px solid var(--color-border)',
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
      }} className="shrink-0">
        <div className="viewer-meta-bar flex items-center justify-center" style={{ padding: '8px 12px', gap: 8 }}>
          {isPdf && !chatOpen && (
            <button
              onClick={() => setChatOpen(true)}
              title="Chat with document"
              className="ask-ai-btn shrink-0 inline-flex items-center gap-1.5 text-[11px] font-semibold transition-all"
              style={{
                padding: '6px 14px',
                borderRadius: 999,
                color: '#fff',
                background: 'linear-gradient(135deg, #459e8c, #56BFA8)',
                border: 'none',
                boxShadow: '0 1px 4px rgba(86,191,168,0.3)',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              <Sparkles size={12} />
              Ask AI
            </button>
          )}
          <button
            onClick={() => {}}
            title="Email this document"
            className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              cursor: 'pointer',
            }}
          >
            <Mail size={12} />
            Email Me
          </button>
          <a
            href={getContentUrl(doc.id, true)}
            download={doc.name}
            className="inline-flex items-center gap-1.5 text-[11px] font-medium transition-colors"
            style={{
              padding: '5px 12px',
              borderRadius: 8,
              color: 'var(--color-text-secondary)',
              border: '1px solid var(--color-border)',
              background: 'transparent',
              boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
              textDecoration: 'none',
            }}
          >
            <Download size={12} />
            Download
          </a>
        </div>
      </div>
    </motion.div>
  );
}
