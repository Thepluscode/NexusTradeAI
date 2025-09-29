import { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const { userId } = req.query;

  if (req.method === 'GET') {
    // Mock execution metrics response
    const mockMetrics = {
      success: true,
      data: {
        userId,
        period: '24h',
        metrics: {
          totalOrders: 156,
          successRate: 98.7,
          avgExecutionTime: 125.5,
          medianExecutionTime: 89.2,
          avgSlippage: 0.025,
          totalVolume: 2500000,
          totalValue: 125750000.00,
          vwap: 50.30,
          twap: 50.28,
          implementation: {
            shortfall: 0.15,
            marketImpact: 0.08,
            timing: 0.05,
            opportunity: 0.02
          },
          fillRates: {
            immediate: 0.85,
            within1min: 0.95,
            within5min: 0.98,
            within15min: 0.99
          },
          venues: {
            'NYSE': { volume: 850000, percentage: 34.0, avgLatency: 0.8 },
            'NASDAQ': { volume: 750000, percentage: 30.0, avgLatency: 0.9 },
            'BATS': { volume: 450000, percentage: 18.0, avgLatency: 1.2 },
            'DARK_POOLS': { volume: 450000, percentage: 18.0, avgLatency: 2.5 }
          },
          timeDistribution: {
            '09:30-10:00': { orders: 25, volume: 450000, avgSlippage: 0.035 },
            '10:00-11:00': { orders: 35, volume: 650000, avgSlippage: 0.025 },
            '11:00-12:00': { orders: 28, volume: 520000, avgSlippage: 0.020 },
            '12:00-13:00': { orders: 22, volume: 380000, avgSlippage: 0.018 },
            '13:00-14:00': { orders: 24, volume: 420000, avgSlippage: 0.022 },
            '14:00-15:00': { orders: 18, volume: 320000, avgSlippage: 0.028 },
            '15:00-16:00': { orders: 4, volume: 80000, avgSlippage: 0.045 }
          },
          qualityScores: {
            execution: 9.2,
            timing: 8.8,
            cost: 9.5,
            overall: 9.1
          }
        },
        benchmarks: {
          industry: {
            avgExecutionTime: 185.2,
            avgSlippage: 0.045,
            successRate: 96.2
          },
          improvement: {
            executionTime: '+32.3%',
            slippage: '+44.4%',
            successRate: '+2.6%'
          }
        },
        timestamp: new Date().toISOString()
      }
    };

    res.status(200).json(mockMetrics);
  } else {
    res.setHeader('Allow', ['GET']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
