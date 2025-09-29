import React, { useState, useEffect, useCallback } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import { AgGridReact } from 'ag-grid-react';
import { ColDef, GridApi, ColumnApi } from 'ag-grid-community';

interface Asset {
  symbol: string;
  name: string;
  type: 'crypto' | 'forex' | 'equity' | 'commodity' | 'derivative';
  price: number;
  change24h: number;
  volume: number;
  bid: number;
  ask: number;
  spread: number;
  lastUpdate: number;
}

interface Order {
  id: string;
  symbol: string;
  side: 'buy' | 'sell';
  type: 'market' | 'limit' | 'stop' | 'stop_limit';
  quantity: number;
  price?: number;
  stopPrice?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'GTD';
  status: 'pending' | 'open' | 'filled' | 'cancelled' | 'rejected';
  timestamp: number;
}

interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
}

interface MultiAssetTradingInterfaceProps {
  onPlaceOrder?: (order: Partial<Order>) => void;
  onCancelOrder?: (orderId: string) => void;
  onClosePosition?: (symbol: string) => void;
}

const Container = styled.div`
  display: grid;
  grid-template-columns: 300px 1fr 300px;
  grid-template-rows: auto 1fr auto;
  gap: 16px;
  height: 100vh;
  padding: 16px;
  background: #0a0a0a;
  color: #fff;
`;

const Header = styled.div`
  grid-column: 1 / -1;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px;
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
`;

const Title = styled.h1`
  margin: 0;
  font-size: 20px;
  font-weight: 600;
`;

const ConnectionStatus = styled.div<{ connected: boolean }>`
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 14px;
  background: ${props => props.connected ? 'rgba(0, 255, 136, 0.1)' : 'rgba(255, 82, 82, 0.1)'};
  color: ${props => props.connected ? '#00ff88' : '#ff5252'};
  border: 1px solid ${props => props.connected ? '#00ff88' : '#ff5252'};
`;

const LeftPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const RightPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const CenterPanel = styled.div`
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Panel = styled.div`
  background: #1a1a1a;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
`;

const PanelHeader = styled.div`
  padding: 12px 16px;
  background: #2a2a2a;
  border-bottom: 1px solid #333;
  font-size: 14px;
  font-weight: 600;
  color: #ccc;
`;

const PanelContent = styled.div`
  padding: 16px;
`;

const OrderForm = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 4px;
`;

const Label = styled.label`
  font-size: 12px;
  color: #888;
  font-weight: 500;
`;

const Input = styled.input`
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

const ButtonGroup = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
`;

const Button = styled(motion.button)<{ variant?: 'buy' | 'sell' | 'primary' | 'secondary' }>`
  padding: 10px 16px;
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  background: ${props => {
    switch (props.variant) {
      case 'buy': return '#00ff88';
      case 'sell': return '#ff5252';
      case 'primary': return '#007bff';
      default: return '#6c757d';
    }
  }};
  color: ${props => props.variant === 'buy' ? '#000' : '#fff'};
  
  &:hover {
    opacity: 0.9;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const AssetList = styled.div`
  max-height: 400px;
  overflow-y: auto;
`;

const AssetItem = styled(motion.div)<{ selected: boolean }>`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  cursor: pointer;
  border-bottom: 1px solid #333;
  background: ${props => props.selected ? '#2a2a2a' : 'transparent'};
  
  &:hover {
    background: #2a2a2a;
  }
`;

const AssetInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const AssetSymbol = styled.div`
  font-size: 14px;
  font-weight: 600;
`;

const AssetName = styled.div`
  font-size: 12px;
  color: #888;
`;

const AssetPrice = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-end;
`;

const Price = styled.div`
  font-size: 14px;
  font-weight: 600;
  font-family: monospace;
`;

const PriceChange = styled.div<{ positive: boolean }>`
  font-size: 12px;
  color: ${props => props.positive ? '#00ff88' : '#ff5252'};
`;

const GridContainer = styled.div`
  height: 300px;
  
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

const MultiAssetTradingInterface: React.FC<MultiAssetTradingInterfaceProps> = ({
  onPlaceOrder,
  onCancelOrder,
  onClosePosition,
}) => {
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [orderForm, setOrderForm] = useState({
    side: 'buy' as 'buy' | 'sell',
    type: 'limit' as 'market' | 'limit' | 'stop' | 'stop_limit',
    quantity: '',
    price: '',
    stopPrice: '',
    timeInForce: 'GTC' as 'GTC' | 'IOC' | 'FOK' | 'GTD',
  });
  const [connected, setConnected] = useState(true);

  // Mock data
  const [assets] = useState<Asset[]>([
    {
      symbol: 'BTC-USD',
      name: 'Bitcoin',
      type: 'crypto',
      price: 43250.00,
      change24h: 2.98,
      volume: 28500000000,
      bid: 43249.50,
      ask: 43250.50,
      spread: 1.00,
      lastUpdate: Date.now(),
    },
    {
      symbol: 'ETH-USD',
      name: 'Ethereum',
      type: 'crypto',
      price: 2680.75,
      change24h: 3.28,
      volume: 15200000000,
      bid: 2680.25,
      ask: 2681.25,
      spread: 1.00,
      lastUpdate: Date.now(),
    },
    {
      symbol: 'EUR-USD',
      name: 'Euro/US Dollar',
      type: 'forex',
      price: 1.0875,
      change24h: -0.12,
      volume: 125000000000,
      bid: 1.0874,
      ask: 1.0876,
      spread: 0.0002,
      lastUpdate: Date.now(),
    },
    {
      symbol: 'AAPL',
      name: 'Apple Inc.',
      type: 'equity',
      price: 185.25,
      change24h: 1.45,
      volume: 45000000,
      bid: 185.20,
      ask: 185.30,
      spread: 0.10,
      lastUpdate: Date.now(),
    },
  ]);

  const [orders] = useState<Order[]>([
    {
      id: 'ord_001',
      symbol: 'BTC-USD',
      side: 'buy',
      type: 'limit',
      quantity: 0.5,
      price: 43000,
      timeInForce: 'GTC',
      status: 'open',
      timestamp: Date.now() - 300000,
    },
    {
      id: 'ord_002',
      symbol: 'ETH-USD',
      side: 'sell',
      type: 'limit',
      quantity: 2.0,
      price: 2700,
      timeInForce: 'GTC',
      status: 'open',
      timestamp: Date.now() - 600000,
    },
  ]);

  const [positions] = useState<Position[]>([
    {
      symbol: 'BTC-USD',
      side: 'long',
      size: 1.25,
      entryPrice: 42800,
      currentPrice: 43250,
      unrealizedPnl: 562.50,
      unrealizedPnlPercent: 1.05,
    },
    {
      symbol: 'ETH-USD',
      side: 'long',
      size: 5.0,
      entryPrice: 2650,
      currentPrice: 2680.75,
      unrealizedPnl: 153.75,
      unrealizedPnlPercent: 1.16,
    },
  ]);

  // Grid column definitions
  const orderColumns: ColDef[] = [
    { headerName: 'Symbol', field: 'symbol', width: 100 },
    { headerName: 'Side', field: 'side', width: 60 },
    { headerName: 'Type', field: 'type', width: 70 },
    { headerName: 'Qty', field: 'quantity', width: 80 },
    { headerName: 'Price', field: 'price', width: 90 },
    { headerName: 'Status', field: 'status', width: 80 },
    {
      headerName: 'Actions',
      field: 'actions',
      width: 100,
      cellRenderer: (params: any) => (
        <Button
          variant="secondary"
          onClick={() => onCancelOrder?.(params.data.id)}
          style={{ padding: '2px 8px', fontSize: '11px' }}
        >
          Cancel
        </Button>
      ),
    },
  ];

  const positionColumns: ColDef[] = [
    { headerName: 'Symbol', field: 'symbol', width: 100 },
    { headerName: 'Side', field: 'side', width: 60 },
    { headerName: 'Size', field: 'size', width: 80 },
    { headerName: 'Entry', field: 'entryPrice', width: 90 },
    { headerName: 'Current', field: 'currentPrice', width: 90 },
    { headerName: 'P&L', field: 'unrealizedPnl', width: 90 },
    {
      headerName: 'Actions',
      field: 'actions',
      width: 100,
      cellRenderer: (params: any) => (
        <Button
          variant="secondary"
          onClick={() => onClosePosition?.(params.data.symbol)}
          style={{ padding: '2px 8px', fontSize: '11px' }}
        >
          Close
        </Button>
      ),
    },
  ];

  const handleAssetSelect = (asset: Asset) => {
    setSelectedAsset(asset);
    setOrderForm(prev => ({
      ...prev,
      price: asset.price.toString(),
    }));
  };

  const handleOrderSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedAsset) return;

    const order: Partial<Order> = {
      symbol: selectedAsset.symbol,
      side: orderForm.side,
      type: orderForm.type,
      quantity: parseFloat(orderForm.quantity),
      price: orderForm.type !== 'market' ? parseFloat(orderForm.price) : undefined,
      stopPrice: orderForm.type.includes('stop') ? parseFloat(orderForm.stopPrice) : undefined,
      timeInForce: orderForm.timeInForce,
    };

    onPlaceOrder?.(order);
    
    // Reset form
    setOrderForm(prev => ({
      ...prev,
      quantity: '',
    }));
  };

  const formatPrice = (price: number, decimals: number = 2) => {
    return price.toFixed(decimals);
  };

  const formatPercentage = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  return (
    <Container>
      <Header>
        <Title>Multi-Asset Trading Terminal</Title>
        <ConnectionStatus connected={connected}>
          <div style={{ 
            width: '8px', 
            height: '8px', 
            borderRadius: '50%', 
            backgroundColor: 'currentColor' 
          }} />
          {connected ? 'Connected' : 'Disconnected'}
        </ConnectionStatus>
      </Header>

      <LeftPanel>
        <Panel>
          <PanelHeader>Asset Selection</PanelHeader>
          <AssetList>
            {assets.map((asset) => (
              <AssetItem
                key={asset.symbol}
                selected={selectedAsset?.symbol === asset.symbol}
                onClick={() => handleAssetSelect(asset)}
                whileHover={{ backgroundColor: '#2a2a2a' }}
                whileTap={{ scale: 0.98 }}
              >
                <AssetInfo>
                  <AssetSymbol>{asset.symbol}</AssetSymbol>
                  <AssetName>{asset.name}</AssetName>
                </AssetInfo>
                <AssetPrice>
                  <Price>${formatPrice(asset.price)}</Price>
                  <PriceChange positive={asset.change24h >= 0}>
                    {formatPercentage(asset.change24h)}
                  </PriceChange>
                </AssetPrice>
              </AssetItem>
            ))}
          </AssetList>
        </Panel>

        <Panel>
          <PanelHeader>Order Entry</PanelHeader>
          <PanelContent>
            <OrderForm onSubmit={handleOrderSubmit}>
              <FormGroup>
                <Label>Asset</Label>
                <Input
                  type="text"
                  value={selectedAsset?.symbol || ''}
                  readOnly
                  placeholder="Select an asset"
                />
              </FormGroup>

              <ButtonGroup>
                <Button
                  type="button"
                  variant="buy"
                  onClick={() => setOrderForm(prev => ({ ...prev, side: 'buy' }))}
                  style={{ 
                    opacity: orderForm.side === 'buy' ? 1 : 0.6 
                  }}
                >
                  BUY
                </Button>
                <Button
                  type="button"
                  variant="sell"
                  onClick={() => setOrderForm(prev => ({ ...prev, side: 'sell' }))}
                  style={{ 
                    opacity: orderForm.side === 'sell' ? 1 : 0.6 
                  }}
                >
                  SELL
                </Button>
              </ButtonGroup>

              <FormGroup>
                <Label>Order Type</Label>
                <Select
                  value={orderForm.type}
                  onChange={(e) => setOrderForm(prev => ({ 
                    ...prev, 
                    type: e.target.value as any 
                  }))}
                >
                  <option value="market">Market</option>
                  <option value="limit">Limit</option>
                  <option value="stop">Stop</option>
                  <option value="stop_limit">Stop Limit</option>
                </Select>
              </FormGroup>

              <FormGroup>
                <Label>Quantity</Label>
                <Input
                  type="number"
                  step="0.001"
                  value={orderForm.quantity}
                  onChange={(e) => setOrderForm(prev => ({ 
                    ...prev, 
                    quantity: e.target.value 
                  }))}
                  placeholder="0.000"
                />
              </FormGroup>

              {orderForm.type !== 'market' && (
                <FormGroup>
                  <Label>Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={orderForm.price}
                    onChange={(e) => setOrderForm(prev => ({ 
                      ...prev, 
                      price: e.target.value 
                    }))}
                    placeholder="0.00"
                  />
                </FormGroup>
              )}

              {orderForm.type.includes('stop') && (
                <FormGroup>
                  <Label>Stop Price</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={orderForm.stopPrice}
                    onChange={(e) => setOrderForm(prev => ({ 
                      ...prev, 
                      stopPrice: e.target.value 
                    }))}
                    placeholder="0.00"
                  />
                </FormGroup>
              )}

              <FormGroup>
                <Label>Time in Force</Label>
                <Select
                  value={orderForm.timeInForce}
                  onChange={(e) => setOrderForm(prev => ({ 
                    ...prev, 
                    timeInForce: e.target.value as any 
                  }))}
                >
                  <option value="GTC">Good Till Cancelled</option>
                  <option value="IOC">Immediate or Cancel</option>
                  <option value="FOK">Fill or Kill</option>
                  <option value="GTD">Good Till Date</option>
                </Select>
              </FormGroup>

              <Button
                type="submit"
                variant="primary"
                disabled={!selectedAsset || !orderForm.quantity}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                Place Order
              </Button>
            </OrderForm>
          </PanelContent>
        </Panel>
      </LeftPanel>

      <CenterPanel>
        <Panel style={{ flex: 1 }}>
          <PanelHeader>Market Data & Charts</PanelHeader>
          <PanelContent>
            {selectedAsset ? (
              <div>
                <h3>{selectedAsset.symbol}</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Bid</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#00ff88' }}>
                      ${formatPrice(selectedAsset.bid)}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Ask</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: '#ff5252' }}>
                      ${formatPrice(selectedAsset.ask)}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: '12px', color: '#888' }}>
                  Spread: ${formatPrice(selectedAsset.spread, 4)}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: '#888', padding: '40px' }}>
                Select an asset to view market data
              </div>
            )}
          </PanelContent>
        </Panel>
      </CenterPanel>

      <RightPanel>
        <Panel>
          <PanelHeader>Open Orders ({orders.length})</PanelHeader>
          <GridContainer>
            <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
              <AgGridReact
                columnDefs={orderColumns}
                rowData={orders}
                defaultColDef={{
                  sortable: true,
                  resizable: true,
                }}
              />
            </div>
          </GridContainer>
        </Panel>

        <Panel>
          <PanelHeader>Positions ({positions.length})</PanelHeader>
          <GridContainer>
            <div className="ag-theme-alpine-dark" style={{ height: '100%', width: '100%' }}>
              <AgGridReact
                columnDefs={positionColumns}
                rowData={positions}
                defaultColDef={{
                  sortable: true,
                  resizable: true,
                }}
              />
            </div>
          </GridContainer>
        </Panel>
      </RightPanel>
    </Container>
  );
};

export default MultiAssetTradingInterface;
