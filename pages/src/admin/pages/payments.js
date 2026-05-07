import { formatCurrency, formatDate, statusBadge, toast } from '../../shared/utils.js';

// ─── PAYMENTS ────────────────────────────────────────────────────
export async function renderAdminPayments(container, user) {
  let transactions = [];
  try {
    const res = await window.api.getTransactions({ limit: 100 });
    transactions = res.transactions || [];
  } catch (e) { toast('Failed to load transactions: ' + e.message, 'error'); }

  const total = transactions.filter(t => t.payment_status === 'paid').reduce((s, t) => s + t.total_amount, 0);
  const byMethod = {};
  transactions.forEach(t => {
    if (t.payment_status === 'paid') {
      byMethod[t.payment_method] = (byMethod[t.payment_method] || 0) + t.total_amount;
    }
  });

  container.innerHTML = `
    <!-- Summary -->
    <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:16px;margin-bottom:24px">
      <div class="stat-card">
        <div class="stat-icon" style="background:#d1fae5;color:#059669">₹</div>
        <div class="stat-label">Total Revenue</div>
        <div class="stat-value" style="font-size:18px">${formatCurrency(total)}</div>
      </div>
      ${Object.entries(byMethod).map(([method, amt]) => `
        <div class="stat-card">
          <div class="stat-icon" style="background:#eef2ff;color:#4f46e5">${method === 'upi' ? '📱' : method === 'card' ? '💳' : method === 'cod' ? '💵' : '🏦'}</div>
          <div class="stat-label">${method?.toUpperCase()}</div>
          <div class="stat-value" style="font-size:16px">${formatCurrency(amt)}</div>
        </div>`).join('')}
    </div>
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Order #</th><th>Customer</th><th>Phone</th><th>Amount</th><th>Method</th><th>Status</th><th>Txn ID</th><th>Date</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${transactions.map(t => `
            <tr>
              <td><strong style="font-family:var(--font-mono);color:var(--primary)">${t.order_number}</strong></td>
              <td>${t.customer_name}</td>
              <td style="font-size:12px">${t.customer_phone}</td>
              <td><strong>${formatCurrency(t.total_amount)}</strong></td>
              <td><span class="badge" style="background:var(--card-2);color:var(--text);border:1px solid var(--border)">${(t.payment_method || 'pending').toUpperCase()}</span></td>
              <td>${statusBadge(t.payment_status)}</td>
              <td style="font-size:11px;color:var(--text-secondary);font-family:monospace">${t.razorpay_payment_id || '-'}</td>
              <td style="font-size:12px;color:var(--text-secondary)">${formatDate(t.created_at)}</td>
              <td>
                ${t.payment_status === 'pending' && t.payment_method === 'cod' ? 
                  `<button class="btn btn-success btn-sm" onclick="confirmCod(${t.id})">✅ Confirm COD</button>` : ''}
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  window.confirmCod = async (id) => {
    try {
      await window.api.confirmCod(id);
      toast('COD confirmed', 'success');
      renderAdminPayments(container, user);
    } catch (e) { toast(e.message, 'error'); }
  };
}

// ─── INVOICES ────────────────────────────────────────────────────
export async function renderAdminInvoices(container, user) {
  const { invoices } = await window.api.getInvoices();

  container.innerHTML = `
    <div class="table-wrapper">
      <table>
        <thead>
          <tr><th>Invoice #</th><th>Order #</th><th>Customer</th><th>Amount</th><th>Status</th><th>Generated</th><th>Actions</th></tr>
        </thead>
        <tbody>
          ${invoices.map(inv => `
            <tr>
              <td><strong style="font-family:var(--font-mono);color:var(--primary)">${inv.invoice_number}</strong></td>
              <td style="font-family:var(--font-mono);font-size:13px">${inv.order_number}</td>
              <td>${inv.customer_name}</td>
              <td><strong>${formatCurrency(inv.total_amount)}</strong></td>
              <td>${statusBadge(inv.status)}</td>
              <td style="font-size:12px;color:var(--text-secondary)">${formatDate(inv.generated_at)}</td>
              <td>
                <button class="btn btn-secondary btn-sm" onclick="viewAdminInvoice(${inv.id})">🧾 View</button>
              </td>
            </tr>`).join('')}
        </tbody>
      </table>
    </div>`;

  window.viewAdminInvoice = async (id) => {
    try {
      const { invoice, shop } = await window.api.getInvoice(id);
      const { order } = await window.api.getOrder(invoice.order_id);
      const win = window.open('', '_blank');
      win.document.write(buildInvoiceHtml(invoice, order, shop));
      win.document.close();
    } catch (e) { toast(e.message, 'error'); }
  };
}

function buildInvoiceHtml(invoice, order, shop) {
  return `<!DOCTYPE html><html><head><title>Invoice ${invoice.invoice_number}</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;padding:48px;color:#0f172a;max-width:700px;margin:0 auto}.header{display:flex;justify-content:space-between;margin-bottom:48px;padding-bottom:24px;border-bottom:2px solid #e2e8f7}.logo{font-size:24px;font-weight:900;color:#4f46e5}table{width:100%;border-collapse:collapse;margin:20px 0}th{background:#f8faff;padding:12px;font-size:12px;font-weight:700;text-align:left;border-bottom:2px solid #e2e8f7}td{padding:12px;border-bottom:1px solid #f1f5f9}.total{font-size:20px;font-weight:900;color:#4f46e5}@media print{button{display:none}}</style>
    </head><body>
    <div class="header">
      <div><div class="logo">🖨️ ${shop.shop_name||'QuickPrint'}</div><div style="font-size:13px;color:#64748b;margin-top:6px">${shop.shop_address||''}</div></div>
      <div style="text-align:right"><div style="font-size:24px;font-weight:900">INVOICE</div><div>#${invoice.invoice_number}</div><div style="font-size:13px;color:#64748b">${new Date(invoice.generated_at).toLocaleDateString('en-IN')}</div></div>
    </div>
    <div style="background:#f8faff;padding:16px;border-radius:8px;margin-bottom:24px">
      <strong>${order.customer_name}</strong><br/><span style="color:#64748b;font-size:13px">${order.customer_phone} | ${order.customer_email||''}</span>
    </div>
    <table><thead><tr><th>Description</th><th>Pages</th><th>Copies</th><th>Rate</th><th>Amount</th></tr></thead>
    <tbody>
      <tr><td>${order.page_size} ${order.print_type==='bw'?'B&W':'Color'} (${order.print_sides} side)</td><td>${order.total_pages}</td><td>${order.copies}</td><td>₹${order.subtotal>0?(order.subtotal/(order.total_pages*order.copies)).toFixed(2):'0'}</td><td>₹${order.subtotal}</td></tr>
      ${order.delivery_charge>0?`<tr><td>Delivery</td><td>-</td><td>-</td><td>₹${order.delivery_charge}</td><td>₹${order.delivery_charge}</td></tr>`:''}
    </tbody></table>
    <div style="text-align:right"><span class="total">Total: ₹${order.total_amount}</span></div>
    <button onclick="window.print()" style="margin-top:24px;padding:10px 20px;background:#4f46e5;color:white;border:none;border-radius:8px;cursor:pointer">Print</button>
    </body></html>`;
}

// ─── DELIVERY ────────────────────────────────────────────────────
export async function renderAdminDelivery(container, user) {
  let currentStatus = '';
  
  const load = async () => {
    const { orders } = await window.api.getDeliveryOrders(currentStatus);
    renderDeliveryList(orders);
  };

  const renderDeliveryList = (orders) => {
    container.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:20px;flex-wrap:wrap">
        ${[['','All Delivery Orders'],['ready','Ready for Dispatch'],['out_for_delivery','Out for Delivery'],['delivered','Delivered']].map(([s,l]) => `
          <button class="btn btn-sm ${currentStatus===s?'btn-primary':'btn-secondary'}" onclick="filterDelivery('${s}')">${l}</button>`).join('')}
        <button class="btn btn-secondary btn-sm" onclick="load()">🔄 Refresh</button>
      </div>
      ${orders.length === 0 ? `
        <div class="empty-state card"><div class="empty-icon">🚚</div><h3>No delivery orders</h3></div>` :
        orders.map(o => `
          <div class="delivery-card">
            <div class="delivery-icon">${o.status==='delivered'?'✅':o.status==='out_for_delivery'?'🚚':'📦'}</div>
            <div style="flex:1">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                <strong style="font-family:var(--font-mono);color:var(--primary)">#${o.order_number}</strong>
                ${statusBadge(o.status)}
                <strong style="margin-left:auto">${formatCurrency(o.total_amount)}</strong>
              </div>
              <div style="font-weight:700;font-size:14px">${o.customer_name} <span style="font-weight:400;color:var(--text-secondary)">· ${o.customer_phone}</span></div>
              ${o.line1 ? `<div style="font-size:13px;color:var(--text-secondary);margin-top:4px">📍 ${o.line1}${o.line2?', '+o.line2:''}, ${o.city}, ${o.state} - ${o.pincode}</div>` : ''}
              <div style="font-size:12px;color:var(--text-tertiary);margin-top:4px">${formatDate(o.created_at)}</div>
            </div>
            <div style="display:flex;flex-direction:column;gap:6px">
              ${o.status === 'ready' ? `<button class="btn btn-primary btn-sm" onclick="dispatchOrder(${o.id})">🚚 Dispatch</button>` : ''}
              ${o.status === 'out_for_delivery' ? `<button class="btn btn-success btn-sm" onclick="completeDelivery(${o.id})">✅ Delivered</button>` : ''}
            </div>
          </div>`).join('')}`;

    window.filterDelivery = (s) => { currentStatus = s; load(); };
    window.dispatchOrder = async (id) => {
      try { await window.api.dispatchOrder(id); toast('Order dispatched!', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    };
    window.completeDelivery = async (id) => {
      try { await window.api.completeDelivery(id); toast('Delivery completed!', 'success'); load(); }
      catch (e) { toast(e.message, 'error'); }
    };
  };

  window.load = load;
  await load();
}

// ─── PRICING ────────────────────────────────────────────────────
export async function renderAdminPricing(container, user) {
  const { pricing, delivery } = await window.api.getPricing();

  const sizes = ['A4', 'A3', 'Letter'];
  const types = [{ key: 'bw', label: '⬛ Black & White' }, { key: 'color', label: '🌈 Color' }];

  container.innerHTML = `
    <div class="pricing-grid">
      ${sizes.map(size => `
        <div class="pricing-card">
          <div class="pricing-card-title">📄 ${size}</div>
          ${types.map(type => {
            const row = pricing.find(p => p.page_size === size && p.print_type === type.key) || {};
            return `
              <div style="margin-bottom:16px">
                <div style="font-size:12px;font-weight:700;color:var(--text-secondary);margin-bottom:8px">${type.label}</div>
                <div class="price-input-group">
                  <div class="price-input-box">
                    <label>Single Side (₹)</label>
                    <input type="number" id="price-${size}-${type.key}-single" value="${row.single_side_rate || 0}" step="0.5" min="0" />
                  </div>
                  <div class="price-input-box">
                    <label>Double Side (₹)</label>
                    <input type="number" id="price-${size}-${type.key}-double" value="${row.double_side_rate || 0}" step="0.5" min="0" />
                  </div>
                </div>
              </div>`;
          }).join('')}
        </div>`).join('')}
    </div>

    <div class="settings-section">
      <div class="settings-section-title">🚚 Delivery Charges</div>
      <div class="grid-2" style="max-width:500px">
        <div class="form-group">
          <label class="form-label">Delivery Charge (₹)</label>
          <input type="number" id="delivery-charge" class="form-control" value="${delivery?.charge || 30}" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label">Free Delivery Above (₹)</label>
          <input type="number" id="delivery-free-above" class="form-control" value="${delivery?.free_above || 500}" min="0" />
        </div>
      </div>
    </div>

    <button class="btn btn-primary btn-lg" onclick="savePricing()">💾 Save All Pricing</button>`;

  window.savePricing = async () => {
    const pricingData = [];
    for (const size of sizes) {
      for (const type of types) {
        pricingData.push({
          page_size: size,
          print_type: type.key,
          single_side_rate: parseFloat(document.getElementById(`price-${size}-${type.key}-single`).value) || 0,
          double_side_rate: parseFloat(document.getElementById(`price-${size}-${type.key}-double`).value) || 0,
        });
      }
    }
    const deliveryData = {
      charge: parseFloat(document.getElementById('delivery-charge').value) || 30,
      free_above: parseFloat(document.getElementById('delivery-free-above').value) || 500,
    };
    try {
      await window.api.put('/pricing', { pricing: pricingData, delivery: deliveryData });
      toast('Pricing updated successfully!', 'success');
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };
}

// ─── ANALYTICS ───────────────────────────────────────────────────
export async function renderAdminAnalytics(container, user) {
  let days = 30;
  
  const load = async () => {
    const data = await window.api.getAnalytics(days);
    const { daily = [], print_types = [], delivery_types = [], peak_hours = [] } = data;

    const maxRev = Math.max(...daily.map(d => d.revenue || 0), 1);

    container.innerHTML = `
      <div style="display:flex;gap:8px;margin-bottom:24px">
        ${[7,14,30,90].map(d => `
          <button class="btn btn-sm ${days===d?'btn-primary':'btn-secondary'}" onclick="changeDays(${d})">${d} days</button>`).join('')}
      </div>
      <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:20px;margin-bottom:20px">
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:4px">Revenue & Orders (${days} days)</h3>
          <div class="mini-bar-chart" style="height:120px">
            ${daily.map(d => {
              const pct = Math.max(5, Math.round(((d.revenue||0)/maxRev)*100));
              return `<div class="mini-bar" style="height:${pct}%;background:var(--primary)" title="${d.date}: ${formatCurrency(d.revenue)} (${d.orders} orders)"></div>`;
            }).join('')}
          </div>
          <div style="display:flex;justify-content:space-between;margin-top:8px">
            ${daily.filter((_,i) => i % Math.ceil(daily.length/6) === 0).map(d =>
              `<div style="font-size:10px;color:var(--text-tertiary)">${new Date(d.date).toLocaleDateString('en-IN',{day:'2-digit',month:'short'})}</div>`
            ).join('')}
          </div>
          <div style="display:flex;gap:24px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
            <div><div style="font-size:12px;color:var(--text-secondary)">Total Revenue</div><div style="font-size:20px;font-weight:800;color:var(--primary)">${formatCurrency(daily.reduce((s,d)=>s+(d.revenue||0),0))}</div></div>
            <div><div style="font-size:12px;color:var(--text-secondary)">Total Orders</div><div style="font-size:20px;font-weight:800">${daily.reduce((s,d)=>s+(d.orders||0),0)}</div></div>
            <div><div style="font-size:12px;color:var(--text-secondary)">Avg/Day</div><div style="font-size:20px;font-weight:800">${daily.length?Math.round(daily.reduce((s,d)=>s+(d.orders||0),0)/daily.length):0}</div></div>
          </div>
        </div>
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">Print Types</h3>
          ${print_types.map((p,i) => {
            const total = print_types.reduce((s,x)=>s+x.count,0);
            const pct = total ? Math.round((p.count/total)*100) : 0;
            return `<div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>${p.print_type==='bw'?'⬛ Black & White':'🌈 Color'}</span>
                <strong>${p.count} (${pct}%)</strong>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${i===0?'var(--primary)':'#10b981'}"></div></div>
            </div>`;
          }).join('')}
          <h3 style="font-size:15px;font-weight:800;margin:20px 0 16px">Delivery Types</h3>
          ${delivery_types.map((d,i) => {
            const total = delivery_types.reduce((s,x)=>s+x.count,0);
            const pct = total ? Math.round((d.count/total)*100) : 0;
            return `<div style="margin-bottom:12px">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>${d.delivery_type==='pickup'?'🏪 Pickup':'🚚 Delivery'}</span>
                <strong>${d.count} (${pct}%)</strong>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%;background:${i===0?'var(--warning)':'var(--primary)'}"></div></div>
            </div>`;
          }).join('')}
        </div>
        <div class="card">
          <h3 style="font-size:15px;font-weight:800;margin-bottom:16px">⏰ Peak Hours</h3>
          ${peak_hours.length ? peak_hours.map(h => {
            const maxCount = peak_hours[0].count;
            const pct = Math.round((h.count/maxCount)*100);
            const hour = parseInt(h.hour);
            const label = hour < 12 ? `${hour || 12}AM` : hour === 12 ? '12PM' : `${hour-12}PM`;
            return `<div style="margin-bottom:10px">
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>🕐 ${label}</span><strong>${h.count} orders</strong>
              </div>
              <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
            </div>`;
          }).join('') : '<p style="color:var(--text-secondary);font-size:13px">No data yet</p>'}
        </div>
      </div>`;

    window.changeDays = (d) => { days = d; load(); };
  };

  await load();
}

// ─── USERS ───────────────────────────────────────────────────────
export async function renderAdminUsers(container, user) {
  const { users } = await window.api.getUsers();

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;margin-bottom:20px">
      <div style="display:flex;gap:8px">
        ${['all','admin','staff','delivery','customer'].map(r => `
          <button class="btn btn-sm btn-secondary" data-role="${r}" onclick="filterRole('${r}',this)">
            ${r.charAt(0).toUpperCase()+r.slice(1)}
          </button>`).join('')}
      </div>
      <button class="btn btn-primary" onclick="showCreateUserModal()">➕ Add Staff</button>
    </div>
    <div class="table-wrapper" id="users-table">
      ${renderUsersTable(users)}
    </div>`;

  window.filterRole = async (role, btn) => {
    document.querySelectorAll('[data-role]').forEach(b => b.className = `btn btn-sm ${b.dataset.role===role?'btn-primary':'btn-secondary'}`);
    const params = role !== 'all' ? { role } : {};
    const { users: filtered } = await window.api.getUsers(params);
    document.getElementById('users-table').innerHTML = renderUsersTable(filtered);
  };

  window.toggleUser = async (id, active) => {
    try {
      await window.api.updateUser(id, { is_active: active });
      toast(active ? 'User activated' : 'User deactivated', 'success');
      const { users: fresh } = await window.api.getUsers();
      document.getElementById('users-table').innerHTML = renderUsersTable(fresh);
    } catch (e) { toast(e.message, 'error'); }
  };

  window.showCreateUserModal = () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">Add Staff Member</div>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">Full Name *</label>
          <input id="new-name" class="form-control" placeholder="Staff name" />
        </div>
        <div class="form-group">
          <label class="form-label">Email *</label>
          <input id="new-email" type="email" class="form-control" placeholder="staff@quickprint.in" />
        </div>
        <div class="form-group">
          <label class="form-label">Phone</label>
          <input id="new-phone" class="form-control" placeholder="Phone number" />
        </div>
        <div class="form-group">
          <label class="form-label">Role *</label>
          <select id="new-role" class="form-control">
            <option value="staff">Staff (orders + queue)</option>
            <option value="delivery">Delivery (delivery only)</option>
            <option value="admin">Admin (full access)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Temporary Password</label>
          <input id="new-pass" type="password" class="form-control" placeholder="changeme123" value="changeme123" />
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="createUser()">Create User</button>
      </div>`;
    document.body.appendChild(overlay);

    window.createUser = async () => {
      const data = {
        name: document.getElementById('new-name').value,
        email: document.getElementById('new-email').value,
        phone: document.getElementById('new-phone').value,
        role: document.getElementById('new-role').value,
        password: document.getElementById('new-pass').value,
      };
      if (!data.name || !data.email) { toast('Name and email required', 'error'); return; }
      try {
        await window.api.createUser(data);
        overlay.remove();
        toast('User created successfully', 'success');
        renderAdminUsers(container, user);
      } catch (e) { toast(e.message, 'error'); }
    };
  };
}

function renderUsersTable(users) {
  const roleClasses = { admin: 'role-admin', staff: 'role-staff', delivery: 'role-delivery', customer: 'role-customer' };
  return `
    <table>
      <thead><tr><th>Name</th><th>Email</th><th>Phone</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr></thead>
      <tbody>
        ${users.map(u => `
          <tr>
            <td>
              <div style="display:flex;align-items:center;gap:10px">
                <div style="width:32px;height:32px;border-radius:50%;background:var(--primary-light);color:var(--primary);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px">${u.name.charAt(0)}</div>
                <strong>${u.name}</strong>
              </div>
            </td>
            <td style="font-size:13px">${u.email}</td>
            <td style="font-size:13px">${u.phone || '-'}</td>
            <td><span class="role-badge ${roleClasses[u.role]||'role-customer'}">${u.role}</span></td>
            <td><span class="badge" style="background:${u.is_active?'#d1fae5':'#fee2e2'};color:${u.is_active?'#059669':'#dc2626'}">${u.is_active?'Active':'Inactive'}</span></td>
            <td style="font-size:12px;color:var(--text-secondary)">${formatDate(u.created_at)}</td>
            <td>
              <button class="btn btn-sm ${u.is_active?'btn-danger':'btn-success'}" onclick="toggleUser(${u.id},${!u.is_active})">
                ${u.is_active?'Deactivate':'Activate'}
              </button>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

// ─── SETTINGS ────────────────────────────────────────────────────
export async function renderAdminSettings(container, user) {
  let settings = {};
  try { ({ settings } = await window.api.getSettings()); } catch {}

  container.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">
      <div>
        <div class="settings-section">
          <div class="settings-section-title">🏪 Business Information</div>
          ${[
            ['shop_name', 'Shop Name', 'text', 'QuickPrint'],
            ['shop_address', 'Address', 'text', '123 Print Lane, Mumbai'],
            ['shop_phone', 'Phone', 'tel', '+91 98765 43210'],
            ['shop_email', 'Email', 'email', 'hello@quickprint.in'],
            ['gst_number', 'GST Number', 'text', 'GSTIN000000000'],
          ].map(([key, label, type, placeholder]) => `
            <div class="form-group">
              <label class="form-label">${label}</label>
              <input id="setting-${key}" type="${type}" class="form-control" value="${settings[key]||''}" placeholder="${placeholder}" />
            </div>`).join('')}
          <button class="btn btn-primary" onclick="saveSettings(['shop_name','shop_address','shop_phone','shop_email','gst_number'])">Save Business Info</button>
        </div>
      </div>
      <div>
        <div class="settings-section">
          <div class="settings-section-title">🖨️ Print Settings</div>
          <div class="form-group">
            <label class="form-label">Default Page Size</label>
            <select id="setting-default_page_size" class="form-control">
              ${['A4','A3','Letter'].map(s => `<option value="${s}" ${settings.default_page_size===s?'selected':''}>${s}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Default Separator Pages</label>
            <select id="setting-default_separator_pages" class="form-control">
              ${['0','1','2'].map(n => `<option value="${n}" ${settings.default_separator_pages===n?'selected':''}>${n} page${n!=='1'?'s':''}</option>`).join('')}
            </select>
          </div>
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">
            <input type="checkbox" id="setting-auto_print_enabled" ${settings.auto_print_enabled==='true'?'checked':''} />
            <label for="setting-auto_print_enabled" style="cursor:pointer;font-size:14px">Enable Auto-Print (send to print agent automatically)</label>
          </div>
          <button class="btn btn-primary" onclick="saveSettings(['default_page_size','default_separator_pages','auto_print_enabled'])">Save Print Settings</button>
        </div>
        <div class="settings-section">
          <div class="settings-section-title">💰 Tax Settings</div>
          <div class="form-group">
            <label class="form-label">GST Percentage (%)</label>
            <input id="setting-gst_percent" type="number" class="form-control" value="${settings.gst_percent||'18'}" min="0" max="100" />
          </div>
          <button class="btn btn-primary" onclick="saveSettings(['gst_percent'])">Save Tax Settings</button>
        </div>
      </div>
    </div>`;

  window.saveSettings = async (keys) => {
    const updates = {};
    keys.forEach(key => {
      const el = document.getElementById(`setting-${key}`);
      if (el) updates[key] = el.type === 'checkbox' ? String(el.checked) : el.value;
    });
    try {
      await window.api.updateSettings(updates);
      toast('Settings saved!', 'success');
    } catch (e) { toast(e.message, 'error'); }
  };
}