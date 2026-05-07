import { formatCurrency, formatDate, statusBadge, toast, debounce } from '../../shared/utils.js';

export async function renderAdminOrders(container, user, customersView = false) {
  container.innerHTML = `
    <div class="filters-bar">
      <input class="form-control" id="order-search" placeholder="🔍 Search by name, phone, order #..." 
        style="max-width:280px" oninput="debouncedSearch()" />
      <select class="form-control" id="status-filter" style="max-width:160px" onchange="loadOrders()">
        <option value="">All Statuses</option>
        <option value="placed">Placed</option>
        <option value="paid">Paid</option>
        <option value="printing">Printing</option>
        <option value="ready">Ready</option>
        <option value="out_for_delivery">Out for Delivery</option>
        <option value="delivered">Delivered</option>
        <option value="cancelled">Cancelled</option>
      </select>
      <select class="form-control" id="page-size-filter" style="max-width:120px" onchange="loadOrders()">
        <option value="">All Sizes</option>
        <option value="A4">A4</option>
        <option value="A3">A3</option>
        <option value="Letter">Letter</option>
      </select>
      <button class="btn btn-secondary btn-sm" onclick="loadOrders()">🔄 Refresh</button>
      <div style="margin-left:auto;display:flex;gap:8px">
        <button class="btn btn-primary btn-sm" onclick="showCreateOrderModal()">➕ Create Order</button>
      </div>
    </div>

    <!-- Status quick filters -->
    <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px">
      ${['all','placed','paid','printing','ready','delivered'].map(s => `
        <button class="btn btn-sm ${s === 'all' ? 'btn-primary' : 'btn-secondary'}" 
          data-qfilter="${s}" onclick="quickFilter('${s}',this)">
          ${s === 'all' ? '📋 All' : s.charAt(0).toUpperCase() + s.slice(1)}
        </button>`).join('')}
    </div>

    <div id="orders-table-wrap">
      <div style="text-align:center;padding:60px">
        <div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;width:32px;height:32px;border-width:3px;margin:0 auto"></div>
      </div>
    </div>`;

  const renderTable = (orders) => {
    const wrap = document.getElementById('orders-table-wrap');
    if (!orders.length) {
      wrap.innerHTML = `<div class="empty-state card"><div class="empty-icon">📭</div><h3>No orders found</h3><p>Try a different filter</p></div>`;
      return;
    }
    wrap.innerHTML = `
      <div class="table-wrapper">
        <table>
          <thead>
            <tr>
              <th>Order #</th>
              <th>Customer</th>
              <th>Size</th>
              <th>Pages</th>
              <th>Type</th>
              <th>Delivery</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Amount</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${orders.map(o => `
              <tr>
                <td><strong style="font-family:var(--font-mono);color:var(--primary);font-size:13px">${o.order_number}</strong></td>
                <td>
                  <div style="font-weight:600;font-size:13px">${o.customer_name}</div>
                  <div style="font-size:11px;color:var(--text-secondary)">${o.customer_phone}</div>
                </td>
                <td><span class="badge" style="background:var(--primary-light);color:var(--primary)">${o.page_size}</span></td>
                <td style="font-size:13px">${o.total_pages} × ${o.copies}</td>
                <td style="font-size:12px">${o.print_type === 'bw' ? '⬛ B&W' : '🌈 Color'}</td>
                <td style="font-size:12px">${o.delivery_type === 'pickup' ? '🏪' : '🚚'} ${o.delivery_type}</td>
                <td>${statusBadge(o.status)}</td>
                <td>
                  ${statusBadge(o.payment_status)}
                  ${o.payment_method ? `<div style="font-size:10px;color:var(--text-secondary);margin-top:2px">${o.payment_method.toUpperCase()}</div>` : ''}
                </td>
                <td><strong style="font-family:var(--font-mono)">${formatCurrency(o.total_amount)}</strong></td>
                <td style="font-size:11px;color:var(--text-secondary)">${formatDate(o.created_at)}</td>
                <td>
                  <div style="display:flex;gap:4px;flex-wrap:wrap">
                    <button class="btn btn-secondary btn-sm" onclick="openOrderDetail(${o.id})" title="View">👁</button>
                    ${statusActions(o)}
                  </div>
                </td>
              </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  };

  const loadOrders = async () => {
    const search = document.getElementById('order-search')?.value;
    const status = document.getElementById('status-filter')?.value;
    try {
      const params = { limit: 100 };
      if (search) params.search = search;
      if (status) params.status = status;
      const { orders } = await window.api.getOrders(params);
      renderTable(orders);
    } catch (e) { toast('Failed to load orders: ' + e.message, 'error'); }
  };

  window.loadOrders = loadOrders;
  window.debouncedSearch = debounce(loadOrders, 400);

  window.quickFilter = (status, btn) => {
    document.querySelectorAll('[data-qfilter]').forEach(b =>
      b.className = `btn btn-sm ${b.dataset.qfilter === status ? 'btn-primary' : 'btn-secondary'}`);
    const sel = document.getElementById('status-filter');
    if (sel) sel.value = status === 'all' ? '' : status;
    loadOrders();
  };

  window.openOrderDetail = async (id) => {
    try {
      const { order, files, invoice } = await window.api.getOrder(id);
      showOrderDetailModal(order, files, invoice, loadOrders);
    } catch (e) { toast('Error: ' + e.message, 'error'); }
  };

  window.showCreateOrderModal = () => {
    toast('Redirect customer to customer portal to place order', 'info');
  };

  loadOrders();
}

function statusActions(o) {
  const actions = [];
  if (o.status === 'paid') {
    actions.push(`<button class="btn btn-sm" style="background:#f5f3ff;color:#7c3aed" onclick="changeStatus(${o.id},'printing')">🖨️ Print</button>`);
  }
  if (o.status === 'printing') {
    actions.push(`<button class="btn btn-success btn-sm" onclick="changeStatus(${o.id},'ready')">✅ Ready</button>`);
  }
  if (o.status === 'ready' && o.delivery_type === 'delivery') {
    actions.push(`<button class="btn btn-sm" style="background:#eff6ff;color:#1d4ed8" onclick="changeStatus(${o.id},'out_for_delivery')">🚚 Dispatch</button>`);
  }
  if (o.status === 'out_for_delivery') {
    actions.push(`<button class="btn btn-success btn-sm" onclick="changeStatus(${o.id},'delivered')">🎉 Delivered</button>`);
  }
  if (o.payment_status === 'pending' && o.payment_method === 'cod') {
    actions.push(`<button class="btn btn-sm" style="background:#fef9c3;color:#713f12" onclick="confirmCod(${o.id})">₹ COD Paid</button>`);
  }
  return actions.join('');
}

window.changeStatus = async (id, status) => {
  try {
    await window.api.updateOrderStatus(id, status);
    toast(`Status → ${status}`, 'success');
    if (window.loadOrders) window.loadOrders();
  } catch (e) { toast(e.message, 'error'); }
};

window.confirmCod = async (id) => {
  try {
    await window.api.confirmCod(id);
    toast('COD payment confirmed, order queued for printing', 'success');
    if (window.loadOrders) window.loadOrders();
  } catch (e) { toast(e.message, 'error'); }
};

function showOrderDetailModal(order, files, invoice, onUpdate) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:680px">
      <div class="modal-header">
        <div>
          <div class="modal-title">Order #${order.order_number}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:4px">${formatDate(order.created_at)}</div>
        </div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>

      <!-- Status badges -->
      <div style="display:flex;gap:8px;margin-bottom:20px">
        ${statusBadge(order.status)}
        ${statusBadge(order.payment_status)}
        ${order.payment_method ? `<span class="badge" style="background:var(--card-2);color:var(--text-secondary);border:1px solid var(--border)">${order.payment_method.toUpperCase()}</span>` : ''}
      </div>

      <div class="order-detail-grid">
        <div class="detail-section">
          <div class="detail-label">Customer Info</div>
          <div class="detail-row"><span>Name</span><strong>${order.customer_name}</strong></div>
          <div class="detail-row"><span>Phone</span><strong>${order.customer_phone}</strong></div>
          ${order.customer_email ? `<div class="detail-row"><span>Email</span><strong>${order.customer_email}</strong></div>` : ''}
          <div class="detail-row"><span>Delivery</span><strong>${order.delivery_type === 'pickup' ? '🏪 Pickup' : '🚚 Home Delivery'}</strong></div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Print Details</div>
          <div class="detail-row"><span>Page Size</span><strong>${order.page_size}</strong></div>
          <div class="detail-row"><span>Print Type</span><strong>${order.print_type === 'bw' ? '⬛ Black & White' : '🌈 Color'}</strong></div>
          <div class="detail-row"><span>Print Sides</span><strong>${order.print_sides}</strong></div>
          <div class="detail-row"><span>Copies</span><strong>${order.copies}</strong></div>
          <div class="detail-row"><span>Total Pages</span><strong>${order.total_pages}</strong></div>
          <div class="detail-row"><span>Page Range</span><strong>${order.page_range || 'All'}</strong></div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Pricing</div>
          <div class="detail-row"><span>Subtotal</span><span>${formatCurrency(order.subtotal)}</span></div>
          <div class="detail-row"><span>Delivery</span><span>${formatCurrency(order.delivery_charge)}</span></div>
          <div class="detail-row" style="font-size:16px;font-weight:800;color:var(--primary)">
            <span>Total</span><span>${formatCurrency(order.total_amount)}</span>
          </div>
        </div>
        <div class="detail-section">
          <div class="detail-label">Files</div>
          ${files?.map(f => `
            <div style="display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px solid var(--border)">
              <span>📄</span>
              <div style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${f.original_name}</div>
              <span style="font-size:11px;color:var(--text-secondary)">${f.page_count}p</span>
              <a href="${window.api.getFileDownloadUrl(f.id)}" class="btn btn-secondary btn-sm" target="_blank" style="padding:4px 8px">⬇</a>
            </div>`).join('') || '<p style="color:var(--text-secondary);font-size:13px">No files</p>'}
        </div>
      </div>

      <!-- Status actions -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:20px;padding-top:20px;border-top:1px solid var(--border)">
        <strong style="font-size:13px;color:var(--text-secondary);align-self:center">Update Status:</strong>
        ${['paid','printing','ready','out_for_delivery','delivered','cancelled'].map(s => `
          <button class="btn btn-sm ${order.status === s ? 'btn-primary' : 'btn-secondary'}" 
            onclick="changeStatus(${order.id},'${s}');this.closest('.modal-overlay').remove();${onUpdate ? 'loadOrders()' : ''}">
            ${s.replace(/_/g,' ')}
          </button>`).join('')}
      </div>

      ${invoice ? `
        <button class="btn btn-secondary" style="width:100%;margin-top:12px" onclick="window.open('','_blank')">
          🧾 Invoice #${invoice.invoice_number}
        </button>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}