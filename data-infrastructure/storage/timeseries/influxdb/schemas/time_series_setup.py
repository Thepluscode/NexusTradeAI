# data-infrastructure/storage/timeseries/influxdb/schemas/time_series_setup.py

from influxdb_client import InfluxDBClient, BucketsApi, OrganizationsApi
from influxdb_client.domain.bucket import Bucket
from influxdb_client.domain.bucket_retention_rules import BucketRetentionRules
from influxdb_client.domain.organization import Organization
import os
from typing import List, Dict
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class InfluxDBSchemaManager:
    """Manages InfluxDB schemas, buckets, and retention policies for trading platform"""
    
    def __init__(self, 
                 url: str = "http://localhost:8086",
                 token: str = None,
                 org: str = "nexus-trade"):
        self.url = url
        self.token = token or os.getenv('INFLUXDB_TOKEN')
        self.org = org
        self.client = InfluxDBClient(url=self.url, token=self.token, org=self.org)
        self.buckets_api = self.client.buckets_api()
        self.orgs_api = self.client.organizations_api()
    
    def setup_complete_schema(self):
        """Setup complete InfluxDB schema for trading platform"""
        logger.info("Setting up InfluxDB schema...")
        
        # Sentiment analysis - 90 days retention
        self._create_bucket_with_retention(
            name="sentiment-analysis",
            description="News and social media sentiment scores",
            retention_seconds=90 * 24 * 3600  # 90 days
        )
        
        # ML model predictions - 6 months retention
        self._create_bucket_with_retention(
            name="ml-predictions",
            description="Machine learning model predictions and scores",
            retention_seconds=180 * 24 * 3600  # 6 months
        )
        
        # Strategy performance - 2 years retention
        self._create_bucket_with_retention(
            name="strategy-performance",
            description="Trading strategy performance metrics",
            retention_seconds=2 * 365 * 24 * 3600  # 2 years
        )
    
    def _create_risk_buckets(self):
        """Create buckets for risk management data"""
        
        # Risk metrics - 2 years retention for compliance
        self._create_bucket_with_retention(
            name="risk-metrics",
            description="VaR, stress test results, and risk calculations",
            retention_seconds=2 * 365 * 24 * 3600  # 2 years
        )
        
        # Risk events - 3 years retention
        self._create_bucket_with_retention(
            name="risk-events",
            description="Risk alerts, breaches, and incidents",
            retention_seconds=3 * 365 * 24 * 3600  # 3 years
        )
        
        # Exposure calculations - 1 year retention
        self._create_bucket_with_retention(
            name="exposure-metrics",
            description="Portfolio exposure calculations by sector, country, etc.",
            retention_seconds=365 * 24 * 3600  # 1 year
        )
    
    def _create_performance_buckets(self):
        """Create buckets for system performance monitoring"""
        
        # Application metrics - 30 days retention
        self._create_bucket_with_retention(
            name="app-metrics",
            description="Application performance metrics (latency, throughput)",
            retention_seconds=30 * 24 * 3600  # 30 days
        )
        
        # System metrics - 90 days retention
        self._create_bucket_with_retention(
            name="system-metrics",
            description="System resource utilization metrics",
            retention_seconds=90 * 24 * 3600  # 90 days
        )
        
        # API metrics - 30 days retention
        self._create_bucket_with_retention(
            name="api-metrics",
            description="API call metrics and response times",
            retention_seconds=30 * 24 * 3600  # 30 days
        )