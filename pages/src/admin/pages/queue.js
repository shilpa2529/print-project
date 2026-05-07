import { formatCurrency, formatDate, statusBadge, toast, confirm } from '../../shared/utils.js';

export async function renderAdminQueue(container, user) {
  let currentSize = 'all';

  const loadQueue = async () => {
    const params = { status: 'queued' };
    if (currentSize !== 'all') params.page_size = currentSize;
    const { queue, summary } = await window.api.getQueue(params);
    renderQueueUI(queue, summary);
  };

  const renderQueueUI = (queue, summary) => {
    container.innerHTML = `
      <!-- Summary cards -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin-bottom:24px">
        <div class="stat-card" style="cursor:pointer" onclick="filterSize('all')">
          <div class="stat-icon" style="background:#eef2ff;color:#4f46e5">📋</div>
          <div class="stat-label">Total Queued</div>
          <div class="stat-value">${summary.reduce((s,q) => s + q.order_count, 0)}</div>
        </div>
        ${['A4','A3','Letter'].map(size => {
          const q = summary.find(s => s.page_size === size) || { order_count: 0, total_pages: 0 };
          const colors = { A4: ['#4f46e5','#eef2ff'], A3: ['#10b981','#ecfdf5'], Letter: ['#f59e0b','#fffbeb'] };
          const [c, bg] = colors[size];
          return `
            <div class="stat-card" style="cursor:pointer" onclick="filterSize('${size}')">
              <div class="stat-icon" style="background:${bg};color:${c}">${size}</div>
              <div class="stat-label">${size} Queue</div>
              <div class="stat-value">${q.order_count} orders</div>
              <div style="font-size:12px;color:var(--text-secondary)">${q.total_pages} pages</div>
            </div>`;
        }).join('')}
      </div>

      <!-- Queue tabs and actions -->
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:12px">
        <div class="queue-tabs">
          ${['all','A4','A3','Letter'].map(s => `
            <button class="queue-tab ${s === currentSize ? 'active' : ''}" onclick="filterSize('${s}')">${s === 'all' ? '📋 All' : s}</button>`).join('')}
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          ${currentSize !== 'all' ? `
            <select class="form-control" id="separator-select" style="max-width:180px">
              <option value="0">No Separator Pages</option>
              <option value="1" selected>1 Separator Page</option>
              <option value="2">2 Separator Pages</option>
            </select>
            <button class="btn btn-primary" onclick="batchPrint('${currentSize}')">
              🖨️ Batch Print ${currentSize === 'all' ? '' : currentSize}
            </button>` : `
            <button class="btn btn-secondary" onclick="batchPrint('A4')">🖨️ Batch A4</button>
            <button class="btn btn-secondary" onclick="batchPrint('A3')">🖨️ Batch A3</button>
            <button class="btn btn-secondary" onclick="batchPrint('Letter')">🖨️ Batch Letter</button>`}
          <button class="btn btn-secondary" onclick="loadQueue()">🔄 Refresh</button>
        </div>
      </div>

      <!-- Queue list -->
      ${queue.length === 0 ? `
        <div class="empty-state card">
          <div class="empty-icon">✅</div>
          <h3>Queue is empty</h3>
          <p>All paid orders have been processed</p>
        </div>` : `
        <div id="queue-list">
          ${queue.map((item, i) => `
            <div class="queue-item" id="qitem-${item.id}">
              <div style="font-size:20px;width:36px;text-align:center;color:var(--text-tertiary);font-weight:700">${i + 1}</div>
              <div class="queue-order-num">#${item.order_number}</div>
              <div class="queue-details">
                <div style="font-weight:600;font-size:13px;color:var(--text);margin-bottom:2px">${item.customer_name}</div>
                <div>${item.page_size} · ${item.print_type === 'bw' ? 'B&W' : 'Color'} · ${item.print_sides} side · ${item.total_pages} pages × ${item.copies} copies</div>
                <div style="margin-top:4px;font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:300px">
                  📄 ${item.file_names || 'No files'}
                </div>
              </div>
              <div style="text-align:right;min-width:80px">
                <div style="font-family:var(--font-mono);font-weight:700;color:var(--primary)">${item.total_pages * item.copies}</div>
                <div style="font-size:11px;color:var(--text-secondary)">total pages</div>
              </div>
              <span class="badge" style="background:#eef2ff;color:#4f46e5;border:1px solid #c7d2fe">${item.page_size}</span>
              <div class="queue-actions">
                <button class="btn btn-success btn-sm" onclick="markPrinted(${item.id})">✅ Printed</button>
                <button class="btn btn-danger btn-sm" onclick="removeQueue(${item.id})">✕</button>
              </div>
            </div>`).join('')}
        </div>`}`;

    window.filterSize = (size) => { currentSize = size; loadQueue(); };

    window.batchPrint = async (size) => {
      const sep = parseInt(document.getElementById('separator-select')?.value || '1');
      const ok = await confirm(`Create batch print job for ${size === 'all' ? 'all sizes' : size}?\n\nThis will merge all queued ${size} orders into one print job with ${sep} separator page(s) between orders.`);
      if (!ok) return;
      try {
        const { batch_id, item_count, file_groups } = await window.api.createBatch(size === 'all' ? 'A4' : size, sep);
        toast(`Batch created: ${item_count} orders. Batch ID: ${batch_id}`, 'success');
        showBatchSummary(batch_id, item_count, file_groups, sep, size);
        loadQueue();
      } catch (e) { toast('Batch error: ' + e.message, 'error'); }
    };

    window.markPrinted = async (id) => {
      try {
        await window.api.updateQueueStatus(id, 'printed', null);
        toast('Marked as printed, order status → Ready', 'success');
        loadQueue();
      } catch (e) { toast(e.message, 'error'); }
    };

    window.removeQueue = async (id) => {
      const ok = await confirm('Remove this order from the print queue?');
      if (!ok) return;
      try {
        await window.api.removeFromQueue(id);
        toast('Removed from queue', 'info');
        loadQueue();
      } catch (e) { toast(e.message, 'error'); }
    };
  };

  window.loadQueue = loadQueue;
  await loadQueue();
}

function showBatchSummary(batchId, count, fileGroups, sep, size) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal" style="max-width:580px">
      <div class="modal-header">
        <div class="modal-title">🖨️ Batch Print Job Ready</div>
        <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">✕</button>
      </div>
      <div style="background:var(--primary-light);border:1.5px solid var(--primary);border-radius:var(--radius);padding:16px;margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--primary);margin-bottom:4px">Batch ID: ${batchId}</div>
        <div style="font-size:24px;font-weight:800">${count} orders queued for ${size}</div>
        <div style="font-size:13px;color:var(--text-secondary);margin-top:4px">${sep} separator page(s) between each order</div>
      </div>
      <div style="margin-bottom:20px">
        <div style="font-size:13px;font-weight:700;color:var(--text-secondary);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:12px">Print Order</div>
        ${fileGroups.map((g, i) => `
          <div style="display:flex;align-items:center;gap:12px;padding:10px;background:var(--card-2);border-radius:8px;margin-bottom:6px">
            <div style="width:24px;height:24px;border-radius:50%;background:var(--primary);color:white;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;flex-shrink:0">${i+1}</div>
            <div>
              <div style="font-size:13px;font-weight:600">Order #${g.order_id}</div>
              <div style="font-size:11px;color:var(--text-secondary)">${g.files.map(f => f.original_name).join(', ')}</div>
            </div>
          </div>`).join('')}
      </div>
      <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:8px;padding:12px;font-size:13px;color:#92400e;margin-bottom:16px">
        ⚠️ <strong>Important:</strong> Download files for each order in order shown above. Add ${sep} blank separator page(s) between orders in your printer software before printing.
      </div>
      <button class="btn btn-primary" style="width:100%" onclick="this.closest('.modal-overlay').remove()">
        ✅ Understood, will print now
      </button>
    </div>`;
  document.body.appendChild(overlay);
}