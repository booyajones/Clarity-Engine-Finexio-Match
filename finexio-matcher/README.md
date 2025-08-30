# Finexio Payee Matcher

High-precision entity resolution service for matching payee names against a network of ~120,000+ existing suppliers.

## Features

- **Hybrid Matching Approach**: Combines deterministic normalization, fuzzy matching, vector similarity, and ML classification
- **Multiple Candidate Generation Methods**:
  - PostgreSQL trigram similarity (pg_trgm)
  - Vector embeddings with HNSW index (pgvector)
  - Phonetic matching (Double Metaphone)
- **Machine Learning Classifier**: Logistic regression with isotonic calibration
- **BigQuery Integration**: Sync suppliers directly from BigQuery
- **High Performance**: Processes batches of 10,000 names in minutes
- **Review Queue**: Human-in-the-loop for borderline matches
- **Prometheus Metrics**: Full observability

## Quick Start

### 1. Set Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/finexio

# BigQuery (for loading suppliers)
BIGQUERY_PROJECT_ID=your-project
BIGQUERY_DATASET=your-dataset
BIGQUERY_TABLE=finexio_suppliers

# Optional (for embeddings)
OPENAI_API_KEY=sk-...
```

### 2. Initialize Database

The application will automatically create tables and indexes on startup.

### 3. Load Suppliers from BigQuery

```bash
# Sync all suppliers
curl -X POST http://localhost:8000/v1/payees/sync/bigquery \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 1000}'
```

### 4. Start Matching

```python
# Single match
curl -X POST http://localhost:8000/v1/match \
  -H "Content-Type: application/json" \
  -d '{"name": "Microsoft Corporation"}'

# Batch match
curl -X POST http://localhost:8000/v1/match/batch \
  -H "Content-Type: application/json" \
  -d '{"names": ["FedEx", "Apple Inc", "Amazon"]}'
```

## API Endpoints

- `GET /health` - Health check
- `POST /v1/payees/ingest` - Add payees to network
- `POST /v1/payees/sync/bigquery` - Sync from BigQuery
- `POST /v1/match` - Match single payee
- `POST /v1/match/batch` - Match multiple payees
- `GET /v1/review/open` - Get items needing review
- `POST /v1/review/{id}/approve` - Approve a match
- `POST /v1/review/{id}/reject` - Reject a match
- `GET /metrics` - Prometheus metrics

## Architecture

```
Input Name
    ↓
Canonicalization (deterministic normalization)
    ↓
Candidate Generation (union of 3 methods)
    ├── Trigram similarity (pg_trgm)
    ├── Vector similarity (embeddings)
    └── Phonetic matching (metaphone)
    ↓
Feature Engineering (30+ features)
    ↓
ML Classification (calibrated probability)
    ↓
Decision Thresholds
    ├── p ≥ 0.97 → Auto-match
    ├── 0.60 ≤ p < 0.97 → Review queue
    └── p < 0.60 → No match
```

## Performance Targets

- **Network Size**: 120k-500k payees
- **Single Match Latency**: <150ms (P95)
- **Batch Throughput**: 10k names in minutes
- **Auto-match Precision**: ≥99.5%
- **Candidate Recall**: ≥98%

## Development

```bash
# Install dependencies
pip install -r requirements.txt

# Run tests
pytest

# Start server
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

## Configuration

Key settings in environment variables:

- `T_HIGH=0.97` - Auto-match threshold
- `T_LOW=0.60` - Review threshold
- `TOPK_TRIGRAM=50` - Trigram candidates
- `TOPK_VECTOR=50` - Vector candidates
- `BATCH_WORKERS=8` - Parallel workers
- `EMBEDDING_DIM=1024` - Embedding dimension

## Production Deployment

1. Use PostgreSQL 15+ with extensions:
   - `pg_trgm` for trigram matching
   - `vector` for embeddings

2. Ensure adequate resources:
   - 4+ CPU cores
   - 8GB+ RAM
   - SSD storage for database

3. Enable monitoring:
   - Prometheus metrics at `/metrics`
   - Structured JSON logging
   - Database query performance

## License

Proprietary - Finexio