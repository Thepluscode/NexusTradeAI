"""
NexusTradeAI - Performance Monitor
===================================

Real-time performance monitoring with:
- Live equity tracking
- Strategy degradation detection
- Alert generation
- Audit-ready reporting

Senior Engineering Rigor Applied:
- Comprehensive metrics
- Automated alerts
- Report generation
"""

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Any, Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
import logging
import json

logger = logging.getLogger(__name__)


class AlertLevel(Enum):
    """Alert severity levels"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


@dataclass
class Alert:
    """Performance alert"""
    timestamp: datetime
    level: AlertLevel
    category: str
    message: str
    metric_name: str
    current_value: float
    threshold: float
    acknowledged: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(),
            'level': self.level.value,
            'category': self.category,
            'message': self.message,
            'metric': self.metric_name,
            'current': round(self.current_value, 4),
            'threshold': round(self.threshold, 4),
            'acknowledged': self.acknowledged
        }


@dataclass
class PerformanceSnapshot:
    """Point-in-time performance snapshot"""
    timestamp: datetime
    equity: float
    cash: float
    positions_value: float
    positions_count: int
    daily_pnl: float
    cumulative_pnl: float
    drawdown: float
    sharpe_estimate: float
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'timestamp': self.timestamp.isoformat(),
            'equity': round(self.equity, 2),
            'cash': round(self.cash, 2),
            'positions_value': round(self.positions_value, 2),
            'positions_count': self.positions_count,
            'daily_pnl': round(self.daily_pnl, 2),
            'cumulative_pnl': round(self.cumulative_pnl, 2),
            'drawdown_pct': round(self.drawdown * 100, 2),
            'sharpe_estimate': round(self.sharpe_estimate, 2)
        }


class PerformanceMonitor:
    """
    Real-time performance monitoring.
    
    Tracks equity, generates alerts, detects degradation.
    """
    
    def __init__(
        self,
        initial_capital: float = 100000.0,
        drawdown_warning: float = 0.05,
        drawdown_critical: float = 0.10,
        daily_loss_warning: float = 0.01,
        daily_loss_critical: float = 0.02,
        sharpe_warning: float = 0.5,
        snap_interval_minutes: int = 5
    ):
        """
        Initialize PerformanceMonitor.
        
        Args:
            initial_capital: Starting capital
            drawdown_warning: Warning threshold for drawdown
            drawdown_critical: Critical threshold for drawdown
            daily_loss_warning: Warning threshold for daily loss
            daily_loss_critical: Critical threshold for daily loss
            sharpe_warning: Warning if Sharpe falls below
            snap_interval_minutes: Snapshot interval
        """
        self.initial_capital = initial_capital
        self.dd_warning = drawdown_warning
        self.dd_critical = drawdown_critical
        self.daily_loss_warning = daily_loss_warning
        self.daily_loss_critical = daily_loss_critical
        self.sharpe_warning = sharpe_warning
        self.snap_interval = snap_interval_minutes
        
        # State
        self.snapshots: List[PerformanceSnapshot] = []
        self.alerts: List[Alert] = []
        self.peak_equity = initial_capital
        self.last_snapshot_time = datetime.now()
        
        # Alert callbacks
        self._alert_callbacks: List[Callable[[Alert], None]] = []
    
    def record_snapshot(
        self,
        equity: float,
        cash: float,
        positions_value: float,
        positions_count: int,
        daily_pnl: float
    ):
        """Record a performance snapshot"""
        now = datetime.now()
        
        # Check interval
        if (now - self.last_snapshot_time).total_seconds() < self.snap_interval * 60:
            return
        
        # Update peak
        if equity > self.peak_equity:
            self.peak_equity = equity
        
        # Calculate metrics
        drawdown = (self.peak_equity - equity) / self.peak_equity if self.peak_equity > 0 else 0
        cumulative_pnl = equity - self.initial_capital
        
        # Estimate Sharpe from recent snapshots
        sharpe = self._estimate_sharpe()
        
        snapshot = PerformanceSnapshot(
            timestamp=now,
            equity=equity,
            cash=cash,
            positions_value=positions_value,
            positions_count=positions_count,
            daily_pnl=daily_pnl,
            cumulative_pnl=cumulative_pnl,
            drawdown=drawdown,
            sharpe_estimate=sharpe
        )
        
        self.snapshots.append(snapshot)
        self.last_snapshot_time = now
        
        # Check for alerts
        self._check_alerts(snapshot)
    
    def _estimate_sharpe(self) -> float:
        """Estimate Sharpe ratio from recent snapshots"""
        if len(self.snapshots) < 20:
            return 0.0
        
        recent = self.snapshots[-100:]
        equities = [s.equity for s in recent]
        returns = np.diff(equities) / equities[:-1]
        
        if len(returns) < 10:
            return 0.0
        
        mean_ret = np.mean(returns) * 252
        std_ret = np.std(returns) * np.sqrt(252)
        
        return (mean_ret - 0.02) / std_ret if std_ret > 0 else 0
    
    def _check_alerts(self, snapshot: PerformanceSnapshot):
        """Check for alert conditions"""
        # Drawdown alerts
        if snapshot.drawdown > self.dd_critical:
            self._create_alert(
                AlertLevel.CRITICAL,
                'drawdown',
                f"Critical drawdown: {snapshot.drawdown*100:.1f}%",
                'drawdown',
                snapshot.drawdown,
                self.dd_critical
            )
        elif snapshot.drawdown > self.dd_warning:
            self._create_alert(
                AlertLevel.WARNING,
                'drawdown',
                f"Drawdown warning: {snapshot.drawdown*100:.1f}%",
                'drawdown',
                snapshot.drawdown,
                self.dd_warning
            )
        
        # Daily loss alerts
        daily_loss_pct = -snapshot.daily_pnl / self.initial_capital if snapshot.daily_pnl < 0 else 0
        
        if daily_loss_pct > self.daily_loss_critical:
            self._create_alert(
                AlertLevel.CRITICAL,
                'daily_loss',
                f"Critical daily loss: {daily_loss_pct*100:.1f}%",
                'daily_loss',
                daily_loss_pct,
                self.daily_loss_critical
            )
        elif daily_loss_pct > self.daily_loss_warning:
            self._create_alert(
                AlertLevel.WARNING,
                'daily_loss',
                f"Daily loss warning: {daily_loss_pct*100:.1f}%",
                'daily_loss',
                daily_loss_pct,
                self.daily_loss_warning
            )
        
        # Sharpe warning
        if len(self.snapshots) > 50 and snapshot.sharpe_estimate < self.sharpe_warning:
            self._create_alert(
                AlertLevel.WARNING,
                'performance',
                f"Low Sharpe ratio: {snapshot.sharpe_estimate:.2f}",
                'sharpe_ratio',
                snapshot.sharpe_estimate,
                self.sharpe_warning
            )
    
    def _create_alert(
        self,
        level: AlertLevel,
        category: str,
        message: str,
        metric: str,
        value: float,
        threshold: float
    ):
        """Create and dispatch alert"""
        # Check for duplicate recent alerts
        recent = [a for a in self.alerts[-10:] if a.category == category]
        if recent and (datetime.now() - recent[-1].timestamp).total_seconds() < 300:
            return  # Suppress duplicate within 5 minutes
        
        alert = Alert(
            timestamp=datetime.now(),
            level=level,
            category=category,
            message=message,
            metric_name=metric,
            current_value=value,
            threshold=threshold
        )
        
        self.alerts.append(alert)
        logger.warning(f"ALERT [{level.value}]: {message}")
        
        # Notify callbacks
        for callback in self._alert_callbacks:
            try:
                callback(alert)
            except Exception as e:
                logger.error(f"Alert callback error: {e}")
    
    def register_alert_callback(self, callback: Callable[[Alert], None]):
        """Register callback for alerts"""
        self._alert_callbacks.append(callback)
    
    def get_current_status(self) -> Dict[str, Any]:
        """Get current monitoring status"""
        if not self.snapshots:
            return {'status': 'no_data'}
        
        latest = self.snapshots[-1]
        unack_alerts = [a for a in self.alerts if not a.acknowledged]
        
        # Determine overall status
        if any(a.level == AlertLevel.EMERGENCY for a in unack_alerts):
            status = 'emergency'
        elif any(a.level == AlertLevel.CRITICAL for a in unack_alerts):
            status = 'critical'
        elif any(a.level == AlertLevel.WARNING for a in unack_alerts):
            status = 'warning'
        else:
            status = 'healthy'
        
        return {
            'status': status,
            'equity': latest.equity,
            'drawdown_pct': round(latest.drawdown * 100, 2),
            'daily_pnl': latest.daily_pnl,
            'sharpe': latest.sharpe_estimate,
            'unacknowledged_alerts': len(unack_alerts),
            'snapshots_count': len(self.snapshots)
        }
    
    def generate_audit_report(self) -> Dict[str, Any]:
        """Generate audit-ready performance report"""
        if not self.snapshots:
            return {'error': 'No data available'}
        
        # Extract equity curve
        equities = [s.equity for s in self.snapshots]
        returns = np.diff(equities) / equities[:-1] if len(equities) > 1 else [0]
        
        # Calculate metrics
        total_return = (equities[-1] / equities[0]) - 1 if equities[0] > 0 else 0
        n_days = len(set(s.timestamp.date() for s in self.snapshots))
        ann_return = (1 + total_return) ** (252 / max(n_days, 1)) - 1
        volatility = np.std(returns) * np.sqrt(252) if returns.any() else 0
        sharpe = (ann_return - 0.02) / volatility if volatility > 0 else 0
        max_dd = max(s.drawdown for s in self.snapshots)
        calmar = ann_return / max_dd if max_dd > 0 else 0
        
        return {
            'report_date': datetime.now().isoformat(),
            'initial_capital': self.initial_capital,
            'final_equity': equities[-1],
            'performance': {
                'total_return_pct': round(total_return * 100, 2),
                'annualized_return_pct': round(ann_return * 100, 2),
                'volatility_pct': round(volatility * 100, 2),
                'sharpe_ratio': round(sharpe, 2),
                'max_drawdown_pct': round(max_dd * 100, 2),
                'calmar_ratio': round(calmar, 2)
            },
            'monitoring': {
                'total_snapshots': len(self.snapshots),
                'total_alerts': len(self.alerts),
                'critical_alerts': len([a for a in self.alerts if a.level == AlertLevel.CRITICAL]),
                'monitoring_days': n_days
            },
            'alerts_summary': [a.to_dict() for a in self.alerts[-20:]]
        }
    
    def export_for_audit(self, filepath: str):
        """Export audit report to JSON"""
        report = self.generate_audit_report()
        
        with open(filepath, 'w') as f:
            json.dump(report, f, indent=2)
        
        logger.info(f"Audit report exported to {filepath}")


# Factory function
def create_performance_monitor(
    capital: float = 100000.0,
    conservative: bool = True
) -> PerformanceMonitor:
    """Create performance monitor"""
    if conservative:
        return PerformanceMonitor(
            initial_capital=capital,
            drawdown_warning=0.03,
            drawdown_critical=0.07,
            daily_loss_warning=0.008,
            daily_loss_critical=0.015
        )
    return PerformanceMonitor(initial_capital=capital)
