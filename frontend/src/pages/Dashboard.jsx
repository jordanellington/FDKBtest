import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { getStats, getChildren } from '../lib/api';
import { Search, X, Loader2 } from 'lucide-react';

function Counter({ target, duration = 1400 }) {
  const [count, setCount] = useState(0);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const t0 = performance.now();
    const tick = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      setCount(Math.floor((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return <>{count.toLocaleString()}</>;
}

function zeroPad(numStr) {
  const n = parseInt(numStr, 10);
  return isNaN(n) ? numStr : String(n).padStart(2, '0');
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [exactMatch, setExactMatch] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    async function load() {
      try {
        const [s, c] = await Promise.all([
          getStats(),
          getChildren('root', { foldersOnly: true }),
        ]);
        setStats(s);
        setFolders(c.list?.entries?.map(e => e.entry) || []);
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <div className="w-7 h-7 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />
          <p className="text-text-muted text-sm">Loading knowledge base...</p>
        </div>
      </div>
    );
  }

  const numbered = folders
    .filter(f => /^\d/.test(f.name))
    .sort((a, b) =>
      parseFloat(a.name.match(/^[\d.]+/)?.[0] || '0') -
      parseFloat(b.name.match(/^[\d.]+/)?.[0] || '0')
    );
  const special = folders.filter(f => !/^\d/.test(f.name));

  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) { navigate('/search'); return; }
    const params = new URLSearchParams({ q: searchQuery });
    if (exactMatch) params.set('exact', 'true');
    navigate(`/search?${params.toString()}`);
  };

  const totalDocs = stats?.totalDocuments || 368261;

  return (
    <div>
      {/* Title + Ticker Stats — padding: 44px 56px 0 */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{ padding: '44px 56px 0' }}
      >
        <h1 className="font-display text-[42px] font-light text-white leading-[1.08] tracking-[-0.02em]"
          style={{ marginBottom: 10 }}>
          Food &amp; Drug Knowledge Base
        </h1>
        <p className="text-text-muted text-[14px]" style={{ marginBottom: 28 }}>
          Selected practice materials, 1947 to present
        </p>

        {/* Bloomberg-style ticker */}
        <div className="flex items-baseline" style={{ gap: 48, paddingBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span className="font-display text-[28px] font-light text-accent-bright leading-none">
              <Counter target={totalDocs} />
            </span>
            <span className="text-[10px] font-semibold tracking-[0.1em] text-text-muted">DOCUMENTS</span>
          </div>
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span className="font-display text-[28px] font-light text-accent-bright leading-none">
              {stats?.practiceAreas || numbered.length || 22}
            </span>
            <span className="text-[10px] font-semibold tracking-[0.1em] text-text-muted">SUBJECT AREAS</span>
          </div>
          <div className="flex items-baseline" style={{ gap: 10 }}>
            <span className="font-display text-[28px] font-light text-accent-bright leading-none">
              {stats?.yearRange || '1947 – Present'}
            </span>
            <span className="text-[10px] font-semibold tracking-[0.1em] text-text-muted">COVERAGE</span>
          </div>
        </div>
      </motion.div>

      {/* Hero Search — padding: 36px 56px 40px */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.45 }}
        style={{ padding: '36px 56px 40px' }}
      >
        <form onSubmit={handleSearch}>
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
            onClick={() => document.getElementById('dashboard-search-input')?.focus()}
          >
            <Search
              size={18}
              className="shrink-0 transition-colors duration-200"
              style={{ color: searchFocused ? '#4db8a4' : '#4a5955' }}
              strokeWidth={2}
            />

            {/* Exact chip */}
            {exactMatch && (
              <div
                className="flex items-center shrink-0"
                style={{
                  gap: 5,
                  padding: '3px 9px 3px 7px',
                  borderRadius: 5,
                  background: 'rgba(77,184,164,0.10)',
                  border: '1px solid rgba(77,184,164,0.20)',
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
              id="dashboard-search-input"
              type="text"
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
              placeholder={`Search across ${totalDocs.toLocaleString()} documents by keyword, citation, or topic...`}
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
                style={{
                  padding: '7px 18px', borderRadius: 6,
                  background: '#4db8a4', border: 'none', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: 13, fontWeight: 600,
                  color: '#0b0e0d', letterSpacing: '0.01em',
                  transition: 'all 0.15s ease',
                }}
              >
                Search
              </button>
            </div>
          </div>

          {/* Hint text */}
          <div style={{ marginTop: 10, padding: '0 20px', fontSize: 11, minHeight: 18 }}>
            {exactMatch ? (
              <span style={{ color: '#4db8a4', fontWeight: 500 }}>
                Searching for exact phrase: &ldquo;{searchQuery || '...'}&rdquo;
              </span>
            ) : searchQuery.trim().includes(' ') ? (
              <span style={{ color: '#3c4b46' }}>
                Results will match all words in any order
              </span>
            ) : null}
          </div>
        </form>
      </motion.div>

      {/* AI Research Assistant — padding: 0 56px 40px */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.45 }}
        style={{ padding: '0 56px 40px' }}
      >
        <div
          className="flex items-center relative overflow-hidden cursor-pointer"
          style={{
            gap: 24,
            padding: '22px 28px',
            background: '#151c19',
            borderRadius: 12,
            borderLeft: '4px solid #c8a44e',
            boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
          }}
        >
          {/* Gold gradient wash */}
          <div
            className="absolute left-0 top-0 bottom-0 pointer-events-none"
            style={{ width: 120, background: 'linear-gradient(90deg, rgba(200,164,78,0.06), transparent)' }}
          />
          <div className="relative flex-1">
            <h3 className="font-display text-[18px] font-normal text-white" style={{ marginBottom: 4 }}>
              AI Research Assistant
            </h3>
            <p className="text-text-secondary text-[13px] leading-relaxed">
              Ask questions in natural language across all {totalDocs.toLocaleString()} documents. Get synthesized answers with citations.
            </p>
          </div>
          <span className="text-[10px] font-bold tracking-[0.12em] uppercase shrink-0"
            style={{ color: '#c8a44e', padding: '6px 14px', borderRadius: 6, background: 'rgba(200,164,78,0.12)', border: '1px solid rgba(200,164,78,0.3)' }}>
            Coming Soon
          </span>
        </div>
      </motion.div>

      {/* Subject Areas — padding: 0 56px 56px, grid gap: 6px */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.45 }}
        style={{ padding: '0 56px 56px' }}
      >
        <div className="flex items-baseline justify-between" style={{ marginBottom: 20 }}>
          <h2 className="font-display text-[24px] font-normal text-white">Subject Areas</h2>
          <span className="text-[11px] font-medium text-text-muted">{numbered.length} areas</span>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
          {numbered.map(folder => {
            const rawNum = folder.name.match(/^[\d.]+/)?.[0] || '';
            const num = zeroPad(rawNum);
            const title = folder.name.replace(/^[\d.]+ /, '');
            return (
              <div
                key={folder.id}
                onClick={() => navigate(`/browse/${folder.id}`)}
                className="subject-card flex items-center cursor-pointer transition-all duration-200"
                style={{
                  gap: 12,
                  padding: '14px 16px',
                  borderRadius: 8,
                  background: '#151c19',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)',
                  border: '1px solid rgba(255,255,255,0.04)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = '#222e2a';
                  e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.35), 0 2px 4px rgba(0,0,0,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.11)';
                  e.currentTarget.style.transform = 'translateY(-1px)';
                  e.currentTarget.querySelector('.card-id').style.color = '#4db8a4';
                  e.currentTarget.querySelector('.card-name').style.color = '#fff';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = '#151c19';
                  e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2)';
                  e.currentTarget.style.borderColor = 'rgba(255,255,255,0.04)';
                  e.currentTarget.style.transform = 'none';
                  e.currentTarget.querySelector('.card-id').style.color = '#5f706a';
                  e.currentTarget.querySelector('.card-name').style.color = '#e6eae8';
                }}
              >
                <span className="card-id text-[11px] font-bold tracking-[0.02em] transition-colors duration-200"
                  style={{ color: '#5f706a', minWidth: 22 }}>
                  {num}
                </span>
                <span className="card-name text-[13px] font-medium leading-snug transition-colors duration-150"
                  style={{ color: '#e6eae8' }}>
                  {title}
                </span>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Special Collections — padding: 0 56px 80px */}
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.45 }}
        style={{ padding: '0 56px 80px' }}
      >
        <div style={{ marginBottom: 20 }}>
          <h2 className="font-display text-[24px] font-normal text-white">Special Collections</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0 32px' }}>
          {special.map((f) => (
            <div
              key={f.id}
              onClick={() => navigate(`/browse/${f.id}`)}
              className="cursor-pointer"
              style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}
            >
              <span className="text-[13px] text-text-secondary hover:text-accent-bright transition-colors duration-150">
                {f.name}
              </span>
            </div>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
