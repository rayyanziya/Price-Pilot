CREATE TABLE IF NOT EXISTS quote_event (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  request_id TEXT NOT NULL,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  storage_gb INTEGER NOT NULL,
  condition_grade CHAR(1) NOT NULL CHECK (condition_grade IN ('A', 'B', 'C', 'D')),
  battery_health_pct NUMERIC(5,2) NOT NULL,
  has_box BOOLEAN NOT NULL,
  status TEXT NOT NULL CHECK (
    status IN ('success', 'validation_error', 'model_data_not_available', 'internal_error')
  ),
  latency_ms INTEGER NOT NULL CHECK (latency_ms >= 0),
  fallback_used BOOLEAN,
  recommended_price INTEGER,
  error_code TEXT,
  error_detail TEXT
);

CREATE INDEX IF NOT EXISTS idx_quote_event_created_at
  ON quote_event (created_at);

CREATE INDEX IF NOT EXISTS idx_quote_event_status_created_at
  ON quote_event (status, created_at);

CREATE INDEX IF NOT EXISTS idx_quote_event_brand_model_storage_created_at
  ON quote_event (brand, model, storage_gb, created_at);
