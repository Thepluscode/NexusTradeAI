"""
NexusTradeAI - Enhanced Strategy Manager with Ensemble Learning
=============================================================

Advanced strategy manager that combines multiple strategies using
weighted ensemble methods and automatic performance-based adjustments.
"""

import logging
import numpy as np
from typing import Dict, List, Optional, Tuple, Any
from datetime import datetime, timedelta

from strategy_framework import BaseStrategy, TradingSignal, MarketData, SignalType
from strategies import AIEnhancedStrategy

logger = logging.getLogger(__name__)

class EnsembleStrategyManager:
    """
    Enhanced strategy manager with ensemble learning capabilities
    """
    
    def __init__(self):
        self.strategies: Dict[str, BaseStrategy] = {}
        self.strategy_weights: Dict[str, float] = {}
        self.performance_tracker: Dict[str, Dict] = {}
        self.ensemble_history: List[Dict] = []
        self.auto_adjustment_enabled = True
        self.min_signals_for_adjustment = 10
    
    def add_strategy(self, strategy: BaseStrategy, weight: float = 1.0):
        """Add a strategy to the ensemble"""
        self.strategies[strategy.name] = strategy
        self.strategy_weights[strategy.name] = weight
        self.performance_tracker[strategy.name] = {
            'signals_generated': 0,
            'successful_trades': 0,
            'failed_trades': 0,
            'win_rate': 0.0,
            'avg_confidence': 0.0,
            'total_pnl': 0.0,
            'sharpe_ratio': 0.0,
            'last_updated': datetime.now()
        }
        logger.info(f"Added strategy: {strategy.name} with weight {weight}")
    
    def remove_strategy(self, strategy_name: str) -> bool:
        """Remove a strategy from the ensemble"""
        if strategy_name in self.strategies:
            del self.strategies[strategy_name]
            del self.strategy_weights[strategy_name]
            del self.performance_tracker[strategy_name]
            logger.info(f"Removed strategy: {strategy_name}")
            return True
        return False
    
    def update_strategy_weight(self, strategy_name: str, new_weight: float):
        """Update strategy weight"""
        if strategy_name in self.strategy_weights:
            old_weight = self.strategy_weights[strategy_name]
            self.strategy_weights[strategy_name] = max(0.0, new_weight)  # Ensure non-negative
            logger.info(f"Updated {strategy_name} weight: {old_weight:.3f} -> {new_weight:.3f}")
    
    def generate_ensemble_signal(self, market_data: List[MarketData]) -> Optional[TradingSignal]:
        """
        Generate ensemble signal from all active strategies using weighted voting
        """
        if not market_data:
            return None
        
        individual_signals = []
        
        # Collect signals from all active strategies
        for name, strategy in self.strategies.items():
            if not strategy.is_active:
                continue
                
            try:
                signal = strategy.generate_signal(market_data)
                if signal and strategy.validate_signal(signal, signal.entry_price):
                    individual_signals.append((signal, self.strategy_weights[name], name))
                    self.performance_tracker[name]['signals_generated'] += 1
                    
            except Exception as e:
                logger.error(f"Error generating signal from {name}: {e}")
        
        if not individual_signals:
            return None
        
        # Weighted ensemble voting
        ensemble_result = self._weighted_ensemble_voting(individual_signals)
        
        if ensemble_result:
            # Store ensemble history for analysis
            self.ensemble_history.append({
                'timestamp': datetime.now(),
                'symbol': market_data[-1].symbol,
                'individual_signals': len(individual_signals),
                'final_signal': ensemble_result.signal_type.value,
                'confidence': ensemble_result.confidence,
                'contributing_strategies': [name for _, _, name in individual_signals]
            })
            
            # Keep only last 1000 ensemble decisions
            if len(self.ensemble_history) > 1000:
                self.ensemble_history = self.ensemble_history[-1000:]
        
        return ensemble_result
    
    def _weighted_ensemble_voting(self, signals: List[Tuple[TradingSignal, float, str]]) -> Optional[TradingSignal]:
        """
        Combine signals using sophisticated weighted voting
        """
        if not signals:
            return None
        
        # Initialize vote accumulators
        buy_votes = []
        sell_votes = []
        hold_votes = []
        
        total_weight = 0.0
        all_metadata = {}
        base_signal = signals[0][0]  # Use first signal as template
        
        # Collect weighted votes
        for signal, weight, strategy_name in signals:
            # Adjust weight by strategy performance
            performance = self.performance_tracker[strategy_name]
            performance_multiplier = max(0.1, performance['win_rate'])  # Min 0.1x multiplier
            adjusted_weight = weight * performance_multiplier
            
            weighted_confidence = signal.confidence * adjusted_weight
            total_weight += adjusted_weight
            
            # Categorize votes
            if signal.signal_type == SignalType.BUY or signal.signal_type == SignalType.STRONG_BUY:
                buy_votes.append(weighted_confidence)
            elif signal.signal_type == SignalType.SELL or signal.signal_type == SignalType.STRONG_SELL:
                sell_votes.append(weighted_confidence)
            else:
                hold_votes.append(weighted_confidence)
            
            # Collect metadata
            all_metadata[f"{strategy_name}_signal"] = {
                'signal_type': signal.signal_type.value,
                'confidence': signal.confidence,
                'weight': weight,
                'adjusted_weight': adjusted_weight
            }
        
        # Calculate final votes
        buy_strength = sum(buy_votes) / total_weight if total_weight > 0 else 0
        sell_strength = sum(sell_votes) / total_weight if total_weight > 0 else 0
        hold_strength = sum(hold_votes) / total_weight if total_weight > 0 else 0
        
        # Determine final signal with confidence threshold
        min_confidence = 0.5
        max_strength = max(buy_strength, sell_strength, hold_strength)
        
        if max_strength < min_confidence:
            return None  # Not enough confidence
        
        # Determine signal type
        if buy_strength == max_strength:
            final_signal_type = SignalType.STRONG_BUY if buy_strength > 0.8 else SignalType.BUY
            final_confidence = buy_strength
        elif sell_strength == max_strength:
            final_signal_type = SignalType.STRONG_SELL if sell_strength > 0.8 else SignalType.SELL
            final_confidence = sell_strength
        else:
            return None  # Hold signal - don't generate
        
        # Calculate ensemble stop-loss and take-profit
        stop_losses = [s.stop_loss for s, _, _ in signals if s.stop_loss is not None]
        take_profits = [s.take_profit for s, _, _ in signals if s.take_profit is not None]
        
        ensemble_stop_loss = np.mean(stop_losses) if stop_losses else None
        ensemble_take_profit = np.mean(take_profits) if take_profits else None
        
        # Create ensemble signal
        return TradingSignal(
            symbol=base_signal.symbol,
            signal_type=final_signal_type,
            confidence=final_confidence,
            entry_price=base_signal.entry_price,
            stop_loss=ensemble_stop_loss,
            take_profit=ensemble_take_profit,
            metadata={
                'ensemble_signal': True,
                'contributing_strategies': len(signals),
                'buy_strength': buy_strength,
                'sell_strength': sell_strength,
                'hold_strength': hold_strength,
                'total_weight': total_weight,
                'strategy_details': all_metadata
            }
        )
    
    def update_performance(self, strategy_name: str, trade_success: bool, pnl: float = 0.0, confidence: float = 0.7):
        """Update strategy performance metrics"""
        if strategy_name not in self.performance_tracker:
            return
        
        tracker = self.performance_tracker[strategy_name]
        
        # Update trade counts
        if trade_success:
            tracker['successful_trades'] += 1
        else:
            tracker['failed_trades'] += 1
        
        # Update win rate
        total_trades = tracker['successful_trades'] + tracker['failed_trades']
        if total_trades > 0:
            tracker['win_rate'] = tracker['successful_trades'] / total_trades
        
        # Update average confidence
        total_signals = tracker['signals_generated']
        if total_signals > 0:
            current_avg = tracker['avg_confidence']
            tracker['avg_confidence'] = (current_avg * (total_signals - 1) + confidence) / total_signals
        
        # Update P&L
        tracker['total_pnl'] += pnl
        
        # Update timestamp
        tracker['last_updated'] = datetime.now()
        
        # Update strategy object
        if strategy_name in self.strategies:
            self.strategies[strategy_name].update_performance(trade_success, confidence)
        
        # Auto-adjust weights if enabled
        if (self.auto_adjustment_enabled and 
            total_trades >= self.min_signals_for_adjustment):
            self._auto_adjust_weights()
    
    def _auto_adjust_weights(self):
        """Automatically adjust strategy weights based on performance"""
        rankings = self.get_strategy_rankings()
        
        if len(rankings) <= 1:
            return
        
        # Calculate new weights based on performance scores
        total_score = sum(score for _, score in rankings)
        
        if total_score > 0:
            for name, score in rankings:
                # Normalize score to weight (average weight = 1.0)
                new_weight = (score / total_score) * len(rankings)
                
                # Apply smoothing to prevent dramatic weight changes
                current_weight = self.strategy_weights[name]
                smoothed_weight = 0.7 * current_weight + 0.3 * new_weight
                
                self.update_strategy_weight(name, smoothed_weight)
    
    def get_strategy_rankings(self) -> List[Tuple[str, float]]:
        """Get strategies ranked by comprehensive performance score"""
        rankings = []
        
        for name, tracker in self.performance_tracker.items():
            # Multi-factor performance score
            win_rate = tracker['win_rate']
            signal_count = tracker['signals_generated']
            avg_confidence = tracker['avg_confidence']
            
            # Penalize strategies with too few signals
            signal_penalty = min(1.0, signal_count / self.min_signals_for_adjustment)
            
            # Composite score
            score = (win_rate * 0.5 + avg_confidence * 0.3 + signal_penalty * 0.2)
            
            # Boost for consistent performers
            if signal_count > 20 and win_rate > 0.6:
                score *= 1.1
            
            rankings.append((name, score))
        
        return sorted(rankings, key=lambda x: x[1], reverse=True)
    
    def get_ensemble_summary(self) -> Dict[str, Any]:
        """Get comprehensive ensemble summary"""
        active_strategies = [s for s in self.strategies.values() if s.is_active]
        
        return {
            'total_strategies': len(self.strategies),
            'active_strategies': len(active_strategies),
            'strategy_weights': self.strategy_weights.copy(),
            'performance_tracker': self.performance_tracker.copy(),
            'strategy_rankings': self.get_strategy_rankings(),
            'ensemble_decisions': len(self.ensemble_history),
            'auto_adjustment_enabled': self.auto_adjustment_enabled,
            'last_ensemble_signal': self.ensemble_history[-1] if self.ensemble_history else None
        }
    
    def export_ensemble_config(self) -> Dict[str, Any]:
        """Export ensemble configuration"""
        return {
            'strategies': {
                name: {
                    'type': strategy.strategy_type.value,
                    'active': strategy.is_active,
                    'weight': self.strategy_weights[name],
                    'parameters': strategy.parameters,
                    'performance': self.performance_tracker[name]
                }
                for name, strategy in self.strategies.items()
            },
            'ensemble_settings': {
                'auto_adjustment_enabled': self.auto_adjustment_enabled,
                'min_signals_for_adjustment': self.min_signals_for_adjustment
            },
            'export_timestamp': datetime.now().isoformat()
        }
    
    def get_ensemble_analytics(self) -> Dict[str, Any]:
        """Get detailed ensemble analytics"""
        if not self.ensemble_history:
            return {'message': 'No ensemble history available'}
        
        recent_decisions = self.ensemble_history[-50:]  # Last 50 decisions
        
        # Signal type distribution
        signal_types = [d['final_signal'] for d in recent_decisions]
        signal_distribution = {
            'buy': signal_types.count('buy') + signal_types.count('strong_buy'),
            'sell': signal_types.count('sell') + signal_types.count('strong_sell'),
            'total': len(signal_types)
        }
        
        # Average confidence
        confidences = [d['confidence'] for d in recent_decisions]
        avg_confidence = np.mean(confidences) if confidences else 0
        
        # Strategy contribution analysis
        all_contributors = []
        for decision in recent_decisions:
            all_contributors.extend(decision['contributing_strategies'])
        
        strategy_contributions = {}
        for strategy in set(all_contributors):
            strategy_contributions[strategy] = all_contributors.count(strategy)
        
        return {
            'recent_decisions': len(recent_decisions),
            'signal_distribution': signal_distribution,
            'average_confidence': avg_confidence,
            'strategy_contributions': strategy_contributions,
            'ensemble_effectiveness': avg_confidence * (signal_distribution['total'] / 50) if signal_distribution['total'] > 0 else 0
        }
