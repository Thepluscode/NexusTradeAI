# data-infrastructure/orchestration/airflow/dags/compliance_reporting_pipeline.py

# Compliance Reporting Pipeline DAG
compliance_dag = DAG(
    'compliance_reporting_pipeline',
    default_args=default_args,
    description='Generate regulatory compliance reports',
    schedule_interval='0 2 * * *',  # Daily at 2 AM
    max_active_runs=1,
    tags=['compliance', 'regulatory', 'reporting']
)

def generate_trade_surveillance_report(**context):
    """Generate trade surveillance report for compliance"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Generate trade surveillance data
    surveillance_query = """
        WITH suspicious_patterns AS (
            SELECT 
                t.account_id,
                t.symbol,
                t.executed_at::date as trade_date,
                COUNT(*) as trade_count,
                SUM(t.quantity) as total_quantity,
                SUM(t.value) as total_value,
                STDDEV(t.price) as price_volatility,
                -- Check for potential front-running
                CASE WHEN COUNT(*) > 50 AND STDDEV(t.price) > AVG(t.price) * 0.05 
                     THEN 'HIGH_FREQUENCY_VOLATILE' 
                     ELSE 'NORMAL' END as pattern_flag
            FROM trading.trades t
            WHERE t.executed_at >= CURRENT_DATE - INTERVAL '1 day'
            AND t.executed_at < CURRENT_DATE
            GROUP BY t.account_id, t.symbol, t.executed_at::date
        ),
        large_trades AS (
            SELECT 
                account_id,
                symbol,
                quantity,
                value,
                executed_at,
                'LARGE_TRADE' as flag_type
            FROM trading.trades
            WHERE value > 1000000  -- Trades over $1M
            AND executed_at >= CURRENT_DATE - INTERVAL '1 day'
            AND executed_at < CURRENT_DATE
        )
        INSERT INTO compliance.daily_surveillance_report (
            report_date, account_id, symbol, flag_type, 
            details, trade_count, total_value, created_at
        )
        SELECT 
            CURRENT_DATE - INTERVAL '1 day',
            sp.account_id,
            sp.symbol,
            sp.pattern_flag,
            json_build_object(
                'trade_count', sp.trade_count,
                'total_quantity', sp.total_quantity,
                'price_volatility', sp.price_volatility
            ),
            sp.trade_count,
            sp.total_value,
            NOW()
        FROM suspicious_patterns sp
        WHERE sp.pattern_flag != 'NORMAL'
        
        UNION ALL
        
        SELECT 
            CURRENT_DATE - INTERVAL '1 day',
            lt.account_id,
            lt.symbol,
            lt.flag_type,
            json_build_object(
                'trade_quantity', lt.quantity,
                'trade_value', lt.value,
                'executed_at', lt.executed_at
            ),
            1,
            lt.value,
            NOW()
        FROM large_trades lt
    """
    
    postgres_hook.run(surveillance_query)
    
    # Get report summary
    summary_query = """
        SELECT 
            flag_type,
            COUNT(*) as incident_count,
            SUM(total_value) as total_flagged_value
        FROM compliance.daily_surveillance_report
        WHERE report_date = CURRENT_DATE - INTERVAL '1 day'
        GROUP BY flag_type
    """
    
    summary = postgres_hook.get_records(summary_query)
    logger.info(f"Trade surveillance report generated: {summary}")
    
    return summary

def generate_position_limits_report(**context):
    """Generate position limits compliance report"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Check position limit compliance
    limits_query = """
        INSERT INTO compliance.position_limits_report (
            report_date, account_id, symbol, position_size,
            limit_value, breach_amount, severity, created_at
        )
        SELECT 
            CURRENT_DATE,
            p.account_id,
            p.symbol,
            p.quantity,
            rl.limit_value,
            p.quantity - rl.limit_value as breach_amount,
            CASE 
                WHEN p.quantity > rl.limit_value * 1.5 THEN 'CRITICAL'
                WHEN p.quantity > rl.limit_value * 1.2 THEN 'HIGH'
                WHEN p.quantity > rl.limit_value THEN 'MEDIUM'
                ELSE 'COMPLIANT'
            END as severity,
            NOW()
        FROM trading.positions p
        JOIN risk_management.risk_limits rl ON p.account_id = rl.account_id
        WHERE rl.limit_type = 'position_size'
        AND rl.is_active = true
        AND p.quantity > 0
        AND (
            rl.instrument_filter IS NULL OR 
            rl.instrument_filter::jsonb @> json_build_object('symbol', p.symbol)::jsonb
        )
        ON CONFLICT (report_date, account_id, symbol) 
        DO UPDATE SET
            position_size = EXCLUDED.position_size,
            breach_amount = EXCLUDED.breach_amount,
            severity = EXCLUDED.severity
    """
    
    postgres_hook.run(limits_query)
    logger.info("Position limits compliance report generated")

def export_regulatory_files(**context):
    """Export regulatory filing files"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    s3_hook = S3Hook(aws_conn_id='aws_default')
    
    # Export trade data for regulatory filing
    export_query = """
        SELECT 
            t.trade_id as "Trade ID",
            a.account_number as "Account Number",
            i.symbol as "Symbol",
            t.side as "Side",
            t.quantity as "Quantity", 
            t.price as "Price",
            t.value as "Trade Value",
            t.executed_at as "Execution Time",
            t.settlement_date as "Settlement Date",
            'EQUITY' as "Instrument Type"
        FROM trading.trades t
        JOIN trading.accounts a ON t.account_id = a.id
        JOIN trading.instruments i ON t.instrument_id = i.id
        WHERE t.executed_at >= CURRENT_DATE - INTERVAL '1 day'
        AND t.executed_at < CURRENT_DATE
        ORDER BY t.executed_at
    """
    
    df = postgres_hook.get_pandas_df(export_query)
    
    # Generate regulatory file
    file_date = (context['execution_date'] - timedelta(days=1)).strftime('%Y%m%d')
    filename = f"NEXUS_TRADE_DAILY_TRADES_{file_date}.csv"
    
    csv_content = df.to_csv(index=False)
    
    # Upload to S3
    s3_hook.load_string(
        string_data=csv_content,
        key=f"regulatory-filings/{filename}",
        bucket_name='nexus-trade-compliance'
    )
    
    # Record filing
    filing_query = """
        INSERT INTO compliance.regulatory_reports (
            report_type, report_period_start, report_period_end,
            file_path, status, generated_by, generated_at
        ) VALUES (%s, %s, %s, %s, %s, %s, NOW())
    """
    
    postgres_hook.run(filing_query, parameters=[
        'DAILY_TRADES',
        context['execution_date'] - timedelta(days=1),
        context['execution_date'],
        f"s3://nexus-trade-compliance/regulatory-filings/{filename}",
        'generated',
        'airflow_system'
    ])
    
    logger.info(f"Exported regulatory file: {filename} with {len(df)} trades")

# Compliance tasks
surveillance_task = PythonOperator(
    task_id='generate_trade_surveillance_report',
    python_callable=generate_trade_surveillance_report,
    dag=compliance_dag
)

position_limits_task = PythonOperator(
    task_id='generate_position_limits_report',
    python_callable=generate_position_limits_report,
    dag=compliance_dag
)

export_files_task = PythonOperator(
    task_id='export_regulatory_files',
    python_callable=export_regulatory_files,
    dag=compliance_dag
)

# Compliance notification task
compliance_alert_task = PostgresOperator(
    task_id='send_compliance_alerts',
    postgres_conn_id='postgres_default',
    sql="""
        -- Insert notifications for compliance breaches
        INSERT INTO notifications.notification_queue (
            user_id, notification_type, title, message, 
            delivery_channels, priority, data
        )
        SELECT 
            'compliance_team',
            'compliance_breach',
            'Daily Compliance Alert',
            'Compliance issues detected: ' || 
            (SELECT COUNT(*) FROM compliance.daily_surveillance_report 
             WHERE report_date = CURRENT_DATE - INTERVAL '1 day') ||
            ' surveillance flags, ' ||
            (SELECT COUNT(*) FROM compliance.position_limits_report 
             WHERE report_date = CURRENT_DATE AND severity != 'COMPLIANT') ||
            ' position limit breaches',
            ARRAY['email', 'in_app'],
            2,
            json_build_object('report_date', CURRENT_DATE - INTERVAL '1 day')
        WHERE EXISTS (
            SELECT 1 FROM compliance.daily_surveillance_report 
            WHERE report_date = CURRENT_DATE - INTERVAL '1 day'
        ) OR EXISTS (
            SELECT 1 FROM compliance.position_limits_report 
            WHERE report_date = CURRENT_DATE AND severity != 'COMPLIANT'
        );
    """,
    dag=compliance_dag
)

# Set compliance pipeline dependencies
[surveillance_task, position_limits_task] >> export_files_task >> compliance_alert_task