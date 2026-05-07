import { signJWT, hashPassword, verifyPassword, verifyJWT } from '../lib/auth.js';
import { jsonResponse } from '../lib/helpers.js';

export async function handleAuth(request, env, path) {
  const method = request.method;

  // POST /api/auth/register
  if (path === '/api/auth/register' && method === 'POST') {
    const { name, email, phone, password } = await request.json();
    if (!name || !email || !password) {
      return jsonResponse({ error: 'Name, email, and password are required' }, 400);
    }

    const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existing) return jsonResponse({ error: 'Email already registered' }, 409);

    const hash = await hashPassword(password);
    const result = await env.DB.prepare(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING id, name, email, role'
    ).bind(name, email, phone || null, hash, 'customer').first();

    const token = await signJWT({ id: result.id, name: result.name, email: result.email, role: result.role }, env.JWT_SECRET || 'fallback-secret-change-me');
    return jsonResponse({ user: result, token });
  }

  // POST /api/auth/login
  if (path === '/api/auth/login' && method === 'POST') {
    const { email, password } = await request.json();
    if (!email || !password) return jsonResponse({ error: 'Email and password required' }, 400);

    const user = await env.DB.prepare(
      'SELECT id, name, email, phone, role, password_hash, is_active FROM users WHERE email = ?'
    ).bind(email).first();

    if (!user) return jsonResponse({ error: 'Invalid credentials' }, 401);
    if (!user.is_active) return jsonResponse({ error: 'Account deactivated' }, 403);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return jsonResponse({ error: 'Invalid credentials' }, 401);

    const { password_hash, ...safeUser } = user;
    const token = await signJWT({ id: user.id, name: user.name, email: user.email, role: user.role }, env.JWT_SECRET || 'fallback-secret-change-me');
    return jsonResponse({ user: safeUser, token });
  }

  // POST /api/auth/admin-login
  if (path === '/api/auth/admin-login' && method === 'POST') {
    const { email, password } = await request.json();
    const user = await env.DB.prepare(
      'SELECT id, name, email, role, password_hash, is_active FROM users WHERE email = ? AND role IN (\'admin\', \'staff\', \'delivery\')'
    ).bind(email).first();

    if (!user) return jsonResponse({ error: 'Invalid admin credentials' }, 401);
    if (!user.is_active) return jsonResponse({ error: 'Account deactivated' }, 403);

    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return jsonResponse({ error: 'Invalid credentials' }, 401);

    const { password_hash, ...safeUser } = user;
    const token = await signJWT({ id: user.id, name: user.name, email: user.email, role: user.role }, env.JWT_SECRET || 'fallback-secret-change-me', 720);
    return jsonResponse({ user: safeUser, token });
  }

  // GET /api/auth/me
  if (path === '/api/auth/me' && method === 'GET') {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) return jsonResponse({ error: 'Unauthorized' }, 401);

    const { user, error } = await verifyJWT(request, env);
    if (!user) return jsonResponse({ error }, 401);

    const dbUser = await env.DB.prepare(
      'SELECT id, name, email, phone, role, created_at FROM users WHERE id = ?'
    ).bind(user.id).first();

    return jsonResponse({ user: dbUser });
  }

  // POST /api/auth/change-password
  if (path === '/api/auth/change-password' && method === 'POST') {
    const { user, error } = await verifyJWT(request, env);
    if (!user) return jsonResponse({ error }, 401);

    const { old_password, new_password } = await request.json();
    const dbUser = await env.DB.prepare('SELECT password_hash FROM users WHERE id = ?').bind(user.id).first();
    
    const valid = await verifyPassword(old_password, dbUser.password_hash);
    if (!valid) return jsonResponse({ error: 'Current password incorrect' }, 400);

    const newHash = await hashPassword(new_password);
    await env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?')
      .bind(newHash, user.id).run();

    return jsonResponse({ message: 'Password changed successfully' });
  }

  return jsonResponse({ error: 'Auth endpoint not found' }, 404);
}