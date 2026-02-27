/**
 * Advanced Risk Management System
 *
 * Features:
 * - Portfolio-level risk monitoring
 * - Value at Risk (VaR) and Conditional VaR (CVaR)
 * - Correlation-based position limits
 * - Dynamic exposure management
 * - Stress testing
 * - Margin monitoring
 * - Real-time risk alerts
 */

const EventEmitter = require('events');
const winston = require('winston');

class AdvancedRiskManager extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Risk limits
            maxPortfolioRisk: 0.15, // 15% of portfolio
            maxDailyLoss: -0.05, // 5% daily loss limit
            maxDrawdown: -0.20, // 20% max drawdown
            maxPositionRisk: 0.05, // 5% per position
            maxSectorExposure: 0.30, // 30% per sector
            maxCorrelation: 0.7, // 70% max correlation

            // VaR parameters
            varConfidenceLevel: 0.99, // 99% confidence
            varTimeHorizon: 1, // 1 day
            varMethod: 'historical', // historical, parametric, monte_carlo

            // Monitoring intervals
            riskCheckInterval: 60000, // 1 minute
            marginCheckInterval: 30000, // 30 seconds

            // Alert thresholds
            warningThreshold: 0.8, // 80% of limit triggers warning
            criticalThreshold: 0.95, // 95% of limit triggers critical alert

            ...config
        };

        this.setupLogger();
        this.initializeState();
        this.startMonitoring();
    }

    setupLogger() {
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            defaultMeta: { service: 'advanced-risk-manager' },
            transports: [
                new winston.transports.File({
                    filename: 'logs/risk-management.log',
                    maxsize: 10485760,
                    maxFiles: 5
                }),
                new winston.transports.Console({
                    format: winston.format.simple()
                })
            ]
        });
    }

    initializeState() {
        this.positions = new Map();
        this.priceHistory = new Map();
        this.correlationMatrix = new Map();

        this.riskMetrics = {
            portfolioValue: 0,
            totalExposure: 0,
            portfolioVaR: 0,
            portfolioCVaR: 0,
            portfolioBeta: 1.0,
            sharpeRatio: 0,
            dailyPnL: 0,
            maxDrawdown: 0,
            currentDrawdown: 0,
            highWaterMark: 0,
            marginUtilization: 0,
            leverage: 1.0,
            concentrationRisk: 0
        };

        this.sectorExposure = new Map();
        this.correlationRisk = new Map();
        this.alerts = [];
        this.riskLimitBreaches = [];
    }

    startMonitoring() {
        // Risk metrics monitoring
        this.riskMonitorInterval = setInterval(() => {
            this.calculateRiskMetrics();
            this.checkRiskLimits();
        }, this.config.riskCheckInterval);

        // Margin monitoring
        this.marginMonitorInterval = setInterval(() => {
            this.checkMarginRequirements();
        }, this.config.marginCheckInterval);

        this.logger.info('Risk monitoring started');
    }

    /**
     * Update positions for risk calculation
     */
    updatePositions(positions) {
        this.positions = new Map(positions);
        this.calculateRiskMetrics();
    }

    /**
     * Calculate comprehensive risk metrics
     */
    async calculateRiskMetrics() {
        try {
            // Calculate portfolio value and exposure
            this.calculatePortfolioMetrics();

            // Calculate VaR and CVaR
            await this.calculateVaR();

            // Calculate concentration risk
            this.calculateConcentrationRisk();

            // Calculate correlation risk
            this.calculateCorrelationRisk();

            // Calculate sector exposure
            this.calculateSectorExposure();

            // Update drawdown
            this.updateDrawdown();

            // Calculate portfolio Greeks (for options)
            // this.calculatePortfolioGreeks();

            this.emit('riskMetricsUpdated', this.riskMetrics);

        } catch (error) {
            this.logger.error('Error calculating risk metrics', { error });
        }
    }

    calculatePortfolioMetrics() {
        let totalValue = 0;
        let totalExposure = 0;
        let longExposure = 0;
        let shortExposure = 0;

        for (const [id, position] of this.positions) {
            const positionValue = position.executedPrice * position.executedQuantity;

            totalValue += positionValue;

            if (position.side === 'BUY') {
                longExposure += positionValue;
            } else {
                shortExposure += positionValue;
            }

            totalExposure += Math.abs(positionValue);
        }

        this.riskMetrics.portfolioValue = totalValue;
        this.riskMetrics.totalExposure = totalExposure;
        this.riskMetrics.longExposure = longExposure;
        this.riskMetrics.shortExposure = shortExposure;
        this.riskMetrics.netExposure = longExposure - shortExposure;
        this.riskMetrics.leverage = totalExposure / Math.max(totalValue, 1);
    }

    /**
     * Calculate Value at Risk (VaR)
     */
    async calculateVaR() {
        const method = this.config.varMethod;

        switch (method) {
            case 'historical':
                await this.calculateHistoricalVaR();
                break;
            case 'parametric':
                await this.calculateParametricVaR();
                break;
            case 'monte_carlo':
                await this.calculateMonteCarloVaR();
                break;
            default:
                await this.calculateHistoricalVaR();
        }
    }

    async calculateHistoricalVaR() {
        const returns = await this.getHistoricalPortfolioReturns(252); // 1 year

        if (returns.length < 100) {
            this.logger.warn('Insufficient data for VaR calculation');
            return;
        }

        // Sort returns
        returns.sort((a, b) => a - b);

        // Find percentile based on confidence level
        const percentileIndex = Math.floor((1 - this.config.varConfidenceLevel) * returns.length);
        const varReturn = returns[percentileIndex];

        this.riskMetrics.portfolioVaR = Math.abs(this.riskMetrics.portfolioValue * varReturn);

        // Calculate CVaR (Expected Shortfall)
        const tailReturns = returns.slice(0, percentileIndex);
        if (tailReturns.length > 0) {
            const avgTailReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
            this.riskMetrics.portfolioCVaR = Math.abs(this.riskMetrics.portfolioValue * avgTailReturn);
        }

        this.logger.debug('VaR calculated', {
            var: this.riskMetrics.portfolioVaR.toFixed(2),
            cvar: this.riskMetrics.portfolioCVaR.toFixed(2)
        });
    }

    async calculateParametricVaR() {
        // Calculate portfolio volatility
        const portfolioVol = await this.calculatePortfolioVolatility();

        // Get z-score for confidence level
        const zScore = this.getZScore(this.config.varConfidenceLevel);

        // VaR = Portfolio Value × Volatility × Z-score × √Time Horizon
        const timeAdjustment = Math.sqrt(this.config.varTimeHorizon);
        this.riskMetrics.portfolioVaR = this.riskMetrics.portfolioValue *
                                        portfolioVol *
                                        zScore *
                                        timeAdjustment;

        // CVaR approximation for normal distribution
        const cvarMultiplier = this.getCVaRMultiplier(this.config.varConfidenceLevel);
        this.riskMetrics.portfolioCVaR = this.riskMetrics.portfolioVaR * cvarMultiplier;
    }

    async calculateMonteCarloVaR(iterations = 10000) {
        const simulatedReturns = [];

        // Get volatilities and correlations
        const symbols = Array.from(this.positions.values()).map(p => p.symbol);
        const volatilities = await this.getVolatilities(symbols);
        const correlationMatrix = await this.getCorrelationMatrix(symbols);

        // Monte Carlo simulation
        for (let i = 0; i < iterations; i++) {
            const returns = this.generateCorrelatedReturns(volatilities, correlationMatrix);

            let portfolioReturn = 0;
            let totalValue = 0;

            Array.from(this.positions.values()).forEach((position, index) => {
                const positionValue = position.executedPrice * position.executedQuantity;
                totalValue += Math.abs(positionValue);

                const weight = positionValue / Math.max(totalValue, 1);
                portfolioReturn += weight * returns[index];
            });

            simulatedReturns.push(portfolioReturn);
        }

        // Calculate VaR and CVaR from simulated returns
        simulatedReturns.sort((a, b) => a - b);

        const percentileIndex = Math.floor((1 - this.config.varConfidenceLevel) * iterations);
        const varReturn = simulatedReturns[percentileIndex];

        this.riskMetrics.portfolioVaR = Math.abs(this.riskMetrics.portfolioValue * varReturn);

        const tailReturns = simulatedReturns.slice(0, percentileIndex);
        const avgTailReturn = tailReturns.reduce((sum, r) => sum + r, 0) / tailReturns.length;
        this.riskMetrics.portfolioCVaR = Math.abs(this.riskMetrics.portfolioValue * avgTailReturn);
    }

    /**
     * Concentration Risk Calculation
     */
    calculateConcentrationRisk() {
        if (this.positions.size === 0) {
            this.riskMetrics.concentrationRisk = 0;
            return;
        }

        const weights = [];
        const totalValue = this.riskMetrics.portfolioValue;

        for (const [id, position] of this.positions) {
            const positionValue = position.executedPrice * position.executedQuantity;
            const weight = Math.abs(positionValue) / Math.max(totalValue, 1);
            weights.push(weight);
        }

        // Calculate Herfindahl-Hirschman Index (HHI)
        const hhi = weights.reduce((sum, w) => sum + Math.pow(w, 2), 0);

        // Normalize to 0-1 scale
        const normalizedHHI = (hhi - 1/this.positions.size) / (1 - 1/this.positions.size);

        this.riskMetrics.concentrationRisk = normalizedHHI;

        if (normalizedHHI > 0.5) {
            this.createAlert('high_concentration', 'warning', {
                hhi: normalizedHHI.toFixed(3),
                message: 'Portfolio concentration is high'
            });
        }
    }

    /**
     * Correlation Risk Analysis
     */
    calculateCorrelationRisk() {
        this.correlationRisk.clear();

        const positions = Array.from(this.positions.values());

        for (let i = 0; i < positions.length; i++) {
            for (let j = i + 1; j < positions.length; j++) {
                const pos1 = positions[i];
                const pos2 = positions[j];

                const correlation = this.getCorrelation(pos1.symbol, pos2.symbol);

                if (Math.abs(correlation) > this.config.maxCorrelation) {
                    const key = `${pos1.symbol}-${pos2.symbol}`;
                    this.correlationRisk.set(key, {
                        position1: pos1.symbol,
                        position2: pos2.symbol,
                        correlation: correlation,
                        risk: 'high'
                    });

                    this.createAlert('high_correlation', 'warning', {
                        positions: [pos1.symbol, pos2.symbol],
                        correlation: correlation.toFixed(3)
                    });
                }
            }
        }
    }

    /**
     * Sector Exposure Analysis
     */
    calculateSectorExposure() {
        this.sectorExposure.clear();

        const totalValue = this.riskMetrics.portfolioValue;

        for (const [id, position] of this.positions) {
            const sector = this.getSector(position.symbol);
            const positionValue = Math.abs(position.executedPrice * position.executedQuantity);

            if (!this.sectorExposure.has(sector)) {
                this.sectorExposure.set(sector, 0);
            }

            this.sectorExposure.set(sector, this.sectorExposure.get(sector) + positionValue);
        }

        // Check sector limits
        for (const [sector, exposure] of this.sectorExposure) {
            const exposurePercent = exposure / Math.max(totalValue, 1);

            if (exposurePercent > this.config.maxSectorExposure) {
                this.createAlert('sector_limit_breach', 'critical', {
                    sector,
                    exposure: (exposurePercent * 100).toFixed(2) + '%',
                    limit: (this.config.maxSectorExposure * 100).toFixed(2) + '%'
                });
            }
        }
    }

    /**
     * Drawdown Tracking
     */
    updateDrawdown() {
        const currentEquity = this.riskMetrics.portfolioValue + this.riskMetrics.dailyPnL;

        if (currentEquity > this.riskMetrics.highWaterMark) {
            this.riskMetrics.highWaterMark = currentEquity;
        }

        this.riskMetrics.currentDrawdown =
            (currentEquity - this.riskMetrics.highWaterMark) /
            Math.max(this.riskMetrics.highWaterMark, 1);

        this.riskMetrics.maxDrawdown = Math.min(
            this.riskMetrics.maxDrawdown,
            this.riskMetrics.currentDrawdown
        );

        if (this.riskMetrics.currentDrawdown < this.config.maxDrawdown) {
            this.createAlert('max_drawdown_breach', 'critical', {
                currentDrawdown: (this.riskMetrics.currentDrawdown * 100).toFixed(2) + '%',
                maxDrawdown: (this.config.maxDrawdown * 100).toFixed(2) + '%'
            });
        }
    }

    /**
     * Risk Limit Checks
     */
    checkRiskLimits() {
        const checks = [
            this.checkDailyLossLimit(),
            this.checkPortfolioRiskLimit(),
            this.checkPositionSizeLimits(),
            this.checkVaRLimit(),
            this.checkLeverageLimit()
        ];

        const breaches = checks.filter(check => !check.passed);

        if (breaches.length > 0) {
            this.emit('riskLimitBreached', breaches);
        }

        return breaches.length === 0;
    }

    checkDailyLossLimit() {
        const dailyLossPercent = this.riskMetrics.dailyPnL /
                                Math.max(this.riskMetrics.portfolioValue, 1);

        const passed = dailyLossPercent >= this.config.maxDailyLoss;

        if (!passed) {
            this.createAlert('daily_loss_limit', 'critical', {
                currentLoss: (dailyLossPercent * 100).toFixed(2) + '%',
                limit: (this.config.maxDailyLoss * 100).toFixed(2) + '%'
            });
        }

        return {
            check: 'daily_loss_limit',
            passed,
            current: dailyLossPercent,
            limit: this.config.maxDailyLoss
        };
    }

    checkPortfolioRiskLimit() {
        const portfolioRisk = this.riskMetrics.portfolioVaR /
                            Math.max(this.riskMetrics.portfolioValue, 1);

        const passed = portfolioRisk <= this.config.maxPortfolioRisk;

        if (!passed) {
            this.createAlert('portfolio_risk_limit', 'critical', {
                currentRisk: (portfolioRisk * 100).toFixed(2) + '%',
                limit: (this.config.maxPortfolioRisk * 100).toFixed(2) + '%'
            });
        }

        return {
            check: 'portfolio_risk_limit',
            passed,
            current: portfolioRisk,
            limit: this.config.maxPortfolioRisk
        };
    }

    checkPositionSizeLimits() {
        const violations = [];

        for (const [id, position] of this.positions) {
            const positionValue = Math.abs(position.executedPrice * position.executedQuantity);
            const positionRisk = positionValue / Math.max(this.riskMetrics.portfolioValue, 1);

            if (positionRisk > this.config.maxPositionRisk) {
                violations.push({
                    positionId: id,
                    symbol: position.symbol,
                    currentRisk: positionRisk,
                    limit: this.config.maxPositionRisk
                });
            }
        }

        const passed = violations.length === 0;

        if (!passed) {
            this.createAlert('position_size_limit', 'warning', { violations });
        }

        return {
            check: 'position_size_limits',
            passed,
            violations
        };
    }

    checkVaRLimit() {
        const varLimit = this.riskMetrics.portfolioValue * this.config.maxPortfolioRisk;
        const passed = this.riskMetrics.portfolioVaR <= varLimit;

        if (!passed) {
            this.createAlert('var_limit', 'critical', {
                currentVaR: this.riskMetrics.portfolioVaR.toFixed(2),
                limit: varLimit.toFixed(2)
            });
        }

        return {
            check: 'var_limit',
            passed,
            current: this.riskMetrics.portfolioVaR,
            limit: varLimit
        };
    }

    checkLeverageLimit() {
        const leverageLimit = this.config.maxLeverage || 2.0;
        const passed = this.riskMetrics.leverage <= leverageLimit;

        if (!passed) {
            this.createAlert('leverage_limit', 'critical', {
                currentLeverage: this.riskMetrics.leverage.toFixed(2),
                limit: leverageLimit.toFixed(2)
            });
        }

        return {
            check: 'leverage_limit',
            passed,
            current: this.riskMetrics.leverage,
            limit: leverageLimit
        };
    }

    /**
     * Margin Requirements Check
     */
    async checkMarginRequirements() {
        // Simplified margin check - in production, query broker API
        const requiredMargin = this.calculateRequiredMargin();
        const availableMargin = await this.getAvailableMargin();

        const marginUtilization = requiredMargin / Math.max(availableMargin, 1);
        this.riskMetrics.marginUtilization = marginUtilization;

        if (marginUtilization > 0.9) {
            this.createAlert('margin_warning', 'critical', {
                utilization: (marginUtilization * 100).toFixed(2) + '%',
                required: requiredMargin.toFixed(2),
                available: availableMargin.toFixed(2)
            });
        }
    }

    calculateRequiredMargin() {
        // Simplified calculation
        let totalMargin = 0;

        for (const [id, position] of this.positions) {
            const positionValue = Math.abs(position.executedPrice * position.executedQuantity);
            // Assume 50% margin requirement for stocks, 5% for futures, etc.
            const marginRate = this.getMarginRate(position.symbol);
            totalMargin += positionValue * marginRate;
        }

        return totalMargin;
    }

    async getAvailableMargin() {
        // In production, query broker API
        return 100000; // Placeholder
    }

    getMarginRate(symbol) {
        // Simplified margin rates
        return 0.5; // 50% for stocks
    }

    /**
     * Stress Testing
     */
    async runStressTest(scenarios) {
        const results = [];

        for (const scenario of scenarios) {
            const result = await this.applyStressScenario(scenario);
            results.push(result);
        }

        this.emit('stressTestComplete', results);
        return results;
    }

    async applyStressScenario(scenario) {
        const { name, shocks } = scenario;
        let totalLoss = 0;

        for (const [id, position] of this.positions) {
            const shock = shocks[position.symbol] || shocks.default || 0;
            const currentValue = position.executedPrice * position.executedQuantity;
            const stressedValue = currentValue * (1 + shock);
            const loss = stressedValue - currentValue;

            totalLoss += loss;
        }

        return {
            scenario: name,
            totalLoss,
            portfolioImpact: totalLoss / Math.max(this.riskMetrics.portfolioValue, 1)
        };
    }

    /**
     * Pre-Trade Risk Check
     */
    async preTradeRiskCheck(newTrade) {
        const checks = {
            positionSizeCheck: this.checkNewPositionSize(newTrade),
            correlationCheck: this.checkNewPositionCorrelation(newTrade),
            sectorExposureCheck: this.checkNewPositionSector(newTrade),
            portfolioRiskCheck: this.checkNewPositionRisk(newTrade),
            marginCheck: this.checkNewPositionMargin(newTrade)
        };

        const passed = Object.values(checks).every(check => check.passed);

        return {
            approved: passed,
            checks
        };
    }

    checkNewPositionSize(newTrade) {
        const positionValue = Math.abs(newTrade.price * newTrade.quantity);
        const positionRisk = positionValue / Math.max(this.riskMetrics.portfolioValue, 1);

        return {
            passed: positionRisk <= this.config.maxPositionRisk,
            positionRisk,
            limit: this.config.maxPositionRisk
        };
    }

    checkNewPositionCorrelation(newTrade) {
        let maxCorrelation = 0;

        for (const [id, position] of this.positions) {
            const correlation = Math.abs(this.getCorrelation(newTrade.symbol, position.symbol));
            maxCorrelation = Math.max(maxCorrelation, correlation);
        }

        return {
            passed: maxCorrelation <= this.config.maxCorrelation,
            maxCorrelation,
            limit: this.config.maxCorrelation
        };
    }

    checkNewPositionSector(newTrade) {
        const sector = this.getSector(newTrade.symbol);
        const newPositionValue = Math.abs(newTrade.price * newTrade.quantity);
        const currentSectorExposure = this.sectorExposure.get(sector) || 0;
        const newSectorExposure = currentSectorExposure + newPositionValue;

        const exposurePercent = newSectorExposure / Math.max(this.riskMetrics.portfolioValue, 1);

        return {
            passed: exposurePercent <= this.config.maxSectorExposure,
            sector,
            newExposure: exposurePercent,
            limit: this.config.maxSectorExposure
        };
    }

    checkNewPositionRisk(newTrade) {
        // Estimate impact on portfolio VaR
        const newPositionValue = Math.abs(newTrade.price * newTrade.quantity);
        const newPositionVol = this.getVolatility(newTrade.symbol);

        // Simplified incremental VaR calculation
        const incrementalVaR = newPositionValue * newPositionVol * this.getZScore(0.99);
        const newTotalVaR = this.riskMetrics.portfolioVaR + incrementalVaR;

        const portfolioRisk = newTotalVaR / Math.max(this.riskMetrics.portfolioValue, 1);

        return {
            passed: portfolioRisk <= this.config.maxPortfolioRisk,
            incrementalVaR,
            newTotalVaR,
            portfolioRisk,
            limit: this.config.maxPortfolioRisk
        };
    }

    checkNewPositionMargin(newTrade) {
        const newPositionValue = Math.abs(newTrade.price * newTrade.quantity);
        const marginRate = this.getMarginRate(newTrade.symbol);
        const requiredMargin = newPositionValue * marginRate;

        const currentRequiredMargin = this.calculateRequiredMargin();
        const totalRequiredMargin = currentRequiredMargin + requiredMargin;

        // In production, get actual available margin
        const availableMargin = 100000;

        return {
            passed: totalRequiredMargin <= availableMargin * 0.9,
            requiredMargin,
            totalRequiredMargin,
            availableMargin
        };
    }

    /**
     * Alert Management
     */
    createAlert(type, severity, details) {
        const alert = {
            id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type,
            severity,
            details,
            timestamp: Date.now(),
            acknowledged: false
        };

        this.alerts.push(alert);

        // Keep only recent alerts (last 100)
        if (this.alerts.length > 100) {
            this.alerts = this.alerts.slice(-100);
        }

        this.logger.warn('Risk alert created', alert);
        this.emit('riskAlert', alert);

        return alert;
    }

    acknowledgeAlert(alertId) {
        const alert = this.alerts.find(a => a.id === alertId);
        if (alert) {
            alert.acknowledged = true;
            alert.acknowledgedAt = Date.now();
        }
    }

    /**
     * Utility Methods
     */
    async getHistoricalPortfolioReturns(days) {
        // Placeholder - in production, calculate from actual historical data
        const returns = [];
        for (let i = 0; i < days; i++) {
            returns.push((Math.random() - 0.5) * 0.04); // ±2% daily returns
        }
        return returns;
    }

    async calculatePortfolioVolatility() {
        // Simplified calculation
        const symbols = Array.from(this.positions.values()).map(p => p.symbol);
        const weights = Array.from(this.positions.values()).map(p => {
            const value = p.executedPrice * p.executedQuantity;
            return value / Math.max(this.riskMetrics.portfolioValue, 1);
        });

        // Get volatilities
        const volatilities = symbols.map(s => this.getVolatility(s));

        // Simplified portfolio volatility (ignoring correlations for now)
        let portfolioVariance = 0;
        for (let i = 0; i < symbols.length; i++) {
            portfolioVariance += Math.pow(weights[i] * volatilities[i], 2);
        }

        return Math.sqrt(portfolioVariance);
    }

    getVolatility(symbol) {
        const volatilities = {
            'AAPL': 0.25, 'GOOGL': 0.28, 'MSFT': 0.22,
            'TSLA': 0.45, 'NVDA': 0.35, 'AMZN': 0.28
        };
        return volatilities[symbol] || 0.25;
    }

    async getVolatilities(symbols) {
        return symbols.map(s => this.getVolatility(s));
    }

    getCorrelation(symbol1, symbol2) {
        if (symbol1 === symbol2) return 1.0;

        // Simplified correlations
        const pairs = {
            'AAPL-GOOGL': 0.7, 'AAPL-MSFT': 0.75,
            'GOOGL-MSFT': 0.8, 'TSLA-NVDA': 0.6
        };

        const key = [symbol1, symbol2].sort().join('-');
        return pairs[key] || 0.3;
    }

    async getCorrelationMatrix(symbols) {
        const n = symbols.length;
        const matrix = Array(n).fill().map(() => Array(n).fill(0.3));

        for (let i = 0; i < n; i++) {
            matrix[i][i] = 1.0;
            for (let j = i + 1; j < n; j++) {
                const corr = this.getCorrelation(symbols[i], symbols[j]);
                matrix[i][j] = corr;
                matrix[j][i] = corr;
            }
        }

        return matrix;
    }

    generateCorrelatedReturns(volatilities, correlationMatrix) {
        // Simplified - in production, use Cholesky decomposition
        return volatilities.map(v => (Math.random() - 0.5) * v * 2);
    }

    getSector(symbol) {
        const sectors = {
            'AAPL': 'Technology', 'GOOGL': 'Technology', 'MSFT': 'Technology',
            'TSLA': 'Automotive', 'NVDA': 'Technology', 'AMZN': 'Consumer'
        };
        return sectors[symbol] || 'Other';
    }

    getZScore(confidenceLevel) {
        const zScores = {
            0.90: 1.282, 0.95: 1.645, 0.99: 2.326, 0.999: 3.090
        };
        return zScores[confidenceLevel] || 1.645;
    }

    getCVaRMultiplier(confidenceLevel) {
        const multipliers = {
            0.90: 1.28, 0.95: 1.34, 0.99: 1.48, 0.999: 1.58
        };
        return multipliers[confidenceLevel] || 1.34;
    }

    /**
     * Get comprehensive risk report
     */
    getRiskReport() {
        return {
            riskMetrics: this.riskMetrics,
            sectorExposure: Object.fromEntries(this.sectorExposure),
            correlationRisk: Object.fromEntries(this.correlationRisk),
            recentAlerts: this.alerts.filter(a => !a.acknowledged).slice(-10),
            riskLimitStatus: this.checkRiskLimits(),
            timestamp: Date.now()
        };
    }

    stop() {
        if (this.riskMonitorInterval) {
            clearInterval(this.riskMonitorInterval);
        }
        if (this.marginMonitorInterval) {
            clearInterval(this.marginMonitorInterval);
        }
        this.logger.info('Risk monitoring stopped');
    }
}

module.exports = AdvancedRiskManager;
