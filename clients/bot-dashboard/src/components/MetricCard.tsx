import React from 'react';
import { Card, CardContent, Typography, Box, alpha } from '@mui/material';
import { TrendingUp, TrendingDown } from '@mui/icons-material';

interface MetricCardProps {
  title: string;
  value: string | number;
  change?: number;
  prefix?: string;
  suffix?: string;
  color?: 'primary' | 'success' | 'error' | 'warning' | 'info';
  icon?: React.ReactNode;
}

const COLOR_MAP: Record<string, string> = {
  primary: '#3b82f6',
  success: '#10b981',
  error:   '#ef4444',
  warning: '#f59e0b',
  info:    '#06b6d4',
};

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  change,
  prefix = '',
  suffix = '',
  color = 'primary',
  icon,
}) => {
  const isPositive = change !== undefined && change >= 0;
  const accent = COLOR_MAP[color] || COLOR_MAP.primary;

  return (
    <Card
      sx={{
        height: '100%',
        position: 'relative',
        overflow: 'hidden',
        transition:
          'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), ' +
          'box-shadow 0.3s ease, ' +
          'border-color 0.3s ease',
        '&:hover': {
          transform: 'translateY(-5px)',
          boxShadow: `0 16px 40px ${alpha(accent, 0.18)}`,
          borderColor: alpha(accent, 0.3),
          '& .metric-gradient-border': { opacity: 1 },
          '& .metric-icon-orb': {
            background: `linear-gradient(135deg, ${alpha(accent, 0.28)}, ${alpha(accent, 0.12)})`,
            boxShadow: `0 0 20px ${alpha(accent, 0.3)}`,
            transform: 'scale(1.1) rotate(4deg)',
          },
        },
        // Top accent line
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, ${accent}, ${alpha(accent, 0.2)})`,
          zIndex: 2,
        },
      }}
    >
      {/* ── Animated gradient border overlay ──────────────────────── */}
      <Box
        className="metric-gradient-border"
        sx={{
          position: 'absolute',
          inset: 0,
          borderRadius: 'inherit',
          opacity: 0,
          transition: 'opacity 0.4s ease',
          pointerEvents: 'none',
          zIndex: 1,
          '&::before': {
            content: '""',
            position: 'absolute',
            inset: 0,
            borderRadius: 'inherit',
            padding: '1px',
            background: `linear-gradient(135deg, ${alpha(accent, 0.5)}, transparent 50%, ${alpha(accent, 0.3)})`,
            WebkitMask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
            WebkitMaskComposite: 'xor',
            maskComposite: 'exclude',
          },
        }}
      />

      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, position: 'relative', zIndex: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
                fontSize: '0.72rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                mb: 1,
              }}
            >
              {title}
            </Typography>

            {/* Value with shimmer gradient */}
            <Typography
              variant="h4"
              component="div"
              sx={{
                fontWeight: 800,
                wordBreak: 'break-word',
                fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
                background: `linear-gradient(135deg, #e6edf3 0%, ${alpha(accent, 0.9)} 100%)`,
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}
            >
              <Box component="span" sx={{ WebkitTextFillColor: accent, color: accent }}>
                {prefix}
              </Box>
              {value}
              {suffix && (
                <Box
                  component="span"
                  sx={{ fontSize: '0.55em', fontWeight: 500, opacity: 0.6, ml: 0.5, WebkitTextFillColor: 'inherit' }}
                >
                  {suffix}
                </Box>
              )}
            </Typography>

            {change !== undefined && (
              <Box
                sx={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  mt: 1.5,
                  px: 1,
                  py: 0.35,
                  borderRadius: '6px',
                  bgcolor: isPositive ? alpha('#10b981', 0.1) : alpha('#ef4444', 0.1),
                  border: `1px solid ${isPositive ? alpha('#10b981', 0.2) : alpha('#ef4444', 0.2)}`,
                }}
              >
                {isPositive
                  ? <TrendingUp sx={{ fontSize: 13, color: 'success.main' }} />
                  : <TrendingDown sx={{ fontSize: 13, color: 'error.main' }} />}
                <Typography
                  variant="body2"
                  sx={{
                    ml: 0.4,
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    color: isPositive ? 'success.main' : 'error.main',
                  }}
                >
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </Typography>
              </Box>
            )}
          </Box>

          {/* ── Icon glow orb ──────────────────────────────────────── */}
          {icon && (
            <Box
              className="metric-icon-orb"
              sx={{
                width: 50,
                height: 50,
                borderRadius: '15px',
                background: `linear-gradient(135deg, ${alpha(accent, 0.16)}, ${alpha(accent, 0.06)})`,
                border: `1px solid ${alpha(accent, 0.18)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: accent,
                flexShrink: 0,
                transition: 'all 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                position: 'relative',
                '& svg': {
                  fontSize: 22,
                  filter: `drop-shadow(0 0 8px ${alpha(accent, 0.5)})`,
                },
                // Subtle inner glow
                '&::after': {
                  content: '""',
                  position: 'absolute',
                  inset: 0,
                  borderRadius: 'inherit',
                  background: `radial-gradient(circle at 30% 30%, ${alpha(accent, 0.15)}, transparent 70%)`,
                  pointerEvents: 'none',
                },
              }}
            >
              {icon}
            </Box>
          )}
        </Box>
      </CardContent>
    </Card>
  );
};
