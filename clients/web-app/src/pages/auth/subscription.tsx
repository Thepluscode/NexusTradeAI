// Subscription Selection Page - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Crown,
  Zap,
  Shield,
  Star,
  CreditCard,
  Gift,
  Loader2
} from 'lucide-react';

const SubscriptionPage: React.FC = () => {
  const router = useRouter();
  const [selectedPlan, setSelectedPlan] = useState('professional');
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [loading, setLoading] = useState(false);

  const plans = [
    {
      id: 'starter',
      name: 'Starter',
      description: 'Perfect for beginners',
      monthlyPrice: 0,
      yearlyPrice: 0,
      features: [
        'Basic order types (Market, Limit)',
        'Portfolio tracking',
        'Mobile app access',
        'Email support',
        'Basic charts and analytics',
        'Up to 10 trades per month'
      ],
      limitations: [
        'No options trading',
        'No advanced order types',
        'Limited risk analytics'
      ],
      icon: Gift,
      color: 'from-slate-500 to-slate-600',
      popular: false
    },
    {
      id: 'professional',
      name: 'Professional',
      description: 'For serious traders',
      monthlyPrice: 29,
      yearlyPrice: 290, // 2 months free
      features: [
        'All Starter features',
        'Advanced order types (Stop, OCO, Bracket)',
        'Options trading (Calls & Puts)',
        'Advanced risk analytics',
        'Portfolio VaR calculations',
        'Position sizing calculator',
        'Priority support',
        'Real-time market data',
        'Unlimited trades'
      ],
      icon: Zap,
      color: 'from-blue-500 to-blue-600',
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For institutions',
      monthlyPrice: 99,
      yearlyPrice: 990, // 2 months free
      features: [
        'All Professional features',
        'API access for algorithmic trading',
        'Custom integrations',
        'Dedicated account manager',
        'White-label options',
        'Advanced reporting',
        'Multi-user accounts',
        'Custom risk limits',
        'SLA guarantee'
      ],
      icon: Crown,
      color: 'from-purple-500 to-purple-600',
      popular: false
    }
  ];

  const handlePlanSelect = async () => {
    setLoading(true);
    
    try {
      // Simulate payment processing
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Update user plan in localStorage (mock)
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      user.plan = plans.find(p => p.id === selectedPlan)?.name || 'Starter';
      user.billingCycle = billingCycle;
      localStorage.setItem('user', JSON.stringify(user));
      
      // Redirect to dashboard
      router.push('/dashboard');
    } catch (error) {
      console.error('Subscription failed:', error);
    } finally {
      setLoading(false);
    }
  };

  const getPrice = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return 'Free';
    const price = billingCycle === 'monthly' ? plan.monthlyPrice : plan.yearlyPrice / 12;
    return `$${price.toFixed(0)}`;
  };

  const getSavings = (plan: typeof plans[0]) => {
    if (plan.monthlyPrice === 0) return null;
    const monthlyCost = plan.monthlyPrice * 12;
    const savings = monthlyCost - plan.yearlyPrice;
    return savings;
  };

  return (
    <>
      <Head>
        <title>Choose Your Plan - NexusTradeAI</title>
        <meta name="description" content="Select the perfect trading plan for your needs" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 p-4">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 pt-8">
            <Link href="/" className="inline-flex items-center space-x-3 mb-8">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-bold text-white">NexusTradeAI</span>
            </Link>
            
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
                Choose Your Trading Plan
              </h1>
              <p className="text-xl text-slate-400 max-w-2xl mx-auto">
                Start with our free plan and upgrade as your trading grows. All plans include our core trading features.
              </p>
            </motion.div>
          </div>

          {/* Billing Toggle */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex justify-center mb-12"
          >
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-1 flex">
              <button
                onClick={() => setBillingCycle('monthly')}
                className={`px-6 py-2 rounded-lg font-medium transition-all ${
                  billingCycle === 'monthly'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setBillingCycle('yearly')}
                className={`px-6 py-2 rounded-lg font-medium transition-all relative ${
                  billingCycle === 'yearly'
                    ? 'bg-blue-600 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Yearly
                <span className="absolute -top-2 -right-2 bg-green-500 text-white text-xs px-2 py-1 rounded-full">
                  Save 20%
                </span>
              </button>
            </div>
          </motion.div>

          {/* Plans Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
            {plans.map((plan, index) => (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: 0.2 + index * 0.1 }}
                className={`relative bg-slate-800/50 border rounded-2xl p-8 cursor-pointer transition-all ${
                  selectedPlan === plan.id
                    ? 'border-blue-500 ring-2 ring-blue-500/20 transform scale-105'
                    : plan.popular
                    ? 'border-blue-500/50'
                    : 'border-slate-700/50 hover:border-slate-600/50'
                }`}
                onClick={() => setSelectedPlan(plan.id)}
              >
                {plan.popular && (
                  <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                    <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium flex items-center space-x-1">
                      <Star className="w-4 h-4" />
                      <span>Most Popular</span>
                    </span>
                  </div>
                )}

                <div className="text-center mb-8">
                  <div className={`w-16 h-16 bg-gradient-to-br ${plan.color} rounded-2xl flex items-center justify-center mx-auto mb-4`}>
                    <plan.icon className="w-8 h-8 text-white" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                  <p className="text-slate-400 mb-4">{plan.description}</p>
                  
                  <div className="text-4xl font-bold text-white mb-2">
                    {getPrice(plan)}
                    {plan.monthlyPrice > 0 && (
                      <span className="text-lg text-slate-400 font-normal">
                        /{billingCycle === 'monthly' ? 'month' : 'month'}
                      </span>
                    )}
                  </div>
                  
                  {billingCycle === 'yearly' && getSavings(plan) && (
                    <div className="text-green-400 text-sm font-medium">
                      Save ${getSavings(plan)} per year
                    </div>
                  )}
                </div>

                <ul className="space-y-3 mb-8">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start space-x-3">
                      <CheckCircle className="w-5 h-5 text-green-400 mt-0.5 flex-shrink-0" />
                      <span className="text-slate-300 text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {selectedPlan === plan.id && (
                  <div className="absolute inset-0 bg-blue-500/10 rounded-2xl pointer-events-none"></div>
                )}
              </motion.div>
            ))}
          </div>

          {/* Action Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="text-center space-y-4"
          >
            <button
              onClick={handlePlanSelect}
              disabled={loading}
              className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-blue-600 transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none inline-flex items-center space-x-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Processing...</span>
                </>
              ) : (
                <>
                  {selectedPlan === 'starter' ? (
                    <span>Start Free</span>
                  ) : (
                    <>
                      <CreditCard className="w-5 h-5" />
                      <span>Continue to Payment</span>
                    </>
                  )}
                  <ArrowRight className="w-5 h-5" />
                </>
              )}
            </button>

            <div className="text-slate-400 text-sm">
              {selectedPlan === 'starter' ? (
                'No credit card required • Upgrade anytime'
              ) : (
                '14-day free trial • Cancel anytime • Secure payment'
              )}
            </div>

            <div className="pt-4">
              <Link href="/dashboard" className="text-blue-400 hover:text-blue-300 transition-colors">
                Skip for now and explore the platform
              </Link>
            </div>
          </motion.div>

          {/* Security & Trust */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16 text-center"
          >
            <div className="flex items-center justify-center space-x-8 text-slate-400">
              <div className="flex items-center space-x-2">
                <Shield className="w-5 h-5" />
                <span className="text-sm">Bank-level Security</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm">SOC 2 Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <Star className="w-5 h-5" />
                <span className="text-sm">99.9% Uptime</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default SubscriptionPage;
