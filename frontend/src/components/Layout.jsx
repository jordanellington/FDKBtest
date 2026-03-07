import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { Home, FolderOpen, Search, LogOut, Sparkles } from 'lucide-react';
import AiChat from './AiChat';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const mainNav = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/browse', label: 'Documents' },
    { to: '/search', label: 'Search' },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <nav className="w-[220px] flex flex-col shrink-0 bg-bg-sidebar border-r border-border" style={{ padding: '28px 0 0 0' }}>
        {/* Logo */}
        <div style={{ padding: '0 20px 0 22px', marginBottom: '40px' }}>
          <p className="text-[10px] font-bold tracking-[0.32em] uppercase text-text-muted mb-1">
            Covington
          </p>
          <h1 className="font-display text-[36px] font-normal text-text-primary leading-none">FDKB v2.0</h1>
          <p className="text-[10px] font-medium text-text-dim mt-1.5 tracking-[0.08em]">beta</p>
        </div>

        <div className="h-px bg-border mx-5 mb-4" />

        {/* Navigation */}
        <div className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-px">
            {mainNav.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                className={({ isActive }) =>
                  `flex items-center rounded-md text-[13px] transition-all relative ${
                    isActive
                      ? 'text-white bg-bg-elevated font-semibold'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary'
                  }`
                }
                style={{ padding: '9px 14px' }}
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute left-0 w-[3px] rounded-sm bg-accent" style={{ top: 6, bottom: 6 }} />
                    )}
                    <span>{label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="h-px bg-border my-4 mx-1" />

          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`flex items-center justify-between w-full rounded-md text-[13px] transition-all text-left ${
              chatOpen
                ? 'text-white bg-bg-elevated font-semibold'
                : 'text-text-secondary hover:text-text-primary hover:bg-white/[0.02]'
            }`}
            style={{ padding: '9px 14px' }}
          >
            AI Assistant
            <span className="text-[8px] font-bold tracking-[0.1em] uppercase text-accent px-1.5 py-0.5 rounded bg-accent/10">
              New
            </span>
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-semibold">
              {(user?.firstName?.[0] || 'U')}{(user?.lastName?.[0] || '')}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[12px] text-text-primary font-medium truncate">
                {user?.firstName} {user?.lastName}
              </p>
              <p className="text-[10px] text-text-dim truncate">Covington & Burling</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded text-text-muted hover:text-text-secondary hover:bg-white/[0.04] transition-colors"
              title="Sign out"
            >
              <LogOut size={13} strokeWidth={1.4} />
            </button>
          </div>
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto overflow-x-hidden min-w-0">
        <Outlet />
      </main>

      {/* AI Chat Panel */}
      <AnimatePresence>
        {chatOpen && <AiChat onClose={() => setChatOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
