import { formatCurrency, formatDate, statusBadge } from '../../shared/utils.js';

export async function renderDashboard(container, user) {
  const [ordersRes, pricingRes] = await Promise.all([
    window.api.getOrders({ limit: 5, page: 1 }),
    window.api.getPricing()
  ]);

  const orders = ordersRes.orders || [];
  const activeOrder = orders.find(o => !['delivered', 'cancelled'].includes(o.status));

  const statusSteps = ['placed', 'paid', 'printing', 'ready', 'out_for_delivery', 'delivered'];
  const statusLabels = { placed: 'Order Placed', paid: 'Payment Confirmed', printing: 'Printing', ready: 'Ready for Pickup', out_for_delivery: 'Out for Delivery', delivered: 'Delivered' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Welcome back, ${user.name.split(' ')[0]}! 👋</div>
        <div class="page-subtitle">Upload documents and get them printed at your doorstep</div>
      </div>
      <div style="display:flex;gap:12px;align-items:center;">
        <div class="topbar-notif">🔔<span class="notif-badge">${orders.filter(o => o.status === 'ready').length || ''}</span></div>
      </div>
    </div>
    <div class="page-body">
      <!-- Hero -->
      <div class="hero-banner">
        <div class="hero-text">
          <h2>Ready to print? 🖨️</h2>
          <p>Upload your documents, choose print settings<br/>and get them delivered to your doorstep.</p>
          <button class="btn" style="background:white;color:var(--primary);font-weight:700;" onclick="navigateTo('new-order')">
            ➕ Place New Order
          </button>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start">
        <div>
          <!-- How it works -->
          <div class="card" style="margin-bottom:24px">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">How It Works</h3>
            <div class="how-steps">
              <div class="how-step">
                <div class="how-icon">📄</div>
                <div class="how-title">1. Upload Files</div>
                <div class="how-desc">Upload your documents</div>
              </div>
              <div class="how-arrow">→</div>
              <div class="how-step">
                <div class="how-icon">⚙️</div>
                <div class="how-title">2. Select Options</div>
                <div class="how-desc">Choose print settings</div>
              </div>
              <div class="how-arrow">→</div>
              <div class="how-step">
                <div class="how-icon">💳</div>
                <div class="how-title">3. Make Payment</div>
                <div class="how-desc">Pay securely online</div>
              </div>
              <div class="how-arrow">→</div>
              <div class="how-step">
                <div class="how-icon">🖨️</div>
                <div class="how-title">4. We Print</div>
                <div class="how-desc">We print your documents</div>
              </div>
              <div class="how-arrow">→</div>
              <div class="how-step">
                <div class="how-icon">🚚</div>
                <div class="how-title">5. Get Delivery</div>
                <div class="how-desc">Receive at doorstep</div>
              </div>
            </div>
          </div>

          <!-- Recent orders -->
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <h3 style="font-size:16px;font-weight:800">Recent Orders</h3>
              <button class="btn btn-secondary btn-sm" onclick="navigateTo('my-orders')">View All →</button>
            </div>
            ${orders.length === 0 ? `
              <div class="empty-state">
                <div class="empty-icon">📭</div>
                <h3>No orders yet</h3>
                <p>Place your first order to get started!</p>
                <button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('new-order')">Place Order</button>
              </div>
            ` : orders.map(o => `
              <div class="order-card" onclick="navigateTo('my-orders')" style="cursor:pointer">
                <div style="width:36px;height:36px;border-radius:8px;background:var(--primary-light);display:flex;align-items:center;justify-content:center;font-size:18px">📄</div>
                <div>
                  <div class="order-card-num">#${o.order_number}</div>
                  <div class="order-card-meta">${formatDate(o.created_at)} • ${o.total_pages} pages</div>
                </div>
                ${statusBadge(o.status)}
                <div class="order-card-amount">${formatCurrency(o.total_amount)}</div>
                <span class="order-card-chevron">›</span>
              </div>`).join('')}
          </div>
        </div>

        <!-- Right column -->
        <div style="display:flex;flex-direction:column;gap:20px">
          <!-- Active order tracking -->
          ${activeOrder ? `
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
              <h3 style="font-size:15px;font-weight:800">📍 Order Tracking</h3>
              <button class="btn btn-secondary btn-sm" onclick="navigateTo('tracking')">View All</button>
            </div>
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:12px">Order #${activeOrder.order_number}</div>
            <div class="tracking-timeline">
              ${statusSteps.map((step, i) => {
                const idx = statusSteps.indexOf(activeOrder.status);
                const isDone = i < idx;
                const isActive = i === idx;
                return `
                <div class="tracking-step">
                  <div class="tracking-step-left">
                    <div class="tracking-dot ${isDone ? 'done' : isActive ? 'active' : ''}">
                      ${isDone ? '✓' : isActive ? '●' : ''}
                    </div>
                    <div class="tracking-line ${isDone ? 'done' : ''}"></div>
                  </div>
                  <div class="tracking-content">
                    <div class="tracking-label" style="color:${isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--text-tertiary)'}">${statusLabels[step]}</div>
                    <div class="tracking-time">${isActive ? 'In progress' : isDone ? 'Completed' : 'Pending'}</div>
                  </div>
                </div>`}).join('')}
            </div>
          </div>` : ''}

          <!-- Quick pricing -->
          <div class="card">
            <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">💰 Quick Pricing</h3>
            <div style="display:flex;flex-direction:column;gap:8px">
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:8px">
                <span>A4 B&W (single)</span><strong>₹2/page</strong>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:8px">
                <span>A4 Color (single)</span><strong>₹8/page</strong>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:8px">
                <span>A3 B&W</span><strong>₹5/page</strong>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:8px">
                <span>A3 Color</span><strong>₹15/page</strong>
              </div>
              <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--primary-light);border-radius:8px;color:var(--primary)">
                <span>Delivery charge</span><strong>₹30 (Free above ₹500)</strong>
              </div>
            </div>
          </div>

          <!-- Trust badges -->
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div class="card" style="text-align:center;padding:16px">
              <div style="font-size:28px;margin-bottom:6px">🔒</div>
              <div style="font-size:12px;font-weight:700">Secure Payments</div>
              <div style="font-size:11px;color:var(--text-secondary)">SSL encrypted</div>
            </div>
            <div class="card" style="text-align:center;padding:16px">
              <div style="font-size:28px;margin-bottom:6px">⚡</div>
              <div style="font-size:12px;font-weight:700">Fast Delivery</div>
              <div style="font-size:11px;color:var(--text-secondary)">Quick turnaround</div>
            </div>
          </div>
        </div>
      </div>
    </div>`;
}