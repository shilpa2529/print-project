import { jsonResponse } from '../lib/helpers.js';
import { requireRole } from '../lib/auth.js';

export async function handlePricing(request, env, path, authResult) {
  const method = request.method;

  // GET /api/pricing - public endpoint for pricing
  if (path === '/api/pricing' && method === 'GET') {
    const [pricing, delivery] = await Promise.all([
      env.DB.prepare('SELECT * FROM pricing').all(),
      env.DB.prepare('SELECT * FROM delivery_charges ORDER BY id DESC LIMIT 1').first()
    ]);

    return jsonResponse({ pricing: pricing.results, delivery });
  }

  // PUT /api/pricing - admin update pricing
  if (path === '/api/pricing' && method === 'PUT') {
    const roleError = requireRole(authResult, ['admin']);
    if (roleError) return roleError;

    const { pricing, delivery } = await request.json();

    // Update pricing rows
    for (const p of pricing || []) {
      await env.DB.prepare(`
        UPDATE pricing SET single_side_rate = ?, double_side_rate = ?, updated_at = datetime('now')
        WHERE page_size = ? AND print_type = ?
      `).bind(p.single_side_rate, p.double_side_rate, p.page_size, p.print_type).run();
    }

    // Update delivery
    if (delivery) {
      await env.DB.prepare(
        'UPDATE delivery_charges SET charge = ?, free_above = ?, updated_at = datetime(\'now\') WHERE id = 1'
      ).bind(delivery.charge, delivery.free_above).run();
    }

    return jsonResponse({ message: 'Pricing updated' });
  }

  // POST /api/pricing/calculate - calculate price for a configuration
  if (path === '/api/pricing/calculate' && method === 'POST') {
    const { page_size, print_type, copies, total_pages, print_sides, delivery_type } = await request.json();

    const priceRow = await env.DB.prepare(
      'SELECT * FROM pricing WHERE page_size = ? AND print_type = ?'
    ).bind(page_size || 'A4', print_type || 'bw').first();

    if (!priceRow) return jsonResponse({ error: 'Pricing not found for this configuration' }, 404);

    const rate = print_sides === 'double' ? priceRow.double_side_rate : priceRow.single_side_rate;
    const subtotal = rate * (total_pages || 1) * (copies || 1);

    let delivery_charge = 0;
    if (delivery_type === 'delivery') {
      const deliveryRow = await env.DB.prepare('SELECT * FROM delivery_charges LIMIT 1').first();
      delivery_charge = subtotal >= (deliveryRow?.free_above || 500) ? 0 : (deliveryRow?.charge || 30);
    }

    return jsonResponse({
      rate,
      subtotal,
      delivery_charge,
      total: subtotal + delivery_charge
    });
  }

  return jsonResponse({ error: 'Pricing endpoint not found' }, 404);
}