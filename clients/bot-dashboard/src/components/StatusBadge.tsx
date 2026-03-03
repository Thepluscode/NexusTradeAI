import { Box, Typography, alpha } from '@mui/material';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'degraded' | string;
  label?: string;
  size?: 'small' | 'medium';
}

const STATUS_CONFIG: Record<string, { color: string; label: string }> = {
  online:   { color: '#10b981', label: 'Online' },
  offline:  { color: '#ef4444', label: 'Offline' },
  degraded: { color: '#f59e0b', label: 'Degraded' },
};

export default function StatusBadge({ status, label, size = 'small' }: StatusBadgeProps) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.offline;
  const displayLabel = label || config.label;
  const dotSize = size === 'small' ? 6 : 8;
  const isOnline = status === 'online';

  return (
    <Box
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.75,
        px: 1.25,
        py: 0.4,
        borderRadius: '8px',
        bgcolor: alpha(config.color, 0.08),
        border: `1px solid ${alpha(config.color, 0.2)}`,
      }}
    >
      {/* ── Dot + ripple rings ──────────────────────────────────── */}
      <Box sx={{ position: 'relative', width: dotSize, height: dotSize, flexShrink: 0 }}>
        {/* Ripple rings (online only) */}
        {isOnline && (
          <>
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                bgcolor: config.color,
                opacity: 0,
                animation: 'rippleExpand 2s ease-out infinite',
              }}
            />
            <Box
              sx={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                bgcolor: config.color,
                opacity: 0,
                animation: 'rippleExpand 2s ease-out 0.75s infinite',
              }}
            />
          </>
        )}
        {/* Core dot */}
        <Box
          sx={{
            position: 'relative',
            width: '100%',
            height: '100%',
            borderRadius: '50%',
            bgcolor: config.color,
            boxShadow: `0 0 ${isOnline ? 8 : 4}px ${config.color}`,
            zIndex: 1,
          }}
        />
      </Box>

      <Typography
        variant="caption"
        sx={{
          fontWeight: 600,
          fontSize: size === 'small' ? '0.65rem' : '0.7rem',
          color: config.color,
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
        }}
      >
        {displayLabel}
      </Typography>
    </Box>
  );
}
