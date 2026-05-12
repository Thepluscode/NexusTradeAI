import { Box, Stack, Typography, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { tradingTokens, tradingTypography } from '@/theme';
import CIBar from './CIBar';
import { fetchEdgeAttribution } from './api';
import type { EdgeAttributionRow, EdgeStatus } from './types';

const STATUS_LABEL: Record<EdgeStatus, string> = {
  positive: 'POSITIVE',
  negative: 'NEGATIVE',
  inconclusive: 'INCONCLUSIVE',
  low_n: 'LOW N',
};

const STATUS_COLOR: Record<EdgeStatus, string> = {
  positive: tradingTokens.status.success,
  negative: tradingTokens.status.error,
  inconclusive: tradingTokens.text.secondary,
  low_n: tradingTokens.text.muted,
};

function formatUSD(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

function statusRank(s: EdgeStatus): number {
  return s === 'positive' ? 0 : s === 'negative' ? 1 : s === 'inconclusive' ? 2 : 3;
}

export default function EdgeAttributionPanel() {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['edgeAttribution', 30, 10],
    queryFn: () => fetchEdgeAttribution(30, 10),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const rows: EdgeAttributionRow[] = (data ?? []).slice().sort((a, b) => {
    const r = statusRank(a.status) - statusRank(b.status);
    if (r !== 0) return r;
    return Math.abs(b.total_pnl_usd) - Math.abs(a.total_pnl_usd);
  });

  return (
    <Box
      sx={{
        height: 480,
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
        sx={{ px: 3, py: 2, borderBottom: `1px solid ${tradingTokens.border}` }}
      >
        <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.text.primary }}>
          Edge Attribution
        </Typography>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted }}>
          window 30d · 95% CI · minN 10
        </Typography>
      </Stack>

      <Box sx={{ flex: 1, overflow: 'auto' }}>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1.4fr 0.8fr 0.5fr 0.7fr 0.9fr 1.6fr 1fr',
            px: 3,
            py: 1.25,
            borderBottom: `1px solid ${tradingTokens.border}`,
            position: 'sticky',
            top: 0,
            background: tradingTokens.bg.surface,
            zIndex: 1,
          }}
        >
          {['Strategy', 'Bot', 'n', 'WR%', 'P&L', '95% CI', 'Status'].map((h) => (
            <Typography
              key={h}
              sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted }}
            >
              {h}
            </Typography>
          ))}
        </Box>

        {isLoading && (
          <Box sx={{ px: 3, py: 2 }}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} variant="rectangular" height={32} sx={{ mb: 1.25 }} />
            ))}
          </Box>
        )}

        {isError && (
          <Stack alignItems="center" justifyContent="center" spacing={1} sx={{ py: 6 }}>
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.status.error }}>
              Failed to load edge attribution.
            </Typography>
            <Typography
              onClick={() => refetch()}
              sx={{
                ...tradingTypography.overline,
                color: tradingTokens.status.info,
                cursor: 'pointer',
                '&:hover': { textDecoration: 'underline' },
              }}
            >
              Retry
            </Typography>
          </Stack>
        )}

        {!isLoading && !isError && rows.length === 0 && (
          <Stack alignItems="center" justifyContent="center" sx={{ py: 6 }}>
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
              No strategies meet minN=10 yet.
            </Typography>
          </Stack>
        )}

        {rows.map((row) => (
          <Box
            key={`${row.bot}-${row.strategy}`}
            onClick={() => console.log('Edge row:', row)}
            sx={{
              display: 'grid',
              gridTemplateColumns: '1.4fr 0.8fr 0.5fr 0.7fr 0.9fr 1.6fr 1fr',
              alignItems: 'center',
              px: 3,
              py: 1.5,
              borderBottom: `1px solid ${tradingTokens.border}`,
              cursor: 'pointer',
              transition: 'background 150ms ease',
              '&:hover': { background: tradingTokens.bg.surface2 },
              '&:last-of-type': { borderBottom: 'none' },
            }}
          >
            <Typography sx={{ ...tradingTypography.body1, color: tradingTokens.text.primary }}>
              {row.strategy}
            </Typography>
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary, textTransform: 'uppercase' }}>
              {row.bot}
            </Typography>
            <Typography sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.primary }}>
              {row.n}
            </Typography>
            <Typography sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.primary }}>
              {row.win_rate_pct.toFixed(1)}
            </Typography>
            <Typography
              sx={{
                ...tradingTypography.monoNum,
                color: row.total_pnl_usd >= 0 ? tradingTokens.status.success : tradingTokens.status.error,
                fontWeight: 500,
              }}
            >
              {formatUSD(row.total_pnl_usd)}
            </Typography>
            <Box>
              <CIBar low={row.pnl_pct_ci_low} high={row.pnl_pct_ci_high} status={row.status} />
            </Box>
            <Typography
              sx={{
                ...tradingTypography.overline,
                color: STATUS_COLOR[row.status],
                fontSize: '0.625rem',
              }}
            >
              {STATUS_LABEL[row.status]}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
