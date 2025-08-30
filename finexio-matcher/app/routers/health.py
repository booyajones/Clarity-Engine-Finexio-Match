"""Health check endpoints."""

from fastapi import APIRouter
from app.db import engine
from app.bigquery_sync import get_supplier_count
import structlog

router = APIRouter()
logger = structlog.get_logger()


@router.get("/health")
async def health_check():
    """Basic health check endpoint."""
    try:
        # Check database connection
        with engine.connect() as conn:
            conn.execute("SELECT 1")
        
        # Get supplier count
        supplier_count = get_supplier_count()
        
        return {
            "status": "healthy",
            "database": "connected",
            "suppliers": supplier_count
        }
    except Exception as e:
        logger.error("health_check_failed", error=str(e))
        return {
            "status": "unhealthy",
            "error": str(e)
        }