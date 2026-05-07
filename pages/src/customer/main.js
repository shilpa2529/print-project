import '../shared/api.js';
import { getUser, setUser, toast, formatCurrency, formatDate, statusBadge } from '../shared/utils.js';
import { renderDashboard } from './pages/dashboard.js';
import { renderNewOrder } from './pages/new-orders.js';
import { renderOrders } from './pages/orders.js';
import { renderInvoices } from './pages/invoices.js';
import { renderTracking } from './pages/tracking.js';
import { renderSettings } from './pages/settings.js';

// Expose utils globally for inline handlers
Object.assign(window, { toast, formatCurrency, formatDate, statusBadge });

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: '🏠' },
  { id: 'new-order', label: 'Place Order', icon: '➕' },
  { id: 'my-orders', label: 'My Orders', icon: '📋' },
  { id: 'tracking', label: 'Order Tracking', icon: '📍' },
  { id: 'invoices', label: 'Invoices', icon: '🧾' },
  { id: 'settings', label: 'Settings', icon: '⚙️' },
];

let currentPage = 'dashboard';

async function init() {
  const user = getUser();
  const token = window.api.getToken();

  if (!token || !user) {
    renderAuth();
    return;
  }

  // Verify token is still valid
  try {
    const { user: freshUser } = await window.api.me();
    setUser(freshUser);
    renderApp(freshUser);
  } catch {
    renderAuth();
  }
}

function renderAuth() {
  document.getElementById('app').innerHTML = `
    <div class="auth-page">
      <div class="auth-brand">
        <div>
          <div class="auth-brand-logo">🖨️ QuickPrint</div>
        </div>
        <div>
          <h1>Print anything,<br/>delivered to your<br/>doorstep.</h1>
          <p>Upload documents, choose settings,<br/>pay online — we handle the rest.</p>
        </div>
        <div class="auth-features">
          <div class="auth-feature"><div class="auth-feature-icon">📄</div> Upload PDF, Word, Images</div>
          <div class="auth-feature"><div class="auth-feature-icon">⚡</div> Real-time order tracking</div>
          <div class="auth-feature"><div class="auth-feature-icon">🔒</div> Secure Razorpay payments</div>
          <div class="auth-feature"><div class="auth-feature-icon">🚚</div> Pickup or home delivery</div>
        </div>
      </div>
      <div class="auth-form-side">
        <div class="auth-form-box">
          <h2>Welcome back 👋</h2>
          <p>Sign in to manage your print orders</p>
          <div class="auth-tabs">
            <button class="auth-tab active" data-tab="login" onclick="switchTab('login')">Sign In</button>
            <button class="auth-tab" data-tab="register" onclick="switchTab('register')">Create Account</button>
          </div>
          <div id="auth-form-content"></div>
        </div>
      </div>
    </div>`;

  window.switchTab = (tab) => {
    document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
    document.getElementById('auth-form-content').innerHTML = tab === 'login' ? loginForm() : registerForm();
  };

  window.doLogin = async () => {
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    if (!email || !password) { toast('Fill in all fields', 'error'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Signing in...';
    try {
      const { user, token } = await window.api.login(email, password);
      window.api.setToken(token);
      setUser(user);
      renderApp(user);
    } catch (e) {
      toast(e.message || 'Login failed', 'error');
      btn.disabled = false; btn.textContent = 'Sign In';
    }
  };

  window.doRegister = async () => {
    const name = document.getElementById('reg-name').value;
    const email = document.getElementById('reg-email').value;
    const phone = document.getElementById('reg-phone').value;
    const password = document.getElementById('reg-password').value;
    const btn = document.getElementById('reg-btn');
    if (!name || !email || !password) { toast('Fill in required fields', 'error'); return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      const { user, token } = await window.api.register({ name, email, phone, password });
      window.api.setToken(token);
      setUser(user);
      renderApp(user);
      toast('Welcome to QuickPrint! 🎉', 'success');
    } catch (e) {
      toast(e.message || 'Registration failed', 'error');
      btn.disabled = false; btn.textContent = 'Create Account';
    }
  };

  window.switchTab('login');
}

function loginForm() {
  return `
    <div class="form-group">
      <label class="form-label">Email</label>
      <input id="login-email" type="email" class="form-control" placeholder="you@example.com" />
    </div>
    <div class="form-group">
      <label class="form-label">Password</label>
      <input id="login-password" type="password" class="form-control" placeholder="••••••••" 
        onkeypress="if(event.key==='Enter')doLogin()" />
    </div>
    <button id="login-btn" class="btn btn-primary btn-lg" style="width:100%" onclick="doLogin()">Sign In</button>
    <p style="text-align:center;margin-top:20px;color:var(--text-secondary);font-size:13px;">
      Admin? <a href="admin.html" style="color:var(--primary);font-weight:600;">Go to Admin Panel →</a>
    </p>`;
}

function registerForm() {
  return `
    <div class="form-group">
      <label class="form-label">Full Name *</label>
      <input id="reg-name" type="text" class="form-control" placeholder="Rahul Sharma" />
    </div>
    <div class="grid-2">
      <div class="form-group">
        <label class="form-label">Email *</label>
        <input id="reg-email" type="email" class="form-control" placeholder="you@email.com" />
      </div>
      <div class="form-group">
        <label class="form-label">Phone</label>
        <input id="reg-phone" type="tel" class="form-control" placeholder="98765 43210" />
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Password *</label>
      <input id="reg-password" type="password" class="form-control" placeholder="Min 8 characters" />
    </div>
    <button id="reg-btn" class="btn btn-primary btn-lg" style="width:100%" onclick="doRegister()">Create Account</button>`;
}

function renderApp(user) {
  document.getElementById('app').innerHTML = `
    <div class="customer-layout">
      <aside class="sidebar">
        <div class="sidebar-logo">
          <div class="sidebar-logo-text">🖨️ QuickPrint</div>
          <div class="sidebar-logo-sub">Doorstep Printing</div>
        </div>
        <nav class="sidebar-nav" id="sidebar-nav">
          ${NAV_ITEMS.map(item => `
            <button class="sidebar-item ${item.id === 'dashboard' ? 'active' : ''}" 
              data-page="${item.id}" onclick="navigateTo('${item.id}')">
              <span class="sidebar-icon">${item.icon}</span>
              <span>${item.label}</span>
            </button>`).join('')}
        </nav>
        <div class="sidebar-footer">
          <div class="sidebar-user">
            <div class="sidebar-avatar">${(user.name || 'U').charAt(0).toUpperCase()}</div>
            <div>
              <div class="sidebar-user-name">${user.name}</div>
              <div class="sidebar-user-email">${user.email}</div>
            </div>
            <button class="sidebar-logout" title="Logout" onclick="doLogout()">🚪</button>
          </div>
        </div>
      </aside>
      <main class="main-content" id="main-content">
        <div style="display:flex;align-items:center;justify-content:center;height:200px">
          <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;"></div>
        </div>
      </main>
    </div>`;

  window.navigateTo = (page) => {
    currentPage = page;
    document.querySelectorAll('.sidebar-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
    renderPage(page, user);
  };

  window.doLogout = () => {
    window.api.clearAuth();
    localStorage.removeItem('qp_user');
    renderAuth();
    toast('Logged out', 'info');
  };

  navigateTo('dashboard');
}

async function renderPage(page, user) {
  const main = document.getElementById('main-content');
  main.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:200px"><div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;"></div></div>`;

  try {
    switch (page) {
      case 'dashboard': await renderDashboard(main, user); break;
      case 'new-order': await renderNewOrder(main, user); break;
      case 'my-orders': await renderOrders(main, user); break;
      case 'tracking': await renderTracking(main, user); break;
      case 'invoices': await renderInvoices(main, user); break;
      case 'settings': await renderSettings(main, user); break;
      default: main.innerHTML = '<div class="page-body"><p>Page not found</p></div>';
    }
  } catch (e) {
    console.error('Page error:', e);
    main.innerHTML = `<div class="page-body"><div class="card"><p style="color:var(--error)">Error loading page: ${e.message}</p></div></div>`;
  }
}

init();