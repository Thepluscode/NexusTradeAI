# data-infrastructure/orchestration/airflow/dags/market_data_pipeline.py

from datetime import datetime, timedelta
from airflow import DAG
from airflow.operators.python import PythonOperator
from airflow.operators.bash import BashOperator
from airflow.providers.postgres.operators.postgres import PostgresOperator
from airflow.providers.postgres.hooks.postgres import PostgresHook
from airflow.providers.http.operators.http import SimpleHttpOperator
from airflow.providers.amazon.aws.operators.s3 import S3CreateObjectOperator
from airflow.providers.amazon.aws.hooks.s3 import S3Hook
from airflow.sensors.filesystem import FileSensor
from airflow.sensors.s3_key_sensor import S3KeySensor
import pandas as pd
import requests
import json
import logging
from typing import Dict, List, Any
import os

logger = logging.getLogger(__name__)

# Default arguments for all DAGs
default_args = {
    'owner': 'nexus-trade-data-team',
    'depends_on_past': False,
    'start_date': datetime(2024, 1, 1),
    'email_on_failure': True,
    'email_on_retry': False,
    'retries': 2,
    'retry_delay': timedelta(minutes=5),
    'catchup': False
}

# Market Data ETL Pipeline DAG
market_data_dag = DAG(
    'market_data_etl_pipeline',
    default_args=default_args,
    description='Extract, transform, and load market data from multiple sources',
    schedule_interval=timedelta(minutes=5),
    max_active_runs=1,
    tags=['market_data', 'etl', 'real_time']
)

def extract_market_data(**context):
    """Extract market data from external APIs"""
    
    # List of symbols to fetch
    symbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'NVDA', 'META', 'NFLX']
    
    # API configurations
    apis = {
        'alpha_vantage': {
            'url': 'https://www.alphavantage.co/query',
            'key': os.getenv('ALPHA_VANTAGE_API_KEY'),
            'function': 'GLOBAL_QUOTE'
        },
        'finnhub': {
            'url': 'https://finnhub.io/api/v1/quote',
            'key': os.getenv('FINNHUB_API_KEY')
        }
    }
    
    extracted_data = []
    
    for symbol in symbols:
        try:
            # Extract from Alpha Vantage
            av_params = {
                'function': apis['alpha_vantage']['function'],
                'symbol': symbol,
                'apikey': apis['alpha_vantage']['key']
            }
            
            av_response = requests.get(apis['alpha_vantage']['url'], params=av_params)
            av_data = av_response.json()
            
            # Extract from Finnhub
            fh_params = {
                'symbol': symbol,
                'token': apis['finnhub']['key']
            }
            
            fh_response = requests.get(apis['finnhub']['url'], params=fh_params)
            fh_data = fh_response.json()
            
            # Combine and normalize data
            normalized_data = {
                'symbol': symbol,
                'timestamp': datetime.now().isoformat(),
                'price': float(fh_data.get('c', 0)),
                'open': float(fh_data.get('o', 0)),
                'high': float(fh_data.get('h', 0)),
                'low': float(fh_data.get('l', 0)),
                'previous_close': float(fh_data.get('pc', 0)),
                'change': float(av_data.get('Global Quote', {}).get('09. change', 0)),
                'change_percent': av_data.get('Global Quote', {}).get('10. change percent', '0%'),
                'source': 'api_aggregation'
            }
            
            extracted_data.append(normalized_data)
            logger.info(f"Extracted data for {symbol}")
            
        except Exception as e:
            logger.error(f"Error extracting data for {symbol}: {e}")
    
    # Store extracted data in XCom
    return extracted_data

def transform_market_data(**context):
    """Transform and clean market data"""
    
    # Get data from previous task
    extracted_data = context['task_instance'].xcom_pull(task_ids='extract_market_data')
    
    if not extracted_data:
        logger.warning("No data extracted, skipping transformation")
        return []
    
    transformed_data = []
    
    for record in extracted_data:
        try:
            # Clean and validate data
            cleaned_record = {
                'symbol': record['symbol'].upper(),
                'timestamp': record['timestamp'],
                'price': max(0, record['price']),  # Ensure non-negative
                'open_price': max(0, record['open']),
                'high_price': max(0, record['high']),
                'low_price': max(0, record['low']),
                'previous_close': max(0, record['previous_close']),
                'change_amount': record['change'],
                'change_percent': float(record['change_percent'].replace('%', '')) if isinstance(record['change_percent'], str) else record['change_percent'],
                'volume': 0,  # Will be updated from trade data
                'data_source': record['source'],
                'data_quality_score': 1.0  # Perfect quality for API data
            }
            
            # Calculate additional metrics
            if cleaned_record['previous_close'] > 0:
                calculated_change = cleaned_record['price'] - cleaned_record['previous_close']
                calculated_change_pct = (calculated_change / cleaned_record['previous_close']) * 100
                
                # Use calculated values if more accurate
                if abs(calculated_change - cleaned_record['change_amount']) < 0.01:
                    cleaned_record['change_amount'] = calculated_change
                    cleaned_record['change_percent'] = calculated_change_pct
            
            # Validate price relationships
            if cleaned_record['high_price'] < cleaned_record['low_price']:
                logger.warning(f"Invalid high/low for {cleaned_record['symbol']}")
                cleaned_record['data_quality_score'] = 0.5
            
            if cleaned_record['price'] > cleaned_record['high_price'] or cleaned_record['price'] < cleaned_record['low_price']:
                logger.warning(f"Price outside high/low range for {cleaned_record['symbol']}")
                cleaned_record['data_quality_score'] = 0.7
            
            transformed_data.append(cleaned_record)
            
        except Exception as e:
            logger.error(f"Error transforming data for {record.get('symbol', 'unknown')}: {e}")
    
    logger.info(f"Transformed {len(transformed_data)} records")
    return transformed_data

def load_to_postgresql(**context):
    """Load transformed data to PostgreSQL"""
    
    # Get transformed data
    transformed_data = context['task_instance'].xcom_pull(task_ids='transform_market_data')
    
    if not transformed_data:
        logger.warning("No transformed data to load")
        return
    
    # Connect to PostgreSQL
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Prepare data for insertion
    insert_query = """
        INSERT INTO market_data.quotes (
            symbol, timestamp, price, open_price, high_price, low_price,
            previous_close, change_amount, change_percent, volume,
            data_source, data_quality_score
        ) VALUES %s
        ON CONFLICT (symbol, timestamp) DO UPDATE SET
            price = EXCLUDED.price,
            open_price = EXCLUDED.open_price,
            high_price = EXCLUDED.high_price,
            low_price = EXCLUDED.low_price,
            previous_close = EXCLUDED.previous_close,
            change_amount = EXCLUDED.change_amount,
            change_percent = EXCLUDED.change_percent,
            data_source = EXCLUDED.data_source,
            data_quality_score = EXCLUDED.data_quality_score
    """
    
    # Convert to tuples for batch insert
    data_tuples = []
    for record in transformed_data:
        data_tuple = (
            record['symbol'],
            record['timestamp'],
            record['price'],
            record['open_price'],
            record['high_price'],
            record['low_price'],
            record['previous_close'],
            record['change_amount'],
            record['change_percent'],
            record['volume'],
            record['data_source'],
            record['data_quality_score']
        )
        data_tuples.append(data_tuple)
    
    # Execute batch insert
    postgres_hook.insert_rows(
        table='market_data.quotes',
        rows=data_tuples,
        target_fields=[
            'symbol', 'timestamp', 'price', 'open_price', 'high_price', 'low_price',
            'previous_close', 'change_amount', 'change_percent', 'volume',
            'data_source', 'data_quality_score'
        ],
        replace=True
    )
    
    logger.info(f"Loaded {len(data_tuples)} records to PostgreSQL")

def backup_to_s3(**context):
    """Backup processed data to S3"""
    
    transformed_data = context['task_instance'].xcom_pull(task_ids='transform_market_data')
    
    if not transformed_data:
        logger.warning("No data to backup")
        return
    
    # Create backup file
    execution_date = context['execution_date']
    backup_filename = f"market_data_backup_{execution_date.strftime('%Y%m%d_%H%M%S')}.json"
    
    # Convert to JSON
    backup_data = {
        'execution_date': execution_date.isoformat(),
        'record_count': len(transformed_data),
        'data': transformed_data
    }
    
    # Upload to S3
    s3_hook = S3Hook(aws_conn_id='aws_default')
    s3_hook.load_string(
        string_data=json.dumps(backup_data, indent=2),
        key=f"market-data-backups/{backup_filename}",
        bucket_name='nexus-trade-data-lake'
    )
    
    logger.info(f"Backed up {len(transformed_data)} records to S3: {backup_filename}")

# Define task dependencies
extract_task = PythonOperator(
    task_id='extract_market_data',
    python_callable=extract_market_data,
    dag=market_data_dag
)

transform_task = PythonOperator(
    task_id='transform_market_data',
    python_callable=transform_market_data,
    dag=market_data_dag
)

load_task = PythonOperator(
    task_id='load_to_postgresql',
    python_callable=load_to_postgresql,
    dag=market_data_dag
)

backup_task = PythonOperator(
    task_id='backup_to_s3',
    python_callable=backup_to_s3,
    dag=market_data_dag
)

# Data quality check
quality_check_task = PostgresOperator(
    task_id='data_quality_check',
    postgres_conn_id='postgres_default',
    sql="""
        SELECT 
            symbol,
            COUNT(*) as record_count,
            AVG(data_quality_score) as avg_quality_score,
            MIN(timestamp) as earliest_record,
            MAX(timestamp) as latest_record
        FROM market_data.quotes 
        WHERE timestamp >= NOW() - INTERVAL '1 hour'
        GROUP BY symbol
        HAVING AVG(data_quality_score) < 0.8;
    """,
    dag=market_data_dag
)

# Set task dependencies
extract_task >> transform_task >> [load_task, backup_task] >> quality_check_task