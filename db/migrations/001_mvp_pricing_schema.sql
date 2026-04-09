DROP TABLE IF EXISTS model_alias_mapping CASCADE;
DROP TABLE IF EXISTS market_price_entry CASCADE;

CREATE TABLE IF NOT EXISTS model_alias_mapping (
  id BIGSERIAL PRIMARY KEY,
  brand TEXT NOT NULL,
  canonical_model TEXT NOT NULL,
  alias_key TEXT NOT NULL,
  alias_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (brand, alias_key)
);

CREATE TABLE IF NOT EXISTS market_price_entry (
  id BIGSERIAL PRIMARY KEY,
  country CHAR(2) NOT NULL DEFAULT 'ID',
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  storage_gb INTEGER NOT NULL CHECK (storage_gb > 0),
  condition_grade CHAR(1) NOT NULL CHECK (condition_grade IN ('A', 'B', 'C', 'D')),
  listing_price_idr INTEGER NOT NULL CHECK (listing_price_idr > 0),
  battery_health_pct NUMERIC(5,2) NOT NULL CHECK (battery_health_pct >= 0 AND battery_health_pct <= 100),
  has_box BOOLEAN NOT NULL,
  source TEXT NOT NULL,
  collected_at TIMESTAMPTZ NOT NULL,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_market_price_entry_lookup
  ON market_price_entry (brand, model, storage_gb, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_price_entry_model_family
  ON market_price_entry (brand, model, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_alias_mapping_lookup
  ON model_alias_mapping (brand, alias_key);
