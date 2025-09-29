import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import HapticFeedback from 'react-native-haptic-feedback';

import Card from '../common/Card';
import { colors, spacing, typography, borderRadius } from '../../theme';

interface QuickAction {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  gradientColors: string[];
  route: string;
}

const QuickActionsCard: React.FC = () => {
  const navigation = useNavigation();

  const quickActions: QuickAction[] = [
    {
      id: 'buy',
      title: 'Buy',
      subtitle: 'Purchase crypto',
      icon: 'add-circle',
      gradientColors: ['#4ade80', '#22c55e'],
      route: 'Trading',
    },
    {
      id: 'sell',
      title: 'Sell',
      subtitle: 'Sell holdings',
      icon: 'remove-circle',
      gradientColors: ['#f87171', '#ef4444'],
      route: 'Trading',
    },
    {
      id: 'swap',
      title: 'Swap',
      subtitle: 'Exchange assets',
      icon: 'swap-horizontal',
      gradientColors: ['#8b5cf6', '#7c3aed'],
      route: 'Swap',
    },
    {
      id: 'send',
      title: 'Send',
      subtitle: 'Transfer funds',
      icon: 'paper-plane',
      gradientColors: ['#06b6d4', '#0891b2'],
      route: 'Transfer',
    },
  ];

  const handleActionPress = (action: QuickAction) => {
    HapticFeedback.trigger('impactLight');
    
    switch (action.id) {
      case 'buy':
        navigation.navigate('Trading' as never, { side: 'buy' } as never);
        break;
      case 'sell':
        navigation.navigate('Trading' as never, { side: 'sell' } as never);
        break;
      case 'swap':
        navigation.navigate('Swap' as never);
        break;
      case 'send':
        navigation.navigate('Transfer' as never);
        break;
      default:
        navigation.navigate(action.route as never);
    }
  };

  return (
    <Card style={styles.container} variant="elevated">
      <View style={styles.header}>
        <Text style={styles.title}>Quick Actions</Text>
        <Text style={styles.subtitle}>Trade and manage your portfolio</Text>
      </View>

      <View style={styles.actionsGrid}>
        {quickActions.map((action) => (
          <TouchableOpacity
            key={action.id}
            style={styles.actionItem}
            onPress={() => handleActionPress(action)}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={action.gradientColors}
              style={styles.actionIcon}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            >
              <Icon name={action.icon} size={24} color={colors.textInverse} />
            </LinearGradient>
            
            <View style={styles.actionContent}>
              <Text style={styles.actionTitle}>{action.title}</Text>
              <Text style={styles.actionSubtitle}>{action.subtitle}</Text>
            </View>
            
            <Icon name="chevron-forward" size={16} color={colors.textSecondary} />
          </TouchableOpacity>
        ))}
      </View>

      {/* Additional Quick Access */}
      <View style={styles.additionalActions}>
        <TouchableOpacity
          style={styles.additionalAction}
          onPress={() => navigation.navigate('Markets' as never)}
        >
          <Icon name="trending-up" size={20} color={colors.primary} />
          <Text style={styles.additionalActionText}>Markets</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.additionalAction}
          onPress={() => navigation.navigate('Analytics' as never)}
        >
          <Icon name="analytics" size={20} color={colors.primary} />
          <Text style={styles.additionalActionText}>Analytics</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.additionalAction}
          onPress={() => navigation.navigate('History' as never)}
        >
          <Icon name="time" size={20} color={colors.primary} />
          <Text style={styles.additionalActionText}>History</Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.additionalAction}
          onPress={() => navigation.navigate('Settings' as never)}
        >
          <Icon name="settings" size={20} color={colors.primary} />
          <Text style={styles.additionalActionText}>Settings</Text>
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
    marginBottom: spacing.md,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  subtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  actionsGrid: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: borderRadius.md,
    backgroundColor: colors.backgroundSecondary,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: borderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  actionContent: {
    flex: 1,
  },
  actionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
    marginBottom: 2,
  },
  actionSubtitle: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  additionalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  additionalAction: {
    alignItems: 'center',
    flex: 1,
    paddingVertical: spacing.sm,
  },
  additionalActionText: {
    fontSize: typography.fontSize.xs,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },
});

export default QuickActionsCard;
