import React from 'react';
import { Chip } from '@mui/material';
import { CheckCircle, Error, HourglassEmpty } from '@mui/icons-material';

interface StatusBadgeProps {
  status: 'online' | 'offline' | 'loading';
  label: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, label }) => {
  const getIcon = () => {
    switch (status) {
      case 'online':
        return <CheckCircle />;
      case 'offline':
        return <Error />;
      case 'loading':
        return <HourglassEmpty />;
    }
  };

  const getColor = () => {
    switch (status) {
      case 'online':
        return 'success';
      case 'offline':
        return 'error';
      case 'loading':
        return 'warning';
    }
  };

  return (
    <Chip
      icon={getIcon()}
      label={label}
      color={getColor()}
      size="small"
      sx={{ mr: 1 }}
    />
  );
};
