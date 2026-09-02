// Shared session handling. One password, one signed cookie, checked server side.
// Nothing sensitive ever reaches the browser before the password is right.

import crypto from 'node:crypto';

const COOKIE = 'nuvo_session';
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days, so Ben signs in about once a month

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

export function sign(value) {
  const mac = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  return `${value}.${mac}`;
}

export function verify(token) {
  if (!token || typeof token !== 'string') return false;
  const i = token.lastIndexOf('.');
  if (i < 1) return false;
  const value = token.slice(0, i);
  const mac = token.slice(i + 1);
  let expected;
  try {
    expected = crypto.createHmac('sha256', secret()).update(value).digest('hex');
  } catch (e) {
    return false;
  }
  const a = Buffer.from(mac, 'hex');
  const b = Buffer.from(expected, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
  const issued = Number(value.split('|')[1]);
  if (!issued || Date.now() - issued > MAX_AGE * 1000) return false;
  return true;
}

export function cookieHeader() {
  const token = sign(`ben|${Date.now()}`);
  return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAX_AGE}`;
}

export function clearHeader() {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function isSignedIn(request) {
  const raw = request.headers.get('cookie') || '';
  const hit = raw.split(';').map((s) => s.trim()).find((s) => s.startsWith(`${COOKIE}=`));
  if (!hit) return false;
  return verify(decodeURIComponent(hit.slice(COOKIE.length + 1)));
}

// Constant-time password compare, so the response time never leaks the answer.
export function passwordOk(given) {
  const want = process.env.SITE_PASSWORD || '';
  if (!want) return false;
  const a = Buffer.from(String(given || ''));
  const b = Buffer.from(want);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...extraHeaders }
  });
}
