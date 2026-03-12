import React from 'react';
import { Card, CardHeader, CardContent } from '@mui/material';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { SafeResponsiveContainer } from './ChartErrorBoundary';

interface PerformanceChartProps {
  data: Array<{
    timestamp: number;
    pnl: number;
    equity: number;
  }>;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ data }) => {
  const formattedData = (data ?? []).map((item) => ({
    time: item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '—',
    'P&L': item.pnl ?? 0,
    Equity: item.equity ?? 0,
  }));

  return (
    <Card>
      <CardHeader title="Performance" subheader="Real-time P&L and Equity" />
      <CardContent>
        <SafeResponsiveContainer height={300} data={formattedData}>
          <LineChart data={formattedData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip
              formatter={(value: number) =>
                new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                }).format(value)
              }
            />
            <Legend />
            <Line
              type="monotone"
              dataKey="P&L"
              stroke="#8884d8"
              strokeWidth={2}
              dot={false}
            />
            <Line
              type="monotone"
              dataKey="Equity"
              stroke="#82ca9d"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </SafeResponsiveContainer>
      </CardContent>
    </Card>
  );
};
