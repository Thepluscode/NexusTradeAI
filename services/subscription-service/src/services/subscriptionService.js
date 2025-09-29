// src/services/subscriptionService.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Subscription = require('../models/Subscription');
const Plan = require('../models/Plan');
const Invoice = require('../models/Invoice');
const Usage = require('../models/Usage');

class SubscriptionService {
  constructor(options = {}) {
    this.logger = options.logger;
    this.plans = new Map();
  }

  async initialize() {
    this.logger?.info('Initializing SubscriptionService...');
    await this.loadSubscriptionPlans();
  }

  async loadSubscriptionPlans() {
    try {
      const plans = await Plan.find({ active: true });
      
      for (const plan of plans) {
        this.plans.set(plan.id, plan);
      }
      
      this.logger?.info(`Loaded ${plans.length} subscription plans`);
    } catch (error) {
      this.logger?.error('Error loading subscription plans:', error);
      throw error;
    }
  }

  async createSubscription(userId, planId, paymentMethodId, options = {}) {
    try {
      const plan = this.plans.get(planId);
      if (!plan) {
        throw new Error('Invalid plan ID');
      }

      // Create Stripe customer if not exists
      const customer = await this.getOrCreateStripeCustomer(userId);
      
      // Attach payment method to customer
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customer.id
      });

      // Set as default payment method
      await stripe.customers.update(customer.id, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Create Stripe subscription
      const stripeSubscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{
          price: plan.stripePriceId
        }],
        payment_behavior: 'default_incomplete',
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          planId
        }
      });

      // Create local subscription record
      const subscription = new Subscription({
        id: require('uuid').v4(),
        userId,
        planId,
        stripeSubscriptionId: stripeSubscription.id,
        stripeCustomerId: customer.id,
        status: stripeSubscription.status,
        currentPeriodStart: new Date(stripeSubscription.current_period_start * 1000),
        currentPeriodEnd: new Date(stripeSubscription.current_period_end * 1000),
        cancelAtPeriodEnd: stripeSubscription.cancel_at_period_end,
        metadata: options.metadata || {},
        createdAt: new Date()
      });

      await subscription.save();

      this.logger?.info(`Subscription created: ${subscription.id}`, {
        userId,
        planId,
        status: subscription.status
      });

      return {
        subscription,
        clientSecret: stripeSubscription.latest_invoice.payment_intent?.client_secret
      };

    } catch (error) {
      this.logger?.error('Error creating subscription:', error);
      throw error;
    }
  }

  async updateSubscription(subscriptionId, changes) {
    try {
      const subscription = await Subscription.findOne({ id: subscriptionId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const updateData = {};

      // Handle plan changes
      if (changes.planId && changes.planId !== subscription.planId) {
        const newPlan = this.plans.get(changes.planId);
        if (!newPlan) {
          throw new Error('Invalid new plan ID');
        }

        // Update Stripe subscription
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          items: [{
            id: subscription.stripeSubscriptionId,
            price: newPlan.stripePriceId
          }],
          proration_behavior: 'create_prorations'
        });

        updateData.planId = changes.planId;
      }

      // Handle cancellation
      if (changes.cancelAtPeriodEnd !== undefined) {
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: changes.cancelAtPeriodEnd
        });

        updateData.cancelAtPeriodEnd = changes.cancelAtPeriodEnd;
      }

      // Update local record
      await Subscription.findOneAndUpdate(
        { id: subscriptionId },
        { ...updateData, updatedAt: new Date() }
      );

      this.logger?.info(`Subscription updated: ${subscriptionId}`, updateData);

      return await Subscription.findOne({ id: subscriptionId });

    } catch (error) {
      this.logger?.error('Error updating subscription:', error);
      throw error;
    }
  }

  async cancelSubscription(subscriptionId, immediately = false) {
    try {
      const subscription = await Subscription.findOne({ id: subscriptionId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      if (immediately) {
        // Cancel immediately
        await stripe.subscriptions.del(subscription.stripeSubscriptionId);
        
        await Subscription.findOneAndUpdate(
          { id: subscriptionId },
          { 
            status: 'canceled',
            canceledAt: new Date(),
            updatedAt: new Date()
          }
        );
      } else {
        // Cancel at period end
        await stripe.subscriptions.update(subscription.stripeSubscriptionId, {
          cancel_at_period_end: true
        });
        
        await Subscription.findOneAndUpdate(
          { id: subscriptionId },
          { 
            cancelAtPeriodEnd: true,
            updatedAt: new Date()
          }
        );
      }

      this.logger?.info(`Subscription canceled: ${subscriptionId}`, {
        immediately,
        userId: subscription.userId
      });

      return await Subscription.findOne({ id: subscriptionId });

    } catch (error) {
      this.logger?.error('Error canceling subscription:', error);
      throw error;
    }
  }

  async recordUsage(userId, feature, quantity, timestamp = new Date()) {
    try {
      const subscription = await this.getActiveSubscription(userId);
      if (!subscription) {
        throw new Error('No active subscription found');
      }

      const plan = this.plans.get(subscription.planId);
      const featureLimit = plan.features[feature];

      const usage = new Usage({
        id: require('uuid').v4(),
        userId,
        subscriptionId: subscription.id,
        feature,
        quantity,
        timestamp,
        billingPeriodStart: subscription.currentPeriodStart,
        billingPeriodEnd: subscription.currentPeriodEnd
      });

      await usage.save();

      // Check if usage exceeds limits
      const periodUsage = await this.getPeriodUsage(userId, feature, 
        subscription.currentPeriodStart, subscription.currentPeriodEnd);
      
      if (featureLimit && featureLimit.limit && periodUsage > featureLimit.limit) {
        this.emit('usage_limit_exceeded', {
          userId,
          feature,
          limit: featureLimit.limit,
          usage: periodUsage
        });
      }

      return usage;

    } catch (error) {
      this.logger?.error('Error recording usage:', error);
      throw error;
    }
  }

  async getUsageAnalytics(userId, feature, period = 'current') {
    try {
      const subscription = await this.getActiveSubscription(userId);
      if (!subscription) {
        return { usage: 0, limit: 0 };
      }

      const plan = this.plans.get(subscription.planId);
      const featureConfig = plan.features[feature];

      let startDate, endDate;
      
      if (period === 'current') {
        startDate = subscription.currentPeriodStart;
        endDate = subscription.currentPeriodEnd;
      } else {
        // Handle other periods (last month, etc.)
        const now = new Date();
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      }

      const totalUsage = await this.getPeriodUsage(userId, feature, startDate, endDate);

      return {
        usage: totalUsage,
        limit: featureConfig?.limit || null,
        remaining: featureConfig?.limit ? Math.max(0, featureConfig.limit - totalUsage) : null,
        period: { startDate, endDate },
        feature
      };

    } catch (error) {
      this.logger?.error('Error getting usage analytics:', error);
      throw error;
    }
  }

  async getPeriodUsage(userId, feature, startDate, endDate) {
    try {
      const result = await Usage.aggregate([
        {
          $match: {
            userId,
            feature,
            timestamp: { $gte: startDate, $lte: endDate }
          }
        },
        {
          $group: {
            _id: null,
            totalQuantity: { $sum: '$quantity' }
          }
        }
      ]);

      return result.length > 0 ? result[0].totalQuantity : 0;

    } catch (error) {
      this.logger?.error('Error getting period usage:', error);
      return 0;
    }
  }

  async getActiveSubscription(userId) {
    try {
      return await Subscription.findOne({
        userId,
        status: { $in: ['active', 'trialing'] }
      });
    } catch (error) {
      this.logger?.error('Error getting active subscription:', error);
      return null;
    }
  }

  async getOrCreateStripeCustomer(userId) {
    try {
      // Check if customer already exists
      const existingSubscription = await Subscription.findOne({ userId });
      
      if (existingSubscription && existingSubscription.stripeCustomerId) {
        return await stripe.customers.retrieve(existingSubscription.stripeCustomerId);
      }

      // Create new customer
      const customer = await stripe.customers.create({
        metadata: { userId }
      });

      return customer;

    } catch (error) {
      this.logger?.error('Error getting or creating Stripe customer:', error);
      throw error;
    }
  }

  async generateInvoice(subscriptionId) {
    try {
      const subscription = await Subscription.findOne({ id: subscriptionId });
      if (!subscription) {
        throw new Error('Subscription not found');
      }

      const plan = this.plans.get(subscription.planId);
      const usage = await this.getSubscriptionUsage(subscriptionId);

      const invoice = new Invoice({
        id: require('uuid').v4(),
        subscriptionId,
        userId: subscription.userId,
        planId: subscription.planId,
        baseFee: plan.price,
        usageFees: this.calculateUsageFees(usage, plan),
        totalAmount: 0, // Will be calculated
        billingPeriodStart: subscription.currentPeriodStart,
        billingPeriodEnd: subscription.currentPeriodEnd,
        status: 'draft',
        createdAt: new Date()
      });

      invoice.totalAmount = invoice.baseFee + invoice.usageFees;
      await invoice.save();

      return invoice;

    } catch (error) {
      this.logger?.error('Error generating invoice:', error);
      throw error;
    }
  }

  calculateUsageFees(usage, plan) {
    let totalFees = 0;

    for (const feature in usage) {
      const featureUsage = usage[feature];
      const featureConfig = plan.features[feature];

      if (featureConfig && featureConfig.overage) {
        const overageAmount = Math.max(0, featureUsage - (featureConfig.limit || 0));
        totalFees += overageAmount * featureConfig.overage.price;
      }
    }

    return totalFees;
  }

  async getSubscriptionUsage(subscriptionId) {
    // Implementation to get usage data for subscription
    return {};
  }
}

module.exports = SubscriptionService;