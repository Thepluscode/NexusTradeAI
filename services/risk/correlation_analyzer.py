"""
Correlation and Covariance Analyzer
====================================
Advanced correlation and covariance analysis for portfolio risk management.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Correlation matrix calculation and visualization
- Covariance matrix estimation
- Rolling correlation analysis
- Correlation breakdown detection
- Diversification metrics
- Factor correlation analysis
- Risk contribution decomposition
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from scipy import stats
from scipy.cluster import hierarchy
from scipy.spatial.distance import squareform
import logging

logger = logging.getLogger(__name__)


@dataclass
class CorrelationAnalysis:
    """Results of correlation analysis"""
    timestamp: datetime = field(default_factory=datetime.now)

    # Correlation metrics
    correlation_matrix: pd.DataFrame = field(default_factory=pd.DataFrame)
    avg_correlation: float = 0.0
    max_correlation: float = 0.0
    min_correlation: float = 0.0

    # Diversification metrics
    diversification_ratio: float = 0.0
    effective_n: float = 0.0  # Effective number of uncorrelated assets

    # Risk decomposition
    marginal_risk: Dict[str, float] = field(default_factory=dict)
    component_risk: Dict[str, float] = field(default_factory=dict)
    risk_contribution_pct: Dict[str, float] = field(default_factory=dict)

    # Correlation breakdown
    correlation_increased: bool = False
    avg_correlation_change: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'avg_correlation': self.avg_correlation,
            'max_correlation': self.max_correlation,
            'min_correlation': self.min_correlation,
            'diversification_ratio': self.diversification_ratio,
            'effective_n': self.effective_n,
            'marginal_risk': self.marginal_risk,
            'component_risk': self.component_risk,
            'risk_contribution_pct': self.risk_contribution_pct,
            'correlation_increased': self.correlation_increased,
            'avg_correlation_change': self.avg_correlation_change
        }


class CorrelationAnalyzer:
    """
    Analyze correlations and covariances for portfolio risk management
    """

    def __init__(self):
        """Initialize correlation analyzer"""
        self.historical_correlations: List[pd.DataFrame] = []
        logger.info("Initialized Correlation Analyzer")

    def calculate_correlation_matrix(
        self,
        returns: pd.DataFrame,
        method: str = 'pearson'
    ) -> pd.DataFrame:
        """
        Calculate correlation matrix

        Args:
            returns: Returns DataFrame (symbols as columns)
            method: Correlation method ('pearson', 'spearman', 'kendall')

        Returns:
            Correlation matrix
        """
        if len(returns) < 2:
            return pd.DataFrame()

        corr_matrix = returns.corr(method=method)
        return corr_matrix

    def calculate_covariance_matrix(
        self,
        returns: pd.DataFrame,
        annualize: bool = True
    ) -> pd.DataFrame:
        """
        Calculate covariance matrix

        Args:
            returns: Returns DataFrame
            annualize: Whether to annualize (252 trading days)

        Returns:
            Covariance matrix
        """
        if len(returns) < 2:
            return pd.DataFrame()

        cov_matrix = returns.cov()

        if annualize:
            cov_matrix *= 252

        return cov_matrix

    def calculate_rolling_correlation(
        self,
        returns1: pd.Series,
        returns2: pd.Series,
        window: int = 60
    ) -> pd.Series:
        """
        Calculate rolling correlation between two series

        Args:
            returns1: First returns series
            returns2: Second returns series
            window: Rolling window size (days)

        Returns:
            Rolling correlation series
        """
        if len(returns1) < window or len(returns2) < window:
            return pd.Series()

        rolling_corr = returns1.rolling(window).corr(returns2)
        return rolling_corr

    def calculate_diversification_ratio(
        self,
        weights: np.ndarray,
        volatilities: np.ndarray,
        correlation_matrix: pd.DataFrame
    ) -> float:
        """
        Calculate portfolio diversification ratio

        Diversification ratio = (Weighted average volatility) / (Portfolio volatility)
        Higher ratio = better diversification

        Args:
            weights: Portfolio weights
            volatilities: Individual asset volatilities
            correlation_matrix: Correlation matrix

        Returns:
            Diversification ratio
        """
        if len(weights) == 0 or len(volatilities) == 0:
            return 1.0

        # Weighted average volatility
        weighted_vol = np.sum(weights * volatilities)

        # Portfolio volatility
        cov_matrix = np.outer(volatilities, volatilities) * correlation_matrix.values
        portfolio_variance = np.dot(weights, np.dot(cov_matrix, weights))
        portfolio_vol = np.sqrt(portfolio_variance)

        if portfolio_vol == 0:
            return 1.0

        diversification_ratio = weighted_vol / portfolio_vol
        return float(diversification_ratio)

    def calculate_effective_n(
        self,
        correlation_matrix: pd.DataFrame
    ) -> float:
        """
        Calculate effective number of uncorrelated assets

        This measures how many truly independent bets the portfolio has.

        Args:
            correlation_matrix: Correlation matrix

        Returns:
            Effective number of assets
        """
        n = len(correlation_matrix)
        if n == 0:
            return 0.0

        # Average correlation (excluding diagonal)
        avg_corr = (correlation_matrix.sum().sum() - n) / (n * (n - 1))

        # Effective N
        effective_n = n / (1 + (n - 1) * avg_corr)

        return float(effective_n)

    def decompose_risk_contributions(
        self,
        weights: np.ndarray,
        returns: pd.DataFrame
    ) -> Dict[str, Dict[str, float]]:
        """
        Decompose portfolio risk into individual contributions

        Args:
            weights: Portfolio weights (same order as returns columns)
            returns: Returns DataFrame

        Returns:
            Dictionary with marginal_risk, component_risk, and risk_contribution_pct
        """
        if len(weights) == 0 or len(returns) == 0:
            return {
                'marginal_risk': {},
                'component_risk': {},
                'risk_contribution_pct': {}
            }

        # Calculate covariance matrix
        cov_matrix = returns.cov().values

        # Portfolio variance
        portfolio_variance = np.dot(weights, np.dot(cov_matrix, weights))
        portfolio_vol = np.sqrt(portfolio_variance)

        if portfolio_vol == 0:
            return {
                'marginal_risk': {},
                'component_risk': {},
                'risk_contribution_pct': {}
            }

        # Marginal risk contribution (derivative of portfolio vol w.r.t. weight)
        marginal_risk_contributions = np.dot(cov_matrix, weights) / portfolio_vol

        # Component risk contribution (marginal × weight)
        component_risk_contributions = weights * marginal_risk_contributions

        # Percentage contributions
        risk_contribution_pct = component_risk_contributions / portfolio_vol * 100

        # Convert to dictionaries
        symbols = returns.columns.tolist()

        marginal_risk = {symbols[i]: float(marginal_risk_contributions[i]) for i in range(len(symbols))}
        component_risk = {symbols[i]: float(component_risk_contributions[i]) for i in range(len(symbols))}
        risk_pct = {symbols[i]: float(risk_contribution_pct[i]) for i in range(len(symbols))}

        return {
            'marginal_risk': marginal_risk,
            'component_risk': component_risk,
            'risk_contribution_pct': risk_pct
        }

    def detect_correlation_breakdown(
        self,
        current_corr: pd.DataFrame,
        historical_corr: pd.DataFrame,
        threshold: float = 0.2
    ) -> Tuple[bool, float]:
        """
        Detect if correlations have increased significantly (diversification breakdown)

        Args:
            current_corr: Current correlation matrix
            historical_corr: Historical/normal correlation matrix
            threshold: Threshold for significant increase (e.g., 0.2 = 20% increase)

        Returns:
            (breakdown_detected, avg_change)
        """
        if current_corr.empty or historical_corr.empty:
            return False, 0.0

        # Calculate average correlation (excluding diagonal)
        n = len(current_corr)

        current_avg = (current_corr.sum().sum() - n) / (n * (n - 1))
        historical_avg = (historical_corr.sum().sum() - n) / (n * (n - 1))

        avg_change = current_avg - historical_avg

        breakdown_detected = avg_change > threshold

        return breakdown_detected, float(avg_change)

    def cluster_assets(
        self,
        correlation_matrix: pd.DataFrame
    ) -> Dict[str, List[str]]:
        """
        Cluster assets based on correlation

        Args:
            correlation_matrix: Correlation matrix

        Returns:
            Dictionary of {cluster_id: [list of symbols]}
        """
        if correlation_matrix.empty:
            return {}

        # Convert correlation to distance
        distance_matrix = 1 - correlation_matrix.abs()

        # Hierarchical clustering
        condensed_dist = squareform(distance_matrix.values)
        linkage_matrix = hierarchy.linkage(condensed_dist, method='average')

        # Cut tree to get clusters (using distance threshold)
        clusters = hierarchy.fcluster(linkage_matrix, t=0.5, criterion='distance')

        # Group symbols by cluster
        cluster_groups = {}
        for i, symbol in enumerate(correlation_matrix.columns):
            cluster_id = f"Cluster_{clusters[i]}"
            if cluster_id not in cluster_groups:
                cluster_groups[cluster_id] = []
            cluster_groups[cluster_id].append(symbol)

        return cluster_groups

    def analyze_portfolio_correlation(
        self,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        historical_corr: Optional[pd.DataFrame] = None
    ) -> CorrelationAnalysis:
        """
        Comprehensive correlation analysis for portfolio

        Args:
            positions: Portfolio positions {symbol: value}
            returns: Historical returns DataFrame
            historical_corr: Historical correlation matrix for comparison

        Returns:
            CorrelationAnalysis object
        """
        analysis = CorrelationAnalysis()

        if len(positions) == 0 or returns.empty:
            return analysis

        # Calculate correlation matrix
        corr_matrix = self.calculate_correlation_matrix(returns)
        analysis.correlation_matrix = corr_matrix

        # Store in history
        self.historical_correlations.append(corr_matrix)

        # Correlation statistics
        n = len(corr_matrix)
        if n > 0:
            # Exclude diagonal
            mask = np.ones((n, n), dtype=bool)
            np.fill_diagonal(mask, False)

            correlations = corr_matrix.values[mask]
            analysis.avg_correlation = float(np.mean(correlations))
            analysis.max_correlation = float(np.max(correlations))
            analysis.min_correlation = float(np.min(correlations))

        # Portfolio weights
        total_value = sum(abs(v) for v in positions.values())
        if total_value > 0:
            symbols = [s for s in positions.keys() if s in returns.columns]
            weights = np.array([positions[s] / total_value for s in symbols])
            volatilities = returns[symbols].std().values * np.sqrt(252)

            # Diversification ratio
            analysis.diversification_ratio = self.calculate_diversification_ratio(
                weights, volatilities, corr_matrix
            )

            # Effective number of assets
            analysis.effective_n = self.calculate_effective_n(corr_matrix)

            # Risk decomposition
            risk_decomp = self.decompose_risk_contributions(weights, returns[symbols])
            analysis.marginal_risk = risk_decomp['marginal_risk']
            analysis.component_risk = risk_decomp['component_risk']
            analysis.risk_contribution_pct = risk_decomp['risk_contribution_pct']

        # Correlation breakdown detection
        if historical_corr is not None:
            breakdown, change = self.detect_correlation_breakdown(corr_matrix, historical_corr)
            analysis.correlation_increased = breakdown
            analysis.avg_correlation_change = change

        return analysis

    def get_correlation_heatmap_data(
        self,
        correlation_matrix: pd.DataFrame
    ) -> Dict[str, Any]:
        """
        Get data for correlation heatmap visualization

        Args:
            correlation_matrix: Correlation matrix

        Returns:
            Dictionary with heatmap data
        """
        if correlation_matrix.empty:
            return {}

        return {
            'symbols': correlation_matrix.columns.tolist(),
            'correlations': correlation_matrix.values.tolist(),
            'min': float(correlation_matrix.min().min()),
            'max': float(correlation_matrix.max().max())
        }

    def print_correlation_report(
        self,
        analysis: CorrelationAnalysis,
        top_n: int = 5
    ):
        """
        Print correlation analysis report

        Args:
            analysis: CorrelationAnalysis object
            top_n: Number of top risk contributors to show
        """
        print("\n" + "="*70)
        print("CORRELATION & DIVERSIFICATION ANALYSIS")
        print("="*70)
        print(f"Timestamp: {analysis.timestamp.isoformat()}")
        print()

        print("CORRELATION METRICS:")
        print(f"  Average Correlation: {analysis.avg_correlation:.3f}")
        print(f"  Maximum Correlation: {analysis.max_correlation:.3f}")
        print(f"  Minimum Correlation: {analysis.min_correlation:.3f}")
        print()

        print("DIVERSIFICATION METRICS:")
        print(f"  Diversification Ratio: {analysis.diversification_ratio:.3f}")
        print(f"  Effective Number of Assets: {analysis.effective_n:.2f}")
        print()

        if analysis.correlation_increased:
            print("⚠️  CORRELATION BREAKDOWN DETECTED!")
            print(f"  Average correlation increased by: {analysis.avg_correlation_change:.3f}")
            print()

        if analysis.risk_contribution_pct:
            print(f"TOP {top_n} RISK CONTRIBUTORS:")
            sorted_contributors = sorted(
                analysis.risk_contribution_pct.items(),
                key=lambda x: abs(x[1]),
                reverse=True
            )

            for symbol, pct in sorted_contributors[:top_n]:
                marginal = analysis.marginal_risk.get(symbol, 0)
                print(f"  {symbol:8s}: {pct:6.2f}% (Marginal Risk: {marginal:.4f})")

        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    print("Correlation Analyzer Example")
    print("="*70)

    # Generate sample returns for 5 assets
    np.random.seed(42)
    n_days = 252
    n_assets = 5

    # Create correlated returns
    # Asset 1 and 2 are highly correlated
    # Asset 3 is independent
    # Asset 4 and 5 are moderately correlated

    base_returns = np.random.normal(0.001, 0.02, n_days)

    returns_data = {
        'AAPL': base_returns + np.random.normal(0, 0.005, n_days),
        'MSFT': base_returns + np.random.normal(0, 0.005, n_days),  # Correlated with AAPL
        'TSLA': np.random.normal(0.002, 0.03, n_days),  # Independent
        'NVDA': base_returns * 0.5 + np.random.normal(0.001, 0.015, n_days),
        'GOOGL': base_returns * 0.5 + np.random.normal(0.001, 0.015, n_days)
    }

    returns = pd.DataFrame(returns_data)

    # Create portfolio
    positions = {
        'AAPL': 50000,
        'MSFT': 40000,
        'TSLA': 30000,
        'NVDA': 35000,
        'GOOGL': 45000
    }

    # Analyze correlation
    analyzer = CorrelationAnalyzer()
    analysis = analyzer.analyze_portfolio_correlation(positions, returns)

    # Print report
    analyzer.print_correlation_report(analysis)

    # Print correlation matrix
    print("CORRELATION MATRIX:")
    print(analysis.correlation_matrix.round(3))
    print()

    # Cluster assets
    clusters = analyzer.cluster_assets(analysis.correlation_matrix)
    print("ASSET CLUSTERS:")
    for cluster_id, symbols in clusters.items():
        print(f"  {cluster_id}: {', '.join(symbols)}")

    print("\n" + "="*70)
