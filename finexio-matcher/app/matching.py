"""Main matching pipeline combining all components."""

from typing import Dict, List, Any, Optional
import json
import structlog
from sqlalchemy.orm import Session
from sqlalchemy import text

from app.config import settings
from app.db import get_db
from app.canonicalize import canonicalize
from app.candidates import get_candidates
from app.features import compute_features
from app.classifier import classifier
from app.utils import batch_process

logger = structlog.get_logger()


def match_one(
    name_raw: str,
    db: Session = None
) -> Dict[str, Any]:
    """
    Match a single payee name against the network.
    
    Args:
        name_raw: Raw payee name to match
        db: Database session (optional)
        
    Returns:
        Dict with decision, confidence, matched payee, and candidates
    """
    # Use provided db or get new one
    if db is None:
        with get_db() as db:
            return _match_one_internal(name_raw, db)
    else:
        return _match_one_internal(name_raw, db)


def _match_one_internal(name_raw: str, db: Session) -> Dict[str, Any]:
    """Internal matching logic."""
    
    # Canonicalize
    canon_data = canonicalize(name_raw)
    canon = canon_data["canon"]
    
    if not canon:
        return {
            "decision": "no_match",
            "confidence": 0.0,
            "matched_payee": None,
            "candidates": [],
            "reason": "Empty or invalid name"
        }
    
    # Get candidates
    candidates = get_candidates(db, name_raw)
    
    if not candidates:
        return {
            "decision": "no_match",
            "confidence": 0.0,
            "matched_payee": None,
            "candidates": [],
            "reason": "No candidates found"
        }
    
    # Score each candidate
    scored_candidates = []
    
    for candidate in candidates:
        # Get full candidate record
        payee_record = db.execute(
            text("""
                SELECT payee_id, name_raw, name_canon, name_tokens, 
                       dm_codes, bq_supplier_id, address, city, state
                FROM payees
                WHERE payee_id = :id
            """),
            {"id": candidate["payee_id"]}
        ).first()
        
        if not payee_record:
            continue
        
        # Convert to dict
        payee_dict = {
            "payee_id": payee_record[0],
            "name_raw": payee_record[1],
            "name_canon": payee_record[2],
            "name_tokens": payee_record[3],
            "dm_codes": payee_record[4],
            "bq_supplier_id": payee_record[5],
            "address": payee_record[6],
            "city": payee_record[7],
            "state": payee_record[8]
        }
        
        # Compute features
        features, feature_dict = compute_features(
            name_raw,
            payee_dict,
            candidate.get("scores", {})
        )
        
        # Get probability from classifier
        probability = classifier.predict_proba(features)
        
        # Get explanation
        top_features = classifier.explain(features, top_n=3)
        
        scored_candidates.append({
            "payee_id": payee_dict["payee_id"],
            "name": payee_dict["name_raw"],
            "bq_supplier_id": payee_dict["bq_supplier_id"],
            "probability": probability,
            "features": feature_dict,
            "top_features": top_features,
            "sources": candidate.get("sources", [])
        })
    
    # Sort by probability
    scored_candidates.sort(key=lambda x: x["probability"], reverse=True)
    
    # Get best match
    best = scored_candidates[0] if scored_candidates else None
    
    if not best:
        return {
            "decision": "no_match",
            "confidence": 0.0,
            "matched_payee": None,
            "candidates": [],
            "reason": "No viable candidates"
        }
    
    # Make decision based on thresholds
    confidence = best["probability"]
    
    if confidence >= settings.t_high:
        decision = "auto_match"
    elif confidence >= settings.t_low:
        decision = "needs_review"
    else:
        decision = "no_match"
    
    # Optional: Use LLM reranker for borderline cases
    if decision == "needs_review" and settings.rerank_provider == "openai":
        decision, confidence = rerank_with_llm(
            name_raw,
            scored_candidates[:5]
        )
    
    # Build response
    result = {
        "decision": decision,
        "confidence": confidence,
        "matched_payee": None,
        "candidates": scored_candidates[:5],  # Top 5 candidates
        "reason": None
    }
    
    if decision == "auto_match":
        result["matched_payee"] = {
            "payee_id": best["payee_id"],
            "name": best["name"],
            "bq_supplier_id": best["bq_supplier_id"]
        }
        result["reason"] = f"High confidence match ({confidence:.2%})"
    elif decision == "needs_review":
        result["reason"] = f"Borderline match ({confidence:.2%}), review needed"
        
        # Add to review queue
        add_to_review_queue(name_raw, canon, scored_candidates[:10], db)
    else:
        result["reason"] = f"Low confidence ({confidence:.2%})"
    
    # Log decision
    logger.info(
        "match_decision",
        query=canon,
        decision=decision,
        confidence=confidence,
        matched_id=best["payee_id"] if decision == "auto_match" else None,
        candidate_count=len(scored_candidates)
    )
    
    return result


def add_to_review_queue(
    name_raw: str,
    name_canon: str,
    candidates: List[Dict[str, Any]],
    db: Session
):
    """Add a borderline match to the review queue."""
    try:
        db.execute(
            text("""
                INSERT INTO review_queue 
                (q_name_raw, q_name_canon, candidates, status)
                VALUES (:raw, :canon, :candidates::jsonb, 'open')
            """),
            {
                "raw": name_raw,
                "canon": name_canon,
                "candidates": json.dumps(candidates)
            }
        )
        db.commit()
        logger.info("added_to_review", name=name_canon)
    except Exception as e:
        logger.error("review_queue_failed", error=str(e))


def rerank_with_llm(
    query_name: str,
    candidates: List[Dict[str, Any]]
) -> Tuple[str, float]:
    """
    Use LLM to rerank borderline matches.
    
    Returns:
        Tuple of (decision, confidence)
    """
    if not settings.openai_api_key:
        return "needs_review", candidates[0]["probability"]
    
    try:
        import openai
        client = openai.OpenAI(api_key=settings.openai_api_key)
        
        # Build prompt
        prompt = f"""Are these two payee names the same business entity?

Query: {query_name}
Candidate: {candidates[0]['name']}

Consider variations, abbreviations, and common business name differences.
Respond with JSON: {{"same": true/false, "confidence": 0.0-1.0, "reason": "..."}}"""
        
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": "You are an expert at business entity resolution."},
                {"role": "user", "content": prompt}
            ],
            response_format={"type": "json_object"},
            temperature=0.1
        )
        
        result = json.loads(response.choices[0].message.content)
        
        if result.get("same") and result.get("confidence", 0) >= 0.90:
            # LLM is confident they match
            return "auto_match", max(candidates[0]["probability"], result["confidence"])
        else:
            # Keep as review
            return "needs_review", candidates[0]["probability"]
            
    except Exception as e:
        logger.error("llm_rerank_failed", error=str(e))
        return "needs_review", candidates[0]["probability"]


def match_batch(
    names: List[str],
    stream: bool = True
) -> List[Dict[str, Any]]:
    """
    Match a batch of payee names.
    
    Args:
        names: List of payee names to match
        stream: Whether to stream results
        
    Returns:
        List of match results
    """
    logger.info("batch_match_started", count=len(names))
    
    # Process in chunks with parallelization
    def process_chunk(chunk):
        results = []
        with get_db() as db:
            for name in chunk:
                result = match_one(name, db)
                results.append({
                    "query": name,
                    **result
                })
        return results
    
    # Use batch processing utility
    results = batch_process(
        names,
        process_chunk,
        workers=settings.batch_workers,
        chunk_size=settings.batch_chunk_size
    )
    
    logger.info("batch_match_complete", count=len(results))
    
    return results