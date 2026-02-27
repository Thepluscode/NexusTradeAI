import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Button,
  Box,
  Alert,
} from '@mui/material';
import { PlayArrow, Stop, MonetizationOn } from '@mui/icons-material';

interface ControlPanelProps {
  isRunning: boolean;
  circuitBreakerActive: boolean;
  onStart: () => void;
  onStop: () => void;
  onRealizeProfits: () => void;
  isStarting?: boolean;
  isStopping?: boolean;
}

export const ControlPanel: React.FC<ControlPanelProps> = ({
  isRunning,
  circuitBreakerActive,
  onStart,
  onStop,
  onRealizeProfits,
  isStarting,
  isStopping,
}) => {
  return (
    <Card>
      <CardHeader title="Trading Controls" />
      <CardContent>
        {circuitBreakerActive && (
          <Alert severity="error" sx={{ mb: 2 }}>
            Circuit Breaker Active - Trading Halted
          </Alert>
        )}

        <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
          {!isRunning ? (
            <Button
              variant="contained"
              color="success"
              startIcon={<PlayArrow />}
              onClick={onStart}
              disabled={isStarting || circuitBreakerActive}
            >
              {isStarting ? 'Starting...' : 'Start Trading'}
            </Button>
          ) : (
            <Button
              variant="contained"
              color="error"
              startIcon={<Stop />}
              onClick={onStop}
              disabled={isStopping}
            >
              {isStopping ? 'Stopping...' : 'Stop Trading'}
            </Button>
          )}

          <Button
            variant="outlined"
            color="primary"
            startIcon={<MonetizationOn />}
            onClick={onRealizeProfits}
            disabled={!isRunning}
          >
            Realize Profits
          </Button>
        </Box>
      </CardContent>
    </Card>
  );
};
