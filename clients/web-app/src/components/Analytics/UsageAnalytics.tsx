import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, AlertTriangle, CheckCircle, Activity } from 'lucide-react';

interface UsageData {
  feature: string;
  usage: number;
  limit: number | null;
  remaining: number | null;
  alertLevel: 'normal' | 'warning' | 'critical';
}

interface UsageAnalyticsProps {
  userId?: string;
  timeRange?: '24h' | '7d' | '30d' | '90d';
}

const UsageAnalytics: React.FC<UsageAnalyticsProps> = ({ userId, timeRange = '30d' }) => {
  const [usageData, setUsageData] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate API call
    setTimeout(() => {
      setUsageData([
        {
          feature: 'API Calls',
          usage: 8750,
          limit: 10000,
          remaining: 1250,
          alertLevel: 'warning'
        },
        {
          feature: 'AI Predictions',
          usage: 450,
          limit: 500,
          remaining: 50,
          alertLevel: 'critical'
        },
        {
          feature: 'Real-time Data',
          usage: 2340,
          limit: 5000,
          remaining: 2660,
          alertLevel: 'normal'
        }
      ]);
      setLoading(false);
    }, 1000);
  }, [userId, timeRange]);

  const getAlertColor = (level: string) => {
    switch (level) {
      case 'critical': return 'border-red-500 bg-red-50';
      case 'warning': return 'border-yellow-500 bg-yellow-50';
      default: return 'border-green-500 bg-green-50';
    }
  };

  const getAlertIcon = (level: string) => {
    switch (level) {
      case 'critical': return <AlertTriangle className="w-5 h-5 text-red-500" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      default: return <CheckCircle className="w-5 h-5 text-green-500" />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Usage Analytics</h1>
        <p className="text-gray-600">Monitor your platform usage and limits</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
        {usageData.map((item, index) => (
          <motion.div
            key={item.feature}
            className={`bg-white rounded-xl p-6 shadow-lg border-l-4 ${getAlertColor(item.alertLevel)}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">{item.feature}</h3>
              {getAlertIcon(item.alertLevel)}
            </div>

            <div className="space-y-2">
              <div className="text-3xl font-bold text-gray-900">
                {item.usage.toLocaleString()}
              </div>

              {item.limit && (
                <>
                  <div className="text-sm text-gray-600">
                    of {item.limit.toLocaleString()} limit
                  </div>

                  <div className="w-full bg-gray-200 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        item.alertLevel === 'critical' ? 'bg-red-500' :
                        item.alertLevel === 'warning' ? 'bg-yellow-500' : 'bg-green-500'
                      }`}
                      style={{ width: `${(item.usage / item.limit) * 100}%` }}
                    ></div>
                  </div>

                  <div className="text-sm text-gray-500">
                    {item.remaining} remaining
                  </div>
                </>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default UsageAnalytics;