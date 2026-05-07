import { formatCurrency, formatDate, statusBadge, toast } from '../../shared/utils.js';

// ─── TRACKING ────────────────────────────────────────────────────
export async function renderTracking(container, user) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">📍 Order Tracking</div>
      <div class="page-subtitle">Real-time status of all your active orders</div>
    </div>
    <div class="page-body" id="tracking-body">
      <div style="text-align:center;padding:60px">
        <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;margin:0 auto"></div>
      </div>
    </div>`;

  const statusSteps = [
    { key: 'placed', label: 'Order Placed', icon: '📝' },
    { key: 'paid', label: 'Payment Confirmed', icon: '💰' },
    { key: 'printing', label: 'Printing', icon: '🖨️' },
    { key: 'ready', label: 'Ready for Pickup', icon: '✅' },
    { key: 'out_for_delivery', label: 'Out for Delivery', icon: '🚚' },
    { key: 'delivered', label: 'Delivered', icon: '🎉' },
  ];

  try {
    const { orders } = await window.api.getOrders({ limit: 20 });
    const activeOrders = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const body = document.getElementById('tracking-body');

    if (!activeOrders.length) {
      body.innerHTML = `<div class="empty-state card">
        <div class="empty-icon">📭</div>
        <h3>No active orders</h3>
        <p>All your orders have been delivered!</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('new-order')">Place New Order</button>
      </div>`;
      return;
    }

    body.innerHTML = activeOrders.map(order => {
      const currIdx = statusSteps.findIndex(s => s.key === order.status);
      return `
        <div class="card" style="margin-bottom:20px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px">
            <div>
              <div style="font-size:18px;font-weight:800">Order #${order.order_number}</div>
              <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">
                ${order.page_size} · ${order.total_pages} pages · ${formatCurrency(order.total_amount)}
              </div>
            </div>
            ${statusBadge(order.status)}
          </div>
          <div style="position:relative">
            <div style="position:absolute;top:10px;left:10px;right:10px;height:2px;background:var(--border);z-index:0"></div>
            <div style="position:absolute;top:10px;left:10px;height:2px;background:var(--primary);z-index:1;width:${Math.min(100, (currIdx / (statusSteps.length - 1)) * 100)}%;transition:width 0.5s ease"></div>
            <div style="display:flex;justify-content:space-between;position:relative;z-index:2">
              ${statusSteps.map((step, i) => {
                const isDone = i < currIdx;
                const isActive = i === currIdx;
                return `
                  <div style="display:flex;flex-direction:column;align-items:center;gap:8px">
                    <div style="width:22px;height:22px;border-radius:50%;
                      background:${isDone ? 'var(--success)' : isActive ? 'var(--primary)' : 'var(--border)'};
                      display:flex;align-items:center;justify-content:center;
                      color:${isDone || isActive ? 'white' : 'var(--text-tertiary)'};
                      font-size:10px;font-weight:700;
                      ${isActive ? 'box-shadow:0 0 0 4px rgba(79,70,229,0.15)' : ''}">
                      ${isDone ? '✓' : ''}
                    </div>
                    <div style="font-size:10px;font-weight:600;text-align:center;max-width:70px;
                      color:${isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--text-tertiary)'}">
                      ${step.label}
                    </div>
                  </div>`;
              }).join('')}
            </div>
          </div>
          ${order.delivery_type === 'delivery' ? `
            <div style="margin-top:20px;padding:12px;background:var(--primary-light);border-radius:8px;font-size:13px;color:var(--primary);font-weight:600">
              🚚 Home delivery to: ${order.city || 'your address'}
            </div>` : `
            <div style="margin-top:20px;padding:12px;background:var(--card-2);border-radius:8px;font-size:13px;color:var(--text-secondary)">
              🏪 Pickup from shop when status is "Ready"
            </div>`}
        </div>`;
    }).join('');
  } catch (e) {
    document.getElementById('tracking-body').innerHTML = `<div class="card"><p style="color:var(--error)">Error: ${e.message}</p></div>`;
  }
}

// ─── INVOICES ────────────────────────────────────────────────────
export async function renderInvoices(container, user) {
  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">🧾 Invoices</div>
      <div class="page-subtitle">Download and view billing history</div>
    </div>
    <div class="page-body" id="invoices-body">
      <div style="text-align:center;padding:60px">
        <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;margin:0 auto"></div>
      </div>
    </div>`;

  try {
    const { invoices } = await window.api.getInvoices();
    const body = document.getElementById('invoices-body');

    if (!invoices.length) {
      body.innerHTML = `<div class="empty-state card">
        <div class="empty-icon">🧾</div>
        <h3>No invoices yet</h3>
        <p>Invoices are generated after payment</p>
      </div>`;
      return;
    }

    body.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr><th>Invoice #</th><th>Order #</th><th>Customer</th><th>Amount</th><th>Date</th><th>Actions</th></tr>
          </thead>
          <tbody>
            ${invoices.map(inv => `
              <tr>
                <td><strong style="font-family:var(--font-mono);color:var(--primary)">${inv.invoice_number}</strong></td>
                <td style="font-family:var(--font-mono);font-size:13px">${inv.order_number}</td>
                <td>${inv.customer_name}</td>
                <td><strong>${formatCurrency(inv.total_amount)}</strong></td>
                <td style="font-size:12px;color:var(--text-secondary)">${formatDate(inv.generated_at)}</td>
                <td>
                  <button class="btn btn-secondary btn-sm" onclick="viewInvoice(${inv.id})">🧾 View</button>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;

    window.viewInvoice = async (id) => {
      try {
        const { invoice, shop } = await window.api.getInvoice(id);
        const { order } = await window.api.getOrder(invoice.order_id);
        // Open invoice print view
        const win = window.open('', '_blank');
        win.document.write(buildInvoiceHtml(invoice, order, shop));
        win.document.close();
      } catch (e) { toast('Error: ' + e.message, 'error'); }
    };
  } catch (e) {
    document.getElementById('invoices-body').innerHTML = `<div class="card"><p style="color:var(--error)">Error: ${e.message}</p></div>`;
  }
}

function buildInvoiceHtml(invoice, order, shop) {
  return `<!DOCTYPE html><html><head><title>Invoice ${invoice.invoice_number}</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:'Segoe UI',Arial,sans-serif;padding:48px;color:#0f172a;max-width:700px;margin:0 auto}
      .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:48px;padding-bottom:24px;border-bottom:2px solid #e2e8f7}
      .logo{font-size:26px;font-weight:900;color:#4f46e5}
      .logo-sub{font-size:12px;color:#64748b;margin-top:4px}
      .inv-info{text-align:right}
      .inv-title{font-size:28px;font-weight:900;color:#0f172a;letter-spacing:-1px}
      .inv-num{font-size:14px;color:#64748b;margin-top:4px}
      .parties{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-bottom:32px}
      .party-label{font-size:11px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px}
      .party-name{font-size:16px;font-weight:700;margin-bottom:4px}
      .party-detail{font-size:13px;color:#64748b;line-height:1.6}
      table{width:100%;border-collapse:collapse;margin-bottom:24px}
      thead th{background:#f8faff;padding:12px 16px;font-size:12px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;text-align:left;border-bottom:2px solid #e2e8f7}
      tbody td{padding:14px 16px;border-bottom:1px solid #f1f5f9;font-size:14px}
      .totals{margin-left:auto;width:260px}
      .total-row{display:flex;justify-content:space-between;padding:8px 0;font-size:14px;border-bottom:1px solid #f1f5f9}
      .total-final{display:flex;justify-content:space-between;padding:14px 0;font-size:20px;font-weight:900;color:#4f46e5;border-top:2px solid #4f46e5;margin-top:8px}
      .footer{margin-top:48px;padding-top:24px;border-top:1px solid #e2e8f7;font-size:12px;color:#94a3b8;text-align:center}
      .badge{display:inline-block;padding:4px 12px;border-radius:100px;font-size:12px;font-weight:700;background:#d1fae5;color:#059669}
      @media print{button{display:none!important}.print-btn{display:none!important}}
    </style>
    </head><body>
    <div class="header">
      <div>
        <div class="logo">🖨️ ${shop.shop_name || 'QuickPrint'}</div>
        <div class="logo-sub">${shop.shop_address || ''}</div>
        <div class="logo-sub">${shop.shop_phone || ''} | ${shop.shop_email || ''}</div>
        ${shop.gst_number ? `<div class="logo-sub" style="margin-top:4px">GSTIN: ${shop.gst_number}</div>` : ''}
      </div>
      <div class="inv-info">
        <div class="inv-title">INVOICE</div>
        <div class="inv-num">#${invoice.invoice_number}</div>
        <div class="inv-num">${new Date(invoice.generated_at).toLocaleDateString('en-IN', {day:'2-digit',month:'long',year:'numeric'})}</div>
        <div style="margin-top:8px"><span class="badge">✓ Paid</span></div>
      </div>
    </div>
    <div class="parties">
      <div>
        <div class="party-label">Billed To</div>
        <div class="party-name">${order.customer_name}</div>
        <div class="party-detail">${order.customer_phone}<br/>${order.customer_email || ''}</div>
      </div>
      <div>
        <div class="party-label">Order Details</div>
        <div class="party-name">#${order.order_number}</div>
        <div class="party-detail">
          Payment: ${(order.payment_method || 'COD').toUpperCase()}<br/>
          ${order.razorpay_payment_id ? `Txn ID: ${order.razorpay_payment_id}` : ''}
        </div>
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Pages</th><th>Copies</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>
        <tr>
          <td>
            <strong>${order.page_size} ${order.print_type === 'bw' ? 'Black & White' : 'Color'} Print</strong><br/>
            <span style="color:#64748b;font-size:12px">${order.print_sides === 'single' ? 'Single Side' : 'Double Side'} · ${order.page_range !== 'all' ? 'Pages: ' + order.page_range : 'All Pages'}</span>
          </td>
          <td>${order.total_pages}</td>
          <td>${order.copies}</td>
          <td>₹${order.subtotal > 0 ? (order.subtotal / (order.total_pages * order.copies)).toFixed(2) : '0'}</td>
          <td><strong>₹${order.subtotal}</strong></td>
        </tr>
        ${order.delivery_charge > 0 ? `
        <tr>
          <td>Home Delivery Charge</td><td>-</td><td>-</td><td>₹${order.delivery_charge}</td>
          <td><strong>₹${order.delivery_charge}</strong></td>
        </tr>` : ''}
      </tbody>
    </table>
    <div class="totals">
      <div class="total-row"><span>Subtotal</span><span>₹${order.subtotal}</span></div>
      ${order.delivery_charge > 0 ? `<div class="total-row"><span>Delivery</span><span>₹${order.delivery_charge}</span></div>` : ''}
      <div class="total-final"><span>Total</span><span>₹${order.total_amount}</span></div>
    </div>
    <div class="footer">
      Thank you for choosing ${shop.shop_name || 'QuickPrint'}! This is a computer-generated invoice.
    </div>
    <br/><button onclick="window.print()" style="padding:12px 24px;background:#4f46e5;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600">🖨️ Print Invoice</button>
    </body></html>`;
}

// ─── SETTINGS ────────────────────────────────────────────────────
export async function renderSettings(container, user) {
  let addresses = [];
  try { ({ addresses } = await window.api.getAddresses()); } catch {}

  container.innerHTML = `
    <div class="page-header">
      <div class="page-title">⚙️ Settings</div>
      <div class="page-subtitle">Manage your profile and preferences</div>
    </div>
    <div class="page-body">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px;align-items:start">
        <div>
          <div class="card" style="margin-bottom:20px">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">👤 Profile</h3>
            <div class="form-group">
              <label class="form-label">Full Name</label>
              <input id="profile-name" class="form-control" value="${user.name || ''}" />
            </div>
            <div class="form-group">
              <label class="form-label">Email</label>
              <input class="form-control" value="${user.email || ''}" disabled style="opacity:0.6"/>
            </div>
            <div class="form-group">
              <label class="form-label">Phone</label>
              <input id="profile-phone" class="form-control" value="${user.phone || ''}" placeholder="98765 43210" />
            </div>
            <button class="btn btn-primary" onclick="saveProfile()">Save Changes</button>
          </div>
          <div class="card">
            <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">🔒 Change Password</h3>
            <div class="form-group">
              <label class="form-label">Current Password</label>
              <input id="old-pass" type="password" class="form-control" />
            </div>
            <div class="form-group">
              <label class="form-label">New Password</label>
              <input id="new-pass" type="password" class="form-control" />
            </div>
            <button class="btn btn-primary" onclick="changePassword()">Update Password</button>
          </div>
        </div>
        <div>
          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px">
              <h3 style="font-size:16px;font-weight:800">📍 Saved Addresses</h3>
              <button class="btn btn-primary btn-sm" onclick="showAddressForm()">+ Add</button>
            </div>
            <div id="addresses-list">
              ${addresses.length === 0 ? `<div class="empty-state" style="padding:30px">
                <div class="empty-icon" style="font-size:40px">📍</div>
                <h3>No saved addresses</h3>
                <p>Add your delivery addresses for quick checkout</p>
              </div>` : addresses.map(addr => `
                <div style="padding:14px;background:var(--card-2);border-radius:8px;margin-bottom:10px;border:1.5px solid ${addr.is_default ? 'var(--primary)' : 'var(--border)'}">
                  <div style="display:flex;justify-content:space-between;align-items:flex-start">
                    <div>
                      <div style="font-weight:700;font-size:14px">${addr.label} ${addr.is_default ? '<span style="font-size:11px;color:var(--primary)">• Default</span>' : ''}</div>
                      <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${addr.line1}${addr.line2 ? ', ' + addr.line2 : ''}, ${addr.city}, ${addr.state} - ${addr.pincode}</div>
                    </div>
                  </div>
                </div>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </div>`;

  window.saveProfile = async () => {
    toast('Profile update coming soon', 'info');
  };

  window.changePassword = async () => {
    const old_password = document.getElementById('old-pass').value;
    const new_password = document.getElementById('new-pass').value;
    if (!old_password || !new_password) { toast('Fill in both fields', 'error'); return; }
    try {
      await window.api.post('/auth/change-password', { old_password, new_password });
      toast('Password changed successfully', 'success');
      document.getElementById('old-pass').value = '';
      document.getElementById('new-pass').value = '';
    } catch (e) { toast(e.message, 'error'); }
  };

  window.showAddressForm = () => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal" style="max-width:480px">
        <div class="modal-header">
          <div class="modal-title">Add Address</div>
          <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="form-group">
          <label class="form-label">Label</label>
          <input id="addr-label" class="form-control" placeholder="Home / Office" value="Home" />
        </div>
        <div class="form-group">
          <label class="form-label">Address Line 1 *</label>
          <input id="addr-line1" class="form-control" placeholder="Flat / Building / Street" />
        </div>
        <div class="form-group">
          <label class="form-label">Address Line 2</label>
          <input id="addr-line2" class="form-control" placeholder="Area / Landmark (optional)" />
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label class="form-label">City *</label>
            <input id="addr-city" class="form-control" />
          </div>
          <div class="form-group">
            <label class="form-label">State *</label>
            <input id="addr-state" class="form-control" />
          </div>
        </div>
        <div class="form-group">
          <label class="form-label">Pincode *</label>
          <input id="addr-pincode" class="form-control" placeholder="400001" maxlength="6" />
        </div>
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:20px">
          <input type="checkbox" id="addr-default" />
          <label for="addr-default" style="font-size:13px;cursor:pointer">Set as default address</label>
        </div>
        <button class="btn btn-primary" style="width:100%" onclick="saveAddress()">Save Address</button>
      </div>`;
    document.body.appendChild(overlay);

    window.saveAddress = async () => {
      const data = {
        label: document.getElementById('addr-label').value,
        line1: document.getElementById('addr-line1').value,
        line2: document.getElementById('addr-line2').value,
        city: document.getElementById('addr-city').value,
        state: document.getElementById('addr-state').value,
        pincode: document.getElementById('addr-pincode').value,
        is_default: document.getElementById('addr-default').checked,
      };
      if (!data.line1 || !data.city || !data.state || !data.pincode) {
        toast('Fill in required fields', 'error'); return;
      }
      try {
        await window.api.addAddress(data);
        overlay.remove();
        toast('Address saved!', 'success');
        renderSettings(container, user);
      } catch (e) { toast(e.message, 'error'); }
    };
  };
}