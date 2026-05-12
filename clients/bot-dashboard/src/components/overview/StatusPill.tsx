import { Box, Stack, Typography } from '@mui/material';
import { tradingTokens, tradingTypography } from '@/theme';

interface StatusPillProps {
  alertCount: number;
  onClick?: () => void;
}

export default function StatusPill({ alertCount, onClick }: StatusPillProps) {
  const hasAlerts = alertCount > 0;
  const color = hasAlerts ? tradingTokens.status.warning : tradingTokens.status.success;
  const label = hasAlerts
    ? `${alertCount} alert${alertCount === 1 ? '' : 's'}`
    : 'all systems normal';

  return (
    <Stack
      direction="row"
      alignItems="center"
      spacing={1}
      onClick={onClick}
      sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: '999px',
        border: `1px solid ${tradingTokens.border}`,
        background: tradingTokens.bg.surface,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'border-color 200ms ease',
        '&:hover': onClick ? { borderColor: color } : undefined,
      }}
    >
      <Box
        sx={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 8px ${color}`,
          animation: hasAlerts ? 'pulse 2s ease-in-out infinite' : 'none',
          '@keyframes pulse': {
            '0%, 100%': { opacity: 1 },
            '50%': { opacity: 0.4 },
          },
        }}
      />
      <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.primary, fontWeight: 500 }}>
        {label}
      </Typography>
    </Stack>
  );
}
