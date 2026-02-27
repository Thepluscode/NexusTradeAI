import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Typography,
} from '@mui/material';
import type { Position } from '@/types';

interface PositionsTableProps {
  positions: Position[];
}

export const PositionsTable: React.FC<PositionsTableProps> = ({ positions }) => {
  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatTime = (timestamp: number | undefined) => {
    if (timestamp == null) return '—';
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? '—' : d.toLocaleString();
  };

  if (!positions || positions.length === 0) {
    return (
      <Card>
        <CardHeader title="Active Positions" />
        <CardContent>
          <Typography color="text.secondary" align="center">
            No active positions
          </Typography>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Active Positions"
        subheader={`${positions.length} position${positions.length > 1 ? 's' : ''}`}
      />
      <CardContent>
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Side</TableCell>
                <TableCell align="right">Quantity</TableCell>
                <TableCell align="right">Entry</TableCell>
                <TableCell align="right">Current</TableCell>
                <TableCell align="right">P&L</TableCell>
                <TableCell>Strategy</TableCell>
                <TableCell align="right">Confidence</TableCell>
                <TableCell>Open Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {positions.map((position, index) => (
                <TableRow key={position.id || `${position.symbol}-${position.strategy}-${index}`} hover>
                  <TableCell>
                    <Typography variant="body2" fontWeight="bold">
                      {position.symbol}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={(position.side || position.direction || 'N/A').toUpperCase()}
                      color={(position.side || position.direction)?.toLowerCase() === 'long' ? 'success' : 'error'}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">{position.quantity ?? 'N/A'}</TableCell>
                  <TableCell align="right">
                    {formatCurrency(position.entryPrice ?? position.entry ?? 0)}
                  </TableCell>
                  <TableCell align="right">
                    {formatCurrency(position.currentPrice ?? position.current ?? 0)}
                  </TableCell>
                  <TableCell align="right">
                    <Typography
                      variant="body2"
                      color={(position.pnl ?? position.unrealizedPnL ?? position.profit ?? 0) >= 0 ? 'success.main' : 'error.main'}
                      fontWeight="bold"
                    >
                      {formatCurrency(position.pnl ?? position.unrealizedPnL ?? position.profit ?? 0)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={position.strategy}
                      variant="outlined"
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="right">
                    <Chip
                      label={position.confidence ? `${(position.confidence * 100).toFixed(0)}%` : 'N/A'}
                      color={
                        position.confidence
                          ? position.confidence >= 0.7
                            ? 'success'
                            : position.confidence >= 0.5
                            ? 'warning'
                            : 'error'
                          : 'default'
                      }
                      size="small"
                    />
                  </TableCell>
                  <TableCell>
                    <Typography variant="caption" color="text.secondary">
                      {formatTime(position.openTime)}
                    </Typography>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </CardContent>
    </Card>
  );
};
