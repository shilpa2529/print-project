import { formatCurrency, formatDate, statusBadge } from '../../shared/utils.js';

export async function renderAdminDashboard(container, user) {
  const data = await window.api.getDashboard();

  const {
    today = {}, statuses = {}, payment_methods = [],
    page_sizes = [], recent_orders = [], print_queue = [],
    top_customers = [], weekly_revenue = [], delivery = {}
  } = data;

  const statCards = [
    { label: 'Orders Today', value: today.orders || 0, icon: '🛒', color: '#4f46e5', bg: '#eef2ff' },
    { label: 'Pending', value: statuses.placed || 0, icon: '⏳', color: '#f59e0b', bg: '#fffbeb' },
    { label: 'Printing', value: statuses.printing || 0, icon: '🖨️', color: '#8b5cf6', bg: '#f5f3ff' },
    { label: 'Ready', value: statuses.ready || 0, icon: '✅', color: '#10b981', bg: '#ecfdf5' },
    { label: 'Delivered', value: statuses.delivered || 0, icon: '🚚', color: '#3b82f6', bg: '#eff6ff' },
    { label: "Today's Revenue", value: formatCurrency(today.revenue || 0), icon: '₹', color: '#059669', bg: '#d1fae5', big: true },
  ];

  // Build bar chart data from weekly_revenue
  const maxRev = Math.max(...(weekly_revenue.map(r => r.revenue || 0)), 1);

  // Payment total for donut
  const totalPaid = payment_methods.reduce((s, p) => s + (p.total || 0), 0);
  const donutColors = { upi: '#4f46e5', card: '#10b981', cod: '#f59e0b', netbanking: '#3b82f6' };

  container.innerHTML = `
    <!-- Stats Grid -->
    <div class="stats-grid">
      ${statCards.map(s => `
        <div class="stat-card">
          <div class="stat-icon" style="background:${s.bg};color:${s.color}">${s.icon}</div>
          <div class="stat-label">${s.label}</div>
          <div class="stat-value" style="${s.big ? 'font-size:20px' : ''}">${s.value}</div>
        </div>`).join('')}
    </div>

    <!-- Charts row -->
    <div class="charts-row">
      <!-- Orders trend bar chart -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">
          <h3 style="font-size:15px;font-weight:800">Orders Trend <span style="font-size:12px;color:var(--text-secondary);font-weight:500">(Last 7 Days)</span></h3>
        </div>
        <div class="mini-bar-chart" id="revenue-chart">
          ${weekly_revenue.length ? weekly_revenue.map(r => {
            const pct = Math.max(5, Math.round(((r.revenue || 0) / maxRev) * 100));
            const d = new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
            return `<div class="mini-bar" style="height:${pct}%" title="${d}: ${formatCurrency(r.revenue)} | ${r.orders} orders"></div>`;
          }).join('') : '<div style="color:var(--text-tertiary);font-size:13px;margin:auto">No data yet</div>'}
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:8px">
          ${weekly_revenue.map(r => `
            <div style="font-size:10px;color:var(--text-tertiary);text-align:center;flex:1">
              ${new Date(r.date).toLocaleDateString('en-IN', { day: '2-digit' })}
            </div>`).join('')}
        </div>
      </div>

      <!-- Page size donut -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">Page Size Distribution</h3>
        <div class="donut-container">
          <div>
            <svg width="100" height="100" viewBox="0 0 100 100">
              ${buildDonut(page_sizes.map(p => ({ label: p.page_size, value: p.count })), 50, 50, 36, 22)}
            </svg>
          </div>
          <div class="donut-legend">
            ${page_sizes.map((p, i) => `
              <div class="legend-item">
                <div class="legend-dot" style="background:${['#4f46e5','#10b981','#f59e0b'][i % 3]}"></div>
                <span style="font-size:12px">${p.page_size} <strong style="color:var(--text)">${p.count}</strong></span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <!-- Payment methods donut -->
      <div class="card">
        <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">Payment Methods</h3>
        <div class="donut-container">
          <div>
            <svg width="100" height="100" viewBox="0 0 100 100">
              ${buildDonut(payment_methods.map(p => ({ label: p.payment_method, value: p.count })), 50, 50, 36, 22)}
              <text x="50" y="48" text-anchor="middle" font-size="14" font-weight="800" fill="#0f172a">
                ${payment_methods.reduce((s, p) => s + p.count, 0)}
              </text>
              <text x="50" y="60" text-anchor="middle" font-size="8" fill="#64748b">Total</text>
            </svg>
          </div>
          <div class="donut-legend">
            ${payment_methods.map((p, i) => {
              const pct = totalPaid > 0 ? Math.round((p.total / totalPaid) * 100) : 0;
              return `<div class="legend-item">
                <div class="legend-dot" style="background:${Object.values(donutColors)[i % 4]}"></div>
                <span style="font-size:12px">${(p.payment_method || 'cod').toUpperCase()} <strong>${pct}%</strong></span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>
    </div>

    <!-- Bottom row -->
    <div style="display:grid;grid-template-columns:3fr 1fr 1fr;gap:20px;margin-bottom:20px">
      <!-- Latest orders -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:800">Latest Orders</h3>
          <button class="btn btn-secondary btn-sm" onclick="adminNavigate('orders')">View All →</button>
        </div>
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>Size</th><th>Pages</th>
                <th>Type</th><th>Delivery</th><th>Status</th><th>Payment</th><th>Amount</th><th></th>
              </tr>
            </thead>
            <tbody>
              ${recent_orders.map(o => `
                <tr>
                  <td><strong style="font-family:var(--font-mono);font-size:13px;color:var(--primary)">#${o.order_number}</strong></td>
                  <td style="font-size:13px">${o.customer_name}</td>
                  <td><span class="badge" style="background:var(--primary-light);color:var(--primary)">${o.page_size}</span></td>
                  <td style="font-size:13px">${o.total_pages}</td>
                  <td style="font-size:12px">${o.print_type === 'bw' ? 'B&W' : 'Color'}</td>
                  <td style="font-size:12px">${o.delivery_type}</td>
                  <td>${statusBadge(o.status)}</td>
                  <td>${statusBadge(o.payment_status)}</td>
                  <td><strong style="font-family:var(--font-mono)">${formatCurrency(o.total_amount)}</strong></td>
                  <td>
                    <div style="display:flex;gap:4px">
                      <button class="btn btn-secondary btn-sm" onclick="quickView(${o.id})" title="View">👁</button>
                      <button class="btn btn-secondary btn-sm" onclick="quickPrint(${o.id})" title="Print">🖨️</button>
                    </div>
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Print queue summary -->
      <div class="card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
          <h3 style="font-size:15px;font-weight:800">Print Queue</h3>
          <button class="btn btn-secondary btn-sm" onclick="adminNavigate('queue')">Manage</button>
        </div>
        ${print_queue.length === 0 ? `
          <div style="text-align:center;padding:20px;color:var(--text-tertiary)">
            <div style="font-size:32px;margin-bottom:8px">✅</div>
            <div style="font-size:13px">Queue is empty</div>
          </div>` : print_queue.map(q => `
          <div style="background:var(--card-2);border-radius:8px;padding:14px;margin-bottom:10px;border:1px solid var(--border)">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong style="font-size:14px">${q.page_size} Queue</strong>
              <button class="btn btn-primary btn-sm" onclick="adminNavigate('queue')">View →</button>
            </div>
            <div style="font-size:13px;color:var(--text-secondary)">${q.order_count} orders</div>
            <div style="font-size:13px;color:var(--text-secondary)">${q.total_pages} total pages</div>
          </div>`).join('')}
      </div>

      <!-- Top customers + delivery -->
      <div style="display:flex;flex-direction:column;gap:16px">
        <div class="card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <h3 style="font-size:15px;font-weight:800">Top Customers</h3>
            <button class="btn btn-secondary btn-sm" onclick="adminNavigate('customers')">All</button>
          </div>
          ${top_customers.map(c => `
            <div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border)">
              <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;flex-shrink:0">
                ${c.customer_name.charAt(0)}
              </div>
              <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.customer_name}</div>
                <div style="font-size:11px;color:var(--text-secondary)">${c.orders} orders</div>
              </div>
              <strong style="font-size:13px;font-family:var(--font-mono);color:var(--primary)">${formatCurrency(c.revenue)}</strong>
            </div>`).join('')}
        </div>
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:12px">Delivery Overview</h3>
          <div style="display:flex;flex-direction:column;gap:8px">
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:6px">
              <span>🕐 Pending</span><strong style="color:var(--warning)">${delivery.pending || 0}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:6px">
              <span>🚚 Out for Delivery</span><strong style="color:var(--primary)">${delivery.out_for_delivery || 0}</strong>
            </div>
            <div style="display:flex;justify-content:space-between;font-size:13px;padding:8px;background:var(--card-2);border-radius:6px">
              <span>✅ Delivered</span><strong style="color:var(--success)">${delivery.delivered || 0}</strong>
            </div>
          </div>
          <button class="btn btn-secondary" style="width:100%;margin-top:12px" onclick="adminNavigate('delivery')">
            Manage Deliveries →
          </button>
        </div>
      </div>
    </div>`;

  window.quickView = async (id) => {
    try {
      const { order, files } = await window.api.getOrder(id);
      showQuickViewModal(order, files);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  window.quickPrint = async (id) => {
    try {
      await window.api.updateOrderStatus(id, 'printing');
      toast('Order moved to printing queue', 'success');
      renderAdminDashboard(container, user);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };
}

function buildDonut(data, cx, cy, r, thickness) {
  const total = data.reduce((s, d) => s + (d.value || 0), 0);
  if (total === 0) return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e2e8f7" stroke-width="${thickness}"/>`;

  const colors = ['#4f46e5', '#10b981', '#f59e0b', '#3b82f6', '#ef4444', '#8b5cf6'];
  let paths = '';
  let startAngle = -90;

  data.forEach((d, i) => {
    if (!d.value) return;
    const angle = (d.value / total) * 360;
    const endAngle = startAngle + angle;
    const x1 = cx + r * Math.cos((startAngle * Math.PI) / 180);
    const y1 = cy + r * Math.sin((startAngle * Math.PI) / 180);
    const x2 = cx + r * Math.cos((endAngle * Math.PI) / 180);
    const y2 = cy + r * Math.sin((endAngle * Math.PI) / 180);
    const largeArc = angle > 180 ? 1 : 0;

    paths += `<path d="M ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}"
      fill="none" stroke="${colors[i % colors.length]}" stroke-width="${thickness}" stroke-linecap="butt"/>`;
    startAngle = endAngle;
  });

  return paths;
}

function showQuickViewModal(order, files) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:560px">
      <div class="modal-header">
        <div class="modal-title">Order #${order.order_number}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div class="order-detail-grid">
        <div class="detail-section">
          <div class="detail-label">Customer</div>
          <div class="detail-row"><span>Name</span><strong>${order.customer_name}</strong></div>
          <div class="detail-row"><span>Phone</span><strong>${order.customer_phone}</strong></div>
          <div class="detail-row"><span>Delivery</span><strong>${order.delivery_type}</strong></div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Print Details</div>
          <div class="detail-row"><span>Size</span><strong>${order.page_size}</strong></div>
          <div class="detail-row"><span>Type</span><strong>${order.print_type === 'bw' ? 'B&W' : 'Color'}</strong></div>
          <div class="detail-row"><span>Pages</span><strong>${order.total_pages} × ${order.copies}</strong></div>
        </div>
      </div>
      <div class="detail-section" style="margin-top:12px">
        <div class="detail-label">Status & Payment</div>
        <div style="display:flex;gap:8px;margin-bottom:12px">${statusBadge(order.status)} ${statusBadge(order.payment_status)}</div>
        <div class="detail-row"><span>Total</span><strong style="color:var(--primary);font-size:16px">${formatCurrency(order.total_amount)}</strong></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">
        <button class="btn btn-primary btn-sm" onclick="updateStatus(${order.id},'printing');this.closest('.modal-overlay').remove()">🖨️ Start Printing</button>
        <button class="btn btn-success btn-sm" onclick="updateStatus(${order.id},'ready');this.closest('.modal-overlay').remove()">✅ Mark Ready</button>
        <button class="btn btn-danger btn-sm" onclick="updateStatus(${order.id},'cancelled');this.closest('.modal-overlay').remove()">✕ Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  window.updateStatus = async (id, status) => {
    try {
      await window.api.updateOrderStatus(id, status);
      toast(`Status updated to ${status}`, 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}