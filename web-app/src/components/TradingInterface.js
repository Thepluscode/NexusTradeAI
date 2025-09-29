import React, { useState, useEffect } from 'react';
import '../styles/TradingInterface.css';

const TradingInterface = () => {
  const [selectedSymbol, setSelectedSymbol] = useState('AAPL');
  const [orderType, setOrderType] = useState('MARKET');
  const [side, setSide] = useState('BUY');
  const [quantity, setQuantity] = useState('');
  const [limitPrice, setLimitPrice] = useState('');
  const [marketPrices, setMarketPrices] = useState({});
  const [orders, setOrders] = useState([]);
  const [positions, setPositions] = useState([]);
  const [account, setAccount] = useState({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'NVDA', 'META', 'NFLX'];

  // Fetch market data
  useEffect(() => {
    fetchMarketPrices();
    fetchAccount();
    fetchPositions();
    fetchOrders();
    
    // Set up real-time updates
    const interval = setInterval(() => {
      fetchMarketPrices();
      fetchAccount();
      fetchPositions();
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const fetchMarketPrices = async () => {
    try {
      const response = await fetch('http://localhost:3002/market-prices');
      const data = await response.json();
      setMarketPrices(data.prices);
    } catch (error) {
      console.error('Error fetching market prices:', error);
    }
  };

  const fetchAccount = async () => {
    try {
      const response = await fetch('http://localhost:3002/account');
      const data = await response.json();
      setAccount(data);
    } catch (error) {
      console.error('Error fetching account:', error);
    }
  };

  const fetchPositions = async () => {
    try {
      const response = await fetch('http://localhost:3002/positions');
      const data = await response.json();
      setPositions(data.positions);
    } catch (error) {
      console.error('Error fetching positions:', error);
    }
  };

  const fetchOrders = async () => {
    try {
      const response = await fetch('http://localhost:3002/orders');
      const data = await response.json();
      setOrders(data.orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
    }
  };

  const placeOrder = async () => {
    if (!quantity || quantity <= 0) {
      setMessage('Please enter a valid quantity');
      return;
    }

    if (orderType === 'LIMIT' && (!limitPrice || limitPrice <= 0)) {
      setMessage('Please enter a valid limit price');
      return;
    }

    setLoading(true);
    setMessage('');

    const orderData = {
      symbol: selectedSymbol,
      side: side,
      quantity: parseInt(quantity),
      orderType: orderType,
      ...(orderType === 'LIMIT' && { limitPrice: parseFloat(limitPrice) })
    };

    try {
      const response = await fetch('http://localhost:3002/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderData),
      });

      const data = await response.json();

      if (response.ok) {
        setMessage(`✅ Order ${data.order.status.toLowerCase()}: ${side} ${quantity} ${selectedSymbol}`);
        setQuantity('');
        setLimitPrice('');
        fetchOrders();
        fetchPositions();
        fetchAccount();
      } else {
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const cancelOrder = async (orderId) => {
    try {
      const response = await fetch(`http://localhost:3002/orders/${orderId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setMessage('✅ Order cancelled successfully');
        fetchOrders();
      } else {
        const data = await response.json();
        setMessage(`❌ Error: ${data.error}`);
      }
    } catch (error) {
      setMessage(`❌ Error: ${error.message}`);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatPercent = (percent) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  return (
    <div className="trading-interface">
      <div className="trading-header">
        <h2>🚀 Execute Trade Orders</h2>
        <div className="account-summary">
          <div className="account-item">
            <span>Portfolio Value:</span>
            <span className="value">{formatCurrency(account.totalPortfolioValue || 0)}</span>
          </div>
          <div className="account-item">
            <span>Buying Power:</span>
            <span className="value">{formatCurrency(account.buyingPower || 0)}</span>
          </div>
        </div>
      </div>

      <div className="trading-content">
        <div className="order-form">
          <h3>Place Order</h3>
          
          <div className="form-group">
            <label>Symbol</label>
            <select 
              value={selectedSymbol} 
              onChange={(e) => setSelectedSymbol(e.target.value)}
            >
              {symbols.map(symbol => (
                <option key={symbol} value={symbol}>
                  {symbol} - {formatCurrency(marketPrices[symbol] || 0)}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Side</label>
              <select value={side} onChange={(e) => setSide(e.target.value)}>
                <option value="BUY">BUY</option>
                <option value="SELL">SELL</option>
              </select>
            </div>

            <div className="form-group">
              <label>Order Type</label>
              <select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                <option value="MARKET">MARKET</option>
                <option value="LIMIT">LIMIT</option>
              </select>
            </div>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label>Quantity</label>
              <input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Enter shares"
                min="1"
              />
            </div>

            {orderType === 'LIMIT' && (
              <div className="form-group">
                <label>Limit Price</label>
                <input
                  type="number"
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  placeholder="Enter price"
                  step="0.01"
                  min="0.01"
                />
              </div>
            )}
          </div>

          <div className="order-preview">
            <div className="preview-item">
              <span>Estimated Value:</span>
              <span>
                {formatCurrency(
                  (quantity || 0) * 
                  (orderType === 'LIMIT' ? (limitPrice || 0) : (marketPrices[selectedSymbol] || 0))
                )}
              </span>
            </div>
          </div>

          <button 
            className={`place-order-btn ${side.toLowerCase()}`}
            onClick={placeOrder}
            disabled={loading}
          >
            {loading ? 'Placing Order...' : `${side} ${selectedSymbol}`}
          </button>

          {message && (
            <div className={`message ${message.includes('✅') ? 'success' : 'error'}`}>
              {message}
            </div>
          )}
        </div>

        <div className="positions-orders">
          <div className="positions-section">
            <h3>Current Positions</h3>
            <div className="positions-list">
              {positions.map((position, index) => (
                <div key={index} className="position-item">
                  <div className="position-symbol">{position.symbol}</div>
                  <div className="position-details">
                    <span>{position.shares} shares</span>
                    <span>Avg: {formatCurrency(position.avgPrice)}</span>
                    <span>Current: {formatCurrency(position.currentPrice)}</span>
                    <span className={position.unrealizedPnL >= 0 ? 'profit' : 'loss'}>
                      {formatCurrency(position.unrealizedPnL)} ({formatPercent(position.unrealizedPnLPercent)})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="orders-section">
            <h3>Recent Orders</h3>
            <div className="orders-list">
              {orders.slice(-5).reverse().map((order) => (
                <div key={order.orderId} className="order-item">
                  <div className="order-header">
                    <span className={`order-side ${order.side.toLowerCase()}`}>
                      {order.side}
                    </span>
                    <span className="order-symbol">{order.symbol}</span>
                    <span className={`order-status ${order.status.toLowerCase()}`}>
                      {order.status}
                    </span>
                  </div>
                  <div className="order-details">
                    <span>{order.quantity} shares</span>
                    <span>{order.orderType}</span>
                    {order.executionPrice && (
                      <span>@ {formatCurrency(order.executionPrice)}</span>
                    )}
                    {order.status === 'PENDING' && (
                      <button 
                        className="cancel-btn"
                        onClick={() => cancelOrder(order.orderId)}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TradingInterface;
