import os
import pandas as pd
from typing import Optional, Dict, Any, Union, List
from pathlib import Path
import yaml
import json
from ..utils.logger import logger
from ..utils.validation import DataValidator

class DataLoader:
    """Handles loading and preprocessing data from various sources."""
    
    def __init__(self, config_path: Optional[str] = None):
        """
        Initialize the DataLoader.
        
        Args:
            config_path: Optional path to a configuration file
        """
        self.config = self._load_config(config_path) if config_path else {}
        self.validator = DataValidator()
        
    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """Load configuration from a file."""
        try:
            with open(config_path, 'r') as f:
                if config_path.endswith(('.yaml', '.yml')):
                    return yaml.safe_load(f)
                elif config_path.endswith('.json'):
                    return json.load(f)
                else:
                    logger.warning(f"Unsupported config file format: {config_path}")
                    return {}
        except Exception as e:
            logger.error(f"Error loading config file {config_path}: {e}")
            return {}
    
    def load_csv(
        self,
        file_path: str,
        **kwargs
    ) -> pd.DataFrame:
        """
        Load data from a CSV file.
        
        Args:
            file_path: Path to the CSV file
            **kwargs: Additional arguments to pass to pandas.read_csv()
            
        Returns:
            Loaded DataFrame
        """
        try:
            logger.info(f"Loading CSV file: {file_path}")
            df = pd.read_csv(file_path, **kwargs)
            
            # Basic validation
            validation = self.validator.validate_dataframe(df)
            if not validation['is_valid']:
                for msg in validation['messages']:
                    logger.warning(f"Validation warning: {msg}")
                    
            return df
            
        except Exception as e:
            logger.error(f"Error loading CSV file {file_path}: {e}")
            raise
            
    def load_parquet(
        self,
        file_path: str,
        **kwargs
    ) -> pd.DataFrame:
        """
        Load data from a Parquet file.
        
        Args:
            file_path: Path to the Parquet file
            **kwargs: Additional arguments to pass to pandas.read_parquet()
            
        Returns:
            Loaded DataFrame
        """
        try:
            logger.info(f"Loading Parquet file: {file_path}")
            df = pd.read_parquet(file_path, **kwargs)
            
            # Basic validation
            validation = self.validator.validate_dataframe(df)
            if not validation['is_valid']:
                for msg in validation['messages']:
                    logger.warning(f"Validation warning: {msg}")
                    
            return df
            
        except Exception as e:
            logger.error(f"Error loading Parquet file {file_path}: {e}")
            raise
    
    def load_from_directory(
        self,
        dir_path: str,
        file_pattern: str = "*.csv",
        recursive: bool = False,
        **kwargs
    ) -> Dict[str, pd.DataFrame]:
        """
        Load multiple files from a directory.
        
        Args:
            dir_path: Path to the directory
            file_pattern: File pattern to match (e.g., "*.csv", "*.parquet")
            recursive: Whether to search subdirectories
            **kwargs: Additional arguments to pass to the loader function
            
        Returns:
            Dictionary mapping filenames to DataFrames
        """
        import glob
        
        data = {}
        search_path = os.path.join(dir_path, "**", file_pattern) if recursive else os.path.join(dir_path, file_pattern)
        
        for file_path in glob.glob(search_path, recursive=recursive):
            try:
                file_name = os.path.basename(file_path)
                if file_path.endswith('.csv'):
                    data[file_name] = self.load_csv(file_path, **kwargs)
                elif file_path.endswith(('.parquet', '.pq')):
                    data[file_name] = self.load_parquet(file_path, **kwargs)
                else:
                    logger.warning(f"Unsupported file format: {file_path}")
            except Exception as e:
                logger.error(f"Error loading file {file_path}: {e}")
                continue
                
        return data
    
    def load_from_api(
        self,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
        headers: Optional[Dict[str, str]] = None,
        method: str = "GET",
        data: Optional[Dict[str, Any]] = None,
        timeout: int = 30
    ) -> Union[Dict, List, None]:
        """
        Load data from a REST API.
        
        Args:
            endpoint: API endpoint URL
            params: Query parameters
            headers: Request headers
            method: HTTP method (GET, POST, etc.)
            data: Request body (for POST/PUT requests)
            timeout: Request timeout in seconds
            
        Returns:
            Parsed JSON response or None if the request fails
        """
        import requests
        
        try:
            logger.info(f"Making {method} request to {endpoint}")
            
            if method.upper() == "GET":
                response = requests.get(
                    endpoint,
                    params=params,
                    headers=headers,
                    timeout=timeout
                )
            elif method.upper() == "POST":
                response = requests.post(
                    endpoint,
                    json=data,
                    params=params,
                    headers=headers,
                    timeout=timeout
                )
            else:
                raise ValueError(f"Unsupported HTTP method: {method}")
                
            response.raise_for_status()
            return response.json()
            
        except requests.exceptions.RequestException as e:
            logger.error(f"API request failed: {e}")
            return None
