import { Box, Stack, Typography, Skeleton, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { tradingTokens, tradingTypography } from '@/theme';
import { fetchRecentTrades } from './api';
import type { TradeItem } from './types';

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

function formatUSD(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

export default function TradesFeedPanel() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['recentTrades', 20],
    queryFn: () => fetchRecentTrades(20),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const trades: TradeItem[] = data ?? [];

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
        sx={{ px: 2.5, py: 1.5, borderBottom: `1px solid ${tradingTokens.border}` }}
      >
        <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.text.primary, fontSize: '1rem' }}>
          Recent Trades
        </Typography>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted, fontSize: '0.625rem' }}>
          {isLoading ? '…' : `last ${trades.length}`}
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {isError && (
          <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ py: 4, px: 2 }}>
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.status.error, textAlign: 'center' }}>
              Trades feed unavailable.
            </Typography>
            <Button variant="outlined" color="error" size="small" onClick={() => refetch()}>
              Retry
            </Button>
          </Stack>
        )}

        {!isError && isLoading && (
          <Box sx={{ px: 2, py: 1 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} variant="rectangular" height={28} sx={{ mb: 0.75 }} />
            ))}
          </Box>
        )}

        {!isError && !isLoading && trades.length === 0 && (
          <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, py: 6 }}>
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
              No recent trades
            </Typography>
          </Stack>
        )}

        {trades.map((t) => {
          const positive = t.pnl_usd >= 0;
          const color = positive ? tradingTokens.status.success : tradingTokens.status.error;
          return (
            <Stack
              key={t.id}
              direction="row"
              alignItems="center"
              spacing={1.25}
              sx={{
                px: 2,
                height: 36,
                borderBottom: `1px solid ${tradingTokens.border}`,
                '&:last-of-type': { borderBottom: 'none' },
                transition: 'background 150ms ease',
                '&:hover': { background: tradingTokens.bg.surface2 },
              }}
            >
              <Typography
                sx={{
                  ...tradingTypography.overline,
                  color,
                  fontSize: '0.625rem',
                  width: 16,
                  flexShrink: 0,
                  textAlign: 'center',
                }}
              >
                {t.side === 'LONG' ? '↑' : '↓'}
              </Typography>
              <Typography
                sx={{
                  ...tradingTypography.body2,
                  color: tradingTokens.text.primary,
                  fontWeight: 500,
                  flex: 1,
                  minWidth: 0,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {t.symbol}
              </Typography>
              <Typography
                sx={{
                  ...tradingTypography.monoNum,
                  color,
                  fontSize: '0.75rem',
                  flexShrink: 0,
                }}
              >
                {formatUSD(t.pnl_usd)}
              </Typography>
              <Typography
                sx={{
                  ...tradingTypography.monoNum,
                  color: tradingTokens.text.muted,
                  fontSize: '0.6875rem',
                  width: 28,
                  textAlign: 'right',
                  flexShrink: 0,
                }}
              >
                {relativeTime(t.closed_at)}
              </Typography>
            </Stack>
          );
        })}
      </Box>
    </Box>
  );
}
