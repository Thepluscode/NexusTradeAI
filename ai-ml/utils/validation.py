from typing import Any, Dict, List, Optional, Union
import pandas as pd
import numpy as np
from .logger import logger

class DataValidator:
    """Validates data quality and structure."""
    
    @staticmethod
    def validate_dataframe(
        df: pd.DataFrame,
        required_columns: List[str] = None,
        allow_nan: bool = False,
        allow_inf: bool = False,
        check_duplicates: bool = True
    ) -> Dict[str, Any]:
        """
        Validate a pandas DataFrame.
        
        Args:
            df: Input DataFrame to validate
            required_columns: List of columns that must be present
            allow_nan: Whether to allow NaN values
            allow_inf: Whether to allow infinite values
            check_duplicates: Whether to check for duplicate rows
            
        Returns:
            Dictionary with validation results
        """
        results = {
            'is_valid': True,
            'missing_columns': [],
            'has_nan': False,
            'has_inf': False,
            'has_duplicates': False,
            'row_count': len(df),
            'column_count': len(df.columns) if df is not None else 0,
            'messages': []
        }
        
        # Check if DataFrame is None or empty
        if df is None:
            results['is_valid'] = False
            results['messages'].append("Input DataFrame is None")
            return results
            
        if df.empty:
            results['is_valid'] = False
            results['messages'].append("Input DataFrame is empty")
            return results
            
        # Check for required columns
        if required_columns:
            missing = [col for col in required_columns if col not in df.columns]
            if missing:
                results['missing_columns'] = missing
                results['is_valid'] = False
                results['messages'].append(f"Missing required columns: {', '.join(missing)}")
        
        # Check for NaN values
        if not allow_nan and df.isna().any().any():
            nan_cols = df.columns[df.isna().any()].tolist()
            results['has_nan'] = True
            results['is_valid'] = False
            results['messages'].append(f"NaN values found in columns: {', '.join(nan_cols)}")
        
        # Check for infinite values
        if not allow_inf:
            numeric_df = df.select_dtypes(include=[np.number])
            if not numeric_df.empty:
                inf_mask = np.isinf(numeric_df)
                if inf_mask.any().any():
                    inf_cols = numeric_df.columns[inf_mask.any()].tolist()
                    results['has_inf'] = True
                    results['is_valid'] = False
                    results['messages'].append(f"Infinite values found in columns: {', '.join(inf_cols)}")
        
        # Check for duplicates
        if check_duplicates and df.duplicated().any():
            results['has_duplicates'] = True
            results['is_valid'] = False
            results['messages'].append("Duplicate rows found in the DataFrame")
        
        if results['is_valid']:
            results['messages'].append("Data validation passed")
            
        return results
    
    @staticmethod
    def validate_schema(
        df: pd.DataFrame,
        schema: Dict[str, type],
        strict: bool = False
    ) -> Dict[str, Any]:
        """
        Validate DataFrame against a schema.
        
        Args:
            df: Input DataFrame
            schema: Dictionary mapping column names to expected types
            strict: If True, raises an error if extra columns are present
            
        Returns:
            Dictionary with validation results
        """
        results = {
            'is_valid': True,
            'missing_columns': [],
            'type_mismatches': {},
            'extra_columns': [],
            'messages': []
        }
        
        # Check for missing columns
        missing = [col for col in schema if col not in df.columns]
        if missing:
            results['missing_columns'] = missing
            results['is_valid'] = False
            results['messages'].append(f"Missing columns: {', '.join(missing)}")
        
        # Check for type mismatches
        for col, expected_type in schema.items():
            if col in df.columns:
                actual_type = df[col].dtype
                if not isinstance(actual_type, type) or not issubclass(actual_type.type, expected_type):
                    results['type_mismatches'][col] = {
                        'expected': expected_type.__name__,
                        'actual': str(actual_type)
                    }
                    results['is_valid'] = False
        
        # Check for extra columns if in strict mode
        if strict:
            extra = [col for col in df.columns if col not in schema]
            if extra:
                results['extra_columns'] = extra
                results['is_valid'] = False
                results['messages'].append(f"Unexpected columns: {', '.join(extra)}")
        
        if results['is_valid']:
            results['messages'].append("Schema validation passed")
            
        return results
