import { Box, Stack, Typography } from '@mui/material';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { tradingTokens, tradingTypography } from '@/theme';
import type { BotKey } from './types';

interface EquityCurvePanelProps {
  curves?: Record<BotKey, number[]>;
}

const DEFAULT_CURVES: Record<BotKey, number[]> = {
  stock: Array.from({ length: 60 }, (_, i) => 52000 + Math.sin(i / 6) * 180 + i * 4),
  forex: Array.from({ length: 60 }, (_, i) => 48000 - Math.cos(i / 5) * 90 + i * 0.5),
  crypto: Array.from({ length: 60 }, (_, i) => 46200 + Math.sin(i / 4) * 220 + i * 12),
};

const BOT_LABELS: Record<BotKey, string> = {
  stock: 'Stock',
  forex: 'Forex',
  crypto: 'Crypto',
};

function rowColor(series: number[]): string {
  if (series.length < 2) return tradingTokens.text.muted;
  const start = series[0];
  const end = series[series.length - 1];
  return end >= start ? tradingTokens.status.success : tradingTokens.status.error;
}

function pctChange(series: number[]): string {
  if (series.length < 2) return '0.00%';
  const start = series[0];
  const end = series[series.length - 1];
  const pct = ((end - start) / start) * 100;
  const sign = pct >= 0 ? '+' : '−';
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export default function EquityCurvePanel({ curves = DEFAULT_CURVES }: EquityCurvePanelProps) {
  const bots: BotKey[] = ['stock', 'forex', 'crypto'];

  return (
    <Box
      sx={{
        height: 220,
        background: tradingTokens.bg.surface,
        border: `1px solid ${tradingTokens.border}`,
        borderRadius: '8px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Stack
        direction="row"
        alignItems="center"
        justifyContent="space-between"
        sx={{ px: 3, py: 1.5, borderBottom: `1px solid ${tradingTokens.border}` }}
      >
        <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.text.primary }}>
          Equity · 24h
        </Typography>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted }}>
          stacked sparklines
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, px: 3, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bots.map((key) => {
          const series = curves[key];
          const color = rowColor(series);
          const data = series.map((y, i) => ({ x: i, y }));
          return (
            <Stack key={key} direction="row" alignItems="center" spacing={2} sx={{ flex: 1 }}>
              <Typography
                sx={{
                  ...tradingTypography.body2,
                  color: tradingTokens.text.secondary,
                  width: 60,
                  flexShrink: 0,
                }}
              >
                {BOT_LABELS[key]}
              </Typography>
              <Box sx={{ flex: 1, height: '100%', minHeight: 0 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id={`grad-${key}`} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                        <stop offset="100%" stopColor={color} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <Area
                      type="monotone"
                      dataKey="y"
                      stroke={color}
                      strokeWidth={1.5}
                      fill={`url(#grad-${key})`}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </Box>
              <Typography
                sx={{
                  ...tradingTypography.monoNum,
                  color,
                  width: 64,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {pctChange(series)}
              </Typography>
            </Stack>
          );
        })}
      </Box>
    </Box>
  );
}
