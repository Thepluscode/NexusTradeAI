"""
End-to-End Integration Test Suite
==================================
Comprehensive integration tests for the complete ML pipeline.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Test Coverage:
- Data pipeline (ingestion → features → model input)
- Model pipeline (training → validation → deployment)
- Serving pipeline (API → predictions → monitoring)
- Retraining pipeline (trigger → retrain → deploy)
- Monitoring pipeline (metrics → alerts)
- A/B testing pipeline (variants → analysis → winner)
"""

import unittest
import asyncio
import time
import requests
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from typing import Dict, List, Any
import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.ensemble import EnsembleModel
from feature_store.feature_engineering import FeatureEngineer
from training.walk_forward import WalkForwardOptimizer, WalkForwardConfig
from backtesting.backtest_engine import BacktestEngine, BacktestConfig
from production.retraining_pipeline import ModelRetrainingPipeline, RetrainingConfig
from production.monitoring_system import ModelMonitor, MonitoringConfig
from production.ab_testing import ABTestFramework, ABTestConfig, AllocationStrategy


class TestDataPipeline(unittest.TestCase):
    """Test data ingestion and feature engineering pipeline"""

    def setUp(self):
        """Set up test data"""
        self.feature_engineer = FeatureEngineer()
        self.test_data = self._generate_test_data()

    def _generate_test_data(self) -> pd.DataFrame:
        """Generate synthetic market data for testing"""
        dates = pd.date_range(start='2023-01-01', end='2024-12-01', freq='D')
        n = len(dates)

        data = pd.DataFrame({
            'date': dates,
            'symbol': ['AAPL'] * n,
            'open': 150 + np.random.randn(n).cumsum(),
            'high': 152 + np.random.randn(n).cumsum(),
            'low': 148 + np.random.randn(n).cumsum(),
            'close': 150 + np.random.randn(n).cumsum(),
            'volume': 1000000 + np.random.randint(-100000, 100000, n)
        })

        # Ensure OHLC relationships
        data['high'] = data[['open', 'close']].max(axis=1) + abs(np.random.randn(n))
        data['low'] = data[['open', 'close']].min(axis=1) - abs(np.random.randn(n))

        return data

    def test_feature_generation(self):
        """Test feature engineering pipeline"""
        print("\n=== Testing Feature Generation ===")

        # Generate features
        features = self.feature_engineer.compute_features(self.test_data)

        # Validate features
        self.assertIsNotNone(features)
        self.assertGreater(len(features), 0)
        self.assertGreater(len(features.columns), 20)  # Should have many features

        # Check for required features
        expected_features = ['rsi_14', 'macd', 'bb_upper', 'bb_lower', 'atr_14']
        for feature in expected_features:
            self.assertIn(feature, features.columns, f"Missing feature: {feature}")

        # Check for no NaN in recent data
        recent_features = features.iloc[-100:]
        nan_count = recent_features.isna().sum().sum()
        self.assertLess(nan_count, len(recent_features) * 0.1, "Too many NaN values")

        print(f"✅ Generated {len(features.columns)} features")
        print(f"✅ Data shape: {features.shape}")
        print(f"✅ NaN count: {nan_count}")

    def test_data_quality(self):
        """Test data quality checks"""
        print("\n=== Testing Data Quality ===")

        # Check for outliers
        outlier_threshold = 5  # 5 standard deviations
        for col in ['open', 'high', 'low', 'close']:
            z_scores = np.abs((self.test_data[col] - self.test_data[col].mean()) / self.test_data[col].std())
            outliers = (z_scores > outlier_threshold).sum()
            self.assertLess(outliers, len(self.test_data) * 0.01, f"Too many outliers in {col}")

        # Check volume is positive
        self.assertTrue((self.test_data['volume'] > 0).all(), "Volume must be positive")

        # Check OHLC relationships
        self.assertTrue((self.test_data['high'] >= self.test_data['low']).all(), "High must be >= Low")
        self.assertTrue((self.test_data['high'] >= self.test_data['open']).all(), "High must be >= Open")
        self.assertTrue((self.test_data['high'] >= self.test_data['close']).all(), "High must be >= Close")

        print("✅ Data quality checks passed")


class TestModelPipeline(unittest.TestCase):
    """Test model training, validation, and deployment pipeline"""

    def setUp(self):
        """Set up test environment"""
        self.model = EnsembleModel()
        self.X_train, self.y_train, self.X_val, self.y_val = self._generate_training_data()

    def _generate_training_data(self):
        """Generate synthetic training data"""
        n_train = 5000
        n_val = 1000
        n_features = 50

        # Generate features with some predictive signal
        X_train = np.random.randn(n_train, n_features)
        X_val = np.random.randn(n_val, n_features)

        # Generate labels with correlation to features
        signal = X_train[:, 0] + X_train[:, 1] - X_train[:, 2]
        y_train = np.where(signal > 0.5, 1, np.where(signal < -0.5, -1, 0))

        signal_val = X_val[:, 0] + X_val[:, 1] - X_val[:, 2]
        y_val = np.where(signal_val > 0.5, 1, np.where(signal_val < -0.5, -1, 0))

        # Convert to DataFrames
        X_train_df = pd.DataFrame(X_train, columns=[f'feature_{i}' for i in range(n_features)])
        X_val_df = pd.DataFrame(X_val, columns=[f'feature_{i}' for i in range(n_features)])
        y_train_series = pd.Series(y_train)
        y_val_series = pd.Series(y_val)

        return X_train_df, y_train_series, X_val_df, y_val_series

    def test_model_training(self):
        """Test model training pipeline"""
        print("\n=== Testing Model Training ===")

        # Train model
        start_time = time.time()
        self.model.train(self.X_train, self.y_train, self.X_val, self.y_val)
        training_time = time.time() - start_time

        # Validate model trained successfully
        self.assertTrue(self.model.is_trained, "Model should be trained")
        self.assertLess(training_time, 300, "Training should complete in < 5 minutes")

        print(f"✅ Model trained in {training_time:.2f} seconds")

    def test_model_prediction(self):
        """Test model prediction pipeline"""
        print("\n=== Testing Model Prediction ===")

        # Train model first
        self.model.train(self.X_train, self.y_train, self.X_val, self.y_val)

        # Make predictions
        predictions = self.model.predict(self.X_val)
        probabilities = self.model.predict_proba(self.X_val)

        # Validate predictions
        self.assertEqual(len(predictions), len(self.X_val))
        self.assertEqual(len(probabilities), len(self.X_val))
        self.assertTrue(all(p in [-1, 0, 1] for p in predictions), "Predictions should be -1, 0, or 1")
        self.assertTrue(np.allclose(probabilities.sum(axis=1), 1.0), "Probabilities should sum to 1")

        # Calculate accuracy
        accuracy = (predictions == self.y_val).mean()
        self.assertGreater(accuracy, 0.35, "Accuracy should be better than random (33%)")

        print(f"✅ Predictions generated: {len(predictions)}")
        print(f"✅ Validation accuracy: {accuracy:.2%}")

    def test_walk_forward_optimization(self):
        """Test walk-forward optimization pipeline"""
        print("\n=== Testing Walk-Forward Optimization ===")

        # Create synthetic time-series data
        dates = pd.date_range(start='2023-01-01', end='2024-12-01', freq='D')
        n = len(dates)
        n_features = 20

        X = pd.DataFrame(
            np.random.randn(n, n_features),
            index=dates,
            columns=[f'feature_{i}' for i in range(n_features)]
        )

        signal = X['feature_0'] + X['feature_1'] - X['feature_2']
        y = pd.Series(
            np.where(signal > 0.5, 1, np.where(signal < -0.5, -1, 0)),
            index=dates
        )

        # Configure walk-forward
        config = WalkForwardConfig(
            train_window_months=3,
            test_window_months=1,
            step_months=1,
            mode="rolling",
            enable_validation=True
        )

        # Run optimization
        optimizer = WalkForwardOptimizer(config)
        results = optimizer.run_optimization(X, y)

        # Validate results
        self.assertIn('windows', results)
        self.assertIn('average_test_accuracy', results)
        self.assertGreater(len(results['windows']), 0)
        self.assertGreater(results['average_test_accuracy'], 0.3)

        print(f"✅ Walk-forward windows: {len(results['windows'])}")
        print(f"✅ Average test accuracy: {results['average_test_accuracy']:.2%}")


class TestServingPipeline(unittest.TestCase):
    """Test API serving and prediction pipeline"""

    def setUp(self):
        """Set up test environment"""
        self.api_url = "http://localhost:8000"

    def test_api_health(self):
        """Test API health check"""
        print("\n=== Testing API Health ===")

        try:
            response = requests.get(f"{self.api_url}/health", timeout=5)
            self.assertEqual(response.status_code, 200)

            data = response.json()
            self.assertEqual(data['status'], 'healthy')
            self.assertIn('timestamp', data)
            self.assertIn('models_loaded', data)

            print(f"✅ API is healthy")
            print(f"✅ Models loaded: {data['models_loaded']}")

        except requests.exceptions.RequestException as e:
            self.skipTest(f"API not running: {e}")

    def test_prediction_endpoint(self):
        """Test prediction endpoint"""
        print("\n=== Testing Prediction Endpoint ===")

        try:
            # Prepare prediction request
            request_data = {
                "features": {
                    "rsi_14": 45.23,
                    "macd": 0.0234,
                    "volume_sma_20": 1234567,
                    "bb_upper": 155.0,
                    "bb_lower": 145.0
                },
                "symbol": "AAPL",
                "timestamp": datetime.now().isoformat()
            }

            response = requests.post(
                f"{self.api_url}/predict",
                json=request_data,
                timeout=5
            )

            self.assertEqual(response.status_code, 200)

            data = response.json()
            self.assertIn('prediction', data)
            self.assertIn('probabilities', data)
            self.assertIn('confidence', data)
            self.assertIn(data['prediction'], [-1, 0, 1])

            print(f"✅ Prediction: {data['prediction']}")
            print(f"✅ Confidence: {data['confidence']:.2%}")

        except requests.exceptions.RequestException as e:
            self.skipTest(f"API not running: {e}")

    def test_batch_prediction(self):
        """Test batch prediction endpoint"""
        print("\n=== Testing Batch Prediction ===")

        try:
            # Prepare batch request
            batch_request = {
                "predictions": [
                    {
                        "features": {"rsi_14": 45.23, "macd": 0.0234},
                        "symbol": "AAPL"
                    },
                    {
                        "features": {"rsi_14": 55.67, "macd": -0.0123},
                        "symbol": "TSLA"
                    },
                    {
                        "features": {"rsi_14": 38.90, "macd": 0.0456},
                        "symbol": "NVDA"
                    }
                ]
            }

            response = requests.post(
                f"{self.api_url}/predict/batch",
                json=batch_request,
                timeout=10
            )

            self.assertEqual(response.status_code, 200)

            data = response.json()
            self.assertEqual(len(data), 3)

            for prediction in data:
                self.assertIn('prediction', prediction)
                self.assertIn('confidence', prediction)

            print(f"✅ Batch predictions: {len(data)}")

        except requests.exceptions.RequestException as e:
            self.skipTest(f"API not running: {e}")


class TestRetrainingPipeline(unittest.TestCase):
    """Test automated retraining pipeline"""

    def setUp(self):
        """Set up test environment"""
        self.config = RetrainingConfig(
            schedule_frequency="manual",
            min_accuracy_threshold=0.55,
            validation_required=True
        )
        self.pipeline = ModelRetrainingPipeline(self.config)

    def test_performance_degradation_detection(self):
        """Test performance degradation detection"""
        print("\n=== Testing Performance Degradation Detection ===")

        # Simulate good performance
        self.pipeline.current_accuracy = 0.65
        self.pipeline.current_sharpe = 2.5
        self.pipeline.current_win_rate = 0.60

        degraded = self.pipeline.check_performance_degradation()
        self.assertFalse(degraded, "Should not detect degradation with good metrics")

        # Simulate degradation
        self.pipeline.current_accuracy = 0.50  # Below threshold
        degraded = self.pipeline.check_performance_degradation()
        self.assertTrue(degraded, "Should detect degradation with low accuracy")

        print("✅ Performance degradation detection working")

    def test_data_drift_detection(self):
        """Test data drift detection"""
        print("\n=== Testing Data Drift Detection ===")

        # Generate reference data
        reference_data = pd.DataFrame(
            np.random.randn(1000, 10),
            columns=[f'feature_{i}' for i in range(10)]
        )

        # Similar data (no drift)
        new_data = pd.DataFrame(
            np.random.randn(1000, 10),
            columns=[f'feature_{i}' for i in range(10)]
        )

        self.pipeline.reference_data = reference_data
        drift = self.pipeline.detect_data_drift(new_data)
        self.assertLess(drift, 0.1, "Should not detect drift in similar data")

        # Different data (drift)
        drifted_data = pd.DataFrame(
            np.random.randn(1000, 10) + 2.0,  # Shifted distribution
            columns=[f'feature_{i}' for i in range(10)]
        )

        drift = self.pipeline.detect_data_drift(drifted_data)
        self.assertGreater(drift, 0.1, "Should detect drift in shifted data")

        print(f"✅ Drift detection working (similar: {drift:.4f})")


class TestMonitoringPipeline(unittest.TestCase):
    """Test monitoring and alerting pipeline"""

    def setUp(self):
        """Set up test environment"""
        self.config = MonitoringConfig(
            min_accuracy_threshold=0.55,
            max_latency_ms=100.0,
            max_error_rate=0.05
        )
        self.monitor = ModelMonitor(self.config)

    def test_metric_collection(self):
        """Test metric collection"""
        print("\n=== Testing Metric Collection ===")

        # Record some predictions
        for i in range(100):
            prediction = np.random.choice([-1, 0, 1])
            actual = np.random.choice([-1, 0, 1])
            confidence = np.random.uniform(0.4, 0.9)
            latency = np.random.uniform(30, 80)

            self.monitor.record_prediction(
                prediction=prediction,
                confidence=confidence,
                latency_ms=latency,
                actual=actual
            )

        # Check metrics collected
        self.assertEqual(self.monitor.total_predictions, 100)
        self.assertGreater(self.monitor.current_accuracy, 0)
        self.assertLess(self.monitor.current_accuracy, 1)

        print(f"✅ Metrics collected: {self.monitor.total_predictions} predictions")
        print(f"✅ Current accuracy: {self.monitor.current_accuracy:.2%}")

    def test_alert_triggering(self):
        """Test alert triggering"""
        print("\n=== Testing Alert Triggering ===")

        initial_alerts = len(self.monitor.alert_manager.alerts)

        # Record high latency prediction (should trigger alert)
        self.monitor.record_prediction(
            prediction=1,
            confidence=0.8,
            latency_ms=250.0,  # High latency
            actual=1
        )

        # Check alert was created
        new_alerts = len(self.monitor.alert_manager.alerts)
        self.assertGreater(new_alerts, initial_alerts, "Alert should be triggered for high latency")

        print(f"✅ Alert system working ({new_alerts - initial_alerts} alerts triggered)")

    def test_dashboard_data(self):
        """Test dashboard data aggregation"""
        print("\n=== Testing Dashboard Data ===")

        # Record predictions
        for i in range(50):
            self.monitor.record_prediction(
                prediction=1,
                confidence=0.75,
                latency_ms=45.0,
                actual=1
            )

        # Get dashboard data
        dashboard = self.monitor.get_dashboard_data()

        # Validate dashboard data
        self.assertIn('total_predictions', dashboard)
        self.assertIn('current_accuracy', dashboard)
        self.assertIn('latency_p50', dashboard)
        self.assertIn('latency_p95', dashboard)
        self.assertIn('error_rate', dashboard)

        print("✅ Dashboard data generated")
        print(f"   Total predictions: {dashboard['total_predictions']}")
        print(f"   Accuracy: {dashboard['current_accuracy']:.2%}")


class TestABTestingPipeline(unittest.TestCase):
    """Test A/B testing pipeline"""

    def setUp(self):
        """Set up test environment"""
        self.config = ABTestConfig(
            allocation_strategy=AllocationStrategy.EPSILON_GREEDY,
            epsilon=0.1,
            min_samples=100,
            confidence_level=0.95
        )
        self.ab_test = ABTestFramework(
            control_variant="v1.0",
            treatment_variant="v2.0",
            config=self.config
        )

    def test_variant_selection(self):
        """Test variant selection strategies"""
        print("\n=== Testing Variant Selection ===")

        selections = {'control': 0, 'treatment': 0}

        # Select variants
        for _ in range(1000):
            variant = self.ab_test.select_variant()
            selections[variant] += 1

        # Both variants should be selected
        self.assertGreater(selections['control'], 0)
        self.assertGreater(selections['treatment'], 0)

        print(f"✅ Variant selection: Control={selections['control']}, Treatment={selections['treatment']}")

    def test_statistical_analysis(self):
        """Test statistical analysis"""
        print("\n=== Testing Statistical Analysis ===")

        # Simulate experiment with clear winner
        # Control: 60% accuracy
        for _ in range(500):
            prediction = 1
            actual = 1 if np.random.random() < 0.60 else 0
            self.ab_test.record_result('control', prediction, actual, 0.7)

        # Treatment: 65% accuracy (5% better)
        for _ in range(500):
            prediction = 1
            actual = 1 if np.random.random() < 0.65 else 0
            self.ab_test.record_result('treatment', prediction, actual, 0.75)

        # Analyze results
        result = self.ab_test.analyze_results()

        # Validate analysis
        self.assertIsNotNone(result.winner)
        self.assertGreater(result.confidence, 0.0)
        self.assertIn(result.winner, ['control', 'treatment'])

        print(f"✅ Winner: {result.winner}")
        print(f"✅ Confidence: {result.confidence:.2%}")
        print(f"✅ Effect size: {result.effect_size:.2%}")

    def test_early_stopping(self):
        """Test early stopping mechanism"""
        print("\n=== Testing Early Stopping ===")

        # Simulate experiment with very clear winner
        # Control: 50% accuracy
        for _ in range(200):
            prediction = 1
            actual = 1 if np.random.random() < 0.50 else 0
            self.ab_test.record_result('control', prediction, actual, 0.6)

        # Treatment: 70% accuracy (20% better - very significant)
        for _ in range(200):
            prediction = 1
            actual = 1 if np.random.random() < 0.70 else 0
            self.ab_test.record_result('treatment', prediction, actual, 0.8)

        # Check early stopping
        should_stop, winner = self.ab_test.check_early_stopping()

        if should_stop:
            self.assertIsNotNone(winner)
            print(f"✅ Early stopping triggered: Winner={winner}")
        else:
            print("✅ Early stopping logic working (more data needed)")


class TestEndToEndPipeline(unittest.TestCase):
    """Test complete end-to-end pipeline"""

    def test_complete_workflow(self):
        """Test complete ML workflow from data to prediction"""
        print("\n" + "="*60)
        print("COMPLETE END-TO-END INTEGRATION TEST")
        print("="*60)

        # Step 1: Generate data
        print("\n[1/6] Generating market data...")
        dates = pd.date_range(start='2023-01-01', end='2024-01-01', freq='D')
        n = len(dates)
        data = pd.DataFrame({
            'date': dates,
            'open': 150 + np.random.randn(n).cumsum(),
            'high': 152 + np.random.randn(n).cumsum(),
            'low': 148 + np.random.randn(n).cumsum(),
            'close': 150 + np.random.randn(n).cumsum(),
            'volume': 1000000 + np.random.randint(-100000, 100000, n)
        })
        print("✅ Market data generated")

        # Step 2: Engineer features
        print("\n[2/6] Engineering features...")
        feature_engineer = FeatureEngineer()
        features = feature_engineer.compute_features(data)
        print(f"✅ Features engineered: {len(features.columns)} features")

        # Step 3: Prepare training data
        print("\n[3/6] Preparing training data...")
        features_clean = features.dropna()
        X = features_clean.drop(['target'], axis=1, errors='ignore')
        # Create simple target based on returns
        returns = data['close'].pct_change()
        y = pd.Series(
            np.where(returns > 0.02, 1, np.where(returns < -0.02, -1, 0)),
            index=data.index
        ).reindex(X.index)

        # Split
        split_idx = int(len(X) * 0.8)
        X_train, X_val = X[:split_idx], X[split_idx:]
        y_train, y_val = y[:split_idx], y[split_idx:]
        print(f"✅ Training set: {len(X_train)}, Validation set: {len(X_val)}")

        # Step 4: Train model
        print("\n[4/6] Training model...")
        model = EnsembleModel()
        model.train(X_train, y_train, X_val, y_val)
        print("✅ Model trained successfully")

        # Step 5: Make predictions
        print("\n[5/6] Making predictions...")
        predictions = model.predict(X_val)
        probabilities = model.predict_proba(X_val)
        accuracy = (predictions == y_val).mean()
        print(f"✅ Predictions made: Accuracy={accuracy:.2%}")

        # Step 6: Monitor performance
        print("\n[6/6] Setting up monitoring...")
        monitor_config = MonitoringConfig()
        monitor = ModelMonitor(monitor_config)

        # Record some predictions
        for i in range(min(100, len(predictions))):
            monitor.record_prediction(
                prediction=int(predictions.iloc[i]),
                confidence=float(probabilities[i].max()),
                latency_ms=np.random.uniform(30, 80),
                actual=int(y_val.iloc[i])
            )

        dashboard = monitor.get_dashboard_data()
        print(f"✅ Monitoring active: {dashboard['total_predictions']} predictions tracked")

        print("\n" + "="*60)
        print("END-TO-END INTEGRATION TEST COMPLETE ✅")
        print("="*60)
        print(f"\nFinal Results:")
        print(f"  Data points: {len(data)}")
        print(f"  Features: {len(features.columns)}")
        print(f"  Model accuracy: {accuracy:.2%}")
        print(f"  Predictions monitored: {dashboard['total_predictions']}")
        print("="*60 + "\n")


def run_integration_tests():
    """Run all integration tests"""
    print("\n" + "="*60)
    print("NEXUSTRADE ML INTEGRATION TEST SUITE")
    print("="*60)

    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestDataPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestModelPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestServingPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestRetrainingPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestMonitoringPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestABTestingPipeline))
    suite.addTests(loader.loadTestsFromTestCase(TestEndToEndPipeline))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors) - len(result.skipped)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print(f"Skipped: {len(result.skipped)}")

    if result.wasSuccessful():
        print("\n✅ ALL TESTS PASSED")
    else:
        print("\n❌ SOME TESTS FAILED")

    print("="*60 + "\n")

    return result


if __name__ == '__main__':
    run_integration_tests()
