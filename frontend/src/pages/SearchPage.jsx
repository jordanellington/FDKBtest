import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { search } from '../lib/api';
import DocumentViewer from '../components/DocumentViewer';
import { Search, FileText, Loader2, Sparkles, X, ChevronUp, ChevronDown } from 'lucide-react';
import { classifyDocument, extractMetadata } from '../lib/copyright';

const popularSearches = [
  'biosimilar interchangeability',
  'ANDA paragraph IV',
  'consent decree GMP',
  'gene therapy FDA guidance',
  'food labeling requirements',
  'clinical trial regulations',
  'opioid risk management',
  'market exclusivity',
];

export default function SearchPage() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [totalResults, setTotalResults] = useState(0);
  const [searchFocused, setSearchFocused] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [sortBy, setSortBy] = useState('relevance');
  const [sortAsc, setSortAsc] = useState(false);
  const sentinelRef = useRef(null);
  const scrollRef = useRef(null);
  const initializedRef = useRef(false);

  // Pick up query params from Dashboard navigation
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const q = searchParams.get('q');
    const exact = searchParams.get('exact') === 'true';
    if (q) {
      setQuery(q);
      setExactMatch(exact);
      // Trigger search after state is set
      setTimeout(() => handleSearch(q, exact), 0);
    }
  }, []);

  const handleSearch = async (q, exactOverride) => {
    const searchQuery = q || query;
    if (!searchQuery.trim()) return;
    setQuery(searchQuery);
    setLoading(true);
    setSelectedDoc(null);
    try {
      const isExact = exactOverride !== undefined ? exactOverride : exactMatch;
      const data = await search(searchQuery, 25, 0, isExact, sortBy, sortAsc);
      setResults(data.list?.entries?.map(e => e.entry) || []);
      setTotalResults(data.list?.pagination?.totalItems || 0);
      setHasMore(data.list?.pagination?.hasMoreItems || false);
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !results) return;
    setLoadingMore(true);
    try {
      const data = await search(query, 25, results.length, exactMatch, sortBy, sortAsc);
      const entries = data.list?.entries?.map(e => e.entry) || [];
      setResults(prev => [...prev, ...entries]);
      setHasMore(data.list?.pagination?.hasMoreItems || false);
    } catch (err) {
      console.error('Load more error:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [query, results?.length, loadingMore, hasMore, exactMatch, sortBy, sortAsc]);

  // Re-search when sort changes
  useEffect(() => {
    if (results && query) handleSearch();
  }, [sortBy, sortAsc]);

  useEffect(() => {
    if (!sentinelRef.current || !hasMore) return;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMore(); },
      { root: scrollRef.current, rootMargin: '200px' }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, results?.length, loadMore]);

  return (
    <div className="flex h-full overflow-hidden">
      <div ref={scrollRef} className="flex-1 overflow-y-auto min-w-0">
        <div className="max-w-[1100px]">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45 }}
            style={{ padding: results ? '24px 28px 0' : '44px 56px 0', marginBottom: results ? 16 : 32, transition: 'all 0.3s ease' }}
          >
            <h1
              className="font-display font-light text-white leading-[1.08] tracking-[-0.02em]"
              style={{ fontSize: results ? 24 : 42, marginBottom: results ? 6 : 10, transition: 'all 0.3s ease' }}
            >
              Search
            </h1>
            {!results && (
              <p className="text-text-muted text-[14px]">Search across the full FDKB document library</p>
            )}
          </motion.div>

          {/* Search Input */}
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.45 }}
            style={{ padding: results ? '0 28px 20px' : '0 56px 40px' }}
          >
            <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
              <div
                className="flex items-center cursor-text transition-all duration-200"
                style={{
                  gap: 14,
                  padding: '14px 16px 14px 20px',
                  borderRadius: 10,
                  background: searchFocused ? '#151c19' : '#121816',
                  border: `1px solid ${searchFocused ? 'rgba(77,184,164,0.25)' : 'rgba(255,255,255,0.06)'}`,
                  boxShadow: searchFocused ? '0 0 0 3px rgba(77,184,164,0.06), 0 4px 20px rgba(0,0,0,0.3)' : '0 2px 8px rgba(0,0,0,0.2)',
                }}
                onClick={() => document.getElementById('fdkb-search-input')?.focus()}
              >
                <Search
                  size={18}
                  className="shrink-0 transition-colors duration-200"
                  style={{ color: searchFocused ? '#4db8a4' : '#4a5955' }}
                  strokeWidth={2}
                />

                {/* Exact chip — inline filter, shown when active */}
                {exactMatch && (
                  <div
                    className="flex items-center shrink-0"
                    style={{
                      gap: 5,
                      padding: '3px 9px 3px 7px',
                      borderRadius: 5,
                      background: 'rgba(77,184,164,0.10)',
                      border: '1px solid rgba(77,184,164,0.20)',
                      animation: 'chipIn 0.15s ease',
                    }}
                  >
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4db8a4', letterSpacing: '0.02em', whiteSpace: 'nowrap' }}>
                      Exact
                    </span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExactMatch(false); }}
                      className="flex items-center justify-center p-0 transition-colors duration-100"
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        background: 'rgba(77,184,164,0.15)',
                        border: 'none', cursor: 'pointer', color: '#4db8a4',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(77,184,164,0.25)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(77,184,164,0.15)'}
                      title="Remove exact match filter"
                    >
                      <X size={8} strokeWidth={3} />
                    </button>
                  </div>
                )}

                <input
                  id="fdkb-search-input"
                  type="text"
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder="Search across 368,000+ documents by keyword, citation, or topic..."
                  className="flex-1 outline-none"
                  style={{ fontFamily: 'inherit', fontSize: 15, fontWeight: 400, color: '#e6eae8', letterSpacing: '-0.01em', minWidth: 0, background: 'none', backgroundColor: 'transparent', border: 'none', colorScheme: 'dark', WebkitAppearance: 'none', padding: 0 }}
                />

                {/* Right controls */}
                <div className="flex items-center shrink-0" style={{ gap: 8 }}>
                  {/* Exact toggle button */}
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setExactMatch(prev => !prev); }}
                    className="flex items-center transition-all duration-150"
                    style={{
                      gap: 5,
                      padding: '5px 10px',
                      borderRadius: 5,
                      background: exactMatch ? 'rgba(77,184,164,0.10)' : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${exactMatch ? 'rgba(77,184,164,0.20)' : 'rgba(255,255,255,0.06)'}`,
                      cursor: 'pointer',
                    }}
                    title="Toggle exact phrase matching"
                  >
                    {/* Quote marks icon */}
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                      style={{ color: exactMatch ? '#4db8a4' : '#5f706a', transition: 'color 0.15s ease' }}
                    >
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
                    </svg>
                    <span style={{ fontSize: 11, fontWeight: 600, color: exactMatch ? '#4db8a4' : '#5f706a', transition: 'color 0.15s ease', letterSpacing: '0.01em' }}>
                      Exact
                    </span>
                  </button>

                  {/* Divider */}
                  <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.06)' }} />

                  {/* Search button */}
                  <button
                    type="submit"
                    disabled={loading}
                    style={{
                      padding: '7px 18px', borderRadius: 6,
                      background: '#4db8a4', border: 'none', cursor: 'pointer',
                      fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                      color: '#0b0e0d', letterSpacing: '0.01em',
                      transition: 'all 0.15s ease',
                      opacity: loading ? 0.5 : 1,
                    }}
                  >
                    {loading ? <Loader2 size={15} className="animate-spin" /> : 'Search'}
                  </button>
                </div>
              </div>

              {/* Hint text */}
              <div style={{ marginTop: 10, padding: '0 20px', fontSize: 11, minHeight: 18 }}>
                {exactMatch ? (
                  <span style={{ color: '#4db8a4', fontWeight: 500 }}>
                    Searching for exact phrase: &ldquo;{query || '...'}&rdquo;
                  </span>
                ) : query.trim().includes(' ') ? (
                  <span style={{ color: '#3c4b46' }}>
                    Results will match all words in any order
                  </span>
                ) : null}
              </div>
            </form>
          </motion.div>

          {/* Pre-search state */}
          {!results && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1, duration: 0.45 }}
              style={{ padding: '0 56px 56px' }}
            >
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold" style={{ marginBottom: 16 }}>Popular Searches</p>
              <div className="flex flex-wrap gap-2" style={{ marginBottom: 40 }}>
                {popularSearches.map(term => (
                  <button
                    key={term}
                    onClick={() => handleSearch(term)}
                    className="px-3.5 py-2 rounded-lg text-[13px] text-text-secondary hover:text-white hover:border-white/10 transition-all duration-200 cursor-pointer"
                    style={{
                      background: 'rgba(255,255,255,0.04)',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}
                  >
                    {term}
                  </button>
                ))}
              </div>

              {/* AI Teaser */}
              <div
                className="flex items-center gap-6 rounded-xl py-5 px-7 relative overflow-hidden"
                style={{
                  background: 'rgba(200,164,78,0.04)',
                  borderLeft: '3px solid var(--color-accent-gold)',
                  border: '1px solid rgba(200,164,78,0.12)',
                  borderLeftWidth: 3,
                  borderLeftColor: 'var(--color-accent-gold)',
                }}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1.5">
                    <Sparkles size={15} style={{ color: 'var(--color-accent-gold)' }} />
                    <h3 className="font-display text-[16px] font-medium text-white">AI-Powered Search</h3>
                  </div>
                  <p className="text-text-secondary text-[13px] leading-relaxed">
                    Ask questions in plain English:
                    <span className="italic" style={{ color: 'var(--color-accent-gold)' }}> "What are the FDA's requirements for biosimilar interchangeability?"</span>
                    — and get a synthesized answer with citations.
                  </p>
                </div>
                <span
                  className="text-[9px] font-bold tracking-[0.12em] uppercase px-3 py-1 rounded shrink-0"
                  style={{ color: 'var(--color-accent-gold)', background: 'rgba(200,164,78,0.12)', border: '1px solid rgba(200,164,78,0.25)' }}
                >
                  Coming Soon
                </span>
              </div>
            </motion.div>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-7 h-7 border-2 border-accent/20 border-t-accent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-text-muted text-sm">Searching FDKB...</p>
              </div>
            </div>
          )}

          {/* Results */}
          {results && !loading && (
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              style={{ padding: '0 28px 40px' }}
            >
              {/* Results summary bar */}
              <div className="flex items-center justify-between" style={{ marginBottom: 12, padding: '0 4px' }}>
                <div>
                  <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                    Showing <em style={{ fontStyle: 'normal', color: 'var(--color-accent)', fontWeight: 600 }}>{results.length.toLocaleString()}</em> of{' '}
                    <strong style={{ fontWeight: 600, color: 'var(--color-text-primary)' }}>{totalResults.toLocaleString()}</strong> results
                  </span>
                  {exactMatch && query && (
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', marginLeft: 8 }}>
                      for &ldquo;{query}&rdquo;
                    </span>
                  )}
                </div>
                <div className="flex items-center" style={{ gap: 4 }}>
                  {['Relevance', 'Date', 'Size'].map(s => {
                    const key = s.toLowerCase();
                    const isActive = sortBy === key;
                    return (
                      <button
                        key={s}
                        onClick={() => {
                          if (isActive) {
                            setSortAsc(prev => !prev);
                          } else {
                            setSortBy(key);
                            setSortAsc(key === 'relevance' ? false : false);
                          }
                        }}
                        className="flex items-center"
                        style={{
                          gap: 3,
                          padding: '4px 10px',
                          borderRadius: 4,
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: 10,
                          fontWeight: 500,
                          fontFamily: 'inherit',
                          background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
                          color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-muted)',
                          transition: 'all 0.1s',
                        }}
                      >
                        {s}
                        {isActive && key !== 'relevance' && (
                          sortAsc
                            ? <ChevronUp size={10} strokeWidth={2.5} />
                            : <ChevronDown size={10} strokeWidth={2.5} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              {results.length > 0 ? (
                <>
                <div>
                  {results.map((doc, i) => {
                    const meta = extractMetadata(doc);
                    const pages = doc.properties?.['eci:pages'] || '—';
                    const size = doc.content?.sizeInBytes
                      ? doc.content.sizeInBytes >= 1048576
                        ? (doc.content.sizeInBytes / 1048576).toFixed(2) + ' MB'
                        : (doc.content.sizeInBytes / 1024).toFixed(0) + ' KB'
                      : '—';
                    const modified = doc.modifiedAt ? new Date(doc.modifiedAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '—';
                    const cls = classifyDocument(doc);
                    const isSelected = selectedDoc?.id === doc.id;
                    const badgeConfig = {
                      green: { color: '#4db8a4', bg: 'rgba(77,184,164,0.07)' },
                      amber: { color: '#6ba3e8', bg: 'rgba(107,163,232,0.07)' },
                      red:   { color: '#e8836e', bg: 'rgba(232,131,110,0.07)' },
                    };
                    const bc = badgeConfig[cls.color] || badgeConfig.red;

                    return (
                      <motion.div
                        key={doc.id + '-' + i}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.01 }}
                        onClick={() => setSelectedDoc(doc)}
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
                        {/* Selected accent bar */}
                        {isSelected && (
                          <div style={{
                            position: 'absolute', left: 0, top: 8, bottom: 8,
                            width: 3, borderRadius: 2, background: 'var(--color-accent)',
                          }} />
                        )}

                        {/* Top line: icon + name + meta */}
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
                            {doc.name}
                          </span>
                          <div style={{ flex: 1 }} />
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{pages} pg</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 54, textAlign: 'right' }}>{size}</span>
                          <span style={{ fontSize: 11, color: 'var(--color-text-muted)', fontVariantNumeric: 'tabular-nums', minWidth: 60, textAlign: 'right' }}>{modified}</span>
                        </div>

                        {/* Bottom line: publisher + status badge (right) */}
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
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: '0.06em',
                              textTransform: 'uppercase',
                              padding: '3px 10px',
                              borderRadius: 4,
                              color: bc.color,
                              background: bc.bg,
                              flexShrink: 0,
                              marginLeft: 'auto',
                            }}
                          >
                            {cls.label}
                          </span>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
                {hasMore && (
                  <div ref={sentinelRef} className="flex items-center justify-center py-6">
                    {loadingMore && (
                      <div className="flex items-center gap-2 text-text-muted text-xs">
                        <div className="w-4 h-4 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
                        Loading more results...
                      </div>
                    )}
                  </div>
                )}
                </>
              ) : (
                <div className="text-center py-20">
                  <Search size={40} className="text-text-muted mx-auto mb-3" strokeWidth={1} />
                  <p className="text-text-secondary">No documents found</p>
                  <p className="text-text-muted text-[13px] mt-1">Try adjusting your search terms</p>
                </div>
              )}
            </motion.div>
          )}
        </div>
      </div>

      <AnimatePresence>
        {selectedDoc && <DocumentViewer document={selectedDoc} searchQuery={query} onClose={() => setSelectedDoc(null)} />}
      </AnimatePresence>
    </div>
  );
}
