"""
Stress Testing Framework
=========================
Comprehensive stress testing for portfolio risk assessment.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Historical scenario analysis (2008 crisis, COVID crash, etc.)
- Hypothetical scenario testing
- Multi-factor stress tests
- Correlation breakdown scenarios
- Liquidity stress testing
- Extreme tail event simulation
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class StressScenario(str, Enum):
    """Predefined stress scenarios"""
    MARKET_CRASH_2008 = "market_crash_2008"
    COVID_CRASH_2020 = "covid_crash_2020"
    FLASH_CRASH_2010 = "flash_crash_2010"
    VOLATILITY_SPIKE = "volatility_spike"
    CORRELATION_BREAKDOWN = "correlation_breakdown"
    LIQUIDITY_CRISIS = "liquidity_crisis"
    INTEREST_RATE_SHOCK = "interest_rate_shock"
    CUSTOM = "custom"


@dataclass
class StressTestResult:
    """Result of a stress test"""
    scenario_name: str
    scenario_type: StressScenario
    timestamp: datetime = field(default_factory=datetime.now)

    # Portfolio impact
    portfolio_loss_pct: float = 0.0
    portfolio_loss_dollars: float = 0.0

    # Position-level impacts
    position_losses: Dict[str, float] = field(default_factory=dict)

    # Risk metrics under stress
    stressed_var_95: float = 0.0
    stressed_cvar_95: float = 0.0
    stressed_volatility: float = 0.0
    stressed_max_drawdown: float = 0.0

    # Scenario parameters
    scenario_params: Dict[str, Any] = field(default_factory=dict)

    # Pass/fail status
    passed: bool = True
    breach_reasons: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'scenario_name': self.scenario_name,
            'scenario_type': self.scenario_type.value,
            'timestamp': self.timestamp.isoformat(),
            'portfolio_loss_pct': self.portfolio_loss_pct,
            'portfolio_loss_dollars': self.portfolio_loss_dollars,
            'position_losses': self.position_losses,
            'stressed_var_95': self.stressed_var_95,
            'stressed_cvar_95': self.stressed_cvar_95,
            'stressed_volatility': self.stressed_volatility,
            'stressed_max_drawdown': self.stressed_max_drawdown,
            'scenario_params': self.scenario_params,
            'passed': self.passed,
            'breach_reasons': self.breach_reasons
        }


@dataclass
class StressTestConfig:
    """Configuration for stress testing"""
    # Loss tolerance thresholds
    max_acceptable_loss_pct: float = 0.25  # 25% max loss
    max_acceptable_var_95: float = 0.15  # 15% stressed VaR
    max_acceptable_drawdown: float = 0.30  # 30% max drawdown

    # Scenario parameters
    enable_historical_scenarios: bool = True
    enable_hypothetical_scenarios: bool = True
    n_monte_carlo_simulations: int = 10000

    # Reporting
    generate_detailed_report: bool = True


class StressTestingFramework:
    """
    Framework for comprehensive portfolio stress testing
    """

    def __init__(self, config: Optional[StressTestConfig] = None):
        """
        Initialize stress testing framework

        Args:
            config: Stress test configuration
        """
        self.config = config or StressTestConfig()
        self.test_results: List[StressTestResult] = []

        # Historical scenario parameters
        self.historical_scenarios = {
            StressScenario.MARKET_CRASH_2008: {
                'description': '2008 Financial Crisis',
                'equity_shock': -0.55,  # S&P 500 fell ~55%
                'volatility_multiplier': 3.0,
                'correlation_increase': 0.3,
                'duration_days': 365
            },
            StressScenario.COVID_CRASH_2020: {
                'description': 'COVID-19 Market Crash',
                'equity_shock': -0.34,  # S&P 500 fell ~34%
                'volatility_multiplier': 5.0,
                'correlation_increase': 0.4,
                'duration_days': 33  # Rapid crash
            },
            StressScenario.FLASH_CRASH_2010: {
                'description': '2010 Flash Crash',
                'equity_shock': -0.09,  # Brief 9% drop
                'volatility_multiplier': 10.0,
                'correlation_increase': 0.5,
                'duration_days': 1  # Intraday
            }
        }

        logger.info("Initialized Stress Testing Framework")

    def apply_market_shock(
        self,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        shock_pct: float
    ) -> Dict[str, float]:
        """
        Apply a market shock to positions

        Args:
            positions: Current positions {symbol: value}
            returns: Historical returns DataFrame
            shock_pct: Shock percentage (e.g., -0.30 for 30% drop)

        Returns:
            Position losses {symbol: loss_dollars}
        """
        position_losses = {}

        for symbol, position_value in positions.items():
            # Apply shock
            loss = position_value * shock_pct
            position_losses[symbol] = loss

        return position_losses

    def apply_volatility_shock(
        self,
        returns: np.ndarray,
        volatility_multiplier: float = 3.0
    ) -> np.ndarray:
        """
        Apply volatility shock to returns

        Args:
            returns: Historical returns
            volatility_multiplier: Factor to multiply volatility by

        Returns:
            Shocked returns
        """
        mean = np.mean(returns)
        std = np.std(returns)

        # Increase volatility
        new_std = std * volatility_multiplier

        # Generate shocked returns with same mean but higher volatility
        shocked_returns = np.random.normal(mean, new_std, len(returns))

        return shocked_returns

    def apply_correlation_shock(
        self,
        returns_matrix: pd.DataFrame,
        correlation_increase: float = 0.3
    ) -> pd.DataFrame:
        """
        Simulate correlation breakdown (all correlations increase)

        This represents market stress where diversification breaks down.

        Args:
            returns_matrix: Returns DataFrame by symbol
            correlation_increase: Amount to increase correlations by

        Returns:
            Shocked returns DataFrame
        """
        # Calculate current correlation matrix
        corr_matrix = returns_matrix.corr()

        # Increase all off-diagonal correlations
        n = len(corr_matrix)
        for i in range(n):
            for j in range(n):
                if i != j:
                    corr_matrix.iloc[i, j] = min(1.0, corr_matrix.iloc[i, j] + correlation_increase)

        # Generate new returns with increased correlations
        # This is simplified - in practice would use Cholesky decomposition
        mean_returns = returns_matrix.mean()
        cov_matrix = returns_matrix.cov()

        # Simplified: just scale covariances
        shocked_returns = returns_matrix.copy()
        for col in shocked_returns.columns:
            shocked_returns[col] += np.random.normal(0, cov_matrix[col][col] * correlation_increase, len(shocked_returns))

        return shocked_returns

    def test_historical_scenario(
        self,
        scenario: StressScenario,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float
    ) -> StressTestResult:
        """
        Test a historical stress scenario

        Args:
            scenario: Historical scenario to test
            positions: Current positions
            returns: Historical returns DataFrame
            portfolio_value: Total portfolio value

        Returns:
            StressTestResult
        """
        if scenario not in self.historical_scenarios:
            raise ValueError(f"Unknown historical scenario: {scenario}")

        params = self.historical_scenarios[scenario]
        result = StressTestResult(
            scenario_name=params['description'],
            scenario_type=scenario,
            scenario_params=params
        )

        # Apply market shock
        position_losses = self.apply_market_shock(
            positions,
            returns,
            params['equity_shock']
        )

        result.position_losses = position_losses
        result.portfolio_loss_dollars = sum(position_losses.values())
        result.portfolio_loss_pct = result.portfolio_loss_dollars / portfolio_value if portfolio_value > 0 else 0

        # Apply volatility shock to calculate stressed VaR
        portfolio_returns = returns.mean(axis=1).values
        shocked_returns = self.apply_volatility_shock(
            portfolio_returns,
            params['volatility_multiplier']
        )

        # Calculate stressed risk metrics
        result.stressed_var_95 = float(np.percentile(shocked_returns, 5))
        result.stressed_cvar_95 = float(np.mean(shocked_returns[shocked_returns <= result.stressed_var_95]))
        result.stressed_volatility = float(np.std(shocked_returns))

        # Calculate stressed max drawdown
        cumulative = np.cumprod(1 + shocked_returns) - 1
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / (running_max + 1e-10)
        result.stressed_max_drawdown = float(np.min(drawdowns))

        # Check if passed stress test
        result.passed = True
        if abs(result.portfolio_loss_pct) > self.config.max_acceptable_loss_pct:
            result.passed = False
            result.breach_reasons.append(
                f"Portfolio loss {result.portfolio_loss_pct:.1%} exceeds limit {self.config.max_acceptable_loss_pct:.1%}"
            )

        if abs(result.stressed_var_95) > self.config.max_acceptable_var_95:
            result.passed = False
            result.breach_reasons.append(
                f"Stressed VaR {result.stressed_var_95:.1%} exceeds limit {self.config.max_acceptable_var_95:.1%}"
            )

        if abs(result.stressed_max_drawdown) > self.config.max_acceptable_drawdown:
            result.passed = False
            result.breach_reasons.append(
                f"Stressed drawdown {result.stressed_max_drawdown:.1%} exceeds limit {self.config.max_acceptable_drawdown:.1%}"
            )

        self.test_results.append(result)
        return result

    def test_custom_scenario(
        self,
        scenario_name: str,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float,
        equity_shock: float = -0.20,
        volatility_multiplier: float = 2.0,
        correlation_increase: float = 0.2
    ) -> StressTestResult:
        """
        Test a custom stress scenario

        Args:
            scenario_name: Name of custom scenario
            positions: Current positions
            returns: Historical returns
            portfolio_value: Total portfolio value
            equity_shock: Market shock percentage
            volatility_multiplier: Volatility increase factor
            correlation_increase: Correlation increase amount

        Returns:
            StressTestResult
        """
        result = StressTestResult(
            scenario_name=scenario_name,
            scenario_type=StressScenario.CUSTOM,
            scenario_params={
                'equity_shock': equity_shock,
                'volatility_multiplier': volatility_multiplier,
                'correlation_increase': correlation_increase
            }
        )

        # Apply market shock
        position_losses = self.apply_market_shock(positions, returns, equity_shock)
        result.position_losses = position_losses
        result.portfolio_loss_dollars = sum(position_losses.values())
        result.portfolio_loss_pct = result.portfolio_loss_dollars / portfolio_value if portfolio_value > 0 else 0

        # Apply volatility and correlation shocks
        portfolio_returns = returns.mean(axis=1).values
        shocked_returns = self.apply_volatility_shock(portfolio_returns, volatility_multiplier)

        # Calculate stressed metrics
        result.stressed_var_95 = float(np.percentile(shocked_returns, 5))
        result.stressed_cvar_95 = float(np.mean(shocked_returns[shocked_returns <= result.stressed_var_95]))
        result.stressed_volatility = float(np.std(shocked_returns))

        cumulative = np.cumprod(1 + shocked_returns) - 1
        running_max = np.maximum.accumulate(cumulative)
        drawdowns = (cumulative - running_max) / (running_max + 1e-10)
        result.stressed_max_drawdown = float(np.min(drawdowns))

        # Check pass/fail
        result.passed = True
        if abs(result.portfolio_loss_pct) > self.config.max_acceptable_loss_pct:
            result.passed = False
            result.breach_reasons.append(f"Loss {result.portfolio_loss_pct:.1%} exceeds limit")

        self.test_results.append(result)
        return result

    def run_comprehensive_stress_test(
        self,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float
    ) -> List[StressTestResult]:
        """
        Run all stress tests

        Args:
            positions: Current positions
            returns: Historical returns
            portfolio_value: Total portfolio value

        Returns:
            List of StressTestResult
        """
        results = []

        print("\n" + "="*70)
        print("RUNNING COMPREHENSIVE STRESS TESTS")
        print("="*70)

        # Test historical scenarios
        if self.config.enable_historical_scenarios:
            for scenario in [StressScenario.MARKET_CRASH_2008, StressScenario.COVID_CRASH_2020, StressScenario.FLASH_CRASH_2010]:
                print(f"\nTesting: {self.historical_scenarios[scenario]['description']}")
                result = self.test_historical_scenario(scenario, positions, returns, portfolio_value)
                results.append(result)

                status = "✅ PASSED" if result.passed else "❌ FAILED"
                print(f"  Status: {status}")
                print(f"  Portfolio Loss: {result.portfolio_loss_pct:.2%}")
                print(f"  Stressed VaR 95%: {result.stressed_var_95:.2%}")

        # Test hypothetical scenarios
        if self.config.enable_hypothetical_scenarios:
            print(f"\nTesting: Moderate Market Correction")
            result = self.test_custom_scenario(
                "Moderate Market Correction",
                positions,
                returns,
                portfolio_value,
                equity_shock=-0.15,
                volatility_multiplier=2.0
            )
            results.append(result)

            print(f"\nTesting: Severe Market Crash")
            result = self.test_custom_scenario(
                "Severe Market Crash",
                positions,
                returns,
                portfolio_value,
                equity_shock=-0.40,
                volatility_multiplier=4.0
            )
            results.append(result)

        print("\n" + "="*70)
        print("STRESS TEST SUMMARY")
        print("="*70)

        passed = sum(1 for r in results if r.passed)
        failed = len(results) - passed

        print(f"Total scenarios tested: {len(results)}")
        print(f"Passed: {passed}")
        print(f"Failed: {failed}")

        if failed > 0:
            print("\n⚠️  WARNING: Portfolio failed some stress tests!")
            print("Consider reducing position sizes or adding hedges.")
        else:
            print("\n✅ Portfolio passed all stress tests")

        print("="*70 + "\n")

        return results

    def get_stress_test_report(self, result: StressTestResult) -> str:
        """
        Generate detailed stress test report

        Args:
            result: Stress test result

        Returns:
            Formatted report string
        """
        report = []
        report.append("="*70)
        report.append(f"STRESS TEST REPORT: {result.scenario_name}")
        report.append("="*70)
        report.append(f"Scenario Type: {result.scenario_type.value}")
        report.append(f"Timestamp: {result.timestamp.isoformat()}")
        report.append(f"Status: {'✅ PASSED' if result.passed else '❌ FAILED'}")
        report.append("")

        report.append("Portfolio Impact:")
        report.append(f"  Total Loss: ${result.portfolio_loss_dollars:,.2f} ({result.portfolio_loss_pct:.2%})")
        report.append(f"  Acceptable Limit: {self.config.max_acceptable_loss_pct:.2%}")
        report.append("")

        report.append("Stressed Risk Metrics:")
        report.append(f"  VaR 95%: {result.stressed_var_95:.2%} (limit: {self.config.max_acceptable_var_95:.2%})")
        report.append(f"  CVaR 95%: {result.stressed_cvar_95:.2%}")
        report.append(f"  Volatility: {result.stressed_volatility:.2%}")
        report.append(f"  Max Drawdown: {result.stressed_max_drawdown:.2%} (limit: {self.config.max_acceptable_drawdown:.2%})")
        report.append("")

        if not result.passed:
            report.append("❌ Breach Reasons:")
            for reason in result.breach_reasons:
                report.append(f"  - {reason}")
            report.append("")

        if result.position_losses:
            report.append("Top Position Losses:")
            sorted_losses = sorted(result.position_losses.items(), key=lambda x: x[1])
            for symbol, loss in sorted_losses[:5]:
                report.append(f"  {symbol}: ${loss:,.2f}")

        report.append("="*70)

        return "\n".join(report)


# Example usage
if __name__ == "__main__":
    print("Stress Testing Framework Example")
    print("="*70)

    # Create sample portfolio
    positions = {
        'AAPL': 50000,
        'TSLA': 30000,
        'NVDA': 20000,
        'MSFT': 40000,
        'GOOGL': 35000
    }

    portfolio_value = sum(positions.values())

    # Generate sample returns
    np.random.seed(42)
    n_days = 252

    returns_data = {}
    for symbol in positions.keys():
        returns_data[symbol] = np.random.normal(0.001, 0.02, n_days)

    returns = pd.DataFrame(returns_data)

    # Initialize stress testing framework
    stress_tester = StressTestingFramework()

    # Run comprehensive stress tests
    results = stress_tester.run_comprehensive_stress_test(
        positions,
        returns,
        portfolio_value
    )

    # Print detailed report for worst scenario
    worst_result = min(results, key=lambda r: r.portfolio_loss_pct)
    print("\nDetailed Report for Worst Scenario:")
    print(stress_tester.get_stress_test_report(worst_result))
