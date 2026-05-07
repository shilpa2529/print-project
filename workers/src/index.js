/**
 * QuickPrint API - Cloudflare Worker
 * Main router entry point
 */

import { handleAuth } from './routes/auth.js';
import { handleOrders } from './routes/orders.js';
import { handleFiles } from './routes/files.js';
import { handlePayments } from './routes/payments.js';
import { handleAdmin } from './routes/admin.js';
import { handlePricing } from './routes/pricing.js';
import { handleDelivery } from './routes/delivery.js';
import { handleQueue } from './routes/queue.js';
import { handleInvoices } from './routes/invoices.js';
import { corsHeaders, handleOptions } from './lib/cors.js';
import { verifyJWT } from './lib/auth.js';
import { jsonResponse } from './lib/helpers.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return handleOptions(request, env);
    }

    try {
      // Route matching
      if (path.startsWith('/api/auth')) {
        return await handleAuth(request, env, path);
      }

      // Protected routes - verify JWT
      const authResult = await verifyJWT(request, env);
      
      if (path.startsWith('/api/files')) {
        return await handleFiles(request, env, path, authResult);
      }
      if (path.startsWith('/api/orders')) {
        return await handleOrders(request, env, path, authResult);
      }
      if (path.startsWith('/api/payments')) {
        return await handlePayments(request, env, path, authResult);
      }
      if (path.startsWith('/api/admin')) {
        return await handleAdmin(request, env, path, authResult);
      }
      if (path.startsWith('/api/pricing')) {
        return await handlePricing(request, env, path, authResult);
      }
      if (path.startsWith('/api/delivery')) {
        return await handleDelivery(request, env, path, authResult);
      }
      if (path.startsWith('/api/queue')) {
        return await handleQueue(request, env, path, authResult);
      }
      if (path.startsWith('/api/invoices')) {
        return await handleInvoices(request, env, path, authResult);
      }

      return jsonResponse({ error: 'Not found' }, 404);
    } catch (err) {
      console.error('Worker error:', err);
      return jsonResponse({ error: 'Internal server error', message: err.message }, 500);
    }
  }
};

