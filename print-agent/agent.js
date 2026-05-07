/**
 * QuickPrint Local Print Agent
 * ============================
 * Polls the QuickPrint API for queued orders, downloads PDFs,
 * and manages batch printing with separator pages.
 *
 * Run: node agent.js
 * Build exe: npm run pkg
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, appendFileSync } from 'fs';
import { join, resolve } from 'path';
import { execSync, exec } from 'child_process';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

// ─── Config ────────────────────────────────────────────────────────────────
const CONFIG_PATH = join(process.cwd(), 'config.json');
let config = {};

function loadConfig() {
  try {
    config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
    log('✅ Config loaded');
  } catch (e) {
    log('❌ Failed to load config.json: ' + e.message);
    process.exit(1);
  }
}

// ─── Logging ────────────────────────────────────────────────────────────────
function log(msg, level = 'INFO') {
  const ts = new Date().toISOString();
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);
  if (config.log_file) {
    try { appendFileSync(config.log_file, line + '\n'); } catch {}
  }
}

function logError(msg, err) {
  log(`${msg}: ${err?.message || err}`, 'ERROR');
}

// ─── API Client ─────────────────────────────────────────────────────────────
async function apiGet(path) {
  const res = await fetch(`${config.api_url}/api${path}`, {
    headers: {
      'Authorization': `Bearer ${config.api_token}`,
      'Content-Type': 'application/json',
    }
  });
  if (!res.ok) throw new Error(`API ${path} failed: ${res.status}`);
  return res.json();
}

async function apiPatch(path, body) {
  const res = await fetch(`${config.api_url}/api${path}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${config.api_token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`API PATCH ${path} failed: ${res.status}`);
  return res.json();
}

// ─── File Helpers ────────────────────────────────────────────────────────────
function ensureDir(dir) {
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

async function downloadFile(fileId, destPath) {
  const url = `${config.api_url}/api/files/${fileId}/download`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${config.api_token}` }
  });
  if (!res.ok) throw new Error(`Download failed for file ${fileId}: ${res.status}`);

  const fileStream = createWriteStream(destPath);
  await pipeline(res.body, fileStream);
  return destPath;
}

// ─── Print Helpers ────────────────────────────────────────────────────────────
function getPrinterForSize(pageSize) {
  if (pageSize === 'A3' && config.printer_a3) return config.printer_a3;
  if (config.printer_a4) return config.printer_a4;
  return null; // use default printer
}

function printFile(filePath, printerName) {
  const platform = process.platform;
  let cmd;

  if (platform === 'win32') {
    // Windows: use SumatraPDF or default print dialog
    if (printerName) {
      cmd = `SumatraPDF.exe -print-to "${printerName}" "${filePath}"`;
    } else {
      cmd = `SumatraPDF.exe -print-to-default "${filePath}"`;
    }
    // Fallback to built-in print
    if (!existsSync('SumatraPDF.exe')) {
      cmd = `powershell -command "Start-Process -FilePath '${filePath}' -Verb Print -Wait"`;
    }
  } else if (platform === 'darwin') {
    // macOS: use lpr
    cmd = printerName
      ? `lpr -P "${printerName}" "${filePath}"`
      : `lpr "${filePath}"`;
  } else {
    // Linux: use lp
    cmd = printerName
      ? `lp -d "${printerName}" "${filePath}"`
      : `lp "${filePath}"`;
  }

  log(`🖨️ Printing: ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

// ─── Separator Page Creator ───────────────────────────────────────────────────
async function createSeparatorPdf(outputPath, orderInfo, pageSize = 'A4') {
  // Minimal separator PDF with order info embedded as plain bytes
  // Uses pdf-lib if available, otherwise writes minimal valid PDF
  try {
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage(pageSize === 'A3' ? [841.89, 1190.55] : [595.28, 841.89]);
    const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const { width, height } = page.getSize();

    // Background stripe
    page.drawRectangle({
      x: 0, y: height - 120,
      width, height: 120,
      color: rgb(0.31, 0.27, 0.90), // indigo
    });

    // Title
    page.drawText('ORDER SEPARATOR', {
      x: 40, y: height - 60,
      size: 32, font,
      color: rgb(1, 1, 1),
    });

    // Order info
    const lines = [
      `Order: #${orderInfo.order_number}`,
      `Customer: ${orderInfo.customer_name}`,
      `Phone: ${orderInfo.customer_phone}`,
      `Pages: ${orderInfo.total_pages} × ${orderInfo.copies} copies`,
      `Type: ${orderInfo.page_size} ${orderInfo.print_type === 'bw' ? 'Black & White' : 'Color'} (${orderInfo.print_sides} side)`,
      `Files: ${orderInfo.file_names || '-'}`,
    ];

    lines.forEach((line, i) => {
      page.drawText(line, {
        x: 40, y: height - 180 - (i * 36),
        size: 18, font,
        color: rgb(0.06, 0.09, 0.16),
      });
    });

    // Bottom note
    page.drawText('⚠️  REMOVE THIS PAGE BEFORE DELIVERING TO CUSTOMER', {
      x: 40, y: 40,
      size: 12, font,
      color: rgb(0.93, 0.27, 0.27),
    });

    const bytes = await pdfDoc.save();
    writeFileSync(outputPath, bytes);
    log(`📄 Separator page created: ${outputPath}`);
    return outputPath;
  } catch (e) {
    // Fallback: write a minimal 1-page blank PDF
    const minPdf = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj
xref
0 4
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
trailer<</Size 4/Root 1 0 R>>
startxref
190
%%EOF`;
    writeFileSync(outputPath, minPdf, 'ascii');
    log(`📄 Blank separator created (pdf-lib unavailable): ${outputPath}`);
    return outputPath;
  }
}

// ─── Core: Process a batch ─────────────────────────────────────────────────
async function processBatch(pageSize) {
  log(`\n📦 Processing ${pageSize} batch...`);

  // Fetch queued items for this page size
  const { queue } = await apiGet(`/queue?status=queued&page_size=${pageSize}`);
  if (!queue.length) {
    log(`ℹ️  No queued ${pageSize} orders`);
    return;
  }

  log(`📋 Found ${queue.length} ${pageSize} order(s) to print`);

  const downloadDir = resolve(config.download_dir || './downloads');
  const batchId = `BATCH_${pageSize}_${Date.now()}`;
  const batchDir = join(downloadDir, batchId);
  ensureDir(batchDir);

  const printer = getPrinterForSize(pageSize);
  const separator = parseInt(config.separator_pages ?? 1);

  // Process each order in queue order
  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    const orderDir = join(batchDir, `order_${i + 1}_${item.order_number}`);
    ensureDir(orderDir);

    log(`\n  📄 [${i + 1}/${queue.length}] Order #${item.order_number} - ${item.customer_name}`);

    // Add separator pages before each order (except first if configured)
    if (separator > 0 && i > 0) {
      for (let s = 0; s < separator; s++) {
        const sepPath = join(orderDir, `separator_${s + 1}.pdf`);
        await createSeparatorPdf(sepPath, item, pageSize);
        if (config.auto_print) {
          printFile(sepPath, printer);
        }
      }
    }

    // Download and print each file
    const r2Keys = (item.r2_keys || '').split(',').filter(Boolean);
    const fileIds = []; // We need file IDs to download

    // Get full order details to get file IDs
    try {
      const { files } = await apiGet(`/orders/${item.order_id}`);
      for (const file of (files || [])) {
        const fileDest = join(orderDir, file.original_name.replace(/[^a-zA-Z0-9._-]/g, '_'));
        log(`    ⬇️  Downloading: ${file.original_name}`);
        await downloadFile(file.id, fileDest);
        log(`    ✅ Downloaded: ${fileDest}`);

        if (config.auto_print) {
          log(`    🖨️  Printing: ${file.original_name}`);
          printFile(fileDest, printer);
          log(`    ✅ Sent to printer`);
        }
      }
    } catch (e) {
      logError(`Failed to process order #${item.order_number}`, e);
      continue;
    }

    // Mark as processing in queue
    try {
      await apiPatch(`/queue/${item.id}/status`, { status: 'processing', batch_id: batchId });
    } catch (e) {
      logError('Failed to update queue status', e);
    }
  }

  if (!config.auto_print) {
    log(`\n📁 Files downloaded to: ${batchDir}`);
    log(`ℹ️  Auto-print is disabled. Print files manually then mark as done.`);
    log(`ℹ️  Run: node agent.js confirm ${batchId} to mark all as printed`);
  } else {
    // Mark all as printed
    for (const item of queue) {
      try {
        await apiPatch(`/queue/${item.id}/status`, { status: 'printed', batch_id: batchId });
        log(`✅ Order #${item.order_number} marked as printed → status: Ready`);
      } catch (e) {
        logError(`Failed to mark #${item.order_number} as printed`, e);
      }
    }
    log(`\n🎉 Batch ${batchId} complete! ${queue.length} orders printed.`);
  }

  return { batchId, count: queue.length, dir: batchDir };
}

// ─── Manual confirm command ──────────────────────────────────────────────────
async function confirmBatch(batchId) {
  log(`Confirming batch: ${batchId}`);
  const { queue } = await apiGet(`/queue?status=processing`);
  const batchItems = queue.filter(q => q.batch_id === batchId);

  if (!batchItems.length) {
    log(`No items found for batch ${batchId}`);
    return;
  }

  for (const item of batchItems) {
    await apiPatch(`/queue/${item.id}/status`, { status: 'printed', batch_id: batchId });
    log(`✅ Order #${item.order_number} → Ready`);
  }

  log(`Batch ${batchId} confirmed: ${batchItems.length} orders marked as printed`);
}

// ─── Status check ────────────────────────────────────────────────────────────
async function showStatus() {
  log('📊 Fetching queue status...');
  const { summary } = await apiGet('/queue?status=queued');

  console.log('\n┌─────────────────────────────────┐');
  console.log('│     QuickPrint Queue Status      │');
  console.log('├─────────────────────────────────┤');

  if (!summary.length) {
    console.log('│  ✅ Queue is empty               │');
  } else {
    summary.forEach(s => {
      console.log(`│  ${s.page_size} Queue: ${s.order_count} orders, ${s.total_pages} pages`.padEnd(34) + '│');
    });
  }
  console.log('└─────────────────────────────────┘\n');
}

// ─── Poll loop ─────────────────────────────────────────────────────────────
async function pollLoop() {
  log('🔄 Starting poll loop...');
  log(`   Interval: ${config.poll_interval_ms / 1000}s`);
  log(`   API: ${config.api_url}`);
  log(`   Auto-print: ${config.auto_print ? 'ENABLED' : 'DISABLED'}`);

  const poll = async () => {
    try {
      const { summary } = await apiGet('/queue?status=queued');
      const totalQueued = summary.reduce((s, q) => s + q.order_count, 0);

      if (totalQueued > 0) {
        log(`🔔 ${totalQueued} order(s) in queue`);
        for (const q of summary) {
          if (q.order_count > 0) {
            await processBatch(q.page_size);
          }
        }
      } else {
        log('💤 Queue empty, waiting...');
      }
    } catch (e) {
      logError('Poll error', e);
    }
  };

  // Immediate first poll
  await poll();

  // Schedule recurring
  setInterval(poll, config.poll_interval_ms || 30000);
}

// ─── CLI Entry ────────────────────────────────────────────────────────────────
const [,, command, arg] = process.argv;

loadConfig();

switch (command) {
  case 'status':
    showStatus().catch(e => logError('Status error', e));
    break;

  case 'print':
    processBatch(arg || 'A4').catch(e => logError('Print error', e));
    break;

  case 'confirm':
    confirmBatch(arg).catch(e => logError('Confirm error', e));
    break;

  case 'poll':
  default:
    console.log(`
╔═══════════════════════════════════════╗
║      QuickPrint Print Agent v1.0      ║
╠═══════════════════════════════════════╣
║  Commands:                            ║
║    node agent.js           - Poll     ║
║    node agent.js status    - Status   ║
║    node agent.js print A4  - Print A4 ║
║    node agent.js confirm X - Confirm  ║
╚═══════════════════════════════════════╝
`);
    pollLoop().catch(e => {
      logError('Fatal poll error', e);
      process.exit(1);
    });
}