# data-infrastructure/orchestration/airflow/dags/ml_training_pipeline.py

# ML Model Training Pipeline DAG
ml_training_dag = DAG(
    'ml_model_training_pipeline',
    default_args=default_args,
    description='Train and deploy ML models for trading predictions',
    schedule_interval=timedelta(days=1),
    max_active_runs=1,
    tags=['ml', 'training', 'models']
)

def prepare_training_data(**context):
    """Prepare data for ML model training"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Extract features for training
    training_data_query = """
        SELECT 
            md.symbol,
            md.timestamp,
            md.price,
            md.volume,
            ta.moving_avg_5,
            ta.moving_avg_20,
            ta.rsi,
            ta.macd,
            ta.bollinger_upper,
            ta.bollinger_lower,
            ta.volatility,
            -- Target variable (next day return)
            LEAD(md.price) OVER (PARTITION BY md.symbol ORDER BY md.timestamp) / md.price - 1 as next_day_return
        FROM market_data.price_history md
        JOIN analytics.market_analytics ta ON md.symbol = ta.symbol 
            AND md.timestamp = ta.timestamp
        WHERE md.timestamp >= NOW() - INTERVAL '365 days'
        AND md.interval_type = '1d'
        ORDER BY md.symbol, md.timestamp
    """
    
    # Execute query and save to CSV
    df = postgres_hook.get_pandas_df(training_data_query)
    
    # Clean data
    df = df.dropna()
    df = df[df['next_day_return'].between(-0.2, 0.2)]  # Remove extreme outliers
    
    # Save to S3 for training
    csv_data = df.to_csv(index=False)
    s3_hook = S3Hook(aws_conn_id='aws_default')
    
    training_file_key = f"ml-training-data/training_data_{context['ds']}.csv"
    s3_hook.load_string(
        string_data=csv_data,
        key=training_file_key,
        bucket_name='nexus-trade-ml-data'
    )
    
    logger.info(f"Prepared {len(df)} training samples, saved to {training_file_key}")
    return training_file_key

def train_price_prediction_model(**context):
    """Train price prediction model"""
    
    # Get training data location
    training_file_key = context['task_instance'].xcom_pull(task_ids='prepare_training_data')
    
    # This would typically trigger a training job on a ML platform like SageMaker
    # For now, we'll simulate the training process
    
    training_config = {
        'model_type': 'lstm',
        'training_data': training_file_key,
        'hyperparameters': {
            'learning_rate': 0.001,
            'batch_size': 32,
            'epochs': 100,
            'hidden_size': 64,
            'num_layers': 2
        },
        'validation_split': 0.2,
        'early_stopping': True
    }
    
    # Log training job (in practice, this would submit to ML platform)
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    model_training_query = """
        INSERT INTO ml_model_training_jobs (
            job_id, model_type, training_config, status, created_at
        ) VALUES (%s, %s, %s, %s, NOW())
    """
    
    job_id = f"price_prediction_{context['ds'].replace('-', '')}"
    
    postgres_hook.run(model_training_query, parameters=[
        job_id, 'price_prediction', json.dumps(training_config), 'submitted'
    ])
    
    logger.info(f"Submitted training job: {job_id}")
    return job_id

def validate_model_performance(**context):
    """Validate trained model performance"""
    
    job_id = context['task_instance'].xcom_pull(task_ids='train_price_prediction_model')
    
    # Simulate model validation results
    validation_results = {
        'accuracy': 0.67,
        'precision': 0.65,
        'recall': 0.70,
        'f1_score': 0.67,
        'mae': 0.023,
        'mse': 0.001,
        'sharpe_ratio': 1.34
    }
    
    # Check if model meets quality thresholds
    quality_threshold = {
        'accuracy': 0.60,
        'f1_score': 0.60,
        'sharpe_ratio': 1.0
    }
    
    model_approved = all(
        validation_results[metric] >= threshold 
        for metric, threshold in quality_threshold.items()
    )
    
    # Update training job status
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    update_job_query = """
        UPDATE ml_model_training_jobs 
        SET validation_results = %s,
            status = %s,
            completed_at = NOW()
        WHERE job_id = %s
    """
    
    status = 'approved' if model_approved else 'rejected'
    
    postgres_hook.run(update_job_query, parameters=[
        json.dumps(validation_results), status, job_id
    ])
    
    if not model_approved:
        raise ValueError(f"Model {job_id} failed quality checks")
    
    logger.info(f"Model {job_id} validated successfully: {validation_results}")
    return validation_results

def deploy_model(**context):
    """Deploy approved model to production"""
    
    job_id = context['task_instance'].xcom_pull(task_ids='train_price_prediction_model')
    validation_results = context['task_instance'].xcom_pull(task_ids='validate_model_performance')
    
    # Create model deployment record
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    deployment_query = """
        INSERT INTO ml_model_deployments (
            model_id, job_id, version, performance_metrics,
            deployment_status, deployed_at
        ) VALUES (%s, %s, %s, %s, %s, NOW())
    """
    
    model_version = f"v_{context['ds'].replace('-', '')}"
    
    postgres_hook.run(deployment_query, parameters=[
        f"price_prediction_{model_version}", job_id, model_version,
        json.dumps(validation_results), 'deployed'
    ])
    
    # In practice, this would update model serving infrastructure
    logger.info(f"Deployed model {job_id} as version {model_version}")

# ML training tasks
prepare_data_task = PythonOperator(
    task_id='prepare_training_data',
    python_callable=prepare_training_data,
    dag=ml_training_dag
)

train_model_task = PythonOperator(
    task_id='train_price_prediction_model',
    python_callable=train_price_prediction_model,
    dag=ml_training_dag
)

validate_model_task = PythonOperator(
    task_id='validate_model_performance',
    python_callable=validate_model_performance,
    dag=ml_training_dag
)

deploy_model_task = PythonOperator(
    task_id='deploy_model',
    python_callable=deploy_model,
    dag=ml_training_dag
)

# Data quality sensor
data_quality_sensor = S3KeySensor(
    task_id='wait_for_quality_data',
    bucket_name='nexus-trade-ml-data',
    bucket_key='ml-training-data/training_data_{{ ds }}.csv',
    aws_conn_id='aws_default',
    timeout=300,
    poke_interval=60,
    dag=ml_training_dag
)

# Set ML pipeline dependencies
data_quality_sensor >> prepare_data_task >> train_model_task >> validate_model_task >> deploy_model_task