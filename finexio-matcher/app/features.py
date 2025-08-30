"""Feature engineering for candidate pairs."""

import json
from typing import Dict, List, Tuple, Any
import numpy as np
from rapidfuzz import fuzz, distance
import structlog

from app.canonicalize import canonicalize, extract_initials
from app.utils import cosine_similarity

logger = structlog.get_logger()

# Global IDF cache (populated at startup)
IDF_CACHE = {}


def load_idf_cache(db):
    """Load IDF scores from database at startup."""
    global IDF_CACHE
    
    try:
        from sqlalchemy import text
        
        # Get all tokens from payees
        result = db.execute(
            text("SELECT name_tokens FROM payees WHERE name_tokens IS NOT NULL")
        ).fetchall()
        
        # Count document frequency
        token_df = {}
        total_docs = 0
        
        for row in result:
            tokens = set(row[0]) if row[0] else set()
            total_docs += 1
            for token in tokens:
                token_df[token] = token_df.get(token, 0) + 1
        
        # Calculate IDF
        import math
        for token, df in token_df.items():
            IDF_CACHE[token] = math.log(total_docs / df) if df > 0 else 0
        
        logger.info("idf_cache_loaded", tokens=len(IDF_CACHE), docs=total_docs)
        
    except Exception as e:
        logger.error("idf_cache_failed", error=str(e))


def compute_features(
    query_name: str,
    candidate_record: Dict[str, Any],
    candidate_scores: Dict[str, float] = None
) -> Tuple[np.ndarray, Dict[str, float]]:
    """
    Compute features for a (query, candidate) pair.
    
    Args:
        query_name: Raw query name
        candidate_record: Candidate payee record from DB
        candidate_scores: Scores from candidate generation
        
    Returns:
        Tuple of (feature_vector, feature_dict)
    """
    features = {}
    
    # Canonicalize query
    q_data = canonicalize(query_name)
    q_canon = q_data["canon"]
    q_tokens = set(q_data["tokens"])
    q_dm = set(q_data["dm_codes"])
    
    # Get candidate data
    c_canon = candidate_record.get("name_canon", "")
    c_tokens = set(candidate_record.get("name_tokens", []))
    c_dm = set(candidate_record.get("dm_codes", []))
    c_raw = candidate_record.get("name_raw", "")
    
    # === RapidFuzz String Similarity Features ===
    
    # Token-based similarities
    features["token_set_ratio"] = fuzz.token_set_ratio(q_canon, c_canon) / 100.0
    features["token_sort_ratio"] = fuzz.token_sort_ratio(q_canon, c_canon) / 100.0
    features["partial_ratio"] = fuzz.partial_ratio(q_canon, c_canon) / 100.0
    
    # Character-based similarities
    features["ratio"] = fuzz.ratio(q_canon, c_canon) / 100.0
    features["partial_token_ratio"] = fuzz.partial_token_ratio(q_canon, c_canon) / 100.0
    
    # Distance metrics
    features["levenshtein"] = 1.0 - (distance.Levenshtein.normalized_distance(q_canon, c_canon))
    features["jaro_winkler"] = distance.JaroWinkler.similarity(q_canon, c_canon)
    features["hamming"] = 1.0 - (distance.Hamming.normalized_distance(q_canon, c_canon))
    
    # === Candidate Generation Scores ===
    if candidate_scores:
        features["trgm_score"] = candidate_scores.get("trgm", 0.0)
        features["vec_score"] = candidate_scores.get("vec", 0.0)
        features["dm_score"] = candidate_scores.get("dm", 0.0)
        features["num_sources"] = len([v for v in candidate_scores.values() if v > 0])
    else:
        features["trgm_score"] = 0.0
        features["vec_score"] = 0.0
        features["dm_score"] = 0.0
        features["num_sources"] = 0
    
    # === Phonetic Features ===
    
    # Double Metaphone overlap
    if q_dm and c_dm:
        dm_intersection = len(q_dm & c_dm)
        dm_union = len(q_dm | c_dm)
        features["dm_jaccard"] = dm_intersection / dm_union if dm_union > 0 else 0
        features["dm_overlap_count"] = dm_intersection
        features["dm_overlap_ratio"] = dm_intersection / len(q_dm)
    else:
        features["dm_jaccard"] = 0.0
        features["dm_overlap_count"] = 0
        features["dm_overlap_ratio"] = 0.0
    
    # === Token-based Features ===
    
    # Token overlap
    if q_tokens and c_tokens:
        token_intersection = len(q_tokens & c_tokens)
        token_union = len(q_tokens | c_tokens)
        features["token_jaccard"] = token_intersection / token_union if token_union > 0 else 0
        features["token_overlap_count"] = token_intersection
        features["token_overlap_ratio"] = token_intersection / len(q_tokens)
    else:
        features["token_jaccard"] = 0.0
        features["token_overlap_count"] = 0
        features["token_overlap_ratio"] = 0.0
    
    # === Length Features ===
    
    features["len_diff_abs"] = abs(len(q_canon) - len(c_canon))
    features["len_ratio"] = min(len(q_canon), len(c_canon)) / max(len(q_canon), len(c_canon), 1)
    features["token_count_diff"] = abs(len(q_tokens) - len(c_tokens))
    features["token_count_ratio"] = min(len(q_tokens), len(c_tokens)) / max(len(q_tokens), len(c_tokens), 1)
    
    # === Rare Token Features ===
    
    # IDF-weighted token overlap
    if IDF_CACHE and q_tokens and c_tokens:
        overlapping = q_tokens & c_tokens
        idf_sum = sum(IDF_CACHE.get(token, 0) for token in overlapping)
        max_idf_sum = sum(IDF_CACHE.get(token, 0) for token in q_tokens)
        features["idf_overlap"] = idf_sum / max_idf_sum if max_idf_sum > 0 else 0
    else:
        features["idf_overlap"] = 0.0
    
    # === Special Case Features ===
    
    # Initials matching
    q_initials = extract_initials(list(q_tokens))
    c_initials = extract_initials(list(c_tokens))
    features["initials_match"] = 1.0 if q_initials == c_initials else 0.0
    
    # Check if one is abbreviation of other
    features["is_abbreviation"] = check_abbreviation(q_canon, c_canon)
    
    # Check for common variations (e.g., "and" vs "&")
    features["has_common_variation"] = check_common_variations(q_canon, c_canon)
    
    # === Exact Match Features ===
    
    features["exact_match"] = 1.0 if q_canon == c_canon else 0.0
    features["exact_match_raw"] = 1.0 if query_name.lower().strip() == c_raw.lower().strip() else 0.0
    
    # Convert to numpy array (ensure consistent ordering)
    feature_names = sorted(features.keys())
    feature_vector = np.array([features[name] for name in feature_names])
    
    return feature_vector, features


def check_abbreviation(text1: str, text2: str) -> float:
    """Check if one text is likely an abbreviation of the other."""
    # Simple heuristic: shorter one should be significantly shorter
    # and all its characters should appear in order in the longer one
    
    if len(text1) == len(text2):
        return 0.0
    
    shorter = text1 if len(text1) < len(text2) else text2
    longer = text2 if len(text1) < len(text2) else text1
    
    # Length ratio check
    if len(shorter) > len(longer) * 0.5:
        return 0.0
    
    # Check if all chars of shorter appear in order in longer
    j = 0
    for char in shorter:
        if char == ' ':
            continue
        found = False
        while j < len(longer):
            if longer[j] == char:
                found = True
                j += 1
                break
            j += 1
        if not found:
            return 0.0
    
    return 1.0


def check_common_variations(text1: str, text2: str) -> float:
    """Check for common business name variations."""
    variations = [
        ("and", "&"),
        ("corporation", "corp"),
        ("incorporated", "inc"),
        ("limited", "ltd"),
        ("company", "co"),
        ("international", "intl"),
        ("national", "natl"),
        ("associates", "assoc"),
        ("management", "mgmt"),
        ("services", "svcs"),
    ]
    
    # Normalize both texts
    t1 = " " + text1.lower() + " "
    t2 = " " + text2.lower() + " "
    
    for long_form, short_form in variations:
        # Check both directions
        t1_normalized = t1.replace(f" {long_form} ", f" {short_form} ")
        t2_normalized = t2.replace(f" {long_form} ", f" {short_form} ")
        
        if t1_normalized.strip() == t2_normalized.strip():
            return 1.0
    
    return 0.0


def get_feature_names() -> List[str]:
    """Get ordered list of feature names."""
    # This should match the order in compute_features
    return sorted([
        "token_set_ratio", "token_sort_ratio", "partial_ratio",
        "ratio", "partial_token_ratio",
        "levenshtein", "jaro_winkler", "hamming",
        "trgm_score", "vec_score", "dm_score", "num_sources",
        "dm_jaccard", "dm_overlap_count", "dm_overlap_ratio",
        "token_jaccard", "token_overlap_count", "token_overlap_ratio",
        "len_diff_abs", "len_ratio", "token_count_diff", "token_count_ratio",
        "idf_overlap",
        "initials_match", "is_abbreviation", "has_common_variation",
        "exact_match", "exact_match_raw"
    ])