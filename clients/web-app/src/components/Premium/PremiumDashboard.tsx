import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  Sparkles,
  Cpu,
  Shield,
  Zap,
  TrendingUp,
  TrendingDown,
  Eye,
  EyeOff,
  ArrowUp,
  ArrowDown,
  BarChart3,
  Globe,
  Clock,
  DollarSign,
  Crown,
  Star,
  Target,
  Activity
} from 'lucide-react';

interface PremiumDashboardProps {
  // No props needed for now
}

interface MetricData {
  label: string;
  value: string;
  change: number;
  changePercent: number;
  icon: any;
  color: string;
  trend: number[];
}

const PremiumDashboard: React.FC<PremiumDashboardProps> = () => {
  const [showBalance, setShowBalance] = useState(true);
  const [metrics, setMetrics] = useState<MetricData[]>([]);

  useEffect(() => {
    // Initialize metrics with real-time updates
    const initialMetrics: MetricData[] = [
      {
        label: 'Portfolio Value',
        value: '$2,847,392.50',
        change: 125847,
        changePercent: 4.62,
        icon: DollarSign,
        color: 'from-green-400 to-emerald-500',
        trend: [2.1, 2.3, 2.8, 3.2, 3.8, 4.1, 4.6],
      },
      {
        label: 'Quantum ML Win Rate',
        value: '97.3%',
        change: 0.8,
        changePercent: 0.83,
        icon: Sparkles,
        color: 'from-purple-400 to-pink-500',
        trend: [96.2, 96.8, 97.1, 97.0, 97.2, 97.1, 97.3],
      },
      {
        label: 'Multi-Agent Performance',
        value: '93.6%',
        change: 1.2,
        changePercent: 1.30,
        icon: Cpu,
        color: 'from-blue-400 to-cyan-500',
        trend: [92.1, 92.8, 93.2, 93.0, 93.4, 93.2, 93.6],
      },
      {
        label: 'Risk Score',
        value: '2.4/10',
        change: -0.3,
        changePercent: -11.11,
        icon: Shield,
        color: 'from-orange-400 to-red-500',
        trend: [3.1, 2.9, 2.7, 2.8, 2.6, 2.5, 2.4],
      },
    ];

    setMetrics(initialMetrics);

    // Update metrics every 3 seconds
    const interval = setInterval(() => {
      setMetrics(prev => prev.map(metric => ({
        ...metric,
        change: metric.change + (Math.random() - 0.5) * 1000,
        changePercent: metric.changePercent + (Math.random() - 0.5) * 0.5,
        trend: [...metric.trend.slice(1), metric.trend[metric.trend.length - 1] + (Math.random() - 0.5) * 2],
      })));
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  const performanceData = [
    { period: '24H', value: '+4.62%', amount: '+$125,847' },
    { period: '7D', value: '+12.34%', amount: '+$342,156' },
    { period: '30D', value: '+28.91%', amount: '+$641,203' },
    { period: '1Y', value: '+156.78%', amount: '+$1,847,392' },
  ];

  const quickActions = [
    {
      title: 'Execute Quantum Strategy',
      description: 'Deploy AI-powered quantum arbitrage',
      icon: Sparkles,
      color: 'from-purple-500 to-pink-600',
      action: () => console.log('Navigate to quantum'),
    },
    {
      title: 'Multi-Agent Trading',
      description: 'Activate coordinated AI agents',
      icon: Cpu,
      color: 'from-blue-500 to-cyan-600',
      action: () => console.log('Navigate to trading'),
    },
    {
      title: 'Risk Analysis',
      description: 'Real-time portfolio assessment',
      icon: Shield,
      color: 'from-orange-500 to-red-600',
      action: () => console.log('Navigate to risk'),
    },
    {
      title: 'Smart Orders',
      description: 'Institutional execution routing',
      icon: Zap,
      color: 'from-green-500 to-emerald-600',
      action: () => console.log('Navigate to orders'),
    },
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
      },
    },
  };

  const itemVariants = {
    hidden: { y: 20, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        duration: 0.5,
        ease: 'easeOut',
      },
    },
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Hero Section */}
      <motion.div variants={itemVariants} className="text-center space-y-6">
        <div className="relative">
          <motion.h1
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.6, ease: 'easeOut' }}
            className="text-6xl font-bold bg-gradient-to-r from-blue-400 via-purple-500 to-pink-500 bg-clip-text text-transparent"
          >
            NexusTradeAI
          </motion.h1>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: '100%' }}
            transition={{ delay: 0.5, duration: 0.8 }}
            className="h-1 bg-gradient-to-r from-blue-500 to-purple-600 mx-auto mt-4 rounded-full"
            style={{ maxWidth: '400px' }}
          />
        </div>
        
        <motion.p
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="text-2xl text-gray-300 max-w-4xl mx-auto leading-relaxed"
        >
          Enterprise-grade institutional trading platform powered by{' '}
          <span className="text-purple-400 font-semibold">quantum-enhanced AI</span> and{' '}
          <span className="text-blue-400 font-semibold">multi-agent systems</span>
        </motion.p>

        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="flex items-center justify-center space-x-2 text-green-400"
        >
          <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
          <span className="text-lg font-medium">Live Trading Active</span>
        </motion.div>
      </motion.div>

      {/* Key Metrics */}
      <motion.div variants={itemVariants} className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {metrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 + index * 0.1, duration: 0.6 }}
            className="nexus-metric-card group cursor-pointer"
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${metric.color} flex items-center justify-center`}>
                <metric.icon className="h-6 w-6 text-white" />
              </div>
              <button
                onClick={() => setShowBalance(!showBalance)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                {showBalance ? (
                  <Eye className="h-4 w-4 text-gray-400" />
                ) : (
                  <EyeOff className="h-4 w-4 text-gray-400" />
                )}
              </button>
            </div>

            <div className="space-y-2">
              <div className="nexus-metric-value">
                {showBalance ? metric.value : '••••••'}
              </div>
              <div className="nexus-metric-label">{metric.label}</div>
              
              {showBalance && (
                <div className={`flex items-center space-x-1 text-sm ${
                  metric.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {metric.changePercent >= 0 ? (
                    <ArrowUp className="h-4 w-4" />
                  ) : (
                    <ArrowDown className="h-4 w-4" />
                  )}
                  <span>{Math.abs(metric.changePercent).toFixed(2)}%</span>
                </div>
              )}
            </div>

            {/* Mini Trend Chart */}
            {showBalance && (
              <div className="mt-4 h-8 flex items-end space-x-1">
                {metric.trend.map((point, i) => (
                  <div
                    key={i}
                    className={`flex-1 bg-gradient-to-t ${metric.color} rounded-sm opacity-60 group-hover:opacity-100 transition-opacity`}
                    style={{ height: `${(point / Math.max(...metric.trend)) * 100}%` }}
                  />
                ))}
              </div>
            )}
          </motion.div>
        ))}
      </motion.div>

      {/* Performance Overview */}
      <motion.div variants={itemVariants} className="nexus-glass-card p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-white">Performance Overview</h2>
          <div className="flex items-center space-x-2 text-green-400">
            <TrendingUp className="h-5 w-5" />
            <span className="font-medium">All Time High</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {performanceData.map((item, index) => (
            <motion.div
              key={item.period}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: 0.3 + index * 0.1, duration: 0.5 }}
              className="text-center p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <div className="text-sm text-gray-400 mb-2">{item.period}</div>
              <div className="text-2xl font-bold text-green-400 mb-1">{item.value}</div>
              <div className="text-sm text-gray-300">{item.amount}</div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Quick Actions */}
      <motion.div variants={itemVariants} className="space-y-6">
        <h2 className="text-2xl font-bold text-white text-center">Quick Actions</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {quickActions.map((action, index) => (
            <motion.button
              key={action.title}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4 + index * 0.1, duration: 0.6 }}
              onClick={action.action}
              className="nexus-glass-card p-6 text-left group hover:scale-105 transition-all duration-300"
              whileHover={{ y: -5 }}
              whileTap={{ scale: 0.98 }}
            >
              <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <action.icon className="h-7 w-7 text-white" />
              </div>
              
              <h3 className="text-lg font-semibold text-white mb-2 group-hover:text-blue-300 transition-colors">
                {action.title}
              </h3>
              
              <p className="text-gray-400 text-sm group-hover:text-gray-300 transition-colors">
                {action.description}
              </p>
              
              <div className="mt-4 flex items-center text-blue-400 text-sm font-medium">
                <span>Launch</span>
                <ArrowUp className="h-4 w-4 ml-2 transform rotate-45 group-hover:translate-x-1 group-hover:-translate-y-1 transition-transform" />
              </div>
            </motion.button>
          ))}
        </div>
      </motion.div>

      {/* Revenue Model */}
      <motion.div variants={itemVariants} className="nexus-glass-card p-8">
        <h2 className="text-3xl font-bold text-center mb-8">
          <span className="bg-gradient-to-r from-green-400 to-blue-500 bg-clip-text text-transparent">
            $100M+ Monthly Revenue Target
          </span>
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {[
            { tier: 'Retail', price: '$29', features: ['Basic AI predictions', 'Standard execution', 'Mobile & web access'], highlight: false },
            { tier: 'Professional', price: '$99', features: ['Advanced AI strategies', 'Smart order routing', 'Desktop application', 'Priority support'], highlight: true },
            { tier: 'Institutional', price: '$999', features: ['Quantum ML strategies', 'Dark pool access', 'Multi-agent systems', 'Dedicated support'], highlight: false },
          ].map((plan, index) => (
            <motion.div
              key={plan.tier}
              initial={{ y: 30, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.6 }}
              className={`p-6 rounded-xl border ${
                plan.highlight
                  ? 'border-blue-500 bg-blue-500/10 scale-105'
                  : 'border-gray-700 bg-gray-800/50'
              } hover:scale-105 transition-all duration-300`}
            >
              <h3 className="text-xl font-bold text-white mb-2">{plan.tier}</h3>
              <div className="text-3xl font-bold mb-4">
                <span className={plan.highlight ? 'text-blue-400' : 'text-green-400'}>
                  {plan.price}
                </span>
                <span className="text-gray-400 text-lg">/month</span>
              </div>
              
              <ul className="space-y-2">
                {plan.features.map((feature, i) => (
                  <li key={i} className="flex items-center text-gray-300 text-sm">
                    <div className="w-2 h-2 bg-green-400 rounded-full mr-3"></div>
                    {feature}
                  </li>
                ))}
              </ul>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PremiumDashboard;
