import React from 'react';
import {
  Card,
  CardHeader,
  CardContent,
  List,
  ListItem,
  Alert,
  AlertTitle,
  Typography,
  Box,
} from '@mui/material';
import { Warning, Error, Info } from '@mui/icons-material';
import type { RiskAlert } from '@/types';

interface RiskAlertsProps {
  alerts: RiskAlert[];
}

export const RiskAlerts: React.FC<RiskAlertsProps> = ({ alerts }) => {
  const getIcon = (severity: RiskAlert['severity']) => {
    switch (severity) {
      case 'critical':
      case 'error':
        return <Error color="error" />;
      case 'warning':
        return <Warning color="warning" />;
      default:
        return <Info color="info" />;
    }
  };

  const getSeverityColor = (severity: RiskAlert['severity']): 'error' | 'warning' | 'info' | 'success' => {
    switch (severity) {
      case 'critical':
      case 'error':
        return 'error';
      case 'warning':
        return 'warning';
      default:
        return 'info';
    }
  };

  if (!alerts || alerts.length === 0) {
    return (
      <Card>
        <CardHeader title="Risk Alerts" />
        <CardContent>
          <Alert severity="success">
            <AlertTitle>All Clear</AlertTitle>
            No active risk alerts
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader
        title="Risk Alerts"
        subheader={`${alerts.length} active alert${alerts.length > 1 ? 's' : ''}`}
      />
      <CardContent>
        <List>
          {alerts.map((alert) => (
            <ListItem key={alert.id} sx={{ px: 0 }}>
              <Box sx={{ width: '100%' }}>
                <Alert
                  severity={getSeverityColor(alert.severity)}
                  icon={getIcon(alert.severity)}
                >
                  <AlertTitle sx={{ textTransform: 'capitalize' }}>
                    {alert.type.replace(/_/g, ' ')}
                  </AlertTitle>
                  <Typography variant="body2">
                    {Object.entries(alert.details || {}).map(([key, value]) => (
                      <span key={key}>
                        <strong>{key}:</strong> {JSON.stringify(value)}{' '}
                      </span>
                    ))}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {new Date(alert.timestamp).toLocaleString()}
                  </Typography>
                </Alert>
              </Box>
            </ListItem>
          ))}
        </List>
      </CardContent>
    </Card>
  );
};
