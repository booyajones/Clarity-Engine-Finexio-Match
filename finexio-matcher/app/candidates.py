"""Candidate generation using multiple complementary views."""

from typing import List, Tuple, Dict, Any
import numpy as np
from sqlalchemy import text
from sqlalchemy.orm import Session
import structlog

from app.config import settings
from app.utils import get_embedding, cosine_similarity
from app.canonicalize import canonicalize

logger = structlog.get_logger()


def get_trigram_candidates(
    db: Session, 
    query_canon: str, 
    limit: int = None
) -> List[Tuple[int, float, str]]:
    """
    Get candidates using PostgreSQL trigram similarity.
    
    Returns:
        List of (payee_id, score, source) tuples
    """
    limit = limit or settings.topk_trigram
    
    try:
        result = db.execute(
            text("""
                SELECT 
                    payee_id,
                    name_canon,
                    similarity(name_canon, :query) AS score
                FROM payees
                WHERE name_canon % :query  -- Uses trigram index
                ORDER BY score DESC
                LIMIT :limit
            """),
            {"query": query_canon, "limit": limit}
        ).fetchall()
        
        candidates = [
            (row[0], row[2], f"trgm:{row[2]:.3f}")
            for row in result
        ]
        
        logger.debug("trigram_candidates", count=len(candidates))
        return candidates
        
    except Exception as e:
        logger.error("trigram_candidates_failed", error=str(e))
        return []


def get_vector_candidates(
    db: Session,
    query_canon: str,
    limit: int = None
) -> List[Tuple[int, float, str]]:
    """
    Get candidates using vector similarity search.
    
    Returns:
        List of (payee_id, score, source) tuples
    """
    limit = limit or settings.topk_vector
    
    # Get embedding for query
    query_vec = get_embedding(query_canon)
    
    if query_vec.size == 0:
        return []
    
    try:
        # Convert numpy array to PostgreSQL array format
        vec_str = f"[{','.join(map(str, query_vec.tolist()))}]"
        
        result = db.execute(
            text("""
                SELECT 
                    payee_id,
                    name_canon,
                    1 - (name_vec <=> :query_vec::vector) AS cos_sim
                FROM payees
                WHERE name_vec IS NOT NULL
                ORDER BY name_vec <=> :query_vec::vector
                LIMIT :limit
            """),
            {"query_vec": vec_str, "limit": limit}
        ).fetchall()
        
        candidates = [
            (row[0], row[2], f"vec:{row[2]:.3f}")
            for row in result
        ]
        
        logger.debug("vector_candidates", count=len(candidates))
        return candidates
        
    except Exception as e:
        logger.error("vector_candidates_failed", error=str(e))
        return []


def get_phonetic_candidates(
    db: Session,
    query_data: Dict[str, Any],
    limit: int = None
) -> List[Tuple[int, float, str]]:
    """
    Get candidates using phonetic (Double Metaphone) matching.
    
    Returns:
        List of (payee_id, score, source) tuples
    """
    limit = limit or settings.topk_phonetic
    dm_codes = query_data.get("dm_codes", [])
    
    if not dm_codes:
        return []
    
    try:
        # Get candidates with overlapping phonetic codes
        result = db.execute(
            text("""
                SELECT 
                    payee_id,
                    name_canon,
                    dm_codes,
                    array_length(
                        ARRAY(
                            SELECT unnest(dm_codes) 
                            INTERSECT 
                            SELECT unnest(:codes::text[])
                        ), 1
                    ) AS overlap_count
                FROM payees
                WHERE dm_codes && :codes::text[]  -- Has overlap
                ORDER BY overlap_count DESC NULLS LAST
                LIMIT :limit
            """),
            {"codes": dm_codes, "limit": limit}
        ).fetchall()
        
        candidates = []
        for row in result:
            if row[3]:  # overlap_count
                # Calculate Jaccard similarity
                payee_codes = set(row[2]) if row[2] else set()
                query_codes = set(dm_codes)
                
                if payee_codes and query_codes:
                    intersection = len(payee_codes & query_codes)
                    union = len(payee_codes | query_codes)
                    jaccard = intersection / union if union > 0 else 0
                    
                    candidates.append(
                        (row[0], jaccard, f"dm:{jaccard:.3f}")
                    )
        
        # Sort by score and limit
        candidates.sort(key=lambda x: x[1], reverse=True)
        candidates = candidates[:limit]
        
        logger.debug("phonetic_candidates", count=len(candidates))
        return candidates
        
    except Exception as e:
        logger.error("phonetic_candidates_failed", error=str(e))
        return []


def get_exact_match(
    db: Session,
    query_canon: str
) -> List[Tuple[int, float, str]]:
    """
    Check for exact canonical match (fast path).
    
    Returns:
        List with single match if found, empty otherwise
    """
    try:
        result = db.execute(
            text("""
                SELECT payee_id, name_canon
                FROM payees
                WHERE name_canon = :query
                LIMIT 1
            """),
            {"query": query_canon}
        ).first()
        
        if result:
            return [(result[0], 1.0, "exact:1.000")]
        
        return []
        
    except Exception as e:
        logger.error("exact_match_failed", error=str(e))
        return []


def union_candidates(
    candidates_lists: List[List[Tuple[int, float, str]]],
    k_union: int = None
) -> List[Dict[str, Any]]:
    """
    Union and deduplicate candidates from multiple sources.
    
    Returns:
        List of candidate dicts with aggregated scores
    """
    k_union = k_union or settings.k_union
    
    # Aggregate by payee_id
    payee_scores = {}
    
    for candidates in candidates_lists:
        for payee_id, score, source in candidates:
            if payee_id not in payee_scores:
                payee_scores[payee_id] = {
                    "payee_id": payee_id,
                    "scores": {},
                    "sources": []
                }
            
            # Extract source type and score
            source_type = source.split(":")[0]
            payee_scores[payee_id]["scores"][source_type] = score
            payee_scores[payee_id]["sources"].append(source)
    
    # Calculate aggregate score (max of normalized scores)
    for payee_data in payee_scores.values():
        scores = list(payee_data["scores"].values())
        payee_data["max_score"] = max(scores) if scores else 0
        payee_data["avg_score"] = sum(scores) / len(scores) if scores else 0
        payee_data["num_sources"] = len(scores)
    
    # Sort by max score and return top K
    candidates = sorted(
        payee_scores.values(),
        key=lambda x: (x["max_score"], x["num_sources"]),
        reverse=True
    )[:k_union]
    
    logger.info(
        "candidates_union",
        total_unique=len(payee_scores),
        returned=len(candidates)
    )
    
    return candidates


def get_candidates(
    db: Session,
    query_name: str
) -> List[Dict[str, Any]]:
    """
    Get all candidates for a query name using multiple methods.
    
    Returns:
        List of candidate dictionaries with scores and metadata
    """
    # Canonicalize query
    query_data = canonicalize(query_name)
    query_canon = query_data["canon"]
    
    if not query_canon:
        return []
    
    # Check for exact match first (fast path)
    exact = get_exact_match(db, query_canon)
    if exact:
        return [{
            "payee_id": exact[0][0],
            "scores": {"exact": 1.0},
            "sources": [exact[0][2]],
            "max_score": 1.0,
            "avg_score": 1.0,
            "num_sources": 1
        }]
    
    # Get candidates from each method
    candidates_lists = []
    
    # Trigram candidates
    trigram = get_trigram_candidates(db, query_canon)
    if trigram:
        candidates_lists.append(trigram)
    
    # Vector candidates (if embeddings enabled)
    if settings.embeddings_provider != "none":
        vector = get_vector_candidates(db, query_canon)
        if vector:
            candidates_lists.append(vector)
    
    # Phonetic candidates
    phonetic = get_phonetic_candidates(db, query_data)
    if phonetic:
        candidates_lists.append(phonetic)
    
    # Union and deduplicate
    return union_candidates(candidates_lists)