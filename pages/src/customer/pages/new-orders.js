import { toast, formatCurrency, getUser } from '../../shared/utils.js';

let uploadedFiles = [];
let printSettings = { page_size: 'A4', print_type: 'bw', copies: 1, page_range: 'all', print_sides: 'single', delivery_type: 'pickup' };
let pricing = null;

export async function renderNewOrder(container, user) {
  pricing = await window.api.getPricing();
  uploadedFiles = [];
  printSettings = { page_size: 'A4', print_type: 'bw', copies: 1, page_range: 'all', print_sides: 'single', delivery_type: 'pickup' };

  container.innerHTML = `
    <div class="page-header">
      <div>
        <div class="page-title">Place New Order</div>
        <div class="page-subtitle">Upload documents and configure your print job</div>
      </div>
    </div>
    <div class="page-body">
      <!-- Stepper -->
      <div class="order-stepper" id="stepper">
        <div class="step-item active" data-step="1">
          <div class="step-num">1</div>
          <div class="step-label">Upload Files</div>
        </div>
        <div class="step-item" data-step="2">
          <div class="step-num">2</div>
          <div class="step-label">Print Settings</div>
        </div>
        <div class="step-item" data-step="3">
          <div class="step-num">3</div>
          <div class="step-label">Review & Pay</div>
        </div>
      </div>
      <div id="step-content"></div>
    </div>`;

  renderStep(1, user);
}

function renderStep(step, user) {
  const el = document.getElementById('step-content');
  // Update stepper
  document.querySelectorAll('.step-item').forEach((s, i) => {
    s.className = `step-item ${i + 1 < step ? 'done' : i + 1 === step ? 'active' : ''}`;
  });

  if (step === 1) renderStep1(el, user);
  else if (step === 2) renderStep2(el, user);
  else if (step === 3) renderStep3(el, user);
}

function renderStep1(el, user) {
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start">
      <div class="card">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">📂 Upload Files</h3>
        <div class="drag-area" id="drag-area" onclick="document.getElementById('file-input').click()">
          <div class="drag-icon">☁️</div>
          <h4 style="font-size:16px;font-weight:700;margin-bottom:6px">Drag & drop files here</h4>
          <p style="color:var(--text-secondary);font-size:13px">or click to browse</p>
          <p style="color:var(--text-tertiary);font-size:12px;margin-top:8px">Supports PDF, DOC, DOCX, JPG, PNG</p>
        </div>
        <input type="file" id="file-input" multiple accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" style="display:none" />
        <div class="file-list" id="file-list"></div>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:20px">
          <span id="total-pages-label" style="font-size:13px;color:var(--text-secondary)">No files uploaded</span>
          <button class="btn btn-primary" id="next-btn" disabled onclick="goToStep2()" style="opacity:0.5">
            Next: Print Settings →
          </button>
        </div>
      </div>
      <div>
        <div class="card" style="margin-bottom:16px">
          <h4 style="font-weight:800;margin-bottom:12px">Upload Tips</h4>
          <div style="font-size:13px;display:flex;flex-direction:column;gap:8px;color:var(--text-secondary)">
            <div>📄 PDF files are preferred for best quality</div>
            <div>🖼️ Images: minimum 300 DPI recommended</div>
            <div>📝 Word docs will be converted to PDF</div>
            <div>📦 Max file size: 50MB per file</div>
          </div>
        </div>
        <div class="refer-card">
          <h4>🎁 Refer & Earn</h4>
          <p>Invite friends and earn exciting rewards!</p>
          <button class="btn btn-sm">Refer Now</button>
        </div>
      </div>
    </div>`;

  setupDragDrop(user);

  window.goToStep2 = () => {
    if (uploadedFiles.length === 0) { toast('Please upload at least one file', 'error'); return; }
    renderStep(2, user);
  };
}

function setupDragDrop(user) {
  const dragArea = document.getElementById('drag-area');
  const fileInput = document.getElementById('file-input');

  const handleFiles = async (files) => {
    for (const file of files) {
      if (uploadedFiles.some(f => f.name === file.name)) continue;
      await uploadFile(file, user);
    }
    updateFileList();
    updateTotalPages();
  };

  dragArea.addEventListener('dragover', e => { e.preventDefault(); dragArea.classList.add('dragover'); });
  dragArea.addEventListener('dragleave', () => dragArea.classList.remove('dragover'));
  dragArea.addEventListener('drop', e => { e.preventDefault(); dragArea.classList.remove('dragover'); handleFiles([...e.dataTransfer.files]); });
  fileInput.addEventListener('change', e => handleFiles([...e.target.files]));
}

async function uploadFile(file, user) {
  const fileItem = {
    name: file.name,
    size: file.size,
    pageCount: 0,
    status: 'uploading',
    id: null
  };
  uploadedFiles.push(fileItem);
  updateFileList();

  try {
    // Get upload URL
    const { file_id, upload_endpoint } = await window.api.getUploadUrl(file.name, file.type, file.size);
    fileItem.id = file_id;
    updateFileList();

    // Upload file
    await window.api.uploadFile(file_id, file);

    // Estimate page count (simplified - in production use PDF.js or server-side)
    let pageCount = 1;
    if (file.type === 'application/pdf') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const text = new TextDecoder('latin1').decode(arrayBuffer);
        const matches = text.match(/\/Type\s*\/Page[^s]/g);
        pageCount = matches ? matches.length : Math.ceil(file.size / 50000);
      } catch { pageCount = Math.max(1, Math.ceil(file.size / 50000)); }
    }

    await window.api.updatePageCount(file_id, pageCount);
    fileItem.pageCount = pageCount;
    fileItem.status = 'ready';
  } catch (e) {
    fileItem.status = 'error';
    toast(`Failed to upload ${file.name}: ${e.message}`, 'error');
  }
  updateFileList();
  updateTotalPages();
}

function updateFileList() {
  const list = document.getElementById('file-list');
  if (!list) return;
  list.innerHTML = uploadedFiles.map((f, i) => `
    <div class="file-item">
      <span class="file-icon">${f.name.endsWith('.pdf') ? '📕' : f.name.match(/\.(jpg|jpeg|png)$/i) ? '🖼️' : '📄'}</span>
      <div class="file-info">
        <div class="file-name">${f.name}</div>
        <div class="file-meta">
          ${(f.size / 1024 / 1024).toFixed(1)} MB
          ${f.pageCount ? ` • ${f.pageCount} pages` : ''}
          ${f.status === 'uploading' ? ' • <span style="color:var(--warning)">Uploading...</span>' : ''}
          ${f.status === 'error' ? ' • <span style="color:var(--error)">Error</span>' : ''}
          ${f.status === 'ready' ? ' • <span style="color:var(--success)">✓ Ready</span>' : ''}
        </div>
      </div>
      ${f.status === 'ready' ? `<button class="file-remove" onclick="removeFile(${i})">✕</button>` : ''}
    </div>`).join('');

  window.removeFile = (i) => {
    uploadedFiles.splice(i, 1);
    updateFileList();
    updateTotalPages();
  };
}

function updateTotalPages() {
  const label = document.getElementById('total-pages-label');
  const btn = document.getElementById('next-btn');
  if (!label || !btn) return;

  const readyFiles = uploadedFiles.filter(f => f.status === 'ready');
  const totalPages = readyFiles.reduce((sum, f) => sum + (f.pageCount || 0), 0);

  if (readyFiles.length === 0) {
    label.textContent = 'No files uploaded';
    btn.disabled = true;
    btn.style.opacity = '0.5';
  } else {
    label.innerHTML = `Total Pages: <strong>${totalPages}</strong> across ${readyFiles.length} file(s)`;
    btn.disabled = false;
    btn.style.opacity = '1';
  }
}

function renderStep2(el, user) {
  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start">
      <div class="card">
        <h3 style="font-size:16px;font-weight:800;margin-bottom:24px">⚙️ Print Settings</h3>
        <div class="settings-grid">
          <div class="form-group">
            <label class="form-label">Page Size</label>
            <div class="option-group" id="page-size-group">
              ${['A4', 'A3', 'Letter'].map(s => `
                <button class="option-btn ${printSettings.page_size === s ? 'selected' : ''}" 
                  onclick="setSetting('page_size','${s}',this)">${s}</button>`).join('')}
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Print Type</label>
            <div class="option-group">
              <button class="option-btn ${printSettings.print_type === 'bw' ? 'selected' : ''}" 
                onclick="setSetting('print_type','bw',this)">⬛ Black & White</button>
              <button class="option-btn ${printSettings.print_type === 'color' ? 'selected' : ''}" 
                onclick="setSetting('print_type','color',this)">🌈 Color</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Print Sides</label>
            <div class="option-group">
              <button class="option-btn ${printSettings.print_sides === 'single' ? 'selected' : ''}" 
                onclick="setSetting('print_sides','single',this)">Single Side</button>
              <button class="option-btn ${printSettings.print_sides === 'double' ? 'selected' : ''}" 
                onclick="setSetting('print_sides','double',this)">Double Side</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Copies</label>
            <div class="copies-control">
              <button class="copies-btn" onclick="changeCopies(-1)">−</button>
              <input class="copies-num" id="copies-input" type="number" min="1" max="100" value="1" 
                onchange="printSettings.copies=Math.max(1,parseInt(this.value)||1);this.value=printSettings.copies;updateLivePrice()"/>
              <button class="copies-btn" onclick="changeCopies(1)">+</button>
            </div>
          </div>
          <div class="form-group" style="grid-column:span 2">
            <label class="form-label">Page Range</label>
            <div class="option-group" style="margin-bottom:10px">
              <button class="option-btn ${printSettings.page_range === 'all' ? 'selected' : ''}" 
                onclick="setPageRange('all',this)">All Pages</button>
              <button class="option-btn ${printSettings.page_range !== 'all' ? 'selected' : ''}" 
                onclick="setPageRange('custom',this)">Custom Range</button>
            </div>
            <input type="text" class="form-control" id="page-range-input" placeholder="e.g. 1-5, 8, 11-13"
              style="display:${printSettings.page_range === 'all' ? 'none' : 'block'}"
              onchange="printSettings.page_range=this.value;updateLivePrice()"/>
          </div>
          <div class="form-group" style="grid-column:span 2">
            <label class="form-label">Delivery Option</label>
            <div class="option-group">
              <button class="option-btn ${printSettings.delivery_type === 'pickup' ? 'selected' : ''}" 
                onclick="setSetting('delivery_type','pickup',this)">🏪 Pickup from Shop</button>
              <button class="option-btn ${printSettings.delivery_type === 'delivery' ? 'selected' : ''}" 
                onclick="setSetting('delivery_type','delivery',this)">🚚 Home Delivery</button>
            </div>
          </div>
        </div>
        <div style="display:flex;gap:12px;justify-content:space-between;margin-top:8px">
          <button class="btn btn-secondary" onclick="renderNewOrder(document.getElementById('main-content'), currentUser)">← Back</button>
          <button class="btn btn-primary" onclick="goToStep3()">Review & Pay →</button>
        </div>
      </div>
      <div id="live-price-panel">
        ${renderPriceCard()}
      </div>
    </div>`;

  window.setSetting = (key, val, btn) => {
    printSettings[key] = val;
    btn.closest('.option-group').querySelectorAll('.option-btn').forEach(b => b.classList.toggle('selected', b === btn));
    updateLivePrice();
  };

  window.setPageRange = (type, btn) => {
    printSettings.page_range = type === 'all' ? 'all' : '';
    document.getElementById('page-range-input').style.display = type === 'custom' ? 'block' : 'none';
    btn.closest('.option-group').querySelectorAll('.option-btn').forEach(b => b.classList.toggle('selected', b === btn));
  };

  window.changeCopies = (delta) => {
    printSettings.copies = Math.max(1, (printSettings.copies || 1) + delta);
    document.getElementById('copies-input').value = printSettings.copies;
    updateLivePrice();
  };

  window.goToStep3 = () => renderStep(3, user);

  window.updateLivePrice = async () => {
    const panel = document.getElementById('live-price-panel');
    if (!panel) return;
    panel.innerHTML = renderPriceCard(true);
    const totalPages = uploadedFiles.filter(f => f.status === 'ready').reduce((s, f) => s + f.pageCount, 0);
    try {
      const calc = await window.api.calculatePrice({ ...printSettings, total_pages: totalPages });
      panel.innerHTML = renderPriceCard(false, calc);
    } catch {}
  };

  updateLivePrice();
}

function renderPriceCard(loading = false, calc = null) {
  const totalPages = uploadedFiles.filter(f => f.status === 'ready').reduce((s, f) => s + f.pageCount, 0);
  return `
    <div class="price-card">
      <div class="price-header">💰 Price Summary</div>
      <div class="price-body">
        <div class="price-row"><span>Pages</span><strong>${totalPages}</strong></div>
        <div class="price-row"><span>Copies</span><strong>${printSettings.copies}</strong></div>
        <div class="price-row"><span>Rate</span><strong>${calc ? formatCurrency(calc.rate) : '...'}/page</strong></div>
        <hr class="price-divider"/>
        <div class="price-row"><span>Subtotal</span><strong>${calc ? formatCurrency(calc.subtotal) : '...'}</strong></div>
        <div class="price-row"><span>Delivery</span><strong>${calc ? (calc.delivery_charge > 0 ? formatCurrency(calc.delivery_charge) : 'Free') : '...'}</strong></div>
        <div class="price-row total"><span>Total</span><strong>${calc ? formatCurrency(calc.total) : '...'}</strong></div>
        ${loading ? '<div style="text-align:center;padding:8px"><div class="spinner" style="border-color:#4f46e520;border-top-color:#4f46e5;margin:0 auto"></div></div>' : ''}
      </div>
    </div>`;
}

function renderStep3(el, user) {
  const totalPages = uploadedFiles.filter(f => f.status === 'ready').reduce((s, f) => s + f.pageCount, 0);
  const fileIds = uploadedFiles.filter(f => f.status === 'ready' && f.id).map(f => f.id);

  el.innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:start">
      <div>
        <div class="card" style="margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:20px">👤 Customer Details</h3>
          <div class="grid-2">
            <div class="form-group">
              <label class="form-label">Name *</label>
              <input id="cust-name" class="form-control" value="${user.name || ''}" placeholder="Your name" />
            </div>
            <div class="form-group">
              <label class="form-label">Phone *</label>
              <input id="cust-phone" class="form-control" value="${user.phone || ''}" placeholder="98765 43210" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Email</label>
            <input id="cust-email" class="form-control" value="${user.email || ''}" placeholder="email@example.com" />
          </div>
          ${printSettings.delivery_type === 'delivery' ? `
          <div class="form-group">
            <label class="form-label">Delivery Address *</label>
            <textarea id="cust-address" class="form-control" rows="3" placeholder="Full delivery address with pincode..."></textarea>
          </div>` : ''}
        </div>
        <div class="card" style="margin-bottom:20px">
          <h3 style="font-size:16px;font-weight:800;margin-bottom:16px">📋 Order Summary</h3>
          <div style="font-size:13px;display:flex;flex-direction:column;gap:10px">
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Files</span><span>${uploadedFiles.filter(f=>f.status==='ready').map(f=>f.name).join(', ')}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Page Size</span><span>${printSettings.page_size}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Print Type</span><span>${printSettings.print_type === 'bw' ? 'Black & White' : 'Color'}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Print Sides</span><span>${printSettings.print_sides === 'single' ? 'Single Side' : 'Double Side'}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Total Pages</span><span>${totalPages}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Copies</span><span>${printSettings.copies}</span></div>
            <div style="display:flex;justify-content:space-between"><span style="color:var(--text-secondary)">Delivery</span><span>${printSettings.delivery_type === 'pickup' ? 'Pickup from Shop' : 'Home Delivery'}</span></div>
          </div>
        </div>
        <div style="display:flex;gap:12px">
          <button class="btn btn-secondary" onclick="renderNewOrder(document.getElementById('main-content'),currentUser)">← Back</button>
          <button class="btn btn-secondary" id="cod-btn" onclick="placeOrder('cod')">Cash on Delivery</button>
          <button class="btn btn-primary" id="pay-btn" onclick="placeOrder('online')">💳 Proceed to Pay →</button>
        </div>
      </div>
      <div id="step3-price"></div>
    </div>`;

  // Load price
  window.api.calculatePrice({ ...printSettings, total_pages: totalPages }).then(calc => {
    document.getElementById('step3-price').innerHTML = renderPriceCard(false, calc);
    window._calc = calc;
  });

  window.currentUser = user;

  window.placeOrder = async (method) => {
    const customer_name = document.getElementById('cust-name').value.trim();
    const customer_phone = document.getElementById('cust-phone').value.trim();
    const customer_email = document.getElementById('cust-email')?.value.trim();

    if (!customer_name || !customer_phone) { toast('Name and phone required', 'error'); return; }
    if (fileIds.length === 0) { toast('No files uploaded', 'error'); return; }

    const calc = window._calc || {};
    const btn = document.getElementById(method === 'cod' ? 'cod-btn' : 'pay-btn');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

    try {
      const order = await window.api.createOrder({
        file_ids: fileIds,
        ...printSettings,
        total_pages: totalPages,
        subtotal: calc.subtotal || 0,
        delivery_charge: calc.delivery_charge || 0,
        total_amount: calc.total || 0,
        customer_name,
        customer_phone,
        customer_email,
      });

      if (method === 'cod') {
        await window.api.codOrder(order.order.id);
        toast('Order placed! Pay at delivery/pickup.', 'success');
        navigateTo('my-orders');
        return;
      }

      // Razorpay payment
      const rzpData = await window.api.createPaymentOrder(order.order.id);

      const rzp = new Razorpay({
        key: rzpData.key_id,
        amount: rzpData.amount,
        currency: rzpData.currency,
        order_id: rzpData.razorpay_order_id,
        name: 'QuickPrint',
        description: `Order #${rzpData.order_number}`,
        prefill: { name: customer_name, email: customer_email, contact: customer_phone },
        theme: { color: '#4f46e5' },
        handler: async (response) => {
          try {
            await window.api.verifyPayment({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              order_id: order.order.id,
              payment_method: 'upi'
            });
            toast('Payment successful! 🎉', 'success');
            navigateTo('my-orders');
          } catch (e) {
            toast('Payment verification failed: ' + e.message, 'error');
          }
        },
        modal: { ondismiss: () => { btn.disabled = false; btn.textContent = '💳 Proceed to Pay →'; } }
      });
      rzp.open();
    } catch (e) {
      toast('Error: ' + e.message, 'error');
      btn.disabled = false;
      btn.textContent = method === 'cod' ? 'Cash on Delivery' : '💳 Proceed to Pay →';
    }
  };
}