import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';

import { RootState } from '../../store/store';
import { colors, spacing, typography, borderRadius, shadows } from '../../theme';
import PortfolioCard from '../../components/dashboard/PortfolioCard';
import WatchlistCard from '../../components/dashboard/WatchlistCard';
import MarketSummaryCard from '../../components/dashboard/MarketSummaryCard';
import QuickActionsCard from '../../components/dashboard/QuickActionsCard';

const { width: screenWidth } = Dimensions.get('window');

const DashboardScreen: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  
  const { user } = useSelector((state: RootState) => state.auth);
  const { totalBalance, dayChange, dayChangePercent } = useSelector((state: RootState) => state.portfolio);

  // Mock data - replace with real data
  const portfolioData = {
    totalValue: 125847.32,
    dayChange: 2847.21,
    dayChangePercent: 2.31,
    buyingPower: 45230.12,
  };

  const onRefresh = async () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => {
      setRefreshing(false);
    }, 1000);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatPercentage = (percent: number) => {
    return `${percent >= 0 ? '+' : ''}${percent.toFixed(2)}%`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.greeting}>
            {getGreeting()}, {user?.firstName || user?.username}
          </Text>
          <Text style={styles.subtitle}>
            Welcome back to NexusTrade
          </Text>
        </View>
        
        <TouchableOpacity style={styles.notificationButton}>
          <Icon name="notifications-outline" size={24} color={colors.textPrimary} />
          <View style={styles.notificationBadge} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Portfolio Value Card */}
        <LinearGradient
          colors={[colors.primary, colors.primaryDark]}
          style={styles.portfolioCard}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <View style={styles.portfolioHeader}>
            <Text style={styles.portfolioLabel}>Portfolio Value</Text>
            <TouchableOpacity
              onPress={() => setShowBalance(!showBalance)}
              style={styles.eyeButton}
            >
              <Icon
                name={showBalance ? 'eye-outline' : 'eye-off-outline'}
                size={20}
                color={colors.textInverse}
              />
            </TouchableOpacity>
          </View>
          
          <Text style={styles.portfolioValue}>
            {showBalance ? formatCurrency(portfolioData.totalValue) : '••••••'}
          </Text>
          
          <View style={styles.portfolioChange}>
            <Icon
              name={portfolioData.dayChange >= 0 ? 'trending-up' : 'trending-down'}
              size={16}
              color={colors.textInverse}
            />
            <Text style={styles.portfolioChangeText}>
              {showBalance ? formatCurrency(Math.abs(portfolioData.dayChange)) : '••••'} (
              {showBalance ? formatPercentage(portfolioData.dayChangePercent) : '••••'}) Today
            </Text>
          </View>
          
          <View style={styles.buyingPowerContainer}>
            <Text style={styles.buyingPowerLabel}>Buying Power</Text>
            <Text style={styles.buyingPowerValue}>
              {showBalance ? formatCurrency(portfolioData.buyingPower) : '••••••'}
            </Text>
          </View>
        </LinearGradient>

        {/* Quick Actions */}
        <QuickActionsCard />

        {/* Market Summary */}
        <MarketSummaryCard />

        {/* Watchlist */}
        <WatchlistCard />

        {/* Portfolio Breakdown */}
        <PortfolioCard />

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerLeft: {
    flex: 1,
  },
  greeting: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    marginTop: 2,
  },
  notificationButton: {
    position: 'relative',
    padding: spacing.sm,
  },
  notificationBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.error,
  },
  scrollView: {
    flex: 1,
  },
  portfolioCard: {
    marginHorizontal: spacing.md,
    marginBottom: spacing.md,
    padding: spacing.lg,
    borderRadius: borderRadius.xl,
    ...shadows.md,
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  portfolioLabel: {
    fontSize: typography.fontSize.base,
    color: colors.textInverse,
    opacity: 0.9,
  },
  eyeButton: {
    padding: spacing.xs,
  },
  portfolioValue: {
    fontSize: typography.fontSize['3xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textInverse,
    marginBottom: spacing.xs,
  },
  portfolioChange: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  portfolioChangeText: {
    fontSize: typography.fontSize.sm,
    color: colors.textInverse,
    marginLeft: spacing.xs,
    opacity: 0.9,
  },
  buyingPowerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  buyingPowerLabel: {
    fontSize: typography.fontSize.sm,
    color: colors.textInverse,
    opacity: 0.9,
  },
  buyingPowerValue: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textInverse,
  },
  bottomSpacing: {
    height: spacing.xl,
  },
});

export default DashboardScreen;
