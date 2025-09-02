# Overview

Clarity Engine is an intelligent payee classification and matching platform designed for financial data processing. The system provides automated classification of payee names using AI (GPT-4), matches them against existing supplier networks (Finexio), and enriches data through third-party services like Mastercard's Track Search API. It features batch processing capabilities, real-time job management, and a React-based frontend for data visualization and management.

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **UI Components**: Tailwind CSS for styling with custom component library
- **State Management**: React hooks and context for application state
- **Routing**: Single-page application with client-side routing
- **Data Visualization**: Dashboard components for batch processing results and analytics

## Backend Architecture
- **Runtime**: Node.js with Express.js framework
- **Language**: TypeScript for type safety and better developer experience
- **Database ORM**: Drizzle ORM for PostgreSQL database interactions
- **Job Processing**: Bull queue system with Redis for background job management
- **API Design**: RESTful endpoints with structured JSON responses
- **File Processing**: Stream-based CSV and Excel file handling to manage memory usage

## Data Storage Solutions
- **Primary Database**: PostgreSQL with specialized extensions:
  - `pg_trgm` for trigram similarity matching
  - `pgvector` for vector similarity search (if available)
- **Cache Layer**: Redis for job queues and caching frequently accessed data
- **File Storage**: Temporary file storage for upload processing
- **BigQuery Integration**: Direct connection to Google BigQuery for supplier data synchronization

## Authentication and Authorization
- **Current State**: No authentication implemented (development/internal tool)
- **API Security**: Internal network access patterns
- **Future Considerations**: Role-based access control planned for production deployment

## Core Processing Pipeline
- **Upload Processing**: Multi-format file support (CSV, Excel) with streaming parsers
- **Data Normalization**: Text cleaning and standardization before classification
- **Classification Engine**: Multi-tier approach:
  - Tier 1: Rule-based and algorithmic matching (fast)
  - Tier 2: AI-powered classification using OpenAI GPT-4 (accurate)
- **Batch Management**: Chunked processing with configurable concurrency limits
- **Result Storage**: Structured storage of classification results with audit trails

## Memory Management Strategy
- **Streaming Architecture**: Process large files without loading entire datasets into memory
- **Garbage Collection**: Manual GC triggers and memory monitoring
- **Cache Limitations**: LRU caches with size limits and TTL expiration
- **Batch Sizing**: Configurable batch sizes (typically 200-500 records) to prevent memory spikes

# External Dependencies

## Third-Party APIs
- **OpenAI GPT-4**: Primary AI classification engine for payee type determination
- **Mastercard Track Search API**: Business enrichment and validation service
  - OAuth 1.0 signature-based authentication
  - Asynchronous processing with polling mechanism
  - P12 certificate-based security
- **Google Maps API**: Address validation and geocoding services
- **BigQuery API**: Supplier data synchronization and analytics

## Database Systems
- **PostgreSQL**: Primary data store with advanced text search capabilities
- **Redis**: Job queue management and caching layer
- **Google BigQuery**: External data warehouse for supplier network data

## Development and Deployment
- **Replit Platform**: Primary deployment target with zero-configuration setup
- **Node.js Ecosystem**: NPM package management with TypeScript compilation
- **Environment Configuration**: Environment variable-based configuration management

## Machine Learning and AI
- **Fuzzy String Matching**: Multiple algorithms including Jaro-Winkler, Levenshtein distance
- **Phonetic Matching**: Double Metaphone for sound-based name matching
- **Vector Embeddings**: Optional OpenAI embeddings for semantic similarity
- **Classification Models**: Hybrid approach combining rule-based and ML-based classification

## Data Processing Libraries
- **CSV Processing**: Stream-based parsing with `csv-parser`
- **Excel Processing**: XLSX parsing with memory-efficient streaming
- **String Processing**: Advanced text normalization and cleaning utilities
- **Batch Processing**: Queue-based job management with Bull and Redis