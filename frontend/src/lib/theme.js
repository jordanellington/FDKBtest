const COOKIE_NAME = 'covi_theme';
const COOKIE_DOMAIN = window.location.hostname.endsWith('.covi3.com')
  ? '.covi3.com'
  : undefined;

export function getTheme() {
  const match = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_NAME}=([^;]*)`));
  if (match) return match[1];
  return localStorage.getItem('theme') || 'dark';
}

export function saveTheme(value) {
  const maxAge = 365 * 24 * 60 * 60;
  let cookie = `${COOKIE_NAME}=${value}; path=/; max-age=${maxAge}; SameSite=Lax`;
  if (COOKIE_DOMAIN) cookie += `; domain=${COOKIE_DOMAIN}`;
  document.cookie = cookie;
  localStorage.setItem('theme', value);
}

export function applyTheme(value) {
  document.documentElement.classList.toggle('light', value === 'light');
}
