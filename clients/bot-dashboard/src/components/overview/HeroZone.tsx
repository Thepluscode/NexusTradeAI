import { useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tradingTokens, tradingTypography } from '@/theme';
import StatusPill from './StatusPill';

interface HeroZoneProps {
  dailyPnL: number;
  equity: number;
  openPositions: number;
  botsUp: number;
  totalBots: number;
  alertCount: number;
  loading?: boolean;
  onPillClick?: () => void;
}

function formatUSD(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign} $${abs}`;
}

function formatPct(n: number, base: number): string {
  if (!base) return '0.00%';
  const pct = (n / base) * 100;
  const sign = pct >= 0 ? '▲' : '▼';
  return `${sign} ${Math.abs(pct).toFixed(2)}%`;
}

export default function HeroZone({
  dailyPnL,
  equity,
  openPositions,
  botsUp,
  totalBots,
  alertCount,
  loading = false,
  onPillClick,
}: HeroZoneProps) {
  const [showPct, setShowPct] = useState(false);
  const positive = dailyPnL >= 0;
  const pnlColor = positive ? tradingTokens.status.success : tradingTokens.status.error;

  return (
    <Box
      sx={{
        height: 240,
        display: 'flex',
        alignItems: 'center',
        borderBottom: `1px solid ${tradingTokens.border}`,
        background: tradingTokens.bg.default,
        px: 4,
      }}
    >
      <Box sx={{ maxWidth: 1280, width: '100%', mx: 'auto' }}>
        <Stack spacing={1.5}>
          <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.secondary }}>
            Today
          </Typography>

          <Stack direction="row" alignItems="center" spacing={4} flexWrap="wrap">
            <Typography
              onClick={() => setShowPct((s) => !s)}
              sx={{
                ...tradingTypography.hero,
                color: loading ? tradingTokens.text.muted : pnlColor,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'opacity 150ms ease',
                '&:hover': { opacity: 0.85 },
              }}
            >
              {loading ? '— — —' : showPct ? formatPct(dailyPnL, equity) : formatUSD(dailyPnL)}
            </Typography>
            <Typography sx={{ ...tradingTypography.h4, color: pnlColor, opacity: loading ? 0 : 0.85 }}>
              {showPct ? formatUSD(dailyPnL) : formatPct(dailyPnL, equity)}
            </Typography>
            <Box sx={{ ml: 'auto' }}>
              <StatusPill alertCount={alertCount} onClick={onPillClick} />
            </Box>
          </Stack>

          <Box sx={{ width: 56, height: 1, background: tradingTokens.border, my: 0.5 }} />

          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
              <Box component="span" sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.primary }}>
                ${equity.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </Box>{' '}
              equity
            </Typography>
            <Box sx={{ width: 3, height: 3, borderRadius: '50%', background: tradingTokens.text.muted }} />
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
              <Box component="span" sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.primary }}>
                {openPositions}
              </Box>{' '}
              open
            </Typography>
            <Box sx={{ width: 3, height: 3, borderRadius: '50%', background: tradingTokens.text.muted }} />
            <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
              <Box component="span" sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.primary }}>
                {botsUp}/{totalBots}
              </Box>{' '}
              bots up
            </Typography>
          </Stack>
        </Stack>
      </Box>
    </Box>
  );
}
