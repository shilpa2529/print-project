import { jsonResponse, generateInvoiceNumber } from '../lib/helpers.js';
import { requireAuth } from '../lib/auth.js';

/**
 * Create Razorpay HMAC signature for verification
 */
async function createHmacSha256(secret, data) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handlePayments(request, env, path, authResult) {
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const user = authResult.user;
  const method = request.method;

  // POST /api/payments/create-order - create Razorpay order
  if (path === '/api/payments/create-order' && method === 'POST') {
    const { order_id } = await request.json();

    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, 404);
    if (order.user_id !== user.id && user.role === 'customer') {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Amount in paise (multiply by 100)
    const amountPaise = Math.round(order.total_amount * 100);

    const razorpayOrder = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`)}`
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: order.order_number,
        notes: {
          order_id: order_id,
          customer_name: order.customer_name,
          customer_phone: order.customer_phone
        }
      })
    });

    if (!razorpayOrder.ok) {
      const err = await razorpayOrder.json();
      console.error('Razorpay order creation failed:', err);
      return jsonResponse({ error: 'Payment gateway error', details: err }, 502);
    }

    const rzpOrder = await razorpayOrder.json();

    // Store Razorpay order ID
    await env.DB.prepare(
      'UPDATE orders SET razorpay_order_id = ?, updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(rzpOrder.id, order_id).run();

    return jsonResponse({
      razorpay_order_id: rzpOrder.id,
      amount: amountPaise,
      currency: 'INR',
      key_id: env.RAZORPAY_KEY_ID,
      order_number: order.order_number,
      customer_name: order.customer_name,
      customer_phone: order.customer_phone,
      customer_email: order.customer_email
    });
  }

  // POST /api/payments/verify - verify Razorpay payment
  if (path === '/api/payments/verify' && method === 'POST') {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, order_id, payment_method } = await request.json();

    // Verify signature
    const expectedSig = await createHmacSha256(
      env.RAZORPAY_KEY_SECRET,
      `${razorpay_order_id}|${razorpay_payment_id}`
    );

    if (expectedSig !== razorpay_signature) {
      return jsonResponse({ error: 'Payment verification failed: signature mismatch' }, 400);
    }

    // Update order
    await env.DB.prepare(`
      UPDATE orders SET 
        status = 'paid', 
        payment_status = 'paid',
        payment_method = ?,
        razorpay_payment_id = ?,
        updated_at = datetime('now')
      WHERE id = ?
    `).bind(payment_method || 'upi', razorpay_payment_id, order_id).run();

    // Add to print queue
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first();
    await env.DB.prepare(
      'INSERT OR IGNORE INTO print_queue (order_id, page_size, status) VALUES (?, ?, \'queued\')'
    ).bind(order_id, order.page_size).run();

    // Generate invoice number
    const invoiceNum = generateInvoiceNumber();
    await env.DB.prepare(
      'INSERT INTO invoices (invoice_number, order_id) VALUES (?, ?)'
    ).bind(invoiceNum, order_id).run();

    // Log activity
    await env.DB.prepare(
      'INSERT INTO activity_log (order_id, user_id, action, details) VALUES (?, ?, \'payment_verified\', ?)'
    ).bind(order_id, user.id, JSON.stringify({ razorpay_payment_id, payment_method })).run();

    return jsonResponse({
      success: true,
      message: 'Payment verified successfully',
      invoice_number: invoiceNum,
      order_number: order.order_number
    });
  }

  // POST /api/payments/cod - mark COD order as placed
  if (path === '/api/payments/cod' && method === 'POST') {
    const { order_id } = await request.json();
    const order = await env.DB.prepare('SELECT * FROM orders WHERE id = ?').bind(order_id).first();
    if (!order) return jsonResponse({ error: 'Order not found' }, 404);

    await env.DB.prepare(`
      UPDATE orders SET payment_method = 'cod', status = 'placed', payment_status = 'pending',
      updated_at = datetime('now') WHERE id = ?
    `).bind(order_id).run();

    const invoiceNum = generateInvoiceNumber();
    await env.DB.prepare('INSERT INTO invoices (invoice_number, order_id) VALUES (?, ?)').bind(invoiceNum, order_id).run();

    return jsonResponse({ success: true, invoice_number: invoiceNum });
  }

  // POST /api/payments/cod-confirm - admin confirms COD payment received
  if (path === '/api/payments/cod-confirm' && method === 'POST') {
    if (!['admin', 'staff'].includes(user.role)) return jsonResponse({ error: 'Forbidden' }, 403);
    const { order_id } = await request.json();

    await env.DB.prepare(`
      UPDATE orders SET payment_status = 'paid', status = 'paid', updated_at = datetime('now') WHERE id = ?
    `).bind(order_id).run();

    const order = await env.DB.prepare('SELECT page_size FROM orders WHERE id = ?').bind(order_id).first();
    await env.DB.prepare('INSERT OR IGNORE INTO print_queue (order_id, page_size, status) VALUES (?, ?, \'queued\')')
      .bind(order_id, order.page_size).run();

    return jsonResponse({ success: true, message: 'COD payment confirmed' });
  }

  // GET /api/payments/transactions - admin view
  if (path === '/api/payments/transactions' && method === 'GET') {
    if (!['admin', 'staff'].includes(user.role)) return jsonResponse({ error: 'Forbidden' }, 403);
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const transactions = await env.DB.prepare(`
      SELECT id, order_number, customer_name, customer_phone, total_amount,
        payment_status, payment_method, razorpay_payment_id, created_at
      FROM orders ORDER BY created_at DESC LIMIT ? OFFSET ?
    `).bind(limit, offset).all();

    return jsonResponse({ transactions: transactions.results });
  }

  // Razorpay webhook
  if (path === '/api/payments/webhook' && method === 'POST') {
    const body = await request.text();
    const sig = request.headers.get('X-Razorpay-Signature');

    const expected = await createHmacSha256(env.RAZORPAY_WEBHOOK_SECRET || env.RAZORPAY_KEY_SECRET, body);
    if (expected !== sig) {
      return new Response('Invalid signature', { status: 400 });
    }

    const event = JSON.parse(body);
    if (event.event === 'payment.failed') {
      const rzpOrderId = event.payload.payment.entity.order_id;
      await env.DB.prepare(
        'UPDATE orders SET payment_status = \'failed\', updated_at = datetime(\'now\') WHERE razorpay_order_id = ?'
      ).bind(rzpOrderId).run();
    }

    return new Response('OK', { status: 200 });
  }

  return jsonResponse({ error: 'Payment endpoint not found' }, 404);
}