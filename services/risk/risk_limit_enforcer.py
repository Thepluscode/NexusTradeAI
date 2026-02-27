"""
Risk Limit Enforcer
===================
Real-time risk limit enforcement and monitoring system.

Author: NexusTradeAI Risk Team
Version: 1.0
Date: December 25, 2024

Features:
- Pre-trade risk checks
- Real-time limit monitoring
- Multi-level risk limits (soft/hard)
- Automatic enforcement actions
- Circuit breaker mechanism
- Limit breach alerting
- Comprehensive reporting
- Historical violation tracking
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any, Set
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class LimitType(Enum):
    """Types of risk limits"""
    POSITION_SIZE = "position_size"
    PORTFOLIO_VAR = "portfolio_var"
    INDIVIDUAL_VAR = "individual_var"
    DRAWDOWN = "drawdown"
    LEVERAGE = "leverage"
    CONCENTRATION = "concentration"
    CORRELATION = "correlation"
    DAILY_LOSS = "daily_loss"
    WEEKLY_LOSS = "weekly_loss"
    MONTHLY_LOSS = "monthly_loss"
    GROSS_EXPOSURE = "gross_exposure"
    NET_EXPOSURE = "net_exposure"


class LimitSeverity(Enum):
    """Limit severity levels"""
    SOFT = "soft"  # Warning only
    HARD = "hard"  # Block trade
    CRITICAL = "critical"  # Circuit breaker


class EnforcementAction(Enum):
    """Enforcement actions"""
    ALLOW = "allow"
    WARN = "warn"
    BLOCK = "block"
    REDUCE_POSITION = "reduce_position"
    CLOSE_POSITION = "close_position"
    CIRCUIT_BREAKER = "circuit_breaker"


@dataclass
class RiskLimit:
    """Risk limit definition"""
    limit_type: LimitType
    severity: LimitSeverity
    threshold: float
    current_value: float = 0.0
    utilization_pct: float = 0.0
    breached: bool = False
    breach_count: int = 0
    last_breach: Optional[datetime] = None

    def check_breach(self) -> bool:
        """Check if limit is breached"""
        self.breached = self.current_value > self.threshold
        if self.breached:
            self.breach_count += 1
            self.last_breach = datetime.now()
        return self.breached

    def calculate_utilization(self):
        """Calculate limit utilization percentage"""
        if self.threshold == 0:
            self.utilization_pct = 0.0
        else:
            self.utilization_pct = (self.current_value / self.threshold) * 100


@dataclass
class TradeCheckResult:
    """Result of pre-trade risk check"""
    allowed: bool
    action: EnforcementAction
    violations: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    limit_utilization: Dict[str, float] = field(default_factory=dict)
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'allowed': self.allowed,
            'action': self.action.value,
            'violations': self.violations,
            'warnings': self.warnings,
            'limit_utilization': self.limit_utilization,
            'timestamp': self.timestamp.isoformat()
        }


@dataclass
class LimitBreach:
    """Record of limit breach"""
    timestamp: datetime
    limit_type: LimitType
    severity: LimitSeverity
    threshold: float
    actual_value: float
    excess: float
    action_taken: EnforcementAction
    description: str

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary"""
        return {
            'timestamp': self.timestamp.isoformat(),
            'limit_type': self.limit_type.value,
            'severity': self.severity.value,
            'threshold': self.threshold,
            'actual_value': self.actual_value,
            'excess': self.excess,
            'action_taken': self.action_taken.value,
            'description': self.description
        }


@dataclass
class CircuitBreakerState:
    """Circuit breaker state"""
    active: bool = False
    triggered_at: Optional[datetime] = None
    trigger_reason: str = ""
    cooldown_minutes: int = 30
    auto_resume: bool = True

    def trigger(self, reason: str):
        """Trigger circuit breaker"""
        self.active = True
        self.triggered_at = datetime.now()
        self.trigger_reason = reason
        logger.critical(f"CIRCUIT BREAKER TRIGGERED: {reason}")

    def can_resume(self) -> bool:
        """Check if circuit breaker can resume"""
        if not self.active:
            return True

        if not self.auto_resume:
            return False

        if self.triggered_at is None:
            return False

        cooldown_elapsed = datetime.now() - self.triggered_at
        return cooldown_elapsed > timedelta(minutes=self.cooldown_minutes)

    def reset(self):
        """Reset circuit breaker"""
        self.active = False
        self.triggered_at = None
        self.trigger_reason = ""
        logger.info("Circuit breaker reset")


class RiskLimitEnforcer:
    """
    Comprehensive risk limit enforcement system
    """

    def __init__(self):
        """Initialize risk limit enforcer"""
        self.limits: Dict[str, RiskLimit] = {}
        self.breach_history: List[LimitBreach] = []
        self.circuit_breaker = CircuitBreakerState()

        # Trading state
        self.portfolio_value: float = 0.0
        self.positions: Dict[str, float] = {}
        self.daily_pnl: float = 0.0
        self.weekly_pnl: float = 0.0
        self.monthly_pnl: float = 0.0
        self.peak_value: float = 0.0

        self._initialize_default_limits()
        logger.info("Initialized RiskLimitEnforcer")

    def _initialize_default_limits(self):
        """Initialize default risk limits"""
        # Position size limits
        self.add_limit(
            "max_position_size",
            LimitType.POSITION_SIZE,
            LimitSeverity.HARD,
            0.10  # Max 10% per position
        )

        # Portfolio VaR limit
        self.add_limit(
            "portfolio_var_95",
            LimitType.PORTFOLIO_VAR,
            LimitSeverity.HARD,
            0.02  # Max 2% VaR
        )

        # Drawdown limits
        self.add_limit(
            "max_drawdown_soft",
            LimitType.DRAWDOWN,
            LimitSeverity.SOFT,
            0.10  # 10% soft limit (warning)
        )

        self.add_limit(
            "max_drawdown_hard",
            LimitType.DRAWDOWN,
            LimitSeverity.HARD,
            0.15  # 15% hard limit (reduce positions)
        )

        self.add_limit(
            "max_drawdown_critical",
            LimitType.DRAWDOWN,
            LimitSeverity.CRITICAL,
            0.20  # 20% critical (circuit breaker)
        )

        # Leverage limits
        self.add_limit(
            "max_leverage",
            LimitType.LEVERAGE,
            LimitSeverity.HARD,
            1.5  # Max 1.5x leverage
        )

        # Loss limits
        self.add_limit(
            "max_daily_loss",
            LimitType.DAILY_LOSS,
            LimitSeverity.HARD,
            0.02  # Max 2% daily loss
        )

        self.add_limit(
            "max_weekly_loss",
            LimitType.WEEKLY_LOSS,
            LimitSeverity.CRITICAL,
            0.05  # Max 5% weekly loss
        )

        # Concentration limit
        self.add_limit(
            "max_concentration",
            LimitType.CONCENTRATION,
            LimitSeverity.HARD,
            0.25  # Max 25% in single sector
        )

        # Gross exposure
        self.add_limit(
            "max_gross_exposure",
            LimitType.GROSS_EXPOSURE,
            LimitSeverity.HARD,
            1.0  # Max 100% gross exposure
        )

    def add_limit(
        self,
        name: str,
        limit_type: LimitType,
        severity: LimitSeverity,
        threshold: float
    ):
        """
        Add a risk limit

        Args:
            name: Unique limit name
            limit_type: Type of limit
            severity: Limit severity
            threshold: Threshold value
        """
        self.limits[name] = RiskLimit(
            limit_type=limit_type,
            severity=severity,
            threshold=threshold
        )
        logger.info(f"Added {severity.value} limit: {name} = {threshold}")

    def update_limit(self, name: str, threshold: float):
        """
        Update limit threshold

        Args:
            name: Limit name
            threshold: New threshold value
        """
        if name in self.limits:
            old_threshold = self.limits[name].threshold
            self.limits[name].threshold = threshold
            logger.info(f"Updated limit {name}: {old_threshold} → {threshold}")
        else:
            logger.warning(f"Limit {name} not found")

    def remove_limit(self, name: str):
        """
        Remove a limit

        Args:
            name: Limit name
        """
        if name in self.limits:
            del self.limits[name]
            logger.info(f"Removed limit: {name}")

    def update_portfolio_state(
        self,
        portfolio_value: float,
        positions: Dict[str, float],
        daily_pnl: float,
        weekly_pnl: float,
        monthly_pnl: float
    ):
        """
        Update current portfolio state

        Args:
            portfolio_value: Current portfolio value
            positions: Current positions {symbol: value}
            daily_pnl: Daily P&L
            weekly_pnl: Weekly P&L
            monthly_pnl: Monthly P&L
        """
        self.portfolio_value = portfolio_value
        self.positions = positions
        self.daily_pnl = daily_pnl
        self.weekly_pnl = weekly_pnl
        self.monthly_pnl = monthly_pnl

        # Update peak value for drawdown calculation
        if portfolio_value > self.peak_value:
            self.peak_value = portfolio_value

        # Update limit values
        self._update_limit_values()

    def _update_limit_values(self):
        """Update current values for all limits"""
        # Position size limits
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.POSITION_SIZE:
                if self.positions:
                    max_position = max(abs(v) for v in self.positions.values())
                    limit.current_value = max_position / self.portfolio_value if self.portfolio_value > 0 else 0

            elif limit.limit_type == LimitType.DRAWDOWN:
                if self.peak_value > 0:
                    drawdown = (self.peak_value - self.portfolio_value) / self.peak_value
                    limit.current_value = drawdown

            elif limit.limit_type == LimitType.LEVERAGE:
                if self.portfolio_value > 0:
                    gross_exposure = sum(abs(v) for v in self.positions.values())
                    limit.current_value = gross_exposure / self.portfolio_value

            elif limit.limit_type == LimitType.DAILY_LOSS:
                if self.portfolio_value > 0:
                    limit.current_value = abs(min(0, self.daily_pnl)) / self.portfolio_value

            elif limit.limit_type == LimitType.WEEKLY_LOSS:
                if self.portfolio_value > 0:
                    limit.current_value = abs(min(0, self.weekly_pnl)) / self.portfolio_value

            elif limit.limit_type == LimitType.MONTHLY_LOSS:
                if self.portfolio_value > 0:
                    limit.current_value = abs(min(0, self.monthly_pnl)) / self.portfolio_value

            elif limit.limit_type == LimitType.GROSS_EXPOSURE:
                if self.portfolio_value > 0:
                    gross_exposure = sum(abs(v) for v in self.positions.values())
                    limit.current_value = gross_exposure / self.portfolio_value

            # Update utilization
            limit.calculate_utilization()

    def check_pre_trade(
        self,
        symbol: str,
        trade_value: float,
        expected_var: Optional[float] = None,
        sector: Optional[str] = None
    ) -> TradeCheckResult:
        """
        Perform pre-trade risk checks

        Args:
            symbol: Trading symbol
            trade_value: Trade value (positive for buy, negative for sell)
            expected_var: Expected VaR after trade
            sector: Asset sector

        Returns:
            TradeCheckResult
        """
        result = TradeCheckResult(
            allowed=True,
            action=EnforcementAction.ALLOW
        )

        # Check circuit breaker first
        if self.circuit_breaker.active:
            if not self.circuit_breaker.can_resume():
                result.allowed = False
                result.action = EnforcementAction.CIRCUIT_BREAKER
                result.violations.append(
                    f"Circuit breaker active: {self.circuit_breaker.trigger_reason}"
                )
                return result
            else:
                # Can resume, reset circuit breaker
                self.circuit_breaker.reset()

        # Simulate new position
        new_positions = self.positions.copy()
        current_position_value = new_positions.get(symbol, 0.0)
        new_position_value = current_position_value + trade_value
        new_positions[symbol] = new_position_value

        # Check position size limit
        self._check_position_size_limit(symbol, new_position_value, result)

        # Check portfolio VaR limit
        if expected_var is not None:
            self._check_var_limit(expected_var, result)

        # Check concentration limit
        if sector is not None:
            self._check_concentration_limit(sector, new_positions, result)

        # Check leverage limit
        self._check_leverage_limit(new_positions, result)

        # Check gross exposure
        self._check_gross_exposure_limit(new_positions, result)

        # Update limit utilization in result
        result.limit_utilization = {
            name: limit.utilization_pct
            for name, limit in self.limits.items()
        }

        # Determine final action
        if result.violations:
            result.allowed = False
            result.action = EnforcementAction.BLOCK

        return result

    def _check_position_size_limit(
        self,
        symbol: str,
        position_value: float,
        result: TradeCheckResult
    ):
        """Check position size limit"""
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.POSITION_SIZE:
                if self.portfolio_value > 0:
                    position_pct = abs(position_value) / self.portfolio_value

                    if position_pct > limit.threshold:
                        msg = f"Position size {position_pct:.1%} exceeds limit {limit.threshold:.1%}"

                        if limit.severity == LimitSeverity.HARD:
                            result.violations.append(msg)
                            self._record_breach(limit, position_pct, EnforcementAction.BLOCK, msg)
                        else:
                            result.warnings.append(msg)

    def _check_var_limit(self, expected_var: float, result: TradeCheckResult):
        """Check VaR limit"""
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.PORTFOLIO_VAR:
                if expected_var > limit.threshold:
                    msg = f"Portfolio VaR {expected_var:.2%} exceeds limit {limit.threshold:.2%}"

                    if limit.severity == LimitSeverity.HARD:
                        result.violations.append(msg)
                        self._record_breach(limit, expected_var, EnforcementAction.BLOCK, msg)
                    else:
                        result.warnings.append(msg)

    def _check_concentration_limit(
        self,
        sector: str,
        positions: Dict[str, float],
        result: TradeCheckResult
    ):
        """Check sector concentration limit"""
        # This is simplified - would need sector mapping in production
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.CONCENTRATION:
                # For demonstration, assume we track sector concentration
                sector_exposure = sum(abs(v) for v in positions.values()) * 0.3  # Placeholder

                if self.portfolio_value > 0:
                    concentration_pct = sector_exposure / self.portfolio_value

                    if concentration_pct > limit.threshold:
                        msg = f"Sector concentration {concentration_pct:.1%} exceeds limit {limit.threshold:.1%}"

                        if limit.severity == LimitSeverity.HARD:
                            result.violations.append(msg)
                            self._record_breach(limit, concentration_pct, EnforcementAction.BLOCK, msg)
                        else:
                            result.warnings.append(msg)

    def _check_leverage_limit(self, positions: Dict[str, float], result: TradeCheckResult):
        """Check leverage limit"""
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.LEVERAGE:
                if self.portfolio_value > 0:
                    gross_exposure = sum(abs(v) for v in positions.values())
                    leverage = gross_exposure / self.portfolio_value

                    if leverage > limit.threshold:
                        msg = f"Leverage {leverage:.2f}x exceeds limit {limit.threshold:.2f}x"

                        if limit.severity == LimitSeverity.HARD:
                            result.violations.append(msg)
                            self._record_breach(limit, leverage, EnforcementAction.BLOCK, msg)
                        else:
                            result.warnings.append(msg)

    def _check_gross_exposure_limit(
        self,
        positions: Dict[str, float],
        result: TradeCheckResult
    ):
        """Check gross exposure limit"""
        for name, limit in self.limits.items():
            if limit.limit_type == LimitType.GROSS_EXPOSURE:
                if self.portfolio_value > 0:
                    gross_exposure = sum(abs(v) for v in positions.values())
                    exposure_pct = gross_exposure / self.portfolio_value

                    if exposure_pct > limit.threshold:
                        msg = f"Gross exposure {exposure_pct:.1%} exceeds limit {limit.threshold:.1%}"

                        if limit.severity == LimitSeverity.HARD:
                            result.violations.append(msg)
                            self._record_breach(limit, exposure_pct, EnforcementAction.BLOCK, msg)
                        else:
                            result.warnings.append(msg)

    def check_all_limits(self) -> List[LimitBreach]:
        """
        Check all limits against current state

        Returns:
            List of limit breaches
        """
        breaches = []

        for name, limit in self.limits.items():
            if limit.check_breach():
                excess = limit.current_value - limit.threshold

                # Determine action based on severity
                if limit.severity == LimitSeverity.CRITICAL:
                    action = EnforcementAction.CIRCUIT_BREAKER
                    self.circuit_breaker.trigger(
                        f"{limit.limit_type.value} limit breached: {limit.current_value:.2%} > {limit.threshold:.2%}"
                    )
                elif limit.severity == LimitSeverity.HARD:
                    action = EnforcementAction.REDUCE_POSITION
                else:
                    action = EnforcementAction.WARN

                breach = LimitBreach(
                    timestamp=datetime.now(),
                    limit_type=limit.limit_type,
                    severity=limit.severity,
                    threshold=limit.threshold,
                    actual_value=limit.current_value,
                    excess=excess,
                    action_taken=action,
                    description=f"{name}: {limit.current_value:.2%} exceeds {limit.threshold:.2%}"
                )

                breaches.append(breach)
                self.breach_history.append(breach)

        return breaches

    def _record_breach(
        self,
        limit: RiskLimit,
        actual_value: float,
        action: EnforcementAction,
        description: str
    ):
        """Record a limit breach"""
        excess = actual_value - limit.threshold

        breach = LimitBreach(
            timestamp=datetime.now(),
            limit_type=limit.limit_type,
            severity=limit.severity,
            threshold=limit.threshold,
            actual_value=actual_value,
            excess=excess,
            action_taken=action,
            description=description
        )

        self.breach_history.append(breach)
        logger.warning(f"Limit breach: {description}")

    def get_limit_utilization_report(self) -> pd.DataFrame:
        """
        Generate limit utilization report

        Returns:
            DataFrame with limit utilization
        """
        report_data = []

        for name, limit in self.limits.items():
            report_data.append({
                'Limit Name': name,
                'Type': limit.limit_type.value,
                'Severity': limit.severity.value,
                'Threshold': f"{limit.threshold:.2%}",
                'Current': f"{limit.current_value:.2%}",
                'Utilization': f"{limit.utilization_pct:.1f}%",
                'Status': '✗ BREACH' if limit.breached else '✓ OK',
                'Breach Count': limit.breach_count
            })

        return pd.DataFrame(report_data)

    def get_breach_history(
        self,
        hours: Optional[int] = None,
        limit_type: Optional[LimitType] = None
    ) -> List[LimitBreach]:
        """
        Get breach history

        Args:
            hours: Only breaches in last N hours (None = all)
            limit_type: Filter by limit type (None = all)

        Returns:
            List of breaches
        """
        breaches = self.breach_history

        # Filter by time
        if hours is not None:
            cutoff = datetime.now() - timedelta(hours=hours)
            breaches = [b for b in breaches if b.timestamp >= cutoff]

        # Filter by type
        if limit_type is not None:
            breaches = [b for b in breaches if b.limit_type == limit_type]

        return breaches

    def reset_circuit_breaker(self, manual_override: bool = False):
        """
        Reset circuit breaker

        Args:
            manual_override: Manual override (bypass cooldown)
        """
        if manual_override or self.circuit_breaker.can_resume():
            self.circuit_breaker.reset()
            logger.info("Circuit breaker reset" + (" (manual override)" if manual_override else ""))
        else:
            remaining = self.circuit_breaker.cooldown_minutes - \
                       (datetime.now() - self.circuit_breaker.triggered_at).seconds // 60
            logger.warning(f"Cannot reset circuit breaker. {remaining} minutes remaining in cooldown.")

    def print_limit_report(self):
        """Print comprehensive limit report"""
        print("\n" + "="*90)
        print("RISK LIMIT ENFORCEMENT REPORT")
        print("="*90)
        print(f"Timestamp: {datetime.now().isoformat()}")
        print(f"Portfolio Value: ${self.portfolio_value:,.0f}")
        print()

        # Circuit breaker status
        if self.circuit_breaker.active:
            print("⚠️  CIRCUIT BREAKER ACTIVE!")
            print(f"   Triggered: {self.circuit_breaker.triggered_at.isoformat()}")
            print(f"   Reason: {self.circuit_breaker.trigger_reason}")
            print()

        # Limit utilization
        print("LIMIT UTILIZATION:")
        report_df = self.get_limit_utilization_report()
        print(report_df.to_string(index=False))
        print()

        # Recent breaches
        recent_breaches = self.get_breach_history(hours=24)
        if recent_breaches:
            print(f"RECENT BREACHES (Last 24 Hours): {len(recent_breaches)}")
            for breach in recent_breaches[-5:]:  # Show last 5
                print(f"  [{breach.timestamp.strftime('%H:%M:%S')}] {breach.description}")
                print(f"     Action: {breach.action_taken.value}, Excess: {breach.excess:.2%}")
        else:
            print("✓ NO BREACHES in last 24 hours")

        print("="*90 + "\n")


# Example usage
if __name__ == "__main__":
    print("Risk Limit Enforcer Example")
    print("="*90)

    # Initialize enforcer
    enforcer = RiskLimitEnforcer()

    # Simulate portfolio state
    portfolio_value = 100000.0
    positions = {
        'AAPL': 8000.0,
        'MSFT': 12000.0,  # 12% position (exceeds 10% limit)
        'GOOGL': 7000.0,
        'NVDA': 6000.0
    }

    enforcer.update_portfolio_state(
        portfolio_value=portfolio_value,
        positions=positions,
        daily_pnl=-1500.0,  # -1.5% loss
        weekly_pnl=-3000.0,  # -3% loss
        monthly_pnl=-4500.0  # -4.5% loss
    )

    # Check all limits
    print("\n1. CHECKING ALL LIMITS")
    print("-" * 90)
    breaches = enforcer.check_all_limits()
    if breaches:
        print(f"Found {len(breaches)} limit breaches:")
        for breach in breaches:
            print(f"  • {breach.description}")
    else:
        print("✓ All limits OK")

    # Test pre-trade check
    print("\n2. PRE-TRADE CHECK: Adding $5000 TSLA position")
    print("-" * 90)
    trade_result = enforcer.check_pre_trade(
        symbol='TSLA',
        trade_value=5000.0,
        expected_var=0.018,  # 1.8% VaR (below 2% limit)
        sector='Technology'
    )

    print(f"Trade Allowed: {trade_result.allowed}")
    print(f"Action: {trade_result.action.value}")
    if trade_result.violations:
        print("Violations:")
        for violation in trade_result.violations:
            print(f"  • {violation}")
    if trade_result.warnings:
        print("Warnings:")
        for warning in trade_result.warnings:
            print(f"  • {warning}")

    # Print full report
    print("\n3. COMPREHENSIVE LIMIT REPORT")
    print("-" * 90)
    enforcer.print_limit_report()

    # Simulate drawdown circuit breaker
    print("\n4. SIMULATING CIRCUIT BREAKER (20% Drawdown)")
    print("-" * 90)
    enforcer.peak_value = 100000.0
    enforcer.update_portfolio_state(
        portfolio_value=78000.0,  # 22% drawdown (exceeds 20% critical limit)
        positions=positions,
        daily_pnl=-22000.0,
        weekly_pnl=-22000.0,
        monthly_pnl=-22000.0
    )

    breaches = enforcer.check_all_limits()
    print(f"Circuit Breaker Active: {enforcer.circuit_breaker.active}")
    if enforcer.circuit_breaker.active:
        print(f"Trigger Reason: {enforcer.circuit_breaker.trigger_reason}")

    # Try to trade during circuit breaker
    print("\n5. ATTEMPTING TRADE DURING CIRCUIT BREAKER")
    print("-" * 90)
    trade_result = enforcer.check_pre_trade('AAPL', 1000.0)
    print(f"Trade Allowed: {trade_result.allowed}")
    print(f"Action: {trade_result.action.value}")
    if trade_result.violations:
        for violation in trade_result.violations:
            print(f"  • {violation}")

    print("\n" + "="*90)
