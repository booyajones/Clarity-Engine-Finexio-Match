## Clarity Engine 5 - Payee Intelligence Platform

### Overview
Clarity Engine 5 is an AI-powered web application designed for finance and accounting professionals. Its core purpose is to transform unstructured payee data into organized, actionable insights by intelligently classifying payees (Individual, Business, Government) and assigning SIC codes with confidence scores. The platform integrates with the Mastercard Merchant Match Tool (MMT) API for comprehensive business enrichment. It aims to be a sophisticated, enterprise-ready tool for financial data transformation and analysis, emphasizing accuracy, scalability, and robust error handling.

### User Preferences
- **Communication style**: Simple, everyday language
- **Architecture preference**: Each processing stage should be a well-contained, self-contained app for modularity
  - Classification module (standalone)
  - Finexio matching module (standalone)
  - Google Address validation module (standalone)
  - Mastercard enrichment module (standalone)
  - Akkio predictions module (standalone)
  - This allows easy bolt-on additions of new components

### System Architecture

#### Frontend
- **Framework**: React with TypeScript and Vite
- **UI Framework**: Shadcn/ui (on Radix UI)
- **Styling**: Tailwind CSS
- **State Management**: TanStack Query
- **Routing**: Wouter
- **Charts**: Chart.js

#### Backend
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript with ES modules
- **API Style**: RESTful API
- **File Processing**: Multer for CSV/Excel uploads
- **Session Management**: Connect-pg-simple for PostgreSQL
- **Performance**: Optimized with local caching and PostgreSQL trigram indexes for fuzzy searching.
- **Scheduler Service**: Automatic nightly cache refresh.
- **Batch Job Management**: Advanced system for handling large-scale operations with automatic sub-batching, progress tracking, retry logic, and failure recovery.
- **Memory Management**: Real-time monitoring, garbage collection, leak detection, and alerts.
- **Caching System**: LRU caches with size limits, automatic eviction, and TTL management for suppliers, classifications, and queries.
- **Resource Optimization**: Dynamic database connection pooling, scheduled cleanup, and performance monitoring endpoints.
- **Deployment Optimization**: Dynamic port binding, enhanced Redis connection handling, comprehensive health checks, graceful shutdown, and memory optimization.
- **Async Job Processing**: Implemented for Mastercard, using background workers, polling, and webhooks for real-time notifications.
- **Concurrency Control**: Implemented p-limit based throttling with optimal limits (16 for classification, 32 for Finexio DB, 12 for Google Maps).
- **Optimized Batch Sizes**: 250 records per sub-batch for optimal memory usage and throughput.
- **Prometheus Metrics**: Comprehensive observability with histograms, counters, and gauges for all pipeline stages.
- **Structured Logging**: Pino-based structured logging with batch/row/stage context for better debugging.

#### Database
- **Primary Database**: PostgreSQL via Neon serverless
- **ORM**: Drizzle ORM
- **Connection**: @neondatabase/serverless with connection pooling
- **Schema**: Includes tables for users, upload batches, payee classifications, SIC codes, classification rules, and cached suppliers.
- **Cache**: Complete Finexio database of 483,227 suppliers for matching.
- **Matching Strategy V3**: Streamlined DB→Rules→AI pipeline for matching:
  1. Exact match.
  2. Trigram similarity search (top 10 candidates).
  3. Early-accept rules (exact normalized, high similarity + state match).
  4. OpenAI adjudication for ambiguous cases.
  This approach is designed for speed and accuracy.

#### AI/ML Classification Service
- **Core Technology**: OpenAI GPT-4o for advanced payee classification (95%+ accuracy target).
- **Classification Logic**: Multi-layered AI and rule-based pattern matching with intelligent fallback (OpenAI, rule-based, heuristics, default to Business).
- **Confidence Scoring**: High-confidence results are processed; lower confidence results are flagged for review.
- **SIC Code Assignment**: Automatic industry classification.
- **Duplicate Detection**: Advanced normalization and intelligent duplicate flagging.
- **Processing Order**: Google Address validation → Finexio matching → Mastercard → Akkio.
- **Intelligent Address Enhancement**: OpenAI-powered selective address enhancement.
- **Akkio Payment Prediction**: Integrated for payment method and outcome prediction.
- **Keyword Exclusion System**: 593 permanent exclusion keywords for government/financial entities.
- **Sophisticated Fuzzy Matching**: Utilizes a 6-algorithm system (Levenshtein, Jaro-Winkler, Token Set, Metaphone, N-gram, AI enhancement) for typo tolerance and variation handling using original business names.
- **Exact Match Enhancements**: Smart variations handling (LLC/INC, commas, DBA names, business suffixes) to maximize exact match rate.

#### File Processing Pipeline
- **Handling**: Asynchronous processing with status tracking.
- **Support**: CSV and Excel file parsing.
- **Batch Processing**: Bulk classification with progress tracking.
- **Error Handling**: Comprehensive reporting and recovery including exponential backoff and retry logic.
- **Scalability**: Optimized for large datasets with chunked processing, controlled concurrency, and memory management.

#### Key Features
- **Smart Classification**: AI-driven, high confidence, SIC code assignment.
- **User Experience**: Drag-and-drop file uploads, real-time processing status, responsive, accessible UI.
- **Data Management**: Bulk processing, export, comprehensive error handling.
- **Job Reliability**: Automatic failure detection, sub-job processing, adaptive batch sizing.
- **Results Viewing**: Detailed interface with summary cards, search, filtering, and sorting.
- **Tool Toggle Controls**: User-configurable settings to enable/disable Finexio matching and Mastercard enrichment.
- **System Monitoring**: Real-time memory monitoring, performance metrics, cache statistics, and resource protection.

### External Dependencies

#### Core
- **@neondatabase/serverless**: PostgreSQL database connectivity.
- **drizzle-orm**: Type-safe database operations.
- **@tanstack/react-query**: Server state management.
- **@radix-ui/**: Accessible UI component primitives.
- **chart.js**: Data visualization.
- **csv-parser**: CSV file processing.
- **xlsx**: Excel file processing.
- **OpenAI API**: For AI classification functionality (GPT-4o).
- **Mastercard Merchant Match Tool (MMT) API**: For business enrichment data.
- **Akkio API**: For payment prediction and machine learning models.
- **Google Maps API**: For address validation and geographic data.