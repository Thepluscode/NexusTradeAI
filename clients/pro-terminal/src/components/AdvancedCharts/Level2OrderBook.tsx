import React, { useState, useEffect, useRef, useMemo } from 'react';
import styled from 'styled-components';
import { motion, AnimatePresence } from 'framer-motion';
import * as d3 from 'd3';

interface OrderBookLevel {
  price: number;
  size: number;
  total: number;
  orders: number;
  timestamp: number;
}

interface OrderBookData {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  spread: number;
  midPrice: number;
  lastUpdate: number;
}

interface Level2OrderBookProps {
  symbol: string;
  data: OrderBookData;
  maxLevels?: number;
  showDepthChart?: boolean;
  showHeatmap?: boolean;
  precision?: number;
  onPriceClick?: (price: number, side: 'bid' | 'ask') => void;
}

const Container = styled.div`
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #0a0a0a;
  border: 1px solid #333;
  border-radius: 8px;
  overflow: hidden;
`;

const Header = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: #1a1a1a;
  border-bottom: 1px solid #333;
`;

const Title = styled.h3`
  color: #fff;
  font-size: 14px;
  font-weight: 600;
  margin: 0;
`;

const SpreadInfo = styled.div`
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 12px;
`;

const SpreadValue = styled.span`
  color: #ffa500;
  font-weight: 600;
`;

const MidPrice = styled.span`
  color: #00ff88;
  font-weight: 600;
`;

const BookContainer = styled.div`
  display: flex;
  flex: 1;
  min-height: 0;
`;

const BookSide = styled.div<{ side: 'bid' | 'ask' }>`
  flex: 1;
  display: flex;
  flex-direction: column;
  background: ${props => props.side === 'bid' ? '#001a0d' : '#1a0006'};
`;

const BookHeader = styled.div<{ side: 'bid' | 'ask' }>`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 40px;
  gap: 8px;
  padding: 8px 12px;
  background: ${props => props.side === 'bid' ? '#003d1a' : '#3d0013'};
  border-bottom: 1px solid #333;
  font-size: 11px;
  font-weight: 600;
  color: #ccc;
`;

const BookLevels = styled.div`
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
  
  &::-webkit-scrollbar {
    width: 4px;
  }
  
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  
  &::-webkit-scrollbar-thumb {
    background: #333;
    border-radius: 2px;
  }
`;

const BookLevel = styled(motion.div)<{ 
  side: 'bid' | 'ask';
  intensity: number;
  isLarge: boolean;
}>`
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 40px;
  gap: 8px;
  padding: 4px 12px;
  font-size: 11px;
  font-family: 'Monaco', 'Menlo', monospace;
  cursor: pointer;
  position: relative;
  background: ${props => {
    const alpha = Math.min(props.intensity * 0.3, 0.3);
    return props.side === 'bid' 
      ? `rgba(0, 255, 136, ${alpha})`
      : `rgba(255, 82, 82, ${alpha})`;
  }};
  
  &:hover {
    background: ${props => props.side === 'bid' ? '#004d26' : '#4d0019'};
  }
  
  ${props => props.isLarge && `
    border-left: 3px solid ${props.side === 'bid' ? '#00ff88' : '#ff5252'};
  `}
`;

const PriceCell = styled.div<{ side: 'bid' | 'ask' }>`
  color: ${props => props.side === 'bid' ? '#00ff88' : '#ff5252'};
  font-weight: 600;
`;

const SizeCell = styled.div`
  color: #fff;
  text-align: right;
`;

const TotalCell = styled.div`
  color: #ccc;
  text-align: right;
`;

const OrdersCell = styled.div`
  color: #888;
  text-align: center;
  font-size: 10px;
`;

const DepthChart = styled.div`
  height: 200px;
  border-top: 1px solid #333;
  background: #0f0f0f;
`;

const Level2OrderBook: React.FC<Level2OrderBookProps> = ({
  symbol,
  data,
  maxLevels = 20,
  showDepthChart = true,
  showHeatmap = true,
  precision = 2,
  onPriceClick,
}) => {
  const [selectedPrice, setSelectedPrice] = useState<number | null>(null);
  const [hoverPrice, setHoverPrice] = useState<number | null>(null);
  const depthChartRef = useRef<SVGSVGElement>(null);

  // Process and limit order book data
  const processedData = useMemo(() => {
    const bids = data.bids.slice(0, maxLevels);
    const asks = data.asks.slice(0, maxLevels);
    
    // Calculate intensity for heatmap
    const maxBidSize = Math.max(...bids.map(level => level.size));
    const maxAskSize = Math.max(...asks.map(level => level.size));
    const maxSize = Math.max(maxBidSize, maxAskSize);
    
    const processedBids = bids.map(level => ({
      ...level,
      intensity: level.size / maxSize,
      isLarge: level.size > maxSize * 0.7,
    }));
    
    const processedAsks = asks.map(level => ({
      ...level,
      intensity: level.size / maxSize,
      isLarge: level.size > maxSize * 0.7,
    }));
    
    return { bids: processedBids, asks: processedAsks };
  }, [data, maxLevels]);

  // Render depth chart
  useEffect(() => {
    if (!showDepthChart || !depthChartRef.current) return;

    const svg = d3.select(depthChartRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const width = 400 - margin.left - margin.right;
    const height = 180 - margin.top - margin.bottom;

    const g = svg.append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Prepare data for depth chart
    const bidData = processedData.bids.map((level, i) => ({
      price: level.price,
      depth: processedData.bids.slice(i).reduce((sum, l) => sum + l.size, 0),
      side: 'bid' as const,
    }));

    const askData = processedData.asks.map((level, i) => ({
      price: level.price,
      depth: processedData.asks.slice(0, i + 1).reduce((sum, l) => sum + l.size, 0),
      side: 'ask' as const,
    }));

    const allData = [...bidData, ...askData];
    const priceExtent = d3.extent(allData, d => d.price) as [number, number];
    const depthExtent = d3.extent(allData, d => d.depth) as [number, number];

    const xScale = d3.scaleLinear()
      .domain(priceExtent)
      .range([0, width]);

    const yScale = d3.scaleLinear()
      .domain([0, depthExtent[1]])
      .range([height, 0]);

    // Create area generators
    const bidArea = d3.area<typeof bidData[0]>()
      .x(d => xScale(d.price))
      .y0(height)
      .y1(d => yScale(d.depth))
      .curve(d3.curveStepAfter);

    const askArea = d3.area<typeof askData[0]>()
      .x(d => xScale(d.price))
      .y0(height)
      .y1(d => yScale(d.depth))
      .curve(d3.curveStepBefore);

    // Draw bid area
    g.append('path')
      .datum(bidData)
      .attr('fill', 'rgba(0, 255, 136, 0.3)')
      .attr('stroke', '#00ff88')
      .attr('stroke-width', 1)
      .attr('d', bidArea);

    // Draw ask area
    g.append('path')
      .datum(askData)
      .attr('fill', 'rgba(255, 82, 82, 0.3)')
      .attr('stroke', '#ff5252')
      .attr('stroke-width', 1)
      .attr('d', askArea);

    // Add mid price line
    g.append('line')
      .attr('x1', xScale(data.midPrice))
      .attr('x2', xScale(data.midPrice))
      .attr('y1', 0)
      .attr('y2', height)
      .attr('stroke', '#ffa500')
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', '5,5');

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${height})`)
      .call(d3.axisBottom(xScale).tickFormat(d3.format(`.${precision}f`)))
      .selectAll('text')
      .style('fill', '#ccc')
      .style('font-size', '10px');

    g.append('g')
      .call(d3.axisLeft(yScale).tickFormat(d3.format('.2s')))
      .selectAll('text')
      .style('fill', '#ccc')
      .style('font-size', '10px');

  }, [data, processedData, showDepthChart, precision]);

  const handlePriceClick = (price: number, side: 'bid' | 'ask') => {
    setSelectedPrice(price);
    onPriceClick?.(price, side);
  };

  const formatNumber = (num: number, decimals: number = precision) => {
    return num.toFixed(decimals);
  };

  const formatSize = (size: number) => {
    if (size >= 1000000) return `${(size / 1000000).toFixed(1)}M`;
    if (size >= 1000) return `${(size / 1000).toFixed(1)}K`;
    return size.toFixed(3);
  };

  return (
    <Container>
      <Header>
        <Title>Level 2 - {symbol}</Title>
        <SpreadInfo>
          <div>
            Spread: <SpreadValue>{formatNumber(data.spread, 2)}</SpreadValue>
          </div>
          <div>
            Mid: <MidPrice>{formatNumber(data.midPrice, precision)}</MidPrice>
          </div>
        </SpreadInfo>
      </Header>

      <BookContainer>
        {/* Bids */}
        <BookSide side="bid">
          <BookHeader side="bid">
            <div>Price</div>
            <div>Size</div>
            <div>Total</div>
            <div>#</div>
          </BookHeader>
          <BookLevels>
            <AnimatePresence>
              {processedData.bids.map((level, index) => (
                <BookLevel
                  key={`bid-${level.price}`}
                  side="bid"
                  intensity={showHeatmap ? level.intensity : 0}
                  isLarge={level.isLarge}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.2, delay: index * 0.01 }}
                  onClick={() => handlePriceClick(level.price, 'bid')}
                  onMouseEnter={() => setHoverPrice(level.price)}
                  onMouseLeave={() => setHoverPrice(null)}
                >
                  <PriceCell side="bid">{formatNumber(level.price)}</PriceCell>
                  <SizeCell>{formatSize(level.size)}</SizeCell>
                  <TotalCell>{formatSize(level.total)}</TotalCell>
                  <OrdersCell>{level.orders}</OrdersCell>
                </BookLevel>
              ))}
            </AnimatePresence>
          </BookLevels>
        </BookSide>

        {/* Asks */}
        <BookSide side="ask">
          <BookHeader side="ask">
            <div>Price</div>
            <div>Size</div>
            <div>Total</div>
            <div>#</div>
          </BookHeader>
          <BookLevels>
            <AnimatePresence>
              {processedData.asks.map((level, index) => (
                <BookLevel
                  key={`ask-${level.price}`}
                  side="ask"
                  intensity={showHeatmap ? level.intensity : 0}
                  isLarge={level.isLarge}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.2, delay: index * 0.01 }}
                  onClick={() => handlePriceClick(level.price, 'ask')}
                  onMouseEnter={() => setHoverPrice(level.price)}
                  onMouseLeave={() => setHoverPrice(null)}
                >
                  <PriceCell side="ask">{formatNumber(level.price)}</PriceCell>
                  <SizeCell>{formatSize(level.size)}</SizeCell>
                  <TotalCell>{formatSize(level.total)}</TotalCell>
                  <OrdersCell>{level.orders}</OrdersCell>
                </BookLevel>
              ))}
            </AnimatePresence>
          </BookLevels>
        </BookSide>
      </BookContainer>

      {showDepthChart && (
        <DepthChart>
          <svg
            ref={depthChartRef}
            width="100%"
            height="100%"
            viewBox="0 0 400 180"
          />
        </DepthChart>
      )}
    </Container>
  );
};

export default Level2OrderBook;
