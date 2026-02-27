"""
Risk & Execution Integration Pipeline
=====================================
End-to-end integration of risk management and execution systems.

Author: NexusTradeAI Integration Team
Version: 1.0
Date: December 25, 2024

Features:
- Complete trade lifecycle management
- Risk checks at every stage
- Optimal execution with cost minimization
- Real-time monitoring and alerts
- Automated rebalancing
- Performance tracking
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

# Import Phase 3 Week 9 components (Risk Management)
import sys
sys.path.append('../risk')
from portfolio_risk_manager import PortfolioRiskManager, RiskMetrics
from correlation_analyzer import CorrelationAnalyzer
from scenario_analysis import ScenarioAnalyzer

# Import Phase 3 Week 10 components (Position Sizing)
from position_sizer import PositionSizer, SizingMethod, SizingParameters
from dynamic_volatility_sizer import DynamicVolatilitySizer
from portfolio_optimizer import PortfolioOptimizer, OptimizationMethod
from risk_limit_enforcer import RiskLimitEnforcer, EnforcementAction

# Import Phase 3 Week 11 components (Execution)
sys.path.append('../execution')
from market_impact_models import MarketImpactModel, MarketImpactParameters
from execution_algorithms import ExecutionAlgorithm, AlgorithmType
from smart_order_router import SmartOrderRouter, RoutingStrategy
from transaction_cost_analysis import TransactionCostAnalyzer

logger = logging.getLogger(__name__)


class PipelineStage(Enum):
    """Pipeline stages"""
    SIGNAL_GENERATION = "signal_generation"
    RISK_ANALYSIS = "risk_analysis"
    POSITION_SIZING = "position_sizing"
    PRE_TRADE_CHECKS = "pre_trade_checks"
    EXECUTION_PLANNING = "execution_planning"
    ORDER_ROUTING = "order_routing"
    EXECUTION = "execution"
    POST_TRADE_ANALYSIS = "post_trade_analysis"


@dataclass
class TradeSignal:
    """Trading signal input"""
    symbol: str
    side: str  # "buy" or "sell"
    signal_strength: float  # 0-1
    target_shares: Optional[int] = None
    target_value: Optional[float] = None
    urgency: float = 0.5  # 0-1
    timestamp: datetime = field(default_factory=datetime.now)


@dataclass
class PipelineResult:
    """Complete pipeline execution result"""
    signal: TradeSignal
    stage_results: Dict[str, Any] = field(default_factory=dict)
    final_decision: str = "pending"  # "execute", "block", "defer"
    execution_summary: Dict[str, Any] = field(default_factory=dict)
    total_cost_bps: float = 0.0
    success: bool = False
    errors: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'signal': {
                'symbol': self.signal.symbol,
                'side': self.signal.side,
                'signal_strength': self.signal.signal_strength,
                'urgency': self.signal.urgency
            },
            'stage_results': self.stage_results,
            'final_decision': self.final_decision,
            'execution_summary': self.execution_summary,
            'total_cost_bps': self.total_cost_bps,
            'success': self.success,
            'errors': self.errors,
            'warnings': self.warnings,
            'timestamp': self.timestamp.isoformat()
        }


class RiskExecutionPipeline:
    """
    Integrated risk management and execution pipeline
    """

    def __init__(
        self,
        portfolio_value: float,
        risk_free_rate: float = 0.02
    ):
        """
        Initialize integrated pipeline

        Args:
            portfolio_value: Total portfolio value
            risk_free_rate: Risk-free rate
        """
        self.portfolio_value = portfolio_value
        self.risk_free_rate = risk_free_rate

        # Week 9: Risk Management
        self.risk_manager = PortfolioRiskManager()
        self.correlation_analyzer = CorrelationAnalyzer()
        self.scenario_analyzer = ScenarioAnalyzer()

        # Week 10: Position Sizing
        self.position_sizer = PositionSizer()
        self.vol_sizer = DynamicVolatilitySizer()
        self.portfolio_optimizer = PortfolioOptimizer(risk_free_rate)
        self.risk_enforcer = RiskLimitEnforcer()

        # Week 11: Execution
        self.impact_model = MarketImpactModel()
        self.execution_algo = ExecutionAlgorithm()
        self.order_router = SmartOrderRouter()
        self.tca = TransactionCostAnalyzer()

        # Portfolio state
        self.positions: Dict[str, float] = {}
        self.returns: pd.DataFrame = pd.DataFrame()
        self.current_prices: Dict[str, float] = {}

        # Pipeline history
        self.pipeline_history: List[PipelineResult] = []

        logger.info(f"Initialized RiskExecutionPipeline with ${portfolio_value:,.0f} portfolio")

    def update_portfolio_state(
        self,
        positions: Dict[str, float],
        returns: pd.DataFrame,
        current_prices: Dict[str, float],
        daily_pnl: float = 0.0,
        weekly_pnl: float = 0.0,
        monthly_pnl: float = 0.0
    ):
        """
        Update current portfolio state

        Args:
            positions: Current positions {symbol: value}
            returns: Historical returns DataFrame
            current_prices: Current prices {symbol: price}
            daily_pnl: Daily P&L
            weekly_pnl: Weekly P&L
            monthly_pnl: Monthly P&L
        """
        self.positions = positions
        self.returns = returns
        self.current_prices = current_prices

        # Update risk enforcer
        self.risk_enforcer.update_portfolio_state(
            portfolio_value=self.portfolio_value,
            positions=positions,
            daily_pnl=daily_pnl,
            weekly_pnl=weekly_pnl,
            monthly_pnl=monthly_pnl
        )

        logger.info(f"Updated portfolio state: {len(positions)} positions, "
                   f"${sum(positions.values()):,.0f} total exposure")

    def process_signal(
        self,
        signal: TradeSignal,
        market_data: Optional[pd.DataFrame] = None,
        venue_quotes: Optional[List] = None
    ) -> PipelineResult:
        """
        Process trading signal through complete pipeline

        Args:
            signal: Trading signal
            market_data: Market data for analysis
            venue_quotes: Venue quotes for routing

        Returns:
            PipelineResult with complete execution details
        """
        result = PipelineResult(signal=signal)

        logger.info(f"Processing signal: {signal.side.upper()} {signal.symbol} "
                   f"(strength: {signal.signal_strength:.2f}, urgency: {signal.urgency:.2f})")

        try:
            # Stage 1: Risk Analysis
            logger.info("Stage 1: Risk Analysis")
            risk_result = self._stage_risk_analysis(signal, result)
            if not risk_result:
                result.final_decision = "block"
                result.errors.append("Failed risk analysis")
                return result

            # Stage 2: Position Sizing
            logger.info("Stage 2: Position Sizing")
            sizing_result = self._stage_position_sizing(signal, result)
            if not sizing_result:
                result.final_decision = "block"
                result.errors.append("Failed position sizing")
                return result

            # Stage 3: Pre-Trade Risk Checks
            logger.info("Stage 3: Pre-Trade Risk Checks")
            precheck_result = self._stage_pre_trade_checks(signal, result)
            if not precheck_result:
                result.final_decision = "block"
                result.errors.append("Failed pre-trade checks")
                return result

            # Stage 4: Execution Planning
            logger.info("Stage 4: Execution Planning")
            execution_plan = self._stage_execution_planning(signal, result)
            if not execution_plan:
                result.final_decision = "defer"
                result.warnings.append("Cannot execute now, defer to later")
                return result

            # Stage 5: Order Routing
            logger.info("Stage 5: Order Routing")
            routing_plan = self._stage_order_routing(signal, result, venue_quotes)
            if not routing_plan:
                result.final_decision = "block"
                result.errors.append("Failed order routing")
                return result

            # Stage 6: Execution (simulated)
            logger.info("Stage 6: Execution")
            execution_result = self._stage_execution(signal, result)
            if not execution_result:
                result.final_decision = "block"
                result.errors.append("Execution failed")
                return result

            # Stage 7: Post-Trade Analysis
            logger.info("Stage 7: Post-Trade Analysis")
            self._stage_post_trade_analysis(signal, result)

            # Success
            result.success = True
            result.final_decision = "execute"

            logger.info(f"Pipeline complete: {result.final_decision.upper()} "
                       f"(cost: {result.total_cost_bps:.2f} bps)")

        except Exception as e:
            logger.error(f"Pipeline error: {e}")
            result.success = False
            result.final_decision = "block"
            result.errors.append(str(e))

        # Store in history
        self.pipeline_history.append(result)

        return result

    def _stage_risk_analysis(self, signal: TradeSignal, result: PipelineResult) -> bool:
        """
        Stage 1: Analyze portfolio risk impact

        Returns:
            True if risk acceptable, False otherwise
        """
        try:
            # Skip if no positions yet
            if not self.positions or self.returns.empty:
                result.stage_results['risk_analysis'] = {
                    'status': 'skipped',
                    'reason': 'No existing positions'
                }
                return True

            # Calculate current portfolio VaR
            positions_list = list(self.positions.keys())
            if signal.symbol in self.returns.columns:
                positions_list.append(signal.symbol)

            portfolio_returns = self.returns[positions_list]

            # Portfolio risk metrics
            risk_metrics = self.risk_manager.calculate_portfolio_risk_metrics(
                self.positions,
                portfolio_returns
            )

            # Correlation analysis
            correlation = self.correlation_analyzer.analyze_portfolio_correlation(
                self.positions,
                portfolio_returns
            )

            result.stage_results['risk_analysis'] = {
                'status': 'complete',
                'portfolio_var_95': risk_metrics.var_95,
                'portfolio_cvar_95': risk_metrics.cvar_95,
                'sharpe_ratio': risk_metrics.sharpe_ratio,
                'diversification_ratio': correlation.diversification_ratio,
                'effective_n': correlation.effective_n
            }

            # Risk thresholds
            if risk_metrics.var_95 > 0.03:  # > 3% VaR
                result.warnings.append(f"High portfolio VaR: {risk_metrics.var_95:.2%}")

            if correlation.diversification_ratio < 1.2:
                result.warnings.append(f"Low diversification: {correlation.diversification_ratio:.2f}")

            return True

        except Exception as e:
            logger.error(f"Risk analysis error: {e}")
            result.stage_results['risk_analysis'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_position_sizing(self, signal: TradeSignal, result: PipelineResult) -> bool:
        """
        Stage 2: Calculate optimal position size

        Returns:
            True if sizing successful, False otherwise
        """
        try:
            symbol = signal.symbol
            current_price = self.current_prices.get(symbol, 0)

            if current_price == 0:
                result.errors.append(f"No price data for {symbol}")
                return False

            # Get symbol returns for volatility
            if symbol not in self.returns.columns:
                result.warnings.append(f"No historical data for {symbol}, using default sizing")
                # Use fixed fractional
                params = SizingParameters(method=SizingMethod.FIXED_FRACTIONAL, fixed_fraction=0.02)
                sizer = PositionSizer(params)
                position_size = sizer.calculate_fixed_fractional_size(
                    symbol, self.portfolio_value, current_price
                )
            else:
                # Use volatility-based sizing with regime detection
                returns_series = self.returns[symbol]

                # Forecast volatility
                vol_forecast = self.vol_sizer.forecast_volatility(returns_series, method="garch")

                # Calculate regime-based size
                position_size = self.vol_sizer.calculate_regime_position_size(
                    symbol=symbol,
                    volatility_forecast=vol_forecast,
                    portfolio_value=self.portfolio_value,
                    current_price=current_price
                )

                result.stage_results['position_sizing'] = {
                    'status': 'complete',
                    'method': 'volatility_regime',
                    'regime': vol_forecast.regime.value,
                    'forecast_volatility': vol_forecast.forecast_volatility,
                    'recommended_shares': position_size.regime_adjusted_size * self.portfolio_value / current_price,
                    'position_size_pct': position_size.regime_adjusted_size,
                    'risk_budget_used': position_size.risk_budget_used
                }

                # Store for next stage
                signal.target_shares = int(position_size.regime_adjusted_size * self.portfolio_value / current_price)
                signal.target_value = signal.target_shares * current_price

                return True

        except Exception as e:
            logger.error(f"Position sizing error: {e}")
            result.stage_results['position_sizing'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_pre_trade_checks(self, signal: TradeSignal, result: PipelineResult) -> bool:
        """
        Stage 3: Pre-trade risk limit checks

        Returns:
            True if checks pass, False if blocked
        """
        try:
            symbol = signal.symbol
            shares = signal.target_shares or 0
            price = self.current_prices.get(symbol, 0)
            trade_value = shares * price

            # Pre-trade check
            check_result = self.risk_enforcer.check_pre_trade(
                symbol=symbol,
                trade_value=trade_value if signal.side == "buy" else -trade_value,
                expected_var=None,  # Could calculate from risk manager
                sector=None
            )

            result.stage_results['pre_trade_checks'] = {
                'status': 'complete',
                'allowed': check_result.allowed,
                'action': check_result.action.value,
                'violations': check_result.violations,
                'warnings': check_result.warnings,
                'limit_utilization': check_result.limit_utilization
            }

            if not check_result.allowed:
                result.errors.extend(check_result.violations)
                return False

            if check_result.warnings:
                result.warnings.extend(check_result.warnings)

            return True

        except Exception as e:
            logger.error(f"Pre-trade checks error: {e}")
            result.stage_results['pre_trade_checks'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_execution_planning(self, signal: TradeSignal, result: PipelineResult) -> bool:
        """
        Stage 4: Plan optimal execution strategy

        Returns:
            True if plan created, False otherwise
        """
        try:
            symbol = signal.symbol
            shares = signal.target_shares or 0
            price = self.current_prices.get(symbol, 0)

            # Estimate market impact
            if symbol in self.returns.columns:
                # Setup impact parameters
                returns_series = self.returns[symbol]
                volatility = returns_series.std() * np.sqrt(252)
                avg_daily_volume = 50_000_000  # Placeholder

                impact_params = MarketImpactParameters(
                    symbol=symbol,
                    avg_daily_volume=avg_daily_volume,
                    volatility=volatility,
                    bid_ask_spread=0.0005
                )

                self.impact_model.set_parameters(impact_params)

                # Estimate impact
                impact_estimate = self.impact_model.estimate_square_root_impact(
                    symbol, shares, price, impact_params
                )

                # Choose execution algorithm based on urgency and impact
                if signal.urgency > 0.7:
                    # High urgency: TWAP or immediate
                    algo_type = AlgorithmType.TWAP
                    duration_hours = 0.5  # 30 minutes
                elif impact_estimate.participation_rate > 0.05:
                    # Large order: VWAP
                    algo_type = AlgorithmType.VWAP
                    duration_hours = 2.0
                else:
                    # Normal: VWAP
                    algo_type = AlgorithmType.VWAP
                    duration_hours = 1.0

                # Generate schedule
                start_time = datetime.now()
                end_time = start_time + timedelta(hours=duration_hours)

                if algo_type == AlgorithmType.TWAP:
                    schedule = self.execution_algo.generate_twap_schedule(
                        symbol, signal.side, shares, start_time, end_time,
                        slice_duration_minutes=5
                    )
                else:
                    schedule = self.execution_algo.generate_vwap_schedule(
                        symbol, signal.side, shares, start_time, end_time,
                        historical_volume_profile=pd.DataFrame(),
                        num_slices=12
                    )

                result.stage_results['execution_planning'] = {
                    'status': 'complete',
                    'algorithm': algo_type.value,
                    'estimated_impact_bps': impact_estimate.total_impact * 10000,
                    'estimated_cost_usd': impact_estimate.total_cost,
                    'participation_rate': impact_estimate.participation_rate,
                    'num_slices': len(schedule.slices),
                    'duration_hours': duration_hours
                }

                return True

            else:
                result.warnings.append("No historical data, using immediate execution")
                result.stage_results['execution_planning'] = {
                    'status': 'complete',
                    'algorithm': 'immediate',
                    'num_slices': 1
                }
                return True

        except Exception as e:
            logger.error(f"Execution planning error: {e}")
            result.stage_results['execution_planning'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_order_routing(self, signal: TradeSignal, result: PipelineResult, venue_quotes) -> bool:
        """
        Stage 5: Smart order routing

        Returns:
            True if routing successful, False otherwise
        """
        try:
            # If no venue quotes provided, skip smart routing
            if not venue_quotes:
                result.stage_results['order_routing'] = {
                    'status': 'skipped',
                    'reason': 'No venue quotes available'
                }
                return True

            symbol = signal.symbol
            shares = signal.target_shares or 0

            # Smart routing based on urgency
            routing_decision = self.order_router.route_smart(
                symbol=symbol,
                side=signal.side,
                shares=shares,
                quotes=venue_quotes,
                urgency=signal.urgency,
                max_venues=5
            )

            result.stage_results['order_routing'] = {
                'status': 'complete',
                'strategy': routing_decision.strategy.value,
                'num_venues': len(routing_decision.venue_allocations),
                'venue_allocations': routing_decision.venue_allocations,
                'expected_avg_price': routing_decision.expected_avg_price,
                'expected_fill_rate': routing_decision.expected_fill_rate
            }

            return True

        except Exception as e:
            logger.error(f"Order routing error: {e}")
            result.stage_results['order_routing'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_execution(self, signal: TradeSignal, result: PipelineResult) -> bool:
        """
        Stage 6: Execute trades (simulated)

        Returns:
            True if execution successful, False otherwise
        """
        try:
            # Simulated execution
            symbol = signal.symbol
            shares = signal.target_shares or 0
            price = self.current_prices.get(symbol, 0)

            # Simulate some slippage
            slippage_bps = np.random.normal(5, 2)  # ~5 bps average
            execution_price = price * (1 + slippage_bps / 10000)

            result.stage_results['execution'] = {
                'status': 'complete',
                'shares_filled': shares,
                'avg_fill_price': execution_price,
                'total_value': shares * execution_price,
                'slippage_bps': slippage_bps
            }

            result.total_cost_bps = slippage_bps

            return True

        except Exception as e:
            logger.error(f"Execution error: {e}")
            result.stage_results['execution'] = {'status': 'error', 'message': str(e)}
            return False

    def _stage_post_trade_analysis(self, signal: TradeSignal, result: PipelineResult):
        """
        Stage 7: Post-trade analysis and TCA
        """
        try:
            execution_data = result.stage_results.get('execution', {})

            if execution_data.get('status') == 'complete':
                # TCA analysis
                symbol = signal.symbol
                shares = execution_data.get('shares_filled', 0)
                execution_price = execution_data.get('avg_fill_price', 0)
                decision_price = self.current_prices.get(symbol, 0)

                metrics = self.tca.calculate_implementation_shortfall(
                    symbol=symbol,
                    side=signal.side,
                    decision_price=decision_price,
                    execution_price=execution_price,
                    shares=shares,
                    decision_time=signal.timestamp,
                    execution_time=datetime.now()
                )

                result.stage_results['post_trade_analysis'] = {
                    'status': 'complete',
                    'total_cost_bps': metrics.total_cost_bps,
                    'impact_cost_bps': metrics.impact_cost_bps,
                    'spread_cost_bps': metrics.spread_cost_bps,
                    'trade_quality_score': metrics.trade_quality_score
                }

                result.total_cost_bps = metrics.total_cost_bps

        except Exception as e:
            logger.error(f"Post-trade analysis error: {e}")
            result.stage_results['post_trade_analysis'] = {'status': 'error', 'message': str(e)}

    def get_pipeline_summary(self) -> pd.DataFrame:
        """
        Get summary of all pipeline executions

        Returns:
            DataFrame with pipeline history
        """
        if not self.pipeline_history:
            return pd.DataFrame()

        data = []
        for result in self.pipeline_history:
            data.append({
                'Timestamp': result.timestamp,
                'Symbol': result.signal.symbol,
                'Side': result.signal.side,
                'Signal Strength': result.signal.signal_strength,
                'Decision': result.final_decision,
                'Cost (bps)': result.total_cost_bps,
                'Success': result.success,
                'Errors': len(result.errors),
                'Warnings': len(result.warnings)
            })

        return pd.DataFrame(data)

    def print_pipeline_result(self, result: PipelineResult):
        """
        Print detailed pipeline result

        Args:
            result: Pipeline result
        """
        print("\n" + "="*90)
        print("RISK & EXECUTION PIPELINE RESULT")
        print("="*90)
        print(f"Symbol: {result.signal.symbol}")
        print(f"Side: {result.signal.side.upper()}")
        print(f"Signal Strength: {result.signal.signal_strength:.2f}")
        print(f"Urgency: {result.signal.urgency:.2f}")
        print(f"Timestamp: {result.timestamp.isoformat()}")
        print()

        print(f"FINAL DECISION: {result.final_decision.upper()}")
        print(f"Success: {'✓ YES' if result.success else '✗ NO'}")
        print()

        print("STAGE RESULTS:")
        for stage, stage_result in result.stage_results.items():
            status = stage_result.get('status', 'unknown')
            print(f"  {stage}: {status.upper()}")

        print()

        if result.total_cost_bps > 0:
            print(f"TOTAL COST: {result.total_cost_bps:.2f} bps")
            print()

        if result.errors:
            print("ERRORS:")
            for error in result.errors:
                print(f"  ✗ {error}")
            print()

        if result.warnings:
            print("WARNINGS:")
            for warning in result.warnings:
                print(f"  ⚠ {warning}")
            print()

        print("="*90 + "\n")


# Example usage
if __name__ == "__main__":
    print("Risk & Execution Integration Pipeline Example")
    print("="*90)

    # Initialize pipeline
    pipeline = RiskExecutionPipeline(portfolio_value=1_000_000)

    # Generate sample data
    np.random.seed(42)
    symbols = ['AAPL', 'MSFT', 'GOOGL']
    returns_data = {s: np.random.normal(0.0005, 0.02, 252) for s in symbols}
    returns = pd.DataFrame(returns_data)

    current_prices = {'AAPL': 180.0, 'MSFT': 370.0, 'GOOGL': 140.0}
    positions = {'MSFT': 50000.0}  # Existing position

    # Update state
    pipeline.update_portfolio_state(
        positions=positions,
        returns=returns,
        current_prices=current_prices,
        daily_pnl=500.0,
        weekly_pnl=1200.0,
        monthly_pnl=3500.0
    )

    # Process a buy signal
    print("\n1. PROCESSING BUY SIGNAL (High Strength, Moderate Urgency)")
    print("-" * 90)

    buy_signal = TradeSignal(
        symbol='AAPL',
        side='buy',
        signal_strength=0.85,
        urgency=0.6
    )

    result = pipeline.process_signal(buy_signal)
    pipeline.print_pipeline_result(result)

    # Process a sell signal
    print("\n2. PROCESSING SELL SIGNAL (Low Strength, High Urgency)")
    print("-" * 90)

    sell_signal = TradeSignal(
        symbol='GOOGL',
        side='sell',
        signal_strength=0.45,
        urgency=0.9
    )

    result2 = pipeline.process_signal(sell_signal)
    pipeline.print_pipeline_result(result2)

    # Summary
    print("\n3. PIPELINE SUMMARY")
    print("-" * 90)
    summary = pipeline.get_pipeline_summary()
    print(summary.to_string(index=False))

    print("\n" + "="*90)
