import { useEffect } from 'react';
import { Box, Stack, Typography, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { tradingTokens, tradingTypography } from '@/theme';
import { fetchKillSwitchAlerts } from './api';
import type { AlertItem, AlertSeverity } from './types';

const SEVERITY_COLOR: Record<AlertSeverity, string> = {
  info: tradingTokens.status.info,
  warning: tradingTokens.status.warning,
  error: tradingTokens.status.error,
};

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

interface AlertsPanelProps {
  onCountChange?: (count: number) => void;
}

export default function AlertsPanel({ onCountChange }: AlertsPanelProps) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['killSwitches'],
    queryFn: fetchKillSwitchAlerts,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const alerts: AlertItem[] = data ?? [];

  useEffect(() => {
    onCountChange?.(alerts.length);
  }, [alerts.length, onCountChange]);

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
          Alerts
        </Typography>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted, fontSize: '0.625rem' }}>
          {isLoading ? '…' : alerts.length}
        </Typography>
      </Stack>

      {isError ? (
        <Stack alignItems="center" justifyContent="center" spacing={1.5} sx={{ flex: 1, py: 4, px: 2 }}>
          <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.status.error, textAlign: 'center' }}>
            Alerts feed unavailable.
          </Typography>
          <Button variant="outlined" color="error" size="small" onClick={() => refetch()}>
            Retry
          </Button>
        </Stack>
      ) : alerts.length === 0 ? (
        <Stack alignItems="center" justifyContent="center" sx={{ flex: 1, gap: 1 }}>
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: tradingTokens.status.success,
              boxShadow: `0 0 8px ${tradingTokens.status.success}`,
            }}
          />
          <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
            {isLoading ? 'Checking…' : 'No active alerts'}
          </Typography>
        </Stack>
      ) : (
        <Box sx={{ flex: 1, overflow: 'auto', py: 0.5 }}>
          {alerts.slice(0, 4).map((a) => (
            <Stack
              key={a.id}
              direction="row"
              alignItems="flex-start"
              spacing={1.25}
              sx={{
                px: 2,
                py: 1,
                borderBottom: `1px solid ${tradingTokens.border}`,
                '&:last-of-type': { borderBottom: 'none' },
              }}
            >
              <Box
                sx={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: SEVERITY_COLOR[a.severity],
                  mt: 0.75,
                  flexShrink: 0,
                }}
              />
              <Typography
                sx={{
                  ...tradingTypography.body2,
                  color: tradingTokens.text.primary,
                  flex: 1,
                  lineHeight: 1.4,
                }}
              >
                {a.message}
              </Typography>
              <Typography
                sx={{
                  ...tradingTypography.monoNum,
                  color: tradingTokens.text.muted,
                  fontSize: '0.6875rem',
                  flexShrink: 0,
                }}
              >
                {relativeTime(a.timestamp)}
              </Typography>
            </Stack>
          ))}
        </Box>
      )}
    </Box>
  );
}
