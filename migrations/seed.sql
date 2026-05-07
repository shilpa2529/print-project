-- Seed: Default pricing
INSERT OR IGNORE INTO pricing (page_size, print_type, single_side_rate, double_side_rate) VALUES
  ('A4', 'bw', 2.00, 3.50),
  ('A4', 'color', 8.00, 14.00),
  ('A3', 'bw', 5.00, 9.00),
  ('A3', 'color', 15.00, 28.00),
  ('Letter', 'bw', 2.00, 3.50),
  ('Letter', 'color', 8.00, 14.00);

-- Default delivery charge
INSERT OR IGNORE INTO delivery_charges (charge, free_above) VALUES (30.00, 500.00);

-- Default settings
INSERT OR IGNORE INTO settings (key, value) VALUES
  ('shop_name', 'QuickPrint'),
  ('shop_address', '123 Print Lane, Mumbai, MH 400001'),
  ('shop_phone', '+91 98765 43210'),
  ('shop_email', 'hello@quickprint.in'),
  ('default_separator_pages', '1'),
  ('auto_print_enabled', 'false'),
  ('default_page_size', 'A4'),
  ('gst_percent', '18'),
  ('gst_number', 'GSTIN000000000');

-- Admin user (password: admin123 - change in production!)
-- password_hash is bcrypt of "admin123"
INSERT OR IGNORE INTO users (name, email, phone, password_hash, role) VALUES
  ('Super Admin', 'admin@quickprint.in', '9000000000', '$2b$10$YourHashedPasswordHere', 'admin');