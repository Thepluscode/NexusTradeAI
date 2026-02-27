"""
Scenario Analysis Engine
=========================
Comprehensive scenario analysis for portfolio risk assessment.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Multi-factor scenario analysis
- What-if analysis
- Sensitivity analysis
- Monte Carlo scenario generation
- Custom scenario builder
- Scenario comparison and ranking
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class ScenarioType(str, Enum):
    """Types of scenarios"""
    HISTORICAL = "historical"
    HYPOTHETICAL = "hypothetical"
    MONTE_CARLO = "monte_carlo"
    SENSITIVITY = "sensitivity"
    CUSTOM = "custom"


@dataclass
class ScenarioParameters:
    """Parameters for a scenario"""
    name: str
    scenario_type: ScenarioType

    # Market shocks
    equity_shock_pct: float = 0.0
    bond_shock_pct: float = 0.0
    commodity_shock_pct: float = 0.0
    fx_shock_pct: float = 0.0

    # Volatility changes
    volatility_multiplier: float = 1.0

    # Interest rate changes
    interest_rate_change_bps: float = 0.0

    # Correlation changes
    correlation_change: float = 0.0

    # Custom factor shocks
    custom_shocks: Dict[str, float] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'name': self.name,
            'scenario_type': self.scenario_type.value,
            'equity_shock_pct': self.equity_shock_pct,
            'bond_shock_pct': self.bond_shock_pct,
            'commodity_shock_pct': self.commodity_shock_pct,
            'fx_shock_pct': self.fx_shock_pct,
            'volatility_multiplier': self.volatility_multiplier,
            'interest_rate_change_bps': self.interest_rate_change_bps,
            'correlation_change': self.correlation_change,
            'custom_shocks': self.custom_shocks
        }


@dataclass
class ScenarioResult:
    """Result of scenario analysis"""
    scenario_name: str
    scenario_params: ScenarioParameters
    timestamp: datetime = field(default_factory=datetime.now)

    # Portfolio impact
    portfolio_value_change: float = 0.0
    portfolio_value_change_pct: float = 0.0

    # Position-level impacts
    position_impacts: Dict[str, float] = field(default_factory=dict)

    # Risk metrics in scenario
    scenario_var_95: float = 0.0
    scenario_volatility: float = 0.0
    scenario_sharpe: float = 0.0

    # Ranking metrics
    severity_score: float = 0.0  # 0-100, higher = worse
    probability: float = 0.0  # For probabilistic scenarios

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'scenario_name': self.scenario_name,
            'timestamp': self.timestamp.isoformat(),
            'portfolio_value_change': self.portfolio_value_change,
            'portfolio_value_change_pct': self.portfolio_value_change_pct,
            'position_impacts': self.position_impacts,
            'scenario_var_95': self.scenario_var_95,
            'scenario_volatility': self.scenario_volatility,
            'scenario_sharpe': self.scenario_sharpe,
            'severity_score': self.severity_score,
            'probability': self.probability
        }


class ScenarioAnalysisEngine:
    """
    Engine for comprehensive scenario analysis
    """

    def __init__(self):
        """Initialize scenario analysis engine"""
        self.scenario_library: Dict[str, ScenarioParameters] = {}
        self.scenario_results: List[ScenarioResult] = []

        # Initialize predefined scenarios
        self._initialize_scenario_library()

        logger.info("Initialized Scenario Analysis Engine")

    def _initialize_scenario_library(self):
        """Initialize library of predefined scenarios"""

        # Mild recession
        self.scenario_library['mild_recession'] = ScenarioParameters(
            name="Mild Recession",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.15,
            bond_shock_pct=0.05,
            volatility_multiplier=1.5,
            interest_rate_change_bps=-50
        )

        # Severe recession
        self.scenario_library['severe_recession'] = ScenarioParameters(
            name="Severe Recession",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.30,
            bond_shock_pct=0.10,
            volatility_multiplier=2.5,
            interest_rate_change_bps=-100
        )

        # Inflation shock
        self.scenario_library['inflation_shock'] = ScenarioParameters(
            name="Inflation Shock",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.10,
            bond_shock_pct=-0.15,
            commodity_shock_pct=0.30,
            interest_rate_change_bps=200,
            volatility_multiplier=2.0
        )

        # Interest rate spike
        self.scenario_library['rate_spike'] = ScenarioParameters(
            name="Interest Rate Spike",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.12,
            bond_shock_pct=-0.10,
            interest_rate_change_bps=300,
            volatility_multiplier=1.8
        )

        # Market crash
        self.scenario_library['market_crash'] = ScenarioParameters(
            name="Market Crash",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.40,
            volatility_multiplier=4.0,
            correlation_change=0.4
        )

        # Tech bubble burst
        self.scenario_library['tech_bubble'] = ScenarioParameters(
            name="Tech Bubble Burst",
            scenario_type=ScenarioType.HYPOTHETICAL,
            equity_shock_pct=-0.50,  # Tech heavy
            volatility_multiplier=3.5
        )

        # Currency crisis
        self.scenario_library['currency_crisis'] = ScenarioParameters(
            name="Currency Crisis",
            scenario_type=ScenarioType.HYPOTHETICAL,
            fx_shock_pct=-0.25,
            equity_shock_pct=-0.15,
            volatility_multiplier=2.5
        )

    def add_custom_scenario(
        self,
        scenario_id: str,
        params: ScenarioParameters
    ):
        """
        Add custom scenario to library

        Args:
            scenario_id: Unique scenario identifier
            params: Scenario parameters
        """
        self.scenario_library[scenario_id] = params
        logger.info(f"Added custom scenario: {scenario_id}")

    def apply_scenario(
        self,
        params: ScenarioParameters,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float,
        asset_betas: Optional[Dict[str, float]] = None
    ) -> ScenarioResult:
        """
        Apply scenario to portfolio

        Args:
            params: Scenario parameters
            positions: Portfolio positions
            returns: Historical returns
            portfolio_value: Current portfolio value
            asset_betas: Asset betas to market (optional)

        Returns:
            ScenarioResult
        """
        result = ScenarioResult(
            scenario_name=params.name,
            scenario_params=params
        )

        # Calculate position impacts
        position_impacts = {}

        for symbol, position_value in positions.items():
            # Default: apply equity shock
            shock = params.equity_shock_pct

            # If we have beta information, scale by beta
            if asset_betas and symbol in asset_betas:
                shock *= asset_betas[symbol]

            # Apply custom shocks if specified
            if symbol in params.custom_shocks:
                shock = params.custom_shocks[symbol]

            impact = position_value * shock
            position_impacts[symbol] = impact

        result.position_impacts = position_impacts

        # Total portfolio impact
        result.portfolio_value_change = sum(position_impacts.values())
        result.portfolio_value_change_pct = result.portfolio_value_change / portfolio_value if portfolio_value > 0 else 0

        # Calculate scenario risk metrics
        if not returns.empty:
            # Apply volatility shock
            portfolio_returns = returns.mean(axis=1).values
            shocked_volatility = np.std(portfolio_returns) * params.volatility_multiplier * np.sqrt(252)
            result.scenario_volatility = shocked_volatility

            # Scenario VaR
            shocked_returns = portfolio_returns * params.volatility_multiplier
            result.scenario_var_95 = float(np.percentile(shocked_returns, 5))

            # Scenario Sharpe (approximate)
            mean_return = np.mean(portfolio_returns) * 252
            result.scenario_sharpe = (mean_return - 0.02) / shocked_volatility if shocked_volatility > 0 else 0

        # Calculate severity score (0-100)
        result.severity_score = min(100, abs(result.portfolio_value_change_pct) * 100)

        # Store result
        self.scenario_results.append(result)

        return result

    def run_sensitivity_analysis(
        self,
        base_params: ScenarioParameters,
        sensitivity_factor: str,
        factor_range: List[float],
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float
    ) -> List[ScenarioResult]:
        """
        Run sensitivity analysis by varying one factor

        Args:
            base_params: Base scenario parameters
            sensitivity_factor: Factor to vary (e.g., 'equity_shock_pct')
            factor_range: List of values to test
            positions: Portfolio positions
            returns: Historical returns
            portfolio_value: Current portfolio value

        Returns:
            List of ScenarioResults
        """
        results = []

        for value in factor_range:
            # Create modified scenario
            modified_params = ScenarioParameters(
                name=f"{base_params.name} ({sensitivity_factor}={value:.2f})",
                scenario_type=ScenarioType.SENSITIVITY,
                equity_shock_pct=base_params.equity_shock_pct,
                bond_shock_pct=base_params.bond_shock_pct,
                commodity_shock_pct=base_params.commodity_shock_pct,
                fx_shock_pct=base_params.fx_shock_pct,
                volatility_multiplier=base_params.volatility_multiplier,
                interest_rate_change_bps=base_params.interest_rate_change_bps,
                correlation_change=base_params.correlation_change
            )

            # Set the sensitivity factor
            setattr(modified_params, sensitivity_factor, value)

            # Run scenario
            result = self.apply_scenario(
                modified_params,
                positions,
                returns,
                portfolio_value
            )

            results.append(result)

        return results

    def run_monte_carlo_scenarios(
        self,
        n_scenarios: int,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float,
        shock_std: float = 0.10
    ) -> List[ScenarioResult]:
        """
        Generate Monte Carlo scenarios

        Args:
            n_scenarios: Number of scenarios to generate
            positions: Portfolio positions
            returns: Historical returns
            portfolio_value: Current portfolio value
            shock_std: Standard deviation of shocks

        Returns:
            List of ScenarioResults
        """
        results = []

        for i in range(n_scenarios):
            # Generate random shocks
            equity_shock = np.random.normal(0, shock_std)
            volatility_mult = abs(np.random.normal(1, 0.5))

            params = ScenarioParameters(
                name=f"Monte Carlo #{i+1}",
                scenario_type=ScenarioType.MONTE_CARLO,
                equity_shock_pct=equity_shock,
                volatility_multiplier=volatility_mult
            )

            result = self.apply_scenario(
                params,
                positions,
                returns,
                portfolio_value
            )

            # Assign probability (uniform for Monte Carlo)
            result.probability = 1.0 / n_scenarios

            results.append(result)

        return results

    def run_comprehensive_analysis(
        self,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        portfolio_value: float,
        include_monte_carlo: bool = True,
        n_monte_carlo: int = 1000
    ) -> List[ScenarioResult]:
        """
        Run comprehensive scenario analysis

        Args:
            positions: Portfolio positions
            returns: Historical returns
            portfolio_value: Current portfolio value
            include_monte_carlo: Whether to include Monte Carlo scenarios
            n_monte_carlo: Number of Monte Carlo scenarios

        Returns:
            List of all scenario results
        """
        all_results = []

        print("\n" + "="*70)
        print("RUNNING COMPREHENSIVE SCENARIO ANALYSIS")
        print("="*70)

        # Run all predefined scenarios
        print(f"\nTesting {len(self.scenario_library)} predefined scenarios...")
        for scenario_id, params in self.scenario_library.items():
            result = self.apply_scenario(params, positions, returns, portfolio_value)
            all_results.append(result)

            print(f"  {params.name:30s}: {result.portfolio_value_change_pct:+7.2%}")

        # Run Monte Carlo if requested
        if include_monte_carlo:
            print(f"\nGenerating {n_monte_carlo} Monte Carlo scenarios...")
            mc_results = self.run_monte_carlo_scenarios(
                n_monte_carlo,
                positions,
                returns,
                portfolio_value
            )
            all_results.extend(mc_results)

            # Statistics on Monte Carlo results
            mc_losses = [r.portfolio_value_change_pct for r in mc_results]
            print(f"  Mean loss: {np.mean(mc_losses):.2%}")
            print(f"  Median loss: {np.median(mc_losses):.2%}")
            print(f"  95% worst case: {np.percentile(mc_losses, 5):.2%}")

        print("\n" + "="*70)
        print(f"Total scenarios analyzed: {len(all_results)}")
        print("="*70 + "\n")

        return all_results

    def rank_scenarios(
        self,
        results: List[ScenarioResult],
        metric: str = 'severity_score'
    ) -> List[ScenarioResult]:
        """
        Rank scenarios by severity

        Args:
            results: List of scenario results
            metric: Metric to rank by ('severity_score', 'portfolio_value_change_pct', etc.)

        Returns:
            Sorted list of scenarios (worst first)
        """
        if metric == 'severity_score':
            return sorted(results, key=lambda r: r.severity_score, reverse=True)
        elif metric == 'portfolio_value_change_pct':
            return sorted(results, key=lambda r: r.portfolio_value_change_pct)
        else:
            return results

    def get_worst_case_scenarios(
        self,
        results: List[ScenarioResult],
        top_n: int = 5
    ) -> List[ScenarioResult]:
        """
        Get worst-case scenarios

        Args:
            results: List of scenario results
            top_n: Number of worst scenarios to return

        Returns:
            List of worst scenarios
        """
        ranked = self.rank_scenarios(results, 'severity_score')
        return ranked[:top_n]

    def print_scenario_report(
        self,
        result: ScenarioResult,
        show_position_details: bool = True
    ):
        """
        Print scenario analysis report

        Args:
            result: Scenario result
            show_position_details: Whether to show position-level impacts
        """
        print("\n" + "="*70)
        print(f"SCENARIO ANALYSIS: {result.scenario_name}")
        print("="*70)
        print(f"Type: {result.scenario_params.scenario_type.value}")
        print(f"Timestamp: {result.timestamp.isoformat()}")
        print()

        print("PORTFOLIO IMPACT:")
        print(f"  Value Change: ${result.portfolio_value_change:,.2f}")
        print(f"  Percentage Change: {result.portfolio_value_change_pct:.2%}")
        print(f"  Severity Score: {result.severity_score:.1f}/100")
        print()

        print("SCENARIO PARAMETERS:")
        params = result.scenario_params
        if params.equity_shock_pct != 0:
            print(f"  Equity Shock: {params.equity_shock_pct:+.1%}")
        if params.bond_shock_pct != 0:
            print(f"  Bond Shock: {params.bond_shock_pct:+.1%}")
        if params.volatility_multiplier != 1.0:
            print(f"  Volatility Multiplier: {params.volatility_multiplier:.2f}x")
        if params.interest_rate_change_bps != 0:
            print(f"  Interest Rate Change: {params.interest_rate_change_bps:+.0f} bps")
        print()

        print("RISK METRICS IN SCENARIO:")
        print(f"  VaR 95%: {result.scenario_var_95:.2%}")
        print(f"  Volatility: {result.scenario_volatility:.2%}")
        print(f"  Sharpe Ratio: {result.scenario_sharpe:.2f}")
        print()

        if show_position_details and result.position_impacts:
            print("TOP POSITION IMPACTS:")
            sorted_impacts = sorted(
                result.position_impacts.items(),
                key=lambda x: x[1]
            )
            for symbol, impact in sorted_impacts[:5]:
                print(f"  {symbol:8s}: ${impact:,.2f}")

        print("="*70 + "\n")


# Example usage
if __name__ == "__main__":
    print("Scenario Analysis Engine Example")
    print("="*70)

    # Create sample portfolio
    positions = {
        'AAPL': 100000,
        'MSFT': 80000,
        'GOOGL': 90000,
        'TSLA': 60000,
        'NVDA': 70000
    }

    portfolio_value = sum(positions.values())

    # Generate sample returns
    np.random.seed(42)
    n_days = 252

    returns_data = {}
    for symbol in positions.keys():
        returns_data[symbol] = np.random.normal(0.001, 0.02, n_days)

    returns = pd.DataFrame(returns_data)

    # Initialize scenario engine
    engine = ScenarioAnalysisEngine()

    # Run comprehensive analysis
    all_results = engine.run_comprehensive_analysis(
        positions,
        returns,
        portfolio_value,
        include_monte_carlo=True,
        n_monte_carlo=1000
    )

    # Get worst-case scenarios
    worst_scenarios = engine.get_worst_case_scenarios(all_results, top_n=3)

    print("\nWORST-CASE SCENARIOS:")
    print("="*70)
    for i, scenario in enumerate(worst_scenarios, 1):
        print(f"\n{i}. {scenario.scenario_name}")
        print(f"   Loss: {scenario.portfolio_value_change_pct:.2%}")
        print(f"   Severity: {scenario.severity_score:.1f}/100")

    # Detailed report for worst scenario
    print("\nDETAILED REPORT FOR WORST SCENARIO:")
    engine.print_scenario_report(worst_scenarios[0])

    # Sensitivity analysis
    print("\nSENSITIVITY ANALYSIS:")
    print("="*70)
    base_scenario = engine.scenario_library['mild_recession']
    sensitivity_results = engine.run_sensitivity_analysis(
        base_scenario,
        'equity_shock_pct',
        [-0.05, -0.10, -0.15, -0.20, -0.25],
        positions,
        returns,
        portfolio_value
    )

    print("\nEquity Shock Sensitivity:")
    for result in sensitivity_results:
        shock = result.scenario_params.equity_shock_pct
        loss = result.portfolio_value_change_pct
        print(f"  Shock {shock:+.1%}: Portfolio Loss {loss:.2%}")

    print("\n" + "="*70)
