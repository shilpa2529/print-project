# 🖨️ QuickPrint — Doorstep Print & Order System

A production-grade, full-stack web application built entirely on **Cloudflare's stack**: Workers, Pages, D1, R2 + Razorpay payments.

---

## 🏗️ Architecture

```
quickprint/
├── workers/                  # Cloudflare Worker (API backend)
│   ├── src/
│   │   ├── index.js          # Main router
│   │   ├── lib/
│   │   │   ├── auth.js       # JWT auth, password hashing
│   │   │   ├── cors.js       # CORS headers
│   │   │   └── helpers.js    # Utilities, pagination
│   │   └── routes/
│   │       ├── auth.js       # Login, register, profile
│   │       ├── orders.js     # Order CRUD + status
│   │       ├── files.js      # R2 file upload/download
│   │       ├── payments.js   # Razorpay create + verify
│   │       ├── admin.js      # Dashboard, users, settings
│   │       ├── pricing.js    # Rates configuration
│   │       ├── queue.js      # Print queue management
│   │       ├── delivery.js   # Delivery tracking
│   │       └── invoices.js   # Invoice management
│   └── wrangler.toml
│
├── pages/                    # Cloudflare Pages (Frontend)
│   └── src/
│       ├── index.html        # Customer portal
│       ├── admin.html        # Admin panel
│       ├── shared/
│       │   ├── api.js        # Shared API client
│       │   ├── utils.js      # Shared utilities
│       │   └── base.css      # Shared CSS variables
│       ├── customer/
│       │   ├── main.js       # Customer app shell + auth
│       │   ├── customer.css
│       │   └── pages/
│       │       ├── dashboard.js   # Customer dashboard
│       │       ├── new-order.js   # 3-step order flow + payment
│       │       ├── orders.js      # Order history + retry pay
│       │       └── tracking.js    # Live tracking + invoices + settings
│       └── admin/
│           ├── main.js       # Admin app shell + auth
│           ├── admin.css
│           └── pages/
│               ├── dashboard.js   # Full analytics dashboard
│               ├── orders.js      # Orders management table
│               ├── queue.js       # Print queue + batch printing
│               └── payments.js    # Payments, invoices, delivery, pricing, analytics, users, settings
│
└── migrations/
    ├── 0001_initial_schema.sql   # Complete D1 schema
    └── seed.sql                  # Default pricing + admin user
```

---

## 🚀 Quick Setup (Step by Step)

### 1. Prerequisites

```bash
npm install -g wrangler
wrangler login
```

### 2. Clone & Install

```bash
cd quickprint
npm install
cd workers && npm install
cd ../pages && npm install
```

### 3. Create Cloudflare Resources

```bash
# Create D1 database
wrangler d1 create quickprint-db
# → Copy the database_id output into workers/wrangler.toml

# Create R2 bucket
wrangler r2 bucket create quickprint-files
```

### 4. Update wrangler.toml

Edit `workers/wrangler.toml`:
```toml
[[d1_databases]]
binding = "DB"
database_name = "quickprint-db"
database_id = "PASTE_YOUR_DATABASE_ID_HERE"   # ← paste here

[vars]
RAZORPAY_KEY_ID = "rzp_test_YOUR_KEY_ID"      # ← your Razorpay key
CORS_ORIGIN = "https://your-pages-domain.pages.dev"
```

### 5. Set Secrets

```bash
cd workers
wrangler secret put JWT_SECRET
# → Enter a long random string (e.g., openssl rand -hex 32)

wrangler secret put RAZORPAY_KEY_SECRET
# → Enter your Razorpay key secret

wrangler secret put RAZORPAY_WEBHOOK_SECRET
# → Enter your Razorpay webhook secret (from Razorpay dashboard)
```

### 6. Run Migrations

```bash
# Apply schema
wrangler d1 migrations apply quickprint-db --local   # for local dev
wrangler d1 migrations apply quickprint-db            # for production

# Seed default data  
wrangler d1 execute quickprint-db --file=../migrations/seed.sql
```

### 7. Create Admin User

```bash
# Run this script to create an admin with proper password hash
wrangler d1 execute quickprint-db --command="
  INSERT OR REPLACE INTO users (name, email, phone, password_hash, role)
  VALUES ('Admin', 'admin@quickprint.in', '9000000000', 
    'YOUR_HASHED_PASSWORD', 'admin');
"
```

> **Note:** Use the `/api/auth/register` endpoint first to create a user, then manually update their role to `admin` in D1:
> ```bash
> wrangler d1 execute quickprint-db --command="UPDATE users SET role='admin' WHERE email='admin@quickprint.in'"
> ```

### 8. Deploy Worker

```bash
cd workers
wrangler deploy
# → Note the worker URL: https://quickprint-api.YOUR-SUBDOMAIN.workers.dev
```

### 9. Update Pages API URL

Edit `pages/src/shared/api.js` — change `API_BASE` if using a custom domain, or configure a Pages proxy rule.

### 10. Deploy Pages

```bash
cd pages
npm run build
wrangler pages deploy dist --project-name quickprint
```

### 11. Set CORS Origin

Update `workers/wrangler.toml` with your Pages URL:
```toml
[vars]
CORS_ORIGIN = "https://quickprint.pages.dev"
```
Then redeploy the worker.

---

## 💳 Razorpay Setup

1. Create account at [razorpay.com](https://razorpay.com)
2. Go to **Settings → API Keys** → Generate Test Keys
3. Add to `wrangler.toml`: `RAZORPAY_KEY_ID = "rzp_test_..."`
4. Add secret: `wrangler secret put RAZORPAY_KEY_SECRET`
5. Set webhook URL in Razorpay dashboard: `https://quickprint-api.workers.dev/api/payments/webhook`
6. Add webhook secret: `wrangler secret put RAZORPAY_WEBHOOK_SECRET`

---

## 🔧 Local Development

```bash
# Terminal 1: Start Worker dev server
cd workers
wrangler dev

# Terminal 2: Start Pages dev server  
cd pages
npm run dev
```

Customer portal: http://localhost:5173
Admin panel: http://localhost:5173/admin.html
Worker API: http://localhost:8787/api

---

## 🗄️ Database Schema

| Table | Purpose |
|-------|---------|
| `users` | Customers, admin, staff, delivery personnel |
| `addresses` | Customer delivery addresses |
| `files` | R2 file references + metadata |
| `orders` | All print orders with full details |
| `order_files` | Many-to-many orders ↔ files |
| `print_queue` | Active print queue with batch support |
| `invoices` | Auto-generated invoice records |
| `pricing` | Per page-size, per print-type rates |
| `delivery_charges` | Delivery fee + free-above threshold |
| `settings` | Key-value shop configuration |
| `activity_log` | Audit trail for all order actions |

---

## 🔐 Roles & Permissions

| Role | Access |
|------|--------|
| `customer` | Own orders, files, addresses, invoices |
| `staff` | All orders, print queue, mark status |
| `delivery` | Delivery orders, dispatch, complete |
| `admin` | Full access + users, pricing, settings |

---

## 📡 API Endpoints

### Auth
- `POST /api/auth/register` — Customer registration
- `POST /api/auth/login` — Customer login
- `POST /api/auth/admin-login` — Admin/staff login
- `GET /api/auth/me` — Get current user

### Orders
- `GET /api/orders` — List orders (role-filtered)
- `POST /api/orders` — Create order
- `GET /api/orders/:id` — Order detail
- `PATCH /api/orders/:id/status` — Update status (admin/staff)
- `GET /api/orders/stats` — Dashboard stats

### Files
- `POST /api/files/upload-url` — Get upload endpoint
- `PUT /api/files/:id/upload` — Upload file to R2
- `PATCH /api/files/:id/pages` — Update page count
- `GET /api/files/:id/view` — Stream file
- `GET /api/files/:id/download` — Download file

### Payments
- `POST /api/payments/create-order` — Create Razorpay order
- `POST /api/payments/verify` — Verify payment signature
- `POST /api/payments/cod` — Place COD order
- `POST /api/payments/cod-confirm` — Admin confirms COD
- `POST /api/payments/webhook` — Razorpay webhook

### Print Queue
- `GET /api/queue` — Get queue (by page size/status)
- `POST /api/queue/batch` — Create batch print job
- `PATCH /api/queue/:id/status` — Update queue item
- `PUT /api/queue/reorder` — Reorder queue
- `DELETE /api/queue/:id` — Remove from queue

### Admin
- `GET /api/admin/dashboard` — Full dashboard data
- `GET/POST /api/admin/users` — Manage users
- `GET/PUT /api/admin/settings` — Shop settings
- `GET /api/admin/analytics` — Business analytics

### Pricing
- `GET /api/pricing` — Get all pricing (public)
- `PUT /api/pricing` — Update pricing (admin)
- `POST /api/pricing/calculate` — Calculate order price

### Delivery
- `GET /api/delivery` — Delivery orders
- `PATCH /api/delivery/:id/dispatch` — Mark dispatched
- `PATCH /api/delivery/:id/complete` — Mark delivered
- `GET/POST /api/delivery/addresses` — Customer addresses

### Invoices
- `GET /api/invoices` — List invoices
- `GET /api/invoices/:id` — Invoice detail
- `GET /api/invoices/by-order/:id` — Invoice by order

---

## 🖨️ Print Agent Integration

The desktop print agent (separate `.exe`) connects to this system via:

1. **Poll queue**: `GET /api/queue?status=queued` every 30 seconds
2. **Download files**: `GET /api/files/:id/view` for each file
3. **Create batch**: `POST /api/queue/batch` with page_size + separator_pages
4. **Mark printed**: `PATCH /api/queue/:id/status` with `{ status: "printed" }`

The agent authenticates using a staff-role JWT token stored in its config.

---

## 🎯 Production Checklist

- [ ] Replace `JWT_SECRET` with a strong random 64-char string
- [ ] Switch Razorpay to **live mode** keys
- [ ] Configure custom domain on Pages
- [ ] Configure custom domain for Worker API  
- [ ] Update `CORS_ORIGIN` to production domain
- [ ] Set up Razorpay webhook with production URL
- [ ] Enable Cloudflare R2 lifecycle rules for old files
- [ ] Set up D1 backup schedule in Cloudflare dashboard
- [ ] Create actual admin user (update role after register)
- [ ] Remove seed.sql test data from production

---

## 💡 Features Summary

### Customer Portal
- 🔐 JWT-based auth (register/login)
- 📂 Drag & drop file upload to R2
- 📄 PDF page count auto-detection
- ⚙️ Full print settings configuration  
- 💰 Real-time price calculation
- 💳 Razorpay payment (UPI/Card/NetBanking/COD)
- 📍 Order tracking with visual timeline
- 🧾 Invoice PDF generation + print
- 📋 Order history with retry payment
- 📍 Saved delivery addresses

### Admin Panel
- 📊 Live dashboard with 8+ stats cards
- 📈 Revenue bar charts + donut charts
- 📋 Full orders management with filters
- 🖨️ Print queue with batch printing
- 💳 Payment transaction history
- 🧾 Invoice management
- 🚚 Delivery management + dispatch
- 💰 Dynamic pricing configuration
- 📈 Analytics with 30/90-day views
- 🔐 User & role management
- ⚙️ Shop settings management