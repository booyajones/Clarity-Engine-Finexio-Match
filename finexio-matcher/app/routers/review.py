"""Review queue management endpoints."""

from typing import Optional
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
import json
import structlog
from sqlalchemy import text

from app.config import settings
from app.db import get_db

router = APIRouter()
logger = structlog.get_logger()

# Setup templates if UI enabled
templates = None
if settings.enable_review_ui:
    import os
    template_dir = os.path.join(os.path.dirname(__file__), "..", "ui", "templates")
    if os.path.exists(template_dir):
        templates = Jinja2Templates(directory=template_dir)


class ReviewDecision(BaseModel):
    """Decision for review item."""
    approved: bool
    payee_id: Optional[int] = None
    notes: Optional[str] = None


@router.get("/open")
async def get_open_reviews(limit: int = 100):
    """
    Get open review items.
    
    Returns items that need human review for matching decisions.
    """
    with get_db() as db:
        result = db.execute(
            text("""
                SELECT rq_id, q_name_raw, q_name_canon, candidates, created_at
                FROM review_queue
                WHERE status = 'open'
                ORDER BY created_at DESC
                LIMIT :limit
            """),
            {"limit": limit}
        ).fetchall()
        
        items = []
        for row in result:
            items.append({
                "rq_id": row[0],
                "query_name": row[1],
                "canonical_name": row[2],
                "candidates": json.loads(row[3]) if row[3] else [],
                "created_at": row[4].isoformat()
            })
        
        return {
            "count": len(items),
            "items": items
        }


@router.post("/{rq_id}/approve")
async def approve_match(rq_id: int, decision: ReviewDecision):
    """
    Approve a match from the review queue.
    
    This confirms the match and adds it to training data.
    """
    with get_db() as db:
        # Get review item
        review = db.execute(
            text("""
                SELECT q_name_raw, q_name_canon, candidates
                FROM review_queue
                WHERE rq_id = :id AND status = 'open'
            """),
            {"id": rq_id}
        ).first()
        
        if not review:
            raise HTTPException(status_code=404, detail="Review item not found")
        
        # Add to labels for training
        if decision.approved and decision.payee_id:
            db.execute(
                text("""
                    INSERT INTO labels 
                    (q_name_raw, q_name_canon, c_payee_id, y, meta)
                    VALUES (:raw, :canon, :payee_id, true, :meta::jsonb)
                """),
                {
                    "raw": review[0],
                    "canon": review[1],
                    "payee_id": decision.payee_id,
                    "meta": json.dumps({"notes": decision.notes})
                }
            )
        
        # Update review status
        db.execute(
            text("""
                UPDATE review_queue
                SET status = 'approved',
                    reviewed_at = NOW()
                WHERE rq_id = :id
            """),
            {"id": rq_id}
        )
        
        db.commit()
        
        logger.info("review_approved", rq_id=rq_id, payee_id=decision.payee_id)
        
        return {"status": "approved", "rq_id": rq_id}


@router.post("/{rq_id}/reject")
async def reject_match(rq_id: int, decision: ReviewDecision):
    """
    Reject a match from the review queue.
    
    This indicates the suggested match is incorrect.
    """
    with get_db() as db:
        # Get review item
        review = db.execute(
            text("""
                SELECT q_name_raw, q_name_canon, candidates
                FROM review_queue
                WHERE rq_id = :id AND status = 'open'
            """),
            {"id": rq_id}
        ).first()
        
        if not review:
            raise HTTPException(status_code=404, detail="Review item not found")
        
        # Add negative label for training if a specific payee was rejected
        if decision.payee_id:
            db.execute(
                text("""
                    INSERT INTO labels 
                    (q_name_raw, q_name_canon, c_payee_id, y, meta)
                    VALUES (:raw, :canon, :payee_id, false, :meta::jsonb)
                """),
                {
                    "raw": review[0],
                    "canon": review[1],
                    "payee_id": decision.payee_id,
                    "meta": json.dumps({"notes": decision.notes})
                }
            )
        
        # Update review status
        db.execute(
            text("""
                UPDATE review_queue
                SET status = 'rejected',
                    reviewed_at = NOW()
                WHERE rq_id = :id
            """),
            {"id": rq_id}
        )
        
        db.commit()
        
        logger.info("review_rejected", rq_id=rq_id)
        
        return {"status": "rejected", "rq_id": rq_id}


@router.get("/ui", response_class=HTMLResponse)
async def review_ui(request: Request):
    """
    Review UI for managing the queue.
    
    Simple interface for approving/rejecting matches.
    """
    if not templates:
        return HTMLResponse("Review UI not enabled")
    
    # Get open reviews
    reviews = await get_open_reviews(limit=50)
    
    return templates.TemplateResponse(
        "review.html",
        {"request": request, "reviews": reviews}
    )