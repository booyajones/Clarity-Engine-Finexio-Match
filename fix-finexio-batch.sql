-- Reset batch 165 to allow enrichment restart
UPDATE upload_batches 
SET 
  status = 'enriching',
  current_step = 'Restarting Finexio matching',
  progress_message = 'Restarting Finexio matching module...',
  finexio_matching_status = 'processing',
  finexio_matching_progress = 0,
  finexio_matched_count = 0,
  finexio_matching_completed_at = NULL
WHERE id = 165;

-- Clear any stuck Finexio data for the classifications
UPDATE payee_classifications
SET 
  finexio_supplier_id = NULL,
  finexio_supplier_name = NULL,
  finexio_confidence = 0,
  finexio_match_reasoning = 'Pending re-match'
WHERE batch_id = 165;
