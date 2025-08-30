"""Main FastAPI application entry point."""

import os
import sys
from contextlib import asynccontextmanager
import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from prometheus_client import make_asgi_app

# Add app directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.config import settings
from app.db import init_database, check_extensions
from app.features import load_idf_cache
from app.routers import health, ingest, match, review
from app.bigquery_sync import get_supplier_count

# Configure structured logging
structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.stdlib.PositionalArgumentsFormatter(),
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.processors.JSONRenderer()
    ],
    context_class=dict,
    logger_factory=structlog.stdlib.LoggerFactory(),
    cache_logger_on_first_use=True,
)

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    # Startup
    logger.info("application_starting")
    
    # Initialize database
    init_database()
    check_extensions()
    
    # Load IDF cache for features
    from app.db import get_db
    with get_db() as db:
        load_idf_cache(db)
    
    # Check supplier count
    supplier_count = get_supplier_count()
    logger.info("supplier_count", count=supplier_count)
    
    if supplier_count == 0:
        logger.warning(
            "no_suppliers_loaded",
            message="Run BigQuery sync to load suppliers"
        )
    
    logger.info("application_ready")
    
    yield
    
    # Shutdown
    logger.info("application_shutdown")


# Create FastAPI app
app = FastAPI(
    title="Finexio Payee Matcher",
    description="High-precision entity resolution for financial data",
    version="1.0.0",
    lifespan=lifespan
)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers
app.include_router(health.router, tags=["health"])
app.include_router(ingest.router, prefix="/v1/payees", tags=["ingest"])
app.include_router(match.router, prefix="/v1/match", tags=["match"])
app.include_router(review.router, prefix="/v1/review", tags=["review"])

# Mount Prometheus metrics
metrics_app = make_asgi_app()
app.mount("/metrics", metrics_app)

# Mount static files for UI
if settings.enable_review_ui:
    static_dir = os.path.join(os.path.dirname(__file__), "app", "ui", "static")
    if os.path.exists(static_dir):
        app.mount("/static", StaticFiles(directory=static_dir), name="static")


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Finexio Payee Matcher",
        "version": "1.0.0",
        "status": "ready",
        "endpoints": {
            "health": "/health",
            "ingest": "/v1/payees/ingest",
            "match": "/v1/match",
            "match_batch": "/v1/match/batch",
            "review": "/v1/review/open",
            "metrics": "/metrics"
        }
    }


if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level=settings.log_level.lower()
    )