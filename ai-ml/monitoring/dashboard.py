# /ai-ml/monitoring/dashboard.py
import streamlit as st
import pandas as pd
import plotly.express as px
from datetime import datetime, timedelta
import json
import os
from typing import Dict, List

class ModelMonitoringDashboard:
    def __init__(self, metrics_file: str = 'monitoring/metrics.json'):
        self.metrics_file = metrics_file
        self.metrics = self._load_metrics()
        
    def _load_metrics(self) -> List[Dict]:
        if not os.path.exists(self.metrics_file):
            return []
            
        with open(self.metrics_file, 'r') as f:
            return json.load(f)
            
    def render(self):
        st.title("Model Monitoring Dashboard")
        
        if not self.metrics:
            st.warning("No metrics data available")
            return
            
        # Convert to DataFrame
        df = pd.DataFrame(self.metrics)
        df['timestamp'] = pd.to_datetime(df['timestamp'])
        
        # Time range selector
        st.sidebar.header("Filters")
        time_range = st.sidebar.selectbox(
            "Time Range",
            ["1h", "6h", "12h", "24h", "7d", "30d", "All"],
            index=2
        )
        
        if time_range != "All":
            if 'h' in time_range:
                hours = int(time_range.replace('h', ''))
                cutoff = datetime.now() - timedelta(hours=hours)
            elif 'd' in time_range:
                days = int(time_range.replace('d', ''))
                cutoff = datetime.now() - timedelta(days=days)
            df = df[df['timestamp'] >= cutoff]
        
        # Model version selector
        versions = sorted(df['model_version'].unique(), reverse=True)
        selected_versions = st.sidebar.multiselect(
            "Model Versions",
            options=versions,
            default=versions[:1] if versions else []
        )
        
        if selected_versions:
            df = df[df['model_version'].isin(selected_versions)]
        
        # Metrics over time
        st.header("Metrics Over Time")
        metric_cols = [col for col in df.columns if col not in ['timestamp', 'model_version']]
        selected_metric = st.selectbox("Select Metric", metric_cols)
        
        if selected_metric:
            fig = px.line(
                df,
                x='timestamp',
                y=selected_metric,
                color='model_version',
                title=f"{selected_metric} Over Time"
            )
            st.plotly_chart(fig, use_container_width=True)
        
        # Latest metrics
        st.header("Latest Metrics")
        latest = df.sort_values('timestamp', ascending=False).head(1).iloc[0]
        
        col1, col2, col3 = st.columns(3)
        with col1:
            st.metric("Model Version", latest['model_version'])
        with col2:
            st.metric("Prediction Latency (ms)", f"{latest.get('latency_ms', 0):.2f}")
        with col3:
            st.metric("Error Rate", f"{latest.get('error_rate', 0):.2%}")
        
        # Data drift detection
        st.header("Data Drift Detection")
        if 'data_drift' in df.columns:
            drift_fig = px.bar(
                df,
                x='timestamp',
                y='data_drift',
                color='model_version',
                title="Data Drift Over Time"
            )
            st.plotly_chart(drift_fig, use_container_width=True)
        
        # Raw data
        if st.checkbox("Show Raw Data"):
            st.dataframe(df)

if __name__ == "__main__":
    dashboard = ModelMonitoringDashboard()
    dashboard.render()