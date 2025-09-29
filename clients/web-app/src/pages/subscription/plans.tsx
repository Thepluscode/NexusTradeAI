// Subscription Plans Page - NexusTradeAI

import React from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft, Shield, Zap, Crown } from 'lucide-react';

// Import the SubscriptionPlans component
import SubscriptionPlans from '../../components/subscription/SubscriptionPlans';

const SubscriptionPlansPage: React.FC = () => {
  const handlePlanSelect = (planId: string) => {
    console.log('Selected plan:', planId);
    // Here you would typically redirect to payment or handle the subscription
    alert(`You selected the ${planId} plan! Redirecting to payment...`);
  };

  return (
    <>
      <Head>
        <title>Subscription Plans - NexusTradeAI</title>
        <meta name="description" content="Choose the perfect trading plan for your needs with NexusTradeAI's AI-powered trading platform" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
        <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <Link href="/dashboard" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back to Dashboard</span>
                </Link>
                <div className="w-px h-6 bg-slate-700"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                    <Crown className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Subscription Plans</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <Link 
                  href="/auth/login"
                  className="text-slate-400 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link 
                  href="/auth/register"
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-12"
          >
            <h1 className="text-5xl font-bold text-white mb-6">
              Choose Your Trading
              <span className="block bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Success Plan
              </span>
            </h1>
            <p className="text-xl text-slate-300 max-w-3xl mx-auto mb-8">
              Unlock the power of AI-driven trading with our professional-grade algorithms. 
              Join thousands of successful traders who trust NexusTradeAI.
            </p>
            
            {/* Trust Indicators */}
            <div className="flex items-center justify-center gap-8 mb-12">
              <div className="flex items-center space-x-2 text-slate-300">
                <Shield className="w-5 h-5 text-green-400" />
                <span className="text-sm">Bank-level Security</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300">
                <Zap className="w-5 h-5 text-blue-400" />
                <span className="text-sm">Real-time Execution</span>
              </div>
              <div className="flex items-center space-x-2 text-slate-300">
                <Crown className="w-5 h-5 text-purple-400" />
                <span className="text-sm">Premium Support</span>
              </div>
            </div>
          </motion.div>

          {/* Subscription Plans Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="bg-white rounded-3xl p-8 shadow-2xl"
          >
            <SubscriptionPlans 
              onPlanSelect={handlePlanSelect}
              showSubscriptionCTA={true}
            />
          </motion.div>

          {/* Additional Features Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8"
          >
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Zap className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Lightning Fast</h3>
              <p className="text-slate-400">
                Execute trades in milliseconds with our optimized infrastructure
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Secure & Reliable</h3>
              <p className="text-slate-400">
                Bank-grade security with 99.9% uptime guarantee
              </p>
            </div>

            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 text-center">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mx-auto mb-4">
                <Crown className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-xl font-semibold text-white mb-2">Premium Support</h3>
              <p className="text-slate-400">
                24/7 expert support from our trading specialists
              </p>
            </div>
          </motion.div>

          {/* FAQ Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-16 bg-slate-800/50 border border-slate-700/50 rounded-xl p-8"
          >
            <h2 className="text-2xl font-bold text-white mb-8 text-center">Frequently Asked Questions</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Can I change plans anytime?</h3>
                <p className="text-slate-400">Yes, you can upgrade or downgrade your plan at any time. Changes take effect immediately.</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Is there a free trial?</h3>
                <p className="text-slate-400">Yes, all plans come with a 14-day free trial. No credit card required to start.</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">What payment methods do you accept?</h3>
                <p className="text-slate-400">We accept all major credit cards, PayPal, and bank transfers for annual plans.</p>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Is my data secure?</h3>
                <p className="text-slate-400">Absolutely. We use bank-level encryption and never store your trading credentials.</p>
              </div>
            </div>
          </motion.div>

          {/* Contact Section */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-16 text-center"
          >
            <h2 className="text-2xl font-bold text-white mb-4">Need Help Choosing?</h2>
            <p className="text-slate-400 mb-6">
              Our trading experts are here to help you select the perfect plan for your needs.
            </p>
            <div className="flex items-center justify-center gap-4">
              <Link 
                href="/contact"
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors"
              >
                Contact Sales
              </Link>
              <Link 
                href="/demo"
                className="border border-slate-600 text-white px-6 py-3 rounded-lg hover:bg-slate-800 transition-colors"
              >
                Book a Demo
              </Link>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default SubscriptionPlansPage;
