import { jsonResponse } from '../lib/helpers.js';
import { requireRole } from '../lib/auth.js';

export async function handleDelivery(request, env, path, authResult) {
  const roleError = requireRole(authResult, ['admin', 'staff', 'delivery']);
  if (roleError) return roleError;

  const method = request.method;
  const url = new URL(request.url);

  // GET /api/delivery - list delivery orders
  if (path === '/api/delivery' && method === 'GET') {
    const status = url.searchParams.get('status');
    let query = `
      SELECT o.*, a.line1, a.line2, a.city, a.state, a.pincode,
        u.name as assigned_name
      FROM orders o
      LEFT JOIN addresses a ON o.address_id = a.id
      LEFT JOIN users u ON o.assigned_to = u.id
      WHERE o.delivery_type = 'delivery'
    `;
    const params = [];

    if (status) { query += ' AND o.status = ?'; params.push(status); }
    query += ' ORDER BY o.updated_at DESC';

    const orders = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ orders: orders.results });
  }

  // PATCH /api/delivery/:id/assign - assign delivery person
  const assignMatch = path.match(/^\/api\/delivery\/(\d+)\/assign$/);
  if (assignMatch && method === 'PATCH') {
    const orderId = assignMatch[1];
    const { delivery_person_id } = await request.json();

    await env.DB.prepare(
      'UPDATE orders SET assigned_to = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(delivery_person_id, orderId).run();

    return jsonResponse({ message: 'Delivery assigned' });
  }

  // PATCH /api/delivery/:id/dispatch - mark as out for delivery
  const dispatchMatch = path.match(/^\/api\/delivery\/(\d+)\/dispatch$/);
  if (dispatchMatch && method === 'PATCH') {
    const orderId = dispatchMatch[1];
    await env.DB.prepare(
      'UPDATE orders SET status = \'out_for_delivery\', updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(orderId).run();
    return jsonResponse({ message: 'Order dispatched' });
  }

  // PATCH /api/delivery/:id/complete - mark delivered
  const completeMatch = path.match(/^\/api\/delivery\/(\d+)\/complete$/);
  if (completeMatch && method === 'PATCH') {
    const orderId = completeMatch[1];
    await env.DB.prepare(
      'UPDATE orders SET status = \'delivered\', updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(orderId).run();
    return jsonResponse({ message: 'Order delivered' });
  }

  // GET /api/delivery/addresses - customer addresses
  if (path === '/api/delivery/addresses' && method === 'GET') {
    const userId = authResult.user.id;
    const addresses = await env.DB.prepare(
      'SELECT * FROM addresses WHERE user_id = ? ORDER BY is_default DESC, id DESC'
    ).bind(userId).all();
    return jsonResponse({ addresses: addresses.results });
  }

  // POST /api/delivery/addresses - add address
  if (path === '/api/delivery/addresses' && method === 'POST') {
    const userId = authResult.user.id;
    const { label, line1, line2, city, state, pincode, is_default } = await request.json();

    if (is_default) {
      await env.DB.prepare('UPDATE addresses SET is_default = 0 WHERE user_id = ?').bind(userId).run();
    }

    const addr = await env.DB.prepare(
      'INSERT INTO addresses (user_id, label, line1, line2, city, state, pincode, is_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *'
    ).bind(userId, label || 'Home', line1, line2 || null, city, state, pincode, is_default ? 1 : 0).first();

    return jsonResponse({ address: addr }, 201);
  }

  return jsonResponse({ error: 'Delivery endpoint not found' }, 404);
}