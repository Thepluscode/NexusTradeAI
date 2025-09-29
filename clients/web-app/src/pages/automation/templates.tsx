// Automation Portfolio Templates - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  Layers,
  TrendingUp,
  Shield,
  DollarSign,
  Bot,
  Zap,
  Copy,
  CheckCircle,
  Filter,
  Search,
  ArrowRight
} from 'lucide-react';

const AutomationTemplatesPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRisk, setSelectedRisk] = useState('all');

  const handleCloneTemplate = (template: any) => {
    // Show success message
    alert(`Template "${template.name}" cloned successfully!

You can now customize this template in your personal collection.
The cloned template will appear in your portfolio manager.`);
  };

  const portfolioTemplates = [
    {
      id: 'conservative_income',
      name: 'Conservative Income',
      description: 'Low-risk portfolio focused on dividend income and capital preservation',
      category: 'income',
      riskLevel: 'low',
      expectedReturn: '5-8%',
      allocation: { stocks: 30, bonds: 60, alternatives: 10 },
      popularity: 4.2,
      users: 1245,
      featured: false
    },
    {
      id: 'growth_momentum',
      name: 'Growth Momentum',
      description: 'AI-powered momentum strategy targeting high-growth stocks',
      category: 'growth',
      riskLevel: 'high',
      expectedReturn: '15-25%',
      allocation: { stocks: 80, bonds: 5, alternatives: 15 },
      popularity: 4.7,
      users: 2876,
      featured: true
    },
    {
      id: 'balanced_60_40',
      name: 'Balanced 60/40',
      description: 'Classic balanced portfolio with 60% stocks and 40% bonds',
      category: 'balanced',
      riskLevel: 'medium',
      expectedReturn: '8-12%',
      allocation: { stocks: 60, bonds: 40, alternatives: 0 },
      popularity: 4.5,
      users: 3542,
      featured: false
    },
    {
      id: 'tech_focus',
      name: 'Tech Sector Focus',
      description: 'Concentrated portfolio of technology companies with growth potential',
      category: 'sector',
      riskLevel: 'high',
      expectedReturn: '18-30%',
      allocation: { stocks: 90, bonds: 0, alternatives: 10 },
      popularity: 4.8,
      users: 1987,
      featured: true
    },
    {
      id: 'dividend_aristocrats',
      name: 'Dividend Aristocrats',
      description: 'Blue-chip companies with consistent dividend growth',
      category: 'income',
      riskLevel: 'medium',
      expectedReturn: '7-10%',
      allocation: { stocks: 75, bonds: 20, alternatives: 5 },
      popularity: 4.3,
      users: 2156,
      featured: false
    },
    {
      id: 'crypto_balanced',
      name: 'Crypto-Balanced',
      description: 'Balanced portfolio with cryptocurrency exposure',
      category: 'alternative',
      riskLevel: 'high',
      expectedReturn: '15-35%',
      allocation: { stocks: 40, bonds: 20, alternatives: 40 },
      popularity: 4.6,
      users: 1654,
      featured: false
    }
  ];

  const categories = [
    { id: 'all', label: 'All Categories' },
    { id: 'growth', label: 'Growth' },
    { id: 'income', label: 'Income' },
    { id: 'balanced', label: 'Balanced' },
    { id: 'sector', label: 'Sector-Specific' },
    { id: 'alternative', label: 'Alternative' }
  ];

  const riskLevels = [
    { id: 'all', label: 'All Risk Levels' },
    { id: 'low', label: 'Low Risk' },
    { id: 'medium', label: 'Medium Risk' },
    { id: 'high', label: 'High Risk' }
  ];

  const filteredTemplates = portfolioTemplates
    .filter(template => 
      (selectedCategory === 'all' || template.category === selectedCategory) &&
      (selectedRisk === 'all' || template.riskLevel === selectedRisk) &&
      (searchQuery === '' || 
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        template.description.toLowerCase().includes(searchQuery.toLowerCase()))
    );

  const getRiskColor = (risk: string) => {
    switch (risk) {
      case 'low': return 'text-green-500 bg-green-500/10';
      case 'medium': return 'text-yellow-500 bg-yellow-500/10';
      case 'high': return 'text-red-500 bg-red-500/10';
      default: return 'text-slate-500 bg-slate-500/10';
    }
  };

  return (
    <>
      <Head>
        <title>Portfolio Templates - NexusTradeAI</title>
        <meta name="description" content="Browse and select from our library of automated portfolio templates" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
        <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <Link href="/dashboard" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back to Dashboard</span>
                </Link>
                <div className="w-px h-6 bg-slate-700"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <Layers className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Portfolio Templates</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-12">
          <div className="mb-12">
            <h1 className="text-3xl font-bold text-white mb-4">Portfolio Templates</h1>
            <p className="text-slate-400 text-lg max-w-3xl">
              Choose from our library of pre-built portfolio templates to jumpstart your automated trading.
              Each template is designed by professional traders and optimized by our AI.
            </p>
          </div>

          {/* Search and Filters */}
          <div className="mb-8 bg-slate-800/50 rounded-xl p-6 border border-slate-700/50">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search templates..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg py-3 pl-10 pr-4 text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-full md:w-48">
                  <select
                    value={selectedCategory}
                    onChange={(e) => setSelectedCategory(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>{category.label}</option>
                    ))}
                  </select>
                </div>
                <div className="w-full md:w-48">
                  <select
                    value={selectedRisk}
                    onChange={(e) => setSelectedRisk(e.target.value)}
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-transparent"
                  >
                    {riskLevels.map(risk => (
                      <option key={risk.id} value={risk.id}>{risk.label}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* Featured Templates */}
          <div className="mb-12">
            <h2 className="text-2xl font-bold text-white mb-6 flex items-center">
              <Zap className="w-6 h-6 text-yellow-400 mr-2" />
              Featured Templates
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {filteredTemplates.filter(t => t.featured).map((template, index) => (
                <motion.div
                  key={template.id}
                  className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50 relative overflow-hidden"
                  whileHover={{ scale: 1.02 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-cyan-500 to-blue-500 text-white px-4 py-1 rounded-bl-lg text-sm font-medium">
                    Featured
                  </div>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-xl font-bold text-white">{template.name}</h3>
                    <div className={`px-3 py-1 rounded-full text-xs font-medium ${getRiskColor(template.riskLevel)}`}>
                      {template.riskLevel.charAt(0).toUpperCase() + template.riskLevel.slice(1)} Risk
                    </div>
                  </div>
                  <p className="text-slate-400 mb-4">{template.description}</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Expected Return</div>
                      <div className="text-lg font-semibold text-green-500">{template.expectedReturn}</div>
                    </div>
                    <div>
                      <div className="text-sm text-slate-500 mb-1">Popularity</div>
                      <div className="flex items-center">
                        <div className="text-lg font-semibold text-white mr-1">{template.popularity}</div>
                        <div className="flex">
                          {[...Array(5)].map((_, i) => (
                            <svg key={i} className={`w-4 h-4 ${i < Math.floor(template.popularity) ? 'text-yellow-400' : 'text-slate-600'}`} fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="mb-6">
                    <div className="text-sm text-slate-500 mb-2">Asset Allocation</div>
                    <div className="flex space-x-1 h-3 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500" 
                        style={{ width: `${template.allocation.stocks}%` }}
                      ></div>
                      <div 
                        className="bg-green-500" 
                        style={{ width: `${template.allocation.bonds}%` }}
                      ></div>
                      <div 
                        className="bg-purple-500" 
                        style={{ width: `${template.allocation.alternatives}%` }}
                      ></div>
                    </div>
                    <div className="flex justify-between text-xs text-slate-500 mt-1">
                      <span>Stocks {template.allocation.stocks}%</span>
                      <span>Bonds {template.allocation.bonds}%</span>
                      <span>Alt {template.allocation.alternatives}%</span>
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <button
                      onClick={() => handleCloneTemplate(template)}
                      className="flex items-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      <Copy className="w-4 h-4" />
                      <span>Clone</span>
                    </button>
                    <Link href={`/automation/wizard?template=${template.id}`} className="flex items-center space-x-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700 text-white px-4 py-2 rounded-lg transition-colors">
                      <span>Use Template</span>
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                  </div>
                </motion.div>
              ))}
            </div>
          </div>

          {/* All Templates */}
          <div>
            <h2 className="text-2xl font-bold text-white mb-6">All Templates</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {filteredTemplates.filter(t => !t.featured).map((template, index) => (
                <motion.div
                  key={template.id}
                  className="bg-slate-800/50 rounded-xl p-6 border border-slate-700/50"
                  whileHover={{ scale: 1.02 }}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-bold text-white">{template.name}</h3>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${getRiskColor(template.riskLevel)}`}>
                      {template.riskLevel.charAt(0).toUpperCase() + template.riskLevel.slice(1)}
                    </div>
                  </div>
                  <p className="text-slate-400 text-sm mb-4">{template.description}</p>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Expected Return</div>
                      <div className="text-base font-semibold text-green-500">{template.expectedReturn}</div>
                    </div>
                    <div>
                      <div className="text-xs text-slate-500 mb-1">Users</div>
                      <div className="text-base font-semibold text-white">{template.users.toLocaleString()}</div>
                    </div>
                  </div>
                  <div className="mb-4">
                    <div className="text-xs text-slate-500 mb-1">Asset Allocation</div>
                    <div className="flex space-x-1 h-2 bg-slate-700 rounded-full overflow-hidden">
                      <div 
                        className="bg-blue-500" 
                        style={{ width: `${template.allocation.stocks}%` }}
                      ></div>
                      <div 
                        className="bg-green-500" 
                        style={{ width: `${template.allocation.bonds}%` }}
                      ></div>
                      <div 
                        className="bg-purple-500" 
                        style={{ width: `${template.allocation.alternatives}%` }}
                      ></div>
                    </div>
                  </div>
                  <Link href={`/automation/wizard?template=${template.id}`} className="flex items-center justify-center space-x-2 bg-slate-700 hover:bg-slate-600 text-white px-4 py-2 rounded-lg transition-colors w-full">
                    <span>Use Template</span>
                    <ArrowRight className="w-4 h-4" />
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default AutomationTemplatesPage;
