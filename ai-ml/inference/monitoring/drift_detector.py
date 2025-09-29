"""
Data Drift Detection Module

This module provides functionality to detect data drift between reference and current data
distributions using statistical tests and distance metrics.
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Tuple, Optional, Union, Any
import logging
from dataclasses import dataclass
from enum import Enum
import warnings
from datetime import datetime
from scipy import stats
from sklearn.preprocessing import LabelEncoder
from scipy.spatial.distance import jensenshannon
from scipy.stats import wasserstein_distance
import joblib
import os

# Suppress specific warnings
warnings.filterwarnings('ignore', category=RuntimeWarning)

class DriftType(Enum):
    """Types of data drift"""
    NO_DRIFT = "no_drift"
    COVARIATE_DRIFT = "covariate_drift"
    CONCEPT_DRIFT = "concept_drift"
    LABEL_DRIFT = "label_drift"
    UNKNOWN = "unknown"

class DataType(Enum):
    """Data types for drift detection"""
    NUMERICAL = "numerical"
    CATEGORICAL = "categorical"
    BOOLEAN = "boolean"
    DATETIME = "datetime"
    TEXT = "text"

@dataclass
class DriftResult:
    """Result of drift detection for a single feature"""
    feature_name: str
    data_type: DataType
    has_drift: bool
    drift_score: float
    p_value: Optional[float] = None
    threshold: float = 0.05
    test_name: str = ""
    reference_distribution: Optional[Dict] = None
    current_distribution: Optional[Dict] = None
    message: str = ""
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'feature_name': self.feature_name,
            'data_type': self.data_type.value,
            'has_drift': self.has_drift,
            'drift_score': self.drift_score,
            'p_value': self.p_value,
            'threshold': self.threshold,
            'test_name': self.test_name,
            'message': self.message,
            'timestamp': datetime.now().isoformat()
        }

@dataclass
class DatasetDriftResult:
    """Result of dataset-level drift detection"""
    has_drift: bool
    drift_type: DriftType
    drift_score: float
    feature_drifts: List[DriftResult]
    timestamp: str
    metadata: Dict[str, Any] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary"""
        return {
            'has_drift': self.has_drift,
            'drift_type': self.drift_type.value,
            'drift_score': self.drift_score,
            'feature_drifts': [drift.to_dict() for drift in self.feature_drifts],
            'timestamp': self.timestamp,
            'metadata': self.metadata or {}
        }

class DataDriftDetector:
    """
    Detects data drift between reference and current datasets using statistical tests.
    
    This class provides methods to detect various types of data drift including:
    - Covariate drift: Changes in feature distributions
    - Concept drift: Changes in relationships between features and target
    - Label drift: Changes in target variable distribution
    """
    
    def __init__(self, 
                 config: Optional[Dict] = None,
                 reference_data: Optional[pd.DataFrame] = None,
                 feature_types: Optional[Dict[str, DataType]] = None):
        """
        Initialize the drift detector
        
        Args:
            config: Configuration dictionary
            reference_data: Reference dataset to compare against
            feature_types: Dictionary mapping feature names to their data types
        """
        self.config = config or {}
        self.logger = logging.getLogger(__name__)
        
        # Data storage
        self.reference_data = reference_data
        self.feature_types = feature_types or {}
        
        # Drift detection parameters
        self.drift_threshold = self.config.get('drift_threshold', 0.05)
        self.min_samples = self.config.get('min_samples', 30)
        self.max_categories = self.config.get('max_categories', 20)
        self.random_state = self.config.get('random_state', 42)
        
        # Model for concept drift detection
        self.concept_drift_model = None
        self.feature_importances_ = None
        
        # Initialize label encoders for categorical features
        self.label_encoders = {}
        
        # Drift history
        self.drift_history = []
        
        # Set random seed for reproducibility
        np.random.seed(self.random_state)
    
    def infer_feature_types(self, df: pd.DataFrame) -> Dict[str, DataType]:
        """
        Infer feature types from dataframe
        
        Args:
            df: Input dataframe
            
        Returns:
            Dictionary mapping feature names to inferred data types
        """
        if self.feature_types:
            return self.feature_types
            
        feature_types = {}
        
        for col in df.columns:
            # Skip if already defined
            if col in self.feature_types:
                feature_types[col] = self.feature_types[col]
                continue
                
            # Check for datetime columns
            if pd.api.types.is_datetime64_any_dtype(df[col]):
                feature_types[col] = DataType.DATETIME
            # Check for boolean columns
            elif df[col].dropna().isin([0, 1, True, False]).all():
                feature_types[col] = DataType.BOOLEAN
            # Check for categorical columns
            elif df[col].nunique() <= min(20, len(df) / 10):
                feature_types[col] = DataType.CATEGORICAL
            # Default to numerical
            else:
                feature_types[col] = DataType.NUMERICAL
                
        return feature_types
    
    def preprocess_data(self, 
                       df: pd.DataFrame, 
                       is_reference: bool = False) -> pd.DataFrame:
        """
        Preprocess data for drift detection
        
        Args:
            df: Input dataframe
            is_reference: Whether this is the reference dataset
            
        Returns:
            Preprocessed dataframe
        """
        df = df.copy()
        
        # Infer feature types if not provided
        self.feature_types = self.infer_feature_types(df)
        
        # Process each column based on its type
        for col, dtype in self.feature_types.items():
            if col not in df.columns:
                continue
                
            if dtype == DataType.CATEGORICAL:
                # Handle missing values
                df[col] = df[col].fillna('__MISSING__')
                
                # Encode categorical variables
                if is_reference:
                    le = LabelEncoder()
                    df[col] = le.fit_transform(df[col].astype(str))
                    self.label_encoders[col] = le
                else:
                    # For test data, use the same encoding as reference
                    if col in self.label_encoders:
                        # Transform using reference encoding
                        le = self.label_encoders[col]
                        # Handle new categories not seen in reference
                        mask = ~df[col].astype(str).isin(le.classes_)
                        if mask.any():
                            # Replace unseen categories with a special token
                            df.loc[mask, col] = '__UNKNOWN__'
                        # Encode
                        df[col] = le.transform(df[col].astype(str))
                    else:
                        # If no reference encoding, use simple factorize
                        df[col] = pd.factorize(df[col])[0]
                        
            elif dtype == DataType.NUMERICAL:
                # Handle missing values with mean imputation
                if df[col].isna().any():
                    mean_val = df[col].mean()
                    df[col] = df[col].fillna(mean_val)
        
        return df
    
    def set_reference_data(self, 
                          reference_data: pd.DataFrame, 
                          target_col: Optional[str] = None):
        """
        Set the reference dataset for drift detection
        
        Args:
            reference_data: Reference dataset
            target_col: Name of the target column (if any)
        """
        self.reference_data = self.preprocess_data(reference_data, is_reference=True)
        self.target_col = target_col
        
        # Store reference distributions for each feature
        self.reference_distributions = {}
        for col in self.reference_data.columns:
            if col == target_col:
                continue
                
            if self.feature_types[col] in [DataType.NUMERICAL, DataType.BOOLEAN]:
                # Store summary statistics for numerical features
                self.reference_distributions[col] = {
                    'type': 'numerical',
                    'mean': float(self.reference_data[col].mean()),
                    'std': float(self.reference_data[col].std()),
                    'min': float(self.reference_data[col].min()),
                    'max': float(self.reference_data[col].max()),
                    'percentiles': {
                        '25': float(self.reference_data[col].quantile(0.25)),
                        '50': float(self.reference_data[col].quantile(0.5)),
                        '75': float(self.reference_data[col].quantile(0.75))
                    }
                }
            else:  # Categorical
                # Store value counts for categorical features
                value_counts = self.reference_data[col].value_counts(normalize=True)
                self.reference_distributions[col] = {
                    'type': 'categorical',
                    'distribution': value_counts.to_dict(),
                    'n_categories': len(value_counts)
                }
        
        self.logger.info(f"Set reference data with {len(self.reference_data)} samples and {len(self.reference_data.columns)} features")
    
    def detect_numerical_drift(self, 
                             reference: pd.Series, 
                             current: pd.Series) -> DriftResult:
        """
        Detect drift for numerical features using statistical tests
        
        Args:
            reference: Reference data series
            current: Current data series to compare against reference
            
        Returns:
            DriftResult object with drift detection results
        """
        # Remove any remaining NaN values
        ref_clean = reference.dropna()
        curr_clean = current.dropna()
        
        # Check if we have enough samples
        if len(ref_clean) < self.min_samples or len(curr_clean) < self.min_samples:
            return DriftResult(
                feature_name=reference.name,
                data_type=DataType.NUMERICAL,
                has_drift=False,
                drift_score=0.0,
                message=f"Insufficient samples (ref: {len(ref_clean)}, current: {len(curr_clean)}, min: {self.min_samples})"
            )
        
        # 1. Kolmogorov-Smirnov test
        ks_stat, ks_pvalue = stats.ks_2samp(ref_clean, curr_clean)
        
        # 2. Wasserstein distance (Earth Mover's Distance)
        wasserstein_dist = wasserstein_distance(ref_clean, curr_clean)
        
        # 3. Jensen-Shannon divergence
        # Create histograms with the same bins
        hist_ref, bin_edges = np.histogram(ref_clean, bins='auto', density=True)
        hist_curr, _ = np.histogram(curr_clean, bins=bin_edges, density=True)
        
        # Add small constant to avoid division by zero
        hist_ref = hist_ref + 1e-10
        hist_curr = hist_curr + 1e-10
        
        # Normalize
        hist_ref = hist_ref / hist_ref.sum()
        hist_curr = hist_curr / hist_curr.sum()
        
        js_divergence = jensenshannon(hist_ref, hist_curr, base=2)
        
        # Combine evidence of drift
        has_drift = (
            (ks_pvalue < self.drift_threshold) or 
            (wasserstein_dist > 0.1) or  # This threshold might need tuning
            (js_divergence > 0.1)  # This threshold might need tuning
        )
        
        # Calculate overall drift score (0-1)
        drift_score = min(1.0, max(
            (1 - ks_pvalue / self.drift_threshold) if not np.isnan(ks_pvalue) else 0,
            min(1.0, wasserstein_dist * 10),  # Scale to 0-1 range
            min(1.0, js_divergence * 10)  # Scale to 0-1 range
        ))
        
        return DriftResult(
            feature_name=reference.name,
            data_type=DataType.NUMERICAL,
            has_drift=has_drift,
            drift_score=float(drift_score),
            p_value=float(ks_pvalue) if not np.isnan(ks_pvalue) else None,
            test_name='ks_test',
            reference_distribution={
                'mean': float(ref_clean.mean()),
                'std': float(ref_clean.std()),
                'min': float(ref_clean.min()),
                'max': float(ref_clean.max())
            },
            current_distribution={
                'mean': float(curr_clean.mean()),
                'std': float(curr_clean.std()),
                'min': float(curr_clean.min()),
                'max': float(curr_clean.max())
            },
            message=f"KS p-value: {ks_pvalue:.4f}, Wasserstein: {wasserstein_dist:.4f}, JS: {js_divergence:.4f}"
        )
    
    def detect_categorical_drift(self, 
                               reference: pd.Series, 
                               current: pd.Series) -> DriftResult:
        """
        Detect drift for categorical features using statistical tests
        
        Args:
            reference: Reference data series
            current: Current data series to compare against reference
            
        Returns:
            DriftResult object with drift detection results
        """
        # Replace NaN with a special category
        ref_clean = reference.fillna('__MISSING__')
        curr_clean = current.fillna('__MISSING__')
        
        # Check if we have enough samples
        if len(ref_clean) < self.min_samples or len(curr_clean) < self.min_samples:
            return DriftResult(
                feature_name=reference.name,
                data_type=DataType.CATEGORICAL,
                has_drift=False,
                drift_score=0.0,
                message=f"Insufficient samples (ref: {len(ref_clean)}, current: {len(curr_clean)}, min: {self.min_samples})"
            )
        
        # Get all unique categories
        all_categories = list(set(ref_clean.unique()) | set(curr_clean.unique()))
        
        # If too many categories, skip chi-square test
        if len(all_categories) > self.max_categories:
            return DriftResult(
                feature_name=reference.name,
                data_type=DataType.CATEGORICAL,
                has_drift=False,
                drift_score=0.0,
                message=f"Too many categories ({len(all_categories)} > {self.max_categories})"
            )
        
        # Create contingency table
        ref_counts = ref_clean.value_counts().reindex(all_categories, fill_value=0)
        curr_counts = curr_clean.value_counts().reindex(all_categories, fill_value=0)
        
        # 1. Chi-square test
        try:
            chi2, p_value, dof, _ = stats.chi2_contingency([ref_counts, curr_counts])
        except:
            chi2, p_value, dof = 0.0, 1.0, 0
        
        # 2. Population Stability Index (PSI)
        # Add small constant to avoid division by zero
        ref_prop = (ref_counts + 1e-10) / (ref_counts.sum() + 1e-10 * len(ref_counts))
        curr_prop = (curr_counts + 1e-10) / (curr_counts.sum() + 1e-10 * len(curr_counts))
        
        # Calculate PSI
        psi = np.sum((curr_prop - ref_prop) * np.log(curr_prop / ref_prop))
        
        # 3. Jensen-Shannon divergence
        js_divergence = jensenshannon(ref_prop, curr_prop, base=2)
        
        # Combine evidence of drift
        has_drift = (
            (p_value < self.drift_threshold) or 
            (psi > 0.25) or  # Common threshold for PSI
            (js_divergence > 0.1)  # This threshold might need tuning
        )
        
        # Calculate overall drift score (0-1)
        drift_score = min(1.0, max(
            (1 - p_value / self.drift_threshold) if not np.isnan(p_value) else 0,
            min(1.0, psi / 0.5),  # Scale to 0-1 range (0.25 is warning, 0.5 is significant)
            min(1.0, js_divergence * 10)  # Scale to 0-1 range
        ))
        
        return DriftResult(
            feature_name=reference.name,
            data_type=DataType.CATEGORICAL,
            has_drift=has_drift,
            drift_score=float(drift_score),
            p_value=float(p_value) if not np.isnan(p_value) else None,
            test_name='chi2_test',
            reference_distribution=ref_prop.to_dict(),
            current_distribution=curr_prop.to_dict(),
            message=f"Chi2 p-value: {p_value:.4f}, PSI: {psi:.4f}, JS: {js_divergence:.4f}"
        )
    
    def detect_drift(self, 
                    current_data: pd.DataFrame, 
                    target_col: Optional[str] = None) -> DatasetDriftResult:
        """
        Detect drift between reference and current data
        
        Args:
            current_data: Current data to compare against reference
            target_col: Name of the target column (if any)
            
        Returns:
            DatasetDriftResult with drift detection results
        """
        if self.reference_data is None:
            raise ValueError("Reference data not set. Call set_reference_data() first.")
        
        # Preprocess current data
        current_data_processed = self.preprocess_data(current_data, is_reference=False)
        
        # Align columns between reference and current data
        common_cols = list(set(self.reference_data.columns) & set(current_data_processed.columns))
        if not common_cols:
            raise ValueError("No common columns between reference and current data")
        
        # Detect drift for each feature
        feature_results = []
        has_any_drift = False
        
        for col in common_cols:
            if col == target_col:
                continue
                
            if col not in self.feature_types:
                self.logger.warning(f"Skipping column '{col}': unknown feature type")
                continue
            
            # Select appropriate drift detection method based on feature type
            if self.feature_types[col] in [DataType.NUMERICAL, DataType.BOOLEAN]:
                result = self.detect_numerical_drift(
                    self.reference_data[col],
                    current_data_processed[col]
                )
            else:  # Categorical
                result = self.detect_categorical_drift(
                    self.reference_data[col],
                    current_data_processed[col]
                )
            
            feature_results.append(result)
            has_any_drift = has_any_drift or result.has_drift
        
        # Determine overall drift type
        if has_any_drift:
            # Check if target column is available for concept drift detection
            if target_col and target_col in current_data_processed.columns:
                # This is a simplified check - in practice, you'd want to train a model
                # on reference data and evaluate on current data
                drift_type = DriftType.CONCEPT_DRIFT
            else:
                drift_type = DriftType.COVARIATE_DRIFT
        else:
            drift_type = DriftType.NO_DRIFT
        
        # Calculate overall drift score (average of feature drift scores)
        if feature_results:
            drift_score = sum(r.drift_score for r in feature_results) / len(feature_results)
        else:
            drift_score = 0.0
        
        # Create result object
        result = DatasetDriftResult(
            has_drift=has_any_drift,
            drift_type=drift_type,
            drift_score=drift_score,
            feature_drifts=feature_results,
            timestamp=datetime.now().isoformat(),
            metadata={
                'n_samples': len(current_data_processed),
                'n_features': len(common_cols),
                'n_drifted_features': sum(1 for r in feature_results if r.has_drift)
            }
        )
        
        # Store in history
        self.drift_history.append(result)
        
        return result
    
    def save_detector(self, filepath: str):
        """
        Save the drift detector to disk
        
        Args:
            filepath: Path to save the detector
        """
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(os.path.abspath(filepath)), exist_ok=True)
        
        # Save the detector
        joblib.dump(self, filepath)
        self.logger.info(f"Saved drift detector to {filepath}")
    
    @classmethod
    def load_detector(cls, filepath: str) -> 'DataDriftDetector':
        """
        Load a drift detector from disk
        
        Args:
            filepath: Path to the saved detector
            
        Returns:
            Loaded DataDriftDetector instance
        """
        return joblib.load(filepath)


def example_usage():
    """
    Example usage of the DataDriftDetector class
    """
    import pandas as pd
    import numpy as np
    
    # Set up logging
    logging.basicConfig(level=logging.INFO)
    
    # Generate sample data
    np.random.seed(42)
    n_samples = 1000
    
    # Reference data (normal distribution)
    ref_data = pd.DataFrame({
        'age': np.random.normal(40, 10, n_samples),
        'income': np.random.lognormal(10, 0.5, n_samples),
        'gender': np.random.choice(['M', 'F', 'Other'], size=n_samples, p=[0.49, 0.49, 0.02]),
        'purchased': np.random.binomial(1, 0.3, n_samples)
    })
    
    # Current data (with some drift)
    curr_data = pd.DataFrame({
        'age': np.random.normal(45, 12, n_samples),  # Slightly different distribution
        'income': np.random.lognormal(10.2, 0.6, n_samples),  # Slightly different distribution
        'gender': np.random.choice(['M', 'F', 'Other'], size=n_samples, p=[0.45, 0.45, 0.1]),  # More 'Other'
        'purchased': np.random.binomial(1, 0.35, n_samples)  # Higher purchase rate
    })
    
    # Initialize drift detector
    detector = DataDriftDetector()
    
    # Set reference data (this is your baseline)
    detector.set_reference_data(ref_data, target_col='purchased')
    
    # Detect drift in current data
    result = detector.detect_drift(curr_data, target_col='purchased')
    
    # Print results
    print(f"\n=== Drift Detection Results ===")
    print(f"Overall drift detected: {result.has_drift}")
    print(f"Drift type: {result.drift_type.value}")
    print(f"Overall drift score: {result.drift_score:.4f}")
    print(f"Number of drifted features: {result.metadata['n_drifted_features']}")
    
    # Print detailed results for each feature
    print("\n=== Feature-level Drift ===")
    for feature_result in result.feature_drifts:
        print(f"\nFeature: {feature_result.feature_name}")
        print(f"  - Type: {feature_result.data_type.value}")
        print(f"  - Drift detected: {feature_result.has_drift}")
        print(f"  - Drift score: {feature_result.drift_score:.4f}")
        print(f"  - Test: {feature_result.test_name}")
        if feature_result.p_value is not None:
            print(f"  - p-value: {feature_result.p_value:.4f}")
        print(f"  - Message: {feature_result.message}")
    
    # Save the detector for future use
    detector.save_detector('data_drift_detector.joblib')
    
    # Later, you can load it back
    # loaded_detector = DataDriftDetector.load_detector('data_drift_detector.joblib')


if __name__ == "__main__":
    example_usage()
