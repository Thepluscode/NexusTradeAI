import { Box, Stack, Typography, Skeleton, Button } from '@mui/material';
import { AreaChart, Area, ResponsiveContainer } from 'recharts';
import { useQuery } from '@tanstack/react-query';
import { tradingTokens, tradingTypography } from '@/theme';
import { fetchIntradayEquity } from './api';
import type { BotKey } from './types';

function PanelErrorState({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ flex: 1, py: 4, px: 2 }}>
      <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.status.error, textAlign: 'center' }}>
        {label}
      </Typography>
      <Button variant="outlined" color="error" size="small" onClick={onRetry}>
        Retry
      </Button>
    </Stack>
  );
}

const BOT_LABELS: Record<BotKey, string> = {
  stock: 'Stock',
  forex: 'Forex',
  crypto: 'Crypto',
};

function rowColor(series: number[]): string {
  if (series.length < 2) return tradingTokens.text.muted;
  const last = series[series.length - 1];
  if (last > 0) return tradingTokens.status.success;
  if (last < 0) return tradingTokens.status.error;
  return tradingTokens.text.muted;
}

function formatDelta(series: number[]): string {
  if (series.length === 0) return '$0.00';
  const last = series[series.length - 1];
  const sign = last >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(last).toFixed(2)}`;
}

export default function EquityCurvePanel() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['intradayEquity', 24],
    queryFn: () => fetchIntradayEquity(24),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const curves: Record<BotKey, number[]> = data ?? { stock: [], forex: [], crypto: [] };
  const bots: BotKey[] = ['stock', 'forex', 'crypto'];

  return (
    <Box
      sx={{
        height: '100%',
        minHeight: 240,
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
          Realized P&L · 24h
        </Typography>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted }}>
          cumulative per bot
        </Typography>
      </Stack>

      {isError ? (
        <PanelErrorState label="Equity feed unavailable." onRetry={() => refetch()} />
      ) : (
      <Box sx={{ flex: 1, px: 3, py: 1.5, display: 'flex', flexDirection: 'column', gap: 1 }}>
        {bots.map((key) => {
          const series = curves[key] ?? [];
          const color = rowColor(series);
          const hasData = series.length > 0;
          const chartData = series.map((y, i) => ({ x: i, y }));

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
                {isLoading ? (
                  <Skeleton variant="rectangular" height={32} sx={{ borderRadius: '4px' }} />
                ) : !hasData ? (
                  <Box
                    sx={{
                      height: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      px: 1,
                    }}
                  >
                    <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.muted, fontSize: '0.75rem' }}>
                      no closed trades in 24h
                    </Typography>
                  </Box>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
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
                )}
              </Box>
              <Typography
                sx={{
                  ...tradingTypography.monoNum,
                  color: hasData ? color : tradingTokens.text.muted,
                  width: 72,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {isLoading ? '…' : hasData ? formatDelta(series) : '—'}
              </Typography>
            </Stack>
          );
        })}
      </Box>
      )}
    </Box>
  );
}
