-- Sentinel Fortune Digital Shop — initial schema
-- Isolated D1 database for the Shop Worker only. Does not touch, reference,
-- or depend on any existing R2 prefix, Telegram bot state, or the six
-- existing tier-access API routes.
--
-- Conventions:
--   * All primary keys are server-generated text UUIDs (crypto.randomUUID()).
--   * All money is stored as integer cents. Never store floats for money.
--   * All timestamps are ISO-8601 UTC strings (TEXT), written by the Worker
--     via new Date().toISOString() — never SQLite's own datetime functions,
--     so application code and the DB always agree on format.
--   * Foreign keys are declared and enforced (PRAGMA foreign_keys = ON is
--     set by the Worker on every connection — D1 does not persist pragmas).

PRAGMA foreign_keys = ON;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
CREATE TABLE products (
  id                        TEXT PRIMARY KEY,
  sku                       TEXT NOT NULL UNIQUE,
  slug                      TEXT NOT NULL UNIQUE,
  title                     TEXT NOT NULL,
  short_description         TEXT NOT NULL DEFAULT '',
  problem_solved            TEXT NOT NULL DEFAULT '',
  description               TEXT NOT NULL DEFAULT '',
  category                  TEXT NOT NULL DEFAULT '',
  audience                  TEXT NOT NULL DEFAULT '',
  edition                   TEXT NOT NULL DEFAULT '',
  version                   TEXT NOT NULL DEFAULT '1.0',
  status                    TEXT NOT NULL DEFAULT 'DRAFT'
                              CHECK (status IN ('DRAFT','PUBLISHED','UNPUBLISHED','ARCHIVED')),

  -- Pricing — price_cents is NULL and price_confirmed is 0 until the Owner
  -- explicitly enters and confirms a real price. Publication is blocked
  -- while price_confirmed = 0 (enforced in application code, not SQL).
  price_cents               INTEGER,
  price_confirmed           INTEGER NOT NULL DEFAULT 0 CHECK (price_confirmed IN (0,1)),
  currency                  TEXT NOT NULL DEFAULT 'usd',

  license_type              TEXT NOT NULL DEFAULT 'SINGLE_BUSINESS'
                              CHECK (license_type IN ('SINGLE_BUSINESS','MULTI_LOCATION','CONSULTANT','WHITE_LABEL')),
  publicly_purchasable      INTEGER NOT NULL DEFAULT 0 CHECK (publicly_purchasable IN (0,1)),

  supported_formats         TEXT NOT NULL DEFAULT '',      -- comma-separated, e.g. "PDF, DOCX, XLSX"
  deliverables_json         TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings — "included" list
  not_included_json         TEXT NOT NULL DEFAULT '[]',    -- JSON array of strings
  faqs_json                 TEXT NOT NULL DEFAULT '[]',    -- JSON array of {"q":"...","a":"..."}

  responsible_use_text      TEXT NOT NULL DEFAULT '',
  refund_eligible           INTEGER NOT NULL DEFAULT 1 CHECK (refund_eligible IN (0,1)),
  refund_policy_summary     TEXT NOT NULL DEFAULT '',
  terms_acknowledged        INTEGER NOT NULL DEFAULT 0 CHECK (terms_acknowledged IN (0,1)),

  stripe_product_id         TEXT,
  stripe_price_id           TEXT,

  download_link_expiry_hours INTEGER NOT NULL DEFAULT 72,
  max_downloads              INTEGER NOT NULL DEFAULT 5,

  created_at                TEXT NOT NULL,
  updated_at                TEXT NOT NULL,
  published_at               TEXT
);

CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_slug   ON products(slug);

-- ---------------------------------------------------------------------------
-- product_images (cover + up to 6 preview images)
-- ---------------------------------------------------------------------------
CREATE TABLE product_images (
  id           TEXT PRIMARY KEY,
  product_id   TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('COVER','PREVIEW')),
  r2_key       TEXT NOT NULL,             -- public shop-assets bucket key
  position     INTEGER NOT NULL DEFAULT 0,
  alt_text     TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL
);

CREATE INDEX idx_product_images_product ON product_images(product_id);

-- ---------------------------------------------------------------------------
-- product_files (private downloadable assets — never public)
-- ---------------------------------------------------------------------------
CREATE TABLE product_files (
  id                  TEXT PRIMARY KEY,
  product_id          TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  r2_key              TEXT NOT NULL,      -- private downloads bucket key
  original_filename   TEXT NOT NULL,
  sanitized_filename  TEXT NOT NULL,
  content_type        TEXT NOT NULL,
  size_bytes          INTEGER NOT NULL,
  position            INTEGER NOT NULL DEFAULT 0,
  created_at          TEXT NOT NULL
);

CREATE INDEX idx_product_files_product ON product_files(product_id);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
CREATE TABLE customers (
  id           TEXT PRIMARY KEY,
  email        TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL DEFAULT '',
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

CREATE INDEX idx_customers_email ON customers(email);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
CREATE TABLE orders (
  id                            TEXT PRIMARY KEY,
  order_number                  TEXT NOT NULL UNIQUE,
  product_id                    TEXT NOT NULL REFERENCES products(id),
  customer_id                   TEXT NOT NULL REFERENCES customers(id),
  stripe_checkout_session_id    TEXT UNIQUE,
  stripe_payment_intent_id      TEXT,
  status                        TEXT NOT NULL DEFAULT 'PENDING'
                                   CHECK (status IN ('PENDING','PAID','REFUNDED','FAILED','CANCELLED')),
  amount_cents                  INTEGER NOT NULL,
  currency                      TEXT NOT NULL,
  business_name                 TEXT NOT NULL DEFAULT '',
  created_at                    TEXT NOT NULL,
  paid_at                       TEXT,
  refunded_at                   TEXT
);

CREATE INDEX idx_orders_customer ON orders(customer_id);
CREATE INDEX idx_orders_product  ON orders(product_id);
CREATE INDEX idx_orders_status   ON orders(status);
CREATE INDEX idx_orders_session  ON orders(stripe_checkout_session_id);

-- ---------------------------------------------------------------------------
-- order_items (single-item MVP, table kept normalized for future bundles)
-- ---------------------------------------------------------------------------
CREATE TABLE order_items (
  id                     TEXT PRIMARY KEY,
  order_id               TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id             TEXT NOT NULL REFERENCES products(id),
  title_snapshot         TEXT NOT NULL,
  price_cents_snapshot   INTEGER NOT NULL,
  quantity               INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ---------------------------------------------------------------------------
-- licenses
-- ---------------------------------------------------------------------------
CREATE TABLE licenses (
  id                          TEXT PRIMARY KEY,
  license_number              TEXT NOT NULL UNIQUE,
  order_id                    TEXT NOT NULL REFERENCES orders(id),
  product_id                  TEXT NOT NULL REFERENCES products(id),
  customer_id                 TEXT NOT NULL REFERENCES customers(id),
  license_type                TEXT NOT NULL,
  product_version_snapshot    TEXT NOT NULL,
  purchaser_name               TEXT NOT NULL DEFAULT '',
  purchaser_email               TEXT NOT NULL,
  business_name                TEXT NOT NULL DEFAULT '',
  status                       TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','REVOKED')),
  rights_summary               TEXT NOT NULL,
  restrictions_summary         TEXT NOT NULL,
  issued_at                    TEXT NOT NULL,
  revoked_at                   TEXT
);

CREATE INDEX idx_licenses_order    ON licenses(order_id);
CREATE INDEX idx_licenses_customer ON licenses(customer_id);

-- ---------------------------------------------------------------------------
-- download_authorizations
-- Only a SHA-256 hash of the bearer token is stored — the raw token exists
-- only in the URL sent to the customer, never persisted in plaintext.
-- ---------------------------------------------------------------------------
CREATE TABLE download_authorizations (
  id                 TEXT PRIMARY KEY,
  token_hash         TEXT NOT NULL UNIQUE,
  license_id         TEXT NOT NULL REFERENCES licenses(id),
  order_id           TEXT NOT NULL REFERENCES orders(id),
  product_file_id    TEXT REFERENCES product_files(id),   -- NULL = all files for the product
  max_downloads      INTEGER NOT NULL,
  download_count     INTEGER NOT NULL DEFAULT 0,
  expires_at         TEXT NOT NULL,
  revoked            INTEGER NOT NULL DEFAULT 0 CHECK (revoked IN (0,1)),
  created_at         TEXT NOT NULL
);

CREATE INDEX idx_download_auth_token   ON download_authorizations(token_hash);
CREATE INDEX idx_download_auth_license ON download_authorizations(license_id);

-- ---------------------------------------------------------------------------
-- download_events (audit trail — every attempt, success or failure)
-- ---------------------------------------------------------------------------
CREATE TABLE download_events (
  id                            TEXT PRIMARY KEY,
  download_authorization_id     TEXT NOT NULL REFERENCES download_authorizations(id),
  product_file_id                TEXT,
  ip_hash                        TEXT NOT NULL DEFAULT '',
  user_agent                     TEXT NOT NULL DEFAULT '',
  result                         TEXT NOT NULL
                                    CHECK (result IN ('SUCCESS','EXPIRED','REVOKED','LIMIT_REACHED','NOT_FOUND','ERROR')),
  created_at                     TEXT NOT NULL
);

CREATE INDEX idx_download_events_auth ON download_events(download_authorization_id);

-- ---------------------------------------------------------------------------
-- stripe_events (idempotency ledger — mirrors the pattern already proven in
-- bot/services/stripe_webhook.py, reimplemented independently for the Shop)
-- ---------------------------------------------------------------------------
CREATE TABLE stripe_events (
  id                  TEXT PRIMARY KEY,
  stripe_event_id     TEXT NOT NULL UNIQUE,
  type                TEXT NOT NULL,
  processed           INTEGER NOT NULL DEFAULT 0 CHECK (processed IN (0,1)),
  payload_json        TEXT NOT NULL,
  received_at         TEXT NOT NULL,
  processed_at        TEXT
);

CREATE INDEX idx_stripe_events_event_id ON stripe_events(stripe_event_id);

-- ---------------------------------------------------------------------------
-- admin_audit_log
-- ---------------------------------------------------------------------------
CREATE TABLE admin_audit_log (
  id             TEXT PRIMARY KEY,
  actor          TEXT NOT NULL,        -- Cloudflare Access authenticated email
  action         TEXT NOT NULL,
  target_type    TEXT NOT NULL DEFAULT '',
  target_id      TEXT NOT NULL DEFAULT '',
  details_json   TEXT NOT NULL DEFAULT '{}',
  created_at     TEXT NOT NULL
);

CREATE INDEX idx_admin_audit_created ON admin_audit_log(created_at);

-- ---------------------------------------------------------------------------
-- settings (single-row-per-key store — e.g. default download expiry/limit)
-- ---------------------------------------------------------------------------
CREATE TABLE settings (
  key          TEXT PRIMARY KEY,
  value        TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);

INSERT INTO settings (key, value, updated_at) VALUES
  ('default_download_expiry_hours', '72', '2026-07-27T00:00:00.000Z'),
  ('default_max_downloads', '5', '2026-07-27T00:00:00.000Z'),
  ('support_email', 'Sentinelfortunellc@proton.me', '2026-07-27T00:00:00.000Z');
