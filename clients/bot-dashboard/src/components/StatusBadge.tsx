import { Box, Typography, alpha } from '@mui/material';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'degraded' | string;
  label?: string;
  size?: 'small' | 'medium';
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  online: { color: '#10b981', label: 'Online' },
  offline: { color: '#ef4444', label: 'Offline' },
  degraded: { color: '#f59e0b', label: 'Degraded' },
};

export default function StatusBadge({ status, label, size = 'small' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.offline;
  const displayLabel = label || config.label;
  const dotSize = size === 'small' ? 6 : 8;

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.2,
        py: 0.4,
        borderRadius: '8px',
        bgcolor: alpha(config.color, 0.1),
        border: `1px solid ${alpha(config.color, 0.2)}`,
      }}
    >
      <Box
        sx={{
          width: dotSize,
          height: dotSize,
          borderRadius: '50%',
          bgcolor: config.color,
          boxShadow: `0 0 6px ${config.color}`,
          ...(status === 'online' && {
            animation: 'pulseDot 2s ease-in-out infinite',
          }),
        }}
      />
      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          fontSize: size === 'small' ? '0.65rem' : '0.7rem',
          color: config.color,
          letterSpacing: '0.03em',
          textTransform: 'uppercase',
        }}
      >
        {displayLabel}
      </Typography>
    </Box>
  );
}
