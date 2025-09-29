# ai-ml/feature_store/feature_store.py
import os
import pandas as pd
import numpy as np
from typing import Dict, List, Optional, Union, Any
from pathlib import Path
import hashlib
import json
from datetime import datetime
from ..utils.logger import logger

class FeatureStore:
    """Manages storage and retrieval of features."""
    
    def __init__(self, base_path: str = "feature_store"):
        """
        Initialize the FeatureStore.
        
        Args:
            base_path: Base directory for storing features
        """
        self.base_path = Path(base_path)
        self.metadata_path = self.base_path / "metadata.json"
        self.metadata = self._load_metadata()
        
    def _load_metadata(self) -> Dict[str, Any]:
        """Load feature metadata from disk."""
        if self.metadata_path.exists():
            try:
                with open(self.metadata_path, 'r') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"Error loading feature metadata: {e}")
        return {}
        
    def _save_metadata(self) -> None:
        """Save feature metadata to disk."""
        try:
            self.base_path.mkdir(parents=True, exist_ok=True)
            with open(self.metadata_path, 'w') as f:
                json.dump(self.metadata, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving feature metadata: {e}")
            raise
            
    def _generate_feature_id(self, feature_name: str, version: str = "1.0") -> str:
        """Generate a unique ID for a feature."""
        return hashlib.md5(f"{feature_name}_{version}".encode()).hexdigest()
        
    def save_feature(
        self,
        feature_name: str,
        data: Union[pd.DataFrame, pd.Series, np.ndarray],
        description: str = "",
        version: str = "1.0",
        tags: Optional[List[str]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> str:
        """
        Save a feature to the feature store.
        
        Args:
            feature_name: Name of the feature
            data: Feature data (DataFrame, Series, or ndarray)
            description: Description of the feature
            version: Feature version
            tags: Optional list of tags
            metadata: Additional metadata
            
        Returns:
            Feature ID
        """
        try:
            # Generate feature ID and path
            feature_id = self._generate_feature_id(feature_name, version)
            feature_dir = self.base_path / feature_id
            feature_dir.mkdir(parents=True, exist_ok=True)
            
            # Save the feature data
            if isinstance(data, pd.DataFrame):
                data.to_parquet(feature_dir / "data.parquet")
            elif isinstance(data, pd.Series):
                data.to_frame().to_parquet(feature_dir / "data.parquet")
            elif isinstance(data, np.ndarray):
                pd.DataFrame(data).to_parquet(feature_dir / "data.parquet")
            else:
                raise ValueError(f"Unsupported data type: {type(data)}")
            
            # Update metadata
            feature_metadata = {
                'id': feature_id,
                'name': feature_name,
                'version': version,
                'description': description,
                'tags': tags or [],
                'created_at': datetime.utcnow().isoformat(),
                'data_type': str(type(data).__name__),
                'shape': data.shape if hasattr(data, 'shape') else None,
                'metadata': metadata or {}
            }
            
            # Save metadata
            with open(feature_dir / "metadata.json", 'w') as f:
                json.dump(feature_metadata, f, indent=2)
                
            # Update global metadata
            self.metadata[feature_id] = {
                'name': feature_name,
                'version': version,
                'created_at': feature_metadata['created_at'],
                'path': str(feature_dir.relative_to(self.base_path))
            }
            self._save_metadata()
            
            logger.info(f"Saved feature: {feature_name} (ID: {feature_id})")
            return feature_id
            
        except Exception as e:
            logger.error(f"Error saving feature {feature_name}: {e}")
            raise
            
    def load_feature(self, feature_id: str) -> Optional[Dict[str, Any]]:
        """
        Load a feature from the feature store.
        
        Args:
            feature_id: ID of the feature to load
            
        Returns:
            Dictionary containing the feature data and metadata, or None if not found
        """
        try:
            feature_dir = self.base_path / feature_id
            if not feature_dir.exists():
                logger.warning(f"Feature not found: {feature_id}")
                return None
                
            # Load metadata
            with open(feature_dir / "metadata.json", 'r') as f:
                metadata = json.load(f)
                
            # Load data
            data_path = feature_dir / "data.parquet"
            if data_path.exists():
                df = pd.read_parquet(data_path)
                if metadata['data_type'] == 'Series':
                    data = df.iloc[:, 0]
                elif metadata['data_type'] == 'ndarray':
                    data = df.values
                else:
                    data = df
            else:
                data = None
                
            return {
                'data': data,
                'metadata': metadata
            }
            
        except Exception as e:
            logger.error(f"Error loading feature {feature_id}: {e}")
            return None
            
    def list_features(self, name: Optional[str] = None, tag: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List features in the feature store.
        
        Args:
            name: Filter by feature name (partial match)
            tag: Filter by tag
            
        Returns:
            List of feature metadata dictionaries
        """
        features = []
        for feature_id, meta in self.metadata.items():
            try:
                feature_meta = self.load_feature(feature_id)['metadata']
                if name and name.lower() not in feature_meta['name'].lower():
                    continue
                if tag and tag not in feature_meta['tags']:
                    continue
                features.append(feature_meta)
            except Exception as e:
                logger.error(f"Error loading feature metadata for {feature_id}: {e}")
                continue
                
        return sorted(features, key=lambda x: x['created_at'], reverse=True)