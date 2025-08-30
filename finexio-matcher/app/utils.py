"""Utility functions for embeddings and other operations."""

import hashlib
import json
from functools import lru_cache
from typing import Optional, List
import numpy as np
import structlog

from app.config import settings
from app.db import get_db
from sqlalchemy import text

logger = structlog.get_logger()

# In-memory LRU cache for embeddings
@lru_cache(maxsize=10000)
def _embedding_cache(text_hash: str) -> Optional[np.ndarray]:
    """In-memory embedding cache."""
    return None


def get_text_hash(text: str) -> str:
    """Get SHA256 hash of text for caching."""
    return hashlib.sha256(text.encode()).hexdigest()


def get_embedding(text: str) -> np.ndarray:
    """
    Get embedding for text using configured provider.
    
    Args:
        text: Canonicalized text to embed
        
    Returns:
        Numpy array of embedding
    """
    if not text:
        return np.zeros(settings.embedding_dim)
    
    text_hash = get_text_hash(text)
    
    # Check in-memory cache first
    cached = _embedding_cache(text_hash)
    if cached is not None:
        return cached
    
    # Check database cache
    with get_db() as db:
        result = db.execute(
            text("""
                SELECT embedding 
                FROM embedding_cache 
                WHERE text_hash = :hash
                  AND provider = :provider
                  AND model = :model
            """),
            {
                "hash": text_hash,
                "provider": settings.embeddings_provider,
                "model": settings.embedding_model
            }
        ).first()
        
        if result and result[0]:
            embedding = np.array(result[0])
            _embedding_cache.cache_clear()
            _embedding_cache.__wrapped__(text_hash, embedding)
            return embedding
    
    # Generate new embedding
    if settings.embeddings_provider == "openai":
        embedding = get_openai_embedding(text)
    else:
        embedding = get_local_embedding(text)
    
    # Cache in database
    cache_embedding(text_hash, text, embedding)
    
    # Update in-memory cache
    _embedding_cache.cache_clear()
    _embedding_cache.__wrapped__(text_hash, embedding)
    
    return embedding


def get_openai_embedding(text: str) -> np.ndarray:
    """Get embedding using OpenAI API."""
    if not settings.openai_api_key:
        logger.warning("openai_key_missing", fallback="local")
        return get_local_embedding(text)
    
    try:
        import openai
        client = openai.OpenAI(api_key=settings.openai_api_key)
        
        response = client.embeddings.create(
            model=settings.embedding_model,
            input=text,
            dimensions=settings.embedding_dim
        )
        
        embedding = np.array(response.data[0].embedding)
        return embedding
        
    except Exception as e:
        logger.error("openai_embedding_failed", error=str(e))
        return get_local_embedding(text)


def get_local_embedding(text: str) -> np.ndarray:
    """
    Generate local embedding using random projection.
    This is a placeholder for offline development.
    """
    # Simple hash-based random projection
    np.random.seed(hash(text) % (2**32))
    embedding = np.random.randn(settings.embedding_dim)
    
    # Normalize to unit vector
    norm = np.linalg.norm(embedding)
    if norm > 0:
        embedding = embedding / norm
    
    return embedding


def cache_embedding(text_hash: str, text: str, embedding: np.ndarray):
    """Cache embedding in database."""
    try:
        with get_db() as db:
            db.execute(
                text("""
                    INSERT INTO embedding_cache 
                    (text_hash, text_canon, embedding, provider, model)
                    VALUES (:hash, :text, :embedding, :provider, :model)
                    ON CONFLICT (text_hash) DO NOTHING
                """),
                {
                    "hash": text_hash,
                    "text": text,
                    "embedding": embedding.tolist(),
                    "provider": settings.embeddings_provider,
                    "model": settings.embedding_model
                }
            )
            db.commit()
    except Exception as e:
        logger.error("cache_embedding_failed", error=str(e))


def cosine_similarity(vec1: np.ndarray, vec2: np.ndarray) -> float:
    """Calculate cosine similarity between two vectors."""
    if vec1.size == 0 or vec2.size == 0:
        return 0.0
    
    dot_product = np.dot(vec1, vec2)
    norm1 = np.linalg.norm(vec1)
    norm2 = np.linalg.norm(vec2)
    
    if norm1 == 0 or norm2 == 0:
        return 0.0
    
    return float(dot_product / (norm1 * norm2))


def compute_idf(corpus_tokens: List[List[str]]) -> dict:
    """Compute IDF scores for tokens in corpus."""
    from collections import Counter
    import math
    
    doc_count = len(corpus_tokens)
    if doc_count == 0:
        return {}
    
    # Count document frequency for each token
    df = Counter()
    for tokens in corpus_tokens:
        for token in set(tokens):
            df[token] += 1
    
    # Compute IDF
    idf = {}
    for token, freq in df.items():
        idf[token] = math.log(doc_count / freq)
    
    return idf


def batch_process(items: List, func, workers: int = 8, chunk_size: int = 100):
    """Process items in parallel batches."""
    from concurrent.futures import ThreadPoolExecutor, as_completed
    import math
    
    results = []
    chunks = []
    
    # Split into chunks
    for i in range(0, len(items), chunk_size):
        chunks.append(items[i:i + chunk_size])
    
    # Process chunks in parallel
    with ThreadPoolExecutor(max_workers=workers) as executor:
        futures = {executor.submit(func, chunk): i 
                   for i, chunk in enumerate(chunks)}
        
        for future in as_completed(futures):
            try:
                result = future.result()
                results.extend(result)
            except Exception as e:
                logger.error("batch_process_error", error=str(e))
    
    return results