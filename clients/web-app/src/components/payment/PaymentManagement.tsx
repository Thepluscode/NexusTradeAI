import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CreditCard, Check, Lock, Shield, Plus, Edit, Trash2 } from 'lucide-react';

interface PaymentMethod {
  id: string;
  type: 'card';
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
  createdAt: string;
}

const PaymentManagement: React.FC = () => {
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [showAddCard, setShowAddCard] = useState(false);

  useEffect(() => {
    // Mock data - replace with actual API calls
    const mockPaymentMethods: PaymentMethod[] = [
      {
        id: 'pm_1',
        type: 'card',
        last4: '4242',
        brand: 'visa',
        expiryMonth: 12,
        expiryYear: 2025,
        isDefault: true,
        createdAt: '2024-01-15'
      }
    ];

    setPaymentMethods(mockPaymentMethods);
  }, []);

  const getCardIcon = (brand: string) => {
    switch (brand.toLowerCase()) {
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
    <div className="max-w-4xl mx-auto p-6">
      {/* Payment Methods Section */}
      <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-6 mb-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-white">Payment Methods</h2>
          <button
            onClick={() => setShowAddCard(true)}
            className="flex items-center space-x-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Add Card</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {paymentMethods.map((method) => (
            <motion.div
              key={method.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-slate-900/50 border border-slate-600/50 rounded-lg p-4"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center space-x-3">
                  <span className="text-2xl">{getCardIcon(method.brand)}</span>
                  <div>
                    <div className="text-white font-medium">•••• •••• •••• {method.last4}</div>
                    <div className="text-slate-400 text-sm">
                      {method.expiryMonth.toString().padStart(2, '0')}/{method.expiryYear}
                    </div>
                  </div>
                </div>
                {method.isDefault && (
                  <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded-full text-xs font-medium">
                    Default
                  </div>
                )}
              </div>

              <div className="flex space-x-2">
                <button className="flex items-center space-x-1 text-blue-400 hover:text-blue-300 py-2 px-3 text-sm transition-colors">
                  <Edit className="w-4 h-4" />
                  <span>Edit</span>
                </button>
                {!method.isDefault && (
                  <button className="flex items-center space-x-1 text-red-400 hover:text-red-300 py-2 px-3 text-sm transition-colors">
                    <Trash2 className="w-4 h-4" />
                    <span>Remove</span>
                  </button>
                )}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Add Card Form */}
        <AnimatePresence>
          {showAddCard && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-6 bg-slate-900/50 border border-slate-600/50 rounded-lg p-6"
            >
              <h3 className="text-lg font-semibold text-white mb-4">Add New Card</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Card Number
                  </label>
                  <input
                    type="text"
                    placeholder="1234 5678 9012 3456"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-2">
                    Cardholder Name
                  </label>
                  <input
                    type="text"
                    placeholder="John Doe"
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all"
                  />
                </div>
              </div>
              
              <div className="flex space-x-3 mt-6">
                <button className="bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700 transition-colors">
                  Add Card
                </button>
                <button
                  onClick={() => setShowAddCard(false)}
                  className="bg-slate-700 text-white px-4 py-2 rounded-lg font-medium hover:bg-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Security Notice */}
      <div className="bg-gradient-to-r from-green-900/20 to-green-800/20 border border-green-500/30 rounded-xl p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Shield className="w-8 h-8 text-green-400" />
          <h3 className="text-lg font-semibold text-white">Secure Payment Processing</h3>
        </div>
        <p className="text-green-200 mb-4">
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
            <Check className="w-4 h-4 text-green-400" />
            <span className="text-green-300">SOC 2 Certified</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentManagement;
