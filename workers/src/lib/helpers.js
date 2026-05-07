import { corsHeaders } from './cors.js';

export function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders }
  });
}

export function generateOrderNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000) + 1000;
  return `QP${yy}${mm}${dd}${rand}`;
}

export function generateInvoiceNumber() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const rand = Math.floor(Math.random() * 90000) + 10000;
  return `INV${yy}${mm}${rand}`;
}

export function paginate(page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, Math.max(1, parseInt(limit)));
  return { offset: (p - 1) * l, limit: l, page: p };
}

export function parsePathParams(path, pattern) {
  const patternParts = pattern.split('/');
  const pathParts = path.split('/');
  const params = {};
  
  if (patternParts.length !== pathParts.length) return null;
  
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(':')) {
      params[patternParts[i].slice(1)] = pathParts[i];
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

export function matchRoute(path, routes) {
  for (const [pattern, handler] of routes) {
    const params = parsePathParams(path, pattern);
    if (params !== null) return { handler, params };
  }
  return null;
}