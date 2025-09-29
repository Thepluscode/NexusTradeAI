import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChartBarIcon,
  CpuChipIcon,
  ShieldCheckIcon,
  BoltIcon,
  SparklesIcon,
  ClockIcon,
  GlobeAltIcon,
  SignalIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  BellIcon,
} from '@heroicons/react/24/outline';

interface PremiumHeaderProps {
  activeView: string;
  onViewChange: (view: string) => void;
  navigationItems: Array<{
    id: string;
    name: string;
    icon: any;
    description: string;
  }>;
}

interface SystemStatus {
  latency: number;
  uptime: number;
  ordersPerSecond: number;
  connectionStatus: 'connected' | 'disconnected' | 'error';
}

const PremiumHeader: React.FC<PremiumHeaderProps> = ({
  activeView,
  onViewChange,
  navigationItems,
}) => {
  const [systemStatus, setSystemStatus] = useState<SystemStatus>({
    latency: 0.8,
    uptime: 99.99,
    ordersPerSecond: 1247000,
    connectionStatus: 'connected',
  });

  const [currentTime, setCurrentTime] = useState(new Date());
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    // Update system status every 2 seconds
    const statusInterval = setInterval(() => {
      setSystemStatus(prev => ({
        ...prev,
        latency: 0.6 + Math.random() * 0.8, // 0.6-1.4ms
        ordersPerSecond: 1200000 + Math.floor(Math.random() * 100000),
      }));
    }, 2000);

    // Update time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(statusInterval);
      clearInterval(timeInterval);
    };
  }, []);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  };

  const formatNumber = (num: number) => {
    if (num >= 1000000) {
      return `${(num / 1000000).toFixed(1)}M`;
    }
    if (num >= 1000) {
      return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toString();
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className="nexus-premium-nav"
    >
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-center justify-between h-20">
          {/* Logo and Brand */}
          <motion.div
            initial={{ x: -50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex items-center space-x-4"
          >
            <div className="relative">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
                <SparklesIcon className="h-6 w-6 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                NexusTradeAI
              </h1>
              <p className="text-xs text-gray-400 font-medium">Institutional Platform</p>
            </div>
          </motion.div>

          {/* Navigation */}
          <motion.nav
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="hidden lg:flex items-center space-x-2"
          >
            {navigationItems.map((item, index) => (
              <motion.button
                key={item.id}
                initial={{ y: -20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                onClick={() => onViewChange(item.id)}
                className={`nexus-nav-item ${activeView === item.id ? 'active' : ''}`}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                <div className="flex items-center space-x-2">
                  <item.icon className="h-4 w-4" />
                  <span className="hidden xl:inline">{item.name}</span>
                  <span className="xl:hidden">{item.name.split(' ')[0]}</span>
                </div>
              </motion.button>
            ))}
          </motion.nav>

          {/* System Status and Controls */}
          <motion.div
            initial={{ x: 50, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.5, duration: 0.5 }}
            className="flex items-center space-x-6"
          >
            {/* System Status */}
            <div className="hidden md:flex items-center space-x-4 text-xs">
              <div className="flex items-center space-x-2">
                <div className={`nexus-status-dot ${systemStatus.connectionStatus}`}></div>
                <span className="text-gray-300">
                  {systemStatus.latency.toFixed(1)}ms
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <SignalIcon className="h-4 w-4 text-green-400" />
                <span className="text-gray-300">
                  {formatNumber(systemStatus.ordersPerSecond)}/s
                </span>
              </div>
              
              <div className="flex items-center space-x-2">
                <GlobeAltIcon className="h-4 w-4 text-blue-400" />
                <span className="text-gray-300">
                  {systemStatus.uptime}%
                </span>
              </div>
            </div>

            {/* Time */}
            <div className="hidden sm:flex flex-col items-end">
              <div className="text-sm font-mono text-white">
                {formatTime(currentTime)}
              </div>
              <div className="text-xs text-gray-400">
                {currentTime.toLocaleDateString('en-US', { 
                  month: 'short', 
                  day: 'numeric' 
                })}
              </div>
            </div>

            {/* Notifications */}
            <div className="relative">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
              >
                <BellIcon className="h-5 w-5 text-gray-300" />
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full"></div>
              </motion.button>

              <AnimatePresence>
                {showNotifications && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 top-12 w-80 bg-gray-800/95 backdrop-blur-xl border border-gray-700 rounded-xl shadow-2xl z-50"
                  >
                    <div className="p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">
                        System Notifications
                      </h3>
                      <div className="space-y-3">
                        <div className="flex items-start space-x-3 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                          <div className="w-2 h-2 bg-green-400 rounded-full mt-2"></div>
                          <div>
                            <p className="text-sm text-green-300 font-medium">
                              Quantum ML Strategy Active
                            </p>
                            <p className="text-xs text-gray-400">
                              97.3% win rate maintained
                            </p>
                          </div>
                        </div>
                        
                        <div className="flex items-start space-x-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                          <div className="w-2 h-2 bg-blue-400 rounded-full mt-2"></div>
                          <div>
                            <p className="text-sm text-blue-300 font-medium">
                              New Market Opportunity
                            </p>
                            <p className="text-xs text-gray-400">
                              BTC arbitrage detected
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* User Profile */}
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className="flex items-center space-x-2 p-2 rounded-lg bg-gray-800/50 hover:bg-gray-700/50 transition-colors"
            >
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <UserCircleIcon className="h-5 w-5 text-white" />
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-sm font-medium text-white">Admin</div>
                <div className="text-xs text-gray-400">Institutional</div>
              </div>
            </motion.button>
          </div>
        </div>
      </div>
    </motion.header>
  );
};

export default PremiumHeader;
