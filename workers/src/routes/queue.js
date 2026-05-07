import { jsonResponse } from '../lib/helpers.js';
import { requireRole } from '../lib/auth.js';

export async function handleQueue(request, env, path, authResult) {
  const roleError = requireRole(authResult, ['admin', 'staff']);
  if (roleError) return roleError;

  const method = request.method;
  const url = new URL(request.url);

  // GET /api/queue - get print queue
  if (path === '/api/queue' && method === 'GET') {
    const page_size = url.searchParams.get('page_size');
    const status = url.searchParams.get('status') || 'queued';

    let query = `
      SELECT pq.*, o.order_number, o.customer_name, o.customer_phone, 
        o.page_size, o.print_type, o.copies, o.total_pages, o.print_sides,
        GROUP_CONCAT(f.original_name) as file_names,
        GROUP_CONCAT(f.r2_key) as r2_keys
      FROM print_queue pq
      JOIN orders o ON pq.order_id = o.id
      LEFT JOIN order_files of2 ON o.id = of2.order_id
      LEFT JOIN files f ON of2.file_id = f.id
      WHERE pq.status = ?
    `;
    const params = [status];

    if (page_size) {
      query += ' AND pq.page_size = ?';
      params.push(page_size);
    }

    query += ' GROUP BY pq.id ORDER BY pq.queue_position ASC, pq.added_at ASC';

    const queue = await env.DB.prepare(query).bind(...params).all();

    // Get summary counts by page size
    const summary = await env.DB.prepare(`
      SELECT pq.page_size, COUNT(*) as order_count, COALESCE(SUM(o.total_pages), 0) as total_pages
      FROM print_queue pq JOIN orders o ON pq.order_id = o.id
      WHERE pq.status = 'queued'
      GROUP BY pq.page_size
    `).all();

    return jsonResponse({ queue: queue.results, summary: summary.results });
  }

  // PATCH /api/queue/:id/status - update queue item status
  const queueStatusMatch = path.match(/^\/api\/queue\/(\d+)\/status$/);
  if (queueStatusMatch && method === 'PATCH') {
    const id = queueStatusMatch[1];
    const { status, batch_id } = await request.json();

    const validStatuses = ['queued', 'processing', 'printed', 'error'];
    if (!validStatuses.includes(status)) return jsonResponse({ error: 'Invalid status' }, 400);

    await env.DB.prepare(`
      UPDATE print_queue SET status = ?, batch_id = ?, 
        printed_at = CASE WHEN ? = 'printed' THEN datetime('now') ELSE printed_at END
      WHERE id = ?
    `).bind(status, batch_id || null, status, id).run();

    // If printed, update order status
    if (status === 'printed') {
      const queueItem = await env.DB.prepare('SELECT order_id FROM print_queue WHERE id = ?').bind(id).first();
      await env.DB.prepare(
        'UPDATE orders SET status = \'ready\', updated_at = datetime(\'now\') WHERE id = ?'
      ).bind(queueItem.order_id).run();
    }

    return jsonResponse({ message: 'Queue status updated' });
  }

  // POST /api/queue/batch - create a batch of queue items for same page size
  if (path === '/api/queue/batch' && method === 'POST') {
    const { page_size, separator_pages = 1 } = await request.json();
    const batchId = `BATCH_${page_size}_${Date.now()}`;

    // Get all queued items for this page size
    const items = await env.DB.prepare(
      'SELECT * FROM print_queue WHERE page_size = ? AND status = \'queued\' ORDER BY added_at ASC'
    ).bind(page_size).all();

    if (!items.results.length) return jsonResponse({ error: 'No queued items for this page size' }, 404);

    // Update all to batch
    for (const item of items.results) {
      await env.DB.prepare(
        'UPDATE print_queue SET batch_id = ?, separator_pages = ?, status = \'processing\' WHERE id = ?'
      ).bind(batchId, separator_pages, item.id).run();
    }

    // Collect file keys for merged PDF download
    const fileKeys = [];
    for (const item of items.results) {
      const files = await env.DB.prepare(`
        SELECT f.r2_key, f.original_name FROM files f
        JOIN order_files of2 ON f.id = of2.file_id
        WHERE of2.order_id = ? ORDER BY of2.print_order
      `).bind(item.order_id).all();
      fileKeys.push({ order_id: item.order_id, files: files.results });
    }

    return jsonResponse({
      batch_id: batchId,
      item_count: items.results.length,
      page_size,
      separator_pages,
      file_groups: fileKeys
    });
  }

  // DELETE /api/queue/:id - remove from queue
  const queueDeleteMatch = path.match(/^\/api\/queue\/(\d+)$/);
  if (queueDeleteMatch && method === 'DELETE') {
    const id = queueDeleteMatch[1];
    await env.DB.prepare('DELETE FROM print_queue WHERE id = ?').bind(id).run();
    return jsonResponse({ message: 'Removed from queue' });
  }

  // PUT /api/queue/reorder - reorder queue positions
  if (path === '/api/queue/reorder' && method === 'PUT') {
    const { positions } = await request.json(); // [{ id, position }]
    for (const p of positions) {
      await env.DB.prepare('UPDATE print_queue SET queue_position = ? WHERE id = ?')
        .bind(p.position, p.id).run();
    }
    return jsonResponse({ message: 'Queue reordered' });
  }

  return jsonResponse({ error: 'Queue endpoint not found' }, 404);
}