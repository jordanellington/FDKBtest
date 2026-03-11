import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AnimatePresence } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { LogOut, Menu, X, Sun, Moon, RotateCcw } from 'lucide-react';
import AiChat from './AiChat';
import PortalNav from './PortalNav';
import { getTheme, saveTheme, applyTheme } from '../lib/theme';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isChat = location.pathname === '/chat';
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
      {/* Top header bar — matches OPDTEST */}
      <header className="flex items-center justify-between px-6 bg-bg-sidebar border-b border-border shrink-0" style={{ paddingTop: 20, paddingBottom: 20 }}>
        <div style={{ paddingLeft: 8 }}>
          <p className="text-[10px] font-bold tracking-[0.32em] uppercase text-text-muted mb-0.5">
            Covington
          </p>
          <h1 className="font-display text-[24px] font-light text-text-primary leading-none tracking-[-0.01em]">Food & Drug Knowledge Base</h1>
        </div>
        <div className="flex items-center gap-3" style={{ paddingRight: 8 }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="md:hidden p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-bg-elevated transition-colors"
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

      {/* Mobile backdrop */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 md:hidden" onClick={() => setMenuOpen(false)} />
      )}

      <div className="flex flex-1 md:flex-row overflow-hidden">
        {/* Sidebar — nav only */}
        <nav className={`
          fixed inset-y-0 left-0 z-50 w-[260px] transform transition-transform duration-300
          ${menuOpen ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:w-[220px] md:z-auto
          flex flex-col shrink-0 bg-bg-sidebar border-r border-border pt-6
        `}>
          {/* Navigation */}
          <div className="flex-1 px-4 overflow-y-auto">
            <div className="space-y-px">
              {mainNav.map(({ to, label, end }) => (
                <NavLink key={to} to={to} end={end}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center rounded-md text-[13px] transition-all relative ${
                      isActive
                        ? 'text-text-primary bg-bg-elevated font-semibold'
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

          </div>

          {/* Clear Chat — bottom of sidebar, only on /chat */}
          {isChat && (
            <div className="px-4 pb-5">
              <button
                onClick={() => window.dispatchEvent(new Event('fdkb-clear-chat'))}
                className="flex items-center gap-2 w-full rounded-md text-[12px] text-text-muted hover:text-text-primary hover:bg-bg-secondary transition-colors"
                style={{ padding: '8px 14px' }}
              >
                <RotateCcw size={13} strokeWidth={1.8} />
                <span>Clear Chat</span>
              </button>
            </div>
          )}
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
    </div>
  );
}
