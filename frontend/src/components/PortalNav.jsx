import { useState } from 'react';

const apps = [
  { label: 'Home', href: 'https://portal.covi3.com', host: 'portal.covi3.com' },
  { label: 'Knowledge Base', href: 'https://fdkb.covi3.com', host: 'fdkb.covi3.com' },
  { label: 'Opinion Letters', href: 'https://opdb.covi3.com', host: 'opdb.covi3.com' },
];

export default function PortalNav() {
  const [hovered, setHovered] = useState(null);
  const currentHost = window.location.hostname;

  return (
    <div
      style={{
        background: '#162f28',
        height: 46,
        position: 'sticky',
        top: 0,
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        fontFamily: "'DM Sans', -apple-system, system-ui, sans-serif",
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        {/* Brand */}
        <a
          href="https://portal.covi3.com"
          style={{ fontSize: 15, color: '#fff', display: 'flex', alignItems: 'baseline', textDecoration: 'none', cursor: 'pointer' }}
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
          <sup style={{ fontSize: 9, opacity: 0.4 }}>3</sup>
        </a>

        {/* Nav */}
        <nav style={{ display: 'flex', gap: 2 }}>
          {apps.map((app) => {
            const isActive = currentHost === app.host || (currentHost === 'localhost' && app.host === 'portal.covi3.com');
            const isHovered = hovered === app.label;
            return (
              <a
                key={app.label}
                href={app.href}
                onMouseEnter={() => setHovered(app.label)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  fontSize: 12.5,
                  color: isActive || isHovered ? '#fff' : 'rgba(255,255,255,0.5)',
                  padding: '6px 11px',
                  borderRadius: 4,
                  background: isActive || isHovered ? 'rgba(255,255,255,0.1)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'color 0.15s, background 0.15s',
                  cursor: 'pointer',
                }}
              >
                {app.label}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
