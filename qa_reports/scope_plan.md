# Clarity Engine 5 - Finexio Match Refactoring Scope Plan

## Current State Analysis
The application is a complex AI-powered payee intelligence platform with multiple integrated services:
- OpenAI classification
- Finexio/BigQuery supplier matching  
- Mastercard MMT API enrichment
- Google Address validation
- Akkio payment predictions
- Extensive batch processing and job management

## Target State: Finexio Match Only
Focused application providing:
1. **Finexio Match** - Single and batch payee matching against Finexio network
2. **Jobs CRUD** - Full batch job management functionality
3. **Exact UX/Styling** - Preserve all visual components and layouts

## Modules to Keep

### Backend Services
- `/server/services/finexioMatcherV3.ts` - Core matching logic
- `/server/services/optimizedFinexioMatchingV2.ts` - Optimized matcher
- `/server/services/fuzzyMatcher.ts` - Fuzzy matching algorithms
- `/server/services/batchJobManager.ts` - Job management
- `/server/services/supplierCacheService.ts` - Finexio supplier cache
- `/server/db/` - Database connections
- `/server/storage.ts` - Data persistence layer (simplified)

### API Routes (Keep/Modify)
- `GET /api/health` - Health check
- `POST /api/v1/match` - Single Finexio match  
- `POST /api/v1/match/batch` - Batch Finexio match
- `GET /api/v1/jobs` - List jobs
- `POST /api/v1/jobs` - Create job
- `GET /api/v1/jobs/{id}` - Job details
- `PATCH /api/v1/jobs/{id}` - Update job
- `DELETE /api/v1/jobs/{id}` - Delete job
- `GET /api/v1/jobs/{id}/download` - Download results

### Frontend Components (Keep)
- `/client/src/pages/upload.tsx` - File upload interface
- `/client/src/pages/classifications.tsx` - Results viewer (rename to matches)
- `/client/src/components/upload/file-upload.tsx` - Upload widget
- `/client/src/components/batch-card.tsx` - Job cards
- `/client/src/components/ui/*` - All UI components (unchanged)
- `/client/src/components/layout/*` - Layout components

### Database Tables (Keep/Simplify)
- `uploadBatches` - Remove non-Finexio status fields
- `payeeClassifications` - Keep only Finexio match fields
- `cachedSuppliers` - Finexio network cache
- `payeeMatches` - Match results

## Modules to Remove

### Backend Services to Delete
- All Mastercard services (`/server/services/mastercard*.ts`)
- Google Address validation (`/server/services/addressValidationService.ts`, `intelligentAddressService.ts`)
- Akkio services (`/server/services/akkio*.ts`, `/server/services/fieldPredictionService.ts`)
- Classification services (`/server/services/classification*.ts`)
- BigQuery services (`/server/services/bigQuery*.ts`)
- Monitoring/telemetry (keep minimal health check only)
- Pipeline orchestration (not needed for single-purpose)
- Scheduler services

### Routes to Remove
- `/server/routes/mastercard*.ts`
- `/server/routes/akkio.ts`
- `/server/routes/bigquery.ts`
- `/server/routes/dashboard.ts`
- `/server/routes/telemetry.ts`
- `/server/routes/monitoring.ts`
- `/server/routes/pipelineRoutes.ts`

### Frontend Pages to Remove/Hide
- `/client/src/pages/akkio-models.tsx`
- `/client/src/pages/mastercard-monitor.tsx`
- `/client/src/pages/dashboard.tsx` (if not used for Jobs list)
- `/client/src/pages/review.tsx` (manual review not needed)

### Database Columns to Remove
From `payeeClassifications`:
- All `mastercard*` fields
- All `google*` fields  
- All `akkio*` fields
- Classification-specific fields (sicCode, payeeType confidence if not used by Finexio)

From `uploadBatches`:
- All status tracking fields except Finexio matching
- Module-specific progress fields

### Dependencies to Remove
- `mastercard-oauth1-signer`
- `@google-cloud/bigquery`
- `akkio`
- `openai` (unless Finexio matcher uses it)
- Various monitoring and analytics packages

### Environment Variables to Remove
- `MASTERCARD_*` (all)
- `GOOGLE_MAPS_API_KEY`
- `AKKIO_*`
- `OPENAI_API_KEY` (if not used by Finexio)
- BigQuery credentials

## Removal Sequence

### Phase 1: Remove External Service Integrations
1. Delete Mastercard routes and services
2. Remove Google Address validation
3. Remove Akkio predictions
4. Remove BigQuery integration

### Phase 2: Simplify Database Schema
1. Remove unused columns from tables
2. Update Drizzle schema
3. Run migration

### Phase 3: Clean Frontend
1. Remove/hide unused pages
2. Update navigation to remove deleted sections
3. Simplify upload flow to Finexio-only

### Phase 4: Clean Dependencies
1. Remove unused packages from package.json
2. Clean environment variables
3. Update configuration files

### Phase 5: Update API Structure
1. Rename routes to v1 structure
2. Consolidate batch processing to jobs API
3. Simplify response formats

## Success Criteria
- [ ] UI looks identical (visual regression < 1.5%)
- [ ] Finexio single match works
- [ ] Finexio batch match works
- [ ] Jobs CRUD fully functional
- [ ] All removed routes return 404
- [ ] No import errors for removed modules
- [ ] Memory usage improved
- [ ] Response times maintained or improved