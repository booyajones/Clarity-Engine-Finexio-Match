"""Configuration management using Pydantic Settings."""

from typing import Optional
from pydantic_settings import BaseSettings
from pydantic import Field


class Settings(BaseSettings):
    """Application settings with environment variable support."""
    
    # Database
    database_url: str = Field(..., description="PostgreSQL connection URL")
    
    # BigQuery Configuration
    bigquery_project_id: Optional[str] = Field(None, description="BigQuery project ID")
    bigquery_dataset: Optional[str] = Field(None, description="BigQuery dataset name")
    bigquery_table: str = Field("finexio_suppliers", description="BigQuery table name")
    bigquery_credentials: Optional[str] = Field(None, description="Path to BigQuery credentials JSON")
    
    # OpenAI Configuration
    openai_api_key: Optional[str] = Field(None, description="OpenAI API key")
    
    # Embeddings Configuration
    embeddings_provider: str = Field("openai", description="Embeddings provider: openai or local")
    embedding_model: str = Field("text-embedding-3-large", description="OpenAI embedding model")
    embedding_dim: int = Field(1024, description="Embedding dimension")
    
    # Reranking Configuration
    rerank_provider: str = Field("none", description="Rerank provider: openai or none")
    
    # Matching Configuration
    topk_trigram: int = Field(50, description="Top K for trigram similarity")
    topk_vector: int = Field(50, description="Top K for vector similarity")
    topk_phonetic: int = Field(50, description="Top K for phonetic similarity")
    k_union: int = Field(120, description="Top K after union/dedupe")
    t_high: float = Field(0.97, description="Auto-match threshold")
    t_low: float = Field(0.60, description="Review threshold")
    
    # Performance Configuration
    batch_workers: int = Field(8, description="Number of batch workers")
    batch_chunk_size: int = Field(1000, description="Batch chunk size")
    
    # Application Configuration
    log_level: str = Field("INFO", description="Logging level")
    enable_review_ui: bool = Field(True, description="Enable review UI")
    
    class Config:
        env_file = ".env"
        case_sensitive = False


# Global settings instance
settings = Settings()