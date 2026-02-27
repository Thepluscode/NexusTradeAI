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
  ResponsiveContainer,
} from 'recharts';

interface PerformanceChartProps {
  data: Array<{
    timestamp: number;
    pnl: number;
    equity: number;
  }>;
}

export const PerformanceChart: React.FC<PerformanceChartProps> = ({ data }) => {
  const formattedData = data.map((item) => ({
    time: new Date(item.timestamp).toLocaleTimeString(),
    'P&L': item.pnl,
    Equity: item.equity,
  }));

  return (
    <Card>
      <CardHeader title="Performance" subheader="Real-time P&L and Equity" />
      <CardContent>
        <ResponsiveContainer width="100%" height={300}>
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
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};
