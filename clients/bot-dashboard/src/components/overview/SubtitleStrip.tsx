import { useEffect, useState } from 'react';
import { Box, Stack, Typography } from '@mui/material';
import { tradingTokens, tradingTypography } from '@/theme';

const HANDS_OFF_START = new Date('2026-05-10T00:00:00Z').getTime();
const HANDS_OFF_DURATION_DAYS = 14;

function formatUTC(d: Date): string {
  const day = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const date = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
  return `${day} ${date} ${time} UTC`;
}

export default function SubtitleStrip() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const elapsedDays = Math.max(1, Math.floor((now.getTime() - HANDS_OFF_START) / 86_400_000) + 1);
  const dayLabel = elapsedDays <= HANDS_OFF_DURATION_DAYS
    ? `Day ${elapsedDays} of ${HANDS_OFF_DURATION_DAYS} hands-off`
    : 'Hands-off window complete';

  return (
    <Box
      sx={{
        height: 40,
        px: 4,
        display: 'flex',
        alignItems: 'center',
        borderBottom: `1px solid ${tradingTokens.border}`,
        background: tradingTokens.bg.default,
      }}
    >
      <Stack direction="row" spacing={3} alignItems="center" sx={{ maxWidth: 1280, mx: 'auto', width: '100%' }}>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.primary }}>
          {dayLabel}
        </Typography>
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: tradingTokens.text.muted }} />
        <Typography sx={{ ...tradingTypography.monoNum, color: tradingTokens.text.secondary }}>
          {formatUTC(now)}
        </Typography>
        <Box sx={{ width: 4, height: 4, borderRadius: '50%', background: tradingTokens.text.muted }} />
        <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
          auto-disable cron <Box component="span" sx={{ color: tradingTokens.status.success, fontWeight: 600 }}>OK</Box>
        </Typography>
      </Stack>
    </Box>
  );
}
