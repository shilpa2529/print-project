import { jsonResponse } from '../lib/helpers.js';
import { requireAuth } from '../lib/auth.js';

export async function handleFiles(request, env, path, authResult) {
  const authError = requireAuth(authResult);
  if (authError) return authError;

  const user = authResult.user;
  const method = request.method;

  // POST /api/files/upload-url - get presigned R2 upload URL
  if (path === '/api/files/upload-url' && method === 'POST') {
    const { filename, mime_type, size } = await request.json();
    if (!filename) return jsonResponse({ error: 'Filename required' }, 400);

    const sanitized = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const r2_key = `uploads/${user.id}/${Date.now()}_${sanitized}`;

    // Store file record
    const file = await env.DB.prepare(`
      INSERT INTO files (user_id, original_name, r2_key, size_bytes, mime_type, upload_status)
      VALUES (?, ?, ?, ?, ?, 'pending') RETURNING *
    `).bind(user.id, filename, r2_key, size || 0, mime_type || 'application/pdf').first();

    // Generate a signed upload URL (R2 presigned)
    // Since Cloudflare Workers R2 doesn't have native presigned URLs in all tiers,
    // we return the upload endpoint to proxy through worker
    return jsonResponse({
      file_id: file.id,
      r2_key,
      upload_endpoint: `/api/files/${file.id}/upload`
    });
  }

  // PUT /api/files/:id/upload - direct upload to R2 via worker proxy
  const uploadMatch = path.match(/^\/api\/files\/(\d+)\/upload$/);
  if (uploadMatch && method === 'PUT') {
    const fileId = uploadMatch[1];
    const fileRecord = await env.DB.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
      .bind(fileId, user.id).first();

    if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);

    const body = request.body;
    if (!body) return jsonResponse({ error: 'No file content' }, 400);

    await env.FILES.put(fileRecord.r2_key, body, {
      httpMetadata: { contentType: fileRecord.mime_type }
    });

    await env.DB.prepare(
      'UPDATE files SET upload_status = \'ready\', updated_at = datetime(\'now\') WHERE id = ?'
    ).bind(fileId).run(); // page_count would need PDF parsing (done client-side or via external service)

    return jsonResponse({ message: 'File uploaded', file_id: fileId, r2_key: fileRecord.r2_key });
  }

  // PATCH /api/files/:id/pages - update page count after client-side detection
  const pagesMatch = path.match(/^\/api\/files\/(\d+)\/pages$/);
  if (pagesMatch && method === 'PATCH') {
    const fileId = pagesMatch[1];
    const { page_count } = await request.json();

    await env.DB.prepare('UPDATE files SET page_count = ? WHERE id = ? AND user_id = ?')
      .bind(page_count, fileId, user.id).run();

    return jsonResponse({ message: 'Page count updated' });
  }

  // GET /api/files/:id/download - get signed download URL
  const downloadMatch = path.match(/^\/api\/files\/(\d+)\/download$/);
  if (downloadMatch && method === 'GET') {
    const fileId = downloadMatch[1];
    const fileRecord = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();

    if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);

    // Check ownership (customers can only download their own files, admin can download all)
    if (user.role === 'customer' && fileRecord.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    // Stream the file from R2
    const object = await env.FILES.get(fileRecord.r2_key);
    if (!object) return jsonResponse({ error: 'File not found in storage' }, 404);

    return new Response(object.body, {
      headers: {
        'Content-Type': fileRecord.mime_type || 'application/pdf',
        'Content-Disposition': `attachment; filename="${fileRecord.original_name}"`,
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // GET /api/files/:id/view - stream file for preview
  const viewMatch = path.match(/^\/api\/files\/(\d+)\/view$/);
  if (viewMatch && method === 'GET') {
    const fileId = viewMatch[1];
    const fileRecord = await env.DB.prepare('SELECT * FROM files WHERE id = ?').bind(fileId).first();

    if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);
    if (user.role === 'customer' && fileRecord.user_id !== user.id) {
      return jsonResponse({ error: 'Forbidden' }, 403);
    }

    const object = await env.FILES.get(fileRecord.r2_key);
    if (!object) return jsonResponse({ error: 'File not in storage' }, 404);

    return new Response(object.body, {
      headers: {
        'Content-Type': fileRecord.mime_type || 'application/pdf',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }

  // DELETE /api/files/:id
  const deleteMatch = path.match(/^\/api\/files\/(\d+)$/);
  if (deleteMatch && method === 'DELETE') {
    const fileId = deleteMatch[1];
    const fileRecord = await env.DB.prepare('SELECT * FROM files WHERE id = ? AND user_id = ?')
      .bind(fileId, user.id).first();

    if (!fileRecord) return jsonResponse({ error: 'File not found' }, 404);

    // Check not linked to active order
    const linked = await env.DB.prepare(
      'SELECT o.id FROM order_files of2 JOIN orders o ON of2.order_id = o.id WHERE of2.file_id = ? AND o.status NOT IN (\'delivered\', \'cancelled\')'
    ).bind(fileId).first();

    if (linked) return jsonResponse({ error: 'File is linked to an active order' }, 409);

    await env.FILES.delete(fileRecord.r2_key);
    await env.DB.prepare('DELETE FROM files WHERE id = ?').bind(fileId).run();

    return jsonResponse({ message: 'File deleted' });
  }

  return jsonResponse({ error: 'File endpoint not found' }, 404);
}