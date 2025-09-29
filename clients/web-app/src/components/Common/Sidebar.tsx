'use client';

import React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  HomeIcon,
  ChartBarIcon,
  CurrencyDollarIcon,
  BriefcaseIcon,
  CpuChipIcon,
  NewspaperIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';

interface SidebarProps {
  isOpen: boolean;
  isCollapsed: boolean;
  onToggle: () => void;
  onCollapse: () => void;
}

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string | number;
  children?: NavigationItem[];
}

const navigation: NavigationItem[] = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: HomeIcon,
  },
  {
    name: 'Trading',
    href: '/trading',
    icon: CurrencyDollarIcon,
    children: [
      { name: 'Spot Trading', href: '/trading/spot', icon: CurrencyDollarIcon },
      { name: 'Futures', href: '/trading/futures', icon: ChartBarIcon },
      { name: 'Options', href: '/trading/options', icon: BriefcaseIcon },
      { name: 'Order History', href: '/trading/history', icon: ChartBarIcon },
    ],
  },
  {
    name: 'Portfolio',
    href: '/portfolio',
    icon: BriefcaseIcon,
    children: [
      { name: 'Overview', href: '/portfolio/overview', icon: BriefcaseIcon },
      { name: 'Positions', href: '/portfolio/positions', icon: ChartBarIcon },
      { name: 'Performance', href: '/portfolio/performance', icon: ChartBarIcon },
      { name: 'Risk Analysis', href: '/portfolio/risk', icon: ChartBarIcon },
    ],
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: ChartBarIcon,
    children: [
      { name: 'Technical Analysis', href: '/analytics/technical', icon: ChartBarIcon },
      { name: 'Market Research', href: '/analytics/research', icon: NewspaperIcon },
      { name: 'Backtesting', href: '/analytics/backtest', icon: CpuChipIcon },
      { name: 'Screener', href: '/analytics/screener', icon: ChartBarIcon },
    ],
  },
  {
    name: 'AI Insights',
    href: '/ai',
    icon: CpuChipIcon,
    badge: 'NEW',
    children: [
      { name: 'Predictions', href: '/ai/predictions', icon: CpuChipIcon },
      { name: 'Sentiment Analysis', href: '/ai/sentiment', icon: NewspaperIcon },
      { name: 'Recommendations', href: '/ai/recommendations', icon: CpuChipIcon },
      { name: 'Risk Alerts', href: '/ai/alerts', icon: ChartBarIcon },
    ],
  },
  {
    name: 'News & Research',
    href: '/news',
    icon: NewspaperIcon,
    children: [
      { name: 'Market News', href: '/news/market', icon: NewspaperIcon },
      { name: 'Analysis', href: '/news/analysis', icon: ChartBarIcon },
      { name: 'Economic Calendar', href: '/news/calendar', icon: ChartBarIcon },
      { name: 'Research Reports', href: '/news/reports', icon: NewspaperIcon },
    ],
  },
];

const bottomNavigation: NavigationItem[] = [
  {
    name: 'Settings',
    href: '/settings',
    icon: Cog6ToothIcon,
  },
  {
    name: 'Help & Support',
    href: '/support',
    icon: QuestionMarkCircleIcon,
  },
];

const Sidebar: React.FC<SidebarProps> = ({
  isOpen,
  isCollapsed,
  onToggle,
  onCollapse,
}) => {
  const router = useRouter();
  const pathname = usePathname();

  const isActiveRoute = (href: string) => {
    if (href === '/dashboard') {
      return pathname === '/' || pathname === '/dashboard';
    }
    return pathname.startsWith(href);
  };

  const NavigationItem: React.FC<{
    item: NavigationItem;
    level?: number;
  }> = ({ item, level = 0 }) => {
    const isActive = isActiveRoute(item.href);
    const hasChildren = item.children && item.children.length > 0;
    const [isExpanded, setIsExpanded] = React.useState(isActive);

    React.useEffect(() => {
      if (isActive) {
        setIsExpanded(true);
      }
    }, [isActive]);

    const handleClick = () => {
      if (hasChildren && !isCollapsed) {
        setIsExpanded(!isExpanded);
      } else {
        router.push(item.href);
      }
    };

    return (
      <div>
        <button
          onClick={handleClick}
          className={cn(
            'w-full flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors duration-200',
            level > 0 && 'ml-4',
            isActive
              ? 'bg-primary-100 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300'
              : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-dark-700',
            isCollapsed && 'justify-center px-2'
          )}
        >
          <item.icon
            className={cn(
              'flex-shrink-0 h-5 w-5',
              isActive
                ? 'text-primary-600 dark:text-primary-400'
                : 'text-gray-400 dark:text-gray-500',
              !isCollapsed && 'mr-3'
            )}
          />

          {!isCollapsed && (
            <>
              <span className="flex-1 text-left">{item.name}</span>

              {item.badge && (
                <span className="ml-2 px-2 py-0.5 text-xs font-medium bg-primary-100 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300 rounded-full">
                  {item.badge}
                </span>
              )}

              {hasChildren && (
                <ChevronRightIcon
                  className={cn(
                    'ml-2 h-4 w-4 transition-transform duration-200',
                    isExpanded && 'rotate-90'
                  )}
                />
              )}
            </>
          )}
        </button>

        {/* Submenu */}
        {hasChildren && !isCollapsed && (
          <motion.div
            initial={false}
            animate={{
              height: isExpanded ? 'auto' : 0,
              opacity: isExpanded ? 1 : 0,
            }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-1 space-y-1">
              {item.children?.map((child) => (
                <NavigationItem
                  key={child.href}
                  item={child}
                  level={level + 1}
                />
              ))}
            </div>
          </motion.div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-dark-800 border-r border-gray-200 dark:border-dark-700">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-dark-700">
        {!isCollapsed && (
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">NT</span>
              </div>
            </div>
            <div className="ml-3">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                NexusTrade
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                AI Trading Platform
              </p>
            </div>
          </div>
        )}

        <button
          onClick={onCollapse}
          className="p-1.5 rounded-lg text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-dark-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="h-5 w-5" />
          ) : (
            <ChevronLeftIcon className="h-5 w-5" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-4 space-y-2 overflow-y-auto">
        {navigation.map((item) => (
          <NavigationItem key={item.href} item={item} />
        ))}
      </nav>

      {/* Bottom navigation */}
      <div className="px-4 py-4 border-t border-gray-200 dark:border-dark-700 space-y-2">
        {bottomNavigation.map((item) => (
          <NavigationItem key={item.href} item={item} />
        ))}
      </div>

      {/* Collapse indicator */}
      {isCollapsed && (
        <div className="px-2 py-4 text-center">
          <div className="w-2 h-2 bg-primary-600 rounded-full mx-auto"></div>
        </div>
      )}
    </div>
  );
};

export default Sidebar;