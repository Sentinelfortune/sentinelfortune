-- House of Assets direct-publication linkage.
--
-- The Shop already had one governed way in: the Owner uploads a package
-- through the Admin importer, which produces a DRAFT and stops. This table
-- backs a second way in — House of Assets posting a package that already
-- carries the Owner's explicit publication authorization.
--
-- The row is the evidence. It records who authorized the publication, when
-- the terms and the price were approved, exactly which bytes were received
-- (SHA-256 of the package and of the single customer deliverable inside it),
-- and the receipt that was returned. If a published listing is ever
-- questioned, this is the record that answers "on whose authority, and from
-- which package".
--
-- `fingerprint` is what makes the receiver idempotent. It is a SHA-256 over
-- the whole authorization + identity + integrity + price tuple, so a retried
-- delivery of the same publication collapses onto the same row, while any
-- change to the package bytes, the price, the currency, the destination or
-- the approval evidence is a genuinely different publication and is not
-- silently absorbed as a duplicate.

PRAGMA foreign_keys = ON;

CREATE TABLE hoa_publications (
  id                          TEXT PRIMARY KEY,

  -- Idempotency key. UNIQUE is the enforcement, not the application code:
  -- two concurrent deliveries of the same publication cannot both win.
  fingerprint                 TEXT NOT NULL UNIQUE,

  product_id                  TEXT NOT NULL REFERENCES products(id) ON DELETE CASCADE,

  -- Source identity in House of Assets. The pair (commercial_product_id,
  -- commercial_product_version) is how a later publication of the same
  -- commercial product finds the Shop product it already created.
  commercial_product_id       TEXT NOT NULL,
  commercial_product_version  TEXT NOT NULL,

  -- Package integrity, as received and verified against the actual bytes.
  package_id                  TEXT NOT NULL,
  package_sha256              TEXT NOT NULL,
  package_byte_size           INTEGER NOT NULL,
  customer_download_sha256    TEXT NOT NULL,
  customer_download_path      TEXT NOT NULL,

  -- Routing envelope, stored so a misrouted delivery is visible after the fact.
  schema_id                   TEXT NOT NULL,
  destination                 TEXT NOT NULL,
  intent                      TEXT NOT NULL,

  -- Authorization evidence. Nothing here is inferred; every value was
  -- present in the payload and was checked before anything was written.
  decision                    TEXT NOT NULL,
  authority                   TEXT NOT NULL,
  terms_acknowledged_at       TEXT NOT NULL,
  price_approved_at           TEXT NOT NULL,

  -- The commercial terms that were authorized, in the Shop's own units.
  price_cents                 INTEGER NOT NULL,
  currency                    TEXT NOT NULL,
  license_type                TEXT NOT NULL,
  source_license_type         TEXT NOT NULL,

  -- The receipt exactly as returned to House of Assets, so a replay returns
  -- the identical body rather than a freshly recomputed approximation.
  receipt_json                TEXT NOT NULL,

  received_at                 TEXT NOT NULL,
  published_at                TEXT NOT NULL
);

CREATE INDEX idx_hoa_publications_product  ON hoa_publications(product_id);
CREATE INDEX idx_hoa_publications_source   ON hoa_publications(commercial_product_id);
CREATE INDEX idx_hoa_publications_received ON hoa_publications(received_at);
