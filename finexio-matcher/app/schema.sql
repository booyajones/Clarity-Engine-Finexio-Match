-- Enable required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS vector;

-- Main payees table with all matching features
CREATE TABLE IF NOT EXISTS payees (
  payee_id       BIGSERIAL PRIMARY KEY,
  name_raw       TEXT NOT NULL,
  name_canon     TEXT NOT NULL,
  name_tokens    TEXT[] NOT NULL,
  dm_codes       TEXT[] NOT NULL,     -- double metaphone codes
  name_vec       VECTOR(1024),        -- dimension configurable
  
  -- BigQuery source tracking
  bq_supplier_id TEXT,                -- Original BigQuery supplier ID
  bq_sync_date   TIMESTAMPTZ,         -- Last sync from BigQuery
  
  -- Additional metadata
  address        TEXT,
  city           TEXT,
  state          TEXT,
  zip_code       TEXT,
  country        TEXT,
  
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- GIN trigram index for fast fuzzy char similarity on canonical name
CREATE INDEX IF NOT EXISTS payees_name_trgm_idx
  ON payees USING GIN (name_canon gin_trgm_ops);

-- HNSW for cosine similarity on name_vec (when using embeddings)
CREATE INDEX IF NOT EXISTS payees_name_vec_hnsw
  ON payees USING hnsw (name_vec vector_cosine_ops);

-- Index for BigQuery supplier ID lookups
CREATE INDEX IF NOT EXISTS payees_bq_supplier_idx
  ON payees (bq_supplier_id);

-- Index for phonetic codes
CREATE INDEX IF NOT EXISTS payees_dm_codes_idx
  ON payees USING GIN (dm_codes);

-- Keep a table for labeled training data
CREATE TABLE IF NOT EXISTS labels (
  label_id     BIGSERIAL PRIMARY KEY,
  q_name_raw   TEXT NOT NULL,
  q_name_canon TEXT NOT NULL,
  c_payee_id   BIGINT NOT NULL REFERENCES payees(payee_id) ON DELETE CASCADE,
  y            BOOLEAN NOT NULL,          -- 1=same entity, 0=different
  meta         JSONB DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Review queue for borderline matches
CREATE TABLE IF NOT EXISTS review_queue (
  rq_id        BIGSERIAL PRIMARY KEY,
  q_name_raw   TEXT NOT NULL,
  q_name_canon TEXT NOT NULL,
  candidates   JSONB NOT NULL,            -- list with scores & features
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status       TEXT NOT NULL DEFAULT 'open',  -- open|approved|rejected
  reviewed_by  TEXT,
  reviewed_at  TIMESTAMPTZ
);

-- Cache for embeddings to avoid recomputation
CREATE TABLE IF NOT EXISTS embedding_cache (
  cache_id     BIGSERIAL PRIMARY KEY,
  text_hash    TEXT NOT NULL UNIQUE,      -- SHA256 of canonicalized text
  text_canon   TEXT NOT NULL,
  embedding    VECTOR(1024),
  provider     TEXT NOT NULL,
  model        TEXT NOT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS embedding_cache_hash_idx
  ON embedding_cache (text_hash);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_payees_updated_at BEFORE UPDATE
  ON payees FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();