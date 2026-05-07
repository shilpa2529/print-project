import { jsonResponse } from './helpers.js';
import { corsHeaders } from './cors.js';

/**
 * Sign a JWT token
 */
export async function signJWT(payload, secret, expiresInHours = 168) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresInHours * 3600 };

  const encode = (obj) => btoa(JSON.stringify(obj))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  const headerB64 = encode(header);
  const payloadB64 = encode(fullPayload);
  const signingInput = `${headerB64}.${payloadB64}`;

  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signingInput)
  );

  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

  return `${signingInput}.${sigB64}`;
}

/**
 * Verify and decode a JWT token
 */
export async function verifyJWT(request, env) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { user: null, error: 'No token provided' };
  }

  const token = authHeader.slice(7);
  try {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token format');

    const decode = (b64) => JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
    const payload = decode(parts[1]);

    // Check expiry
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      return { user: null, error: 'Token expired' };
    }

    // Verify signature
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.JWT_SECRET || 'fallback-secret-change-me'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBytes = Uint8Array.from(
      atob(parts[2].replace(/-/g, '+').replace(/_/g, '/')),
      c => c.charCodeAt(0)
    );

    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes,
      new TextEncoder().encode(signingInput)
    );

    if (!valid) return { user: null, error: 'Invalid token signature' };

    return { user: payload, error: null };
  } catch (e) {
    return { user: null, error: 'Token verification failed' };
  }
}

/**
 * Hash password using SHA-256 (use bcrypt-compatible in real production via external service)
 */
export async function hashPassword(password) {
  const data = new TextEncoder().encode(password + 'quickprint-salt-2024');
  const hash = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(hash)));
}

export async function verifyPassword(password, hash) {
  const computed = await hashPassword(password);
  return computed === hash;
}

/**
 * Require authentication middleware
 */
export function requireAuth(authResult) {
  if (!authResult.user) {
    return new Response(JSON.stringify({ error: authResult.error || 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  return null;
}

/**
 * Require admin or staff role
 */
export function requireRole(authResult, roles = ['admin']) {
  const authError = requireAuth(authResult);
  if (authError) return authError;

  if (!roles.includes(authResult.user.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden: insufficient permissions' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json', ...corsHeaders }
    });
  }
  return null;
}