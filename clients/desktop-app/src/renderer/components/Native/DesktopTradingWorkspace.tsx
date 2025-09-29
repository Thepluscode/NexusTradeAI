import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSelector, useDispatch } from 'react-redux';
import { RootState } from '../../store/store';
import {
  TrendingUp,
  TrendingDown,
  Monitor,
  Cpu,
  HardDrive,
  Wifi,
  Battery,
  Volume2,
  Settings,
  Maximize2,
  Minimize2,
  X,
  Bell,
  Shield,
  Zap,
  Brain,
  Activity,
  BarChart3,
  PieChart,
  Target,
  Clock,
  Database,
  Globe,
  Lock,
  Unlock,
  Power,
  RefreshCw
} from 'lucide-react';

// Native Desktop Integration Interfaces
interface SystemMetrics {
  cpu: number;
  memory: number;
  disk: number;
  network: number;
  battery?: number;
  temperature: number;
}

interface WindowState {
  isMaximized: boolean;
  isMinimized: boolean;
  isAlwaysOnTop: boolean;
  opacity: number;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

interface NotificationSettings {
  enabled: boolean;
  sound: boolean;
  desktop: boolean;
  priority: 'low' | 'normal' | 'high' | 'critical';
  filters: string[];
}

interface HotKeyBinding {
  id: string;
  combination: string;
  action: string;
  description: string;
  enabled: boolean;
}

interface PerformanceProfile {
  name: string;
  cpuPriority: 'low' | 'normal' | 'high' | 'realtime';
  memoryLimit: number;
  networkPriority: boolean;
  gpuAcceleration: boolean;
  backgroundProcessing: boolean;
}

const DesktopTradingWorkspace: React.FC = () => {
  const dispatch = useDispatch();
  const { user } = useSelector((state: RootState) => state.auth);
  const { portfolio } = useSelector((state: RootState) => state.portfolio);

  // Native desktop states
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>({
    cpu: 0,
    memory: 0,
    disk: 0,
    network: 0,
    battery: 85,
    temperature: 45
  });

  const [windowState, setWindowState] = useState<WindowState>({
    isMaximized: false,
    isMinimized: false,
    isAlwaysOnTop: false,
    opacity: 1.0,
    position: { x: 100, y: 100 },
    size: { width: 1400, height: 900 }
  });

  const [notifications, setNotifications] = useState<NotificationSettings>({
    enabled: true,
    sound: true,
    desktop: true,
    priority: 'normal',
    filters: ['price_alerts', 'order_fills', 'system_status']
  });

  const [performanceProfile, setPerformanceProfile] = useState<PerformanceProfile>({
    name: 'High Performance',
    cpuPriority: 'high',
    memoryLimit: 8192,
    networkPriority: true,
    gpuAcceleration: true,
    backgroundProcessing: true
  });

  const [hotKeys] = useState<HotKeyBinding[]>([
    { id: 'quick_buy', combination: 'Ctrl+B', action: 'openQuickBuy', description: 'Quick Buy Order', enabled: true },
    { id: 'quick_sell', combination: 'Ctrl+S', action: 'openQuickSell', description: 'Quick Sell Order', enabled: true },
    { id: 'emergency_stop', combination: 'Ctrl+Shift+X', action: 'emergencyStop', description: 'Emergency Stop All', enabled: true },
    { id: 'toggle_charts', combination: 'F1', action: 'toggleCharts', description: 'Toggle Chart View', enabled: true },
    { id: 'focus_orderbook', combination: 'F2', action: 'focusOrderBook', description: 'Focus Order Book', enabled: true },
    { id: 'screenshot', combination: 'Ctrl+Shift+S', action: 'takeScreenshot', description: 'Take Screenshot', enabled: true }
  ]);

  // Mock system metrics simulation
  useEffect(() => {
    const interval = setInterval(() => {
      setSystemMetrics(prev => ({
        cpu: Math.max(0, Math.min(100, prev.cpu + (Math.random() - 0.5) * 10)),
        memory: Math.max(0, Math.min(100, prev.memory + (Math.random() - 0.5) * 5)),
        disk: Math.max(0, Math.min(100, prev.disk + (Math.random() - 0.5) * 2)),
        network: Math.max(0, Math.min(100, Math.random() * 100)),
        battery: prev.battery ? Math.max(0, Math.min(100, prev.battery - 0.1)) : undefined,
        temperature: Math.max(30, Math.min(80, prev.temperature + (Math.random() - 0.5) * 2))
      }));
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Native window controls
  const handleWindowControl = useCallback((action: 'minimize' | 'maximize' | 'close' | 'pin') => {
    switch (action) {
      case 'minimize':
        setWindowState(prev => ({ ...prev, isMinimized: true }));
        // In real app: window.electronAPI.minimize()
        break;
      case 'maximize':
        setWindowState(prev => ({ ...prev, isMaximized: !prev.isMaximized }));
        // In real app: window.electronAPI.maximize()
        break;
      case 'close':
        // In real app: window.electronAPI.close()
        console.log('Closing application...');
        break;
      case 'pin':
        setWindowState(prev => ({ ...prev, isAlwaysOnTop: !prev.isAlwaysOnTop }));
        // In real app: window.electronAPI.setAlwaysOnTop(!windowState.isAlwaysOnTop)
        break;
    }
  }, []);

  // Performance optimization
  const optimizePerformance = useCallback(() => {
    // In real app: window.electronAPI.setPerformanceProfile(performanceProfile)
    console.log('Optimizing performance with profile:', performanceProfile);
  }, [performanceProfile]);

  // Native notifications
  const sendNativeNotification = useCallback((title: string, body: string, priority: 'low' | 'normal' | 'high' | 'critical' = 'normal') => {
    if (!notifications.enabled) return;

    // In real app: window.electronAPI.showNotification({ title, body, priority, sound: notifications.sound })
    console.log('Native notification:', { title, body, priority });
  }, [notifications]);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const getMetricColor = (value: number, type: 'cpu' | 'memory' | 'disk' | 'network' | 'temperature') => {
    if (type === 'temperature') {
      if (value > 70) return '#ff4444';
      if (value > 60) return '#ffaa00';
      return '#00ff88';
    }
    
    if (value > 80) return '#ff4444';
    if (value > 60) return '#ffaa00';
    return '#00ff88';
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white overflow-hidden">
      {/* Custom Title Bar */}
      <div className="h-8 bg-slate-900/95 backdrop-blur-sm border-b border-slate-700 flex items-center justify-between px-4 select-none">
        <div className="flex items-center space-x-3">
          <div className="w-5 h-5 bg-gradient-to-r from-blue-500 to-purple-600 rounded flex items-center justify-center">
            <Brain className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-medium">NexusTradeAI Desktop</span>
          <div className="flex items-center space-x-1 text-xs text-slate-400">
            <span>•</span>
            <span>{user?.name || 'Professional Trader'}</span>
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleWindowControl('pin')}
            className={`w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center transition-colors ${
              windowState.isAlwaysOnTop ? 'text-blue-400' : 'text-slate-400'
            }`}
          >
            {windowState.isAlwaysOnTop ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
          </button>
          <button
            onClick={() => handleWindowControl('minimize')}
            className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <Minimize2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleWindowControl('maximize')}
            className="w-6 h-6 rounded hover:bg-slate-700 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
          </button>
          <button
            onClick={() => handleWindowControl('close')}
            className="w-6 h-6 rounded hover:bg-red-600 flex items-center justify-center text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="h-[calc(100vh-2rem)] flex">
        {/* Left Sidebar - System Monitoring */}
        <div className="w-80 bg-slate-800/50 backdrop-blur-sm border-r border-slate-700 p-4 overflow-y-auto">
          {/* System Performance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center space-x-2">
              <Monitor className="w-4 h-4 text-blue-400" />
              <span>System Performance</span>
            </h3>

            <div className="space-y-3">
              {[
                { label: 'CPU Usage', value: systemMetrics.cpu, icon: Cpu, unit: '%' },
                { label: 'Memory', value: systemMetrics.memory, icon: HardDrive, unit: '%' },
                { label: 'Disk I/O', value: systemMetrics.disk, icon: Database, unit: '%' },
                { label: 'Network', value: systemMetrics.network, icon: Wifi, unit: '%' }
              ].map((metric) => {
                const Icon = metric.icon;
                return (
                  <div key={metric.label} className="bg-slate-900/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center space-x-2">
                        <Icon className="w-4 h-4 text-slate-400" />
                        <span className="text-xs text-slate-400">{metric.label}</span>
                      </div>
                      <span className="text-sm font-medium" style={{ color: getMetricColor(metric.value, metric.label.toLowerCase() as any) }}>
                        {metric.value.toFixed(1)}{metric.unit}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-700 rounded">
                      <div 
                        className="h-full rounded transition-all duration-300"
                        style={{ 
                          width: `${metric.value}%`,
                          backgroundColor: getMetricColor(metric.value, metric.label.toLowerCase() as any)
                        }}
                      />
                    </div>
                  </div>
                );
              })}

              {/* Temperature & Battery */}
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-slate-900/50 rounded-lg p-3">
                  <div className="flex items-center space-x-2 mb-1">
                    <Activity className="w-3 h-3 text-slate-400" />
                    <span className="text-xs text-slate-400">Temp</span>
                  </div>
                  <div className="text-sm font-medium" style={{ color: getMetricColor(systemMetrics.temperature, 'temperature') }}>
                    {systemMetrics.temperature.toFixed(0)}°C
                  </div>
                </div>

                {systemMetrics.battery && (
                  <div className="bg-slate-900/50 rounded-lg p-3">
                    <div className="flex items-center space-x-2 mb-1">
                      <Battery className="w-3 h-3 text-slate-400" />
                      <span className="text-xs text-slate-400">Battery</span>
                    </div>
                    <div className="text-sm font-medium text-green-400">
                      {systemMetrics.battery.toFixed(0)}%
                    </div>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Performance Profile */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="mb-6"
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center space-x-2">
              <Zap className="w-4 h-4 text-orange-400" />
              <span>Performance Profile</span>
            </h3>

            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">{performanceProfile.name}</span>
                <button
                  onClick={optimizePerformance}
                  className="px-2 py-1 bg-orange-600 hover:bg-orange-700 rounded text-xs font-medium transition-colors"
                >
                  Optimize
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">CPU Priority:</span>
                  <span className="text-orange-400 font-medium">{performanceProfile.cpuPriority.toUpperCase()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Memory Limit:</span>
                  <span className="text-orange-400 font-medium">{performanceProfile.memoryLimit}MB</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">GPU Acceleration:</span>
                  <span className={`font-medium ${performanceProfile.gpuAcceleration ? 'text-green-400' : 'text-red-400'}`}>
                    {performanceProfile.gpuAcceleration ? 'ON' : 'OFF'}
                  </span>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Hotkeys */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mb-6"
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center space-x-2">
              <Target className="w-4 h-4 text-purple-400" />
              <span>Hotkeys</span>
            </h3>

            <div className="space-y-2">
              {hotKeys.slice(0, 4).map((hotkey) => (
                <div key={hotkey.id} className="bg-slate-900/50 rounded-lg p-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-slate-300">{hotkey.description}</span>
                    <span className="text-xs font-mono bg-slate-700 px-2 py-1 rounded text-purple-400">
                      {hotkey.combination}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Notifications */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <h3 className="text-sm font-semibold mb-4 flex items-center space-x-2">
              <Bell className="w-4 h-4 text-blue-400" />
              <span>Notifications</span>
            </h3>

            <div className="bg-slate-900/50 rounded-lg p-3">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm">Desktop Notifications</span>
                <button
                  onClick={() => setNotifications(prev => ({ ...prev, enabled: !prev.enabled }))}
                  className={`w-8 h-4 rounded-full transition-colors ${
                    notifications.enabled ? 'bg-blue-600' : 'bg-slate-600'
                  }`}
                >
                  <div className={`w-3 h-3 bg-white rounded-full transition-transform ${
                    notifications.enabled ? 'translate-x-4' : 'translate-x-0.5'
                  }`} />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Sound:</span>
                  <span className={`font-medium ${notifications.sound ? 'text-green-400' : 'text-red-400'}`}>
                    {notifications.sound ? 'ON' : 'OFF'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Priority:</span>
                  <span className="text-blue-400 font-medium">{notifications.priority.toUpperCase()}</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Main Trading Area */}
        <div className="flex-1 p-6 overflow-y-auto">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6"
          >
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent mb-2">
              Desktop Trading Workspace
            </h1>
            <p className="text-slate-400">
              Native desktop integration with system-level optimizations and professional trader workflows
            </p>
          </motion.div>

          {/* Portfolio Overview */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6 mb-6"
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Portfolio Performance</h2>
              <div className="flex items-center space-x-2 text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Real-time</span>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6">
              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Total Value</span>
                  <PieChart className="w-4 h-4 text-blue-400" />
                </div>
                <div className="text-2xl font-bold">{formatCurrency(1250000)}</div>
                <div className="flex items-center text-sm text-green-400">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  +1.28%
                </div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Day P&L</span>
                  <BarChart3 className="w-4 h-4 text-green-400" />
                </div>
                <div className="text-2xl font-bold text-green-400">+{formatCurrency(15750)}</div>
                <div className="text-sm text-slate-400">Unrealized</div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">Active Positions</span>
                  <Target className="w-4 h-4 text-purple-400" />
                </div>
                <div className="text-2xl font-bold">12</div>
                <div className="text-sm text-slate-400">Across 4 markets</div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-400 text-sm">System Latency</span>
                  <Clock className="w-4 h-4 text-orange-400" />
                </div>
                <div className="text-2xl font-bold text-orange-400">2.3ms</div>
                <div className="text-sm text-slate-400">Ultra-low</div>
              </div>
            </div>
          </motion.div>

          {/* Native Features Showcase */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="grid grid-cols-2 gap-6"
          >
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Shield className="w-5 h-5 text-green-400" />
                <span>Security Features</span>
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Hardware Encryption</span>
                  <span className="text-green-400 text-sm font-medium">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Biometric Auth</span>
                  <span className="text-green-400 text-sm font-medium">ENABLED</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Secure Enclave</span>
                  <span className="text-green-400 text-sm font-medium">PROTECTED</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center space-x-2">
                <Globe className="w-5 h-5 text-blue-400" />
                <span>Connectivity</span>
              </h3>
              
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Market Data Feed</span>
                  <span className="text-green-400 text-sm font-medium">CONNECTED</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Order Gateway</span>
                  <span className="text-green-400 text-sm font-medium">ACTIVE</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-slate-900/50 rounded-lg">
                  <span className="text-sm">Backup Connection</span>
                  <span className="text-blue-400 text-sm font-medium">STANDBY</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default DesktopTradingWorkspace;
