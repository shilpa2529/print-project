-- Migration: 0001_initial_schema.sql
-- QuickPrint Database Schema

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  phone TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'customer', -- customer | admin | staff | delivery
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Addresses table
CREATE TABLE IF NOT EXISTS addresses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  label TEXT DEFAULT 'Home',
  line1 TEXT NOT NULL,
  line2 TEXT,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  pincode TEXT NOT NULL,
  is_default INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Pricing table
CREATE TABLE IF NOT EXISTS pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  page_size TEXT NOT NULL, -- A4 | A3 | Letter
  print_type TEXT NOT NULL, -- bw | color
  single_side_rate REAL NOT NULL,
  double_side_rate REAL NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Delivery charges
CREATE TABLE IF NOT EXISTS delivery_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  min_amount REAL DEFAULT 0,
  charge REAL NOT NULL,
  free_above REAL DEFAULT 500,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Files table (R2 references)
CREATE TABLE IF NOT EXISTS files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER REFERENCES users(id),
  original_name TEXT NOT NULL,
  r2_key TEXT NOT NULL UNIQUE,
  size_bytes INTEGER,
  page_count INTEGER DEFAULT 0,
  mime_type TEXT,
  upload_status TEXT DEFAULT 'pending', -- pending | ready | error
  created_at TEXT DEFAULT (datetime('now'))
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  user_id INTEGER REFERENCES users(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_email TEXT,
  page_size TEXT NOT NULL DEFAULT 'A4',
  print_type TEXT NOT NULL DEFAULT 'bw',
  copies INTEGER NOT NULL DEFAULT 1,
  page_range TEXT DEFAULT 'all',
  print_sides TEXT DEFAULT 'single',
  total_pages INTEGER NOT NULL DEFAULT 0,
  subtotal REAL NOT NULL DEFAULT 0,
  delivery_charge REAL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  delivery_type TEXT DEFAULT 'pickup', -- pickup | delivery
  address_id INTEGER REFERENCES addresses(id),
  status TEXT DEFAULT 'placed', -- placed | paid | printing | ready | out_for_delivery | delivered | cancelled
  payment_status TEXT DEFAULT 'pending', -- pending | paid | failed | refunded
  payment_method TEXT, -- upi | card | netbanking | cod
  razorpay_order_id TEXT,
  razorpay_payment_id TEXT,
  notes TEXT,
  assigned_to INTEGER REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Order files (many-to-many)
CREATE TABLE IF NOT EXISTS order_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  file_id INTEGER NOT NULL REFERENCES files(id),
  print_order INTEGER DEFAULT 0
);

-- Invoices
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_number TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  r2_key TEXT,
  generated_at TEXT DEFAULT (datetime('now'))
);

-- Print queue (managed separately for batch control)
CREATE TABLE IF NOT EXISTS print_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  page_size TEXT NOT NULL,
  queue_position INTEGER,
  batch_id TEXT,
  separator_pages INTEGER DEFAULT 1,
  status TEXT DEFAULT 'queued', -- queued | processing | printed | error
  added_at TEXT DEFAULT (datetime('now')),
  printed_at TEXT
);

-- Activity log
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id),
  user_id INTEGER REFERENCES users(id),
  action TEXT NOT NULL,
  details TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Settings
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_payment_status ON orders(payment_status);
CREATE INDEX IF NOT EXISTS idx_print_queue_status ON print_queue(status);
CREATE INDEX IF NOT EXISTS idx_files_user_id ON files(user_id);