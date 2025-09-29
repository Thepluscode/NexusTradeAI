import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, TrendingUp, Shield, Star, Zap, CheckCircle } from 'lucide-react';

interface AIPortfolioTemplate {
  id: string;
  name: string;
  description: string;
  riskLevel: 'conservative' | 'moderate' | 'aggressive';
  aiStrategies: {
    name: string;
    allocation: number;
    winRate: number;
    aiType: string;
    institutionalGrade: boolean;
  }[];
  expectedReturn: number;
  maxDrawdown: number;
  minCapital: number;
  winRateGuarantee: number;
  featured: boolean;
}

interface AIPortfolioTemplatesProps {
  onTemplateSelect?: (template: AIPortfolioTemplate) => void;
}

const AIPortfolioTemplates: React.FC<AIPortfolioTemplatesProps> = ({ onTemplateSelect }) => {
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const templates: AIPortfolioTemplate[] = [
    {
      id: 'ai_conservative',
      name: 'AI Conservative Growth',
      description: 'Low-risk AI portfolio with steady returns and capital preservation',
      riskLevel: 'conservative',
      expectedReturn: 12.5,
      maxDrawdown: 8.2,
      minCapital: 5000,
      winRateGuarantee: 78.5,
      featured: false,
      aiStrategies: [
        {
          name: 'Mean Reversion AI',
          allocation: 40,
          winRate: 82.3,
          aiType: 'Machine Learning',
          institutionalGrade: true
        },
        {
          name: 'Dividend Growth AI',
          allocation: 35,
          winRate: 76.8,
          aiType: 'Neural Network',
          institutionalGrade: true
        },
        {
          name: 'Bond Arbitrage AI',
          allocation: 25,
          winRate: 89.1,
          aiType: 'Deep Learning',
          institutionalGrade: false
        }
      ]
    },
    {
      id: 'ai_aggressive',
      name: 'AI Aggressive Growth',
      description: 'High-performance AI portfolio targeting maximum returns',
      riskLevel: 'aggressive',
      expectedReturn: 28.7,
      maxDrawdown: 18.5,
      minCapital: 10000,
      winRateGuarantee: 85.2,
      featured: true,
      aiStrategies: [
        {
          name: 'Momentum AI Pro',
          allocation: 50,
          winRate: 87.4,
          aiType: 'Quantum ML',
          institutionalGrade: true
        },
        {
          name: 'Options AI Strategy',
          allocation: 30,
          winRate: 83.9,
          aiType: 'Deep Learning',
          institutionalGrade: true
        },
        {
          name: 'Crypto AI Alpha',
          allocation: 20,
          winRate: 79.6,
          aiType: 'Neural Network',
          institutionalGrade: false
        }
      ]
    },
    {
      id: 'ai_balanced',
      name: 'AI Balanced Portfolio',
      description: 'Balanced AI approach with moderate risk and consistent returns',
      riskLevel: 'moderate',
      expectedReturn: 18.3,
      maxDrawdown: 12.7,
      minCapital: 7500,
      winRateGuarantee: 81.9,
      featured: false,
      aiStrategies: [
        {
          name: 'Multi-Asset AI',
          allocation: 45,
          winRate: 84.2,
          aiType: 'Ensemble ML',
          institutionalGrade: true
        },
        {
          name: 'Sector Rotation AI',
          allocation: 35,
          winRate: 79.8,
          aiType: 'Machine Learning',
          institutionalGrade: true
        },
        {
          name: 'Risk Parity AI',
          allocation: 20,
          winRate: 86.5,
          aiType: 'Deep Learning',
          institutionalGrade: false
        }
      ]
    }
  ];

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'conservative': return 'text-green-500 bg-green-500/10';
      case 'moderate': return 'text-yellow-500 bg-yellow-500/10';
      case 'aggressive': return 'text-red-500 bg-red-500/10';
      default: return 'text-slate-500 bg-slate-500/10';
    }
  };

  const handleTemplateSelect = (template: AIPortfolioTemplate) => {
    setSelectedTemplate(template.id);
    if (onTemplateSelect) {
      onTemplateSelect(template);
    } else {
      alert(`Selected "${template.name}" template!
      
Expected Return: ${template.expectedReturn}%
Risk Level: ${template.riskLevel}
Min Capital: $${template.minCapital.toLocaleString()}
Win Rate Guarantee: ${template.winRateGuarantee}%

This template will be configured for your portfolio.`);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          AI Portfolio Templates
        </h1>
        <p className="text-xl text-gray-600 max-w-3xl mx-auto">
          Choose from our collection of AI-powered portfolio templates, each designed with 
          institutional-grade algorithms and proven performance records.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {templates.map((template, index) => (
          <motion.div
            key={template.id}
            className={`bg-white rounded-2xl p-8 shadow-lg border-2 cursor-pointer transition-all relative ${
              template.featured ? 'border-blue-500' : 'border-gray-200'
            } ${selectedTemplate === template.id ? 'ring-2 ring-blue-200' : ''}`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
            onClick={() => handleTemplateSelect(template)}
          >
            {template.featured && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                <Star className="w-4 h-4 inline mr-1" />
                Most Popular
              </div>
            )}

            <div className="mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-2xl font-bold text-gray-900">{template.name}</h3>
                <div className={`px-3 py-1 rounded-full text-sm font-medium ${getRiskColor(template.riskLevel)}`}>
                  {template.riskLevel.charAt(0).toUpperCase() + template.riskLevel.slice(1)}
                </div>
              </div>
              <p className="text-gray-600 mb-6">{template.description}</p>

              <div className="grid grid-cols-2 gap-4 mb-6">
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Expected Return</div>
                  <div className="text-2xl font-bold text-green-600">{template.expectedReturn}%</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Win Rate</div>
                  <div className="text-2xl font-bold text-blue-600">{template.winRateGuarantee}%</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Max Drawdown</div>
                  <div className="text-2xl font-bold text-red-500">{template.maxDrawdown}%</div>
                </div>
                <div className="text-center p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">Min Capital</div>
                  <div className="text-2xl font-bold text-gray-900">${template.minCapital.toLocaleString()}</div>
                </div>
              </div>

              <div className="mb-6">
                <h4 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <Bot className="w-5 h-5 mr-2 text-blue-500" />
                  AI Strategies
                </h4>
                <div className="space-y-3">
                  {template.aiStrategies.map((strategy, strategyIndex) => (
                    <div key={strategyIndex} className="bg-gray-50 rounded-lg p-4">
                      <div className="flex items-center justify-between mb-2">
                        <h5 className="font-semibold text-gray-900">{strategy.name}</h5>
                        <div className="flex items-center space-x-2">
                          {strategy.institutionalGrade && (
                            <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                              Institutional
                            </span>
                          )}
                          <span className="text-sm font-medium text-gray-600">{strategy.allocation}%</span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">{strategy.aiType}</span>
                        <div className="flex items-center text-green-600">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          <span>{strategy.winRate}% Win Rate</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <button
                className={`w-full py-4 rounded-lg font-semibold transition-all ${
                  template.featured
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                    : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
                }`}
              >
                <Zap className="w-5 h-5 inline mr-2" />
                Select Template
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="mt-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl p-12 text-center text-white">
        <h2 className="text-3xl font-bold mb-4">Need a Custom AI Strategy?</h2>
        <p className="text-xl opacity-90 mb-8 max-w-2xl mx-auto">
          Our AI experts can create a personalized portfolio template tailored to your specific needs and risk profile.
        </p>
        <button className="bg-white text-blue-600 px-8 py-4 rounded-lg font-semibold text-lg hover:bg-gray-100 transition-all">
          <Bot className="w-5 h-5 inline mr-2" />
          Request Custom Template
        </button>
      </div>
    </div>
  );
};

export default AIPortfolioTemplates;
