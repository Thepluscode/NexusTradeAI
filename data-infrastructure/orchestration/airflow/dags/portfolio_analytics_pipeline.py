# data-infrastructure/orchestration/airflow/dags/portfolio_analytics_pipeline.py

# Portfolio Analytics Pipeline DAG
portfolio_analytics_dag = DAG(
    'portfolio_analytics_pipeline',
    default_args=default_args,
    description='Calculate portfolio analytics and risk metrics',
    schedule_interval=timedelta(hours=1),
    max_active_runs=1,
    tags=['portfolio', 'analytics', 'risk']
)

def calculate_portfolio_metrics(**context):
    """Calculate portfolio-level metrics"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Get all active portfolios
    portfolios_query = """
        SELECT DISTINCT account_id 
        FROM trading.accounts 
        WHERE status = 'active'
    """
    
    portfolios = postgres_hook.get_records(portfolios_query)
    
    metrics_calculated = 0
    
    for (account_id,) in portfolios:
        try:
            # Calculate portfolio value
            portfolio_value_query = """
                SELECT 
                    a.account_id,
                    a.cash_balance,
                    COALESCE(SUM(p.market_value), 0) as equity_value,
                    COALESCE(SUM(p.unrealized_pnl), 0) as unrealized_pnl,
                    COALESCE(SUM(p.realized_pnl), 0) as realized_pnl,
                    COUNT(p.id) as position_count
                FROM trading.accounts a
                LEFT JOIN trading.positions p ON a.id = p.account_id AND p.quantity != 0
                WHERE a.id = %s
                GROUP BY a.account_id, a.cash_balance
            """
            
            portfolio_data = postgres_hook.get_first(portfolio_value_query, parameters=[account_id])
            
            if portfolio_data:
                account_id, cash_balance, equity_value, unrealized_pnl, realized_pnl, position_count = portfolio_data
                total_value = float(cash_balance) + float(equity_value)
                
                # Calculate additional metrics
                day_pnl = unrealized_pnl  # Simplified - would need intraday calculation
                total_pnl = unrealized_pnl + realized_pnl
                
                # Insert portfolio analytics
                insert_analytics_query = """
                    INSERT INTO analytics.portfolio_analytics (
                        account_id, timestamp, total_value, cash_value, equity_value,
                        day_pnl, total_pnl, day_pnl_percent, total_pnl_percent
                    ) VALUES (%s, NOW(), %s, %s, %s, %s, %s, %s, %s)
                """
                
                day_pnl_percent = (day_pnl / total_value * 100) if total_value > 0 else 0
                total_pnl_percent = (total_pnl / (total_value - total_pnl) * 100) if (total_value - total_pnl) > 0 else 0
                
                postgres_hook.run(insert_analytics_query, parameters=[
                    account_id, total_value, cash_balance, equity_value,
                    day_pnl, total_pnl, day_pnl_percent, total_pnl_percent
                ])
                
                metrics_calculated += 1
                
        except Exception as e:
            logger.error(f"Error calculating metrics for account {account_id}: {e}")
    
    logger.info(f"Calculated metrics for {metrics_calculated} portfolios")
    return metrics_calculated

def calculate_risk_metrics(**context):
    """Calculate portfolio risk metrics"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Calculate VaR for each portfolio
    var_calculation_query = """
        WITH portfolio_returns AS (
            SELECT 
                pa1.account_id,
                pa1.timestamp,
                pa1.total_value,
                LAG(pa1.total_value) OVER (PARTITION BY pa1.account_id ORDER BY pa1.timestamp) as prev_value,
                (pa1.total_value - LAG(pa1.total_value) OVER (PARTITION BY pa1.account_id ORDER BY pa1.timestamp)) 
                / LAG(pa1.total_value) OVER (PARTITION BY pa1.account_id ORDER BY pa1.timestamp) as daily_return
            FROM analytics.portfolio_analytics pa1
            WHERE pa1.timestamp >= NOW() - INTERVAL '30 days'
        ),
        var_calculations AS (
            SELECT 
                account_id,
                PERCENTILE_CONT(0.05) WITHIN GROUP (ORDER BY daily_return) as var_95,
                PERCENTILE_CONT(0.01) WITHIN GROUP (ORDER BY daily_return) as var_99,
                STDDEV(daily_return) as volatility,
                AVG(daily_return) as avg_return,
                MAX(total_value) as max_value
            FROM portfolio_returns
            WHERE daily_return IS NOT NULL
            GROUP BY account_id
        )
        INSERT INTO risk_management.var_calculations (
            account_id, calculation_date, confidence_level, time_horizon,
            var_amount, portfolio_value, var_percentage, method
        )
        SELECT 
            account_id,
            CURRENT_DATE,
            95,
            1,
            var_95 * max_value,
            max_value,
            var_95 * 100,
            'historical'
        FROM var_calculations
        WHERE max_value > 0
        ON CONFLICT (account_id, calculation_date, confidence_level, time_horizon) 
        DO UPDATE SET
            var_amount = EXCLUDED.var_amount,
            portfolio_value = EXCLUDED.portfolio_value,
            var_percentage = EXCLUDED.var_percentage
    """
    
    postgres_hook.run(var_calculation_query)
    logger.info("Calculated VaR metrics for all portfolios")

def generate_risk_alerts(**context):
    """Generate risk alerts based on thresholds"""
    
    postgres_hook = PostgresHook(postgres_conn_id='postgres_default')
    
    # Check for risk limit breaches
    risk_breach_query = """
        SELECT 
            vc.account_id,
            vc.var_amount,
            rl.limit_value,
            u.email
        FROM risk_management.var_calculations vc
        JOIN risk_management.risk_limits rl ON vc.account_id = rl.account_id
        JOIN trading.accounts a ON vc.account_id = a.id
        JOIN auth.users u ON a.user_id = u.id
        WHERE vc.calculation_date = CURRENT_DATE
        AND rl.limit_type = 'daily_loss'
        AND rl.is_active = true
        AND ABS(vc.var_amount) > rl.limit_value
    """
    
    breaches = postgres_hook.get_records(risk_breach_query)
    
    for account_id, var_amount, limit_value, email in breaches:
        # Insert risk event
        risk_event_query = """
            INSERT INTO risk_management.risk_events (
                account_id, event_type, severity, description,
                risk_metric, current_value, threshold_value
            ) VALUES (%s, %s, %s, %s, %s, %s, %s)
        """
        
        postgres_hook.run(risk_event_query, parameters=[
            account_id, 'limit_breach', 'high',
            f'VaR limit breach detected. Current VaR: {var_amount}, Limit: {limit_value}',
            'var_95', abs(var_amount), limit_value
        ])
        
        # Could trigger email notification here
        logger.warning(f"Risk limit breach for account {account_id}: VaR {var_amount} > Limit {limit_value}")
    
    return len(breaches)

# Portfolio analytics tasks
calculate_portfolio_task = PythonOperator(
    task_id='calculate_portfolio_metrics',
    python_callable=calculate_portfolio_metrics,
    dag=portfolio_analytics_dag
)

calculate_risk_task = PythonOperator(
    task_id='calculate_risk_metrics',
    python_callable=calculate_risk_metrics,
    dag=portfolio_analytics_dag
)

risk_alerts_task = PythonOperator(
    task_id='generate_risk_alerts',
    python_callable=generate_risk_alerts,
    dag=portfolio_analytics_dag
)

# Portfolio reporting task
portfolio_report_task = PostgresOperator(
    task_id='generate_portfolio_report',
    postgres_conn_id='postgres_default',
    sql="""
        -- Create daily portfolio summary
        INSERT INTO analytics.daily_portfolio_summary (
            report_date, total_accounts, total_value, total_pnl,
            avg_portfolio_size, high_risk_accounts
        )
        SELECT 
            CURRENT_DATE,
            COUNT(DISTINCT pa.account_id),
            SUM(pa.total_value),
            SUM(pa.total_pnl),
            AVG(pa.total_value),
            COUNT(CASE WHEN ABS(vc.var_percentage) > 5 THEN 1 END)
        FROM analytics.portfolio_analytics pa
        LEFT JOIN risk_management.var_calculations vc ON pa.account_id = vc.account_id 
            AND vc.calculation_date = CURRENT_DATE
        WHERE pa.timestamp::date = CURRENT_DATE
        ON CONFLICT (report_date) DO UPDATE SET
            total_accounts = EXCLUDED.total_accounts,
            total_value = EXCLUDED.total_value,
            total_pnl = EXCLUDED.total_pnl,
            avg_portfolio_size = EXCLUDED.avg_portfolio_size,
            high_risk_accounts = EXCLUDED.high_risk_accounts;
    """,
    dag=portfolio_analytics_dag
)

# Set task dependencies
calculate_portfolio_task >> calculate_risk_task >> risk_alerts_task >> portfolio_report_task