"""
Utility functions for the training scheduler and retraining trigger.
"""

import os
import yaml
import logging
from typing import Dict, Any, Optional, Union, List
from pathlib import Path
from dataclasses import asdict, is_dataclass
from enum import Enum
import json

logger = logging.getLogger(__name__)

def load_config(config_path: str) -> Dict[str, Any]:
    """
    Load configuration from a YAML file.
    
    Args:
        config_path: Path to the YAML configuration file
        
    Returns:
        Dictionary containing the configuration
    """
    try:
        with open(config_path, 'r') as f:
            config = yaml.safe_load(f)
        
        logger.info(f"Successfully loaded configuration from {config_path}")
        return config or {}
    
    except FileNotFoundError:
        logger.error(f"Configuration file not found: {config_path}")
        raise
    except yaml.YAMLError as e:
        logger.error(f"Error parsing YAML configuration: {e}")
        raise
    except Exception as e:
        logger.error(f"Error loading configuration: {e}")
        raise

def save_config(config: Dict[str, Any], config_path: str):
    """
    Save configuration to a YAML file.
    
    Args:
        config: Configuration dictionary to save
        config_path: Path to save the configuration file
    """
    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(os.path.abspath(config_path)), exist_ok=True)
        
        with open(config_path, 'w') as f:
            yaml.dump(config, f, default_flow_style=False, sort_keys=False)
        
        logger.info(f"Configuration saved to {config_path}")
    
    except Exception as e:
        logger.error(f"Error saving configuration: {e}")
        raise

def merge_configs(base_config: Dict[str, Any], override_config: Dict[str, Any]) -> Dict[str, Any]:
    """
    Recursively merge two configuration dictionaries.
    
    Args:
        base_config: Base configuration
        override_config: Configuration with override values
        
    Returns:
        Merged configuration
    """
    result = base_config.copy()
    
    for key, value in override_config.items():
        if (key in result and isinstance(result[key], dict) and 
                isinstance(value, dict)):
            result[key] = merge_configs(result[key], value)
        else:
            result[key] = value
    
    return result

def validate_config(config: Dict[str, Any], schema: Dict[str, Any], path: str = '') -> List[str]:
    """
    Validate configuration against a schema.
    
    Args:
        config: Configuration to validate
        schema: Schema defining required fields and types
        path: Current path in the configuration (for error messages)
        
    Returns:
        List of validation errors (empty if valid)
    """
    errors = []
    
    for key, expected_type in schema.items():
        full_path = f"{path}.{key}" if path else key
        
        # Check if the key is required
        is_required = not key.endswith('?')
        key_name = key.rstrip('?')
        
        if key_name not in config:
            if is_required:
                errors.append(f"Missing required configuration: {full_path}")
            continue
        
        value = config[key_name]
        
        # Handle nested dictionaries
        if isinstance(expected_type, dict) and isinstance(value, dict):
            errors.extend(validate_config(value, expected_type, full_path))
            continue
        
        # Handle lists of types (e.g., [str, int])
        if isinstance(expected_type, list) and not isinstance(expected_type, str):
            if not any(isinstance(value, t) for t in expected_type):
                type_names = [t.__name__ for t in expected_type]
                errors.append(
                    f"{full_path} must be one of {type_names}, got {type(value).__name__}"
                )
            continue
        
        # Handle direct type checking
        if not isinstance(value, expected_type):
            errors.append(
                f"{full_path} must be {expected_type.__name__}, got {type(value).__name__}"
            )
    
    return errors

def setup_logging(config: Dict[str, Any]):
    """
    Configure logging based on configuration.
    
    Args:
        config: Logging configuration dictionary
    """
    log_level = getattr(logging, config.get('level', 'INFO').upper())
    log_file = config.get('file')
    
    # Configure root logger
    logger = logging.getLogger()
    logger.setLevel(log_level)
    
    # Clear existing handlers
    for handler in logger.handlers[:]:
        logger.removeHandler(handler)
    
    # Create formatter
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # Add console handler
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Add file handler if specified
    if log_file:
        # Create directory if it doesn't exist
        log_dir = os.path.dirname(log_file)
        if log_dir:
            os.makedirs(log_dir, exist_ok=True)
        
        # Add rotating file handler
        from logging.handlers import RotatingFileHandler
        max_size = config.get('max_size_mb', 10) * 1024 * 1024  # Convert MB to bytes
        backup_count = config.get('backup_count', 5)
        
        file_handler = RotatingFileHandler(
            log_file,
            maxBytes=max_size,
            backupCount=backup_count
        )
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    
    logger.info("Logging configured")

def get_absolute_path(path: str, base_dir: str = None) -> str:
    """
    Convert a path to an absolute path, relative to a base directory.
    
    Args:
        path: Path to convert (can be relative or absolute)
        base_dir: Base directory for relative paths (default: current working directory)
        
    Returns:
        Absolute path
    """
    if os.path.isabs(path):
        return path
    
    if base_dir is None:
        base_dir = os.getcwd()
    
    return os.path.abspath(os.path.join(base_dir, path))

def ensure_directory_exists(directory: str):
    """
    Ensure that a directory exists, creating it if necessary.
    
    Args:
        directory: Path to the directory
    """
    os.makedirs(directory, exist_ok=True)

def dict_to_dataclass(data: Dict, data_class) -> object:
    """
    Convert a dictionary to a dataclass instance.
    
    Args:
        data: Dictionary with data
        data_class: Dataclass type to convert to
        
    Returns:
        Instance of the dataclass
    """
    if not is_dataclass(data_class):
        raise ValueError(f"{data_class} is not a dataclass")
    
    # Get field types from the dataclass
    field_types = {f.name: f.type for f in dataclasses.fields(data_class)}
    
    # Convert each field
    kwargs = {}
    for field_name, field_type in field_types.items():
        if field_name not in data:
            continue
            
        value = data[field_name]
        
        # Handle nested dataclasses
        if is_dataclass(field_type):
            kwargs[field_name] = dict_to_dataclass(value, field_type)
        # Handle Optional[SomeType]
        elif hasattr(field_type, '__origin__') and field_type.__origin__ is Union:
            # Check for Optional[SomeType] which is Union[SomeType, None]
            args = [t for t in field_type.__args__ if t is not type(None)]  # noqa: E721
            if len(args) == 1 and is_dataclass(args[0]):
                kwargs[field_name] = dict_to_dataclass(value, args[0])
            else:
                kwargs[field_name] = value
        # Handle List[SomeType]
        elif hasattr(field_type, '__origin__') and field_type.__origin__ is list:
            item_type = field_type.__args__[0]
            if is_dataclass(item_type):
                kwargs[field_name] = [dict_to_dataclass(item, item_type) for item in value]
            else:
                kwargs[field_name] = value
        # Handle enums
        elif isinstance(field_type, type) and issubclass(field_type, Enum):
            kwargs[field_name] = field_type(value)
        else:
            kwargs[field_name] = value
    
    return data_class(**kwargs)

def dataclass_to_dict(obj: object) -> Dict:
    """
    Convert a dataclass instance to a dictionary.
    
    Args:
        obj: Dataclass instance
        
    Returns:
        Dictionary representation of the dataclass
    """
    if not is_dataclass(obj):
        raise ValueError("Object is not a dataclass")
    
    result = {}
    
    for field in dataclasses.fields(obj):
        value = getattr(obj, field.name)
        
        # Handle nested dataclasses
        if is_dataclass(value):
            result[field.name] = dataclass_to_dict(value)
        # Handle lists of dataclasses
        elif isinstance(value, list) and value and is_dataclass(value[0]):
            result[field.name] = [dataclass_to_dict(item) for item in value]
        # Handle enums
        elif isinstance(value, Enum):
            result[field.name] = value.value
        # Handle other types
        else:
            result[field.name] = value
    
    return result

def parse_time_string(time_str: str) -> Dict[str, int]:
    """
    Parse a time string in format 'HH:MM' or 'HH:MM:SS' into hours, minutes, seconds.
    
    Args:
        time_str: Time string in format 'HH:MM' or 'HH:MM:SS'
        
    Returns:
        Dictionary with 'hours', 'minutes', 'seconds' keys
    """
    parts = list(map(int, time_str.split(':')))
    
    if len(parts) == 2:
        hours, minutes = parts
        seconds = 0
    elif len(parts) == 3:
        hours, minutes, seconds = parts
    else:
        raise ValueError(f"Invalid time format: {time_str}. Expected 'HH:MM' or 'HH:MM:SS'")
    
    return {
        'hours': hours,
        'minutes': minutes,
        'seconds': seconds
    }

def parse_interval_string(interval_str: str) -> int:
    """
    Parse an interval string (e.g., '1h30m') into seconds.
    
    Args:
        interval_str: Interval string (e.g., '1h30m', '2d', '30s')
        
    Returns:
        Interval in seconds
    """
    import re
    
    if not interval_str:
        return 0
    
    # Match all number-unit pairs
    pattern = r'(\d+)([smhdw]?)'
    matches = re.findall(pattern, interval_str)
    
    if not matches:
        raise ValueError(f"Invalid interval format: {interval_str}")
    
    total_seconds = 0
    
    for value, unit in matches:
        value = int(value)
        
        if unit == 's' or not unit:
            total_seconds += value
        elif unit == 'm':
            total_seconds += value * 60
        elif unit == 'h':
            total_seconds += value * 3600
        elif unit == 'd':
            total_seconds += value * 86400
        elif unit == 'w':
            total_seconds += value * 604800
    
    return total_seconds

def format_seconds(seconds: int) -> str:
    """
    Format a duration in seconds into a human-readable string.
    
    Args:
        seconds: Duration in seconds
        
    Returns:
        Formatted duration string (e.g., '1h 30m 15s')
    """
    if not seconds:
        return "0s"
    
    minutes, seconds = divmod(seconds, 60)
    hours, minutes = divmod(minutes, 60)
    days, hours = divmod(hours, 24)
    
    parts = []
    
    if days > 0:
        parts.append(f"{days}d")
    if hours > 0:
        parts.append(f"{hours}h")
    if minutes > 0:
        parts.append(f"{minutes}m")
    if seconds > 0 or not parts:
        parts.append(f"{seconds}s")
    
    return " ".join(parts[:3])  # Limit to 3 parts for readability
