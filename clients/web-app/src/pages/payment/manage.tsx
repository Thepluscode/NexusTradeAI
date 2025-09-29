// Payment Management Page - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  TrendingUp,
  CreditCard,
  ArrowLeft,
  Calendar,
  DollarSign,
  Receipt,
  Download,
  Edit,
  Trash2,
  Plus,
  CheckCircle,
  AlertCircle,
  Shield,
  Lock,
  Eye,
  EyeOff
} from 'lucide-react';

// Import the Payment component
import PaymentManagement from '../../components/payment/PaymentManagement';

const PaymentManagePage: React.FC = () => {
  const [showCardNumbers, setShowCardNumbers] = useState(false);

  const paymentMethods = [
    {
      id: '1',
      type: 'visa',
      last4: '4242',
      expiryMonth: '12',
      expiryYear: '2025',
      isDefault: true,
      name: 'John Doe'
    },
    {
      id: '2',
      type: 'mastercard',
      last4: '8888',
      expiryMonth: '08',
      expiryYear: '2026',
      isDefault: false,
      name: 'John Doe'
    }
  ];

  const billingHistory = [
    {
      id: 'inv_001',
      date: '2024-11-15',
      amount: 29.00,
      status: 'paid',
      plan: 'Professional',
      period: 'Nov 2024'
    },
    {
      id: 'inv_002',
      date: '2024-10-15',
      amount: 29.00,
      status: 'paid',
      plan: 'Professional',
      period: 'Oct 2024'
    },
    {
      id: 'inv_003',
      date: '2024-09-15',
      amount: 29.00,
      status: 'paid',
      plan: 'Professional',
      period: 'Sep 2024'
    },
    {
      id: 'inv_004',
      date: '2024-08-15',
      amount: 0.00,
      status: 'paid',
      plan: 'Starter',
      period: 'Aug 2024'
    }
  ];

  const subscriptionInfo = {
    plan: 'Professional',
    price: 29.00,
    billingCycle: 'monthly',
    nextBilling: '2024-12-15',
    status: 'active'
  };

  const formatCardNumber = (last4: string) => {
    return showCardNumbers ? `•••• •••• •••• ${last4}` : `•••• ${last4}`;
  };

  const getCardIcon = (type: string) => {
    switch (type) {
      case 'visa':
        return '💳';
      case 'mastercard':
        return '💳';
      case 'amex':
        return '💳';
      default:
        return '💳';
    }
  };

  return (
    <>
      <Head>
        <title>Payment Management - NexusTradeAI</title>
        <meta name="description" content="Manage your subscription and payment methods" />
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
                  <div className="w-8 h-8 bg-gradient-to-br from-green-500 to-green-600 rounded-lg flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Payment Management</span>
                </div>
              </div>
              
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowCardNumbers(!showCardNumbers)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg transition-colors"
                >
                  {showCardNumbers ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </nav>

        {/* Header */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="mb-8"
          >
            <h1 className="text-3xl font-bold text-white mb-2">Payment Management</h1>
            <p className="text-slate-400 text-lg">
              Manage your subscription, payment methods, and billing history
            </p>
          </motion.div>

          {/* Current Subscription */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Current Subscription</h2>
            <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/30 border border-blue-500/50 rounded-xl p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-2xl font-bold text-white">{subscriptionInfo.plan}</h3>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${
                      subscriptionInfo.status === 'active'
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {subscriptionInfo.status.toUpperCase()}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <div className="text-slate-400">Price</div>
                      <div className="text-white font-semibold">${subscriptionInfo.price}/month</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Billing Cycle</div>
                      <div className="text-white font-semibold capitalize">{subscriptionInfo.billingCycle}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Next Billing</div>
                      <div className="text-white font-semibold">{subscriptionInfo.nextBilling}</div>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-3">
                  <Link
                    href="/auth/subscription"
                    className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
                  >
                    Change Plan
                  </Link>
                  <button className="bg-slate-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-600 transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Payment Methods */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="mb-8"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Payment Methods</h2>
              <button className="flex items-center space-x-2 bg-green-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-green-700 transition-colors">
                <Plus className="w-4 h-4" />
                <span>Add Card</span>
              </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {paymentMethods.map((method) => (
                <div key={method.id} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{getCardIcon(method.type)}</span>
                      <div>
                        <div className="text-white font-semibold">{formatCardNumber(method.last4)}</div>
                        <div className="text-slate-400 text-sm">{method.expiryMonth}/{method.expiryYear}</div>
                      </div>
                    </div>
                    {method.isDefault && (
                      <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-medium">
                        Default
                      </div>
                    )}
                  </div>
                  
                  <div className="text-slate-400 text-sm mb-4">{method.name}</div>
                  
                  <div className="flex space-x-2">
                    <button className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                      <Edit className="w-4 h-4" />
                      <span>Edit</span>
                    </button>
                    {!method.isDefault && (
                      <button className="flex items-center space-x-1 text-red-400 hover:text-red-300 text-sm transition-colors">
                        <Trash2 className="w-4 h-4" />
                        <span>Remove</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Billing History */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.3 }}
            className="mb-8"
          >
            <h2 className="text-xl font-bold text-white mb-6">Billing History</h2>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-700/50">
                    <tr>
                      <th className="text-left p-4 text-slate-300 font-medium">Invoice</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Date</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Plan</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Period</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Amount</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Status</th>
                      <th className="text-left p-4 text-slate-300 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {billingHistory.map((invoice) => (
                      <tr key={invoice.id} className="border-t border-slate-700/50">
                        <td className="p-4 text-white font-mono text-sm">{invoice.id}</td>
                        <td className="p-4 text-slate-300">{invoice.date}</td>
                        <td className="p-4 text-white">{invoice.plan}</td>
                        <td className="p-4 text-slate-300">{invoice.period}</td>
                        <td className="p-4 text-white font-semibold">
                          ${invoice.amount.toFixed(2)}
                        </td>
                        <td className="p-4">
                          <div className={`inline-flex items-center space-x-1 px-2 py-1 rounded-full text-xs font-medium ${
                            invoice.status === 'paid'
                              ? 'bg-green-500/20 text-green-400'
                              : 'bg-red-500/20 text-red-400'
                          }`}>
                            {invoice.status === 'paid' ? (
                              <CheckCircle className="w-3 h-3" />
                            ) : (
                              <AlertCircle className="w-3 h-3" />
                            )}
                            <span className="capitalize">{invoice.status}</span>
                          </div>
                        </td>
                        <td className="p-4">
                          <button className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                            <Download className="w-4 h-4" />
                            <span>Download</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </motion.div>

          {/* Payment Management Component */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.4 }}
            className="mb-8"
          >
            <PaymentManagement />
          </motion.div>

          {/* Security Notice */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.5 }}
            className="bg-gradient-to-r from-slate-800/50 to-slate-700/50 border border-slate-600/50 rounded-xl p-6"
          >
            <div className="flex items-center space-x-3 mb-4">
              <Shield className="w-8 h-8 text-green-400" />
              <h3 className="text-lg font-semibold text-white">Secure Payments</h3>
            </div>
            <p className="text-slate-400 mb-4">
              Your payment information is protected with bank-level security. We use industry-standard encryption and never store your full card details.
            </p>
            <div className="flex items-center space-x-6 text-sm">
              <div className="flex items-center space-x-2">
                <Lock className="w-4 h-4 text-green-400" />
                <span className="text-green-300">256-bit SSL Encryption</span>
              </div>
              <div className="flex items-center space-x-2">
                <Shield className="w-4 h-4 text-green-400" />
                <span className="text-green-300">PCI DSS Compliant</span>
              </div>
              <div className="flex items-center space-x-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span className="text-green-300">SOC 2 Certified</span>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </>
  );
};

export default PaymentManagePage;
