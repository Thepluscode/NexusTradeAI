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
  error: '#ef4444',
  warning: '#f59e0b',
  info: '#06b6d4',
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
        transition: 'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.3s ease, border-color 0.3s ease',
        '&:hover': {
          transform: 'translateY(-4px)',
          boxShadow: `0 12px 32px ${alpha(accent, 0.15)}`,
          borderColor: alpha(accent, 0.25),
        },
        // Top accent line
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: `linear-gradient(90deg, ${accent}, ${alpha(accent, 0.3)})`,
        },
      }}
    >
      <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 } }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                color: 'text.secondary',
                fontWeight: 500,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                mb: 1,
              }}
            >
              {title}
            </Typography>
            <Typography
              variant="h4"
              component="div"
              sx={{
                fontWeight: 800,
                color: 'text.primary',
                wordBreak: 'break-word',
                fontSize: { xs: '1.5rem', sm: '1.75rem', md: '2rem' },
                letterSpacing: '-0.03em',
                lineHeight: 1.1,
              }}
            >
              <Box component="span" sx={{ color: accent }}>
                {prefix}
              </Box>
              {value}
              {suffix && (
                <Box
                  component="span"
                  sx={{ fontSize: '0.6em', fontWeight: 500, color: 'text.secondary', ml: 0.5 }}
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
                  py: 0.3,
                  borderRadius: '6px',
                  bgcolor: isPositive ? alpha('#10b981', 0.1) : alpha('#ef4444', 0.1),
                }}
              >
                {isPositive ? (
                  <TrendingUp sx={{ fontSize: 14, color: 'success.main' }} />
                ) : (
                  <TrendingDown sx={{ fontSize: 14, color: 'error.main' }} />
                )}
                <Typography
                  variant="body2"
                  sx={{
                    ml: 0.5,
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: isPositive ? 'success.main' : 'error.main',
                  }}
                >
                  {isPositive ? '+' : ''}{change.toFixed(2)}%
                </Typography>
              </Box>
            )}
          </Box>
          {icon && (
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: '14px',
                background: `linear-gradient(135deg, ${alpha(accent, 0.15)}, ${alpha(accent, 0.05)})`,
                border: `1px solid ${alpha(accent, 0.15)}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: accent,
                flexShrink: 0,
                transition: 'all 0.3s ease',
                '& svg': { fontSize: 22 },
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
