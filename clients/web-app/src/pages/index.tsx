// Landing Page - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  Shield,
  Smartphone,
  BarChart3,
  Target,
  CheckCircle,
  ArrowRight,
  Play,
  Star
} from 'lucide-react';

const LandingPage: React.FC = () => {
  const features = [
    {
      icon: Target,
      title: "Advanced Order Types",
      description: "Options trading, bracket orders, OCO, and professional order management",
      color: "from-blue-500 to-blue-600"
    },
    {
      icon: BarChart3,
      title: "Portfolio Analytics",
      description: "Real-time P&L, risk metrics, and comprehensive performance tracking",
      color: "from-green-500 to-green-600"
    },
    {
      icon: Shield,
      title: "Risk Management",
      description: "VaR calculations, position sizing, and automated risk controls",
      color: "from-purple-500 to-purple-600"
    },
    {
      icon: Smartphone,
      title: "Mobile Trading",
      description: "Touch-optimized interface for trading on the go",
      color: "from-orange-500 to-orange-600"
    }
  ];

  const pricingPlans = [
    {
      name: "Starter",
      price: "Free",
      description: "Perfect for beginners",
      features: [
        "Basic order types",
        "Portfolio tracking",
        "Mobile app access",
        "Email support"
      ],
      cta: "Get Started",
      popular: false
    },
    {
      name: "Professional",
      price: "$29",
      period: "/month",
      description: "For serious traders",
      features: [
        "All Starter features",
        "Advanced order types",
        "Options trading",
        "Risk analytics",
        "Priority support"
      ],
      cta: "Start Free Trial",
      popular: true
    },
    {
      name: "Enterprise",
      price: "$99",
      period: "/month",
      description: "For institutions",
      features: [
        "All Professional features",
        "API access",
        "Custom integrations",
        "Dedicated support",
        "White-label options"
      ],
      cta: "Contact Sales",
      popular: false
    }
  ];

  return (
    <>
      <Head>
        <title>NexusTradeAI - Professional Trading Platform</title>
        <meta name="description" content="Advanced trading platform with options trading, risk management, and mobile optimization" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
        <nav className="fixed top-0 w-full bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-white" />
                </div>
                <span className="text-xl font-bold text-white">NexusTradeAI</span>
              </div>
              
              <div className="hidden md:flex items-center space-x-8">
                <a href="#features" className="text-slate-300 hover:text-white transition-colors">Features</a>
                <a href="#pricing" className="text-slate-300 hover:text-white transition-colors">Pricing</a>
                <Link href="/auth/login" className="text-slate-300 hover:text-white transition-colors">
                  Login
                </Link>
                <Link href="/auth/register" className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg font-medium hover:from-blue-700 hover:to-blue-600 transition-all">
                  Get Started
                </Link>
              </div>
            </div>
          </div>
        </nav>

        {/* Hero Section */}
        <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center">
              <motion.h1
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8 }}
                className="text-5xl md:text-7xl font-bold text-white mb-6"
              >
                Professional Trading
                <span className="bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent"> Reimagined</span>
              </motion.h1>
              
              <motion.p
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.2 }}
                className="text-xl text-slate-300 mb-8 max-w-3xl mx-auto"
              >
                Advanced options trading, risk management, and portfolio analytics in a mobile-optimized platform that rivals institutional tools.
              </motion.p>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.8, delay: 0.4 }}
                className="flex flex-col sm:flex-row items-center justify-center space-y-4 sm:space-y-0 sm:space-x-4"
              >
                <Link href="/auth/register" className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-blue-600 transition-all transform hover:scale-105">
                  Start Trading Now
                </Link>
                <Link href="/demo/trading-dashboard" className="flex items-center space-x-2 bg-slate-800 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:bg-slate-700 transition-all">
                  <Play className="w-5 h-5" />
                  <span>View Demo</span>
                </Link>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section id="features" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white mb-4">Professional Trading Features</h2>
              <p className="text-xl text-slate-400">Everything you need for advanced trading</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 hover:bg-slate-700/50 transition-all cursor-pointer"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${feature.color} rounded-lg flex items-center justify-center mb-4`}>
                    <feature.icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-semibold text-white mb-2">{feature.title}</h3>
                  <p className="text-slate-400">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-bold text-blue-400 mb-2">$2.5B+</div>
                <div className="text-slate-400">Trading Volume</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-green-400 mb-2">50K+</div>
                <div className="text-slate-400">Active Traders</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-purple-400 mb-2">99.9%</div>
                <div className="text-slate-400">Uptime</div>
              </div>
              <div>
                <div className="text-4xl font-bold text-orange-400 mb-2">24/7</div>
                <div className="text-slate-400">Support</div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white mb-4">Choose Your Plan</h2>
              <p className="text-xl text-slate-400">Start free, upgrade when you're ready</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {pricingPlans.map((plan, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  className={`relative bg-slate-800/50 border rounded-xl p-8 ${
                    plan.popular ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-700/50'
                  }`}
                >
                  {plan.popular && (
                    <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                      <span className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-1 rounded-full text-sm font-medium">
                        Most Popular
                      </span>
                    </div>
                  )}
                  
                  <div className="text-center mb-8">
                    <h3 className="text-2xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="text-4xl font-bold text-white mb-2">
                      {plan.price}
                      {plan.period && <span className="text-lg text-slate-400">{plan.period}</span>}
                    </div>
                    <p className="text-slate-400">{plan.description}</p>
                  </div>
                  
                  <ul className="space-y-3 mb-8">
                    {plan.features.map((feature, featureIndex) => (
                      <li key={featureIndex} className="flex items-center space-x-3">
                        <CheckCircle className="w-5 h-5 text-green-400" />
                        <span className="text-slate-300">{feature}</span>
                      </li>
                    ))}
                  </ul>
                  
                  <Link
                    href={plan.name === 'Enterprise' ? '/contact' : '/auth/register'}
                    className={`block w-full text-center py-3 rounded-lg font-semibold transition-all ${
                      plan.popular
                        ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white hover:from-blue-700 hover:to-blue-600'
                        : 'bg-slate-700 text-white hover:bg-slate-600'
                    }`}
                  >
                    {plan.cta}
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center">
            <h2 className="text-4xl font-bold text-white mb-4">Ready to Start Trading?</h2>
            <p className="text-xl text-slate-400 mb-8">
              Join thousands of professional traders using NexusTradeAI
            </p>
            <Link href="/auth/register" className="bg-gradient-to-r from-blue-600 to-blue-500 text-white px-8 py-4 rounded-xl font-semibold text-lg hover:from-blue-700 hover:to-blue-600 transition-all transform hover:scale-105 inline-flex items-center space-x-2">
              <span>Get Started Today</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>
        </section>

        {/* Footer */}
        <footer className="bg-slate-900 border-t border-slate-700 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto text-center">
            <div className="flex items-center justify-center space-x-3 mb-4">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-white" />
              </div>
              <span className="text-xl font-bold text-white">NexusTradeAI</span>
            </div>
            <p className="text-slate-400 mb-4">Professional trading platform for the modern trader.</p>
            <div className="border-t border-slate-700 pt-8 text-slate-400">
              <p>&copy; 2024 NexusTradeAI. All rights reserved.</p>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
};

export default LandingPage;
