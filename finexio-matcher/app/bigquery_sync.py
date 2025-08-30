"""BigQuery synchronization for importing Finexio supplier data."""

import os
import json
from datetime import datetime
from typing import List, Dict, Any
import structlog
from google.cloud import bigquery
from google.oauth2 import service_account

from app.config import settings
from app.db import get_db
from app.canonicalize import canonicalize
from app.utils import get_embedding
from sqlalchemy import text

logger = structlog.get_logger()


def get_bigquery_client():
    """Get BigQuery client with credentials."""
    if not settings.bigquery_project_id:
        raise ValueError("BigQuery project ID not configured")
    
    if settings.bigquery_credentials and os.path.exists(settings.bigquery_credentials):
        # Load credentials from file
        credentials = service_account.Credentials.from_service_account_file(
            settings.bigquery_credentials
        )
        client = bigquery.Client(
            project=settings.bigquery_project_id,
            credentials=credentials
        )
    else:
        # Use default credentials (for Replit environment)
        client = bigquery.Client(project=settings.bigquery_project_id)
    
    return client


def sync_suppliers_from_bigquery(batch_size: int = 1000, limit: int = None):
    """
    Sync suppliers from BigQuery to PostgreSQL.
    
    Args:
        batch_size: Number of records to process at once
        limit: Maximum number of records to sync (None for all)
    """
    logger.info("starting_bigquery_sync", batch_size=batch_size, limit=limit)
    
    try:
        client = get_bigquery_client()
        
        # Build query
        table_ref = f"{settings.bigquery_project_id}.{settings.bigquery_dataset}.{settings.bigquery_table}"
        
        query = f"""
        SELECT 
            supplier_id,
            supplier_name,
            address,
            city,
            state,
            zip,
            country
        FROM `{table_ref}`
        WHERE supplier_name IS NOT NULL
        """
        
        if limit:
            query += f" LIMIT {limit}"
        
        logger.info("executing_bigquery_query", table=table_ref)
        
        # Execute query
        query_job = client.query(query)
        results = query_job.result()
        
        # Process in batches
        batch = []
        total_processed = 0
        total_inserted = 0
        total_updated = 0
        
        with get_db() as db:
            for row in results:
                supplier = {
                    "bq_supplier_id": row.supplier_id,
                    "name_raw": row.supplier_name,
                    "address": row.address,
                    "city": row.city,
                    "state": row.state,
                    "zip_code": row.zip,
                    "country": row.country
                }
                
                batch.append(supplier)
                
                if len(batch) >= batch_size:
                    inserted, updated = process_supplier_batch(db, batch)
                    total_inserted += inserted
                    total_updated += updated
                    total_processed += len(batch)
                    
                    logger.info(
                        "batch_processed",
                        processed=total_processed,
                        inserted=total_inserted,
                        updated=total_updated
                    )
                    
                    batch = []
            
            # Process remaining batch
            if batch:
                inserted, updated = process_supplier_batch(db, batch)
                total_inserted += inserted
                total_updated += updated
                total_processed += len(batch)
        
        logger.info(
            "bigquery_sync_complete",
            total_processed=total_processed,
            total_inserted=total_inserted,
            total_updated=total_updated
        )
        
        return {
            "processed": total_processed,
            "inserted": total_inserted,
            "updated": total_updated
        }
        
    except Exception as e:
        logger.error("bigquery_sync_failed", error=str(e))
        raise


def process_supplier_batch(db, suppliers: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Process a batch of suppliers.
    
    Returns:
        Tuple of (inserted_count, updated_count)
    """
    inserted = 0
    updated = 0
    
    for supplier in suppliers:
        try:
            # Canonicalize name
            canon_data = canonicalize(supplier["name_raw"])
            
            # Get embedding if enabled
            embedding = None
            if settings.embeddings_provider != "none":
                embedding = get_embedding(canon_data["canon"])
            
            # Check if exists
            existing = db.execute(
                text("""
                    SELECT payee_id 
                    FROM payees 
                    WHERE bq_supplier_id = :bq_id
                """),
                {"bq_id": supplier["bq_supplier_id"]}
            ).first()
            
            if existing:
                # Update existing
                params = {
                    "payee_id": existing[0],
                    "name_raw": supplier["name_raw"],
                    "name_canon": canon_data["canon"],
                    "name_tokens": canon_data["tokens"],
                    "dm_codes": canon_data["dm_codes"],
                    "address": supplier.get("address"),
                    "city": supplier.get("city"),
                    "state": supplier.get("state"),
                    "zip_code": supplier.get("zip_code"),
                    "country": supplier.get("country"),
                    "bq_sync_date": datetime.utcnow()
                }
                
                if embedding is not None:
                    params["name_vec"] = f"[{','.join(map(str, embedding.tolist()))}]"
                    
                    db.execute(
                        text("""
                            UPDATE payees
                            SET name_raw = :name_raw,
                                name_canon = :name_canon,
                                name_tokens = :name_tokens,
                                dm_codes = :dm_codes,
                                name_vec = :name_vec::vector,
                                address = :address,
                                city = :city,
                                state = :state,
                                zip_code = :zip_code,
                                country = :country,
                                bq_sync_date = :bq_sync_date,
                                updated_at = NOW()
                            WHERE payee_id = :payee_id
                        """),
                        params
                    )
                else:
                    db.execute(
                        text("""
                            UPDATE payees
                            SET name_raw = :name_raw,
                                name_canon = :name_canon,
                                name_tokens = :name_tokens,
                                dm_codes = :dm_codes,
                                address = :address,
                                city = :city,
                                state = :state,
                                zip_code = :zip_code,
                                country = :country,
                                bq_sync_date = :bq_sync_date,
                                updated_at = NOW()
                            WHERE payee_id = :payee_id
                        """),
                        params
                    )
                
                updated += 1
            else:
                # Insert new
                params = {
                    "bq_supplier_id": supplier["bq_supplier_id"],
                    "name_raw": supplier["name_raw"],
                    "name_canon": canon_data["canon"],
                    "name_tokens": canon_data["tokens"],
                    "dm_codes": canon_data["dm_codes"],
                    "address": supplier.get("address"),
                    "city": supplier.get("city"),
                    "state": supplier.get("state"),
                    "zip_code": supplier.get("zip_code"),
                    "country": supplier.get("country"),
                    "bq_sync_date": datetime.utcnow()
                }
                
                if embedding is not None:
                    params["name_vec"] = f"[{','.join(map(str, embedding.tolist()))}]"
                    
                    db.execute(
                        text("""
                            INSERT INTO payees 
                            (bq_supplier_id, name_raw, name_canon, name_tokens, dm_codes, 
                             name_vec, address, city, state, zip_code, country, bq_sync_date)
                            VALUES 
                            (:bq_supplier_id, :name_raw, :name_canon, :name_tokens, :dm_codes,
                             :name_vec::vector, :address, :city, :state, :zip_code, :country, :bq_sync_date)
                        """),
                        params
                    )
                else:
                    db.execute(
                        text("""
                            INSERT INTO payees 
                            (bq_supplier_id, name_raw, name_canon, name_tokens, dm_codes,
                             address, city, state, zip_code, country, bq_sync_date)
                            VALUES 
                            (:bq_supplier_id, :name_raw, :name_canon, :name_tokens, :dm_codes,
                             :address, :city, :state, :zip_code, :country, :bq_sync_date)
                        """),
                        params
                    )
                
                inserted += 1
                
        except Exception as e:
            logger.error(
                "supplier_process_failed",
                supplier_id=supplier.get("bq_supplier_id"),
                error=str(e)
            )
    
    # Commit the batch
    db.commit()
    
    return inserted, updated


def get_supplier_count() -> int:
    """Get count of suppliers in database."""
    with get_db() as db:
        result = db.execute(
            text("SELECT COUNT(*) FROM payees")
        ).scalar()
        return result or 0