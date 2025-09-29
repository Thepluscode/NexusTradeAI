import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '../store/store';
import {
  CurrencyDollarIcon,
  TrendingUpIcon,
  TrendingDownIcon,
  ChartBarIcon,
  ClockIcon,
  BellIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../utils/cn';

interface DashboardPageProps {}

const DashboardPage: React.FC<DashboardPageProps> = () => {
  const { portfolio } = useSelector((state: RootState) => state.portfolio);
  const { symbols } = useSelector((state: RootState) => state.marketData);
  const { settings } = useSelector((state: RootState) => state.desktop);
  
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  // Mock data for desktop dashboard
  const portfolioStats = {
    totalValue: 125000,
    dayChange: 2850,
    dayChangePercent: 2.34,
    totalPnL: 15420,
    totalPnLPercent: 14.1,
  };

  const quickStats = [
    {
      name: 'Portfolio Value',
      value: '$125,000',
      change: '+$2,850',
      changePercent: '+2.34%',
      icon: CurrencyDollarIcon,
      color: 'green',
    },
    {
      name: 'Today\'s P&L',
      value: '+$2,850',
      change: 'vs yesterday',
      changePercent: '+2.34%',
      icon: TrendingUpIcon,
      color: 'green',
    },
    {
      name: 'Total P&L',
      value: '+$15,420',
      change: 'all time',
      changePercent: '+14.1%',
      icon: ChartBarIcon,
      color: 'green',
    },
    {
      name: 'Active Positions',
      value: '8',
      change: '3 profitable',
      changePercent: '62.5%',
      icon: TrendingUpIcon,
      color: 'blue',
    },
  ];

  const recentActivity = [
    {
      id: '1',
      type: 'buy',
      symbol: 'BTC-USDT',
      amount: '0.5 BTC',
      price: '$43,250',
      time: '2 minutes ago',
    },
    {
      id: '2',
      type: 'sell',
      symbol: 'ETH-USDT',
      amount: '2.5 ETH',
      price: '$2,680',
      time: '15 minutes ago',
    },
    {
      id: '3',
      type: 'buy',
      symbol: 'SOL-USDT',
      amount: '50 SOL',
      price: '$98.50',
      time: '1 hour ago',
    },
  ];

  const marketAlerts = [
    {
      id: '1',
      type: 'price',
      message: 'BTC reached your target price of $43,000',
      time: '5 minutes ago',
      severity: 'info',
    },
    {
      id: '2',
      type: 'news',
      message: 'Major institutional adoption announcement',
      time: '1 hour ago',
      severity: 'success',
    },
    {
      id: '3',
      type: 'risk',
      message: 'Portfolio concentration risk detected',
      time: '2 hours ago',
      severity: 'warning',
    },
  ];

  const getStatColor = (color: string) => {
    switch (color) {
      case 'green':
        return 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30';
      case 'red':
        return 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30';
      case 'blue':
        return 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30';
      default:
        return 'text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700';
    }
  };

  const getActivityColor = (type: string) => {
    return type === 'buy' 
      ? 'text-green-600 dark:text-green-400' 
      : 'text-red-600 dark:text-red-400';
  };

  const getAlertColor = (severity: string) => {
    switch (severity) {
      case 'success':
        return 'border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20';
      case 'warning':
        return 'border-yellow-200 dark:border-yellow-800 bg-yellow-50 dark:bg-yellow-900/20';
      case 'error':
        return 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20';
      default:
        return 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            Welcome back! Here's your trading overview.
          </p>
        </div>
        
        <div className="flex items-center space-x-4">
          <div className="text-right">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {currentTime.toLocaleDateString()}
            </div>
            <div className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentTime.toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {quickStats.map((stat, index) => (
          <motion.div
            key={stat.name}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {stat.name}
                </p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                  {stat.value}
                </p>
                <div className="flex items-center space-x-1 mt-2">
                  <span className={cn('text-sm', getStatColor(stat.color))}>
                    {stat.change}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {stat.changePercent}
                  </span>
                </div>
              </div>
              
              <div className={cn('p-3 rounded-lg', getStatColor(stat.color))}>
                <stat.icon className="h-6 w-6" />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Activity
            </h2>
            <ClockIcon className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            {recentActivity.map((activity) => (
              <div key={activity.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <div className={cn('text-sm font-medium uppercase', getActivityColor(activity.type))}>
                    {activity.type}
                  </div>
                  <div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {activity.symbol}
                    </div>
                    <div className="text-sm text-gray-500 dark:text-gray-400">
                      {activity.amount}
                    </div>
                  </div>
                </div>
                
                <div className="text-right">
                  <div className="font-medium text-gray-900 dark:text-white">
                    {activity.price}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {activity.time}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Market Alerts */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.4 }}
          className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Market Alerts
            </h2>
            <BellIcon className="h-5 w-5 text-gray-400" />
          </div>
          
          <div className="space-y-4">
            {marketAlerts.map((alert) => (
              <div key={alert.id} className={cn('p-4 rounded-lg border', getAlertColor(alert.severity))}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {alert.message}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {alert.time}
                    </p>
                  </div>
                  
                  <span className={cn(
                    'px-2 py-1 text-xs font-medium rounded-full capitalize',
                    alert.severity === 'success' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    alert.severity === 'warning' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' :
                    alert.severity === 'error' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                  )}>
                    {alert.type}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default DashboardPage;
