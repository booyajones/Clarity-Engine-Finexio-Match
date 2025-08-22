-- Database optimization indexes for better query performance
-- Run this to significantly improve dashboard stats and other queries

-- Indexes for upload_batches table
CREATE INDEX IF NOT EXISTS idx_upload_batches_status ON upload_batches(status);
CREATE INDEX IF NOT EXISTS idx_upload_batches_created_at ON upload_batches(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_batches_status_created ON upload_batches(status, created_at DESC);

-- Indexes for payee_classifications table
CREATE INDEX IF NOT EXISTS idx_payee_classifications_batch_id ON payee_classifications(batch_id);
CREATE INDEX IF NOT EXISTS idx_payee_classifications_google_status ON payee_classifications(google_address_validation_status);
CREATE INDEX IF NOT EXISTS idx_payee_classifications_batch_google ON payee_classifications(batch_id, google_address_validation_status);

-- Indexes for payee_matches table
CREATE INDEX IF NOT EXISTS idx_payee_matches_classification_id ON payee_matches(classification_id);
CREATE INDEX IF NOT EXISTS idx_payee_matches_finexio_score ON payee_matches(finexio_match_score);
CREATE INDEX IF NOT EXISTS idx_payee_matches_class_score ON payee_matches(classification_id, finexio_match_score);

-- Indexes for cached_suppliers table (if not already indexed)
CREATE INDEX IF NOT EXISTS idx_cached_suppliers_name ON cached_suppliers(name);
CREATE INDEX IF NOT EXISTS idx_cached_suppliers_normalized ON cached_suppliers(normalized_name);

-- Indexes for mastercard_search_requests
CREATE INDEX IF NOT EXISTS idx_mastercard_search_status ON mastercard_search_requests(status);
CREATE INDEX IF NOT EXISTS idx_mastercard_search_created ON mastercard_search_requests(created_at DESC);

-- Analyze tables to update statistics
ANALYZE upload_batches;
ANALYZE payee_classifications;
ANALYZE payee_matches;
ANALYZE cached_suppliers;
ANALYZE mastercard_search_requests;