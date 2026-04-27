-- Seed data for ورشة الشويخ

-- Default admin (password: admin123)
-- password_hash uses SHA-256 of "admin123"
INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, phone) VALUES
  (1, 'admin', '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', 'admin', 'المدير العام', '0555000000');

-- Sample technician (password: tech123)
INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, phone) VALUES
  (2, 'technician', '3ac40463b419a7de590185c7121f0bfbe411d6168699e8014f521b050b1d6653', 'technician', 'الفني أحمد', '0555111111');

-- Sample customer (password: customer123)
INSERT OR IGNORE INTO users (id, username, password_hash, role, full_name, phone) VALUES
  (3, 'customer1', 'b041c0aeb35bb0fa4aa668ca5a920b590196fdaf9a00eb852c9b7f4d123cc6d6', 'customer', 'محمد الشويخ', '0660123456');

-- Sample engines
INSERT OR IGNORE INTO engines (customer_id, engine_name, engine_type, power, fault, estimated_price, status) VALUES
  (3, 'محرك المزرعة', 'ديزل - ميتسوبيشي', '50 حصان', 'اهتزاز غير طبيعي ورفع صوت عالي', 25000, 'in_progress'),
  (3, 'محرك الضخ', 'بنزين - هوندا', '20 حصان', 'لا يشتغل', 12000, 'ready');

-- Sample spare parts
INSERT OR IGNORE INTO spare_parts (name, quantity, price) VALUES
  ('فلتر زيت', 15, 800),
  ('بوجيهات', 30, 350),
  ('سير تايمينغ', 8, 2500),
  ('طرمبة ماء', 5, 4500);
