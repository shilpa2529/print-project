import { formatCurrency, formatDate, statusBadge, toast } from '../../shared/utils.js';

export async function renderOrders(container, user) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">My Orders</div>
        <div class="page-subtitle">View and manage all your print orders</div>
      </div>
      <button class="btn btn-primary" onclick="navigateTo('new-order')">➕ New Order</button>
    </div>
    <div class="page-body">
      <div class="card" style="margin-bottom:20px">
        <div style="display:flex;gap:12px;flex-wrap:wrap;align-items:center">
          <div style="flex:1;min-width:200px">
            <input class="form-control" id="search-orders" placeholder="🔍 Search orders..." 
              oninput="filterOrders()" />
          </div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            ${['all','placed','paid','printing','ready','delivered','cancelled'].map(s => `
              <button class="btn btn-sm ${s === 'all' ? 'btn-primary' : 'btn-secondary'}" 
                data-status="${s}" onclick="filterByStatus('${s}',this)">
                ${s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>`).join('')}
          </div>
        </div>
      </div>
      <div id="orders-list">
        <div style="text-align:center;padding:40px">
          <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;margin:0 auto"></div>
        </div>
      </div>
    </div>`;

  let allOrders = [];
  let currentStatus = 'all';

  const loadOrders = async (status = 'all') => {
    const params = { limit: 50 };
    if (status !== 'all') params.status = status;
    try {
      const res = await window.api.getOrders(params);
      allOrders = res.orders || [];
      renderList(allOrders);
    } catch (e) {
      document.getElementById('orders-list').innerHTML = `<div class="card"><p style="color:var(--error)">Failed to load orders: ${e.message}</p></div>`;
    }
  };

  const renderList = (orders) => {
    const list = document.getElementById('orders-list');
    if (!orders.length) {
      list.innerHTML = `<div class="empty-state card">
        <div class="empty-icon">📭</div>
        <h3>No orders found</h3>
        <p>Try a different filter or place a new order</p>
        <button class="btn btn-primary" style="margin-top:16px" onclick="navigateTo('new-order')">Place Order</button>
      </div>`;
      return;
    }
    list.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Date</th>
              <th>Files</th>
              <th>Details</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong style="font-family:var(--font-mono)">${o.order_number}</strong></td>
                <td style="color:var(--text-secondary);font-size:12px">${formatDate(o.created_at)}</td>
                <td style="font-size:12px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${o.file_names || '-'}</td>
                <td style="font-size:12px;color:var(--text-secondary)">
                  ${o.page_size} · ${o.print_type === 'bw' ? 'B&W' : 'Color'} · ${o.total_pages}p
                </td>
                <td>${statusBadge(o.status)}</td>
                <td>${statusBadge(o.payment_status)} ${o.payment_method ? `<span style="font-size:11px;color:var(--text-secondary)">${o.payment_method.toUpperCase()}</span>` : ''}</td>
                <td><strong style="font-family:var(--font-mono);color:var(--primary)">${formatCurrency(o.total_amount)}</strong></td>
                <td>
                  <div style="display:flex;gap:6px">
                    <button class="btn btn-secondary btn-sm" onclick="viewOrderDetail(${o.id})">👁</button>
                    ${o.payment_status === 'pending' && o.payment_method !== 'cod' ? 
                      `<button class="btn btn-primary btn-sm" onclick="retryPayment(${o.id})">Pay</button>` : ''}
                    <button class="btn btn-secondary btn-sm" onclick="downloadInvoice(${o.id})">🧾</button>
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  };

  window.filterByStatus = (status, btn) => {
    currentStatus = status;
    document.querySelectorAll('[data-status]').forEach(b => {
      b.className = `btn btn-sm ${b.dataset.status === status ? 'btn-primary' : 'btn-secondary'}`;
    });
    loadOrders(status);
  };

  window.filterOrders = () => {
    const q = document.getElementById('search-orders').value.toLowerCase();
    const filtered = allOrders.filter(o =>
      o.order_number.toLowerCase().includes(q) ||
      (o.file_names || '').toLowerCase().includes(q)
    );
    renderList(filtered);
  };

  window.viewOrderDetail = async (id) => {
    try {
      const { order, files, invoice } = await window.api.getOrder(id);
      showOrderModal(order, files, invoice);
    } catch (e) { toast('Failed to load order: ' + e.message, 'error'); }
  };

  window.retryPayment = async (orderId) => {
    try {
      const rzpData = await window.api.createPaymentOrder(orderId);
      const { order } = await window.api.getOrder(orderId);
      const rzp = new Razorpay({
        key: rzpData.key_id,
        amount: rzpData.amount,
        currency: rzpData.currency,
        order_id: rzpData.razorpay_order_id,
        name: 'QuickPrint',
        description: `Order #${rzpData.order_number}`,
        theme: { color: '#4f46e5' },
        handler: async (response) => {
          await window.api.verifyPayment({
            razorpay_order_id: response.razorpay_order_id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
            order_id: orderId,
            payment_method: 'upi'
          });
          toast('Payment successful!', 'success');
          loadOrders(currentStatus);
        }
      });
      rzp.open();
    } catch (e) { toast('Payment error: ' + e.message, 'error'); }
  };

  window.downloadInvoice = async (orderId) => {
    try {
      const { invoice, shop } = await window.api.getInvoiceByOrder(orderId);
      const { order } = await window.api.getOrder(orderId);
      printInvoice(invoice, order, shop);
    } catch (e) { toast('Invoice not available yet', 'warning'); }
  };

  loadOrders();
}

function showOrderModal(order, files, invoice) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:640px">
      <div class="modal-header">
        <div class="modal-title">Order #${order.order_number}</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Print Details</div>
          <div style="font-size:13px;display:flex;flex-direction:column;gap:6px">
            <div><span style="color:var(--text-secondary)">Page Size:</span> <strong>${order.page_size}</strong></div>
            <div><span style="color:var(--text-secondary)">Type:</span> <strong>${order.print_type === 'bw' ? 'Black & White' : 'Color'}</strong></div>
            <div><span style="color:var(--text-secondary)">Sides:</span> <strong>${order.print_sides}</strong></div>
            <div><span style="color:var(--text-secondary)">Copies:</span> <strong>${order.copies}</strong></div>
            <div><span style="color:var(--text-secondary)">Total Pages:</span> <strong>${order.total_pages}</strong></div>
            <div><span style="color:var(--text-secondary)">Delivery:</span> <strong>${order.delivery_type}</strong></div>
          </div>
        </div>
        <div>
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Payment</div>
          <div style="font-size:13px;display:flex;flex-direction:column;gap:6px">
            <div><span style="color:var(--text-secondary)">Method:</span> <strong>${order.payment_method || 'Pending'}</strong></div>
            <div><span style="color:var(--text-secondary)">Subtotal:</span> <strong>₹${order.subtotal}</strong></div>
            <div><span style="color:var(--text-secondary)">Delivery:</span> <strong>₹${order.delivery_charge}</strong></div>
            <div><span style="color:var(--text-secondary)">Total:</span> <strong style="color:var(--primary);font-size:15px">₹${order.total_amount}</strong></div>
          </div>
        </div>
      </div>
      ${files?.length ? `
        <div style="margin-bottom:16px">
          <div style="font-size:12px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;margin-bottom:8px">Files</div>
          ${files.map(f => `<div class="file-item">
            <span class="file-icon">📄</span>
            <div class="file-info"><div class="file-name">${f.original_name}</div>
            <div class="file-meta">${f.page_count} pages</div></div>
            <a href="${window.api.getFileDownloadUrl(f.id)}" class="btn btn-secondary btn-sm" target="_blank">⬇</a>
          </div>`).join('')}
        </div>` : ''}
      ${invoice ? `
        <button class="btn btn-secondary" style="width:100%" onclick="downloadInvoice(${order.id});this.closest('.modal-overlay').remove()">
          🧾 Download Invoice #${invoice.invoice_number}
        </button>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}

function printInvoice(invoice, order, shop) {
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html><html><head><title>Invoice ${invoice.invoice_number}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;max-width:600px;margin:0 auto}
      .header{display:flex;justify-content:space-between;margin-bottom:40px}
      .logo{font-size:24px;font-weight:900;color:#4f46e5}
      .invoice-title{text-align:right;color:#64748b}
      table{width:100%;border-collapse:collapse;margin:20px 0}
      td,th{padding:10px;border-bottom:1px solid #e2e8f7;font-size:13px}
      th{background:#f8faff;font-weight:700;text-align:left}
      .total{font-size:18px;font-weight:900;color:#4f46e5}
      @media print{button{display:none}}
    </style></head>
    <body>
      <div class="header">
        <div><div class="logo">🖨️ ${shop.shop_name || 'QuickPrint'}</div>
        <div style="font-size:12px;color:#64748b;margin-top:6px">${shop.shop_address || ''}<br/>${shop.shop_phone || ''}</div></div>
        <div class="invoice-title"><strong>INVOICE</strong><br/>#${invoice.invoice_number}<br/>
        <span style="font-size:12px">${new Date(invoice.generated_at).toLocaleDateString('en-IN')}</span></div>
      </div>
      <div style="background:#f8faff;padding:16px;border-radius:8px;margin-bottom:24px">
        <strong>${order.customer_name}</strong><br/>
        <span style="font-size:13px;color:#64748b">${order.customer_phone} | ${order.customer_email || ''}</span>
      </div>
      <table>
        <thead><tr><th>Description</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
        <tbody>
          <tr>
            <td>${order.page_size} ${order.print_type === 'bw' ? 'B&W' : 'Color'} Print (${order.print_sides} side)</td>
            <td>${order.total_pages} × ${order.copies}</td>
            <td>₹${(order.subtotal / (order.total_pages * order.copies)).toFixed(2)}</td>
            <td>₹${order.subtotal}</td>
          </tr>
          ${order.delivery_charge > 0 ? `<tr><td>Delivery Charge</td><td>1</td><td>₹${order.delivery_charge}</td><td>₹${order.delivery_charge}</td></tr>` : ''}
        </tbody>
      </table>
      <div style="text-align:right">
        <span class="total">Total: ₹${order.total_amount}</span><br/>
        <span style="font-size:12px;color:#64748b">Payment: ${order.payment_method || 'COD'}</span>
      </div>
      <div style="margin-top:40px;font-size:11px;color:#94a3b8;border-top:1px solid #e2e8f7;padding-top:16px">
        Thank you for choosing ${shop.shop_name || 'QuickPrint'}! Order #${order.order_number}
      </div>
      <button onclick="window.print()" style="margin-top:20px;padding:10px 20px;background:#4f46e5;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px">Print Invoice</button>
    </body></html>`);
  win.document.close();
}