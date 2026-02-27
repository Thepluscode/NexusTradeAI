"""
A/B Testing Framework for ML Models
====================================
Statistical framework for comparing model versions in production.

Author: NexusTradeAI ML Team
Version: 1.0
Date: December 24, 2024

Features:
- Multi-armed bandit allocation
- Statistical significance testing
- Automatic winner selection
- Traffic splitting
- Performance tracking per variant
- Experiment management
- Confidence intervals
- Early stopping
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, asdict, field
from datetime import datetime, timedelta
from enum import Enum
import json
import logging
from pathlib import Path
from scipy import stats

logger = logging.getLogger(__name__)


class ExperimentStatus(Enum):
    """Status of A/B experiment"""
    DRAFT = "draft"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    WINNER_SELECTED = "winner_selected"


class AllocationStrategy(Enum):
    """Traffic allocation strategy"""
    FIXED = "fixed"  # Fixed percentage split
    EPSILON_GREEDY = "epsilon_greedy"  # Explore-exploit
    THOMPSON_SAMPLING = "thompson_sampling"  # Bayesian bandit
    UCB = "ucb"  # Upper Confidence Bound


@dataclass
class Variant:
    """A/B test variant"""

    variant_id: str
    model_version: str
    description: str
    allocation_pct: float = 50.0  # Initial allocation

    # Performance tracking
    n_predictions: int = 0
    n_correct: int = 0
    total_latency_ms: float = 0.0
    n_errors: int = 0

    # Statistical tracking (for bandit algorithms)
    successes: int = 0
    failures: int = 0

    def get_accuracy(self) -> float:
        """Get current accuracy"""
        if self.n_predictions == 0:
            return 0.0
        return self.n_correct / self.n_predictions

    def get_avg_latency(self) -> float:
        """Get average latency"""
        if self.n_predictions == 0:
            return 0.0
        return self.total_latency_ms / self.n_predictions

    def get_error_rate(self) -> float:
        """Get error rate"""
        if self.n_predictions == 0:
            return 0.0
        return self.n_errors / self.n_predictions

    def to_dict(self) -> Dict[str, Any]:
        return {
            'variant_id': self.variant_id,
            'model_version': self.model_version,
            'description': self.description,
            'allocation_pct': self.allocation_pct,
            'n_predictions': self.n_predictions,
            'accuracy': self.get_accuracy(),
            'avg_latency_ms': self.get_avg_latency(),
            'error_rate': self.get_error_rate()
        }


@dataclass
class ABTestConfig:
    """Configuration for A/B test"""

    # Experiment settings
    experiment_name: str
    allocation_strategy: AllocationStrategy = AllocationStrategy.FIXED

    # Statistical settings
    confidence_level: float = 0.95
    min_sample_size: int = 1000  # Per variant
    min_runtime_hours: int = 24

    # Early stopping
    enable_early_stopping: bool = True
    early_stop_threshold: float = 0.99  # 99% confidence to stop early

    # Epsilon-greedy parameters
    epsilon: float = 0.1  # 10% exploration

    # UCB parameters
    ucb_c: float = 2.0  # Exploration coefficient

    # Winner selection
    min_improvement_pct: float = 1.0  # Minimum 1% improvement to declare winner


@dataclass
class ExperimentResult:
    """Result of A/B test"""

    experiment_name: str
    status: ExperimentStatus
    start_time: datetime
    end_time: Optional[datetime]
    runtime_hours: float

    # Variants
    variants: List[Variant]

    # Statistical results
    winning_variant: Optional[str]
    confidence: float
    p_value: float
    effect_size: float

    # Recommendations
    recommendation: str
    should_deploy: bool

    def to_dict(self) -> Dict[str, Any]:
        return {
            'experiment_name': self.experiment_name,
            'status': self.status.value,
            'start_time': self.start_time.isoformat(),
            'end_time': self.end_time.isoformat() if self.end_time else None,
            'runtime_hours': self.runtime_hours,
            'variants': [v.to_dict() for v in self.variants],
            'winning_variant': self.winning_variant,
            'confidence': self.confidence,
            'p_value': self.p_value,
            'effect_size': self.effect_size,
            'recommendation': self.recommendation,
            'should_deploy': self.should_deploy
        }


class ABTestFramework:
    """
    A/B Testing framework for ML models

    Supports:
    - Multiple variants
    - Statistical testing
    - Multi-armed bandits
    - Automatic winner selection
    """

    def __init__(self, config: ABTestConfig):
        """Initialize A/B testing framework"""
        self.config = config
        self.variants: Dict[str, Variant] = {}
        self.start_time: Optional[datetime] = None
        self.status = ExperimentStatus.DRAFT

        logger.info(f"Initialized A/B test: {config.experiment_name}")

    def add_variant(
        self,
        variant_id: str,
        model_version: str,
        description: str,
        allocation_pct: Optional[float] = None
    ):
        """
        Add a variant to the experiment

        Args:
            variant_id: Unique identifier (e.g., "control", "variant_a")
            model_version: Model version to use
            description: Description of variant
            allocation_pct: Initial traffic allocation (optional)
        """
        if allocation_pct is None:
            # Equal allocation by default
            allocation_pct = 100.0 / (len(self.variants) + 1)

        variant = Variant(
            variant_id=variant_id,
            model_version=model_version,
            description=description,
            allocation_pct=allocation_pct
        )

        self.variants[variant_id] = variant

        logger.info(f"Added variant {variant_id}: {description} ({allocation_pct:.1f}%)")

    def start_experiment(self):
        """Start the A/B experiment"""
        if len(self.variants) < 2:
            raise ValueError("Need at least 2 variants to run A/B test")

        # Normalize allocations
        total_allocation = sum(v.allocation_pct for v in self.variants.values())
        for variant in self.variants.values():
            variant.allocation_pct = (variant.allocation_pct / total_allocation) * 100

        self.start_time = datetime.now()
        self.status = ExperimentStatus.RUNNING

        logger.info(f"Started experiment: {self.config.experiment_name}")
        for variant_id, variant in self.variants.items():
            logger.info(f"  {variant_id}: {variant.allocation_pct:.1f}%")

    def select_variant(self) -> str:
        """
        Select which variant to use for next prediction

        Returns:
            Selected variant_id
        """
        if self.status != ExperimentStatus.RUNNING:
            raise ValueError("Experiment not running")

        if self.config.allocation_strategy == AllocationStrategy.FIXED:
            return self._select_fixed()

        elif self.config.allocation_strategy == AllocationStrategy.EPSILON_GREEDY:
            return self._select_epsilon_greedy()

        elif self.config.allocation_strategy == AllocationStrategy.THOMPSON_SAMPLING:
            return self._select_thompson_sampling()

        elif self.config.allocation_strategy == AllocationStrategy.UCB:
            return self._select_ucb()

        else:
            raise ValueError(f"Unknown allocation strategy: {self.config.allocation_strategy}")

    def _select_fixed(self) -> str:
        """Fixed percentage allocation"""
        rand = np.random.random() * 100
        cumsum = 0.0

        for variant_id, variant in self.variants.items():
            cumsum += variant.allocation_pct
            if rand <= cumsum:
                return variant_id

        # Fallback
        return list(self.variants.keys())[0]

    def _select_epsilon_greedy(self) -> str:
        """Epsilon-greedy bandit"""
        # Explore with probability epsilon
        if np.random.random() < self.config.epsilon:
            return np.random.choice(list(self.variants.keys()))

        # Exploit: choose best performing variant
        best_variant = max(
            self.variants.items(),
            key=lambda x: x[1].get_accuracy()
        )

        return best_variant[0]

    def _select_thompson_sampling(self) -> str:
        """Thompson sampling (Bayesian bandit)"""
        samples = {}

        for variant_id, variant in self.variants.items():
            # Beta distribution (Bayesian posterior for Bernoulli)
            alpha = variant.successes + 1  # Prior: Beta(1, 1)
            beta = variant.failures + 1

            # Sample from posterior
            samples[variant_id] = np.random.beta(alpha, beta)

        # Choose variant with highest sample
        return max(samples.items(), key=lambda x: x[1])[0]

    def _select_ucb(self) -> str:
        """Upper Confidence Bound"""
        total_n = sum(v.n_predictions for v in self.variants.values())

        if total_n == 0:
            # Random selection initially
            return np.random.choice(list(self.variants.keys()))

        ucb_values = {}

        for variant_id, variant in self.variants.items():
            if variant.n_predictions == 0:
                # Infinite UCB for unexplored variants
                ucb_values[variant_id] = float('inf')
            else:
                mean = variant.get_accuracy()
                exploration = self.config.ucb_c * np.sqrt(np.log(total_n) / variant.n_predictions)
                ucb_values[variant_id] = mean + exploration

        return max(ucb_values.items(), key=lambda x: x[1])[0]

    def record_result(
        self,
        variant_id: str,
        is_correct: bool,
        latency_ms: float,
        is_error: bool = False
    ):
        """
        Record prediction result for a variant

        Args:
            variant_id: Variant that made prediction
            is_correct: Whether prediction was correct
            latency_ms: Inference latency
            is_error: Whether there was an error
        """
        variant = self.variants[variant_id]

        variant.n_predictions += 1

        if is_correct:
            variant.n_correct += 1
            variant.successes += 1
        else:
            variant.failures += 1

        variant.total_latency_ms += latency_ms

        if is_error:
            variant.n_errors += 1

    def check_early_stopping(self) -> Tuple[bool, Optional[str]]:
        """
        Check if experiment can be stopped early

        Returns:
            (should_stop, winning_variant)
        """
        if not self.config.enable_early_stopping:
            return False, None

        # Check minimum sample size
        for variant in self.variants.values():
            if variant.n_predictions < self.config.min_sample_size:
                return False, None

        # Perform statistical test
        result = self.analyze_results()

        # Check if we have a clear winner
        if result.confidence >= self.config.early_stop_threshold and result.winning_variant:
            logger.info(f"Early stopping: {result.winning_variant} wins with {result.confidence:.2%} confidence")
            return True, result.winning_variant

        return False, None

    def analyze_results(self) -> ExperimentResult:
        """
        Analyze experiment results

        Returns:
            ExperimentResult with statistical analysis
        """
        if len(self.variants) != 2:
            logger.warning("Statistical testing only supports 2 variants currently")

        # Get variants
        variant_list = list(self.variants.values())
        control = variant_list[0]
        treatment = variant_list[1]

        # Perform two-proportion z-test
        n1, p1 = control.n_predictions, control.get_accuracy()
        n2, p2 = treatment.n_predictions, treatment.get_accuracy()

        if n1 == 0 or n2 == 0:
            return ExperimentResult(
                experiment_name=self.config.experiment_name,
                status=self.status,
                start_time=self.start_time or datetime.now(),
                end_time=None,
                runtime_hours=0.0,
                variants=variant_list,
                winning_variant=None,
                confidence=0.0,
                p_value=1.0,
                effect_size=0.0,
                recommendation="Insufficient data",
                should_deploy=False
            )

        # Pooled proportion
        p_pool = (control.n_correct + treatment.n_correct) / (n1 + n2)

        # Standard error
        se = np.sqrt(p_pool * (1 - p_pool) * (1/n1 + 1/n2))

        # Z-statistic
        if se > 0:
            z = (p2 - p1) / se
            p_value = 2 * (1 - stats.norm.cdf(abs(z)))  # Two-tailed
        else:
            z = 0
            p_value = 1.0

        # Confidence
        confidence = 1 - p_value

        # Effect size (Cohen's h)
        effect_size = 2 * (np.arcsin(np.sqrt(p2)) - np.arcsin(np.sqrt(p1)))

        # Determine winner
        winning_variant = None
        should_deploy = False

        if confidence >= self.config.confidence_level:
            improvement_pct = ((p2 - p1) / p1) * 100 if p1 > 0 else 0

            if improvement_pct >= self.config.min_improvement_pct:
                winning_variant = treatment.variant_id
                should_deploy = True
            elif improvement_pct <= -self.config.min_improvement_pct:
                winning_variant = control.variant_id
                should_deploy = False  # Keep current

        # Generate recommendation
        if winning_variant:
            recommendation = f"Deploy {winning_variant}: {((p2-p1)/p1*100 if p1>0 else 0):.1f}% improvement"
        elif confidence < 0.8:
            recommendation = "Continue experiment - inconclusive"
        else:
            recommendation = "No significant difference - keep current"

        # Runtime
        runtime_hours = 0.0
        if self.start_time:
            runtime_hours = (datetime.now() - self.start_time).total_seconds() / 3600

        return ExperimentResult(
            experiment_name=self.config.experiment_name,
            status=self.status,
            start_time=self.start_time or datetime.now(),
            end_time=datetime.now() if self.status == ExperimentStatus.COMPLETED else None,
            runtime_hours=runtime_hours,
            variants=variant_list,
            winning_variant=winning_variant,
            confidence=confidence,
            p_value=p_value,
            effect_size=effect_size,
            recommendation=recommendation,
            should_deploy=should_deploy
        )

    def stop_experiment(self) -> ExperimentResult:
        """
        Stop experiment and return results

        Returns:
            ExperimentResult
        """
        result = self.analyze_results()
        self.status = ExperimentStatus.COMPLETED

        logger.info(f"Experiment stopped: {result.recommendation}")

        return result

    def save_state(self, filepath: str):
        """Save experiment state"""
        filepath = Path(filepath)
        filepath.parent.mkdir(parents=True, exist_ok=True)

        state = {
            'config': asdict(self.config),
            'status': self.status.value,
            'start_time': self.start_time.isoformat() if self.start_time else None,
            'variants': {vid: asdict(v) for vid, v in self.variants.items()},
            'results': self.analyze_results().to_dict()
        }

        with open(filepath, 'w') as f:
            json.dump(state, f, indent=2)

        logger.info(f"Experiment state saved to {filepath}")


# Example usage
if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)

    # Create A/B test
    config = ABTestConfig(
        experiment_name="ensemble_v2_vs_v1",
        allocation_strategy=AllocationStrategy.EPSILON_GREEDY,
        confidence_level=0.95,
        min_sample_size=1000,
        enable_early_stopping=True
    )

    ab_test = ABTestFramework(config)

    # Add variants
    ab_test.add_variant("control", "ensemble_v1", "Current production model", allocation_pct=50)
    ab_test.add_variant("treatment", "ensemble_v2", "New model with transformer", allocation_pct=50)

    # Start experiment
    ab_test.start_experiment()

    # Simulate predictions
    print("Simulating A/B test...")
    for i in range(5000):
        # Select variant
        variant_id = ab_test.select_variant()

        # Simulate prediction (treatment is slightly better)
        if variant_id == "treatment":
            is_correct = np.random.random() < 0.62  # 62% accuracy
        else:
            is_correct = np.random.random() < 0.58  # 58% accuracy

        latency_ms = np.random.uniform(80, 120)

        # Record result
        ab_test.record_result(variant_id, is_correct, latency_ms)

        # Check early stopping
        if i % 500 == 0:
            should_stop, winner = ab_test.check_early_stopping()
            if should_stop:
                print(f"Early stopping after {i} predictions!")
                break

    # Analyze results
    result = ab_test.stop_experiment()

    print("\n=== A/B Test Results ===")
    print(f"Experiment: {result.experiment_name}")
    print(f"Runtime: {result.runtime_hours:.2f} hours")
    print(f"\nVariants:")
    for variant in result.variants:
        print(f"  {variant.variant_id}:")
        print(f"    Predictions: {variant.n_predictions}")
        print(f"    Accuracy: {variant.get_accuracy():.2%}")
        print(f"    Avg Latency: {variant.get_avg_latency():.2f}ms")

    print(f"\nStatistical Results:")
    print(f"  Winning Variant: {result.winning_variant}")
    print(f"  Confidence: {result.confidence:.2%}")
    print(f"  P-value: {result.p_value:.4f}")
    print(f"  Effect Size: {result.effect_size:.4f}")

    print(f"\nRecommendation: {result.recommendation}")
    print(f"Should Deploy: {result.should_deploy}")

    # Save state
    ab_test.save_state('ai-ml/production/ab_test_state.json')

    print("\n✅ A/B test complete!")
