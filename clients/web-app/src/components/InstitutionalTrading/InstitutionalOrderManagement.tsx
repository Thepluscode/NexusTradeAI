import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppSelector, useAppDispatch } from '@/store/hooks';
import {
  ClockIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationTriangleIcon,
  ArrowPathIcon,
  BoltIcon,
  ChartBarIcon,
  CogIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline';

interface InstitutionalOrder {
  id: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  orderType: 'MARKET' | 'LIMIT' | 'STOP' | 'ICEBERG' | 'TWAP' | 'VWAP' | 'IMPLEMENTATION_SHORTFALL';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'DAY' | 'GTC' | 'IOC' | 'FOK';
  status: 'PENDING' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';
  filledQuantity: number;
  avgFillPrice: number;
  timestamp: Date;
  estimatedCompletion?: Date;
  slippageOptimization: boolean;
  darkPool: boolean;
  smartRouting: boolean;
  executionStrategy?: string;
  riskScore: number;
  complianceStatus: 'APPROVED' | 'PENDING' | 'REJECTED';
}

interface ExecutionMetrics {
  totalOrders: number;
  fillRate: number;
  avgSlippage: number;
  avgExecutionTime: number;
  costSavings: number;
  marketImpact: number;
}

interface SmartRoutingConfig {
  enableDarkPools: boolean;
  enableSmartRouting: boolean;
  slippageOptimization: boolean;
  maxMarketImpact: number;
  preferredVenues: string[];
  executionStrategy: 'AGGRESSIVE' | 'PASSIVE' | 'BALANCED';
}

interface InstitutionalOrderManagementProps {
  userId: string;
  accountType: 'institutional' | 'professional';
}

const InstitutionalOrderManagement: React.FC<InstitutionalOrderManagementProps> = ({
  userId,
  accountType
}) => {
  const dispatch = useAppDispatch();
  const { portfolio } = useAppSelector((state) => state.portfolio);
  
  const [orders, setOrders] = useState<InstitutionalOrder[]>([]);
  const [executionMetrics, setExecutionMetrics] = useState<ExecutionMetrics | null>(null);
  const [smartRoutingConfig, setSmartRoutingConfig] = useState<SmartRoutingConfig>({
    enableDarkPools: true,
    enableSmartRouting: true,
    slippageOptimization: true,
    maxMarketImpact: 0.005,
    preferredVenues: ['NYSE', 'NASDAQ', 'BATS', 'IEX'],
    executionStrategy: 'BALANCED'
  });
  
  const [selectedOrder, setSelectedOrder] = useState<InstitutionalOrder | null>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [newOrder, setNewOrder] = useState({
    symbol: '',
    side: 'BUY' as 'BUY' | 'SELL',
    orderType: 'LIMIT' as any,
    quantity: '',
    price: '',
    timeInForce: 'DAY' as any,
    darkPool: false,
    slippageOptimization: true
  });

  // Load orders and metrics
  const loadOrdersAndMetrics = useCallback(async () => {
    try {
      const [ordersResponse, metricsResponse] = await Promise.all([
        fetch(`/api/orders/institutional/${userId}`),
        fetch(`/api/orders/execution-metrics/${userId}`)
      ]);
      
      const ordersData = await ordersResponse.json();
      const metricsData = await metricsResponse.json();

      setOrders(ordersData.data?.orders || []);
      setExecutionMetrics(metricsData.data?.metrics || null);
      
    } catch (error) {
      console.error('Failed to load orders and metrics:', error);
    }
  }, [userId]);

  // Place institutional order
  const placeOrder = useCallback(async () => {
    try {
      const response = await fetch('/api/orders/institutional', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...newOrder,
          userId,
          accountType,
          smartRoutingConfig,
          quantity: parseFloat(newOrder.quantity),
          price: newOrder.price ? parseFloat(newOrder.price) : undefined
        })
      });

      const result = await response.json();
      
      if (result.success) {
        setOrders(prev => [result.order, ...prev]);
        setShowOrderForm(false);
        setNewOrder({
          symbol: '',
          side: 'BUY',
          orderType: 'LIMIT',
          quantity: '',
          price: '',
          timeInForce: 'DAY',
          darkPool: false,
          slippageOptimization: true
        });
      }
      
    } catch (error) {
      console.error('Order placement failed:', error);
    }
  }, [newOrder, userId, accountType, smartRoutingConfig]);

  // Cancel order
  const cancelOrder = useCallback(async (orderId: string) => {
    try {
      const response = await fetch(`/api/orders/${orderId}/cancel`, {
        method: 'POST'
      });

      if (response.ok) {
        setOrders(prev => prev.map(order => 
          order.id === orderId 
            ? { ...order, status: 'CANCELLED' as const }
            : order
        ));
      }
      
    } catch (error) {
      console.error('Order cancellation failed:', error);
    }
  }, []);

  // Real-time updates
  useEffect(() => {
    loadOrdersAndMetrics();
    const interval = setInterval(loadOrdersAndMetrics, 2000);
    return () => clearInterval(interval);
  }, [loadOrdersAndMetrics]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'FILLED': return 'text-green-600 bg-green-100 dark:bg-green-900/30';
      case 'PARTIALLY_FILLED': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/30';
      case 'PENDING': return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30';
      case 'CANCELLED': return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
      case 'REJECTED': return 'text-red-600 bg-red-100 dark:bg-red-900/30';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-900/30';
    }
  };

  const getComplianceColor = (status: string) => {
    switch (status) {
      case 'APPROVED': return 'text-green-600';
      case 'PENDING': return 'text-yellow-600';
      case 'REJECTED': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center">
            <ChartBarIcon className="h-6 w-6 mr-3 text-blue-500" />
            Institutional Order Management
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Advanced order execution with smart routing and slippage optimization
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <button
            onClick={() => setShowOrderForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
          >
            <BoltIcon className="h-4 w-4" />
            <span>New Order</span>
          </button>
        </div>
      </div>

      {/* Execution Metrics */}
      {executionMetrics && (
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Execution Performance
          </h3>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {executionMetrics?.totalOrders || 0}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Total Orders</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {executionMetrics?.fillRate ? (executionMetrics.fillRate * 100).toFixed(1) + '%' : 'N/A'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Fill Rate</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                {executionMetrics?.avgSlippage ? (executionMetrics.avgSlippage * 100).toFixed(3) + '%' : 'N/A'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Avg Slippage</div>
            </div>

            <div className="text-center">
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                {executionMetrics?.avgExecutionTime ? executionMetrics.avgExecutionTime.toFixed(1) + 's' : 'N/A'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Avg Execution</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {executionMetrics?.costSavings ? formatCurrency(executionMetrics.costSavings) : 'N/A'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Cost Savings</div>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                {executionMetrics?.marketImpact ? (executionMetrics.marketImpact * 100).toFixed(3) + '%' : 'N/A'}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">Market Impact</div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Smart Routing Configuration */}
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
          <CogIcon className="h-5 w-5 mr-2 text-gray-500" />
          Smart Routing Configuration
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={smartRoutingConfig.enableDarkPools}
              onChange={(e) => setSmartRoutingConfig(prev => ({
                ...prev,
                enableDarkPools: e.target.checked
              }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Dark Pools
            </label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={smartRoutingConfig.enableSmartRouting}
              onChange={(e) => setSmartRoutingConfig(prev => ({
                ...prev,
                enableSmartRouting: e.target.checked
              }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Smart Routing
            </label>
          </div>
          
          <div className="flex items-center space-x-3">
            <input
              type="checkbox"
              checked={smartRoutingConfig.slippageOptimization}
              onChange={(e) => setSmartRoutingConfig(prev => ({
                ...prev,
                slippageOptimization: e.target.checked
              }))}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Slippage Optimization
            </label>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Execution Strategy
            </label>
            <select
              value={smartRoutingConfig.executionStrategy}
              onChange={(e) => setSmartRoutingConfig(prev => ({
                ...prev,
                executionStrategy: e.target.value as any
              }))}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
            >
              <option value="AGGRESSIVE">Aggressive</option>
              <option value="BALANCED">Balanced</option>
              <option value="PASSIVE">Passive</option>
            </select>
          </div>
        </div>
      </motion.div>

      {/* Orders Table */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Active Orders ({orders?.length || 0})
          </h3>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Order Details
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Execution
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Risk & Compliance
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              {orders?.map((order) => (
                <motion.tr
                  key={order.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900 dark:text-white">
                        {order.symbol} - {order.side}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {order.orderType} | {(order.quantity || 0).toLocaleString()} shares
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(order.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900 dark:text-white">
                        Filled: {(order.filledQuantity || 0).toLocaleString()} / {(order.quantity || 0).toLocaleString()}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        Avg Price: {order.avgFillPrice ? formatCurrency(order.avgFillPrice) : 'N/A'}
                      </div>
                      <div className="flex items-center space-x-2 mt-1">
                        {order.darkPool && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">
                            Dark Pool
                          </span>
                        )}
                        {order.slippageOptimization && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
                            Optimized
                          </span>
                        )}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(order.status)}`}>
                      {order.status.replace('_', ' ')}
                    </span>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-900 dark:text-white">
                          Risk Score: {order.riskScore ? order.riskScore.toFixed(1) : 'N/A'}
                        </span>
                        <ShieldCheckIcon className={`h-4 w-4 ${getComplianceColor(order.complianceStatus)}`} />
                      </div>
                      <div className={`text-xs ${getComplianceColor(order.complianceStatus)}`}>
                        {order.complianceStatus}
                      </div>
                    </div>
                  </td>
                  
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex items-center space-x-2">
                      {order.status === 'PENDING' && (
                        <button
                          onClick={() => cancelOrder(order.id)}
                          className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                      >
                        Details
                      </button>
                    </div>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Order Form Modal */}
      <AnimatePresence>
        {showOrderForm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
            onClick={() => setShowOrderForm(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white dark:bg-gray-800 rounded-xl p-6 w-full max-w-md mx-4"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Place Institutional Order
              </h3>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Symbol
                    </label>
                    <input
                      type="text"
                      value={newOrder.symbol}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, symbol: e.target.value.toUpperCase() }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="AAPL"
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Side
                    </label>
                    <select
                      value={newOrder.side}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, side: e.target.value as any }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                    >
                      <option value="BUY">BUY</option>
                      <option value="SELL">SELL</option>
                    </select>
                  </div>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Order Type
                  </label>
                  <select
                    value={newOrder.orderType}
                    onChange={(e) => setNewOrder(prev => ({ ...prev, orderType: e.target.value as any }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="MARKET">Market</option>
                    <option value="LIMIT">Limit</option>
                    <option value="TWAP">TWAP</option>
                    <option value="VWAP">VWAP</option>
                    <option value="ICEBERG">Iceberg</option>
                    <option value="IMPLEMENTATION_SHORTFALL">Implementation Shortfall</option>
                  </select>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      value={newOrder.quantity}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, quantity: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                      placeholder="1000"
                    />
                  </div>
                  
                  {newOrder.orderType === 'LIMIT' && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Price
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={newOrder.price}
                        onChange={(e) => setNewOrder(prev => ({ ...prev, price: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                        placeholder="150.00"
                      />
                    </div>
                  )}
                </div>
                
                <div className="flex items-center space-x-4">
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newOrder.darkPool}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, darkPool: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Dark Pool</span>
                  </label>
                  
                  <label className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      checked={newOrder.slippageOptimization}
                      onChange={(e) => setNewOrder(prev => ({ ...prev, slippageOptimization: e.target.checked }))}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">Optimize Slippage</span>
                  </label>
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowOrderForm(false)}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  onClick={placeOrder}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
                >
                  Place Order
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default InstitutionalOrderManagement;
