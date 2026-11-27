import crypto from 'node:crypto';

export function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), microphone=(self)');
  res.setHeader(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self' https://accounts.google.com",
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' ws: wss: https://*.peerjs.com wss://*.peerjs.com https://accounts.google.com https://oauth2.googleapis.com https://*.supabase.co wss://*.supabase.co",
      "media-src 'self' blob:",
      "frame-ancestors 'none'"
    ].join('; ')
  );
}

export function getClientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.trim()) {
    return fwd.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '127.0.0.1';
}

export class SlidingRateLimiter {
  constructor() {
    this.buckets = new Map();
    const cleanup = setInterval(() => {
      const now = Date.now();
      for (const [k, arr] of this.buckets.entries()) {
        const kept = arr.filter((t) => now - t < 120_000);
        if (kept.length === 0) this.buckets.delete(k);
        else this.buckets.set(k, kept);
      }
    }, 60_000);
    cleanup.unref?.();
  }

  allow(key, maxHits, windowMs) {
    const now = Date.now();
    const arr = (this.buckets.get(key) || []).filter((t) => now - t < windowMs);
    if (arr.length >= maxHits) {
      this.buckets.set(key, arr);
      return false;
    }
    arr.push(now);
    this.buckets.set(key, arr);
    return true;
  }
}

export const rateLimiter = new SlidingRateLimiter();

export function sanitizeText(raw, maxLen = 200) {
  return String(raw ?? '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export function sanitizeUsername(raw) {
  const clean = sanitizeText(raw, 16).replace(/[<>]/g, '');
  return clean.length >= 2 ? clean : '';
}

export function isValidEmail(raw) {
  const email = String(raw || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 160;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHex] = storedHash.split(':');
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const expected = Buffer.from(expectedHex, 'hex');
    if (derived.length !== expected.length) return false;
    return crypto.timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

export function sha256Hex(val) {
  return crypto.createHash('sha256').update(String(val)).digest('hex');
}

export function generateOtp6() {
  return String(crypto.randomInt(100000, 1000000));
}

export function generateSecureToken() {
  return crypto.randomBytes(32).toString('base64url');
}
