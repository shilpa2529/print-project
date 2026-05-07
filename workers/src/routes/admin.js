import { jsonResponse, paginate } from '../lib/helpers.js';
import { requireRole, hashPassword } from '../lib/auth.js';

export async function handleAdmin(request, env, path, authResult) {
  const roleError = requireRole(authResult, ['admin', 'staff']);
  if (roleError) return roleError;

  const user = authResult.user;
  const method = request.method;
  const url = new URL(request.url);

  // GET /api/admin/dashboard - full dashboard stats
  if (path === '/api/admin/dashboard' && method === 'GET') {
    const today = new Date().toISOString().split('T')[0];
    const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];

    const [
      todayStats, statusCounts, pageSizeStats,
      paymentStats, recentOrders, queueSummary,
      topCustomers, weeklyRevenue, deliveryStats
    ] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as orders, COALESCE(SUM(total_amount), 0) as revenue 
        FROM orders WHERE date(created_at) = ? AND payment_status = 'paid'`).bind(today).first(),
      
      env.DB.prepare(`SELECT status, COUNT(*) as count FROM orders GROUP BY status`).all(),
      
      env.DB.prepare(`SELECT page_size, COUNT(*) as count FROM orders GROUP BY page_size`).all(),
      
      env.DB.prepare(`SELECT payment_method, COUNT(*) as count, COALESCE(SUM(total_amount),0) as total 
        FROM orders WHERE payment_status = 'paid' GROUP BY payment_method`).all(),
      
      env.DB.prepare(`SELECT * FROM orders ORDER BY created_at DESC LIMIT 5`).all(),
      
      env.DB.prepare(`SELECT page_size, COUNT(*) as order_count, COALESCE(SUM(o.total_pages),0) as total_pages 
        FROM print_queue pq JOIN orders o ON pq.order_id = o.id 
        WHERE pq.status = 'queued' GROUP BY page_size`).all(),
      
      env.DB.prepare(`SELECT customer_name, customer_phone, COUNT(*) as orders, 
        COALESCE(SUM(total_amount),0) as revenue 
        FROM orders WHERE payment_status = 'paid' 
        GROUP BY customer_phone ORDER BY revenue DESC LIMIT 5`).all(),
      
      env.DB.prepare(`SELECT date(created_at) as date, COUNT(*) as orders, 
        COALESCE(SUM(total_amount),0) as revenue 
        FROM orders WHERE payment_status = 'paid' AND date(created_at) >= ? 
        GROUP BY date(created_at) ORDER BY date`).bind(weekAgo).all(),
      
      env.DB.prepare(`SELECT 
        SUM(CASE WHEN status = 'out_for_delivery' THEN 1 ELSE 0 END) as out_for_delivery,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        SUM(CASE WHEN delivery_type = 'delivery' AND status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) as pending
        FROM orders`).first(),
    ]);

    const statusMap = {};
    for (const r of statusCounts.results) statusMap[r.status] = r.count;

    return jsonResponse({
      today: todayStats,
      statuses: statusMap,
      page_sizes: pageSizeStats.results,
      payment_methods: paymentStats.results,
      recent_orders: recentOrders.results,
      print_queue: queueSummary.results,
      top_customers: topCustomers.results,
      weekly_revenue: weeklyRevenue.results,
      delivery: deliveryStats
    });
  }

  // GET /api/admin/users - list users
  if (path === '/api/admin/users' && method === 'GET') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const { offset, limit, page } = paginate(url.searchParams.get('page'));
    const role = url.searchParams.get('role');

    let query = 'SELECT id, name, email, phone, role, is_active, created_at FROM users';
    const params = [];
    if (role) { query += ' WHERE role = ?'; params.push(role); }
    query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const users = await env.DB.prepare(query).bind(...params).all();
    return jsonResponse({ users: users.results });
  }

  // POST /api/admin/users - create staff/delivery user
  if (path === '/api/admin/users' && method === 'POST') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const { name, email, phone, password, role } = await request.json();

    if (!['staff', 'delivery', 'admin'].includes(role)) {
      return jsonResponse({ error: 'Invalid role' }, 400);
    }

    const hash = await hashPassword(password || 'changeme123');
    const newUser = await env.DB.prepare(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?) RETURNING id, name, email, role'
    ).bind(name, email, phone, hash, role).first();

    return jsonResponse({ user: newUser }, 201);
  }

  // PATCH /api/admin/users/:id
  const userMatch = path.match(/^\/api\/admin\/users\/(\d+)$/);
  if (userMatch && method === 'PATCH') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const id = userMatch[1];
    const { is_active, role: newRole } = await request.json();

    if (is_active !== undefined) {
      await env.DB.prepare('UPDATE users SET is_active = ? WHERE id = ?').bind(is_active ? 1 : 0, id).run();
    }
    if (newRole) {
      await env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(newRole, id).run();
    }
    return jsonResponse({ message: 'User updated' });
  }

  // GET /api/admin/settings
  if (path === '/api/admin/settings' && method === 'GET') {
    const settings = await env.DB.prepare('SELECT key, value FROM settings').all();
    const map = {};
    for (const s of settings.results) map[s.key] = s.value;
    return jsonResponse({ settings: map });
  }

  // PUT /api/admin/settings
  if (path === '/api/admin/settings' && method === 'PUT') {
    if (user.role !== 'admin') return jsonResponse({ error: 'Admin only' }, 403);
    const updates = await request.json();
    
    for (const [key, value] of Object.entries(updates)) {
      await env.DB.prepare(
        'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime(\'now\')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
      ).bind(key, String(value)).run();
    }
    return jsonResponse({ message: 'Settings updated' });
  }

  // GET /api/admin/analytics
  if (path === '/api/admin/analytics' && method === 'GET') {
    const days = parseInt(url.searchParams.get('days') || '30');
    const from = new Date(Date.now() - days * 86400000).toISOString().split('T')[0];

    const [dailyOrders, printTypeStats, deliveryStats, peakHours] = await Promise.all([
      env.DB.prepare(`SELECT date(created_at) as date, COUNT(*) as orders, COALESCE(SUM(total_amount),0) as revenue 
        FROM orders WHERE date(created_at) >= ? GROUP BY date(created_at) ORDER BY date`).bind(from).all(),
      
      env.DB.prepare(`SELECT print_type, COUNT(*) as count FROM orders GROUP BY print_type`).all(),
      
      env.DB.prepare(`SELECT delivery_type, COUNT(*) as count FROM orders GROUP BY delivery_type`).all(),
      
      env.DB.prepare(`SELECT strftime('%H', created_at) as hour, COUNT(*) as count 
        FROM orders GROUP BY hour ORDER BY count DESC LIMIT 5`).all(),
    ]);

    return jsonResponse({
      daily: dailyOrders.results,
      print_types: printTypeStats.results,
      delivery_types: deliveryStats.results,
      peak_hours: peakHours.results
    });
  }

  return jsonResponse({ error: 'Admin endpoint not found' }, 404);
}