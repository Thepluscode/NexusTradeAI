import { Box, Stack, Typography } from '@mui/material';
import { LineChart, Line } from 'recharts';
import { tradingTokens, tradingTypography } from '@/theme';
import type { BotData } from './types';

interface BotTileProps {
  bot: BotData;
  onClick?: (key: BotData['key']) => void;
}

function formatUSD(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign} $${abs}`;
}

export default function BotTile({ bot, onClick }: BotTileProps) {
  const positive = bot.dailyPnL >= 0;
  const pnlColor = positive ? tradingTokens.status.success : tradingTokens.status.error;
  const offlineColor = tradingTokens.text.muted;
  const ledColor = !bot.online
    ? tradingTokens.status.error
    : bot.isRunning
      ? tradingTokens.status.success
      : tradingTokens.status.warning;

  const sparklineData = bot.equityHistory.map((v, i) => ({ x: i, y: v }));

  return (
    <Box
      onClick={() => onClick?.(bot.key)}
      sx={{
        height: 220,
        background: tradingTokens.bg.surface,
        border: `1px solid ${tradingTokens.border}`,
        borderRadius: '8px',
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        opacity: bot.online ? 1 : 0.65,
        transition: 'border-color 200ms ease, transform 200ms ease',
        '&:hover': onClick
          ? { borderColor: tradingTokens.borderStrong, transform: 'translateY(-1px)' }
          : undefined,
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.25}>
        <Box
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: ledColor,
            boxShadow: `0 0 6px ${ledColor}`,
          }}
        />
        <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.text.primary, flex: 1 }}>
          {bot.name}
        </Typography>
        <Typography
          sx={{
            ...tradingTypography.overline,
            color: bot.mode === 'LIVE' ? tradingTokens.status.success : tradingTokens.text.secondary,
            px: 0.75,
            py: 0.25,
            border: `1px solid ${bot.mode === 'LIVE' ? tradingTokens.status.success : tradingTokens.border}`,
            borderRadius: '4px',
            fontSize: '0.625rem',
            lineHeight: 1.2,
          }}
        >
          {bot.mode}
        </Typography>
      </Stack>

      <Stack>
        <Typography sx={{ ...tradingTypography.overline, color: tradingTokens.text.muted, mb: 0.5 }}>
          Today
        </Typography>
        <Typography
          sx={{
            fontFamily: tradingTokens.font.mono,
            fontSize: '1.5rem',
            fontWeight: 600,
            lineHeight: 1.2,
            color: bot.online ? pnlColor : offlineColor,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {bot.online ? formatUSD(bot.dailyPnL) : '— —'}
        </Typography>
      </Stack>

      <Box sx={{ height: 40, width: '100%', mt: 1 }}>
        <LineChart width={272} height={40} data={sparklineData}>
          <Line
            type="monotone"
            dataKey="y"
            stroke={bot.online ? pnlColor : offlineColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </Box>
    </Box>
  );
}
