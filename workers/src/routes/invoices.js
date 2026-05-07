import { jsonResponse } from '../lib/helpers.js';
import { requireAuth } from '../lib/auth.js';

export async function handleInvoices(request, env, path, authResult) {
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const user = authResult.user;
  const method = request.method;

  // GET /api/invoices - list invoices
  if (path === '/api/invoices' && method === 'GET') {
    let query, params;

    if (user.role === 'customer') {
      query = `SELECT i.*, o.order_number, o.total_amount, o.status, o.customer_name 
               FROM invoices i JOIN orders o ON i.order_id = o.id 
               WHERE o.user_id = ? ORDER BY i.generated_at DESC`;
      params = [user.id];
    } else {
      query = `SELECT i.*, o.order_number, o.total_amount, o.status, o.customer_name 
               FROM invoices i JOIN orders o ON i.order_id = o.id 
               ORDER BY i.generated_at DESC LIMIT 50`;
      params = [];
    }

    const invoices = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ invoices: invoices.results });
  }

  // GET /api/invoices/:id - get invoice details
  const idMatch = path.match(/^\/api\/invoices\/(\d+)$/);
  if (idMatch && method === 'GET') {
    const id = idMatch[1];
    const invoice = await env.DB.prepare(`
      SELECT i.*, o.*, o.id as order_id
      FROM invoices i JOIN orders o ON i.order_id = o.id
      WHERE i.id = ?
    `).bind(id).first();

    if (!invoice) return jsonResponse({ error: 'Invoice not found' }, 404);
    if (user.role === 'customer' && invoice.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const files = await env.DB.prepare(`
      SELECT f.original_name FROM files f
      JOIN order_files of2 ON f.id = of2.file_id
      WHERE of2.order_id = ?
    `).bind(invoice.order_id).all();

    const settings = await env.DB.prepare('SELECT key, value FROM settings').all();
    const settingsMap = {};
    for (const s of settings.results) settingsMap[s.key] = s.value;

    return jsonResponse({ invoice, files: files.results, shop: settingsMap });
  }

  // GET /api/invoices/by-order/:order_id
  const orderMatch = path.match(/^\/api\/invoices\/by-order\/(\d+)$/);
  if (orderMatch && method === 'GET') {
    const orderId = orderMatch[1];
    const invoice = await env.DB.prepare(`
      SELECT i.*, o.* FROM invoices i JOIN orders o ON i.order_id = o.id WHERE i.order_id = ?
    `).bind(orderId).first();

    if (!invoice) return jsonResponse({ error: 'Invoice not found' }, 404);
    if (user.role === 'customer' && invoice.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const settings = await env.DB.prepare('SELECT key, value FROM settings').all();
    const settingsMap = {};
    for (const s of settings.results) settingsMap[s.key] = s.value;

    return jsonResponse({ invoice, shop: settingsMap });
  }

  return jsonResponse({ error: 'Invoice endpoint not found' }, 404);
}