/**
 * QuickPrint API Client
 * Shared across customer and admin portals
 */

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('qp_token');
  }

  setToken(token) {
    this.token = token;
    if (token) localStorage.setItem('qp_token', token);
    else localStorage.removeItem('qp_token');
  }

  getToken() {
    return this.token || localStorage.getItem('qp_token');
  }

  clearAuth() {
    this.token = null;
    localStorage.removeItem('qp_token');
    localStorage.removeItem('qp_user');
  }

  async request(method, path, body = null, isFormData = false) {
    const headers = {};
    const token = this.getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (!isFormData) headers['Content-Type'] = 'application/json';

    const options = { method, headers };
    if (body) {
      options.body = isFormData ? body : JSON.stringify(body);
    }

    const res = await fetch(`${API_BASE}${path}`, options);
    const data = await res.json().catch(() => ({ error: 'Invalid response' }));

    if (res.status === 401) {
      // Don't redirect if this IS the login/auth request itself
      if (!path.startsWith('/auth')) {
        this.clearAuth();
        window.location.href = window.location.pathname.includes('admin')
          ? '/admin.html'
          : '/index.html';
      }
      throw new Error(data.error || 'Session expired');  // show real server error
    }

    if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  get(path) { return this.request('GET', path); }
  post(path, body) { return this.request('POST', path, body); }
  put(path, body) { return this.request('PUT', path, body); }
  patch(path, body) { return this.request('PATCH', path, body); }
  delete(path) { return this.request('DELETE', path); }

  // Auth
  login(email, password) { return this.post('/auth/login', { email, password }); }
  adminLogin(email, password) { return this.post('/auth/admin-login', { email, password }); }
  register(data) { return this.post('/auth/register', data); }
  me() { return this.get('/auth/me'); }

  // Pricing
  getPricing() { return this.get('/pricing'); }
  calculatePrice(data) { return this.post('/pricing/calculate', data); }

  // Orders
  getOrders(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/orders${q ? '?' + q : ''}`);
  }
  getOrder(id) { return this.get(`/orders/${id}`); }
  createOrder(data) { return this.post('/orders', data); }
  updateOrderStatus(id, status) { return this.patch(`/orders/${id}/status`, { status }); }
  getOrderStats() { return this.get('/orders/stats'); }

  // Files - upload via fetch directly for binary
  async uploadFile(fileId, file) {
    const token = this.getToken();
    const res = await fetch(`${API_BASE}/files/${fileId}/upload`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': file.type || 'application/pdf',
      },
      body: file
    });
    if (!res.ok) throw new Error('File upload failed');
    return res.json();
  }

  async getUploadUrl(filename, mime_type, size) {
    return this.post('/files/upload-url', { filename, mime_type, size });
  }

  updatePageCount(fileId, page_count) {
    return this.patch(`/files/${fileId}/pages`, { page_count });
  }

  getFileViewUrl(fileId) {
    return `${API_BASE}/files/${fileId}/view?token=${this.getToken()}`;
  }

  getFileDownloadUrl(fileId) {
    return `${API_BASE}/files/${fileId}/download?token=${this.getToken()}`;
  }

  // Payments
  createPaymentOrder(order_id) { return this.post('/payments/create-order', { order_id }); }
  verifyPayment(data) { return this.post('/payments/verify', data); }
  codOrder(order_id) { return this.post('/payments/cod', { order_id }); }
  confirmCod(order_id) { return this.post('/payments/cod-confirm', { order_id }); }
  getTransactions(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/payments/transactions${q ? '?' + q : ''}`);
  }

  // Admin
  getDashboard() { return this.get('/admin/dashboard'); }
  getUsers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/admin/users${q ? '?' + q : ''}`);
  }
  createUser(data) { return this.post('/admin/users', data); }
  updateUser(id, data) { return this.patch(`/admin/users/${id}`, data); }
  getSettings() { return this.get('/admin/settings'); }
  updateSettings(data) { return this.put('/admin/settings', data); }
  getAnalytics(days = 30) { return this.get(`/admin/analytics?days=${days}`); }

  // Queue
  getQueue(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get(`/queue${q ? '?' + q : ''}`);
  }
  updateQueueStatus(id, status, batch_id) { return this.patch(`/queue/${id}/status`, { status, batch_id }); }
  createBatch(page_size, separator_pages) { return this.post('/queue/batch', { page_size, separator_pages }); }
  removeFromQueue(id) { return this.delete(`/queue/${id}`); }

  // Delivery
  getDeliveryOrders(status) { return this.get(`/delivery${status ? '?status=' + status : ''}`); }
  dispatchOrder(id) { return this.patch(`/delivery/${id}/dispatch`, {}); }
  completeDelivery(id) { return this.patch(`/delivery/${id}/complete`, {}); }
  getAddresses() { return this.get('/delivery/addresses'); }
  addAddress(data) { return this.post('/delivery/addresses', data); }

  // Invoices
  getInvoices() { return this.get('/invoices'); }
  getInvoice(id) { return this.get(`/invoices/${id}`); }
  getInvoiceByOrder(orderId) { return this.get(`/invoices/by-order/${orderId}`); }
}

window.api = new ApiClient();
export default window.api;