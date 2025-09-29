import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import { VictoryPie } from 'victory-native';

import Card from '../common/Card';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface Asset {
  symbol: string;
  name: string;
  value: number;
  percentage: number;
  change: number;
  color: string;
}

const PortfolioCard: React.FC = () => {
  const navigation = useNavigation();

  // Mock portfolio data
  const assets: Asset[] = [
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      value: 45000,
      percentage: 35.8,
      change: 2.5,
      color: '#F7931A',
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      value: 28000,
      percentage: 22.3,
      change: 3.2,
      color: '#627EEA',
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      value: 15000,
      percentage: 11.9,
      change: -1.8,
      color: '#9945FF',
    },
    {
      symbol: 'ADA',
      name: 'Cardano',
      value: 12000,
      percentage: 9.5,
      change: 5.1,
      color: '#0033AD',
    },
    {
      symbol: 'DOT',
      name: 'Polkadot',
      value: 8500,
      percentage: 6.8,
      change: -0.5,
      color: '#E6007A',
    },
    {
      symbol: 'Others',
      name: 'Other Assets',
      value: 17500,
      percentage: 13.7,
      change: 1.2,
      color: '#8B5CF6',
    },
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatPercentage = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(1)}%`;
  };

  const pieData = assets.map((asset) => ({
    x: asset.symbol,
    y: asset.percentage,
    fill: asset.color,
  }));

  const navigateToPortfolio = () => {
    navigation.navigate('Portfolio' as never);
  };

  return (
    <Card style={styles.container} variant="elevated">
      <View style={styles.header}>
        <Text style={styles.title}>Portfolio Breakdown</Text>
        <TouchableOpacity onPress={navigateToPortfolio} style={styles.seeAllButton}>
          <Text style={styles.seeAllText}>See All</Text>
          <Icon name="chevron-forward" size={16} color={colors.primary} />
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Pie Chart */}
        <View style={styles.chartContainer}>
          <VictoryPie
            data={pieData}
            width={160}
            height={160}
            innerRadius={40}
            padAngle={2}
            labelComponent={<></>}
            colorScale={assets.map(asset => asset.color)}
          />
          <View style={styles.chartCenter}>
            <Text style={styles.chartCenterText}>Portfolio</Text>
          </View>
        </View>

        {/* Asset List */}
        <View style={styles.assetList}>
          <ScrollView showsVerticalScrollIndicator={false}>
            {assets.map((asset, index) => (
              <TouchableOpacity key={asset.symbol} style={styles.assetItem}>
                <View style={styles.assetLeft}>
                  <View style={[styles.assetColorDot, { backgroundColor: asset.color }]} />
                  <View style={styles.assetInfo}>
                    <Text style={styles.assetSymbol}>{asset.symbol}</Text>
                    <Text style={styles.assetName}>{asset.name}</Text>
                  </View>
                </View>
                
                <View style={styles.assetRight}>
                  <Text style={styles.assetValue}>{formatCurrency(asset.value)}</Text>
                  <View style={styles.assetMetrics}>
                    <Text style={styles.assetPercentage}>{asset.percentage}%</Text>
                    <Text style={[
                      styles.assetChange,
                      { color: asset.change >= 0 ? colors.success : colors.error }
                    ]}>
                      {formatPercentage(asset.change)}
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </View>

      {/* Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity style={[styles.actionButton, styles.rebalanceButton]}>
          <Icon name="refresh" size={16} color={colors.primary} />
          <Text style={styles.rebalanceText}>Rebalance</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={[styles.actionButton, styles.analyzeButton]}>
          <Icon name="analytics" size={16} color={colors.textInverse} />
          <Text style={styles.analyzeText}>Analyze</Text>
        </TouchableOpacity>
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
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
  content: {
    flexDirection: 'row',
    marginBottom: spacing.md,
  },
  chartContainer: {
    position: 'relative',
    marginRight: spacing.md,
  },
  chartCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chartCenterText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: typography.fontWeight.medium,
  },
  assetList: {
    flex: 1,
    maxHeight: 160,
  },
  assetItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  assetLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetColorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: spacing.sm,
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
  assetRight: {
    alignItems: 'flex-end',
  },
  assetValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  assetMetrics: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetPercentage: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginRight: spacing.xs,
  },
  assetChange: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  rebalanceButton: {
    backgroundColor: colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: colors.primary,
  },
  rebalanceText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.xs,
  },
  analyzeButton: {
    backgroundColor: colors.primary,
  },
  analyzeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.medium,
    marginLeft: spacing.xs,
  },
});

export default PortfolioCard;
