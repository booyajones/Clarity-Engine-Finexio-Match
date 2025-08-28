-- Enable trigram extension for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Expression indexes for case-insensitive equals/prefix matching
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_payee_lc
  ON cached_suppliers ((lower(payee_name)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_norm_lc
  ON cached_suppliers ((lower(normalized_name)));

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_mc_lc
  ON cached_suppliers ((lower(mastercard_business_name)));

-- Trigram indexes for similarity/contains searches (these are the game-changers)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_payee_trgm
  ON cached_suppliers USING gin ((lower(payee_name)) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_norm_trgm
  ON cached_suppliers USING gin ((lower(normalized_name)) gin_trgm_ops);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_mc_trgm
  ON cached_suppliers USING gin ((lower(mastercard_business_name)) gin_trgm_ops);

-- Also add indexes on city and state for faster filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_state
  ON cached_suppliers (state);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_cs_city_state
  ON cached_suppliers (city, state);

-- Update statistics for query planner
ANALYZE cached_suppliers;