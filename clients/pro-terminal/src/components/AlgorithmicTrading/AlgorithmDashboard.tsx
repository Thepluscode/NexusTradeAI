import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi, ColumnApi } from 'ag-grid-community';
import 'ag-grid-enterprise';

import { TWAPAlgorithm, TWAPConfig, TWAPState } from '../../algorithms/twap';
import { VWAPAlgorithm, VWAPConfig, VWAPState } from '../../algorithms/vwap';
import { ImplementationShortfallAlgorithm } from '../../algorithms/implementation-shortfall';
import { MarketMakingAlgorithm } from '../../algorithms/market-making';

interface AlgorithmInstance {
  id: string;
  type: 'TWAP' | 'VWAP' | 'IS' | 'MM';
  symbol: string;
  status: 'pending' | 'running' | 'paused' | 'completed' | 'cancelled' | 'error';
  progress: number;
  pnl: number;
  startTime: number;
  config: any;
  algorithm: any;
}

interface AlgorithmDashboardProps {
  onCreateAlgorithm?: (type: string, config: any) => void;
  onControlAlgorithm?: (id: string, action: 'start' | 'pause' | 'stop') => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0a;
  color: #fff;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 24px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
`;

const Title = styled.h2`
  margin: 0;
  font-size: 18px;
  font-weight: 600;
`;

const Controls = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
`;

const Button = styled(motion.button)<{ variant?: 'primary' | 'secondary' | 'danger' }>`
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  background: ${props => {
    switch (props.variant) {
      case 'primary': return '#007bff';
      case 'danger': return '#dc3545';
      default: return '#6c757d';
    }
  }};
  color: white;
  
  &:hover {
    opacity: 0.9;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
  padding: 16px 24px;
  background: #111;
`;

const StatCard = styled(motion.div)`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  padding: 16px;
`;

const StatLabel = styled.div`
  font-size: 12px;
  color: #888;
  margin-bottom: 4px;
`;

const StatValue = styled.div<{ color?: string }>`
  font-size: 20px;
  font-weight: 600;
  color: ${props => props.color || '#fff'};
`;

const GridContainer = styled.div`
  flex: 1;
  padding: 0 24px 24px;
  
  .ag-theme-alpine-dark {
    --ag-background-color: #1a1a1a;
    --ag-header-background-color: #2a2a2a;
    --ag-odd-row-background-color: #1e1e1e;
    --ag-row-hover-color: #333;
    --ag-border-color: #444;
    --ag-foreground-color: #fff;
    --ag-secondary-foreground-color: #ccc;
  }
`;

const CreateAlgorithmModal = styled(motion.div)`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
`;

const ModalContent = styled(motion.div)`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 24px;
  width: 500px;
  max-height: 80vh;
  overflow-y: auto;
`;

const FormGroup = styled.div`
  margin-bottom: 16px;
`;

const Label = styled.label`
  display: block;
  margin-bottom: 4px;
  font-size: 14px;
  color: #ccc;
`;

const Input = styled.input`
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const Select = styled.select`
  width: 100%;
  padding: 8px 12px;
  background: #2a2a2a;
  border: 1px solid #444;
  border-radius: 4px;
  color: #fff;
  font-size: 14px;
  
  &:focus {
    outline: none;
    border-color: #007bff;
  }
`;

const AlgorithmDashboard: React.FC<AlgorithmDashboardProps> = ({
  onCreateAlgorithm,
  onControlAlgorithm,
}) => {
  const [algorithms, setAlgorithms] = useState<AlgorithmInstance[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedAlgorithm, setSelectedAlgorithm] = useState<string | null>(null);
  const [gridApi, setGridApi] = useState<GridApi | null>(null);
  const [columnApi, setColumnApi] = useState<ColumnApi | null>(null);

  // Mock statistics
  const stats = {
    totalAlgorithms: algorithms.length,
    runningAlgorithms: algorithms.filter(a => a.status === 'running').length,
    totalPnL: algorithms.reduce((sum, a) => sum + a.pnl, 0),
    successRate: algorithms.length > 0 
      ? (algorithms.filter(a => a.status === 'completed' && a.pnl > 0).length / algorithms.length) * 100 
      : 0,
  };

  // Grid column definitions
  const columnDefs: ColDef[] = [
    {
      headerName: 'ID',
      field: 'id',
      width: 120,
      cellRenderer: (params: any) => (
        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
          {params.value.substring(0, 8)}...
        </span>
      ),
    },
    {
      headerName: 'Type',
      field: 'type',
      width: 80,
      cellRenderer: (params: any) => (
        <span style={{ 
          padding: '2px 6px', 
          borderRadius: '4px', 
          fontSize: '11px',
          background: getAlgorithmTypeColor(params.value),
          color: '#fff'
        }}>
          {params.value}
        </span>
      ),
    },
    {
      headerName: 'Symbol',
      field: 'symbol',
      width: 100,
    },
    {
      headerName: 'Status',
      field: 'status',
      width: 100,
      cellRenderer: (params: any) => (
        <span style={{ 
          color: getStatusColor(params.value),
          fontWeight: '600',
          fontSize: '12px'
        }}>
          {params.value.toUpperCase()}
        </span>
      ),
    },
    {
      headerName: 'Progress',
      field: 'progress',
      width: 120,
      cellRenderer: (params: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '60px',
            height: '4px',
            background: '#333',
            borderRadius: '2px',
            overflow: 'hidden'
          }}>
            <div style={{
              width: `${params.value}%`,
              height: '100%',
              background: '#007bff',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <span style={{ fontSize: '11px', color: '#ccc' }}>
            {params.value.toFixed(1)}%
          </span>
        </div>
      ),
    },
    {
      headerName: 'P&L',
      field: 'pnl',
      width: 120,
      cellRenderer: (params: any) => (
        <span style={{ 
          color: params.value >= 0 ? '#00ff88' : '#ff5252',
          fontWeight: '600',
          fontFamily: 'monospace'
        }}>
          {params.value >= 0 ? '+' : ''}${params.value.toFixed(2)}
        </span>
      ),
    },
    {
      headerName: 'Start Time',
      field: 'startTime',
      width: 150,
      cellRenderer: (params: any) => (
        <span style={{ fontSize: '12px', color: '#ccc' }}>
          {new Date(params.value).toLocaleString()}
        </span>
      ),
    },
    {
      headerName: 'Actions',
      field: 'actions',
      width: 150,
      cellRenderer: (params: any) => (
        <div style={{ display: 'flex', gap: '4px' }}>
          {params.data.status === 'running' && (
            <button
              onClick={() => handleControlAlgorithm(params.data.id, 'pause')}
              style={{
                padding: '2px 6px',
                fontSize: '11px',
                background: '#ffc107',
                color: '#000',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Pause
            </button>
          )}
          {(params.data.status === 'paused' || params.data.status === 'pending') && (
            <button
              onClick={() => handleControlAlgorithm(params.data.id, 'start')}
              style={{
                padding: '2px 6px',
                fontSize: '11px',
                background: '#28a745',
                color: '#fff',
                border: 'none',
                borderRadius: '3px',
                cursor: 'pointer'
              }}
            >
              Start
            </button>
          )}
          <button
            onClick={() => handleControlAlgorithm(params.data.id, 'stop')}
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              background: '#dc3545',
              color: '#fff',
              border: 'none',
              borderRadius: '3px',
              cursor: 'pointer'
            }}
          >
            Stop
          </button>
        </div>
      ),
    },
  ];

  const getAlgorithmTypeColor = (type: string) => {
    switch (type) {
      case 'TWAP': return '#007bff';
      case 'VWAP': return '#28a745';
      case 'IS': return '#ffc107';
      case 'MM': return '#dc3545';
      default: return '#6c757d';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return '#00ff88';
      case 'completed': return '#007bff';
      case 'paused': return '#ffc107';
      case 'error': return '#ff5252';
      case 'cancelled': return '#6c757d';
      default: return '#ccc';
    }
  };

  const handleCreateAlgorithm = () => {
    setShowCreateModal(true);
  };

  const handleControlAlgorithm = (id: string, action: 'start' | 'pause' | 'stop') => {
    const algorithm = algorithms.find(a => a.id === id);
    if (!algorithm) return;

    switch (action) {
      case 'start':
        algorithm.algorithm?.start?.();
        break;
      case 'pause':
        algorithm.algorithm?.pause?.();
        break;
      case 'stop':
        algorithm.algorithm?.cancel?.();
        break;
    }

    onControlAlgorithm?.(id, action);
  };

  const onGridReady = (params: any) => {
    setGridApi(params.api);
    setColumnApi(params.columnApi);
  };

  // Auto-refresh grid data
  useEffect(() => {
    const interval = setInterval(() => {
      if (gridApi) {
        gridApi.refreshCells();
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [gridApi]);

  return (
    <Container>
      <Header>
        <Title>Algorithm Dashboard</Title>
        <Controls>
          <Button
            variant="primary"
            onClick={handleCreateAlgorithm}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Create Algorithm
          </Button>
          <Button
            variant="secondary"
            onClick={() => window.location.reload()}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            Refresh
          </Button>
        </Controls>
      </Header>

      <StatsGrid>
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <StatLabel>Total Algorithms</StatLabel>
          <StatValue>{stats.totalAlgorithms}</StatValue>
        </StatCard>
        
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <StatLabel>Running</StatLabel>
          <StatValue color="#00ff88">{stats.runningAlgorithms}</StatValue>
        </StatCard>
        
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
        >
          <StatLabel>Total P&L</StatLabel>
          <StatValue color={stats.totalPnL >= 0 ? '#00ff88' : '#ff5252'}>
            {stats.totalPnL >= 0 ? '+' : ''}${stats.totalPnL.toFixed(2)}
          </StatValue>
        </StatCard>
        
        <StatCard
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <StatLabel>Success Rate</StatLabel>
          <StatValue color="#007bff">{stats.successRate.toFixed(1)}%</StatValue>
        </StatCard>
      </StatsGrid>

      <GridContainer>
        <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
          <AgGridReact
            columnDefs={columnDefs}
            rowData={algorithms}
            onGridReady={onGridReady}
            rowSelection="single"
            onSelectionChanged={(event) => {
              const selectedRows = event.api.getSelectedRows();
              setSelectedAlgorithm(selectedRows.length > 0 ? selectedRows[0].id : null);
            }}
            animateRows={true}
            enableCellTextSelection={true}
            suppressRowClickSelection={false}
            defaultColDef={{
              sortable: true,
              filter: true,
              resizable: true,
            }}
          />
        </div>
      </GridContainer>

      <AnimatePresence>
        {showCreateModal && (
          <CreateAlgorithmModal
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCreateModal(false)}
          >
            <ModalContent
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 20px 0' }}>Create New Algorithm</h3>
              
              <FormGroup>
                <Label>Algorithm Type</Label>
                <Select>
                  <option value="TWAP">TWAP - Time Weighted Average Price</option>
                  <option value="VWAP">VWAP - Volume Weighted Average Price</option>
                  <option value="IS">IS - Implementation Shortfall</option>
                  <option value="MM">MM - Market Making</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Symbol</Label>
                <Input type="text" placeholder="BTC-USD" />
              </FormGroup>

              <FormGroup>
                <Label>Side</Label>
                <Select>
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Quantity</Label>
                <Input type="number" placeholder="1000" />
              </FormGroup>

              <FormGroup>
                <Label>Duration (minutes)</Label>
                <Input type="number" placeholder="60" />
              </FormGroup>

              <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end', marginTop: '24px' }}>
                <Button
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    // Handle algorithm creation
                    setShowCreateModal(false);
                  }}
                >
                  Create
                </Button>
              </div>
            </ModalContent>
          </CreateAlgorithmModal>
        )}
      </AnimatePresence>
    </Container>
  );
};

export default AlgorithmDashboard;
