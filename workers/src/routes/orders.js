import { jsonResponse, generateOrderNumber, paginate } from '../lib/helpers.js';
import { requireAuth } from '../lib/auth.js';

export async function handleOrders(request, env, path, authResult) {
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const user = authResult.user;
  const method = request.method;
  const url = new URL(request.url);

  // GET /api/orders - list orders
  if (path === '/api/orders' && method === 'GET') {
    const { offset, limit, page } = paginate(url.searchParams.get('page'), url.searchParams.get('limit'));
    const status = url.searchParams.get('status');
    const search = url.searchParams.get('search');

    let query, countQuery;
    const params = [];

    if (user.role === 'customer') {
      // Customers see only their orders
      let where = 'WHERE o.user_id = ?';
      params.push(user.id);
      if (status) { where += ' AND o.status = ?'; params.push(status); }

      query = `SELECT o.*, GROUP_CONCAT(f.original_name) as file_names 
               FROM orders o 
               LEFT JOIN order_files of2 ON o.id = of2.order_id 
               LEFT JOIN files f ON of2.file_id = f.id 
               ${where} GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM orders o ${where}`;
    } else {
      // Admin/staff see all orders
      let where = 'WHERE 1=1';
      if (status) { where += ' AND o.status = ?'; params.push(status); }
      if (search) { 
        where += ' AND (o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.order_number LIKE ?)'; 
        params.push(`%${search}%`, `%${search}%`, `%${search}%`); 
      }

      query = `SELECT o.*, GROUP_CONCAT(f.original_name) as file_names 
               FROM orders o 
               LEFT JOIN order_files of2 ON o.id = of2.order_id 
               LEFT JOIN files f ON of2.file_id = f.id 
               ${where} GROUP BY o.id ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
      countQuery = `SELECT COUNT(*) as total FROM orders o ${where}`;
    }

    const [orders, countResult] = await Promise.all([
      env.DB.prepare(query).bind(...params, limit, offset).all(),
      env.DB.prepare(countQuery).bind(...params).first()
    ]);

    return jsonResponse({
      orders: orders.results,
      pagination: { page, limit, total: countResult.total, pages: Math.ceil(countResult.total / limit) }
    });
  }

  // POST /api/orders - create order
  if (path === '/api/orders' && method === 'POST') {
    const body = await request.json();
    const {
      file_ids, page_size = 'A4', print_type = 'bw',
      copies = 1, page_range = 'all', print_sides = 'single',
      delivery_type = 'pickup', address_id = null,
      customer_name, customer_phone, customer_email,
      total_pages, subtotal, delivery_charge, total_amount
    } = body;

    if (!file_ids?.length) return jsonResponse({ error: 'At least one file required' }, 400);
    if (!customer_name || !customer_phone) return jsonResponse({ error: 'Customer name and phone required' }, 400);

    const order_number = generateOrderNumber();

    const order = await env.DB.prepare(`
      INSERT INTO orders (
        order_number, user_id, customer_name, customer_phone, customer_email,
        page_size, print_type, copies, page_range, print_sides,
        total_pages, subtotal, delivery_charge, total_amount,
        delivery_type, address_id, status, payment_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'placed', 'pending')
      RETURNING *
    `).bind(
      order_number, user.id, customer_name, customer_phone, customer_email || null,
      page_size, print_type, copies, page_range, print_sides,
      total_pages, subtotal, delivery_charge, total_amount,
      delivery_type, address_id
    ).first();

    // Link files to order
    for (let i = 0; i < file_ids.length; i++) {
      await env.DB.prepare(
        'INSERT INTO order_files (order_id, file_id, print_order) VALUES (?, ?, ?)'
      ).bind(order.id, file_ids[i], i).run();
    }

    // Log activity
    await env.DB.prepare(
      'INSERT INTO activity_log (order_id, user_id, action, details) VALUES (?, ?, ?, ?)'
    ).bind(order.id, user.id, 'order_placed', JSON.stringify({ order_number })).run();

    return jsonResponse({ order }, 201);
  }

  // GET /api/orders/:id
  const idMatch = path.match(/^\/api\/orders\/(\d+)$/);
  if (idMatch && method === 'GET') {
    const id = idMatch[1];
    const order = await env.DB.prepare(`
      SELECT o.*, 
        a.line1, a.line2, a.city, a.state, a.pincode
      FROM orders o
      LEFT JOIN addresses a ON o.address_id = a.id
      WHERE o.id = ?
    `).bind(id).first();

    if (!order) return jsonResponse({ error: 'Order not found' }, 404);
    if (user.role === 'customer' && order.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Get files
    const files = await env.DB.prepare(`
      SELECT f.*, of2.print_order FROM files f
      JOIN order_files of2 ON f.id = of2.file_id
      WHERE of2.order_id = ? ORDER BY of2.print_order
    `).bind(id).all();

    // Get invoice
    const invoice = await env.DB.prepare('SELECT * FROM invoices WHERE order_id = ?').bind(id).first();

    return jsonResponse({ order, files: files.results, invoice });
  }

  // PATCH /api/orders/:id/status - update status
  const statusMatch = path.match(/^\/api\/orders\/(\d+)\/status$/);
  if (statusMatch && method === 'PATCH') {
    if (!['admin', 'staff', 'delivery'].includes(user.role)) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const id = statusMatch[1];
    const { status } = await request.json();
    const validStatuses = ['placed', 'paid', 'printing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];
    if (!validStatuses.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400);

    await env.DB.prepare(
      'UPDATE orders SET status = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(status, id).run();

    // If printing, add to print queue
    if (status === 'printing') {
      const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(id).first();
      await env.DB.prepare(
        'INSERT OR IGNORE INTO print_queue (order_id, page_size, status) VALUES (?, ?, \'queued\')'
      ).bind(id, order.page_size).run();
    }

    await env.DB.prepare(
      'INSERT INTO activity_log (order_id, user_id, action, details) VALUES (?, ?, ?, ?)'
    ).bind(id, user.id, 'status_updated', JSON.stringify({ status })).run();

    return jsonResponse({ message: 'Status updated', status });
  }

  // GET /api/orders/stats - dashboard stats
  if (path === '/api/orders/stats' && method === 'GET') {
    if (!['admin', 'staff'].includes(user.role)) return jsonResponse({ error: 'Forbidden' }, 403);

    const today = new Date().toISOString().split('T')[0];
    const [todayOrders, statusCounts, revenue, recentOrders] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) as count FROM orders WHERE date(created_at) = ?').bind(today).first(),
      env.DB.prepare('SELECT status, COUNT(*) as count FROM orders GROUP BY status').all(),
      env.DB.prepare('SELECT SUM(total_amount) as total FROM orders WHERE payment_status = \'paid\' AND date(created_at) = ?').bind(today).first(),
      env.DB.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 5').all()
    ]);

    const statusMap = {};
    for (const row of statusCounts.results) statusMap[row.status] = row.count;

    return jsonResponse({
      today: { orders: todayOrders.count, revenue: revenue.total || 0 },
      statuses: statusMap,
      recent_orders: recentOrders.results
    });
  }

  return jsonResponse({ error: 'Order endpoint not found' }, 404);
}