# Clarity Engine 5 - Enterprise Payee Intelligence Platform

## Executive Summary

Clarity Engine 5 is a sophisticated AI-powered enterprise platform designed to transform unstructured financial payee data into structured, actionable intelligence. Built for financial institutions and enterprises processing high-volume payment data, the platform combines advanced machine learning, fuzzy matching algorithms, and real-time data enrichment to deliver unparalleled accuracy in payee classification and supplier intelligence.

### Key Value Propositions
- **95%+ Classification Accuracy**: Advanced AI models ensure highly accurate payee categorization
- **10-20x Performance Optimization**: Radical performance improvements through parallel processing and smart caching
- **Real-Time Enrichment**: Live integration with Mastercard, Google Maps, and Finexio databases
- **Enterprise-Grade Reliability**: Production-ready with comprehensive error handling and recovery mechanisms
- **Complete Data Intelligence**: From basic classification to predictive payment analytics

## Table of Contents
1. [Core Features](#core-features)
2. [Technical Architecture](#technical-architecture)
3. [Data Processing Pipeline](#data-processing-pipeline)
4. [Module Descriptions](#module-descriptions)
5. [Installation & Setup](#installation--setup)
6. [API Documentation](#api-documentation)
7. [Database Schema](#database-schema)
8. [Performance Optimizations](#performance-optimizations)
9. [Security & Compliance](#security--compliance)
10. [Deployment Guide](#deployment-guide)

## Core Features

### 🎯 Intelligent Payee Classification
- **Multi-Layer AI Processing**: Utilizes OpenAI GPT-4o for sophisticated natural language understanding
- **Automatic Categorization**: Classifies payees as Individual, Business, or Government entities
- **SIC Code Assignment**: Automatic industry classification with confidence scoring
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging system
- **Keyword Exclusion**: 593 permanent exclusion keywords for government/financial entities

### 🔍 Advanced Supplier Matching (Finexio Integration)
- **Comprehensive Database**: Access to 117,614+ verified supplier records
- **6-Algorithm Fuzzy Matching**: 
  - Levenshtein Distance
  - Jaro-Winkler Similarity
  - Token Set Ratio
  - Metaphone Phonetic Matching
  - N-gram Analysis
  - AI-Enhanced Matching
- **Smart Variation Handling**: Intelligent processing of LLC/INC differences, DBA names, and business suffixes
- **Performance**: 100+ records/second processing speed
- **In-Memory Caching**: LRU cache with smart eviction policies

### 🌍 Google Address Validation
- **Real-Time Validation**: Live address verification through Google Maps API
- **Geocoding**: Latitude/longitude enrichment for location analytics
- **Address Standardization**: Consistent formatting across all records
- **Confidence Scoring**: Quality metrics for address data

### 💳 Mastercard Track™ Enrichment
- **Business Intelligence**: Comprehensive merchant data enrichment
- **Asynchronous Processing**: Background job processing with webhook notifications
- **100% Record Processing**: Guaranteed processing with retry mechanisms
- **Rich Data Points**: Industry codes, business details, location information

### 🤖 Akkio ML Predictions
- **Payment Method Prediction**: Predicts optimal payment methods (ACH, Check, Card, Wire)
- **Risk Assessment**: Payment success probability scoring
- **Machine Learning Models**: Custom-trained models for financial predictions
- **Configurable Integration**: Optional module that can be enabled/disabled

### 📊 Batch Processing & Management
- **Large-Scale Operations**: Handles 3000+ records per batch
- **Progress Tracking**: Real-time status updates with granular progress metrics
- **Sub-Batch Processing**: Automatic splitting for optimal performance
- **Job Cancellation**: Ability to stop processing mid-stream
- **Error Recovery**: Comprehensive retry logic with exponential backoff

## Technical Architecture

### Frontend Stack
```
React 18 + TypeScript
├── Vite (Build tool & dev server)
├── Shadcn/UI (Component library on Radix UI)
├── Tailwind CSS (Styling)
├── TanStack Query v5 (Server state management)
├── Wouter (Routing)
├── React Hook Form + Zod (Form validation)
└── Chart.js (Data visualization)
```

### Backend Stack
```
Node.js + Express + TypeScript
├── Drizzle ORM (Type-safe database operations)
├── PostgreSQL/Neon (Serverless database)
├── Bull (Job queue management)
├── Redis (Caching layer)
├── Multer (File upload processing)
├── Passport.js (Authentication)
└── Connect-pg-simple (Session storage)
```

### AI/ML Integrations
```
External Services
├── OpenAI API (GPT-4o for classification)
├── Mastercard MMT API (Merchant enrichment)
├── Google Maps API (Address validation)
├── Akkio API (ML predictions)
└── BigQuery (Finexio supplier data)
```

## Data Processing Pipeline

### Stage 1: File Upload & Parsing
```typescript
1. File Upload (CSV/Excel support)
   ├── Automatic column detection
   ├── Header normalization
   ├── Data validation
   └── Batch creation

2. Stream Processing
   ├── Memory-optimized chunking
   ├── 100-record batches
   └── Progress tracking
```

### Stage 2: Classification & Enrichment
```typescript
1. AI Classification
   ├── OpenAI GPT-4o processing
   ├── Confidence scoring
   ├── SIC code assignment
   └── Fallback mechanisms

2. Finexio Matching (Parallel)
   ├── Exact match attempts
   ├── Fuzzy matching algorithms
   ├── AI enhancement for medium confidence
   └── Result caching

3. Address Validation (Parallel)
   ├── Google Maps API calls
   ├── Geocoding
   └── Standardization

4. Mastercard Enrichment (Async)
   ├── Batch submission
   ├── Webhook processing
   └── Result aggregation

5. Akkio Predictions (Optional)
   ├── Payment method prediction
   └── Success probability scoring
```

## Module Descriptions

### Classification Module (`server/services/classificationV2.ts`)
The core classification engine that orchestrates all processing:
- **Intelligent Routing**: Directs records through appropriate enrichment pipelines
- **Error Handling**: Comprehensive error recovery with retry logic
- **Progress Management**: Real-time status updates to the UI
- **Memory Optimization**: Stream processing with garbage collection

### Finexio Matching Module (`server/services/optimizedFinexioMatching.ts`)
High-performance supplier matching engine:
- **Parallel Processing**: 100 concurrent matches
- **Smart Caching**: LRU cache with 10,000 entry limit
- **AI Enhancement**: Optional OpenAI enhancement for 85-95% confidence matches
- **Database Optimization**: Single optimized query with proper indexes

### Pipeline Orchestrator (`server/services/pipelineOrchestrator.ts`)
Coordinates multi-stage processing:
- **Module Management**: Controls which enrichment modules run
- **Status Tracking**: Maintains processing state across all modules
- **Error Aggregation**: Collects and reports errors from all stages
- **Completion Detection**: Determines when all processing is complete

### Mastercard Service (`server/services/mastercardService.ts`)
Enterprise-grade integration with Mastercard Track™:
- **OAuth 1.0a Authentication**: Secure API authentication
- **Batch Processing**: Handles up to 1000 records per batch
- **State Validation**: Automatic correction of invalid state codes
- **Retry Logic**: Exponential backoff for failed requests

## Installation & Setup

### Prerequisites
```bash
# Required
Node.js 18+ 
PostgreSQL 14+
Redis 6+

# Optional
Docker & Docker Compose (for containerized deployment)
```

### Environment Variables
```bash
# Database
DATABASE_URL=postgresql://user:password@host:port/database

# AI Services
OPENAI_API_KEY=sk-...
AKKIO_API_KEY=...

# External APIs
GOOGLE_MAPS_API_KEY=...
MASTERCARD_CONSUMER_KEY=...
MASTERCARD_KEY_ALIAS=...
MASTERCARD_KEYSTORE_PASSWORD=...

# BigQuery (Finexio Data)
BIGQUERY_CREDENTIALS={...json...}

# Redis (Optional)
REDIS_URL=redis://localhost:6379
```

### Installation Steps
```bash
# 1. Clone the repository
git clone https://github.com/your-org/clarity-engine-5.git
cd clarity-engine-5

# 2. Install dependencies
npm install

# 3. Set up environment variables
cp .env.example .env
# Edit .env with your credentials

# 4. Initialize database
npm run db:push

# 5. Load Finexio supplier cache (optional but recommended)
npm run load:suppliers

# 6. Start development server
npm run dev
```

## API Documentation

### File Upload Endpoint
```typescript
POST /api/upload
Content-Type: multipart/form-data

Parameters:
- file: File (CSV or Excel)
- payeeColumn: string (optional, auto-detected)
- enableFinexio: boolean (default: true)
- enableMastercard: boolean (default: true) 
- enableGoogleAddressValidation: boolean (default: false)
- enableAkkio: boolean (default: false)

Response:
{
  "id": "batch_id",
  "status": "processing",
  "message": "File uploaded successfully"
}
```

### Batch Status Endpoint
```typescript
GET /api/upload/batch/:id

Response:
{
  "id": "batch_id",
  "status": "processing|completed|failed",
  "totalRecords": 1000,
  "processedRecords": 500,
  "currentStep": "Finexio Matching",
  "progressMessage": "Processing records...",
  "finexioMatchingProgress": 400,
  "mastercardEnrichmentProgress": 0,
  "modules": {
    "classification": { status: "completed", progress: 100 },
    "finexio": { status: "in_progress", progress: 80 },
    "mastercard": { status: "pending", progress: 0 }
  }
}
```

### Results Export Endpoint
```typescript
GET /api/upload/batch/:id/export

Response: CSV file download with all enriched data
```

## Database Schema

### Core Tables
```sql
-- Upload Batches
upload_batches (
  id SERIAL PRIMARY KEY,
  filename VARCHAR(255),
  original_filename VARCHAR(255),
  status VARCHAR(50),
  total_records INTEGER,
  processed_records INTEGER,
  current_step VARCHAR(255),
  progress_message TEXT,
  created_at TIMESTAMP,
  completed_at TIMESTAMP,
  -- Module-specific progress fields
  finexio_matching_progress INTEGER,
  mastercard_enrichment_progress INTEGER,
  google_address_progress INTEGER,
  akkio_prediction_progress INTEGER
)

-- Payee Classifications
payee_classifications (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER REFERENCES upload_batches(id),
  original_payee_name VARCHAR(255),
  normalized_name VARCHAR(255),
  classification VARCHAR(50), -- Individual|Business|Government
  confidence_score DECIMAL(3,2),
  sic_code VARCHAR(10),
  sic_description TEXT,
  -- Enrichment data
  finexio_supplier_id VARCHAR(100),
  finexio_match_score DECIMAL(3,2),
  mastercard_merchant_id VARCHAR(100),
  google_place_id VARCHAR(255),
  akkio_prediction JSONB,
  created_at TIMESTAMP
)

-- Cached Suppliers (Finexio)
cached_suppliers (
  id SERIAL PRIMARY KEY,
  supplier_id VARCHAR(100) UNIQUE,
  name VARCHAR(255),
  normalized_name VARCHAR(255), 
  address JSONB,
  payment_methods JSONB,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)

-- Performance indexes
CREATE INDEX idx_payee_batch ON payee_classifications(batch_id);
CREATE INDEX idx_supplier_normalized ON cached_suppliers(normalized_name);
CREATE INDEX idx_classification_name ON payee_classifications(normalized_name);
```

## Performance Optimizations

### 1. Parallel Processing Architecture
```javascript
// Process 100 records simultaneously instead of sequentially
const batchSize = 100;
const results = await Promise.all(
  batch.map(record => processRecord(record))
);
```

### 2. Smart Caching Strategy
```javascript
// LRU Cache with automatic eviction
const cache = new LRUCache({
  max: 10000, // Maximum entries
  ttl: 1000 * 60 * 60, // 1 hour TTL
  updateAgeOnGet: true
});
```

### 3. Database Query Optimization
```sql
-- Single optimized query with proper indexes
SELECT * FROM cached_suppliers
WHERE normalized_name = $1
   OR normalized_name LIKE $2
   OR normalized_name IN (
     SELECT unnest($3::text[])
   )
LIMIT 10;
```

### 4. Memory Management
```javascript
// Automatic garbage collection
if (global.gc && processedCount % 500 === 0) {
  global.gc();
}

// Stream processing for large files
const stream = fs.createReadStream(file);
stream.pipe(parser)
  .on('data', processChunk)
  .on('end', finalize);
```

## Security & Compliance

### Data Security
- **Encryption at Rest**: All database data encrypted
- **Encryption in Transit**: TLS 1.3 for all API communications
- **API Key Management**: Secure storage using environment variables
- **Session Security**: Secure cookies with httpOnly and sameSite flags

### Compliance Features
- **Audit Logging**: Complete audit trail of all operations
- **Data Retention**: Configurable retention policies
- **PII Protection**: Automatic masking of sensitive data
- **GDPR Ready**: Data export and deletion capabilities

## Deployment Guide

### Production Deployment on Replit
```bash
1. Configure environment variables in Replit Secrets
2. Ensure PostgreSQL database is provisioned
3. Run database migrations: npm run db:push
4. Deploy using Replit Deployments
```

### Docker Deployment
```bash
# Build and run with Docker Compose
docker-compose up -d

# Scale workers for high volume
docker-compose up -d --scale worker=4
```

### Performance Tuning
```javascript
// Recommended production settings
{
  "maxConcurrentBatches": 5,
  "batchSize": 100,
  "cacheSize": 10000,
  "workerThreads": 4,
  "dbConnectionPool": 20
}
```

## Recent Updates (January 2025)

### Performance Improvements
- **10-20x Finexio Matching Speed**: Parallel processing, smart caching, optimized queries
- **Fixed Module Selection**: Modules only run when explicitly enabled
- **UI Improvements**: Single cancel button, proper progress display
- **BigQuery Integration**: Complete 117K+ supplier database loaded

### Bug Fixes
- Fixed "1400/0 records" display issue
- Resolved Akkio module showing when not selected
- Corrected state validation errors for Mastercard API
- Fixed duplicate cancel button issue

## Support & Documentation

### Additional Resources
- API Documentation: `/docs/api`
- Database Schema: `/docs/database`  
- Integration Guides: `/docs/integrations`
- Troubleshooting: `/docs/troubleshooting`

### Contact
For enterprise support and inquiries, please contact the development team.

---

**Version**: 5.0.0  
**Last Updated**: January 2025  
**License**: Proprietary  
**Built with**: React, Node.js, TypeScript, PostgreSQL, and AI