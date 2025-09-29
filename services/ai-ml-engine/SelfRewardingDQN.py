"""
Nexus Trade AI - Self-Rewarding Deep Q-Network (SRDQN)
Advanced reinforcement learning for autonomous trading decisions

This implementation features:
- Self-rewarding mechanism for continuous learning
- Multi-timeframe analysis
- Risk-aware action selection
- Ensemble prediction capabilities
"""

import numpy as np
import tensorflow as tf
from tensorflow import keras
from collections import deque
import random
import json
from typing import Dict, List, Tuple, Optional
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class SelfRewardingDQN:
    """
    Self-Rewarding Deep Q-Network for autonomous trading
    
    Features:
    - Learns to generate its own rewards based on market conditions
    - Multi-layer LSTM architecture for temporal pattern recognition
    - Dynamic risk adjustment based on market volatility
    - Ensemble decision making with confidence scoring
    """
    
    def __init__(self, 
                 state_size: int = 50,
                 action_size: int = 3,  # 0: Hold, 1: Buy, 2: Sell
                 learning_rate: float = 0.001,
                 gamma: float = 0.95,
                 epsilon: float = 1.0,
                 epsilon_min: float = 0.01,
                 epsilon_decay: float = 0.995,
                 memory_size: int = 10000,
                 batch_size: int = 32):
        
        self.state_size = state_size
        self.action_size = action_size
        self.learning_rate = learning_rate
        self.gamma = gamma
        self.epsilon = epsilon
        self.epsilon_min = epsilon_min
        self.epsilon_decay = epsilon_decay
        self.memory_size = memory_size
        self.batch_size = batch_size
        
        # Experience replay memory
        self.memory = deque(maxlen=memory_size)
        self.reward_memory = deque(maxlen=memory_size)
        
        # Neural networks
        self.q_network = self._build_q_network()
        self.target_network = self._build_q_network()
        self.reward_network = self._build_reward_network()
        self.confidence_network = self._build_confidence_network()
        
        # Performance tracking
        self.performance_history = {
            'rewards': [],
            'actions': [],
            'confidence_scores': [],
            'market_conditions': []
        }
        
        # Market regime detection
        self.market_regimes = {
            'trending': 0,
            'ranging': 1,
            'volatile': 2,
            'calm': 3
        }
        
        logger.info("SRDQN initialized with state_size=%d, action_size=%d", state_size, action_size)
    
    def _build_q_network(self) -> keras.Model:
        """Build the main Q-network with LSTM layers for temporal analysis"""
        
        model = keras.Sequential([
            # Input layer
            keras.layers.Input(shape=(self.state_size, 1)),
            
            # LSTM layers for temporal pattern recognition
            keras.layers.LSTM(128, return_sequences=True, dropout=0.2),
            keras.layers.BatchNormalization(),
            keras.layers.LSTM(64, return_sequences=True, dropout=0.2),
            keras.layers.BatchNormalization(),
            keras.layers.LSTM(32, dropout=0.2),
            
            # Dense layers for decision making
            keras.layers.Dense(64, activation='relu'),
            keras.layers.Dropout(0.3),
            keras.layers.Dense(32, activation='relu'),
            keras.layers.Dropout(0.2),
            
            # Output layer - Q-values for each action
            keras.layers.Dense(self.action_size, activation='linear')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate),
            loss='mse',
            metrics=['mae']
        )
        
        return model
    
    def _build_reward_network(self) -> keras.Model:
        """Build the reward network that learns to generate rewards based on market conditions"""
        
        model = keras.Sequential([
            keras.layers.Input(shape=(self.state_size,)),
            
            # Feature extraction layers
            keras.layers.Dense(128, activation='relu'),
            keras.layers.BatchNormalization(),
            keras.layers.Dropout(0.3),
            
            keras.layers.Dense(64, activation='relu'),
            keras.layers.BatchNormalization(),
            keras.layers.Dropout(0.2),
            
            keras.layers.Dense(32, activation='relu'),
            keras.layers.Dropout(0.1),
            
            # Output single reward value
            keras.layers.Dense(1, activation='tanh')  # Reward between -1 and 1
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate * 0.5),
            loss='mse'
        )
        
        return model
    
    def _build_confidence_network(self) -> keras.Model:
        """Build confidence network to assess prediction reliability"""
        
        model = keras.Sequential([
            keras.layers.Input(shape=(self.state_size,)),
            
            keras.layers.Dense(64, activation='relu'),
            keras.layers.BatchNormalization(),
            keras.layers.Dropout(0.2),
            
            keras.layers.Dense(32, activation='relu'),
            keras.layers.Dropout(0.1),
            
            # Output confidence score between 0 and 1
            keras.layers.Dense(1, activation='sigmoid')
        ])
        
        model.compile(
            optimizer=keras.optimizers.Adam(learning_rate=self.learning_rate * 0.3),
            loss='binary_crossentropy'
        )
        
        return model
    
    def detect_market_regime(self, state: np.ndarray) -> str:
        """Detect current market regime based on state features"""
        
        # Calculate volatility (standard deviation of recent prices)
        volatility = np.std(state[-20:]) if len(state) >= 20 else np.std(state)
        
        # Calculate trend strength (correlation with time)
        if len(state) >= 10:
            time_series = np.arange(len(state[-10:]))
            trend_strength = abs(np.corrcoef(state[-10:], time_series)[0, 1])
        else:
            trend_strength = 0
        
        # Classify regime
        if volatility > 0.02:  # High volatility threshold
            return 'volatile'
        elif trend_strength > 0.7:  # Strong trend
            return 'trending'
        elif volatility < 0.005:  # Low volatility
            return 'calm'
        else:
            return 'ranging'
    
    def generate_self_reward(self, state: np.ndarray, action: int, next_state: np.ndarray, 
                           market_reward: float) -> float:
        """Generate self-reward based on market conditions and action quality"""
        
        # Get base self-reward from network
        state_flat = state.flatten().reshape(1, -1)
        base_self_reward = self.reward_network.predict(state_flat, verbose=0)[0][0]
        
        # Market regime adjustment
        regime = self.detect_market_regime(state.flatten())
        regime_multiplier = {
            'trending': 1.2,    # Reward trend-following in trending markets
            'ranging': 0.8,     # Reduce rewards in ranging markets
            'volatile': 0.6,    # Be conservative in volatile markets
            'calm': 1.0         # Normal rewards in calm markets
        }.get(regime, 1.0)
        
        # Action consistency reward
        recent_actions = self.performance_history['actions'][-5:] if self.performance_history['actions'] else []
        if len(recent_actions) >= 3:
            action_consistency = 1.0 if len(set(recent_actions)) <= 2 else 0.5
        else:
            action_consistency = 1.0
        
        # Risk-adjusted reward
        price_change = (next_state[-1] - state[-1]) / state[-1] if state[-1] != 0 else 0
        risk_adjustment = 1.0 - min(abs(price_change) * 10, 0.5)  # Penalize high volatility
        
        # Combine all reward components
        self_reward = base_self_reward * regime_multiplier * action_consistency * risk_adjustment
        
        # Weighted combination of market reward and self-reward
        total_reward = 0.6 * market_reward + 0.4 * self_reward
        
        return float(total_reward)
    
    def get_action(self, state: np.ndarray, use_epsilon: bool = True) -> Tuple[int, float]:
        """Get action with confidence score"""
        
        # Epsilon-greedy exploration
        if use_epsilon and np.random.random() <= self.epsilon:
            action = np.random.choice(self.action_size)
            confidence = 0.1  # Low confidence for random actions
        else:
            # Reshape state for LSTM input
            state_reshaped = state.reshape(1, self.state_size, 1)
            q_values = self.q_network.predict(state_reshaped, verbose=0)[0]
            action = np.argmax(q_values)
            
            # Get confidence score
            state_flat = state.flatten().reshape(1, -1)
            confidence = self.confidence_network.predict(state_flat, verbose=0)[0][0]
        
        return action, confidence
    
    def remember(self, state: np.ndarray, action: int, reward: float, 
                next_state: np.ndarray, done: bool):
        """Store experience in replay memory"""
        
        self.memory.append((state, action, reward, next_state, done))
        
        # Update performance history
        self.performance_history['actions'].append(action)
        self.performance_history['rewards'].append(reward)
        
        # Keep history manageable
        if len(self.performance_history['actions']) > 1000:
            self.performance_history['actions'] = self.performance_history['actions'][-500:]
            self.performance_history['rewards'] = self.performance_history['rewards'][-500:]
    
    def train_step(self) -> Dict[str, float]:
        """Perform one training step"""
        
        if len(self.memory) < self.batch_size:
            return {'loss': 0.0, 'reward_loss': 0.0, 'confidence_loss': 0.0}
        
        # Sample batch from memory
        batch = random.sample(self.memory, self.batch_size)
        states = np.array([e[0] for e in batch])
        actions = np.array([e[1] for e in batch])
        rewards = np.array([e[2] for e in batch])
        next_states = np.array([e[3] for e in batch])
        dones = np.array([e[4] for e in batch])
        
        # Reshape for LSTM
        states_reshaped = states.reshape(self.batch_size, self.state_size, 1)
        next_states_reshaped = next_states.reshape(self.batch_size, self.state_size, 1)
        
        # Get current Q-values
        current_q_values = self.q_network.predict(states_reshaped, verbose=0)
        
        # Get next Q-values from target network
        next_q_values = self.target_network.predict(next_states_reshaped, verbose=0)
        
        # Calculate target Q-values
        target_q_values = current_q_values.copy()
        
        for i in range(self.batch_size):
            if dones[i]:
                target_q_values[i][actions[i]] = rewards[i]
            else:
                target_q_values[i][actions[i]] = rewards[i] + self.gamma * np.max(next_q_values[i])
        
        # Train main Q-network
        q_loss = self.q_network.train_on_batch(states_reshaped, target_q_values)
        
        # Train reward network
        states_flat = states.reshape(self.batch_size, -1)
        reward_targets = rewards.reshape(-1, 1)
        reward_loss = self.reward_network.train_on_batch(states_flat, reward_targets)
        
        # Train confidence network (simplified - based on reward magnitude)
        confidence_targets = (np.abs(rewards) > np.mean(np.abs(rewards))).astype(float).reshape(-1, 1)
        confidence_loss = self.confidence_network.train_on_batch(states_flat, confidence_targets)
        
        # Decay epsilon
        if self.epsilon > self.epsilon_min:
            self.epsilon *= self.epsilon_decay
        
        return {
            'loss': float(q_loss),
            'reward_loss': float(reward_loss),
            'confidence_loss': float(confidence_loss),
            'epsilon': self.epsilon
        }
    
    def update_target_network(self):
        """Update target network weights"""
        self.target_network.set_weights(self.q_network.get_weights())
    
    def save_model(self, filepath: str):
        """Save all models"""
        self.q_network.save(f"{filepath}_q_network.h5")
        self.reward_network.save(f"{filepath}_reward_network.h5")
        self.confidence_network.save(f"{filepath}_confidence_network.h5")
        
        # Save performance history
        with open(f"{filepath}_history.json", 'w') as f:
            json.dump(self.performance_history, f)
        
        logger.info("Models saved to %s", filepath)
    
    def load_model(self, filepath: str):
        """Load all models"""
        try:
            self.q_network = keras.models.load_model(f"{filepath}_q_network.h5")
            self.reward_network = keras.models.load_model(f"{filepath}_reward_network.h5")
            self.confidence_network = keras.models.load_model(f"{filepath}_confidence_network.h5")
            
            # Load performance history
            with open(f"{filepath}_history.json", 'r') as f:
                self.performance_history = json.load(f)
            
            logger.info("Models loaded from %s", filepath)
        except Exception as e:
            logger.error("Failed to load models: %s", e)
    
    def get_performance_metrics(self) -> Dict[str, float]:
        """Get current performance metrics"""
        
        if not self.performance_history['rewards']:
            return {'avg_reward': 0.0, 'win_rate': 0.0, 'total_trades': 0}
        
        rewards = self.performance_history['rewards']
        actions = self.performance_history['actions']
        
        avg_reward = np.mean(rewards)
        win_rate = len([r for r in rewards if r > 0]) / len(rewards)
        total_trades = len([a for a in actions if a != 0])  # Non-hold actions
        
        return {
            'avg_reward': float(avg_reward),
            'win_rate': float(win_rate),
            'total_trades': total_trades,
            'epsilon': self.epsilon,
            'memory_size': len(self.memory)
        }
