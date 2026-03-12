import { Search } from 'lucide-react';

export default function PortalNav({ user, onSearchClick }) {
  const initial = user?.name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'A';

  return (
    <div
      style={{
        background: '#0F4859',
        position: 'sticky',
        top: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 24px',
        fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
      }}
    >
      {/* Brand */}
      <a
        href="https://portal.covi3.com"
        style={{ fontSize: 20, color: '#fff', display: 'flex', alignItems: 'baseline', textDecoration: 'none', cursor: 'pointer' }}
      >
        <span style={{ fontWeight: 400 }}>Cov</span>
        <span
          style={{
            fontFamily: "'EB Garamond', Georgia, serif",
            fontStyle: 'italic',
            fontWeight: 400,
            opacity: 0.65,
          }}
        >
          Interactive
        </span>
        <sup style={{ fontSize: 11, opacity: 0.4 }}>5</sup>
      </a>

      {/* Right side — only render if user prop is provided (CovHome) */}
      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Search pill */}
          <div
            onClick={onSearchClick}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 4,
              padding: '5px 12px',
              color: 'rgba(255,255,255,0.4)',
              fontSize: 13,
              minWidth: 210,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              cursor: 'pointer',
            }}
          >
            <Search size={14} strokeWidth={2} />
            <span style={{ flex: 1 }}>Search files, people, sites</span>
            <kbd
              style={{
                fontSize: 10,
                background: 'rgba(255,255,255,0.1)',
                padding: '1px 5px',
                borderRadius: 3,
                border: 'none',
                color: 'inherit',
                fontFamily: 'inherit',
              }}
            >
              ⌘K
            </kbd>
          </div>

          {/* Avatar */}
          <div
            style={{
              width: 28,
              height: 28,
              background: '#2d6a5a',
              borderRadius: '50%',
              color: '#fff',
              fontSize: 11,
              fontWeight: 600,
              border: '1.5px solid rgba(255,255,255,0.2)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {initial}
          </div>
        </div>
      )}
    </div>
  );
}
