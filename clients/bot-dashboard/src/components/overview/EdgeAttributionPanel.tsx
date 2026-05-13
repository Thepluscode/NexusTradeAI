import { Box, Stack, Typography, Skeleton, ButtonBase } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { tradingTokens, tradingTypography } from '@/theme';
import CIBar from './CIBar';
import { fetchEdgeAttribution, fetchKillSwitchRows } from './api';
import type { EdgeAttributionRow, EdgeStatus } from './types';

interface EdgeAttributionPanelProps {
  /**
   * When `prominent` is true the panel takes the full available height,
   * shows a "Top edge today" callout band above the table, and stretches
   * to fill its parent. Used by the edge-first OverviewPage layout.
   */
  prominent?: boolean;
}

type WindowDays = 7 | 30 | 90;

const WINDOWS: { value: WindowDays; label: string }[] = [
  { value: 7, label: '7d' },
  { value: 30, label: '30d' },
  { value: 90, label: '90d' },
];

// minN scales with window — comparing equal statistical confidence across
// timeframes. A 90d bucket with n=10 is much weaker signal than a 7d one.
const MIN_N_FOR: Record<WindowDays, number> = { 7: 5, 30: 10, 90: 20 };

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

export default function EdgeAttributionPanel({ prominent = false }: EdgeAttributionPanelProps) {
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const minN = MIN_N_FOR[windowDays];

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['edgeAttribution', windowDays, minN],
    queryFn: () => fetchEdgeAttribution(windowDays, minN),
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  const { data: killRows } = useQuery({
    queryKey: ['killSwitchRows'],
    queryFn: fetchKillSwitchRows,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  // bucket key = `${bot}/${strategy}` — match the edge-attribution shape
  const killedSet = useMemo(
    () => new Set((killRows ?? []).map((r) => `${r.bot}/${r.strategy}`)),
    [killRows],
  );
  const killReasonByBucket = useMemo(() => {
    const m = new Map<string, string>();
    (killRows ?? []).forEach((r) => m.set(`${r.bot}/${r.strategy}`, r.reason));
    return m;
  }, [killRows]);

  const rows: EdgeAttributionRow[] = useMemo(
    () =>
      (data ?? []).slice().sort((a, b) => {
        const r = statusRank(a.status) - statusRank(b.status);
        if (r !== 0) return r;
        return Math.abs(b.total_pnl_usd) - Math.abs(a.total_pnl_usd);
      }),
    [data],
  );

  // The "winning bucket" — best positive-edge row (largest lower-CI bound
  // among positive rows). Surfaces only when a row is actually positive.
  const topEdge = useMemo(() => {
    const positives = rows.filter((r) => r.status === 'positive');
    if (positives.length === 0) return null;
    return positives.slice().sort((a, b) => b.pnl_pct_ci_low - a.pnl_pct_ci_low)[0];
  }, [rows]);

  return (
    <Box
      sx={{
        height: prominent ? '100%' : 480,
        minHeight: prominent ? 560 : undefined,
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
        sx={{ px: 3, py: 2, borderBottom: `1px solid ${tradingTokens.border}`, gap: 2, flexWrap: 'wrap' }}
      >
        <Stack>
          <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.text.primary }}>
            {prominent ? 'Where is the edge today?' : 'Edge Attribution'}
          </Typography>
          {prominent && (
            <Typography
              sx={{
                ...tradingTypography.body2,
                color: tradingTokens.text.secondary,
                fontSize: '0.75rem',
              }}
            >
              Per-bucket P&L with 95% confidence interval. Sorted positive → negative → inconclusive.
            </Typography>
          )}
        </Stack>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box
            role="tablist"
            aria-label="edge window"
            sx={{
              display: 'inline-flex',
              p: '2px',
              gap: '2px',
              background: tradingTokens.bg.surface2,
              border: `1px solid ${tradingTokens.border}`,
              borderRadius: '8px',
            }}
          >
            {WINDOWS.map(({ value, label }) => {
              const active = value === windowDays;
              return (
                <ButtonBase
                  key={value}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setWindowDays(value)}
                  sx={{
                    px: 1.5,
                    py: 0.5,
                    borderRadius: '6px',
                    background: active ? tradingTokens.bg.surface : 'transparent',
                    color: active ? tradingTokens.text.primary : tradingTokens.text.secondary,
                    border: active ? `1px solid ${tradingTokens.borderStrong}` : '1px solid transparent',
                    fontFamily: tradingTokens.font.mono,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    letterSpacing: '0.02em',
                    transition: 'background 150ms ease, color 150ms ease, border-color 150ms ease',
                    '&:hover': active ? undefined : { color: tradingTokens.text.primary },
                    '&:focus-visible': {
                      boxShadow: `0 0 0 2px ${tradingTokens.status.info}55`,
                    },
                  }}
                >
                  {label}
                </ButtonBase>
              );
            })}
          </Box>
          <Typography
            sx={{
              ...tradingTypography.overline,
              color: tradingTokens.text.muted,
              fontSize: '0.625rem',
            }}
          >
            95% CI · minN {minN}
          </Typography>
        </Stack>
      </Stack>

      {prominent && topEdge && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            px: 3,
            py: 1.5,
            background: `${tradingTokens.status.success}0F`,
            borderBottom: `1px solid ${tradingTokens.border}`,
          }}
        >
          <Typography
            sx={{
              ...tradingTypography.overline,
              color: tradingTokens.status.success,
              fontWeight: 700,
              letterSpacing: '0.1em',
            }}
          >
            TOP EDGE
          </Typography>
          <Typography sx={{ ...tradingTypography.body1, color: tradingTokens.text.primary, fontWeight: 600 }}>
            {topEdge.strategy}{' '}
            <Box component="span" sx={{ color: tradingTokens.text.secondary, fontWeight: 400, textTransform: 'uppercase', fontSize: '0.75rem', ml: 0.5 }}>
              · {topEdge.bot}
            </Box>
          </Typography>
          <Box sx={{ flex: 1 }} />
          <Typography
            sx={{
              ...tradingTypography.monoNum,
              color: tradingTokens.status.success,
              fontSize: '0.9375rem',
              fontWeight: 600,
            }}
          >
            {formatUSD(topEdge.total_pnl_usd)}
          </Typography>
          <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary, fontSize: '0.75rem' }}>
            n={topEdge.n} · WR {topEdge.win_rate_pct.toFixed(1)}% · CI [
            {(topEdge.pnl_pct_ci_low * 100).toFixed(2)}%,{' '}
            {(topEdge.pnl_pct_ci_high * 100).toFixed(2)}%]
          </Typography>
        </Box>
      )}

      {prominent && !topEdge && !isLoading && !isError && rows.length > 0 && (
        <Box
          sx={{
            px: 3,
            py: 1.25,
            background: tradingTokens.bg.surface2,
            borderBottom: `1px solid ${tradingTokens.border}`,
          }}
        >
          <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary, fontSize: '0.8125rem' }}>
            No positive-edge bucket yet — every strategy's 95% CI still straddles or crosses zero.
            Keep observing.
          </Typography>
        </Box>
      )}

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

        {rows.map((row) => {
          const bucketKey = `${row.bot}/${row.strategy}`;
          const killed = killedSet.has(bucketKey);
          const killReason = killReasonByBucket.get(bucketKey);
          return (
            <Box
              key={`${row.bot}-${row.strategy}`}
              sx={{
                display: 'grid',
                gridTemplateColumns: '1.4fr 0.8fr 0.5fr 0.7fr 0.9fr 1.6fr 1fr',
                alignItems: 'center',
                px: 3,
                py: 1.5,
                borderBottom: `1px solid ${tradingTokens.border}`,
                transition: 'background 150ms ease',
                opacity: killed ? 0.75 : 1,
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
              <Stack direction="row" alignItems="center" spacing={0.75} sx={{ flexWrap: 'wrap', rowGap: 0.5 }}>
                <Typography
                  sx={{
                    ...tradingTypography.overline,
                    color: STATUS_COLOR[row.status],
                    fontSize: '0.625rem',
                  }}
                >
                  {STATUS_LABEL[row.status]}
                </Typography>
                {killed && (
                  <Typography
                    component="span"
                    title={killReason ? `Killed: ${killReason}` : 'Auto-disabled by kill-switch cron'}
                    sx={{
                      ...tradingTypography.overline,
                      color: tradingTokens.status.error,
                      border: `1px solid ${tradingTokens.status.error}`,
                      borderRadius: '4px',
                      px: 0.625,
                      py: 0.125,
                      fontSize: '0.5625rem',
                      lineHeight: 1.4,
                      fontWeight: 700,
                      letterSpacing: '0.08em',
                      cursor: 'help',
                    }}
                  >
                    KILLED
                  </Typography>
                )}
              </Stack>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}
