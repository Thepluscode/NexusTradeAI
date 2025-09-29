import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import HapticFeedback from 'react-native-haptic-feedback';
import { LineChart } from 'react-native-chart-kit';

import Button from '../../components/common/Button';
import Input from '../../components/common/Input';
import Card from '../../components/common/Card';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface TradingScreenProps {
  navigation: any;
  route: any;
}

const { width } = Dimensions.get('window');

const TradingScreen: React.FC<TradingScreenProps> = ({ navigation, route }) => {
  const { side: initialSide = 'buy', symbol: initialSymbol = 'BTC' } = route.params || {};
  
  const [selectedSymbol, setSelectedSymbol] = useState(initialSymbol);
  const [side, setSide] = useState<'buy' | 'sell'>(initialSide);
  const [orderType, setOrderType] = useState<'market' | 'limit'>('limit');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [total, setTotal] = useState('');
  const [loading, setLoading] = useState(false);

  // Mock market data
  const [marketData] = useState({
    BTC: {
      price: 43250.00,
      change24h: 2.98,
      high24h: 44100.00,
      low24h: 42800.00,
      volume24h: 28500000000,
      chartData: [42000, 42500, 41800, 43000, 43250, 42900, 43250, 43400, 43250],
    },
    ETH: {
      price: 2680.75,
      change24h: 3.28,
      high24h: 2720.00,
      low24h: 2650.00,
      volume24h: 15200000000,
      chartData: [2595, 2620, 2580, 2650, 2680, 2660, 2680, 2700, 2680],
    },
    SOL: {
      price: 98.50,
      change24h: -1.74,
      high24h: 102.00,
      low24h: 97.20,
      volume24h: 2100000000,
      chartData: [100, 99, 97, 98, 99, 98, 98.5, 97.8, 98.5],
    },
  });

  const symbols = ['BTC', 'ETH', 'SOL'];
  const currentMarketData = marketData[selectedSymbol as keyof typeof marketData];

  useEffect(() => {
    if (orderType === 'market') {
      setPrice(currentMarketData.price.toString());
    }
  }, [orderType, currentMarketData.price]);

  useEffect(() => {
    if (amount && price) {
      const totalValue = parseFloat(amount) * parseFloat(price);
      setTotal(totalValue.toFixed(2));
    } else {
      setTotal('');
    }
  }, [amount, price]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const handleSymbolChange = (symbol: string) => {
    setSelectedSymbol(symbol);
    HapticFeedback.trigger('impactLight');
  };

  const handleSideChange = (newSide: 'buy' | 'sell') => {
    setSide(newSide);
    HapticFeedback.trigger('impactLight');
  };

  const handleOrderTypeChange = (type: 'market' | 'limit') => {
    setOrderType(type);
    HapticFeedback.trigger('impactLight');
    
    if (type === 'market') {
      setPrice(currentMarketData.price.toString());
    }
  };

  const handlePlaceOrder = async () => {
    if (!amount || (!price && orderType === 'limit')) {
      Alert.alert('Error', 'Please fill in all required fields');
      return;
    }

    const orderAmount = parseFloat(amount);
    const orderPrice = parseFloat(price);
    const orderTotal = parseFloat(total);

    if (orderAmount <= 0 || orderPrice <= 0) {
      Alert.alert('Error', 'Please enter valid amounts');
      return;
    }

    Alert.alert(
      'Confirm Order',
      `${side.toUpperCase()} ${orderAmount} ${selectedSymbol} ${orderType === 'limit' ? `at ${formatCurrency(orderPrice)}` : 'at market price'}\n\nTotal: ${formatCurrency(orderTotal)}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: async () => {
            setLoading(true);
            HapticFeedback.trigger('impactMedium');
            
            try {
              // Simulate API call
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              HapticFeedback.trigger('notificationSuccess');
              Alert.alert('Success', 'Order placed successfully!', [
                { text: 'OK', onPress: () => navigation.goBack() }
              ]);
            } catch (error) {
              HapticFeedback.trigger('notificationError');
              Alert.alert('Error', 'Failed to place order. Please try again.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMaxAmount = () => {
    // Mock available balance
    const availableBalance = side === 'buy' ? 10000 : 1.5; // USD for buy, BTC for sell
    
    if (side === 'buy' && price) {
      const maxAmount = availableBalance / parseFloat(price);
      setAmount(maxAmount.toFixed(6));
    } else if (side === 'sell') {
      setAmount(availableBalance.toString());
    }
    
    HapticFeedback.trigger('impactLight');
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Symbol Selector */}
        <Card style={styles.symbolCard}>
          <Text style={styles.sectionTitle}>Select Asset</Text>
          <View style={styles.symbolSelector}>
            {symbols.map((symbol) => (
              <TouchableOpacity
                key={symbol}
                style={[
                  styles.symbolButton,
                  selectedSymbol === symbol && styles.symbolButtonActive,
                ]}
                onPress={() => handleSymbolChange(symbol)}
              >
                <Text
                  style={[
                    styles.symbolText,
                    selectedSymbol === symbol && styles.symbolTextActive,
                  ]}
                >
                  {symbol}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </Card>

        {/* Market Data */}
        <Card style={styles.marketCard}>
          <View style={styles.marketHeader}>
            <View>
              <Text style={styles.marketPrice}>
                {formatCurrency(currentMarketData.price)}
              </Text>
              <Text
                style={[
                  styles.marketChange,
                  { color: currentMarketData.change24h >= 0 ? colors.success : colors.error },
                ]}
              >
                {formatPercentage(currentMarketData.change24h)}
              </Text>
            </View>
            <View style={styles.marketStats}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>24h High</Text>
                <Text style={styles.statValue}>{formatCurrency(currentMarketData.high24h)}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>24h Low</Text>
                <Text style={styles.statValue}>{formatCurrency(currentMarketData.low24h)}</Text>
              </View>
            </View>
          </View>

          {/* Mini Chart */}
          <View style={styles.chartContainer}>
            <LineChart
              data={{
                datasets: [
                  {
                    data: currentMarketData.chartData,
                    color: () => currentMarketData.change24h >= 0 ? colors.success : colors.error,
                    strokeWidth: 2,
                  },
                ],
              }}
              width={width - 64}
              height={120}
              chartConfig={{
                backgroundColor: 'transparent',
                backgroundGradientFrom: 'transparent',
                backgroundGradientTo: 'transparent',
                color: () => currentMarketData.change24h >= 0 ? colors.success : colors.error,
                strokeWidth: 2,
                propsForDots: {
                  r: '0',
                },
                propsForBackgroundLines: {
                  strokeWidth: 0,
                },
                propsForLabels: {
                  fontSize: 0,
                },
              }}
              bezier
              withDots={false}
              withInnerLines={false}
              withOuterLines={false}
              withVerticalLabels={false}
              withHorizontalLabels={false}
              style={styles.chart}
            />
          </View>
        </Card>

        {/* Order Form */}
        <Card style={styles.orderCard}>
          <Text style={styles.sectionTitle}>Place Order</Text>

          {/* Side Selector */}
          <View style={styles.sideSelector}>
            <TouchableOpacity
              style={[
                styles.sideButton,
                styles.buyButton,
                side === 'buy' && styles.sideButtonActive,
              ]}
              onPress={() => handleSideChange('buy')}
            >
              <Text
                style={[
                  styles.sideText,
                  side === 'buy' && styles.sideTextActive,
                ]}
              >
                Buy
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.sideButton,
                styles.sellButton,
                side === 'sell' && styles.sideButtonActive,
              ]}
              onPress={() => handleSideChange('sell')}
            >
              <Text
                style={[
                  styles.sideText,
                  side === 'sell' && styles.sideTextActive,
                ]}
              >
                Sell
              </Text>
            </TouchableOpacity>
          </View>

          {/* Order Type Selector */}
          <View style={styles.orderTypeSelector}>
            <TouchableOpacity
              style={[
                styles.orderTypeButton,
                orderType === 'market' && styles.orderTypeButtonActive,
              ]}
              onPress={() => handleOrderTypeChange('market')}
            >
              <Text
                style={[
                  styles.orderTypeText,
                  orderType === 'market' && styles.orderTypeTextActive,
                ]}
              >
                Market
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.orderTypeButton,
                orderType === 'limit' && styles.orderTypeButtonActive,
              ]}
              onPress={() => handleOrderTypeChange('limit')}
            >
              <Text
                style={[
                  styles.orderTypeText,
                  orderType === 'limit' && styles.orderTypeTextActive,
                ]}
              >
                Limit
              </Text>
            </TouchableOpacity>
          </View>

          {/* Amount Input */}
          <View style={styles.inputContainer}>
            <Input
              label={`Amount (${selectedSymbol})`}
              value={amount}
              onChangeText={setAmount}
              keyboardType="numeric"
              placeholder="0.00"
              rightIcon="maximize"
              onRightIconPress={handleMaxAmount}
            />
          </View>

          {/* Price Input */}
          {orderType === 'limit' && (
            <View style={styles.inputContainer}>
              <Input
                label="Price (USD)"
                value={price}
                onChangeText={setPrice}
                keyboardType="numeric"
                placeholder="0.00"
              />
            </View>
          )}

          {/* Total */}
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>
              {total ? formatCurrency(parseFloat(total)) : '$0.00'}
            </Text>
          </View>

          {/* Place Order Button */}
          <Button
            title={loading ? 'Placing Order...' : `${side === 'buy' ? 'Buy' : 'Sell'} ${selectedSymbol}`}
            onPress={handlePlaceOrder}
            loading={loading}
            variant={side === 'buy' ? 'success' : 'danger'}
            style={styles.placeOrderButton}
          />
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: spacing.md,
  },
  symbolCard: {
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  symbolSelector: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  symbolButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
    alignItems: 'center',
  },
  symbolButtonActive: {
    backgroundColor: colors.primary,
  },
  symbolText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  symbolTextActive: {
    color: colors.textInverse,
  },
  marketCard: {
    marginBottom: spacing.md,
  },
  marketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.md,
  },
  marketPrice: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  marketChange: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
  },
  marketStats: {
    alignItems: 'flex-end',
  },
  statItem: {
    alignItems: 'flex-end',
    marginBottom: spacing.xs,
  },
  statLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  statValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  chartContainer: {
    alignItems: 'center',
  },
  chart: {
    marginLeft: -16,
  },
  orderCard: {
    marginBottom: spacing.md,
  },
  sideSelector: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: 2,
  },
  sideButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  buyButton: {},
  sellButton: {},
  sideButtonActive: {
    backgroundColor: colors.background,
  },
  sideText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  sideTextActive: {
    color: colors.textPrimary,
  },
  orderTypeSelector: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  orderTypeButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  orderTypeButtonActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  orderTypeText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  orderTypeTextActive: {
    color: colors.textInverse,
  },
  inputContainer: {
    marginBottom: spacing.md,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    marginBottom: spacing.md,
  },
  totalLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  totalValue: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  placeOrderButton: {
    marginTop: spacing.sm,
  },
});

export default TradingScreen;
