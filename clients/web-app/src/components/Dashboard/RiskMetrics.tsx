'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useSelector } from 'react-redux';
import { RootState } from '@/store/store';
import {
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ChartBarIcon,
  InformationCircleIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline';
import { cn } from '@/utils/cn';
import { formatCurrency, formatPercentage } from '@/utils/formatters';

interface RiskMetricsProps {
  className?: string;
}

interface RiskMetric {
  id: string;
  label: string;
  value: number;
  threshold: number;
  status: 'safe' | 'warning' | 'danger';
  description: string;
  unit: 'percentage' | 'currency' | 'ratio';
}

const RiskMetrics: React.FC<RiskMetricsProps> = ({ className }) => {
  const [selectedTimeframe, setSelectedTimeframe] = useState<'1D' | '1W' | '1M' | '3M'>('1W');

  // Redux state
  const { totalBalance } = useSelector((state: RootState) => state.trading);
  const { performance } = useSelector((state: RootState) => state.portfolio);

  // Mock risk metrics data - replace with real calculations
  const riskMetrics: RiskMetric[] = [
    {
      id: 'var',
      label: 'Value at Risk (95%)',
      value: 2.34,
      threshold: 5.0,
      status: 'safe',
      description: 'Maximum expected loss over 1 day with 95% confidence',
      unit: 'percentage',
    },
    {
      id: 'sharpe',
      label: 'Sharpe Ratio',
      value: 1.67,
      threshold: 1.0,
      status: 'safe',
      description: 'Risk-adjusted return measure',
      unit: 'ratio',
    },
    {
      id: 'maxDrawdown',
      label: 'Max Drawdown',
      value: 8.45,
      threshold: 15.0,
      status: 'warning',
      description: 'Largest peak-to-trough decline',
      unit: 'percentage',
    },
    {
      id: 'concentration',
      label: 'Concentration Risk',
      value: 45.2,
      threshold: 50.0,
      status: 'warning',
      description: 'Percentage in largest position',
      unit: 'percentage',
    },
    {
      id: 'leverage',
      label: 'Portfolio Leverage',
      value: 1.2,
      threshold: 3.0,
      status: 'safe',
      description: 'Total leverage across all positions',
      unit: 'ratio',
    },
    {
      id: 'volatility',
      label: 'Portfolio Volatility',
      value: 12.8,
      threshold: 20.0,
      status: 'safe',
      description: 'Annualized volatility of returns',
      unit: 'percentage',
    },
  ];

  const timeframeOptions = [
    { label: '1D', value: '1D' },
    { label: '1W', value: '1W' },
    { label: '1M', value: '1M' },
    { label: '3M', value: '3M' },
  ];

  const getStatusColor = (status: RiskMetric['status']) => {
    switch (status) {
      case 'safe':
        return 'text-green-600 dark:text-green-400';
      case 'warning':
        return 'text-yellow-600 dark:text-yellow-400';
      case 'danger':
        return 'text-red-600 dark:text-red-400';
      default:
        return 'text-gray-600 dark:text-gray-400';
    }
  };

  const getStatusIcon = (status: RiskMetric['status']) => {
    switch (status) {
      case 'safe':
        return <ShieldCheckIcon className="h-4 w-4" />;
      case 'warning':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      case 'danger':
        return <ExclamationTriangleIcon className="h-4 w-4" />;
      default:
        return <InformationCircleIcon className="h-4 w-4" />;
    }
  };

  const formatMetricValue = (metric: RiskMetric) => {
    switch (metric.unit) {
      case 'percentage':
        return formatPercentage(metric.value);
      case 'currency':
        return formatCurrency(metric.value);
      case 'ratio':
        return metric.value.toFixed(2);
      default:
        return metric.value.toString();
    }
  };

  const RiskMetricCard: React.FC<{ metric: RiskMetric; index: number }> = ({ metric, index }) => (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.1 }}
      className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600"
    >
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center space-x-2">
          <div className={cn('flex items-center', getStatusColor(metric.status))}>
            {getStatusIcon(metric.status)}
          </div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            {metric.label}
          </h4>
        </div>
        <div className="group relative">
          <InformationCircleIcon className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 cursor-help" />
          <div className="absolute right-0 top-6 w-48 p-2 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none">
            {metric.description}
          </div>
        </div>
      </div>

      <div className="flex items-end justify-between">
        <div>
          <div className={cn('text-lg font-bold', getStatusColor(metric.status))}>
            {formatMetricValue(metric)}
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Threshold: {metric.unit === 'percentage' ? formatPercentage(metric.threshold) :
                      metric.unit === 'currency' ? formatCurrency(metric.threshold) :
                      metric.threshold.toFixed(2)}
          </div>
        </div>

        {/* Progress bar */}
        <div className="w-16 h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full transition-all duration-300',
              metric.status === 'safe' ? 'bg-green-500' :
              metric.status === 'warning' ? 'bg-yellow-500' : 'bg-red-500'
            )}
            style={{
              width: `${Math.min((metric.value / metric.threshold) * 100, 100)}%`
            }}
          />
        </div>
      </div>
    </motion.div>
  );

  const overallRiskScore = useMemo(() => {
    const scores = riskMetrics.map(metric => {
      const ratio = metric.value / metric.threshold;
      if (metric.id === 'sharpe') {
        // Higher Sharpe ratio is better
        return ratio >= 1 ? 100 : ratio * 100;
      } else {
        // Lower values are generally better for risk metrics
        return Math.max(0, 100 - (ratio * 100));
      }
    });

    return scores.reduce((sum, score) => sum + score, 0) / scores.length;
  }, [riskMetrics]);

  const getRiskLevel = (score: number) => {
    if (score >= 80) return { label: 'Low Risk', color: 'text-green-600 dark:text-green-400' };
    if (score >= 60) return { label: 'Moderate Risk', color: 'text-yellow-600 dark:text-yellow-400' };
    return { label: 'High Risk', color: 'text-red-600 dark:text-red-400' };
  };

  const riskLevel = getRiskLevel(overallRiskScore);

  return (
    <div className={cn('bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-200 dark:border-gray-700', className)}>
      {/* Header */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ChartBarIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                Risk Metrics
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Portfolio risk assessment
              </p>
            </div>
          </div>

          <button className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <AdjustmentsHorizontalIcon className="h-5 w-5" />
          </button>
        </div>

        {/* Timeframe Selector */}
        <div className="flex bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
          {timeframeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => setSelectedTimeframe(option.value as any)}
              className={cn(
                'px-3 py-1 text-sm font-medium rounded-md transition-all duration-200',
                selectedTimeframe === option.value
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Overall Risk Score */}
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <div className="text-center">
          <div className="mb-2">
            <span className="text-2xl font-bold text-gray-900 dark:text-white">
              {overallRiskScore.toFixed(0)}
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-400 ml-1">/ 100</span>
          </div>
          <div className={cn('text-sm font-medium', riskLevel.color)}>
            {riskLevel.label}
          </div>

          {/* Risk Score Bar */}
          <div className="mt-3 w-full h-2 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
            <div
              className={cn(
                'h-full transition-all duration-500',
                overallRiskScore >= 80 ? 'bg-green-500' :
                overallRiskScore >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              )}
              style={{ width: `${overallRiskScore}%` }}
            />
          </div>
        </div>
      </div>

      {/* Risk Metrics Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {riskMetrics.map((metric, index) => (
            <RiskMetricCard key={metric.id} metric={metric} index={index} />
          ))}
        </div>
      </div>

      {/* Risk Recommendations */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-2">
          Risk Management Recommendations
        </h3>
        <div className="space-y-2">
          {riskMetrics
            .filter(metric => metric.status === 'warning' || metric.status === 'danger')
            .slice(0, 2)
            .map((metric) => (
              <div key={metric.id} className="flex items-start space-x-2 text-xs">
                <div className={cn('mt-0.5', getStatusColor(metric.status))}>
                  {getStatusIcon(metric.status)}
                </div>
                <span className="text-gray-600 dark:text-gray-400">
                  {metric.label} is {metric.status === 'warning' ? 'elevated' : 'high'}.
                  Consider {metric.id === 'concentration' ? 'diversifying your portfolio' :
                          metric.id === 'maxDrawdown' ? 'reducing position sizes' :
                          metric.id === 'leverage' ? 'reducing leverage' : 'reviewing your strategy'}.
                </span>
              </div>
            ))}
          {riskMetrics.every(metric => metric.status === 'safe') && (
            <div className="flex items-center space-x-2 text-xs text-green-600 dark:text-green-400">
              <ShieldCheckIcon className="h-4 w-4" />
              <span>All risk metrics are within acceptable ranges.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default RiskMetrics;