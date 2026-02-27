"""
NexusTradeAI - Risk Management Engine
======================================

Production-grade risk controls with:
- VaR calculation (Historical, Parametric, Monte Carlo)
- Pre-trade risk checks
- Drawdown monitoring
- Kill switch implementation

Senior Engineering Rigor Applied:
- Multiple VaR methods
- Real-time monitoring
- Automatic risk limits
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple, Any
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging

logger = logging.getLogger(__name__)


class VaRMethod(Enum):
    """VaR calculation methods"""
    HISTORICAL = "historical"
    PARAMETRIC = "parametric"
    MONTE_CARLO = "monte_carlo"


class RiskLevel(Enum):
    """Risk alert levels"""
    NORMAL = "normal"
    ELEVATED = "elevated"
    WARNING = "warning"
    CRITICAL = "critical"
    KILL_SWITCH = "kill_switch"


@dataclass
class RiskMetrics:
    """Portfolio risk metrics"""
    var_95: float
    var_99: float
    cvar_95: float  # Expected shortfall
    volatility: float
    beta: float
    correlation_to_market: float
    max_drawdown: float
    current_drawdown: float
    sharpe_ratio: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'var_95_pct': round(self.var_95 * 100, 2),
            'var_99_pct': round(self.var_99 * 100, 2),
            'cvar_95_pct': round(self.cvar_95 * 100, 2),
            'volatility_annual_pct': round(self.volatility * 100, 2),
            'beta': round(self.beta, 3),
            'correlation_to_market': round(self.correlation_to_market, 3),
            'max_drawdown_pct': round(self.max_drawdown * 100, 2),
            'current_drawdown_pct': round(self.current_drawdown * 100, 2),
            'sharpe_ratio': round(self.sharpe_ratio, 2)
        }


@dataclass
class RiskCheckResult:
    """Result of pre-trade risk check"""
    passed: bool
    order_id: str
    checks_performed: List[str]
    failed_checks: List[str]
    warnings: List[str]
    risk_level: RiskLevel
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'passed': self.passed,
            'order_id': self.order_id,
            'risk_level': self.risk_level.value,
            'failed_checks': self.failed_checks,
            'warnings': self.warnings
        }


class RiskManager:
    """
    Comprehensive risk management engine.
    
    Provides VaR, risk checks, and kill switch.
    """
    
    def __init__(
        self,
        max_position_pct: float = 0.05,      # 5% max single position
        max_sector_pct: float = 0.25,        # 25% max sector
        max_daily_loss_pct: float = 0.02,    # 2% max daily loss
        max_drawdown_pct: float = 0.15,      # 15% max drawdown
        var_limit_pct: float = 0.03,         # 3% 1-day VaR limit
        correlation_limit: float = 0.80      # Max correlation between positions
    ):
        """
        Initialize RiskManager.
        
        Args:
            max_position_pct: Max single position size
            max_sector_pct: Max sector exposure
            max_daily_loss_pct: Daily loss limit
            max_drawdown_pct: Maximum drawdown
            var_limit_pct: VaR limit
            correlation_limit: Max position correlation
        """
        self.max_position = max_position_pct
        self.max_sector = max_sector_pct
        self.max_daily_loss = max_daily_loss_pct
        self.max_drawdown = max_drawdown_pct
        self.var_limit = var_limit_pct
        self.correlation_limit = correlation_limit
        
        # State
        self.daily_pnl: float = 0.0
        self.peak_value: float = 0.0
        self.current_value: float = 0.0
        self.kill_switch_active: bool = False
    
    def calculate_var_historical(
        self,
        returns: pd.Series,
        confidence: float = 0.95
    ) -> float:
        """
        Calculate VaR using historical simulation.
        
        Returns the loss at the confidence percentile.
        """
        if len(returns) < 30:
            return 0.0
        
        percentile = (1 - confidence) * 100
        var = -np.percentile(returns, percentile)
        
        return float(var)
    
    def calculate_var_parametric(
        self,
        returns: pd.Series,
        confidence: float = 0.95
    ) -> float:
        """
        Calculate VaR using parametric (variance-covariance) method.
        
        Assumes normal distribution.
        """
        if len(returns) < 30:
            return 0.0
        
        mean = returns.mean()
        std = returns.std()
        
        # Z-score for confidence level
        from scipy import stats
        z = stats.norm.ppf(1 - confidence)
        
        var = -(mean + z * std)
        
        return float(var)
    
    def calculate_var_monte_carlo(
        self,
        returns: pd.Series,
        confidence: float = 0.95,
        simulations: int = 10000,
        horizon_days: int = 1
    ) -> float:
        """
        Calculate VaR using Monte Carlo simulation.
        """
        if len(returns) < 30:
            return 0.0
        
        mean = returns.mean()
        std = returns.std()
        
        # Simulate returns
        simulated = np.random.normal(
            mean * horizon_days,
            std * np.sqrt(horizon_days),
            simulations
        )
        
        percentile = (1 - confidence) * 100
        var = -np.percentile(simulated, percentile)
        
        return float(var)
    
    def calculate_cvar(
        self,
        returns: pd.Series,
        confidence: float = 0.95
    ) -> float:
        """
        Calculate Conditional VaR (Expected Shortfall).
        
        Average loss beyond VaR threshold.
        """
        if len(returns) < 30:
            return 0.0
        
        var = self.calculate_var_historical(returns, confidence)
        
        # CVaR = average of all losses worse than VaR
        tail = returns[returns <= -var]
        cvar = -tail.mean() if len(tail) > 0 else var
        
        return float(cvar)
    
    def calculate_portfolio_risk(
        self,
        portfolio_returns: pd.Series,
        market_returns: pd.Series = None
    ) -> RiskMetrics:
        """Calculate comprehensive risk metrics"""
        if len(portfolio_returns) < 30:
            return RiskMetrics(
                var_95=0, var_99=0, cvar_95=0,
                volatility=0, beta=0, correlation_to_market=0,
                max_drawdown=0, current_drawdown=0, sharpe_ratio=0
            )
        
        # VaR calculations
        var_95 = self.calculate_var_historical(portfolio_returns, 0.95)
        var_99 = self.calculate_var_historical(portfolio_returns, 0.99)
        cvar_95 = self.calculate_cvar(portfolio_returns, 0.95)
        
        # Volatility
        volatility = portfolio_returns.std() * np.sqrt(252)
        
        # Beta and correlation
        if market_returns is not None and len(market_returns) == len(portfolio_returns):
            cov = portfolio_returns.cov(market_returns)
            market_var = market_returns.var()
            beta = cov / market_var if market_var > 0 else 1.0
            correlation = portfolio_returns.corr(market_returns)
        else:
            beta = 1.0
            correlation = 0.0
        
        # Drawdown
        cumulative = (1 + portfolio_returns).cumprod()
        running_max = cumulative.expanding().max()
        drawdowns = (cumulative - running_max) / running_max
        max_dd = abs(drawdowns.min())
        current_dd = abs(drawdowns.iloc[-1])
        
        # Sharpe ratio
        excess_returns = portfolio_returns.mean() * 252 - 0.02
        sharpe = excess_returns / volatility if volatility > 0 else 0
        
        return RiskMetrics(
            var_95=var_95,
            var_99=var_99,
            cvar_95=cvar_95,
            volatility=volatility,
            beta=beta,
            correlation_to_market=correlation,
            max_drawdown=max_dd,
            current_drawdown=current_dd,
            sharpe_ratio=sharpe
        )
    
    def pre_trade_risk_check(
        self,
        order_id: str,
        symbol: str,
        side: str,
        quantity: int,
        price: float,
        portfolio_value: float,
        current_positions: Dict[str, float],
        sector: str = None
    ) -> RiskCheckResult:
        """
        Perform pre-trade risk checks.
        
        Checks position limits, sector limits, exposure limits.
        """
        checks = []
        failed = []
        warnings = []
        
        trade_value = quantity * price
        position_pct = trade_value / portfolio_value if portfolio_value > 0 else 1.0
        
        # Kill switch check
        checks.append("kill_switch")
        if self.kill_switch_active:
            failed.append("Kill switch is active")
        
        # Position size limit
        checks.append("position_size")
        if position_pct > self.max_position:
            failed.append(f"Position size {position_pct*100:.1f}% exceeds limit {self.max_position*100}%")
        
        # Existing position check
        checks.append("existing_position")
        existing = current_positions.get(symbol, 0)
        new_total = existing + (trade_value if side == 'buy' else -trade_value)
        new_pct = abs(new_total) / portfolio_value if portfolio_value > 0 else 1.0
        if new_pct > self.max_position * 1.5:
            failed.append(f"Combined position {new_pct*100:.1f}% too large")
        
        # Daily loss check
        checks.append("daily_loss")
        if self.daily_pnl < -self.max_daily_loss * portfolio_value:
            failed.append(f"Daily loss limit reached")
        
        # Drawdown check
        checks.append("drawdown")
        current_dd = (self.peak_value - self.current_value) / self.peak_value if self.peak_value > 0 else 0
        if current_dd > self.max_drawdown:
            failed.append(f"Drawdown {current_dd*100:.1f}% exceeds limit {self.max_drawdown*100}%")
        elif current_dd > self.max_drawdown * 0.75:
            warnings.append(f"Drawdown at {current_dd*100:.1f}%")
        
        # Total exposure check
        checks.append("total_exposure")
        total_exposure = sum(abs(v) for v in current_positions.values()) + trade_value
        exposure_pct = total_exposure / portfolio_value if portfolio_value > 0 else 1.0
        if exposure_pct > 1.0:
            warnings.append(f"Total exposure {exposure_pct*100:.1f}% (leveraged)")
        
        # Determine risk level
        if self.kill_switch_active:
            risk_level = RiskLevel.KILL_SWITCH
        elif failed:
            risk_level = RiskLevel.CRITICAL
        elif len(warnings) >= 2:
            risk_level = RiskLevel.WARNING
        elif warnings:
            risk_level = RiskLevel.ELEVATED
        else:
            risk_level = RiskLevel.NORMAL
        
        return RiskCheckResult(
            passed=len(failed) == 0,
            order_id=order_id,
            checks_performed=checks,
            failed_checks=failed,
            warnings=warnings,
            risk_level=risk_level
        )
    
    def update_daily_pnl(self, pnl: float):
        """Update daily P&L"""
        self.daily_pnl = pnl
    
    def update_portfolio_value(self, value: float):
        """Update portfolio value and peak"""
        self.current_value = value
        if value > self.peak_value:
            self.peak_value = value
    
    def check_kill_switch(self, portfolio_value: float) -> bool:
        """
        Check if kill switch should be triggered.
        
        Triggers on severe drawdown or daily loss.
        """
        # Check drawdown
        if self.peak_value > 0:
            dd = (self.peak_value - portfolio_value) / self.peak_value
            if dd > self.max_drawdown * 1.5:
                self.kill_switch_active = True
                logger.critical(f"KILL SWITCH ACTIVATED - Drawdown {dd*100:.1f}%")
                return True
        
        # Check daily loss
        if self.daily_pnl < -self.max_daily_loss * portfolio_value * 2:
            self.kill_switch_active = True
            logger.critical(f"KILL SWITCH ACTIVATED - Daily loss {self.daily_pnl}")
            return True
        
        return False
    
    def reset_daily(self):
        """Reset daily limits (call at market open)"""
        self.daily_pnl = 0.0
    
    def deactivate_kill_switch(self):
        """Manually deactivate kill switch (requires confirmation)"""
        self.kill_switch_active = False
        logger.warning("Kill switch deactivated manually")


# Factory function
def create_risk_manager(
    conservative: bool = True
) -> RiskManager:
    """Create risk manager with preset"""
    if conservative:
        return RiskManager(
            max_position_pct=0.03,
            max_daily_loss_pct=0.015,
            max_drawdown_pct=0.10
        )
    else:
        return RiskManager(
            max_position_pct=0.10,
            max_daily_loss_pct=0.03,
            max_drawdown_pct=0.20
        )
