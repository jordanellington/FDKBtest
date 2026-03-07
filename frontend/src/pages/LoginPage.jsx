import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight, Key } from 'lucide-react';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [jsessionId, setJsessionId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [devMode, setDevMode] = useState(false);
  const { login, devLogin } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Authentication failed. Try Dev Login with your covi3.com session.');
    } finally {
      setLoading(false);
    }
  };

  const handleDevLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await devLogin(jsessionId);
      navigate('/');
    } catch {
      setError('Invalid or expired session.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      {/* Left branding panel */}
      <div
        className="hidden lg:flex shrink-0 flex-col justify-between"
        style={{
          width: 520,
          padding: '80px 64px 64px',
          borderRight: '1px solid rgba(255,255,255,0.04)',
          background: 'linear-gradient(180deg, #0f1614 0%, #0b0e0d 100%)',
        }}
      >
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <p
            className="text-[10px] tracking-[0.3em] uppercase font-semibold"
            style={{ color: 'var(--color-text-muted)', marginBottom: 32 }}
          >
            Covington & Burling LLP
          </p>
          <h1
            className="font-display font-light leading-[1.08] tracking-[-0.02em]"
            style={{ fontSize: 48, color: '#fff', marginBottom: 24 }}
          >
            Food &amp; Drug<br />Knowledge Base
          </h1>
          <p
            className="leading-relaxed"
            style={{ fontSize: 15, color: 'var(--color-text-secondary)', maxWidth: 360 }}
          >
            80 years of FDA regulatory intelligence. Selected practice materials from 1947 to the present.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="flex"
          style={{ gap: 48 }}
        >
          {[
            { v: '368K', l: 'Documents' },
            { v: '22', l: 'Subject Areas' },
            { v: '1947', l: 'to Present' },
          ].map(({ v, l }) => (
            <div key={l}>
              <p className="font-display" style={{ fontSize: 28, fontWeight: 300, color: 'var(--color-accent-bright)' }}>{v}</p>
              <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 4 }}>{l}</p>
            </div>
          ))}
        </motion.div>
      </div>

      {/* Right form panel */}
      <div className="flex-1 flex items-center justify-center" style={{ padding: 48 }}>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.45 }}
          style={{ width: '100%', maxWidth: 400 }}
        >
          {/* Mobile-only header */}
          <div className="lg:hidden" style={{ marginBottom: 40 }}>
            <p
              className="text-[10px] tracking-[0.25em] uppercase font-semibold"
              style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}
            >
              Covington & Burling
            </p>
            <h1 className="font-display" style={{ fontSize: 28, color: '#fff' }}>FDKB Navigator</h1>
          </div>

          <div
            style={{
              background: 'var(--color-bg-secondary)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 14,
              padding: '36px 32px',
              boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
            }}
          >
            <h2
              className="font-display"
              style={{ fontSize: 22, fontWeight: 400, color: '#fff', marginBottom: 4 }}
            >
              {devMode ? 'Dev Login' : 'Sign In'}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 28 }}>
              {devMode ? 'Connect via covi3.com session' : 'Access the knowledge base'}
            </p>

            {!devMode ? (
              <form onSubmit={handleSubmit}>
                <div style={{ marginBottom: 20 }}>
                  <label
                    className="block text-[11px] tracking-wider uppercase font-semibold"
                    style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    placeholder="Username"
                    required
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-primary)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 14,
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
                <div style={{ marginBottom: 20 }}>
                  <label
                    className="block text-[11px] tracking-wider uppercase font-semibold"
                    style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Password"
                    required
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-primary)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 14,
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                  />
                </div>
                {error && <p style={{ fontSize: 13, color: 'var(--color-status-red)', marginBottom: 16 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2"
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    background: 'var(--color-accent)',
                    color: 'var(--color-bg-primary)',
                    border: 'none',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.4 : 1,
                  }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" />
                  ) : (
                    <>Sign In <ArrowRight size={14} /></>
                  )}
                </button>
              </form>
            ) : (
              <form onSubmit={handleDevLogin}>
                <div style={{ marginBottom: 20 }}>
                  <label
                    className="block text-[11px] tracking-wider uppercase font-semibold"
                    style={{ color: 'var(--color-text-muted)', marginBottom: 8 }}
                  >
                    JSESSIONID
                  </label>
                  <input
                    type="text"
                    value={jsessionId}
                    onChange={e => setJsessionId(e.target.value)}
                    placeholder="Paste cookie value"
                    required
                    className="font-mono"
                    style={{
                      width: '100%',
                      background: 'var(--color-bg-primary)',
                      border: '1px solid rgba(255,255,255,0.07)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      fontSize: 13,
                      color: 'var(--color-text-primary)',
                      outline: 'none',
                    }}
                  />
                  <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 10 }}>
                    covi3.com → DevTools → Cookies → JSESSIONID
                  </p>
                </div>
                {error && <p style={{ fontSize: 13, color: 'var(--color-status-red)', marginBottom: 16 }}>{error}</p>}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2"
                  style={{
                    width: '100%',
                    padding: '12px 0',
                    borderRadius: 10,
                    fontSize: 14,
                    fontWeight: 600,
                    background: 'var(--color-accent)',
                    color: 'var(--color-bg-primary)',
                    border: 'none',
                    cursor: loading ? 'default' : 'pointer',
                    opacity: loading ? 0.4 : 1,
                  }}
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-bg-primary/30 border-t-bg-primary rounded-full animate-spin" />
                  ) : (
                    <>Connect <ArrowRight size={14} /></>
                  )}
                </button>
              </form>
            )}

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: '1px solid rgba(255,255,255,0.04)' }}>
              <button
                onClick={() => { setDevMode(!devMode); setError(''); }}
                className="flex items-center justify-center gap-1.5"
                style={{
                  width: '100%',
                  fontSize: 13,
                  color: 'var(--color-text-muted)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                <Key size={12} /> {devMode ? '← Standard login' : 'Dev Login (Session Cookie)'}
              </button>
            </div>
          </div>

          <p style={{ textAlign: 'center', fontSize: 11, color: 'var(--color-text-dim)', marginTop: 28 }}>
            &copy; 2014–2026 Covington &amp; Burling LLP
          </p>
        </motion.div>
      </div>
    </div>
  );
}
