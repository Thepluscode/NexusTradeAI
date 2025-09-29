import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, DollarSign, Users, Target } from 'lucide-react';

interface RevenueMetrics {
  totalRevenue: number;
  monthlyRecurringRevenue: number;
  annualRecurringRevenue: number;
  averageRevenuePerUser: number;
  customerLifetimeValue: number;
  churnRate: number;
  growthRate: number;
}

interface RevenueAnalyticsProps {
  timeRange: '7d' | '30d' | '90d' | '1y';
}

const RevenueAnalytics: React.FC<RevenueAnalyticsProps> = ({ timeRange }) => {
  const [metrics, setMetrics] = useState<RevenueMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setMetrics({
        totalRevenue: 2450000,
        monthlyRecurringRevenue: 185000,
        annualRecurringRevenue: 2220000,
        averageRevenuePerUser: 89.50,
        customerLifetimeValue: 1250,
        churnRate: 3.2,
        growthRate: 15.8
      });
      setLoading(false);
    }, 1000);
  }, [timeRange]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  if (!metrics) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-2">
          Revenue Analytics
        </h1>
        <p className="text-xl text-gray-600">Track revenue performance and growth metrics</p>
      </div>

      <div className="bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-8 text-white mb-8">
        <h2 className="text-2xl font-bold mb-4">Monthly Revenue Goal</h2>
        <div className="mb-4">
          <div className="w-full h-3 bg-white/20 rounded-full overflow-hidden mb-2">
            <div
              className="h-full bg-white/90 rounded-full transition-all duration-300"
              style={{ width: `${Math.min((metrics.monthlyRecurringRevenue / 200000) * 100, 100)}%` }}
            ></div>
          </div>
          <div className="text-sm opacity-80">
            {formatCurrency(metrics.monthlyRecurringRevenue)} of {formatCurrency(200000)} goal
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-sm opacity-80 mb-1">Current MRR</div>
            <div className="text-xl font-bold">{formatCurrency(metrics.monthlyRecurringRevenue)}</div>
          </div>
          <div>
            <div className="text-sm opacity-80 mb-1">Growth Rate</div>
            <div className="text-xl font-bold">+{metrics.growthRate}%</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {[
          {
            label: 'Total Revenue',
            value: formatCurrency(metrics.totalRevenue),
            change: '+12.5%',
            icon: DollarSign
          },
          {
            label: 'Annual Recurring Revenue',
            value: formatCurrency(metrics.annualRecurringRevenue),
            change: '+18.2%',
            icon: TrendingUp
          },
          {
            label: 'Average Revenue Per User',
            value: formatCurrency(metrics.averageRevenuePerUser),
            change: '+5.8%',
            icon: Users
          },
          {
            label: 'Customer Lifetime Value',
            value: formatCurrency(metrics.customerLifetimeValue),
            change: '+8.3%',
            icon: Target
          }
        ].map((metric, index) => (
          <motion.div
            key={metric.label}
            className="bg-white rounded-2xl p-6 shadow-lg border-l-4 border-green-500"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className="text-sm text-gray-600 font-medium">{metric.label}</div>
              <div className="flex items-center space-x-1 text-xs font-semibold text-green-600">
                <TrendingUp className="w-4 h-4" />
                <span>{metric.change}</span>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                <metric.icon className="w-5 h-5 text-blue-600" />
              </div>
              <div className="text-2xl font-bold text-gray-900">{metric.value}</div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-200">
        <h3 className="text-xl font-semibold text-gray-900 mb-4">Key Insights</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <div className="text-2xl font-bold text-green-600 mb-2">+{metrics.growthRate}%</div>
            <div className="text-sm text-gray-600">Monthly Growth Rate</div>
          </div>
          <div className="text-center p-4 bg-blue-50 rounded-lg">
            <div className="text-2xl font-bold text-blue-600 mb-2">{metrics.churnRate}%</div>
            <div className="text-sm text-gray-600">Churn Rate</div>
          </div>
          <div className="text-center p-4 bg-purple-50 rounded-lg">
            <div className="text-2xl font-bold text-purple-600 mb-2">{formatCurrency(metrics.customerLifetimeValue)}</div>
            <div className="text-sm text-gray-600">Customer LTV</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RevenueAnalytics;