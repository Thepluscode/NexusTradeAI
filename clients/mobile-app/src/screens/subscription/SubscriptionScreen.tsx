import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/Ionicons';
import LinearGradient from 'react-native-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { colors, spacing, typography, borderRadius } from '../../theme';

interface SubscriptionPlan {
  id: string;
  name: string;
  description: string;
  price: number;
  billingPeriod: 'monthly' | 'yearly';
  features: string[];
  popular?: boolean;
  trialDays?: number;
}

interface SubscriptionStatus {
  isActive: boolean;
  currentPlan?: string;
  nextBillingDate?: string;
  cancelAtPeriodEnd?: boolean;
}

const SubscriptionScreen: React.FC = () => {
  const navigation = useNavigation();
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
  });
  const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState<string | null>(null);

  useEffect(() => {
    loadSubscriptionData();
  }, []);

  const loadSubscriptionData = async () => {
    try {
      // Load subscription plans
      const plansResponse = await fetch('/api/subscription/plans', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });
      const plansData = await plansResponse.json();
      setPlans(plansData);

      // Load current subscription status
      const statusResponse = await fetch('/api/subscription/status', {
        headers: {
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
      });
      const statusData = await statusResponse.json();
      setSubscriptionStatus(statusData);

    } catch (error) {
      console.error('Failed to load subscription data:', error);
      Alert.alert('Error', 'Failed to load subscription information');
    } finally {
      setLoading(false);
    }
  };

  const getAuthToken = async () => {
    // Implementation would get token from secure storage
    return 'mock_token';
  };

  const handlePlanSelect = async (planId: string) => {
    if (purchasing) return;

    setPurchasing(planId);

    try {
      // For mobile, we'd typically use in-app purchases
      // This is a simplified implementation
      const response = await fetch('/api/subscription/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${await getAuthToken()}`,
        },
        body: JSON.stringify({
          planId,
          platform: 'mobile',
        }),
      });

      const result = await response.json();

      if (result.success) {
        Alert.alert(
          'Success!',
          'Your subscription has been activated.',
          [{ text: 'OK', onPress: () => loadSubscriptionData() }]
        );
      } else {
        throw new Error(result.message || 'Subscription failed');
      }

    } catch (error) {
      console.error('Subscription error:', error);
      Alert.alert('Error', 'Failed to process subscription. Please try again.');
    } finally {
      setPurchasing(null);
    }
  };

  const handleCancelSubscription = () => {
    Alert.alert(
      'Cancel Subscription',
      'Are you sure you want to cancel your subscription? You will lose access to premium features at the end of your billing period.',
      [
        { text: 'Keep Subscription', style: 'cancel' },
        {
          text: 'Cancel',
          style: 'destructive',
          onPress: async () => {
            try {
              await fetch('/api/subscription/cancel', {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${await getAuthToken()}`,
                },
              });
              loadSubscriptionData();
            } catch (error) {
              Alert.alert('Error', 'Failed to cancel subscription');
            }
          },
        },
      ]
    );
  };

  const formatPrice = (price: number, period: string) => {
    return `$${price}/${period === 'monthly' ? 'mo' : 'yr'}`;
  };

  const getYearlyDiscount = (monthlyPrice: number, yearlyPrice: number) => {
    const yearlyMonthly = yearlyPrice / 12;
    const discount = ((monthlyPrice - yearlyMonthly) / monthlyPrice) * 100;
    return Math.round(discount);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading subscription plans...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Icon name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Subscription Plans</Text>
        </View>

        {/* Current Subscription Status */}
        {subscriptionStatus.isActive && (
          <View style={styles.statusCard}>
            <LinearGradient
              colors={[colors.success, '#00cc66']}
              style={styles.statusGradient}
            >
              <Icon name="checkmark-circle" size={24} color="white" />
              <Text style={styles.statusTitle}>Active Subscription</Text>
              <Text style={styles.statusSubtitle}>
                {subscriptionStatus.currentPlan} Plan
              </Text>
              {subscriptionStatus.nextBillingDate && (
                <Text style={styles.statusDate}>
                  Next billing: {new Date(subscriptionStatus.nextBillingDate).toLocaleDateString()}
                </Text>
              )}
            </LinearGradient>
          </View>
        )}

        {/* Billing Period Toggle */}
        <View style={styles.billingToggle}>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              billingPeriod === 'monthly' && styles.toggleButtonActive,
            ]}
            onPress={() => setBillingPeriod('monthly')}
          >
            <Text
              style={[
                styles.toggleText,
                billingPeriod === 'monthly' && styles.toggleTextActive,
              ]}
            >
              Monthly
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.toggleButton,
              billingPeriod === 'yearly' && styles.toggleButtonActive,
            ]}
            onPress={() => setBillingPeriod('yearly')}
          >
            <Text
              style={[
                styles.toggleText,
                billingPeriod === 'yearly' && styles.toggleTextActive,
              ]}
            >
              Yearly
            </Text>
            <View style={styles.saveBadge}>
              <Text style={styles.saveBadgeText}>Save 20%</Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Subscription Plans */}
        <View style={styles.plansContainer}>
          {plans
            .filter(plan => plan.billingPeriod === billingPeriod)
            .map((plan) => (
              <View
                key={plan.id}
                style={[
                  styles.planCard,
                  plan.popular && styles.planCardPopular,
                ]}
              >
                {plan.popular && (
                  <View style={styles.popularBadge}>
                    <Text style={styles.popularBadgeText}>Most Popular</Text>
                  </View>
                )}

                <View style={styles.planHeader}>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                </View>

                <View style={styles.planPricing}>
                  <Text style={styles.planPrice}>
                    {formatPrice(plan.price, plan.billingPeriod)}
                  </Text>
                  {plan.trialDays && (
                    <Text style={styles.trialText}>
                      {plan.trialDays}-day free trial
                    </Text>
                  )}
                </View>

                <View style={styles.planFeatures}>
                  {plan.features.map((feature, index) => (
                    <View key={index} style={styles.featureItem}>
                      <Icon name="checkmark" size={16} color={colors.success} />
                      <Text style={styles.featureText}>{feature}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={[
                    styles.selectButton,
                    plan.popular && styles.selectButtonPopular,
                    subscriptionStatus.currentPlan === plan.id && styles.selectButtonCurrent,
                  ]}
                  onPress={() => handlePlanSelect(plan.id)}
                  disabled={purchasing !== null || subscriptionStatus.currentPlan === plan.id}
                >
                  {purchasing === plan.id ? (
                    <ActivityIndicator size="small" color="white" />
                  ) : (
                    <Text
                      style={[
                        styles.selectButtonText,
                        plan.popular && styles.selectButtonTextPopular,
                        subscriptionStatus.currentPlan === plan.id && styles.selectButtonTextCurrent,
                      ]}
                    >
                      {subscriptionStatus.currentPlan === plan.id
                        ? 'Current Plan'
                        : 'Get Started'
                      }
                    </Text>
                  )}
                </TouchableOpacity>
              </View>
            ))}
        </View>

        {/* Cancel Subscription */}
        {subscriptionStatus.isActive && !subscriptionStatus.cancelAtPeriodEnd && (
          <TouchableOpacity
            style={styles.cancelButton}
            onPress={handleCancelSubscription}
          >
            <Text style={styles.cancelButtonText}>Cancel Subscription</Text>
          </TouchableOpacity>
        )}

        {/* Terms and Privacy */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            By subscribing, you agree to our{' '}
            <Text style={styles.footerLink}>Terms of Service</Text> and{' '}
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </Text>
        </View>
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
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    paddingBottom: spacing.md,
  },
  backButton: {
    marginRight: spacing.md,
  },
  headerTitle: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  statusCard: {
    margin: spacing.lg,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  statusGradient: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  statusTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: typography.fontWeight.semiBold,
    color: 'white',
    marginTop: spacing.sm,
  },
  statusSubtitle: {
    fontSize: typography.fontSize.base,
    color: 'white',
    opacity: 0.9,
    marginTop: spacing.xs,
  },
  statusDate: {
    fontSize: typography.fontSize.sm,
    color: 'white',
    opacity: 0.8,
    marginTop: spacing.xs,
  },
  billingToggle: {
    flexDirection: 'row',
    margin: spacing.lg,
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.md,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
  },
  toggleButtonActive: {
    backgroundColor: colors.background,
  },
  toggleText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.medium,
    color: colors.textSecondary,
  },
  toggleTextActive: {
    color: colors.textPrimary,
  },
  saveBadge: {
    backgroundColor: colors.success,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
    marginLeft: spacing.xs,
  },
  saveBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semiBold,
    color: 'white',
  },
  plansContainer: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  planCard: {
    backgroundColor: colors.backgroundSecondary,
    borderRadius: borderRadius.lg,
    padding: spacing.lg,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  planCardPopular: {
    borderColor: colors.primary,
    backgroundColor: colors.background,
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    left: spacing.lg,
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.md,
  },
  popularBadgeText: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.semiBold,
    color: 'white',
  },
  planHeader: {
    marginBottom: spacing.lg,
  },
  planName: {
    fontSize: typography.fontSize.xl,
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  planDescription: {
    fontSize: typography.fontSize.base,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  planPricing: {
    marginBottom: spacing.lg,
  },
  planPrice: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: typography.fontWeight.bold,
    color: colors.textPrimary,
  },
  trialText: {
    fontSize: typography.fontSize.sm,
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
    marginTop: spacing.xs,
  },
  planFeatures: {
    marginBottom: spacing.lg,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  featureText: {
    fontSize: typography.fontSize.base,
    color: colors.textPrimary,
    marginLeft: spacing.sm,
    flex: 1,
  },
  selectButton: {
    backgroundColor: colors.backgroundSecondary,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  selectButtonPopular: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  selectButtonCurrent: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  selectButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: typography.fontWeight.semiBold,
    color: colors.textPrimary,
  },
  selectButtonTextPopular: {
    color: 'white',
  },
  selectButtonTextCurrent: {
    color: 'white',
  },
  cancelButton: {
    margin: spacing.lg,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: typography.fontSize.base,
    color: colors.error,
    fontWeight: typography.fontWeight.medium,
  },
  footer: {
    padding: spacing.lg,
    paddingTop: spacing.md,
  },
  footerText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  footerLink: {
    color: colors.primary,
    fontWeight: typography.fontWeight.medium,
  },
});

export default SubscriptionScreen;
