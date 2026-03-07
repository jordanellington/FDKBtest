import { createContext, useContext, useState, useEffect } from 'react';
import { login as apiLogin, devLoginApi, logout as apiLogout, getSession, setSession } from '../lib/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const session = getSession();
    const savedUser = localStorage.getItem('fdkb_user');
    if (session && savedUser) {
      setUser(JSON.parse(savedUser));
    }
    setLoading(false);
  }, []);

  async function login(username, password) {
    const data = await apiLogin(username, password);
    setUser(data.user);
    localStorage.setItem('fdkb_user', JSON.stringify(data.user));
    return data;
  }

  async function devLogin(jsessionId) {
    const data = await devLoginApi(jsessionId);
    setUser(data.user);
    localStorage.setItem('fdkb_user', JSON.stringify(data.user));
    return data;
  }

  async function logout() {
    await apiLogout();
    setUser(null);
    localStorage.removeItem('fdkb_user');
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, devLogin, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
