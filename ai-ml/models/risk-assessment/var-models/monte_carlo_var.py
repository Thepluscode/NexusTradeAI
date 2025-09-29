import numpy as np
import pandas as pd
from scipy import stats
from typing import Dict, List, Tuple
import logging

class MonteCarloVaR:
    """
    Monte Carlo Value at Risk calculator for portfolio risk assessment
    """
    
    def __init__(self, confidence_level: float = 0.05, num_simulations: int = 10000):
        """
        Initialize Monte Carlo VaR calculator
        
        Args:
            confidence_level: VaR confidence level (e.g., 0.05 for 95% VaR)
            num_simulations: Number of Monte Carlo simulations
        """
        self.confidence_level = confidence_level
        self.num_simulations = num_simulations
        self.logger = logging.getLogger(__name__)
        
    def calculate_portfolio_var(self,
                              returns: pd.DataFrame,
                              weights: np.ndarray,
                              time_horizon: int = 1) -> Dict:
        """
        Calculate portfolio VaR using Monte Carlo simulation
        
        Args:
            returns: Historical returns DataFrame
            weights: Portfolio weights
            time_horizon: Time horizon in days
            
        Returns:
            Dictionary with VaR metrics
        """
        # Calculate correlation matrix and volatilities
        correlation_matrix = returns.corr().values
        volatilities = returns.std().values
        mean_returns = returns.mean().values
        
        # Generate random samples
        np.random.seed(42)  # For reproducibility
        random_samples = np.random.multivariate_normal(
            mean_returns,
            np.outer(volatilities, volatilities) * correlation_matrix,
            self.num_simulations
        )
        
        # Scale for time horizon
        scaled_samples = random_samples * np.sqrt(time_horizon)
        
        # Calculate portfolio returns
        portfolio_returns = np.dot(scaled_samples, weights)
        
        # Calculate VaR and CVaR
        var = np.percentile(portfolio_returns, self.confidence_level * 100)
        cvar = np.mean(portfolio_returns[portfolio_returns <= var])
        
        # Additional risk metrics
        volatility = np.std(portfolio_returns)
        skewness = stats.skew(portfolio_returns)
        kurtosis = stats.kurtosis(portfolio_returns)
        
        return {
            'VaR': abs(var),
            'CVaR': abs(cvar),
            'Volatility': volatility,
            'Skewness': skewness,
            'Kurtosis': kurtosis,
            'Simulated_Returns': portfolio_returns
        }
    
    def stress_test_scenarios(self,
                            returns: pd.DataFrame,
                            weights: np.ndarray,
                            scenarios: List[Dict]) -> Dict:
        """
        Run stress test scenarios
        
        Args:
            returns: Historical returns DataFrame
            weights: Portfolio weights
            scenarios: List of stress test scenarios
            
        Returns:
            Dictionary with stress test results
        """
        results = {}
        
        for i, scenario in enumerate(scenarios):
            # Apply scenario shocks
            shocked_returns = returns.copy()
            
            for asset, shock in scenario.items():
                if asset in shocked_returns.columns:
                    shocked_returns[asset] += shock
            
            # Calculate VaR under stress
            stress_var = self.calculate_portfolio_var(shocked_returns, weights)
            results[f'scenario_{i+1}'] = stress_var
        
        return results