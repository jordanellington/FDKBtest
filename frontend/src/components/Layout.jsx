import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { LogOut, Menu, X, Sun, Moon } from 'lucide-react';
import AiChat from './AiChat';
import PortalNav from './PortalNav';
import { getTheme, saveTheme, applyTheme } from '../lib/theme';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [chatOpen, setChatOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [theme, setTheme] = useState(() => getTheme());

  useEffect(() => {
    applyTheme(theme);
    saveTheme(theme);
  }, [theme]);

  const toggleTheme = () => setTheme(prev => prev === 'dark' ? 'light' : 'dark');

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  const mainNav = [
    { to: '/', label: 'Dashboard', end: true },
    { to: '/chat', label: 'Chat with FDKB' },
  ];

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-bg-primary">
      <PortalNav />

      {/* Top header bar with inline nav */}
      <header className="flex items-center bg-bg-sidebar border-b border-border shrink-0" style={{ padding: '14px 24px' }}>
        {/* Left: brand */}
        <div style={{ flexShrink: 0 }}>
          <h1 className="font-display text-[20px] font-light text-text-primary leading-none tracking-[-0.01em]">Food & Drug Knowledge Base</h1>
        </div>

        {/* Center: nav links */}
        <nav className="top-nav-links flex items-center" style={{ marginLeft: 32, gap: 4 }}>
          {mainNav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}
              className="text-[14px] transition-all"
              style={({ isActive }) => ({
                padding: '6px 16px',
                borderRadius: 6,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
              })}
            >
              {label}
            </NavLink>
          ))}
        </nav>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Right: controls */}
        <div className="flex items-center" style={{ gap: 10, flexShrink: 0 }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="top-nav-hamburger p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
            style={{ display: 'none' }}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          <button
            onClick={toggleTheme}
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-elevated transition-colors"
            title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {theme === 'dark' ? <Sun size={15} strokeWidth={1.8} /> : <Moon size={15} strokeWidth={1.8} />}
          </button>
          <div className="w-7 h-7 rounded-full bg-accent/10 flex items-center justify-center text-accent text-[10px] font-semibold">
            {(user?.firstName?.[0] || 'U')}{(user?.lastName?.[0] || '')}
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
      </header>

      {/* Mobile nav dropdown */}
      {menuOpen && (
        <div className="top-nav-mobile-menu flex-col bg-bg-sidebar border-b border-border md:hidden" style={{ padding: '8px 24px 12px', display: 'flex' }}>
          {mainNav.map(({ to, label, end }) => (
            <NavLink key={to} to={to} end={end}
              onClick={() => setMenuOpen(false)}
              className="text-[14px] transition-all"
              style={({ isActive }) => ({
                padding: '8px 14px',
                borderRadius: 6,
                fontWeight: isActive ? 600 : 500,
                color: isActive ? 'var(--color-text-primary)' : 'var(--color-text-secondary)',
                background: isActive ? 'var(--color-bg-elevated)' : 'transparent',
              })}
            >
              {label}
            </NavLink>
          ))}
        </div>
      )}

      {/* Main content — full width, no sidebar */}
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
