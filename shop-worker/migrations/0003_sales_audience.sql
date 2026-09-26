-- Backward-compatible B2C/B2B split. Existing products remain BUSINESS.
-- PERSONAL rights are stored on the product separately because the legacy
-- license_type CHECK constraint cannot be changed safely with ALTER TABLE.
ALTER TABLE products ADD COLUMN sales_audience TEXT NOT NULL DEFAULT 'BUSINESS'
  CHECK (sales_audience IN ('PERSONAL', 'BUSINESS'));

ALTER TABLE orders ADD COLUMN terms_version_snapshot TEXT;
