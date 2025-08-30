"""Ingest endpoints for loading payee data."""

import io
import csv
from typing import List, Optional
from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks
from pydantic import BaseModel
import structlog

from app.bigquery_sync import sync_suppliers_from_bigquery
from app.db import get_db
from app.canonicalize import canonicalize
from app.utils import get_embedding
from sqlalchemy import text

router = APIRouter()
logger = structlog.get_logger()


class PayeeInput(BaseModel):
    """Input model for single payee."""
    payee_id: Optional[str] = None
    name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = None


class IngestRequest(BaseModel):
    """Request model for batch ingest."""
    payees: List[PayeeInput]


class BigQuerySyncRequest(BaseModel):
    """Request for BigQuery sync."""
    batch_size: int = 1000
    limit: Optional[int] = None


@router.post("/ingest")
async def ingest_payees(request: IngestRequest):
    """
    Ingest payees into the database.
    
    This endpoint accepts a list of payees and adds them to the network.
    """
    inserted = 0
    updated = 0
    errors = []
    
    with get_db() as db:
        for payee in request.payees:
            try:
                # Canonicalize name
                canon_data = canonicalize(payee.name)
                
                # Get embedding if enabled
                from app.config import settings
                embedding = None
                if settings.embeddings_provider != "none":
                    embedding = get_embedding(canon_data["canon"])
                
                # Check if exists (by external ID if provided)
                existing = None
                if payee.payee_id:
                    existing = db.execute(
                        text("""
                            SELECT payee_id 
                            FROM payees 
                            WHERE bq_supplier_id = :external_id
                        """),
                        {"external_id": payee.payee_id}
                    ).first()
                
                if existing:
                    # Update existing
                    params = {
                        "payee_id": existing[0],
                        "name_raw": payee.name,
                        "name_canon": canon_data["canon"],
                        "name_tokens": canon_data["tokens"],
                        "dm_codes": canon_data["dm_codes"],
                        "address": payee.address,
                        "city": payee.city,
                        "state": payee.state,
                        "zip_code": payee.zip_code,
                        "country": payee.country
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
                                    updated_at = NOW()
                                WHERE payee_id = :payee_id
                            """),
                            params
                        )
                    
                    updated += 1
                else:
                    # Insert new
                    params = {
                        "bq_supplier_id": payee.payee_id,
                        "name_raw": payee.name,
                        "name_canon": canon_data["canon"],
                        "name_tokens": canon_data["tokens"],
                        "dm_codes": canon_data["dm_codes"],
                        "address": payee.address,
                        "city": payee.city,
                        "state": payee.state,
                        "zip_code": payee.zip_code,
                        "country": payee.country
                    }
                    
                    if embedding is not None:
                        params["name_vec"] = f"[{','.join(map(str, embedding.tolist()))}]"
                        
                        db.execute(
                            text("""
                                INSERT INTO payees 
                                (bq_supplier_id, name_raw, name_canon, name_tokens, dm_codes,
                                 name_vec, address, city, state, zip_code, country)
                                VALUES 
                                (:bq_supplier_id, :name_raw, :name_canon, :name_tokens, :dm_codes,
                                 :name_vec::vector, :address, :city, :state, :zip_code, :country)
                            """),
                            params
                        )
                    else:
                        db.execute(
                            text("""
                                INSERT INTO payees 
                                (bq_supplier_id, name_raw, name_canon, name_tokens, dm_codes,
                                 address, city, state, zip_code, country)
                                VALUES 
                                (:bq_supplier_id, :name_raw, :name_canon, :name_tokens, :dm_codes,
                                 :address, :city, :state, :zip_code, :country)
                            """),
                            params
                        )
                    
                    inserted += 1
                    
            except Exception as e:
                logger.error("payee_ingest_failed", name=payee.name, error=str(e))
                errors.append({"name": payee.name, "error": str(e)})
        
        # Commit all changes
        db.commit()
    
    return {
        "inserted": inserted,
        "updated": updated,
        "errors": errors,
        "success": len(errors) == 0
    }


@router.post("/ingest/csv")
async def ingest_csv(file: UploadFile = File(...)):
    """
    Ingest payees from CSV file.
    
    Expected columns: name, address, city, state, zip_code, country
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="File must be CSV")
    
    contents = await file.read()
    csv_reader = csv.DictReader(io.StringIO(contents.decode()))
    
    payees = []
    for row in csv_reader:
        payees.append(PayeeInput(
            payee_id=row.get('payee_id'),
            name=row.get('name') or row.get('supplier_name') or row.get('payee_name'),
            address=row.get('address'),
            city=row.get('city'),
            state=row.get('state'),
            zip_code=row.get('zip_code') or row.get('zip'),
            country=row.get('country')
        ))
    
    request = IngestRequest(payees=payees)
    return await ingest_payees(request)


@router.post("/sync/bigquery")
async def sync_bigquery(
    background_tasks: BackgroundTasks,
    request: BigQuerySyncRequest
):
    """
    Sync suppliers from BigQuery.
    
    This runs in the background and imports all suppliers from the
    configured BigQuery table.
    """
    # Run sync in background
    background_tasks.add_task(
        sync_suppliers_from_bigquery,
        batch_size=request.batch_size,
        limit=request.limit
    )
    
    return {
        "message": "BigQuery sync started in background",
        "batch_size": request.batch_size,
        "limit": request.limit
    }