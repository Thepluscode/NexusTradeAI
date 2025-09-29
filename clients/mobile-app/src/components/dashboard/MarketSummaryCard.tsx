import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { LineChart } from 'react-native-chart-kit';

import Card from '../common/Card';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface MarketData {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketCap: number;
  sparklineData: number[];
}

const MarketSummaryCard: React.FC = () => {
  const navigation = useNavigation();
  const [loading, setLoading] = useState(true);
  const [marketData, setMarketData] = useState<MarketData[]>([]);
  const [selectedTimeframe, setSelectedTimeframe] = useState('24h');

  const timeframes = [
    { label: '1H', value: '1h' },
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' },
  ];

  useEffect(() => {
    fetchMarketData();
  }, [selectedTimeframe]);

  const fetchMarketData = async () => {
    setLoading(true);
    
    // Mock API call - replace with real data
    setTimeout(() => {
      const mockData: MarketData[] = [
        {
          symbol: 'BTC',
          name: 'Bitcoin',
          price: 43250.00,
          change24h: 1250.50,
          changePercent24h: 2.98,
          volume24h: 28500000000,
          marketCap: 847000000000,
          sparklineData: [42000, 42500, 41800, 43000, 43250, 42900, 43250],
        },
        {
          symbol: 'ETH',
          name: 'Ethereum',
          price: 2680.75,
          change24h: 85.25,
          changePercent24h: 3.28,
          volume24h: 15200000000,
          marketCap: 322000000000,
          sparklineData: [2595, 2620, 2580, 2650, 2680, 2660, 2680],
        },
        {
          symbol: 'SOL',
          name: 'Solana',
          price: 98.50,
          change24h: -1.75,
          changePercent24h: -1.74,
          volume24h: 2100000000,
          marketCap: 42000000000,
          sparklineData: [100, 99, 97, 98, 99, 98, 98.5],
        },
        {
          symbol: 'ADA',
          name: 'Cardano',
          price: 0.485,
          change24h: 0.024,
          changePercent24h: 5.21,
          volume24h: 850000000,
          marketCap: 17000000000,
          sparklineData: [0.461, 0.470, 0.465, 0.480, 0.485, 0.478, 0.485],
        },
      ];
      
      setMarketData(mockData);
      setLoading(false);
    }, 1000);
  };

  const formatCurrency = (amount: number) => {
    if (amount >= 1000000000) {
      return `$${(amount / 1000000000).toFixed(1)}B`;
    } else if (amount >= 1000000) {
      return `$${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `$${(amount / 1000).toFixed(1)}K`;
    } else if (amount < 1) {
      return `$${amount.toFixed(4)}`;
    }
    return `$${amount.toFixed(2)}`;
  };

  const formatPercentage = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const navigateToMarkets = () => {
    navigation.navigate('Markets' as never);
  };

  const navigateToAsset = (symbol: string) => {
    navigation.navigate('AssetDetail' as never, { symbol } as never);
  };

  if (loading) {
    return (
      <Card style={styles.container} variant="elevated">
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading market data...</Text>
        </View>
      </Card>
    );
  }

  return (
    <Card style={styles.container} variant="elevated">
      <View style={styles.header}>
        <Text style={styles.title}>Market Summary</Text>
        <TouchableOpacity onPress={navigateToMarkets} style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>See All</Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Timeframe Selector */}
      <View style={styles.timeframeContainer}>
        {timeframes.map((timeframe) => (
          <TouchableOpacity
            key={timeframe.value}
            style={[
              styles.timeframeButton,
              selectedTimeframe === timeframe.value && styles.timeframeButtonActive,
            ]}
            onPress={() => setSelectedTimeframe(timeframe.value)}
          >
            <Text
              style={[
                styles.timeframeText,
                selectedTimeframe === timeframe.value && styles.timeframeTextActive,
              ]}
            >
              {timeframe.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Market Data List */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.marketList}>
        {marketData.map((asset) => (
          <TouchableOpacity
            key={asset.symbol}
            style={styles.marketItem}
            onPress={() => navigateToAsset(asset.symbol)}
          >
            <View style={styles.marketHeader}>
              <View style={styles.assetInfo}>
                <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                <Text style={styles.assetName}>{asset.name}</Text>
              </View>
              <Text
                style={[
                  styles.assetChange,
                  { color: asset.changePercent24h >= 0 ? colors.success : colors.error },
                ]}
              >
                {formatPercentage(asset.changePercent24h)}
              </Text>
            </View>

            <Text style={styles.assetPrice}>{formatCurrency(asset.price)}</Text>

            {/* Mini Chart */}
            <View style={styles.chartContainer}>
              <LineChart
                data={{
                  datasets: [
                    {
                      data: asset.sparklineData,
                      color: () => asset.changePercent24h >= 0 ? colors.success : colors.error,
                      strokeWidth: 2,
                    },
                  ],
                }}
                width={120}
                height={40}
                chartConfig={{
                  backgroundColor: 'transparent',
                  backgroundGradientFrom: 'transparent',
                  backgroundGradientTo: 'transparent',
                  color: () => asset.changePercent24h >= 0 ? colors.success : colors.error,
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

            <View style={styles.marketFooter}>
              <Text style={styles.volumeLabel}>Vol</Text>
              <Text style={styles.volumeValue}>{formatCurrency(asset.volume24h)}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Market Stats */}
      <View style={styles.marketStats}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Fear & Greed</Text>
          <View style={styles.statValue}>
            <Text style={[styles.statNumber, { color: colors.warning }]}>72</Text>
            <Text style={styles.statText}>Greed</Text>
          </View>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Global Cap</Text>
          <View style={styles.statValue}>
            <Text style={styles.statNumber}>$1.7T</Text>
            <Text style={[styles.statText, { color: colors.success }]}>+2.4%</Text>
          </View>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>BTC Dom</Text>
          <View style={styles.statValue}>
            <Text style={styles.statNumber}>49.8%</Text>
            <Text style={[styles.statText, { color: colors.error }]}>-0.2%</Text>
          </View>
        </View>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  loadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  seeAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  seeAllText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginRight: spacing.xs,
  },
  timeframeContainer: {
    flexDirection: 'row',
    marginBottom: spacing.md,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: 2,
  },
  timeframeButton: {
    flex: 1,
    paddingVertical: spacing.xs,
    alignItems: 'center',
    borderRadius: borderRadius.sm,
  },
  timeframeButtonActive: {
    backgroundColor: colors.background,
  },
  timeframeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  timeframeTextActive: {
    color: colors.primary,
  },
  marketList: {
    marginBottom: spacing.md,
  },
  marketItem: {
    width: 140,
    marginRight: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
  },
  marketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  assetInfo: {
    flex: 1,
  },
  assetSymbol: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  assetName: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  assetChange: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  assetPrice: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  chartContainer: {
    height: 40,
    marginBottom: spacing.xs,
  },
  chart: {
    marginLeft: -16,
  },
  marketFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  volumeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  volumeValue: {
    fontSize: typography.fontSize.xs,
    color: colors.textPrimary,
    fontWeight: typography.fontWeight.medium,
  },
  marketStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  statValue: {
    alignItems: 'center',
  },
  statNumber: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  statText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});

export default MarketSummaryCard;
