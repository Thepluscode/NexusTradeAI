import { useState } from 'react';
import { Box, Stack, Skeleton, Typography, Button } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import SEO from '@/components/SEO';
import SubtitleStrip from '@/components/overview/SubtitleStrip';
import HeroZone from '@/components/overview/HeroZone';
import BotChip from '@/components/overview/BotChip';
import EdgeAttributionPanel from '@/components/overview/EdgeAttributionPanel';
import EquityCurvePanel from '@/components/overview/EquityCurvePanel';
import AlertsPanel from '@/components/overview/AlertsPanel';
import TradesFeedPanel from '@/components/overview/TradesFeedPanel';
import { tradingTokens, tradingTypography } from '@/theme';
import { fetchAllBotStatuses, fetchIntradayEquity, type BotStatus } from '@/components/overview/api';
import type { BotData, BotKey } from '@/components/overview/types';

function toBotData(s: BotStatus, intraday: number[] | undefined): BotData {
  const liveMode: BotData['mode'] = s.mode === 'LIVE' ? 'LIVE' : 'PAPER';
  return {
    key: s.key,
    name: s.name,
    online: s.online,
    isRunning: s.isRunning,
    mode: liveMode,
    dailyPnL: s.dailyPnL,
    intradayEquity: intraday && intraday.length > 1 ? intraday : undefined,
  };
}

export default function OverviewPage() {
  const [alertCount, setAlertCount] = useState(0);
  const navigate = useNavigate();

  const {
    data: botStatuses,
    isLoading: statusesLoading,
    isError: statusesError,
    refetch: refetchStatuses,
  } = useQuery({
    queryKey: ['overviewBotStatuses'],
    queryFn: fetchAllBotStatuses,
    refetchInterval: 10_000,
    staleTime: 5_000,
  });

  // Shared cache key with EquityCurvePanel + BotChip — one network call.
  const { data: intradayEquity } = useQuery({
    queryKey: ['intradayEquity', 24],
    queryFn: () => fetchIntradayEquity(24),
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const bots: BotData[] = (botStatuses ?? []).map((s) =>
    toBotData(s, intradayEquity?.[s.key as BotKey]),
  );
  const aggregateDailyPnL = botStatuses?.reduce((sum, b) => sum + b.dailyPnL, 0) ?? 0;
  const aggregateEquity = botStatuses?.reduce((sum, b) => sum + b.equity, 0) ?? 0;
  const aggregatePositions = botStatuses?.reduce((sum, b) => sum + b.positions, 0) ?? 0;
  const botsUp = botStatuses?.filter((b) => b.online && b.isRunning).length ?? 0;
  const totalBots = botStatuses?.length ?? 3;

  const handleBotClick = (key: BotData['key']) => {
    const target: Record<BotData['key'], string> = {
      stock: '/stock',
      forex: '/forex',
      crypto: '/crypto',
    };
    navigate(target[key]);
  };

  const handlePillClick = () => {
    const el = document.getElementById('alerts-region');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  return (
    <>
      <SEO
        title="Overview · NexusTradeAI"
        description="Edge-first overview of NexusTradeAI — see where the trading edge is today, then drill into bot health."
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
          loading={statusesLoading}
          onPillClick={handlePillClick}
        />

        {statusesError && (
          <Box sx={{ px: 3, pt: 2, maxWidth: 1920, mx: 'auto' }}>
            <Box
              role="alert"
              sx={{
                background: tradingTokens.bg.surface,
                border: `1px solid ${tradingTokens.status.error}`,
                borderRadius: '8px',
                p: 2,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 2,
              }}
            >
              <Stack>
                <Typography sx={{ ...tradingTypography.h6, color: tradingTokens.status.error }}>
                  Bot status feed unreachable
                </Typography>
                <Typography sx={{ ...tradingTypography.body2, color: tradingTokens.text.secondary }}>
                  No data shown below this point. The bots may still be trading — check Railway logs.
                </Typography>
              </Stack>
              <Button variant="outlined" color="error" size="small" onClick={() => refetchStatuses()}>
                Retry
              </Button>
            </Box>
          </Box>
        )}

        <Box sx={{ p: 3, maxWidth: 1920, mx: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {/* Compact bot strip — health at a glance, no longer the page's focus */}
          <Stack
            direction="row"
            spacing={2}
            sx={{
              flexWrap: 'wrap',
              '@media (max-width: 720px)': {
                flexDirection: 'column',
              },
            }}
          >
            {statusesLoading && bots.length === 0
              ? [0, 1, 2].map((i) => (
                  <Skeleton
                    key={i}
                    variant="rectangular"
                    height={76}
                    sx={{ flex: 1, minWidth: 220, borderRadius: '8px' }}
                  />
                ))
              : bots.map((b) => <BotChip key={b.key} bot={b} onClick={handleBotClick} />)}
          </Stack>

          {/* Edge attribution — the page's primary object */}
          <Box>
            <EdgeAttributionPanel prominent />
          </Box>

          {/* Supporting context: equity, trades, alerts.
              gridAutoRows: 1fr makes all three panels share the row height
              so the bottom row is visually uniform regardless of panel
              content (was uneven 220/240/480 before). */}
          <Box
            id="alerts-region"
            sx={{
              display: 'grid',
              gap: 2,
              gridTemplateColumns: '1fr 1fr 1fr',
              gridAutoRows: '1fr',
              '@media (max-width: 1200px)': {
                gridTemplateColumns: '1fr 1fr',
              },
              '@media (max-width: 720px)': {
                gridTemplateColumns: '1fr',
              },
            }}
          >
            <EquityCurvePanel />
            <TradesFeedPanel />
            <AlertsPanel onCountChange={setAlertCount} />
          </Box>
        </Box>
      </Box>
    </>
  );
}
