"""
PHASE 3: Ornstein-Uhlenbeck MLE for Pairs Trading
===================================================

Estimates the mean reversion parameters of the Ornstein-Uhlenbeck process
using Maximum Likelihood Estimation.

Model: dX = θ(μ - X)dt + σdW

Parameters:
    θ (theta) = mean reversion speed
    μ (mu)    = long-run mean
    σ (sigma) = volatility of the process

Half-life = ln(2) / θ

Usage:
    from ou_estimator import OUEstimator
    ou = OUEstimator()
    result = ou.fit(spread_series)
    print(f"Half-life: {result['half_life']:.1f} days")
    print(f"Current z-score: {result['z_score']:.2f}")
"""

import numpy as np
import pandas as pd
from typing import Dict, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class OUEstimator:
    """
    Ornstein-Uhlenbeck process parameter estimation via MLE.
    
    For a discrete OU process:
        X(t+1) = X(t) + θ(μ - X(t))Δt + σ√Δt · ε
    
    The MLE for the AR(1) representation gives:
        X(t) = a + b·X(t-1) + ε
        θ = -ln(b) / Δt
        μ = a / (1 - b)
        σ = std(residuals) / √(Δt)
    """
    
    def __init__(self, dt: float = 1.0):
        """
        Args:
            dt: time step (1.0 for daily data)
        """
        self.dt = dt
        self.theta = None
        self.mu = None
        self.sigma = None
        self.half_life = None
        self.is_fitted = False
    
    def fit(self, spread: pd.Series) -> Dict:
        """
        Fit OU process to spread data using MLE.
        
        Args:
            spread: Time series of spread values
            
        Returns:
            Dictionary with theta, mu, sigma, half_life, z_score, etc.
        """
        if len(spread) < 20:
            return self._default_result("Insufficient data (need 20+ observations)")
        
        spread = spread.dropna().values
        n = len(spread)
        
        # AR(1) regression: X(t) = a + b * X(t-1) + noise
        X = spread[:-1]  # X(t-1)
        Y = spread[1:]   # X(t)
        
        # OLS regression
        X_with_const = np.column_stack([np.ones(len(X)), X])
        try:
            # β = (X'X)^(-1) X'Y
            XtX = X_with_const.T @ X_with_const
            XtY = X_with_const.T @ Y
            beta = np.linalg.solve(XtX, XtY)
        except np.linalg.LinAlgError:
            return self._default_result("Singular matrix in OLS")
        
        a = beta[0]  # intercept
        b = beta[1]  # slope (autoregressive coefficient)
        
        # Residuals
        residuals = Y - X_with_const @ beta
        sigma_residuals = np.std(residuals)
        
        # Check for stationarity: |b| must be < 1
        if abs(b) >= 1.0 or b <= 0:
            return self._default_result(f"Non-stationary (b={b:.4f})")
        
        # MLE parameter estimates
        self.theta = -np.log(b) / self.dt
        self.mu = a / (1 - b)
        self.sigma = sigma_residuals * np.sqrt(-2 * np.log(b) / (self.dt * (1 - b**2)))
        self.half_life = np.log(2) / self.theta
        
        # Current z-score
        current_value = spread[-1]
        spread_std = np.std(spread[-30:]) if len(spread) >= 30 else np.std(spread)
        z_score = (current_value - self.mu) / spread_std if spread_std > 0 else 0
        
        # Log-likelihood (for model comparison)
        sigma_eq = sigma_residuals  # equilibrium volatility
        log_lik = -0.5 * n * np.log(2 * np.pi * sigma_eq**2) - \
                  0.5 * np.sum(residuals**2) / sigma_eq**2
        
        # R-squared of AR(1) fit
        ss_res = np.sum(residuals**2)
        ss_tot = np.sum((Y - np.mean(Y))**2)
        r_squared = 1 - ss_res / ss_tot if ss_tot > 0 else 0
        
        self.is_fitted = True
        
        return {
            'theta': float(self.theta),
            'mu': float(self.mu),
            'sigma': float(self.sigma),
            'half_life': float(self.half_life),
            'z_score': float(z_score),
            'current_value': float(current_value),
            'ar_coefficient': float(b),
            'r_squared': float(r_squared),
            'log_likelihood': float(log_lik),
            'is_mean_reverting': self.half_life > 1 and self.half_life < 60,
            'trade_signal': self._get_trade_signal(z_score),
            'status': 'fitted'
        }
    
    def _get_trade_signal(self, z_score: float) -> str:
        """Generate trade signal from z-score"""
        if z_score > 2.0:
            return 'SHORT_SPREAD'  # Spread too high, sell spread
        elif z_score < -2.0:
            return 'LONG_SPREAD'   # Spread too low, buy spread
        elif abs(z_score) < 0.5:
            return 'EXIT'          # Mean reverted, take profit
        return 'HOLD'
    
    def _default_result(self, reason: str) -> Dict:
        """Return default result when fitting fails"""
        return {
            'theta': 0,
            'mu': 0,
            'sigma': 0,
            'half_life': float('inf'),
            'z_score': 0,
            'current_value': 0,
            'ar_coefficient': 0,
            'r_squared': 0,
            'log_likelihood': 0,
            'is_mean_reverting': False,
            'trade_signal': 'NEUTRAL',
            'status': f'failed: {reason}'
        }
    
    def forecast(self, current_value: float, horizon: int = 5) -> np.ndarray:
        """
        Forecast expected path of the spread.
        
        E[X(t+h)] = μ + (X(t) - μ) * exp(-θ * h)
        """
        if not self.is_fitted:
            return np.full(horizon, current_value)
        
        path = np.zeros(horizon)
        for h in range(horizon):
            path[h] = self.mu + (current_value - self.mu) * np.exp(-self.theta * (h + 1) * self.dt)
        
        return path
    
    def optimal_entry_zscore(self, transaction_cost_pct: float = 0.001) -> float:
        """
        Calculate optimal entry z-score considering transaction costs.
        
        Higher transaction costs → higher entry threshold needed.
        """
        if not self.is_fitted or self.sigma <= 0:
            return 2.0  # Default
        
        # Break-even z-score: the z-score where expected profit = transaction costs
        # Expected profit from mean reversion ~= z * sigma_spread * (1 - exp(-theta))
        # Need this > 2 * transaction_cost (round trip)
        breakeven_z = 2 * transaction_cost_pct / (self.sigma * (1 - np.exp(-self.theta * self.half_life)))
        
        return max(1.5, min(3.0, breakeven_z + 0.5))  # Add 0.5 buffer, clamp [1.5, 3.0]


def fit_ou_to_pair(prices_1: pd.Series, prices_2: pd.Series, hedge_ratio: float = None) -> Dict:
    """
    Convenience function: compute spread from two price series and fit OU.
    
    Args:
        prices_1: First asset prices
        prices_2: Second asset prices
        hedge_ratio: Optional. If None, estimated via OLS.
    
    Returns:
        OU parameter estimates and trading signals
    """
    if hedge_ratio is None:
        # OLS hedge ratio: prices_1 = β * prices_2 + ε
        X = np.column_stack([np.ones(len(prices_2)), prices_2.values])
        y = prices_1.values
        beta = np.linalg.lstsq(X, y, rcond=None)[0]
        hedge_ratio = beta[1]
    
    spread = prices_1 - hedge_ratio * prices_2
    
    ou = OUEstimator()
    result = ou.fit(spread)
    result['hedge_ratio'] = float(hedge_ratio)
    
    return result
