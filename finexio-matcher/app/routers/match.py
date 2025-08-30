"""Matching API endpoints."""

from typing import List, Optional
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
import json
import structlog

from app.matching import match_one, match_batch

router = APIRouter()
logger = structlog.get_logger()


class MatchRequest(BaseModel):
    """Request for single match."""
    name: str


class BatchMatchRequest(BaseModel):
    """Request for batch matching."""
    names: List[str]
    stream: bool = True


class MatchResponse(BaseModel):
    """Response for match result."""
    decision: str  # auto_match, needs_review, no_match
    confidence: float
    matched_payee: Optional[dict] = None
    candidates: List[dict] = []
    reason: Optional[str] = None


@router.post("/", response_model=MatchResponse)
async def match_single(request: MatchRequest):
    """
    Match a single payee name.
    
    Returns the best match with confidence score and decision.
    """
    try:
        result = match_one(request.name)
        return result
    except Exception as e:
        logger.error("match_failed", name=request.name, error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/batch")
async def match_batch_endpoint(request: BatchMatchRequest):
    """
    Match multiple payee names in batch.
    
    Can return results as streaming NDJSON or as a complete JSON array.
    """
    try:
        if request.stream:
            # Stream results as NDJSON
            def generate():
                for name in request.names:
                    result = match_one(name)
                    yield json.dumps({
                        "query": name,
                        **result
                    }) + "\n"
            
            return StreamingResponse(
                generate(),
                media_type="application/x-ndjson"
            )
        else:
            # Return complete results
            results = match_batch(request.names, stream=False)
            return results
            
    except Exception as e:
        logger.error("batch_match_failed", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))