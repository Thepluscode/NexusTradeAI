import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;

  if (req.method === 'GET') {
    // Mock institutional orders response
    const mockOrders = {
      success: true,
      data: {
        userId,
        orders: [
          {
            id: 'ORD-001',
            symbol: 'AAPL',
            side: 'BUY',
            quantity: 10000,
            price: 155.80,
            type: 'LIMIT',
            status: 'FILLED',
            fillPrice: 155.75,
            fillQuantity: 10000,
            timestamp: new Date(Date.now() - 3600000).toISOString(),
            executionTime: 125,
            slippage: -0.05,
            commission: 15.50
          },
          {
            id: 'ORD-002',
            symbol: 'MSFT',
            side: 'BUY',
            quantity: 5000,
            price: 315.25,
            type: 'MARKET',
            status: 'FILLED',
            fillPrice: 315.30,
            fillQuantity: 5000,
            timestamp: new Date(Date.now() - 7200000).toISOString(),
            executionTime: 89,
            slippage: 0.05,
            commission: 12.25
          },
          {
            id: 'ORD-003',
            symbol: 'GOOGL',
            side: 'SELL',
            quantity: 1000,
            price: 2750.00,
            type: 'LIMIT',
            status: 'PARTIAL',
            fillPrice: 2750.50,
            fillQuantity: 650,
            timestamp: new Date(Date.now() - 1800000).toISOString(),
            executionTime: null,
            slippage: null,
            commission: 8.75
          },
          {
            id: 'ORD-004',
            symbol: 'TSLA',
            side: 'BUY',
            quantity: 2500,
            price: 210.75,
            type: 'STOP_LIMIT',
            status: 'PENDING',
            fillPrice: null,
            fillQuantity: 0,
            timestamp: new Date(Date.now() - 900000).toISOString(),
            executionTime: null,
            slippage: null,
            commission: 0
          }
        ],
        summary: {
          totalOrders: 4,
          filledOrders: 2,
          partialOrders: 1,
          pendingOrders: 1,
          totalVolume: 18500,
          totalValue: 4567250.00,
          avgExecutionTime: 107,
          totalCommissions: 36.50
        }
      }
    };

    res.status(200).json(mockOrders);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
