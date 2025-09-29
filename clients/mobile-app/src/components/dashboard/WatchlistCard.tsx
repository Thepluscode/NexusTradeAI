import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import HapticFeedback from 'react-native-haptic-feedback';

import Card from '../common/Card';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface WatchlistItem {
  symbol: string;
  name: string;
  price: number;
  change24h: number;
  changePercent24h: number;
  isWatched: boolean;
}

const WatchlistCard: React.FC = () => {
  const navigation = useNavigation();
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([
    {
      symbol: 'BTC',
      name: 'Bitcoin',
      price: 43250.00,
      change24h: 1250.50,
      changePercent24h: 2.98,
      isWatched: true,
    },
    {
      symbol: 'ETH',
      name: 'Ethereum',
      price: 2680.75,
      change24h: 85.25,
      changePercent24h: 3.28,
      isWatched: true,
    },
    {
      symbol: 'SOL',
      name: 'Solana',
      price: 98.50,
      change24h: -1.75,
      changePercent24h: -1.74,
      isWatched: true,
    },
    {
      symbol: 'ADA',
      name: 'Cardano',
      price: 0.485,
      change24h: 0.024,
      changePercent24h: 5.21,
      isWatched: true,
    },
    {
      symbol: 'DOT',
      name: 'Polkadot',
      price: 7.25,
      change24h: -0.15,
      changePercent24h: -2.03,
      isWatched: true,
    },
  ]);

  const formatCurrency = (amount: number) => {
    if (amount < 1) {
      return `$${amount.toFixed(4)}`;
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  const toggleWatchlist = (symbol: string) => {
    HapticFeedback.trigger('impactLight');
    
    setWatchlist(prev => 
      prev.map(item => 
        item.symbol === symbol 
          ? { ...item, isWatched: !item.isWatched }
          : item
      )
    );
  };

  const removeFromWatchlist = (symbol: string) => {
    Alert.alert(
      'Remove from Watchlist',
      `Are you sure you want to remove ${symbol} from your watchlist?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            HapticFeedback.trigger('impactMedium');
            setWatchlist(prev => prev.filter(item => item.symbol !== symbol));
          },
        },
      ]
    );
  };

  const navigateToAsset = (symbol: string) => {
    navigation.navigate('AssetDetail' as never, { symbol } as never);
  };

  const navigateToWatchlist = () => {
    navigation.navigate('Watchlist' as never);
  };

  const addToWatchlist = () => {
    navigation.navigate('AddToWatchlist' as never);
  };

  return (
    <Card style={styles.container} variant="elevated">
      <View style={styles.header}>
        <Text style={styles.title}>Watchlist</Text>
        <View style={styles.headerActions}>
          <TouchableOpacity onPress={addToWatchlist} style={styles.addButton}>
            <Icon name="add" size={20} color={colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity onPress={navigateToWatchlist} style={styles.seeAllButton}>
            <Text style={styles.seeAllText}>See All</Text>
            <Icon name="chevron-forward" size={16} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>

      {watchlist.length === 0 ? (
        <View style={styles.emptyState}>
          <Icon name="star-outline" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>No assets in watchlist</Text>
          <Text style={styles.emptySubtitle}>
            Add cryptocurrencies to track their performance
          </Text>
          <TouchableOpacity style={styles.emptyButton} onPress={addToWatchlist}>
            <Text style={styles.emptyButtonText}>Add Assets</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} style={styles.list}>
          {watchlist.map((item, index) => (
            <TouchableOpacity
              key={item.symbol}
              style={[
                styles.listItem,
                index === watchlist.length - 1 && styles.lastItem,
              ]}
              onPress={() => navigateToAsset(item.symbol)}
              onLongPress={() => removeFromWatchlist(item.symbol)}
            >
              <View style={styles.itemLeft}>
                <View style={styles.assetIcon}>
                  <Text style={styles.assetSymbol}>{item.symbol}</Text>
                </View>
                <View style={styles.assetInfo}>
                  <Text style={styles.assetName}>{item.name}</Text>
                  <Text style={styles.assetSymbolText}>{item.symbol}</Text>
                </View>
              </View>

              <View style={styles.itemCenter}>
                <View style={styles.priceChart}>
                  {/* Mini price chart placeholder */}
                  <View style={styles.chartLine} />
                  <View style={[styles.chartLine, styles.chartLineShort]} />
                  <View style={[styles.chartLine, styles.chartLineTall]} />
                  <View style={styles.chartLine} />
                  <View style={[styles.chartLine, styles.chartLineShort]} />
                </View>
              </View>

              <View style={styles.itemRight}>
                <Text style={styles.assetPrice}>{formatCurrency(item.price)}</Text>
                <View style={styles.changeContainer}>
                  <Icon
                    name={item.changePercent24h >= 0 ? 'trending-up' : 'trending-down'}
                    size={12}
                    color={item.changePercent24h >= 0 ? colors.success : colors.error}
                  />
                  <Text
                    style={[
                      styles.assetChange,
                      { color: item.changePercent24h >= 0 ? colors.success : colors.error },
                    ]}
                  >
                    {formatPercentage(item.changePercent24h)}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.watchButton}
                onPress={() => toggleWatchlist(item.symbol)}
              >
                <Icon
                  name={item.isWatched ? 'star' : 'star-outline'}
                  size={20}
                  color={item.isWatched ? colors.warning : colors.textSecondary}
                />
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Quick Stats */}
      <View style={styles.quickStats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {watchlist.filter(item => item.changePercent24h > 0).length}
          </Text>
          <Text style={styles.statLabel}>Gainers</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {watchlist.filter(item => item.changePercent24h < 0).length}
          </Text>
          <Text style={styles.statLabel}>Losers</Text>
        </View>
        
        <View style={styles.statDivider} />
        
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {(watchlist.reduce((sum, item) => sum + item.changePercent24h, 0) / watchlist.length).toFixed(1)}%
          </Text>
          <Text style={styles.statLabel}>Avg Change</Text>
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  addButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
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
  emptyState: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  emptyButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: borderRadius.md,
  },
  emptyButtonText: {
    fontSize: typography.fontSize.sm,
    color: colors.textInverse,
    fontWeight: typography.fontWeight.medium,
  },
  list: {
    maxHeight: 200,
    marginBottom: spacing.md,
  },
  listItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  lastItem: {
    borderBottomWidth: 0,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  assetIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  assetSymbol: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  assetInfo: {
    flex: 1,
  },
  assetName: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.medium,
    color: colors.textPrimary,
  },
  assetSymbolText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  itemCenter: {
    flex: 1,
    alignItems: 'center',
  },
  priceChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 20,
    gap: 2,
  },
  chartLine: {
    width: 2,
    height: 12,
    backgroundColor: colors.primary,
    opacity: 0.6,
  },
  chartLineShort: {
    height: 8,
  },
  chartLineTall: {
    height: 16,
  },
  itemRight: {
    alignItems: 'flex-end',
    flex: 1,
  },
  assetPrice: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  changeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  assetChange: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.medium,
    marginLeft: 2,
  },
  watchButton: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  quickStats: {
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
  statValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  statLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.border,
    marginHorizontal: spacing.sm,
  },
});

export default WatchlistCard;
