import { useState } from 'react';
import { Box, Stack, Skeleton } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import SEO from '@/components/SEO';
import SubtitleStrip from '@/components/overview/SubtitleStrip';
import HeroZone from '@/components/overview/HeroZone';
import BotTile from '@/components/overview/BotTile';
import EdgeAttributionPanel from '@/components/overview/EdgeAttributionPanel';
import EquityCurvePanel from '@/components/overview/EquityCurvePanel';
import AlertsPanel from '@/components/overview/AlertsPanel';
import TradesFeedPanel from '@/components/overview/TradesFeedPanel';
import { tradingTokens } from '@/theme';
import { fetchAllBotStatuses, type BotStatus } from '@/components/overview/api';
import type { BotData } from '@/components/overview/types';

// Synthetic equity sparkline derived from current dailyPnL — placeholder until
// an intraday-equity endpoint exists. Last point reflects the actual P&L sign,
// so the sparkline color and shape are honest at the edges.
function synthesizeSparkline(dailyPnL: number, points = 48): number[] {
  const start = 50_000;
  const end = start + dailyPnL;
  return Array.from({ length: points }, (_, i) => {
    const t = i / (points - 1);
    const drift = start + (end - start) * t;
    const jitter = Math.sin(i / 4) * Math.abs(dailyPnL) * 0.04;
    return drift + jitter;
  });
}

function toBotData(s: BotStatus): BotData {
  const liveMode: BotData['mode'] = s.mode === 'LIVE' ? 'LIVE' : 'PAPER';
  return {
    key: s.key,
    name: s.name,
    online: s.online,
    isRunning: s.isRunning,
    mode: liveMode,
    dailyPnL: s.dailyPnL,
    equityHistory: synthesizeSparkline(s.dailyPnL),
  };
}

export default function OverviewPage() {
  const [alertCount, setAlertCount] = useState(0);

  const { data: botStatuses, isLoading } = useQuery({
    queryKey: ['overviewBotStatuses'],
    queryFn: fetchAllBotStatuses,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  const bots: BotData[] = (botStatuses ?? []).map(toBotData);
  const aggregateDailyPnL = botStatuses?.reduce((sum, b) => sum + b.dailyPnL, 0) ?? 0;
  const aggregateEquity = botStatuses?.reduce((sum, b) => sum + b.equity, 0) ?? 0;
  const aggregatePositions = botStatuses?.reduce((sum, b) => sum + b.positions, 0) ?? 0;
  const botsUp = botStatuses?.filter((b) => b.online && b.isRunning).length ?? 0;
  const totalBots = botStatuses?.length ?? 3;

  const handleBotClick = (key: BotData['key']) => {
    console.log('Bot tile clicked:', key);
  };

  const handlePillClick = () => {
    console.log('Status pill clicked, alerts:', alertCount);
  };

  return (
    <>
      <SEO
        title="Overview · NexusTradeAI"
        description="Calm hero + cockpit overview of NexusTradeAI autonomous trading bots."
      />
      <Box sx={{ background: tradingTokens.bg.default, minHeight: '100vh', color: tradingTokens.text.primary }}>
        <SubtitleStrip />
        <HeroZone
          dailyPnL={aggregateDailyPnL}
          equity={aggregateEquity}
          openPositions={aggregatePositions}
          botsUp={botsUp}
          totalBots={totalBots}
          alertCount={alertCount}
          loading={isLoading}
          onPillClick={handlePillClick}
        />

        <Box
          sx={{
            p: 3,
            maxWidth: 1920,
            mx: 'auto',
            display: 'grid',
            gap: 2,
            gridTemplateColumns: '320px 1fr 320px',
            '@media (max-width: 1440px)': {
              gridTemplateColumns: '1fr',
            },
          }}
        >
          <Stack spacing={2}>
            {isLoading && bots.length === 0
              ? [0, 1, 2].map((i) => (
                  <Skeleton key={i} variant="rectangular" height={220} sx={{ borderRadius: '8px' }} />
                ))
              : bots.map((b) => <BotTile key={b.key} bot={b} onClick={handleBotClick} />)}
          </Stack>

          <Stack spacing={2}>
            <EdgeAttributionPanel />
            <EquityCurvePanel />
          </Stack>

          <Stack spacing={2}>
            <AlertsPanel onCountChange={setAlertCount} />
            <TradesFeedPanel />
          </Stack>
        </Box>
      </Box>
    </>
  );
}
