"""Machine learning classifier for match scoring."""

import os
import json
import numpy as np
from typing import List, Dict, Any, Tuple
import joblib
from sklearn.linear_model import LogisticRegression
from sklearn.calibration import CalibratedClassifierCV
import structlog

from app.features import get_feature_names

logger = structlog.get_logger()

MODEL_PATH = "artifacts/model.joblib"
FEATURE_NAMES_PATH = "artifacts/feature_names.json"


class PayeeClassifier:
    """Classifier for payee matching."""
    
    def __init__(self):
        """Initialize classifier."""
        self.model = None
        self.feature_names = None
        self.is_trained = False
        
        # Try to load existing model
        self.load_model()
        
        # If no model, use heuristic
        if not self.is_trained:
            logger.info("using_heuristic_classifier")
    
    def load_model(self):
        """Load trained model from disk."""
        if os.path.exists(MODEL_PATH) and os.path.exists(FEATURE_NAMES_PATH):
            try:
                self.model = joblib.load(MODEL_PATH)
                with open(FEATURE_NAMES_PATH, 'r') as f:
                    self.feature_names = json.load(f)
                self.is_trained = True
                logger.info("model_loaded", path=MODEL_PATH)
            except Exception as e:
                logger.error("model_load_failed", error=str(e))
                self.is_trained = False
    
    def save_model(self):
        """Save trained model to disk."""
        if self.model and self.feature_names:
            os.makedirs("artifacts", exist_ok=True)
            joblib.dump(self.model, MODEL_PATH)
            with open(FEATURE_NAMES_PATH, 'w') as f:
                json.dump(self.feature_names, f)
            logger.info("model_saved", path=MODEL_PATH)
    
    def train(self, X: np.ndarray, y: np.ndarray, feature_names: List[str]):
        """
        Train the classifier on labeled data.
        
        Args:
            X: Feature matrix
            y: Labels (1 = match, 0 = no match)
            feature_names: Names of features
        """
        logger.info("training_classifier", samples=len(X))
        
        # Train logistic regression
        base_model = LogisticRegression(
            class_weight='balanced',
            max_iter=1000,
            random_state=42
        )
        
        # Wrap with calibration
        self.model = CalibratedClassifierCV(
            base_model,
            method='isotonic',
            cv=3
        )
        
        self.model.fit(X, y)
        self.feature_names = feature_names
        self.is_trained = True
        
        # Save model
        self.save_model()
        
        logger.info("classifier_trained")
    
    def predict_proba(self, features: np.ndarray) -> float:
        """
        Predict probability of match.
        
        Args:
            features: Feature vector
            
        Returns:
            Probability of match (0-1)
        """
        if self.is_trained and self.model:
            # Use trained model
            try:
                # Ensure 2D array
                if features.ndim == 1:
                    features = features.reshape(1, -1)
                
                proba = self.model.predict_proba(features)[0, 1]
                return float(proba)
            except Exception as e:
                logger.error("prediction_failed", error=str(e))
                return self.heuristic_score(features)
        else:
            # Use heuristic
            return self.heuristic_score(features)
    
    def heuristic_score(self, features: np.ndarray) -> float:
        """
        Heuristic scoring when no model is available.
        
        This provides a reasonable baseline using hand-tuned weights.
        """
        # Get feature dict for easier access
        feature_names = get_feature_names()
        if features.ndim == 1:
            feature_dict = dict(zip(feature_names, features))
        else:
            feature_dict = dict(zip(feature_names, features[0]))
        
        # Exact match - highest confidence
        if feature_dict.get("exact_match", 0) == 1.0:
            return 0.99
        
        # Strong indicators
        score = 0.0
        
        # Token-based similarities (most reliable)
        score += feature_dict.get("token_set_ratio", 0) * 0.25
        score += feature_dict.get("token_sort_ratio", 0) * 0.20
        
        # String similarities
        score += feature_dict.get("jaro_winkler", 0) * 0.15
        score += feature_dict.get("levenshtein", 0) * 0.10
        
        # Candidate scores
        score += feature_dict.get("trgm_score", 0) * 0.10
        score += feature_dict.get("vec_score", 0) * 0.05
        
        # Phonetic matching
        score += feature_dict.get("dm_jaccard", 0) * 0.05
        
        # Token overlap
        score += feature_dict.get("token_jaccard", 0) * 0.05
        
        # Special cases
        if feature_dict.get("initials_match", 0) == 1.0:
            score += 0.05
        
        if feature_dict.get("is_abbreviation", 0) == 1.0:
            score += 0.10
        
        if feature_dict.get("has_common_variation", 0) == 1.0:
            score += 0.10
        
        # Penalize large length differences
        len_ratio = feature_dict.get("len_ratio", 1.0)
        if len_ratio < 0.5:
            score *= 0.8
        
        # Ensure score is in [0, 1]
        return min(max(score, 0.0), 1.0)
    
    def explain(self, features: np.ndarray, top_n: int = 5) -> List[Tuple[str, float]]:
        """
        Explain which features contributed most to the decision.
        
        Args:
            features: Feature vector
            top_n: Number of top features to return
            
        Returns:
            List of (feature_name, contribution) tuples
        """
        feature_names = get_feature_names()
        
        if features.ndim == 1:
            feature_dict = dict(zip(feature_names, features))
        else:
            feature_dict = dict(zip(feature_names, features[0]))
        
        # For heuristic, return weighted features
        weighted = []
        
        # These are the weights from heuristic_score
        weights = {
            "token_set_ratio": 0.25,
            "token_sort_ratio": 0.20,
            "jaro_winkler": 0.15,
            "levenshtein": 0.10,
            "trgm_score": 0.10,
            "vec_score": 0.05,
            "dm_jaccard": 0.05,
            "token_jaccard": 0.05,
            "exact_match": 1.0,
            "initials_match": 0.05,
            "is_abbreviation": 0.10,
            "has_common_variation": 0.10
        }
        
        for name, weight in weights.items():
            value = feature_dict.get(name, 0)
            contribution = value * weight
            if contribution > 0:
                weighted.append((name, contribution))
        
        # Sort by contribution
        weighted.sort(key=lambda x: x[1], reverse=True)
        
        return weighted[:top_n]


# Global classifier instance
classifier = PayeeClassifier()