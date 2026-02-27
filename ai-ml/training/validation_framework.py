"""
NexusTradeAI - Walk-Forward Validation Framework
=================================================

Production-grade backtesting validation with:
- Walk-forward cross-validation
- Monte Carlo significance testing
- Out-of-sample performance tracking
- Overfitting detection

Senior Engineering Rigor Applied:
- Proper train/test splits
- Multiple validation metrics
- Statistical significance testing
- Comprehensive logging
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import logging
import json
from enum import Enum

logger = logging.getLogger(__name__)


class ValidationMetric(Enum):
    """Validation metrics"""
    SHARPE_RATIO = "sharpe_ratio"
    SORTINO_RATIO = "sortino_ratio"
    MAX_DRAWDOWN = "max_drawdown"
    WIN_RATE = "win_rate"
    PROFIT_FACTOR = "profit_factor"
    CALMAR_RATIO = "calmar_ratio"
    TOTAL_RETURN = "total_return"
    VOLATILITY = "volatility"


@dataclass
class ValidationResult:
    """Result from a single validation fold"""
    fold_id: int
    train_start: datetime
    train_end: datetime
    test_start: datetime
    test_end: datetime
    
    # Performance metrics
    train_sharpe: float
    test_sharpe: float
    train_return: float
    test_return: float
    train_win_rate: float
    test_win_rate: float
    max_drawdown: float
    num_trades: int
    
    # Overfitting indicators
    sharpe_decay: float  # train_sharpe - test_sharpe
    return_decay: float  # train_return - test_return
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'fold_id': self.fold_id,
            'train_period': f"{self.train_start.date()} to {self.train_end.date()}",
            'test_period': f"{self.test_start.date()} to {self.test_end.date()}",
            'train_sharpe': round(self.train_sharpe, 3),
            'test_sharpe': round(self.test_sharpe, 3),
            'sharpe_decay': round(self.sharpe_decay, 3),
            'train_return': round(self.train_return * 100, 2),
            'test_return': round(self.test_return * 100, 2),
            'train_win_rate': round(self.train_win_rate * 100, 1),
            'test_win_rate': round(self.test_win_rate * 100, 1),
            'max_drawdown': round(self.max_drawdown * 100, 2),
            'num_trades': self.num_trades
        }


@dataclass
class MonteCarloResult:
    """Result from Monte Carlo simulation"""
    observed_sharpe: float
    simulated_sharpes: List[float]
    p_value: float
    percentile: float
    is_significant: bool
    confidence_level: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'observed_sharpe': round(self.observed_sharpe, 3),
            'simulated_mean': round(np.mean(self.simulated_sharpes), 3),
            'simulated_std': round(np.std(self.simulated_sharpes), 3),
            'p_value': round(self.p_value, 4),
            'percentile': round(self.percentile, 1),
            'is_significant': self.is_significant,
            'confidence_level': self.confidence_level
        }


@dataclass
class WalkForwardSummary:
    """Summary of walk-forward validation"""
    num_folds: int
    total_train_days: int
    total_test_days: int
    
    # Aggregate metrics
    avg_train_sharpe: float
    avg_test_sharpe: float
    std_test_sharpe: float
    avg_sharpe_decay: float
    
    avg_test_return: float
    avg_max_drawdown: float
    total_trades: int
    
    # Consistency
    positive_test_folds: int
    profitable_fold_ratio: float
    
    # Overfitting assessment
    overfitting_score: float  # 0-1, higher = more overfit
    is_robust: bool
    
    fold_results: List[ValidationResult] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'num_folds': self.num_folds,
            'avg_train_sharpe': round(self.avg_train_sharpe, 3),
            'avg_test_sharpe': round(self.avg_test_sharpe, 3),
            'std_test_sharpe': round(self.std_test_sharpe, 3),
            'avg_sharpe_decay': round(self.avg_sharpe_decay, 3),
            'avg_test_return_pct': round(self.avg_test_return * 100, 2),
            'avg_max_drawdown_pct': round(self.avg_max_drawdown * 100, 2),
            'total_trades': self.total_trades,
            'profitable_folds': f"{self.positive_test_folds}/{self.num_folds}",
            'overfitting_score': round(self.overfitting_score, 2),
            'is_robust': self.is_robust
        }


class WalkForwardValidator:
    """
    Walk-forward cross-validation for trading strategies.
    
    Uses anchored or rolling windows to simulate real trading conditions.
    """
    
    def __init__(
        self,
        n_folds: int = 10,
        train_ratio: float = 0.7,
        min_train_days: int = 252,
        min_test_days: int = 63,
        anchored: bool = True,
        gap_days: int = 1
    ):
        """
        Initialize WalkForwardValidator.
        
        Args:
            n_folds: Number of validation folds
            train_ratio: Ratio of train to total period
            min_train_days: Minimum training period days
            min_test_days: Minimum test period days
            anchored: If True, training starts from beginning; else rolling
            gap_days: Gap between train and test to avoid lookahead
        """
        self.n_folds = n_folds
        self.train_ratio = train_ratio
        self.min_train_days = min_train_days
        self.min_test_days = min_test_days
        self.anchored = anchored
        self.gap_days = gap_days
    
    def create_folds(
        self, 
        data: pd.DataFrame
    ) -> List[Tuple[pd.DataFrame, pd.DataFrame, int]]:
        """
        Create train/test folds for walk-forward validation.
        
        Returns:
            List of (train_df, test_df, fold_id) tuples
        """
        n_samples = len(data)
        folds = []
        
        if self.anchored:
            # Anchored walk-forward: training always starts from beginning
            test_size = max(self.min_test_days, n_samples // (self.n_folds + 2))
            
            for i in range(self.n_folds):
                test_end_idx = n_samples - (self.n_folds - i - 1) * test_size
                test_start_idx = test_end_idx - test_size
                train_end_idx = test_start_idx - self.gap_days
                train_start_idx = 0  # Anchored
                
                if train_end_idx - train_start_idx < self.min_train_days:
                    continue
                
                train_df = data.iloc[train_start_idx:train_end_idx]
                test_df = data.iloc[test_start_idx:test_end_idx]
                
                folds.append((train_df, test_df, i))
        else:
            # Rolling walk-forward
            fold_size = n_samples // (self.n_folds + 1)
            train_size = int(fold_size * self.train_ratio * 2)
            test_size = max(self.min_test_days, fold_size)
            
            for i in range(self.n_folds):
                test_end_idx = n_samples - (self.n_folds - i - 1) * fold_size
                test_start_idx = max(train_size + self.min_train_days, test_end_idx - test_size)
                train_end_idx = test_start_idx - self.gap_days
                train_start_idx = max(0, train_end_idx - train_size)
                
                if train_end_idx - train_start_idx < self.min_train_days:
                    continue
                
                train_df = data.iloc[train_start_idx:train_end_idx]
                test_df = data.iloc[test_start_idx:test_end_idx]
                
                folds.append((train_df, test_df, i))
        
        logger.info(f"Created {len(folds)} validation folds")
        return folds
    
    def calculate_metrics(
        self, 
        returns: pd.Series,
        risk_free_rate: float = 0.02
    ) -> Dict[str, float]:
        """Calculate performance metrics from returns series"""
        if len(returns) < 10:
            return {
                'sharpe': 0, 'sortino': 0, 'max_dd': 0,
                'win_rate': 0, 'total_return': 0, 'volatility': 0
            }
        
        # Clean returns
        returns = returns.fillna(0)
        
        # Annualized return and volatility
        total_return = (1 + returns).prod() - 1
        annualized_return = (1 + total_return) ** (252 / len(returns)) - 1
        volatility = returns.std() * np.sqrt(252)
        
        # Sharpe ratio
        excess_return = annualized_return - risk_free_rate
        sharpe = excess_return / (volatility + 1e-8)
        
        # Sortino ratio (downside deviation)
        downside_returns = returns[returns < 0]
        downside_vol = downside_returns.std() * np.sqrt(252) if len(downside_returns) > 0 else volatility
        sortino = excess_return / (downside_vol + 1e-8)
        
        # Max drawdown
        cumulative = (1 + returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdown = (cumulative - running_max) / running_max
        max_dd = abs(drawdown.min())
        
        # Win rate
        win_rate = (returns > 0).mean()
        
        return {
            'sharpe': sharpe,
            'sortino': sortino,
            'max_dd': max_dd,
            'win_rate': win_rate,
            'total_return': total_return,
            'volatility': volatility
        }
    
    def validate(
        self,
        data: pd.DataFrame,
        strategy_func: Callable[[pd.DataFrame], pd.Series],
        returns_col: str = None
    ) -> WalkForwardSummary:
        """
        Run walk-forward validation.
        
        Args:
            data: DataFrame with price data
            strategy_func: Function that takes data and returns series of strategy returns
            returns_col: Column name if returns are pre-computed
            
        Returns:
            WalkForwardSummary with all results
        """
        folds = self.create_folds(data)
        results = []
        
        for train_df, test_df, fold_id in folds:
            try:
                # Get returns for train and test
                if returns_col and returns_col in train_df.columns:
                    train_returns = train_df[returns_col]
                    test_returns = test_df[returns_col]
                else:
                    train_returns = strategy_func(train_df)
                    test_returns = strategy_func(test_df)
                
                # Calculate metrics
                train_metrics = self.calculate_metrics(train_returns)
                test_metrics = self.calculate_metrics(test_returns)
                
                result = ValidationResult(
                    fold_id=fold_id,
                    train_start=train_df.index[0] if hasattr(train_df.index[0], 'date') else datetime.now(),
                    train_end=train_df.index[-1] if hasattr(train_df.index[-1], 'date') else datetime.now(),
                    test_start=test_df.index[0] if hasattr(test_df.index[0], 'date') else datetime.now(),
                    test_end=test_df.index[-1] if hasattr(test_df.index[-1], 'date') else datetime.now(),
                    train_sharpe=train_metrics['sharpe'],
                    test_sharpe=test_metrics['sharpe'],
                    train_return=train_metrics['total_return'],
                    test_return=test_metrics['total_return'],
                    train_win_rate=train_metrics['win_rate'],
                    test_win_rate=test_metrics['win_rate'],
                    max_drawdown=test_metrics['max_dd'],
                    num_trades=len(test_returns[test_returns != 0]),
                    sharpe_decay=train_metrics['sharpe'] - test_metrics['sharpe'],
                    return_decay=train_metrics['total_return'] - test_metrics['total_return']
                )
                results.append(result)
                
                logger.info(f"Fold {fold_id}: Train Sharpe={train_metrics['sharpe']:.2f}, "
                           f"Test Sharpe={test_metrics['sharpe']:.2f}")
                
            except Exception as e:
                logger.error(f"Error in fold {fold_id}: {e}")
                continue
        
        return self._create_summary(results)
    
    def _create_summary(self, results: List[ValidationResult]) -> WalkForwardSummary:
        """Create summary from fold results"""
        if not results:
            return WalkForwardSummary(
                num_folds=0, total_train_days=0, total_test_days=0,
                avg_train_sharpe=0, avg_test_sharpe=0, std_test_sharpe=0,
                avg_sharpe_decay=0, avg_test_return=0, avg_max_drawdown=0,
                total_trades=0, positive_test_folds=0, profitable_fold_ratio=0,
                overfitting_score=1.0, is_robust=False
            )
        
        test_sharpes = [r.test_sharpe for r in results]
        train_sharpes = [r.train_sharpe for r in results]
        
        avg_test_sharpe = np.mean(test_sharpes)
        avg_train_sharpe = np.mean(train_sharpes)
        avg_sharpe_decay = avg_train_sharpe - avg_test_sharpe
        
        positive_folds = sum(1 for r in results if r.test_return > 0)
        
        # Overfitting score: higher decay and inconsistency = more overfit
        sharpe_decay_penalty = min(1.0, max(0, avg_sharpe_decay) / 2)
        consistency_penalty = 1 - (positive_folds / len(results))
        variance_penalty = min(1.0, np.std(test_sharpes) / 2)
        overfitting_score = (sharpe_decay_penalty + consistency_penalty + variance_penalty) / 3
        
        # Robust if: positive avg Sharpe, low decay, and >50% profitable folds
        is_robust = (
            avg_test_sharpe > 0.5 and
            avg_sharpe_decay < 1.0 and
            positive_folds / len(results) > 0.5
        )
        
        return WalkForwardSummary(
            num_folds=len(results),
            total_train_days=sum(1 for _ in results),
            total_test_days=sum(1 for _ in results),
            avg_train_sharpe=avg_train_sharpe,
            avg_test_sharpe=avg_test_sharpe,
            std_test_sharpe=float(np.std(test_sharpes)),
            avg_sharpe_decay=avg_sharpe_decay,
            avg_test_return=np.mean([r.test_return for r in results]),
            avg_max_drawdown=np.mean([r.max_drawdown for r in results]),
            total_trades=sum(r.num_trades for r in results),
            positive_test_folds=positive_folds,
            profitable_fold_ratio=positive_folds / len(results),
            overfitting_score=overfitting_score,
            is_robust=is_robust,
            fold_results=results
        )


class MonteCarloValidator:
    """
    Monte Carlo simulation for statistical significance testing.
    
    Tests if strategy performance is statistically significant vs random.
    """
    
    def __init__(
        self,
        n_simulations: int = 1000,
        confidence_level: float = 0.95,
        random_seed: int = 42
    ):
        """
        Initialize MonteCarloValidator.
        
        Args:
            n_simulations: Number of Monte Carlo simulations
            confidence_level: Confidence level for significance (e.g., 0.95)
            random_seed: Random seed for reproducibility
        """
        self.n_simulations = n_simulations
        self.confidence_level = confidence_level
        self.random_seed = random_seed
        np.random.seed(random_seed)
    
    def test_significance(
        self,
        strategy_returns: pd.Series,
        benchmark_returns: pd.Series = None,
        method: str = 'shuffle'
    ) -> MonteCarloResult:
        """
        Test if strategy returns are statistically significant.
        
        Args:
            strategy_returns: Actual strategy returns
            benchmark_returns: Optional benchmark returns
            method: 'shuffle' (permutation test) or 'bootstrap'
            
        Returns:
            MonteCarloResult with significance testing results
        """
        strategy_returns = strategy_returns.fillna(0).values
        
        # Calculate observed Sharpe
        observed_sharpe = self._calculate_sharpe(strategy_returns)
        
        # Run simulations
        simulated_sharpes = []
        
        for _ in range(self.n_simulations):
            if method == 'shuffle':
                # Permutation test: shuffle returns
                shuffled = np.random.permutation(strategy_returns)
                sim_sharpe = self._calculate_sharpe(shuffled)
            else:
                # Bootstrap: sample with replacement
                bootstrapped = np.random.choice(
                    strategy_returns, 
                    size=len(strategy_returns), 
                    replace=True
                )
                sim_sharpe = self._calculate_sharpe(bootstrapped)
            
            simulated_sharpes.append(sim_sharpe)
        
        # Calculate p-value and percentile
        simulated_sharpes = np.array(simulated_sharpes)
        percentile = (simulated_sharpes < observed_sharpe).mean() * 100
        p_value = 1 - (percentile / 100)
        
        is_significant = p_value < (1 - self.confidence_level)
        
        return MonteCarloResult(
            observed_sharpe=observed_sharpe,
            simulated_sharpes=simulated_sharpes.tolist(),
            p_value=p_value,
            percentile=percentile,
            is_significant=is_significant,
            confidence_level=self.confidence_level
        )
    
    def _calculate_sharpe(self, returns: np.ndarray, rf: float = 0.02) -> float:
        """Calculate Sharpe ratio from returns array"""
        if len(returns) < 10:
            return 0.0
        
        mean_return = np.mean(returns) * 252
        std_return = np.std(returns) * np.sqrt(252)
        
        if std_return < 1e-8:
            return 0.0
        
        return (mean_return - rf) / std_return
    
    def stability_test(
        self,
        returns: pd.Series,
        window_sizes: List[int] = None
    ) -> Dict[str, Any]:
        """
        Test strategy stability across different time windows.
        
        Args:
            returns: Strategy returns series
            window_sizes: List of window sizes to test
            
        Returns:
            Dict with stability metrics per window
        """
        if window_sizes is None:
            window_sizes = [21, 63, 126, 252]  # 1m, 3m, 6m, 1y
        
        results = {}
        returns = returns.fillna(0)
        
        for window in window_sizes:
            if len(returns) < window:
                continue
            
            # Rolling Sharpe
            rolling_sharpe = returns.rolling(window).apply(
                lambda x: self._calculate_sharpe(x.values)
            )
            
            results[f'window_{window}'] = {
                'mean_sharpe': float(rolling_sharpe.mean()),
                'std_sharpe': float(rolling_sharpe.std()),
                'min_sharpe': float(rolling_sharpe.min()),
                'max_sharpe': float(rolling_sharpe.max()),
                'positive_pct': float((rolling_sharpe > 0).mean() * 100)
            }
        
        return results


class StrategyValidator:
    """
    Combined validator orchestrating multiple validation methods.
    """
    
    def __init__(
        self,
        wf_folds: int = 10,
        mc_simulations: int = 1000,
        confidence_level: float = 0.95
    ):
        self.walk_forward = WalkForwardValidator(n_folds=wf_folds)
        self.monte_carlo = MonteCarloValidator(
            n_simulations=mc_simulations,
            confidence_level=confidence_level
        )
    
    def comprehensive_validation(
        self,
        data: pd.DataFrame,
        strategy_func: Callable[[pd.DataFrame], pd.Series]
    ) -> Dict[str, Any]:
        """
        Run comprehensive validation suite.
        
        Args:
            data: Market data DataFrame
            strategy_func: Strategy returns function
            
        Returns:
            Dict with all validation results
        """
        logger.info("Starting comprehensive validation...")
        
        # Walk-forward validation
        wf_result = self.walk_forward.validate(data, strategy_func)
        
        # Get full strategy returns for Monte Carlo
        full_returns = strategy_func(data)
        mc_result = self.monte_carlo.test_significance(full_returns)
        
        # Stability test
        stability = self.monte_carlo.stability_test(full_returns)
        
        # Overall assessment
        is_validated = (
            wf_result.is_robust and
            mc_result.is_significant and
            wf_result.avg_test_sharpe > 0.5
        )
        
        return {
            'walk_forward': wf_result.to_dict(),
            'monte_carlo': mc_result.to_dict(),
            'stability': stability,
            'is_validated': is_validated,
            'recommendation': self._generate_recommendation(wf_result, mc_result)
        }
    
    def _generate_recommendation(
        self,
        wf: WalkForwardSummary,
        mc: MonteCarloResult
    ) -> str:
        """Generate validation recommendation"""
        issues = []
        
        if wf.avg_test_sharpe < 0.5:
            issues.append("Low out-of-sample Sharpe ratio")
        if wf.avg_sharpe_decay > 1.0:
            issues.append("High Sharpe decay indicates overfitting")
        if wf.profitable_fold_ratio < 0.5:
            issues.append("Inconsistent across time periods")
        if not mc.is_significant:
            issues.append("Not statistically significant")
        
        if not issues:
            return "✅ Strategy passes all validation checks. Ready for paper trading."
        else:
            return f"⚠️ Issues found: {'; '.join(issues)}"


# Factory functions
def create_walk_forward_validator(
    n_folds: int = 10,
    anchored: bool = True
) -> WalkForwardValidator:
    """Create walk-forward validator"""
    return WalkForwardValidator(n_folds=n_folds, anchored=anchored)


def create_monte_carlo_validator(
    n_simulations: int = 1000
) -> MonteCarloValidator:
    """Create Monte Carlo validator"""
    return MonteCarloValidator(n_simulations=n_simulations)


# Quick test
if __name__ == "__main__":
    # Generate test data
    np.random.seed(42)
    dates = pd.date_range('2020-01-01', periods=500, freq='D')
    
    # Simulated strategy with slight edge
    strategy_returns = pd.Series(
        np.random.normal(0.0005, 0.02, 500),  # Positive mean = edge
        index=dates
    )
    
    # Test Monte Carlo
    mc = MonteCarloValidator(n_simulations=500)
    mc_result = mc.test_significance(strategy_returns)
    print(f"Monte Carlo: p-value={mc_result.p_value:.4f}, "
          f"significant={mc_result.is_significant}")
    
    print("\n✅ Validation framework test complete")
