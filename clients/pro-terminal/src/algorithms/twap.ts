//clients/pro-terminal/src/components/algorithms/twap.ts
export interface TWAPParameters {
  symbol: string;
  side: 'buy' | 'sell';
  totalQuantity: number;
  duration: number; // minutes
  sliceSize?: number;
  randomization?: boolean;
  minInterval?: number; // seconds
  maxInterval?: number; // seconds
  priceLimit?: number;
  aggressiveness: 'passive' | 'neutral' | 'aggressive';
}

export interface TWAPState {
  id: string;
  parameters: TWAPParameters;
  status: 'running' | 'paused' | 'completed' | 'cancelled';
  startTime: Date;
  endTime: Date;
  executed: number;
  remaining: number;
  averagePrice: number;
  orders: TWAPOrder[];
  performance: TWAPPerformance;
}

export interface TWAPOrder {
  id: string;
  quantity: number;
  price?: number;
  timestamp: Date;
  status: 'pending' | 'sent' | 'filled' | 'cancelled';
  fillPrice?: number;
  fillQuantity?: number;
}

export interface TWAPPerformance {
  vwap: number;
  slippage: number;
  marketImpact: number;
  timingCost: number;
  totalCost: number;
  efficiency: number;
}

export class TWAPAlgorithm {
  private state: TWAPState;
  private intervalId: NodeJS.Timeout | null = null;
  private onUpdate?: (state: TWAPState) => void;
  private orderAPI: any;

  constructor(
    parameters: TWAPParameters,
    orderAPI: any,
    onUpdate?: (state: TWAPState) => void
  ) {
    this.state = {
      id: `twap_${Date.now()}`,
      parameters,
      status: 'running',
      startTime: new Date(),
      endTime: new Date(Date.now() + parameters.duration * 60000),
      executed: 0,
      remaining: parameters.totalQuantity,
      averagePrice: 0,
      orders: [],
      performance: {
        vwap: 0,
        slippage: 0,
        marketImpact: 0,
        timingCost: 0,
        totalCost: 0,
        efficiency: 0
      }
    };
    
    this.orderAPI = orderAPI;
    this.onUpdate = onUpdate;
    this.start();
  }

  private start() {
    const intervalMs = this.calculateInterval();
    
    this.intervalId = setInterval(() => {
      if (this.state.status === 'running') {
        this.executeSlice();
      }
    }, intervalMs);

    // Initial execution
    setTimeout(() => this.executeSlice(), 1000);
  }

  private calculateInterval(): number {
    const { duration, totalQuantity, sliceSize } = this.state.parameters;
    const defaultSliceSize = sliceSize || Math.max(1, Math.floor(totalQuantity / (duration * 2)));
    const numberOfSlices = Math.ceil(totalQuantity / defaultSliceSize);
    const intervalMs = (duration * 60000) / numberOfSlices;
    
    return Math.max(5000, intervalMs); // Minimum 5 seconds between orders
  }

  private calculateSliceSize(): number {
    const { sliceSize, randomization } = this.state.parameters;
    const timeRemaining = this.state.endTime.getTime() - Date.now();
    const timeElapsed = Date.now() - this.state.startTime.getTime();
    const totalTime = this.state.parameters.duration * 60000;
    
    if (timeRemaining <= 0 || this.state.remaining <= 0) {
      return 0;
    }

    let baseSize = sliceSize || Math.max(1, Math.floor(this.state.remaining / 5));
    
    // Adjust for time remaining
    const urgencyFactor = Math.min(2, (totalTime - timeRemaining) / totalTime + 0.5);
    baseSize = Math.floor(baseSize * urgencyFactor);
    
    // Apply randomization
    if (randomization) {
      const variance = 0.2; // ±20%
      const randomFactor = 1 + (Math.random() - 0.5) * variance * 2;
      baseSize = Math.floor(baseSize * randomFactor);
    }
    
    return Math.min(baseSize, this.state.remaining);
  }

  private async executeSlice() {
    const sliceSize = this.calculateSliceSize();
    
    if (sliceSize <= 0 || this.state.remaining <= 0) {
      this.complete();
      return;
    }

    const order: TWAPOrder = {
      id: `order_${Date.now()}`,
      quantity: sliceSize,
      timestamp: new Date(),
      status: 'pending'
    };

    // Determine order price based on aggressiveness
    const price = await this.calculateOrderPrice();
    if (price && this.state.parameters.priceLimit) {
      const withinLimit = this.state.parameters.side === 'buy' 
        ? price <= this.state.parameters.priceLimit
        : price >= this.state.parameters.priceLimit;
      
      if (!withinLimit) {
        // Skip this slice if price is outside limit
        return;
      }
    }

    order.price = price;
    this.state.orders.push(order);

    try {
      // Submit order through API
      order.status = 'sent';
      const orderResult = await this.submitOrder(order);
      
      if (orderResult.success) {
        order.status = 'filled';
        order.fillPrice = orderResult.fillPrice;
        order.fillQuantity = orderResult.fillQuantity;
        
        this.state.executed += order.fillQuantity;
        this.state.remaining -= order.fillQuantity;
        
        this.updatePerformance();
      } else {
        order.status = 'cancelled';
      }
    } catch (error) {
      console.error('TWAP order execution error:', error);
      order.status = 'cancelled';
    }

    this.notifyUpdate();
    
    if (this.state.remaining <= 0) {
      this.complete();
    }
  }

  private async calculateOrderPrice(): Promise<number | undefined> {
    // Get current market data
    const marketData = await this.getMarketData();
    if (!marketData) return undefined;

    const { aggressiveness } = this.state.parameters;
    const { bid, ask, mid } = marketData;

    switch (aggressiveness) {
      case 'passive':
        return this.state.parameters.side === 'buy' ? bid : ask;
      case 'neutral':
        return mid;
      case 'aggressive':
        return this.state.parameters.side === 'buy' ? ask : bid;
      default:
        return mid;
    }
  }

  private async submitOrder(order: TWAPOrder): Promise<any> {
    return this.orderAPI.submitOrder({
      symbol: this.state.parameters.symbol,
      side: this.state.parameters.side,
      type: order.price ? 'limit' : 'market',
      quantity: order.quantity,
      price: order.price,
      timeInForce: 'IOC' // Immediate or Cancel for TWAP slices
    });
  }

  private async getMarketData(): Promise<any> {
    // Implementation would fetch real market data
    return {
      bid: 100.00,
      ask: 100.05,
      mid: 100.025,
      last: 100.02
    };
  }

  private updatePerformance() {
    const filledOrders = this.state.orders.filter(o => o.status === 'filled');
    
    if (filledOrders.length === 0) return;

    // Calculate VWAP
    const totalValue = filledOrders.reduce((sum, order) => 
      sum + (order.fillPrice! * order.fillQuantity!), 0);
    const totalQuantity = filledOrders.reduce((sum, order) => 
      sum + order.fillQuantity!, 0);
    
    this.state.averagePrice = totalValue / totalQuantity;
    this.state.performance.vwap = this.state.averagePrice;
    
    // Calculate other performance metrics
    // Implementation would include market impact, slippage, etc.
  }

  private complete() {
    this.state.status = 'completed';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyUpdate();
  }

  private notifyUpdate() {
    if (this.onUpdate) {
      this.onUpdate({ ...this.state });
    }
  }

  public pause() {
    this.state.status = 'paused';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.notifyUpdate();
  }

  public resume() {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
      this.start();
      this.notifyUpdate();
    }
  }

  public cancel() {
    this.state.status = 'cancelled';
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    // Cancel any pending orders
    this.state.orders
      .filter(o => o.status === 'pending' || o.status === 'sent')
      .forEach(order => {
        order.status = 'cancelled';
        // API call to cancel order would go here
      });
    
    this.notifyUpdate();
  }

  public getState(): TWAPState {
    return { ...this.state };
  }
}
import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store/store';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Trading from './pages/Trading';
import Portfolio from './pages/Portfolio';
import Analytics from './pages/Analytics';
import Settings from './pages/Settings';
import QuickOrderModal from './components/QuickOrderModal';
import './styles/globals.css';

declare global {
  interface Window {
    electronAPI: any;
  }
}

const App: React.FC = () => {
  const [isQuickOrderOpen, setIsQuickOrderOpen] = useState(false);
  const [quickOrderType, setQuickOrderType] = useState<'buy' | 'sell'>('buy');

  useEffect(() => {
    // Listen for quick order requests from main process
    window.electronAPI?.on('show-quick-order', (type: 'buy' | 'sell') => {
      setQuickOrderType(type);
      setIsQuickOrderOpen(true);
    });

    return () => {
      window.electronAPI?.removeAllListeners('show-quick-order');
    };
  }, []);

  return (
    <Provider store={store}>
      <Router>
        <div className="h-screen bg-slate-900 text-white overflow-hidden">
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/trading" element={<Trading />} />
              <Route path="/portfolio" element={<Portfolio />} />
              <Route path="/analytics" element={<Analytics />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>

          <QuickOrderModal
            isOpen={isQuickOrderOpen}
            onClose={() => setIsQuickOrderOpen(false)}
            type={quickOrderType}
          />
        </div>
      </Router>
    </Provider>
  );
};

export default App;