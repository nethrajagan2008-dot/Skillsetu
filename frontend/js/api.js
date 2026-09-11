const API_BASE = '/api';

const Store = {
  get token() { return localStorage.getItem('ss_token'); },
  set token(v) { v ? localStorage.setItem('ss_token', v) : localStorage.removeItem('ss_token'); },
  get user() { try { return JSON.parse(localStorage.getItem('ss_user') || 'null'); } catch { return null; } },
  set user(v) { v ? localStorage.setItem('ss_user', JSON.stringify(v)) : localStorage.removeItem('ss_user'); },
  clear() { this.token = null; this.user = null; },
};

async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth && Store.token) headers['Authorization'] = `Bearer ${Store.token}`;
  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch (e) {
    throw new Error(I18N.t('errorNetwork'));
  }
  let data = null;
  try { data = await res.json(); } catch { /* no body, e.g. some 204s */ }
  if (!res.ok) {
    if (res.status === 401) { Store.clear(); }
    throw new Error((data && data.error) || I18N.t('errorGeneric'));
  }
  return data;
}

function apiDownloadUrl(path) {
  // For links/anchors that need the token as a query param (file downloads).
  return `${API_BASE}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(Store.token || '')}`;
}
