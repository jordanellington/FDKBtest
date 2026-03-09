import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../hooks/useAuth';
import { ArrowRight } from 'lucide-react';
import { getTheme, applyTheme } from '../lib/theme';

export default function LoginPage() {
  useEffect(() => { applyTheme(getTheme()); }, []);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Invalid username or password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--color-bg-primary)' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        style={{ width: '100%', maxWidth: 400, padding: 24 }}
      >
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
            Sign In
          </h2>
          <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginBottom: 28 }}>
            Enter your credentials to continue
          </p>

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
        </div>
      </motion.div>
    </div>
  );
}
