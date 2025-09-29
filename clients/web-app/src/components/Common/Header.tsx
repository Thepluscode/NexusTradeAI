//clients/web-app/src/components/Common/Header.tsx
import React, { useState } from 'react';
import { 
  Search, 
  Bell, 
  Settings, 
  User, 
  ChevronDown, 
  Brain,
  Activity,
  Shield,
  TrendingUp
} from 'lucide-react';

const Header: React.FC = () => {
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [notifications, setNotifications] = useState([
    { id: 1, type: 'price_alert', message: 'AAPL reached $180.00', time: '2m ago', read: false },
    { id: 2, type: 'trade_fill', message: 'Order filled: 100 TSLA @ $240.50', time: '5m ago', read: false },
    { id: 3, type: 'ai_insight', message: 'New bullish signal on BTC/USD', time: '10m ago', read: true }
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  return (
    <header className="border-b border-slate-700 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-50">
      <div className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center space-x-8">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Brain className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Nexus Trade AI
            </h1>
          </div>
          
          <nav className="flex space-x-2">
            <StatusIndicator label="Market" status="open" />
            <StatusIndicator label="AI Engine" status="active" />
            <StatusIndicator label="Risk Monitor" status="active" />
          </nav>
        </div>

        <div className="flex items-center space-x-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search symbols, news, insights..."
              className="bg-slate-800 border border-slate-600 rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:border-blue-500 w-80 transition-all"
            />
          </div>
          
          <NotificationButton count={unreadCount} notifications={notifications} />
          
          <button className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          
          <div className="relative">
            <button
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center space-x-2 bg-slate-800 hover:bg-slate-700 rounded-lg px-3 py-2 transition-colors"
            >
              <div className="w-6 h-6 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center text-xs font-bold">
                JT
              </div>
              <span className="text-sm font-medium">John Trader</span>
              <ChevronDown className="w-4 h-4 text-slate-400" />
            </button>
            
            {isProfileMenuOpen && <ProfileDropdown />}
          </div>
        </div>
      </div>
    </header>
  );
};

const StatusIndicator: React.FC<{ label: string; status: 'active' | 'open' | 'closed' | 'warning' }> = ({ 
  label, 
  status 
}) => {
  const statusConfig = {
    active: { color: 'bg-green-400', text: 'text-green-400' },
    open: { color: 'bg-green-400', text: 'text-green-400' },
    closed: { color: 'bg-red-400', text: 'text-red-400' },
    warning: { color: 'bg-yellow-400', text: 'text-yellow-400' }
  };

  return (
    <div className="flex items-center space-x-2 px-3 py-1 bg-slate-800/50 rounded-lg">
      <div className={`w-2 h-2 rounded-full ${statusConfig[status].color} animate-pulse`} />
      <span className="text-xs text-slate-300">{label}</span>
      <span className={`text-xs font-medium capitalize ${statusConfig[status].text}`}>
        {status}
      </span>
    </div>
  );
};

const NotificationButton: React.FC<{ 
  count: number; 
  notifications: Array<{ id: number; type: string; message: string; time: string; read: boolean }> 
}> = ({ count, notifications }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
            {count}
          </span>
        )}
      </button>
      
      {isOpen && (
        <div className="absolute right-0 top-12 w-80 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
          <div className="p-4 border-b border-slate-700">
            <h3 className="font-semibold">Notifications</h3>
          </div>
          <div className="max-h-64 overflow-y-auto">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={`p-3 border-b border-slate-700/50 hover:bg-slate-700/50 transition-colors ${
                  !notification.read ? 'bg-blue-500/10' : ''
                }`}
              >
                <div className="flex items-start space-x-3">
                  <NotificationIcon type={notification.type} />
                  <div className="flex-1">
                    <p className="text-sm">{notification.message}</p>
                    <p className="text-xs text-slate-400 mt-1">{notification.time}</p>
                  </div>
                  {!notification.read && (
                    <div className="w-2 h-2 bg-blue-500 rounded-full" />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const NotificationIcon: React.FC<{ type: string }> = ({ type }) => {
  const iconMap = {
    price_alert: <TrendingUp className="w-4 h-4 text-green-400" />,
    trade_fill: <Activity className="w-4 h-4 text-blue-400" />,
    ai_insight: <Brain className="w-4 h-4 text-purple-400" />,
    risk_warning: <Shield className="w-4 h-4 text-yellow-400" />
  };

  return iconMap[type as keyof typeof iconMap] || <Bell className="w-4 h-4 text-slate-400" />;
};

const ProfileDropdown: React.FC = () => (
  <div className="absolute right-0 top-12 w-64 bg-slate-800 border border-slate-700 rounded-lg shadow-xl z-50">
    <div className="p-4 border-b border-slate-700">
      <div className="flex items-center space-x-3">
        <div className="w-10 h-10 bg-gradient-to-r from-green-400 to-blue-500 rounded-full flex items-center justify-center text-sm font-bold">
          JT
        </div>
        <div>
          <p className="font-semibold">John Trader</p>
          <p className="text-xs text-slate-400">Professional Plan</p>
        </div>
      </div>
    </div>
    <div className="p-2">
      <button className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors">
        Profile Settings
      </button>
      <button className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors">
        Trading Preferences
      </button>
      <button className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors">
        Security Center
      </button>
      <hr className="my-2 border-slate-700" />
      <button className="w-full text-left px-3 py-2 hover:bg-slate-700 rounded-lg transition-colors text-red-400">
        Sign Out
      </button>
    </div>
  </div>
);

export default Header;