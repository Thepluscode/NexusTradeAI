//shared/types/typescript/ai.d.ts
export interface AIInsight {
    id: string;
    type: 'bullish' | 'bearish' | 'neutral';
    confidence: number;
    timeframe: string;
    description: string;
    symbol: string;
    reasoning: string[];
    timestamp: number;
    signals: AISignal[];
  }
  
  export interface AISignal {
    type: 'technical' | 'fundamental' | 'sentiment' | 'momentum';
    strength: number;
    description: string;
  }
  
  export interface RiskMetric {
    label: string;
    value: string;
    numericValue: number;
    status: 'low' | 'medium' | 'high';
    change: number;
    threshold: {
      low: number;
      medium: number;
      high: number;
    };
  }