import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'GET') {
    // Mock order flow analysis response
    const mockOrderFlow = {
      success: true,
      data: {
        symbol: 'AAPL',
        timestamp: new Date().toISOString(),
        orderFlow: {
          buyVolume: 1250000,
          sellVolume: 980000,
          netFlow: 270000,
          buyOrderCount: 1850,
          sellOrderCount: 1420,
          avgBuySize: 675.68,
          avgSellSize: 690.14
        },
        institutionalFlow: {
          darkPoolVolume: 450000,
          blockTrades: 125,
          sweepOrders: 45,
          institutionalBuyRatio: 0.68
        },
        marketMicrostructure: {
          bidAskSpread: 0.02,
          marketDepth: 2500000,
          priceImpact: 0.0015,
          volatility: 0.185
        },
        sentiment: {
          bullishRatio: 0.72,
          bearishRatio: 0.28,
          momentum: 'BULLISH',
          strength: 7.5
        },
        levels: {
          support: [154.25, 152.80, 150.50],
          resistance: [158.75, 161.20, 163.50],
          pivot: 156.50
        },
        predictions: {
          nextHour: {
            direction: 'UP',
            confidence: 0.78,
            targetPrice: 157.25
          },
          nextDay: {
            direction: 'UP',
            confidence: 0.65,
            targetPrice: 159.80
          }
        }
      }
    };

    res.status(200).json(mockOrderFlow);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
