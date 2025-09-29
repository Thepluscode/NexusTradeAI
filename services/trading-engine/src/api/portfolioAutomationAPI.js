// Portfolio Automation API
// RESTful API for managing automated trading portfolios

const express = require('express');
const router = express.Router();
const PortfolioAutomationService = require('../automation/PortfolioAutomationService');

class PortfolioAutomationAPI {
  constructor(options = {}) {
    this.automationService = new PortfolioAutomationService(options);
    this.logger = options.logger;
  }

  /**
   * Get API routes
   */
  getRoutes() {
    // Get user's portfolios
    router.get('/portfolios', async (req, res) => {
      try {
        const userId = req.user?.id || req.query.userId; // In production, get from auth token
        
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: 'User authentication required'
          });
        }

        const portfolios = this.automationService.getUserPortfolios(userId);
        const sanitizedPortfolios = portfolios.map(p => 
          this.automationService.sanitizePortfolioForClient(p)
        );

        res.json({
          success: true,
          data: sanitizedPortfolios
        });

      } catch (error) {
        this.logger?.error('Error getting user portfolios:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Create new automated portfolio
    router.post('/portfolios', async (req, res) => {
      try {
        const userId = req.user?.id || req.body.userId; // In production, get from auth token
        
        if (!userId) {
          return res.status(401).json({
            success: false,
            error: 'User authentication required'
          });
        }

        const portfolioConfig = {
          ...req.body,
          userId
        };

        // Validate required fields
        const requiredFields = ['name', 'strategies', 'allocation', 'initialCapital', 'userSubscription'];
        for (const field of requiredFields) {
          if (!portfolioConfig[field]) {
            return res.status(400).json({
              success: false,
              error: `Missing required field: ${field}`
            });
          }
        }

        const result = await this.automationService.createAutomatedPortfolio(userId, portfolioConfig);
        
        if (result.success) {
          res.status(201).json(result);
        } else {
          res.status(400).json(result);
        }

      } catch (error) {
        this.logger?.error('Error creating portfolio:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get specific portfolio details
    router.get('/portfolios/:portfolioId', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const userId = req.user?.id || req.query.userId;

        const portfolio = this.automationService.getPortfolioPerformance(portfolioId);
        
        if (!portfolio) {
          return res.status(404).json({
            success: false,
            error: 'Portfolio not found'
          });
        }

        // Check ownership (in production, verify through auth)
        if (portfolio.userId && portfolio.userId !== userId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }

        res.json({
          success: true,
          data: portfolio
        });

      } catch (error) {
        this.logger?.error('Error getting portfolio details:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Start automated portfolio
    router.post('/portfolios/:portfolioId/start', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const userId = req.user?.id || req.body.userId;

        const result = await this.automationService.startPortfolio(portfolioId, userId);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }

      } catch (error) {
        this.logger?.error('Error starting portfolio:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Stop automated portfolio
    router.post('/portfolios/:portfolioId/stop', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const userId = req.user?.id || req.body.userId;

        const result = await this.automationService.stopPortfolio(portfolioId, userId);
        
        if (result.success) {
          res.json(result);
        } else {
          res.status(400).json(result);
        }

      } catch (error) {
        this.logger?.error('Error stopping portfolio:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Update portfolio settings
    router.put('/portfolios/:portfolioId', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const userId = req.user?.id || req.body.userId;
        const updates = req.body;

        // Get portfolio
        const portfolio = this.automationService.activePortfolios.get(portfolioId);
        
        if (!portfolio) {
          return res.status(404).json({
            success: false,
            error: 'Portfolio not found'
          });
        }

        if (portfolio.userId !== userId) {
          return res.status(403).json({
            success: false,
            error: 'Access denied'
          });
        }

        // Update allowed fields
        const allowedUpdates = ['name', 'description', 'riskSettings', 'autoRebalance', 'rebalanceFrequency'];
        for (const [key, value] of Object.entries(updates)) {
          if (allowedUpdates.includes(key)) {
            if (key === 'riskSettings') {
              portfolio.riskSettings = { ...portfolio.riskSettings, ...value };
            } else {
              portfolio[key] = value;
            }
          }
        }

        // Update rebalancing schedule if changed
        if (updates.autoRebalance !== undefined || updates.rebalanceFrequency) {
          if (portfolio.autoRebalance && updates.rebalanceFrequency) {
            this.automationService.scheduleRebalancing(portfolioId, updates.rebalanceFrequency);
          }
        }

        res.json({
          success: true,
          data: this.automationService.sanitizePortfolioForClient(portfolio)
        });

      } catch (error) {
        this.logger?.error('Error updating portfolio:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Delete portfolio
    router.delete('/portfolios/:portfolioId', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const userId = req.user?.id || req.query.userId;

        // Stop portfolio first
        await this.automationService.stopPortfolio(portfolioId, userId);
        
        // Remove from active portfolios
        this.automationService.activePortfolios.delete(portfolioId);
        this.automationService.portfolioPerformance.delete(portfolioId);

        res.json({
          success: true,
          message: 'Portfolio deleted successfully'
        });

      } catch (error) {
        this.logger?.error('Error deleting portfolio:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get portfolio templates
    router.get('/templates', async (req, res) => {
      try {
        const templates = [
          {
            id: 'conservative',
            name: 'Conservative Income',
            description: 'Focus on capital preservation with steady income',
            riskLevel: 'conservative',
            strategies: [
              { name: 'MeanReversionScalping', allocation: 50 },
              { name: 'StatisticalArbitrage', allocation: 30 },
              { name: 'MultiConfirmationMomentum', allocation: 20 }
            ],
            expectedReturn: 12.5,
            maxDrawdown: 5.0,
            rebalanceFrequency: 'daily',
            riskSettings: {
              maxDrawdown: 8,
              stopLoss: 3,
              takeProfit: 10,
              maxRiskPerTrade: 1.5
            }
          },
          {
            id: 'balanced',
            name: 'Balanced Growth',
            description: 'Balanced approach between growth and stability',
            riskLevel: 'moderate',
            strategies: [
              { name: 'AIPatternRecognition', allocation: 30 },
              { name: 'MultiConfirmationMomentum', allocation: 25 },
              { name: 'MeanReversionScalping', allocation: 25 },
              { name: 'StatisticalArbitrage', allocation: 20 }
            ],
            expectedReturn: 18.2,
            maxDrawdown: 8.5,
            rebalanceFrequency: 'daily',
            riskSettings: {
              maxDrawdown: 12,
              stopLoss: 4,
              takeProfit: 15,
              maxRiskPerTrade: 2.0
            }
          },
          {
            id: 'aggressive',
            name: 'Maximum Alpha',
            description: 'High-risk, high-reward strategy combination',
            riskLevel: 'aggressive',
            strategies: [
              { name: 'AIPatternRecognition', allocation: 35 },
              { name: 'InstitutionalOrderFlow', allocation: 30 },
              { name: 'MultiConfirmationMomentum', allocation: 25 },
              { name: 'MeanReversionScalping', allocation: 10 }
            ],
            expectedReturn: 28.7,
            maxDrawdown: 15.0,
            rebalanceFrequency: 'hourly',
            riskSettings: {
              maxDrawdown: 18,
              stopLoss: 6,
              takeProfit: 20,
              maxRiskPerTrade: 3.0
            }
          }
        ];

        res.json({
          success: true,
          data: templates
        });

      } catch (error) {
        this.logger?.error('Error getting portfolio templates:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get portfolio performance history
    router.get('/portfolios/:portfolioId/performance', async (req, res) => {
      try {
        const { portfolioId } = req.params;
        const { period = '30d' } = req.query;

        const performanceHistory = this.automationService.portfolioPerformance.get(portfolioId) || [];
        
        // Filter by period
        let filteredHistory = performanceHistory;
        if (period !== 'all') {
          const days = parseInt(period.replace('d', ''));
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - days);
          
          filteredHistory = performanceHistory.filter(p => 
            new Date(p.timestamp) >= cutoffDate
          );
        }

        res.json({
          success: true,
          data: {
            portfolioId,
            period,
            history: filteredHistory,
            summary: {
              totalDataPoints: filteredHistory.length,
              startValue: filteredHistory[0]?.value || 0,
              endValue: filteredHistory[filteredHistory.length - 1]?.value || 0,
              totalReturn: filteredHistory.length > 0 ? 
                ((filteredHistory[filteredHistory.length - 1].value - filteredHistory[0].value) / filteredHistory[0].value) * 100 : 0
            }
          }
        });

      } catch (error) {
        this.logger?.error('Error getting portfolio performance:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    // Get automation statistics
    router.get('/stats', async (req, res) => {
      try {
        const allPortfolios = Array.from(this.automationService.activePortfolios.values());
        const activePortfolios = allPortfolios.filter(p => p.isActive);
        
        const totalValue = allPortfolios.reduce((sum, p) => sum + p.currentValue, 0);
        const totalPnL = allPortfolios.reduce((sum, p) => sum + p.totalPnL, 0);
        const avgWinRate = allPortfolios.length > 0 ? 
          allPortfolios.reduce((sum, p) => sum + (p.performance.winRate || 0), 0) / allPortfolios.length : 0;

        const stats = {
          totalPortfolios: allPortfolios.length,
          activePortfolios: activePortfolios.length,
          totalValue,
          totalPnL,
          totalPnLPercent: totalValue > 0 ? (totalPnL / (totalValue - totalPnL)) * 100 : 0,
          avgWinRate: avgWinRate * 100,
          strategiesInUse: this.getUniqueStrategies(allPortfolios),
          topPerformingPortfolio: this.getTopPerformingPortfolio(allPortfolios)
        };

        res.json({
          success: true,
          data: stats
        });

      } catch (error) {
        this.logger?.error('Error getting automation stats:', error);
        res.status(500).json({
          success: false,
          error: error.message
        });
      }
    });

    return router;
  }

  // Helper methods
  getUniqueStrategies(portfolios) {
    const strategies = new Set();
    portfolios.forEach(p => {
      p.strategies.forEach(s => strategies.add(s));
    });
    return Array.from(strategies);
  }

  getTopPerformingPortfolio(portfolios) {
    if (portfolios.length === 0) return null;
    
    return portfolios.reduce((best, current) => {
      return current.totalPnLPercent > (best?.totalPnLPercent || -Infinity) ? current : best;
    }, null);
  }
}

module.exports = PortfolioAutomationAPI;
