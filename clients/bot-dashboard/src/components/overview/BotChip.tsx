import { Box, Stack, Typography } from '@mui/material';
import { tradingTokens, tradingTypography } from '@/theme';
import type { BotData } from './types';

interface BotChipProps {
  bot: BotData;
  onClick?: (key: BotData['key']) => void;
}

function formatUSD(n: number): string {
  const sign = n >= 0 ? '+' : '−';
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${sign}$${abs}`;
}

export default function BotChip({ bot, onClick }: BotChipProps) {
  const positive = bot.dailyPnL >= 0;
  const pnlColor = positive ? tradingTokens.status.success : tradingTokens.status.error;
  const offlineColor = tradingTokens.text.muted;
  const ledColor = !bot.online
    ? tradingTokens.status.error
    : bot.isRunning
      ? tradingTokens.status.success
      : tradingTokens.status.warning;
  const ledLabel = !bot.online ? 'offline' : bot.isRunning ? 'running' : 'paused';

  const handleKey = (e: React.KeyboardEvent) => {
    if (!onClick) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(bot.key);
    }
  };

  return (
    <Box
      onClick={() => onClick?.(bot.key)}
      onKeyDown={handleKey}
      tabIndex={onClick ? 0 : -1}
      role={onClick ? 'button' : undefined}
      aria-label={
        onClick
          ? `Open ${bot.name} bot — ${ledLabel}, ${bot.mode}, today ${formatUSD(bot.dailyPnL)}`
          : undefined
      }
      sx={{
        flex: 1,
        minWidth: 220,
        height: 76,
        background: tradingTokens.bg.surface,
        border: `1px solid ${tradingTokens.border}`,
        borderRadius: '8px',
        px: 2,
        display: 'flex',
        alignItems: 'center',
        cursor: onClick ? 'pointer' : 'default',
        opacity: bot.online ? 1 : 0.65,
        transition: 'border-color 200ms ease, transform 200ms ease',
        outline: 'none',
        '&:hover': onClick
          ? { borderColor: tradingTokens.borderStrong, transform: 'translateY(-1px)' }
          : undefined,
        '&:focus-visible': {
          borderColor: tradingTokens.status.info,
          boxShadow: `0 0 0 2px ${tradingTokens.status.info}33`,
        },
      }}
    >
      <Stack direction="row" alignItems="center" spacing={1.5} sx={{ width: '100%' }}>
        <Box
          aria-label={ledLabel}
          sx={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: ledColor,
            boxShadow: `0 0 6px ${ledColor}`,
            flexShrink: 0,
          }}
        />
        <Stack sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              ...tradingTypography.h6,
              color: tradingTokens.text.primary,
              fontSize: '0.875rem',
              lineHeight: 1.2,
            }}
          >
            {bot.name}
          </Typography>
          <Typography
            sx={{
              ...tradingTypography.overline,
              color: tradingTokens.text.muted,
              fontSize: '0.625rem',
              lineHeight: 1.2,
            }}
          >
            {bot.mode}
          </Typography>
        </Stack>
        <Stack alignItems="flex-end" spacing={0.25}>
          <Typography
            sx={{
              ...tradingTypography.overline,
              color: tradingTokens.text.muted,
              fontSize: '0.625rem',
              lineHeight: 1.2,
            }}
          >
            today
          </Typography>
          <Typography
            sx={{
              fontFamily: tradingTokens.font.mono,
              fontSize: '1rem',
              fontWeight: 600,
              lineHeight: 1.2,
              color: bot.online ? pnlColor : offlineColor,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {bot.online ? formatUSD(bot.dailyPnL) : '— —'}
          </Typography>
        </Stack>
      </Stack>
    </Box>
  );
}
