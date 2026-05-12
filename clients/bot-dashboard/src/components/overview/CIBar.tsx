import { Box, Tooltip } from '@mui/material';
import { tradingTokens } from '@/theme';
import type { EdgeStatus } from './types';

interface CIBarProps {
  low: number;
  high: number;
  status: EdgeStatus;
  scale?: number;
}

const STATUS_COLOR: Record<EdgeStatus, string> = {
  positive: tradingTokens.status.success,
  negative: tradingTokens.status.error,
  inconclusive: tradingTokens.text.secondary,
  low_n: tradingTokens.text.muted,
};

export default function CIBar({ low, high, status, scale = 0.015 }: CIBarProps) {
  const width = 200;
  const height = 14;
  const center = width / 2;

  const clamp = (v: number) => Math.max(-scale, Math.min(scale, v));
  const lowClamped = clamp(low);
  const highClamped = clamp(high);

  const xLow = center + (lowClamped / scale) * center;
  const xHigh = center + (highClamped / scale) * center;
  const barWidth = Math.max(2, xHigh - xLow);

  const color = STATUS_COLOR[status];
  const dimmed = status === 'low_n';

  const tooltip = `CI 95%: [${(low * 100).toFixed(3)}%, ${(high * 100).toFixed(3)}%]`;

  return (
    <Tooltip title={tooltip} arrow>
      <Box
        sx={{
          width,
          height,
          position: 'relative',
          background: tradingTokens.bg.surface2,
          borderRadius: '3px',
          opacity: dimmed ? 0.55 : 1,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            left: center,
            top: -2,
            width: 1,
            height: height + 4,
            background: tradingTokens.borderStrong,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            left: xLow,
            top: 3,
            width: barWidth,
            height: height - 6,
            background: color,
            borderRadius: '2px',
            transition: 'all 300ms ease',
          }}
        />
      </Box>
    </Tooltip>
  );
}
