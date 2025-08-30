"""Database connection and session management."""

import os
from contextlib import contextmanager
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.ext.declarative import declarative_base
import structlog

from app.config import settings

logger = structlog.get_logger()

# Create engine
engine = create_engine(
    settings.database_url,
    pool_size=20,
    max_overflow=40,
    pool_pre_ping=True,
    echo=False
)

# Session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()


def init_database():
    """Initialize database with schema."""
    schema_path = os.path.join(os.path.dirname(__file__), "schema.sql")
    
    with open(schema_path, "r") as f:
        schema_sql = f.read()
    
    with engine.connect() as conn:
        # Execute schema SQL in a transaction
        trans = conn.begin()
        try:
            for statement in schema_sql.split(";"):
                if statement.strip():
                    conn.execute(text(statement))
            trans.commit()
            logger.info("database_initialized", status="success")
        except Exception as e:
            trans.rollback()
            logger.error("database_init_failed", error=str(e))
            raise


@contextmanager
def get_db() -> Session:
    """Get database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def check_extensions():
    """Check if required PostgreSQL extensions are installed."""
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT extname 
            FROM pg_extension 
            WHERE extname IN ('pg_trgm', 'vector')
        """))
        
        extensions = {row[0] for row in result}
        required = {'pg_trgm', 'vector'}
        missing = required - extensions
        
        if missing:
            logger.warning("missing_extensions", extensions=list(missing))
            return False
        
        logger.info("extensions_verified", extensions=list(extensions))
        return True