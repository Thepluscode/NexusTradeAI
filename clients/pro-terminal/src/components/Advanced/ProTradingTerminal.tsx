import React, { useState, useEffect, useCallback, useRef } from 'react';
import styled, { keyframes } from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi, ColumnApi } from 'ag-grid-community';
import 'ag-grid-enterprise';

// Professional Trading Terminal Interface
interface TerminalProps {
  userId: string;
  accountType: 'retail' | 'institutional' | 'professional';
  enableAdvancedFeatures?: boolean;
}

interface MarketDataFeed {
  symbol: string;
  bid: number;
  ask: number;
  last: number;
  volume: number;
  change: number;
  changePercent: number;
  timestamp: number;
  level2Data?: OrderBookLevel[];
}

interface OrderBookLevel {
  price: number;
  size: number;
  side: 'bid' | 'ask';
  orders: number;
}

interface TradingPosition {
  symbol: string;
  side: 'long' | 'short';
  quantity: number;
  avgPrice: number;
  currentPrice: number;
  unrealizedPnL: number;
  realizedPnL: number;
  margin: number;
  leverage: number;
}

interface AlgorithmicOrder {
  id: string;
  symbol: string;
  algorithm: 'TWAP' | 'VWAP' | 'Implementation Shortfall' | 'Market Making';
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  progress: number;
  totalQuantity: number;
  executedQuantity: number;
  avgExecutionPrice: number;
  startTime: Date;
  estimatedCompletion: Date;
}

// Styled Components for Professional Look
const TerminalContainer = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr 350px;
  grid-template-rows: 60px 1fr 200px;
  height: 100vh;
  background: #0a0a0a;
  color: #ffffff;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 12px;
  overflow: hidden;
`;

const HeaderBar = styled.div`
  grid-column: 1 / -1;
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border-bottom: 1px solid #333;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
`;

const LeftPanel = styled.div`
  background: #111;
  border-right: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const MainTradingArea = styled.div`
  background: #0f0f0f;
  display: grid;
  grid-template-rows: 1fr 300px;
  gap: 1px;
  overflow: hidden;
`;

const RightPanel = styled.div`
  background: #111;
  border-left: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const BottomPanel = styled.div`
  grid-column: 1 / -1;
  background: #111;
  border-top: 1px solid #333;
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 1px;
  overflow: hidden;
`;

const ChartContainer = styled.div`
  background: #0a0a0a;
  border: 1px solid #333;
  position: relative;
  overflow: hidden;
`;

const OrderBookContainer = styled.div`
  background: #0a0a0a;
  border: 1px solid #333;
  display: flex;
  flex-direction: column;
  overflow: hidden;
`;

const StatusIndicator = styled.div<{ status: 'connected' | 'disconnected' | 'slow' }>`
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: ${props =>
    props.status === 'connected' ? '#00ff88' :
    props.status === 'slow' ? '#ffaa00' : '#ff4444'
  };
  animation: ${props => props.status === 'connected' ? 'pulse 2s infinite' : 'none'};

  @keyframes pulse {
    0% { opacity: 1; }
    50% { opacity: 0.5; }
    100% { opacity: 1; }
  }
`;

const MetricCard = styled(motion.div)`
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 1px solid #333;
  border-radius: 4px;
  padding: 12px;
  margin: 4px;
`;

const OrderBookRow = styled.div<{ side: 'bid' | 'ask' }>`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 2px 8px;
  font-size: 11px;
  background: ${props => props.side === 'bid' ?
    'linear-gradient(90deg, transparent 0%, rgba(0, 255, 136, 0.1) 100%)' :
    'linear-gradient(90deg, transparent 0%, rgba(255, 68, 68, 0.1) 100%)'
  };
  color: ${props => props.side === 'bid' ? '#00ff88' : '#ff4444'};

  &:hover {
    background: ${props => props.side === 'bid' ?
      'rgba(0, 255, 136, 0.2)' : 'rgba(255, 68, 68, 0.2)'
    };
  }
`;

const AlgorithmCard = styled(motion.div)<{ status: string }>`
  background: linear-gradient(135deg, #1a1a1a 0%, #2a2a2a 100%);
  border: 1px solid ${props =>
    props.status === 'active' ? '#00ff88' :
    props.status === 'paused' ? '#ffaa00' :
    props.status === 'completed' ? '#4488ff' : '#ff4444'
  };
  border-radius: 4px;
  padding: 12px;
  margin: 4px 0;
`;

const ProTradingTerminal: React.FC<TerminalProps> = ({
  userId,
  accountType,
  enableAdvancedFeatures = true
}) => {
  const [connectionStatus, setConnectionStatus] = useState<'connected' | 'disconnected' | 'slow'>('connected');
  const [selectedSymbol, setSelectedSymbol] = useState<string>('AAPL');
  const [marketData, setMarketData] = useState<Map<string, MarketDataFeed>>(new Map());
  const [positions, setPositions] = useState<TradingPosition[]>([]);
  const [algorithmicOrders, setAlgorithmicOrders] = useState<AlgorithmicOrder[]>([]);
  const [orderBookData, setOrderBookData] = useState<OrderBookLevel[]>([]);

  const gridApiRef = useRef<GridApi | null>(null);
  const chartContainerRef = useRef<HTMLDivElement>(null);

  // Mock data initialization
  useEffect(() => {
    // Initialize with sample data
    const sampleMarketData = new Map([
      ['AAPL', {
        symbol: 'AAPL',
        bid: 175.82,
        ask: 175.84,
        last: 175.83,
        volume: 52840000,
        change: 2.45,
        changePercent: 1.41,
        timestamp: Date.now()
      }],
      ['TSLA', {
        symbol: 'TSLA',
        bid: 238.43,
        ask: 238.45,
        last: 238.44,
        volume: 87500000,
        change: -5.23,
        changePercent: -2.15,
        timestamp: Date.now()
      }],
      ['BTC/USD', {
        symbol: 'BTC/USD',
        bid: 43248.50,
        ask: 43250.00,
        last: 43249.25,
        volume: 28500000,
        change: -1205.50,
        changePercent: -2.71,
        timestamp: Date.now()
      }]
    ]);

    setMarketData(sampleMarketData);

    // Sample positions
    setPositions([
      {
        symbol: 'AAPL',
        side: 'long',
        quantity: 1000,
        avgPrice: 165.20,
        currentPrice: 175.83,
        unrealizedPnL: 10630,
        realizedPnL: 2450,
        margin: 33040,
        leverage: 5.0
      },
      {
        symbol: 'TSLA',
        side: 'short',
        quantity: 500,
        avgPrice: 245.60,
        currentPrice: 238.44,
        unrealizedPnL: 3580,
        realizedPnL: -1200,
        margin: 47688,
        leverage: 2.5
      }
    ]);

    // Sample algorithmic orders
    setAlgorithmicOrders([
      {
        id: 'TWAP_001',
        symbol: 'AAPL',
        algorithm: 'TWAP',
        status: 'active',
        progress: 65,
        totalQuantity: 10000,
        executedQuantity: 6500,
        avgExecutionPrice: 174.25,
        startTime: new Date(Date.now() - 3600000),
        estimatedCompletion: new Date(Date.now() + 1800000)
      },
      {
        id: 'VWAP_002',
        symbol: 'TSLA',
        algorithm: 'VWAP',
        status: 'paused',
        progress: 30,
        totalQuantity: 5000,
        executedQuantity: 1500,
        avgExecutionPrice: 240.15,
        startTime: new Date(Date.now() - 1800000),
        estimatedCompletion: new Date(Date.now() + 3600000)
      }
    ]);

    // Sample order book data
    setOrderBookData([
      // Asks (sells)
      { price: 175.88, size: 1300, side: 'ask', orders: 8 },
      { price: 175.87, size: 700, side: 'ask', orders: 5 },
      { price: 175.86, size: 1100, side: 'ask', orders: 7 },
      { price: 175.85, size: 800, side: 'ask', orders: 6 },
      { price: 175.84, size: 600, side: 'ask', orders: 4 },
      // Bids (buys)
      { price: 175.83, size: 500, side: 'bid', orders: 3 },
      { price: 175.82, size: 750, side: 'bid', orders: 5 },
      { price: 175.81, size: 1200, side: 'bid', orders: 8 },
      { price: 175.80, size: 900, side: 'bid', orders: 6 },
      { price: 175.79, size: 1500, side: 'bid', orders: 9 }
    ]);
  }, []);

  // Real-time data simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setMarketData(prevData => {
        const newData = new Map(prevData);
        newData.forEach((data, symbol) => {
          const volatility = symbol === 'BTC/USD' ? 0.002 : 0.001;
          const change = (Math.random() - 0.5) * volatility;
          const newPrice = data.last * (1 + change);

          newData.set(symbol, {
            ...data,
            last: newPrice,
            bid: newPrice - 0.01,
            ask: newPrice + 0.01,
            change: newPrice - (data.last - data.change),
            changePercent: ((newPrice - (data.last - data.change)) / (data.last - data.change)) * 100,
            timestamp: Date.now()
          });
        });
        return newData;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercentage = (value: number): string => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const renderOrderBook = () => {
    const asks = orderBookData.filter(level => level.side === 'ask').reverse();
    const bids = orderBookData.filter(level => level.side === 'bid');

    return (
      <OrderBookContainer>
        <div style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '11px', fontWeight: 'bold' }}>
          ORDER BOOK - {selectedSymbol}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', padding: '4px 8px', fontSize: '10px', color: '#888', borderBottom: '1px solid #333' }}>
          <span>PRICE</span>
          <span>SIZE</span>
          <span>ORDERS</span>
        </div>

        {/* Asks */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {asks.map((level, index) => (
            <OrderBookRow key={`ask-${index}`} side="ask">
              <span>{level.price.toFixed(2)}</span>
              <span>{level.size.toLocaleString()}</span>
              <span>{level.orders}</span>
            </OrderBookRow>
          ))}
        </div>

        {/* Spread */}
        <div style={{ padding: '4px 8px', background: '#222', borderTop: '1px solid #333', borderBottom: '1px solid #333', fontSize: '10px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>SPREAD:</span>
            <span style={{ color: '#ffaa00' }}>
              {asks.length > 0 && bids.length > 0 ? (asks[asks.length - 1].price - bids[0].price).toFixed(2) : '0.00'}
            </span>
          </div>
        </div>

        {/* Bids */}
        <div style={{ flex: 1, overflow: 'auto' }}>
          {bids.map((level, index) => (
            <OrderBookRow key={`bid-${index}`} side="bid">
              <span>{level.price.toFixed(2)}</span>
              <span>{level.size.toLocaleString()}</span>
              <span>{level.orders}</span>
            </OrderBookRow>
          ))}
        </div>
      </OrderBookContainer>
    );
  };

  const renderAlgorithmicOrders = () => (
    <div style={{ padding: '8px', overflow: 'auto' }}>
      <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888' }}>
        ALGORITHMIC ORDERS
      </div>
      {algorithmicOrders.map((order) => (
        <AlgorithmCard
          key={order.id}
          status={order.status}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          whileHover={{ scale: 1.02 }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <div>
              <div style={{ fontWeight: 'bold', fontSize: '12px' }}>{order.symbol}</div>
              <div style={{ fontSize: '10px', color: '#888' }}>{order.algorithm}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '10px', color: order.status === 'active' ? '#00ff88' : '#ffaa00' }}>
                {order.status.toUpperCase()}
              </div>
              <div style={{ fontSize: '10px', color: '#888' }}>{order.progress}%</div>
            </div>
          </div>

          <div style={{ marginBottom: '8px' }}>
            <div style={{ width: '100%', height: '4px', background: '#333', borderRadius: '2px' }}>
              <div
                style={{
                  width: `${order.progress}%`,
                  height: '100%',
                  background: order.status === 'active' ? '#00ff88' : '#ffaa00',
                  borderRadius: '2px',
                  transition: 'width 0.3s ease'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '10px' }}>
            <div>
              <div style={{ color: '#888' }}>Executed:</div>
              <div>{order.executedQuantity.toLocaleString()}/{order.totalQuantity.toLocaleString()}</div>
            </div>
            <div>
              <div style={{ color: '#888' }}>Avg Price:</div>
              <div>{formatCurrency(order.avgExecutionPrice)}</div>
            </div>
          </div>
        </AlgorithmCard>
      ))}
    </div>
  );

  return (
    <TerminalContainer>
      {/* Header */}
      <HeaderBar>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#00ff88' }}>
            NEXUS TRADE AI PRO
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <StatusIndicator status={connectionStatus} />
            <span style={{ fontSize: '10px', color: '#888' }}>
              {connectionStatus.toUpperCase()}
            </span>
          </div>
          <div style={{ fontSize: '10px', color: '#888' }}>
            User: {userId} | Account: {accountType.toUpperCase()}
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '10px', color: '#888' }}>
            {new Date().toLocaleTimeString()}
          </div>
          <div style={{ fontSize: '10px', color: '#00ff88' }}>
            MARKET OPEN
          </div>
        </div>
      </HeaderBar>

      {/* Left Panel - Watchlist & Positions */}
      <LeftPanel>
        <div style={{ padding: '8px', borderBottom: '1px solid #333', fontSize: '11px', fontWeight: 'bold', color: '#888' }}>
          WATCHLIST
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {Array.from(marketData.entries()).map(([symbol, data]) => (
            <motion.div
              key={symbol}
              whileHover={{ backgroundColor: '#222' }}
              onClick={() => setSelectedSymbol(symbol)}
              style={{
                padding: '8px',
                borderBottom: '1px solid #333',
                cursor: 'pointer',
                backgroundColor: selectedSymbol === symbol ? '#333' : 'transparent'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{symbol}</span>
                <span style={{ fontSize: '11px' }}>{formatCurrency(data.last)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ color: data.changePercent >= 0 ? '#00ff88' : '#ff4444' }}>
                  {formatPercentage(data.changePercent)}
                </span>
                <span style={{ color: '#888' }}>
                  Vol: {(data.volume / 1000000).toFixed(1)}M
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        <div style={{ padding: '8px', borderTop: '1px solid #333', borderBottom: '1px solid #333', fontSize: '11px', fontWeight: 'bold', color: '#888' }}>
          POSITIONS
        </div>
        <div style={{ flex: 1, overflow: 'auto' }}>
          {positions.map((position, index) => (
            <motion.div
              key={`${position.symbol}-${index}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              style={{
                padding: '8px',
                borderBottom: '1px solid #333'
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontWeight: 'bold', fontSize: '11px' }}>{position.symbol}</span>
                <span style={{
                  fontSize: '10px',
                  color: position.side === 'long' ? '#00ff88' : '#ff4444',
                  fontWeight: 'bold'
                }}>
                  {position.side.toUpperCase()}
                </span>
              </div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>
                Qty: {position.quantity.toLocaleString()} | Avg: {formatCurrency(position.avgPrice)}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px' }}>
                <span style={{ color: '#888' }}>P&L:</span>
                <span style={{
                  color: position.unrealizedPnL >= 0 ? '#00ff88' : '#ff4444',
                  fontWeight: 'bold'
                }}>
                  {formatCurrency(position.unrealizedPnL)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </LeftPanel>

      {/* Main Trading Area */}
      <MainTradingArea>
        {/* Chart Area */}
        <ChartContainer ref={chartContainerRef}>
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            textAlign: 'center',
            color: '#888'
          }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📈</div>
            <div style={{ fontSize: '14px', fontWeight: 'bold' }}>ADVANCED CHARTING</div>
            <div style={{ fontSize: '12px' }}>{selectedSymbol} - Professional Charts</div>
            <div style={{ fontSize: '10px', marginTop: '8px' }}>
              TradingView Integration • Level II Data • Custom Indicators
            </div>
          </div>
        </ChartContainer>

        {/* Order Entry Area */}
        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '16px', color: '#888' }}>
            ORDER ENTRY - {selectedSymbol}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: '16px' }}>
            <div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>ORDER TYPE</div>
              <select style={{
                width: '100%',
                background: '#222',
                border: '1px solid #444',
                color: '#fff',
                padding: '4px',
                fontSize: '11px'
              }}>
                <option>Market</option>
                <option>Limit</option>
                <option>Stop</option>
                <option>Stop Limit</option>
              </select>
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>QUANTITY</div>
              <input
                type="number"
                placeholder="0"
                style={{
                  width: '100%',
                  background: '#222',
                  border: '1px solid #444',
                  color: '#fff',
                  padding: '4px',
                  fontSize: '11px'
                }}
              />
            </div>

            <div>
              <div style={{ fontSize: '10px', color: '#888', marginBottom: '4px' }}>PRICE</div>
              <input
                type="number"
                placeholder={marketData.get(selectedSymbol)?.last.toFixed(2) || '0.00'}
                style={{
                  width: '100%',
                  background: '#222',
                  border: '1px solid #444',
                  color: '#fff',
                  padding: '4px',
                  fontSize: '11px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button style={{
                flex: 1,
                background: 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
                border: 'none',
                color: '#000',
                padding: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '2px'
              }}>
                BUY
              </button>
              <button style={{
                flex: 1,
                background: 'linear-gradient(135deg, #ff4444 0%, #cc2222 100%)',
                border: 'none',
                color: '#fff',
                padding: '8px',
                fontSize: '11px',
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: '2px'
              }}>
                SELL
              </button>
            </div>
          </div>
        </div>
      </MainTradingArea>

      {/* Right Panel - Order Book */}
      <RightPanel>
        {renderOrderBook()}
        {renderAlgorithmicOrders()}
      </RightPanel>

      {/* Bottom Panel - Orders, Fills, Algorithms */}
      <BottomPanel>
        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888' }}>
            OPEN ORDERS
          </div>
          <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '40px' }}>
            No open orders
          </div>
        </div>

        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888' }}>
            RECENT FILLS
          </div>
          <div style={{ fontSize: '10px', color: '#888', textAlign: 'center', marginTop: '40px' }}>
            No recent fills
          </div>
        </div>

        <div style={{ background: '#0a0a0a', border: '1px solid #333', padding: '8px' }}>
          <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#888' }}>
            SYSTEM STATUS
          </div>
          <div style={{ fontSize: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#888' }}>Market Data:</span>
              <span style={{ color: '#00ff88' }}>CONNECTED</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#888' }}>Order Gateway:</span>
              <span style={{ color: '#00ff88' }}>ACTIVE</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
              <span style={{ color: '#888' }}>Latency:</span>
              <span style={{ color: '#00ff88' }}>2.3ms</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: '#888' }}>Throughput:</span>
              <span style={{ color: '#00ff88' }}>1.2M/s</span>
            </div>
          </div>
        </div>
      </BottomPanel>
    </TerminalContainer>
  );
};

export default ProTradingTerminal;