import { useCallback, useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  Order,
  Position,
  Balance,
  Trade,
  addOrder,
  updateOrder,
  removeOrder,
  updatePosition,
  removePosition,
  updateBalance,
  updateMultipleBalances,
  addTrade,
  updateOrderForm,
  resetOrderForm,
  setSelectedOrderType,
  setSelectedTimeInForce,
  setPlacingOrder,
  setCancellingOrder,
  setLoadingBalances,
  setLoadingPositions,
  setOrderError,
  setBalanceError,
  setPositionError,
  clearErrors,
  selectTrading,
  selectOrders,
  selectOpenOrders,
  selectOrderHistory,
  selectPositions,
  selectBalances,
  selectTotalBalance,
  selectOrderForm,
} from '@/store/slices/tradingSlice';
import { tradingService } from '@/services/trading';

interface PlaceOrderParams {
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: 'GTC' | 'IOC' | 'FOK';
}

interface ModifyOrderParams {
  orderId: string;
  quantity?: number;
  price?: number;
  stopPrice?: number;
}

export const useTrading = () => {
  const dispatch = useDispatch();
  const { token } = useSelector((state: RootState) => state.auth);

  // Selectors
  const trading = useSelector(selectTrading);
  const orders = useSelector(selectOrders);
  const openOrders = useSelector(selectOpenOrders);
  const orderHistory = useSelector(selectOrderHistory);
  const positions = useSelector(selectPositions);
  const balances = useSelector(selectBalances);
  const totalBalance = useSelector(selectTotalBalance);
  const orderForm = useSelector(selectOrderForm);

  // Order Management
  const placeOrder = useCallback(async (params: PlaceOrderParams): Promise<Order | null> => {
    if (!token) {
      dispatch(setOrderError('Authentication required'));
      return null;
    }

    try {
      dispatch(setPlacingOrder(true));
      dispatch(clearErrors());

      const order = await tradingService.placeOrder(params, token);
      dispatch(addOrder(order));

      // Reset form after successful order
      dispatch(resetOrderForm());

      return order;
    } catch (error: any) {
      dispatch(setOrderError(error.message || 'Failed to place order'));
      return null;
    } finally {
      dispatch(setPlacingOrder(false));
    }
  }, [token, dispatch]);

  const cancelOrder = useCallback(async (orderId: string): Promise<boolean> => {
    if (!token) {
      dispatch(setOrderError('Authentication required'));
      return false;
    }

    try {
      dispatch(setCancellingOrder(true));
      dispatch(clearErrors());

      await tradingService.cancelOrder(orderId, token);
      dispatch(updateOrder({ id: orderId, status: 'cancelled' }));

      return true;
    } catch (error: any) {
      dispatch(setOrderError(error.message || 'Failed to cancel order'));
      return false;
    } finally {
      dispatch(setCancellingOrder(false));
    }
  }, [token, dispatch]);

  const modifyOrder = useCallback(async (params: ModifyOrderParams): Promise<boolean> => {
    if (!token) {
      dispatch(setOrderError('Authentication required'));
      return false;
    }

    try {
      dispatch(setPlacingOrder(true));
      dispatch(clearErrors());

      const updatedOrder = await tradingService.modifyOrder(params, token);
      dispatch(updateOrder(updatedOrder));

      return true;
    } catch (error: any) {
      dispatch(setOrderError(error.message || 'Failed to modify order'));
      return false;
    } finally {
      dispatch(setPlacingOrder(false));
    }
  }, [token, dispatch]);

  const cancelAllOrders = useCallback(async (symbol?: string): Promise<boolean> => {
    if (!token) {
      dispatch(setOrderError('Authentication required'));
      return false;
    }

    try {
      dispatch(setCancellingOrder(true));
      dispatch(clearErrors());

      await tradingService.cancelAllOrders(symbol, token);

      // Update all open orders to cancelled
      openOrders.forEach(order => {
        if (order && (!symbol || order.symbol === symbol)) {
          dispatch(updateOrder({ id: order.id, status: 'cancelled' }));
        }
      });

      return true;
    } catch (error: any) {
      dispatch(setOrderError(error.message || 'Failed to cancel orders'));
      return false;
    } finally {
      dispatch(setCancellingOrder(false));
    }
  }, [token, dispatch, openOrders]);

  // Balance Management
  const fetchBalances = useCallback(async (): Promise<boolean> => {
    if (!token) {
      dispatch(setBalanceError('Authentication required'));
      return false;
    }

    try {
      dispatch(setLoadingBalances(true));
      dispatch(clearErrors());

      const balances = await tradingService.getBalances(token);
      dispatch(updateMultipleBalances(balances));

      return true;
    } catch (error: any) {
      dispatch(setBalanceError(error.message || 'Failed to fetch balances'));
      return false;
    } finally {
      dispatch(setLoadingBalances(false));
    }
  }, [token, dispatch]);

  // Position Management
  const fetchPositions = useCallback(async (): Promise<boolean> => {
    if (!token) {
      dispatch(setPositionError('Authentication required'));
      return false;
    }

    try {
      dispatch(setLoadingPositions(true));
      dispatch(clearErrors());

      const positions = await tradingService.getPositions(token);
      positions.forEach((position: Position) => {
        dispatch(updatePosition(position));
      });

      return true;
    } catch (error: any) {
      dispatch(setPositionError(error.message || 'Failed to fetch positions'));
      return false;
    } finally {
      dispatch(setLoadingPositions(false));
    }
  }, [token, dispatch]);

  const closePosition = useCallback(async (symbol: string, quantity?: number): Promise<boolean> => {
    if (!token) {
      dispatch(setPositionError('Authentication required'));
      return false;
    }

    try {
      dispatch(setPlacingOrder(true));
      dispatch(clearErrors());

      const position = positions[symbol];
      if (!position) {
        throw new Error('Position not found');
      }

      const closeQuantity = quantity || position.size;
      const side = position.side === 'long' ? 'sell' : 'buy';

      const order = await tradingService.placeOrder({
        symbol,
        side,
        type: 'market',
        quantity: closeQuantity,
      }, token);

      dispatch(addOrder(order));

      return true;
    } catch (error: any) {
      dispatch(setPositionError(error.message || 'Failed to close position'));
      return false;
    } finally {
      dispatch(setPlacingOrder(false));
    }
  }, [token, dispatch, positions]);

  // Order Form Management
  const updateForm = useCallback((updates: Partial<typeof orderForm>) => {
    dispatch(updateOrderForm(updates));
  }, [dispatch]);

  const resetForm = useCallback(() => {
    dispatch(resetOrderForm());
  }, [dispatch]);

  const setOrderType = useCallback((type: Order['type']) => {
    dispatch(setSelectedOrderType(type));
  }, [dispatch]);

  const setTimeInForce = useCallback((timeInForce: Order['timeInForce']) => {
    dispatch(setSelectedTimeInForce(timeInForce));
  }, [dispatch]);

  // Utility Functions
  const getOrderById = useCallback((orderId: string): Order | undefined => {
    return orders[orderId];
  }, [orders]);

  const getPositionBySymbol = useCallback((symbol: string): Position | undefined => {
    return positions[symbol];
  }, [positions]);

  const getBalanceByAsset = useCallback((asset: string): Balance | undefined => {
    return balances[asset];
  }, [balances]);

  const calculateBuyingPower = useCallback((): number => {
    // Simple calculation - in real app, this would consider margin, leverage, etc.
    const usdBalance = balances['USD'] || balances['USDT'];
    return usdBalance ? usdBalance.free : 0;
  }, [balances]);

  const calculateMaxQuantity = useCallback((symbol: string, price: number, side: 'buy' | 'sell'): number => {
    if (side === 'buy') {
      const buyingPower = calculateBuyingPower();
      return price > 0 ? buyingPower / price : 0;
    } else {
      // For sell, check available balance of base asset
      const baseAsset = symbol.split('-')[0] || symbol.split('/')[0] || '';
      const balance = balances[baseAsset];
      return balance ? balance.free : 0;
    }
  }, [balances, calculateBuyingPower]);

  const validateOrder = useCallback((params: PlaceOrderParams): string | null => {
    if (!params.symbol) return 'Symbol is required';
    if (!params.side) return 'Side is required';
    if (!params.type) return 'Order type is required';
    if (params.quantity <= 0) return 'Quantity must be greater than 0';

    if (params.type === 'limit' && (!params.price || params.price <= 0)) {
      return 'Price is required for limit orders';
    }

    if (params.type === 'stop' && (!params.stopPrice || params.stopPrice <= 0)) {
      return 'Stop price is required for stop orders';
    }

    if (params.type === 'stop_limit') {
      if (!params.price || params.price <= 0) return 'Price is required for stop limit orders';
      if (!params.stopPrice || params.stopPrice <= 0) return 'Stop price is required for stop limit orders';
    }

    const maxQuantity = calculateMaxQuantity(params.symbol, params.price || 0, params.side);
    if (params.quantity > maxQuantity) {
      return `Insufficient balance. Maximum quantity: ${maxQuantity.toFixed(8)}`;
    }

    return null;
  }, [calculateMaxQuantity]);

  // Auto-fetch data on mount
  useEffect(() => {
    if (token) {
      fetchBalances();
      fetchPositions();
    }
  }, [token, fetchBalances, fetchPositions]);

  return {
    // State
    trading,
    orders,
    openOrders,
    orderHistory,
    positions,
    balances,
    totalBalance,
    orderForm,

    // Loading states
    isPlacingOrder: trading.isPlacingOrder,
    isCancellingOrder: trading.isCancellingOrder,
    isLoadingBalances: trading.isLoadingBalances,
    isLoadingPositions: trading.isLoadingPositions,

    // Error states
    orderError: trading.orderError,
    balanceError: trading.balanceError,
    positionError: trading.positionError,

    // Order management
    placeOrder,
    cancelOrder,
    modifyOrder,
    cancelAllOrders,

    // Data fetching
    fetchBalances,
    fetchPositions,

    // Position management
    closePosition,

    // Form management
    updateForm,
    resetForm,
    setOrderType,
    setTimeInForce,

    // Utility functions
    getOrderById,
    getPositionBySymbol,
    getBalanceByAsset,
    calculateBuyingPower,
    calculateMaxQuantity,
    validateOrder,

    // Actions
    clearErrors: () => dispatch(clearErrors()),
  };
};