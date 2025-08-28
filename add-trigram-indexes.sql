-- Enable trigram extension for fast fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add trigram index on supplier names for fast similarity searches
CREATE INDEX IF NOT EXISTS idx_suppliers_name_trgm
  ON cached_suppliers USING GIN (payee_name gin_trgm_ops);

-- Add trigram index on Mastercard business names if they exist
CREATE INDEX IF NOT EXISTS idx_suppliers_alt_name_trgm
  ON cached_suppliers USING GIN (mastercard_business_name gin_trgm_ops);

-- Add normalized name column for better matching
ALTER TABLE cached_suppliers
  ADD COLUMN IF NOT EXISTS name_norm text
  GENERATED ALWAYS AS (
    lower(regexp_replace(
      regexp_replace(payee_name, '[^a-zA-Z0-9 ]', '', 'g'),
      '\y(inc|llc|ltd|co|corp|corporation|company|limited|incorporated)\y\.?', 
      '', 
      'gi'
    ))
  ) STORED;

-- Index the normalized name for super fast lookups
CREATE INDEX IF NOT EXISTS idx_suppliers_name_norm_trgm
  ON cached_suppliers USING GIN (name_norm gin_trgm_ops);

-- Add regular B-tree index on normalized name for exact matches
CREATE INDEX IF NOT EXISTS idx_suppliers_name_norm_btree
  ON cached_suppliers (name_norm);

-- Analyze the table to update statistics
ANALYZE cached_suppliers;