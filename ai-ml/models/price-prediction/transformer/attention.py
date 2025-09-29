import tensorflow as tf
import numpy as np
from typing import Tuple, Optional, Dict, Any

class MultiHeadSelfAttention(tf.keras.layers.Layer):
    """
    Multi-head self-attention mechanism for financial time series
    """
    
    def __init__(self, 
                 embed_dim: int,
                 num_heads: int,
                 dropout_rate: float = 0.1,
                 use_causal_mask: bool = True,
                 **kwargs):
        """
        Initialize multi-head attention
        
        Args:
            embed_dim: Embedding dimension
            num_heads: Number of attention heads
            dropout_rate: Dropout rate
            use_causal_mask: Whether to use causal masking for autoregressive prediction
        """
        super().__init__(**kwargs)
        
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        self.dropout_rate = dropout_rate
        self.use_causal_mask = use_causal_mask
        
        assert embed_dim % num_heads == 0, "embed_dim must be divisible by num_heads"
        self.head_dim = embed_dim // num_heads
        
        # Linear projections for Q, K, V
        self.query_projection = tf.keras.layers.Dense(embed_dim, name="query")
        self.key_projection = tf.keras.layers.Dense(embed_dim, name="key")
        self.value_projection = tf.keras.layers.Dense(embed_dim, name="value")
        
        # Output projection
        self.output_projection = tf.keras.layers.Dense(embed_dim, name="output")
        
        # Dropout layers
        self.attention_dropout = tf.keras.layers.Dropout(dropout_rate)
        self.output_dropout = tf.keras.layers.Dropout(dropout_rate)
        
        # Layer normalization
        self.layer_norm = tf.keras.layers.LayerNormalization(epsilon=1e-6)
    
    def call(self, 
             inputs: tf.Tensor,
             training: bool = False,
             mask: Optional[tf.Tensor] = None) -> tf.Tensor:
        """
        Forward pass of multi-head attention
        
        Args:
            inputs: Input tensor [batch_size, seq_length, embed_dim]
            training: Training mode flag
            mask: Attention mask
            
        Returns:
            Output tensor with same shape as input
        """
        batch_size = tf.shape(inputs)[0]
        seq_length = tf.shape(inputs)[1]
        
        # Linear projections
        queries = self.query_projection(inputs)  # [batch, seq, embed_dim]
        keys = self.key_projection(inputs)       # [batch, seq, embed_dim]
        values = self.value_projection(inputs)   # [batch, seq, embed_dim]
        
        # Reshape for multi-head attention
        queries = self._reshape_for_attention(queries, batch_size, seq_length)
        keys = self._reshape_for_attention(keys, batch_size, seq_length)
        values = self._reshape_for_attention(values, batch_size, seq_length)
        
        # Scaled dot-product attention
        attention_output, attention_weights = self._scaled_dot_product_attention(
            queries, keys, values, training=training, mask=mask
        )
        
        # Reshape back to original format
        attention_output = tf.reshape(
            attention_output,
            [batch_size, seq_length, self.embed_dim]
        )
        
        # Output projection
        output = self.output_projection(attention_output)
        output = self.output_dropout(output, training=training)
        
        # Residual connection and layer normalization
        output = self.layer_norm(inputs + output)
        
        return output, attention_weights
    
    def _reshape_for_attention(self, tensor: tf.Tensor, batch_size: int, seq_length: int) -> tf.Tensor:
        """Reshape tensor for multi-head attention computation"""
        return tf.reshape(
            tensor,
            [batch_size, seq_length, self.num_heads, self.head_dim]
        )
    
    def _scaled_dot_product_attention(self,
                                   queries: tf.Tensor,
                                   keys: tf.Tensor,
                                   values: tf.Tensor,
                                   training: bool = False,
                                   mask: Optional[tf.Tensor] = None) -> Tuple[tf.Tensor, tf.Tensor]:
        """
        Compute scaled dot-product attention with financial market optimizations
        """
        # Transpose for attention computation: [batch, heads, seq, head_dim]
        queries = tf.transpose(queries, [0, 2, 1, 3])
        keys = tf.transpose(keys, [0, 2, 1, 3])
        values = tf.transpose(values, [0, 2, 1, 3])
        
        # Compute attention scores
        attention_scores = tf.matmul(queries, keys, transpose_b=True)
        
        # Scale by square root of head dimension
        scale = tf.cast(tf.sqrt(tf.cast(self.head_dim, tf.float32)), tf.float32)
        attention_scores = attention_scores / scale
        
        # Apply causal mask for autoregressive prediction
        if self.use_causal_mask:
            seq_length = tf.shape(attention_scores)[2]
            causal_mask = self._create_causal_mask(seq_length)
            attention_scores = tf.where(causal_mask, attention_scores, -1e9)
        
        # Apply additional mask if provided
        if mask is not None:
            attention_scores += (mask * -1e9)
        
        # Apply softmax to get attention weights
        attention_weights = tf.nn.softmax(attention_scores, axis=-1)
        
        # Apply dropout to attention weights
        attention_weights = self.attention_dropout(attention_weights, training=training)
        
        # Apply attention to values
        output = tf.matmul(attention_weights, values)
        
        # Transpose back: [batch, seq, heads, head_dim]
        output = tf.transpose(output, [0, 2, 1, 3])
        
        return output, attention_weights
    
    def _create_causal_mask(self, seq_length: int) -> tf.Tensor:
        """Create causal mask for autoregressive attention"""
        mask = tf.linalg.band_part(tf.ones((seq_length, seq_length)), -1, 0)
        return tf.cast(mask, tf.bool)
    
    def get_config(self):
        """Get layer configuration for serialization"""
        config = super().get_config()
        config.update({
            'embed_dim': self.embed_dim,
            'num_heads': self.num_heads,
            'dropout_rate': self.dropout_rate,
            'use_causal_mask': self.use_causal_mask
        })
        return config


class PositionalEncoding(tf.keras.layers.Layer):
    """
    Positional encoding with financial market-specific enhancements
    """
    
    def __init__(self, max_sequence_length: int = 1000, embed_dim: int = 512, **kwargs):
        super().__init__(**kwargs)
        self.max_sequence_length = max_sequence_length
        self.embed_dim = embed_dim
        
        # Pre-compute positional encodings
        self.positional_encoding = self._create_positional_encoding()
    
    def _create_positional_encoding(self) -> tf.Tensor:
        """Create sinusoidal positional encoding"""
        positions = tf.range(self.max_sequence_length, dtype=tf.float32)[:, tf.newaxis]
        
        # Create dimension indices
        dimensions = tf.range(self.embed_dim, dtype=tf.float32)[tf.newaxis, :]
        
        # Compute angle rates
        angle_rates = 1 / tf.pow(10000.0, (2 * (dimensions // 2)) / tf.cast(self.embed_dim, tf.float32))
        
        # Compute angles
        angle_rads = positions * angle_rates
        
        # Apply sin to even indices and cos to odd indices
        sines = tf.sin(angle_rads[:, 0::2])
        cosines = tf.cos(angle_rads[:, 1::2])
        
        # Interleave sines and cosines
        pos_encoding = tf.concat([sines, cosines], axis=-1)
        
        # Add batch dimension
        pos_encoding = pos_encoding[tf.newaxis, ...]
        
        return tf.cast(pos_encoding, tf.float32)
    
    def call(self, inputs: tf.Tensor) -> tf.Tensor:
        """
        Add positional encoding to input embeddings
        
        Args:
            inputs: Input tensor [batch_size, seq_length, embed_dim]
            
        Returns:
            Input with positional encoding added
        """
        seq_length = tf.shape(inputs)[1]
        
        # Get positional encoding for current sequence length
        pos_encoding = self.positional_encoding[:, :seq_length, :]
        
        return inputs + pos_encoding
    
    def get_config(self):
        config = super().get_config()
        config.update({
            'max_sequence_length': self.max_sequence_length,
            'embed_dim': self.embed_dim
        })
        return config


class MarketAwareAttention(tf.keras.layers.Layer):
    """
    Market-aware attention mechanism that incorporates trading volume and volatility
    """
    
    def __init__(self, embed_dim: int, num_heads: int, **kwargs):
        super().__init__(**kwargs)
        self.embed_dim = embed_dim
        self.num_heads = num_heads
        
        # Base attention mechanism
        self.base_attention = MultiHeadSelfAttention(embed_dim, num_heads)
        
        # Market condition embedding
        self.volume_projection = tf.keras.layers.Dense(embed_dim // 4, activation='relu')
        self.volatility_projection = tf.keras.layers.Dense(embed_dim // 4, activation='relu')
        
        # Attention weight modulation
        self.market_weight_layer = tf.keras.layers.Dense(1, activation='sigmoid')
        
        # Layer normalization
        self.layer_norm = tf.keras.layers.LayerNormalization(epsilon=1e-6)
    
    def call(self, 
             inputs: tf.Tensor,
             volume: tf.Tensor,
             volatility: tf.Tensor,
             training: bool = False) -> tf.Tensor:
        """
        Forward pass with market-aware attention
        
        Args:
            inputs: Price/feature tensor [batch, seq, embed_dim]
            volume: Volume tensor [batch, seq, 1]
            volatility: Volatility tensor [batch, seq, 1]
            training: Training mode flag
            
        Returns:
            Market-aware attention output
        """
        # Standard self-attention
        attention_output, _ = self.base_attention(inputs, training=training)
        
        # Project market conditions
        volume_emb = self.volume_projection(volume)
        volatility_emb = self.volatility_projection(volatility)
        
        # Combine market conditions
        market_context = tf.concat([volume_emb, volatility_emb], axis=-1)
        
        # Calculate market-based attention weights
        market_weights = self.market_weight_layer(market_context)
        
        # Apply market weighting to attention output
        weighted_output = attention_output * market_weights
        
        # Residual connection and layer normalization
        output = self.layer_norm(inputs + weighted_output)
        
        return output
    
    def get_config(self):
        config = super().get_config()
        config.update({
            'embed_dim': self.embed_dim,
            'num_heads': self.num_heads
        })
        return config