import '../shared/api.js';
import { getUser, setUser, toast, formatCurrency, formatDate, statusBadge } from '../shared/utils.js';
import { renderAdminDashboard } from './pages/dashboard.js';
import { renderAdminOrders } from './pages/orders.js';
import { renderAdminQueue } from './pages/queue.js';
import { renderAdminPayments } from './pages/payments.js';
import { renderAdminDelivery } from './pages/delivery.js';
import { renderAdminInvoices } from './pages/invoices.js';
import { renderAdminPricing } from './pages/pricing.js';
import { renderAdminAnalytics } from './pages/analytics.js';
import { renderAdminUsers } from './pages/users.js';
import { renderAdminSettings } from './pages/settings.js';

Object.assign(window, { toast, formatCurrency, formatDate, statusBadge });

const NAV = [
  { section: 'Main' },
  { id: 'dashboard', label: 'Dashboard', icon: '📊' },
  { id: 'orders', label: 'Orders', icon: '📋', badge: 'pending' },
  { id: 'queue', label: 'Print Queue', icon: '🖨️', badge: 'queue' },
  { section: 'Finance' },
  { id: 'payments', label: 'Payments', icon: '💳' },
  { id: 'invoices', label: 'Invoices', icon: '🧾' },
  { id: 'pricing', label: 'Pricing', icon: '💰' },
  { section: 'Operations' },
  { id: 'delivery', label: 'Delivery', icon: '🚚', badge: 'delivery' },
  { id: 'customers', label: 'Customers', icon: '👥' },
  { section: 'Admin' },
  { id: 'analytics', label: 'Analytics', icon: '📈' },
  { id: 'users', label: 'Users & Roles', icon: '🔐' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

let currentPage = 'dashboard';
let adminUser = null;
let badgeCounts = {};

async function init() {
  const token = window.api.getToken();
  const user = getUser();

  if (!token || !user || !['admin', 'staff', 'delivery'].includes(user.role)) {
    renderAdminLogin();
    return;
  }

  try {
    const { user: freshUser } = await window.api.me();
    setUser(freshUser);
    adminUser = freshUser;
    renderAdminApp(freshUser);
  } catch {
    renderAdminLogin();
  }
}

function renderAdminLogin() {
  document.getElementById('admin-app').innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg)">
      <div class="card" style="width:100%;max-width:420px;padding:40px">
        <div style="text-align:center;margin-bottom:32px">
          <div style="font-size:48px;margin-bottom:12px">⚙️</div>
          <h2 style="font-size:24px;font-weight:800">Admin Panel</h2>
          <p style="color:var(--text-secondary);margin-top:6px">QuickPrint Management Console</p>
        </div>
        <div class="form-group">
          <label class="form-label">Email Address</label>
          <input id="admin-email" type="email" class="form-control" placeholder="admin@quickprint.in" />
        </div>
        <div class="form-group">
          <label class="form-label">Password</label>
          <input id="admin-password" type="password" class="form-control" placeholder="••••••••"
            onkeypress="if(event.key==='Enter')doAdminLogin()" />
        </div>
        <button id="admin-login-btn" class="btn btn-primary btn-lg" style="width:100%" onclick="doAdminLogin()">
          Sign In to Admin Panel
        </button>
        <p style="text-align:center;margin-top:20px;font-size:13px;color:var(--text-secondary)">
          <a href="index.html" style="color:var(--primary)">← Back to Customer Portal</a>
        </p>
      </div>
    </div>`;

  window.doAdminLogin = async () => {
    const email = document.getElementById('admin-email').value;
    const password = document.getElementById('admin-password').value;
    const btn = document.getElementById('admin-login-btn');
    if (!email || !password) { toast('Enter credentials', 'error'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in...';
    try {
      const { user, token } = await window.api.adminLogin(email, password);
      window.api.setToken(token);
      setUser(user);
      adminUser = user;
      renderAdminApp(user);
    } catch (e) {
      toast(e.message || 'Login failed', 'error');
      btn.disabled = false; btn.textContent = 'Sign In to Admin Panel';
    }
  };
}

async function loadBadgeCounts() {
  try {
    const [stats, queueRes] = await Promise.all([
      window.api.getOrderStats(),
      window.api.getQueue({ status: 'queued' })
    ]);
    badgeCounts = {
      pending: stats.statuses?.paid || 0,
      queue: queueRes.queue?.length || 0,
      delivery: stats.statuses?.ready || 0,
    };
  } catch {}
}

function renderAdminApp(user) {
  const today = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });

  document.getElementById('admin-app').innerHTML = `
    <div class="admin-layout">
      <aside class="admin-sidebar">
        <div class="admin-sidebar-header">
          <div class="admin-logo">
            <div class="admin-logo-icon">🖨️</div>
            <div>
              <div class="admin-logo-text">QuickPrint</div>
              <div class="admin-logo-sub">Admin Panel</div>
            </div>
          </div>
        </div>
        <nav class="admin-nav" id="admin-nav">
          ${NAV.map(item => {
            if (item.section) return `<div class="nav-section-label">${item.section}</div>`;
            const badgeCount = item.badge ? badgeCounts[item.badge] : 0;
            return `
              <button class="admin-nav-item ${item.id === 'dashboard' ? 'active' : ''}"
                data-page="${item.id}" onclick="adminNavigate('${item.id}')">
                <span class="nav-icon">${item.icon}</span>
                <span>${item.label}</span>
                ${badgeCount > 0 ? `<span class="nav-badge">${badgeCount}</span>` : ''}
              </button>`;
          }).join('')}
        </nav>
        <div class="admin-sidebar-footer">
          <div class="admin-user-info">
            <div class="admin-avatar">${(user.name || 'A').charAt(0).toUpperCase()}</div>
            <div>
              <div class="admin-user-name">${user.name}</div>
              <div class="admin-user-role">${user.role}</div>
            </div>
            <button class="admin-logout-btn" title="Logout" onclick="adminLogout()">🚪</button>
          </div>
        </div>
      </aside>

      <div class="admin-main">
        <div class="admin-topbar">
          <div class="admin-topbar-left">
            <h1 id="page-title">Dashboard</h1>
            <p id="page-subtitle">Welcome back, ${user.name.split(' ')[0]}</p>
          </div>
          <div class="admin-topbar-right">
            <div class="topbar-date">📅 ${today}</div>
            <button class="btn btn-primary btn-sm" onclick="adminNavigate('orders')">➕ New Order</button>
          </div>
        </div>
        <div class="admin-page-content" id="admin-content">
          <div style="text-align:center;padding:80px">
            <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:40px;height:40px;border-width:3px;margin:0 auto"></div>
          </div>
        </div>
      </div>
    </div>`;

  window.adminNavigate = async (page) => {
    currentPage = page;
    document.querySelectorAll('.admin-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    renderAdminPage(page, user);
  };

  window.adminLogout = () => {
    window.api.clearAuth();
    localStorage.removeItem('qp_user');
    toast('Logged out', 'info');
    renderAdminLogin();
  };

  // Load badges then navigate
  loadBadgeCounts().then(() => {
    // Update nav badges
    NAV.filter(n => n.badge).forEach(n => {
      const el = document.querySelector(`[data-page="${n.id}"] .nav-badge`);
      if (el) el.textContent = badgeCounts[n.badge] || '';
    });
  });

  adminNavigate('dashboard');
}

async function renderAdminPage(page, user) {
  const content = document.getElementById('admin-content');
  const titles = {
    dashboard: ['Dashboard', `Welcome back, ${user.name.split(' ')[0]}`],
    orders: ['Orders Management', 'View and manage all print orders'],
    queue: ['Print Queue', 'Batch and manage printing jobs'],
    payments: ['Payments', 'Transaction history and verification'],
    invoices: ['Invoices', 'Billing and invoice management'],
    pricing: ['Pricing Management', 'Configure rates and delivery charges'],
    delivery: ['Delivery Management', 'Track and manage home deliveries'],
    customers: ['Customers', 'Customer accounts and order history'],
    analytics: ['Analytics', 'Business insights and reports'],
    users: ['Users & Roles', 'Manage staff and access control'],
    settings: ['Settings', 'Shop configuration and preferences'],
  };

  const [title, subtitle] = titles[page] || [page, ''];
  document.getElementById('page-title').textContent = title;
  document.getElementById('page-subtitle').textContent = subtitle;

  content.innerHTML = `
    <div style="text-align:center;padding:80px">
      <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:40px;height:40px;border-width:3px;margin:0 auto"></div>
    </div>`;

  try {
    switch (page) {
      case 'dashboard':  await renderAdminDashboard(content, user); break;
      case 'orders':     await renderAdminOrders(content, user); break;
      case 'queue':      await renderAdminQueue(content, user); break;
      case 'payments':   await renderAdminPayments(content, user); break;
      case 'invoices':   await renderAdminInvoices(content, user); break;
      case 'pricing':    await renderAdminPricing(content, user); break;
      case 'delivery':   await renderAdminDelivery(content, user); break;
      case 'customers':  await renderAdminOrders(content, user, true); break;
      case 'analytics':  await renderAdminAnalytics(content, user); break;
      case 'users':      await renderAdminUsers(content, user); break;
      case 'settings':   await renderAdminSettings(content, user); break;
      default: content.innerHTML = '<div class="card"><p>Page not found</p></div>';
    }
  } catch (e) {
    console.error('Admin page error:', e);
    content.innerHTML = `<div class="card"><p style="color:var(--error)">Error: ${e.message}</p><button class="btn btn-secondary" style="margin-top:12px" onclick="adminNavigate('${page}')">Retry</button></div>`;
  }
}

init();