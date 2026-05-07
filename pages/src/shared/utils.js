// Format currency in INR
export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(amount || 0);
}

// Format date
export function formatDate(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

// Status badge HTML
export function statusBadge(status) {
  const map = {
    placed: ['#6366f1', 'Placed'],
    paid: ['#3b82f6', 'Paid'],
    printing: ['#f59e0b', 'Printing'],
    ready: ['#10b981', 'Ready'],
    out_for_delivery: ['#8b5cf6', 'Out for Delivery'],
    delivered: ['#22c55e', 'Delivered'],
    cancelled: ['#ef4444', 'Cancelled'],
    pending: ['#9ca3af', 'Pending'],
    failed: ['#ef4444', 'Failed'],
    refunded: ['#06b6d4', 'Refunded'],
    queued: ['#6366f1', 'Queued'],
    processing: ['#f59e0b', 'Processing'],
    printed: ['#10b981', 'Printed'],
    error: ['#ef4444', 'Error'],
    cod: ['#f59e0b', 'COD'],
  };
  const [color, label] = map[status] || ['#9ca3af', status];
  return `<span class="badge" style="background:${color}20;color:${color};border:1px solid ${color}40">${label}</span>`;
}

// Toast notifications
export function toast(message, type = 'info') {
  const colors = { success: '#10b981', error: '#ef4444', info: '#3b82f6', warning: '#f59e0b' };
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.cssText = `
    position:fixed;bottom:24px;right:24px;z-index:9999;
    background:${colors[type]};color:white;
    padding:12px 20px;border-radius:10px;
    font-weight:500;font-size:14px;
    box-shadow:0 8px 32px ${colors[type]}40;
    animation:slideUp 0.3s ease;max-width:340px;
    line-height:1.4;
  `;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => { el.style.animation = 'slideDown 0.3s ease'; setTimeout(() => el.remove(), 300); }, 3500);
}

// Confirm modal
export function confirm(message) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';
    overlay.innerHTML = `
      <div style="background:var(--card);border-radius:16px;padding:32px;max-width:400px;width:90%;box-shadow:0 32px 64px rgba(0,0,0,0.3);">
        <h3 style="margin:0 0 12px;font-size:18px;">Confirm Action</h3>
        <p style="margin:0 0 24px;color:var(--text-secondary);">${message}</p>
        <div style="display:flex;gap:12px;justify-content:flex-end;">
          <button id="cancel-btn" class="btn btn-secondary">Cancel</button>
          <button id="confirm-btn" class="btn btn-primary">Confirm</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#cancel-btn').onclick = () => { overlay.remove(); resolve(false); };
    overlay.querySelector('#confirm-btn').onclick = () => { overlay.remove(); resolve(true); };
  });
}

// Loading state
export function setLoading(btn, loading) {
  if (loading) {
    btn._text = btn.textContent;
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner"></span>';
  } else {
    btn.disabled = false;
    btn.textContent = btn._text;
  }
}

// Debounce
export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); };
}

// Get user from localStorage
export function getUser() {
  try { return JSON.parse(localStorage.getItem('qp_user') || 'null'); } catch { return null; }
}
export function setUser(user) {
  localStorage.setItem('qp_user', JSON.stringify(user));
}