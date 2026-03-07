import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { LogOut, Menu, X } from 'lucide-react';
import AiChat from './AiChat';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

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
    <div className="flex flex-col md:flex-row h-screen overflow-hidden bg-bg-primary">
      {/* Mobile top bar */}
      <header className="md:hidden flex items-center justify-between px-4 py-3 bg-bg-sidebar border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="p-1.5 rounded-md text-text-secondary hover:text-white hover:bg-bg-elevated transition-colors"
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <h1 className="font-display text-lg font-normal text-text-primary leading-none">FDKB v2.0</h1>
          </div>
          <span className="text-[8px] font-bold tracking-[0.14em] uppercase text-accent bg-accent/10 px-1.5 py-0.5 rounded">beta</span>
        </div>
        <button
          onClick={handleLogout}
          className="p-1.5 rounded-md text-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
          title="Sign out"
        >
          <LogOut size={16} strokeWidth={1.6} />
        </button>
      </header>

      {/* Mobile backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      {/* Sidebar */}
      <nav className={`
        fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300
        ${menuOpen ? 'translate-x-0' : '-translate-x-full'}
        md:static md:translate-x-0 md:w-[220px] md:z-auto
        flex flex-col shrink-0 bg-bg-sidebar border-r border-border pt-12
      `}>
        {/* Logo */}
        <div className="px-5 pl-8 mb-10">
          <p className="text-[10px] font-bold tracking-[0.32em] uppercase text-text-muted mb-1">
            Covington
          </p>
          <h1 className="font-display text-[36px] font-normal text-text-primary leading-none">FDKB v2.0</h1>
          <span className="inline-block mt-2 text-[10px] font-bold tracking-[0.14em] uppercase text-accent bg-accent/10 px-2 py-0.5 rounded">beta</span>
        </div>

        <div className="h-px bg-border mx-5 mb-4" />

        {/* Navigation */}
        <div className="flex-1 px-4 overflow-y-auto">
          <div className="space-y-px">
            {mainNav.map(({ to, label, end }) => (
              <NavLink key={to} to={to} end={end}
                onClick={() => setMenuOpen(false)}
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
            onClick={() => { setChatOpen(!chatOpen); setMenuOpen(false); }}
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
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-[11px] font-medium text-text-muted hover:text-white hover:bg-white/[0.06] transition-colors"
              title="Sign out"
            >
              <LogOut size={13} strokeWidth={1.6} />
              <span>Logout</span>
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
