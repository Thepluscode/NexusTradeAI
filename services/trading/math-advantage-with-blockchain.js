/**
 * Math Advantage with Blockchain Integration
 *
 * Combines mathematical edge validation with blockchain transparency and DeFi tokenization.
 * This integration provides:
 * 1. Pre-trade mathematical edge validation (EV, Kelly, Statistical)
 * 2. Immutable blockchain trade logging (tamper-proof audit trail)
 * 3. Smart contract risk validation (automated enforcement)
 * 4. Performance tokenization (DeFi-ready)
 * 5. Real-time edge monitoring with blockchain verification
 *
 * Based on research:
 * - AI-blockchain fusion can reduce fraud by 90%
 * - Tokenization market growing from $4.13B to $10.65B by 2029
 * - Immutable audit trails improve transparency and compliance
 */

const MathAdvantageIntegration = require('./math-advantage-integration');
const BlockchainTradeValidator = require('./blockchain-trade-validator');
const DeFiStrategyTokenization = require('./defi-strategy-tokenization');
const EventEmitter = require('events');

class MathAdvantageWithBlockchain extends EventEmitter {
    constructor(config = {}) {
        super();

        this.config = {
            // Math Advantage settings
            enableMathValidation: config.enableMathValidation !== false,
            minExpectedValue: config.minExpectedValue || 0.02,
            minWinRate: config.minWinRate || 0.45,
            minSharpe: config.minSharpe || 1.0,

            // Blockchain settings
            enableBlockchain: config.enableBlockchain !== false,
            enableSmartContracts: config.enableSmartContracts !== false,
            chainId: config.chainId || 'nexustrade-mainnet',

            // Tokenization settings
            enableTokenization: config.enableTokenization !== false,
            tokenName: config.tokenName || 'NexusTradePerformance',
            tokenSymbol: config.tokenSymbol || 'NTP',

            ...config
        };

        // Initialize Math Advantage System
        this.mathAdvantage = new MathAdvantageIntegration({
            minExpectedValue: this.config.minExpectedValue,
            minWinRate: this.config.minWinRate,
            minSharpe: this.config.minSharpe,
            enableEdgeCalculator: true,
            enableStatisticalValidation: true,
            enableRealTimeMonitoring: true
        });

        // Initialize Blockchain Validator
        this.blockchainValidator = new BlockchainTradeValidator({
            enableBlockchainLogging: this.config.enableBlockchain,
            enableSmartContractValidation: this.config.enableSmartContracts,
            chainId: this.config.chainId
        });

        // Initialize Tokenization System
        this.tokenization = new DeFiStrategyTokenization({
            tokenName: this.config.tokenName,
            tokenSymbol: this.config.tokenSymbol
        });

        // Smart contract registry
        this.smartContracts = new Map();

        // Statistics
        this.stats = {
            totalValidations: 0,
            mathApproved: 0,
            mathRejected: 0,
            blockchainApproved: 0,
            blockchainRejected: 0,
            tradesRecorded: 0,
            tokensGenerated: 0
        };

        console.log('\n🚀 Math Advantage with Blockchain Integration Initialized');
        console.log(`   Math Validation: ${this.config.enableMathValidation ? '✅' : '❌'}`);
        console.log(`   Blockchain Logging: ${this.config.enableBlockchain ? '✅' : '❌'}`);
        console.log(`   Smart Contracts: ${this.config.enableSmartContracts ? '✅' : '❌'}`);
        console.log(`   Tokenization: ${this.config.enableTokenization ? '✅' : '❌'}\n`);
    }

    /**
     * Start the integrated system
     */
    async start() {
        // Start Math Advantage monitoring
        this.mathAdvantage.start();

        // Deploy default smart contracts
        if (this.config.enableSmartContracts) {
            await this.deployDefaultSmartContracts();
        }

        console.log('✅ Math Advantage with Blockchain started\n');
    }

    /**
     * Deploy default smart contracts for risk management
     */
    async deployDefaultSmartContracts() {
        console.log('📜 Deploying Smart Contracts...\n');

        // Risk limit contract
        const riskLimitContract = this.blockchainValidator.deploySmartContract('RISK_LIMIT', {
            maxRiskPerTrade: this.config.maxRiskPerTrade || 0.02
        });
        this.smartContracts.set('riskLimit', riskLimitContract);

        // Position size contract
        const positionSizeContract = this.blockchainValidator.deploySmartContract('POSITION_SIZE', {
            maxPositionSize: this.config.maxPositionSize || 10000
        });
        this.smartContracts.set('positionSize', positionSizeContract);

        // Drawdown limit contract
        const drawdownContract = this.blockchainValidator.deploySmartContract('DRAWDOWN_LIMIT', {
            maxDrawdown: this.config.maxDrawdown || 0.15
        });
        this.smartContracts.set('drawdown', drawdownContract);

        // Win rate threshold contract
        const winRateContract = this.blockchainValidator.deploySmartContract('WIN_RATE_THRESHOLD', {
            minWinRate: this.config.minWinRate
        });
        this.smartContracts.set('winRate', winRateContract);

        console.log('✅ All smart contracts deployed\n');
    }

    /**
     * COMPREHENSIVE TRADE VALIDATION
     * Combines math edge validation with blockchain smart contract validation
     */
    async validateTradeSignal(signal) {
        this.stats.totalValidations++;

        const validation = {
            approved: false,
            mathApproved: false,
            blockchainApproved: false,
            smartContractApproved: false,
            reasons: [],
            edge: null,
            smartContractResults: [],
            recommendation: null
        };

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Mathematical Edge Validation
        // ═══════════════════════════════════════════════════════════════

        if (this.config.enableMathValidation) {
            const mathValidation = await this.mathAdvantage.validateTradeSignal(signal);

            validation.mathApproved = mathValidation.approved;
            validation.edge = mathValidation.edge;

            if (!mathValidation.approved) {
                this.stats.mathRejected++;
                validation.reasons.push(...mathValidation.reasons);

                console.log(`\n❌ MATH VALIDATION FAILED: ${signal.symbol}`);
                console.log(`   Reasons: ${mathValidation.reasons.join(', ')}`);

                return validation;
            }

            this.stats.mathApproved++;
            console.log(`\n✅ MATH VALIDATION PASSED: ${signal.symbol}`);
            console.log(`   Expected Value: ${mathValidation.edge.expectedValue}`);
            console.log(`   Win Probability: ${mathValidation.edge.probabilityOfProfit}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Blockchain Smart Contract Validation
        // ═══════════════════════════════════════════════════════════════

        if (this.config.enableSmartContracts) {
            console.log('\n🔍 Smart Contract Validation...');

            // Validate risk limit
            const riskContractId = this.smartContracts.get('riskLimit');
            if (riskContractId) {
                const riskResult = await this.blockchainValidator.executeSmartContract(
                    riskContractId,
                    signal
                );
                validation.smartContractResults.push(riskResult);

                console.log(`   Risk Limit: ${riskResult.approved ? '✅' : '❌'} ${riskResult.reason}`);

                if (!riskResult.approved) {
                    validation.reasons.push(`Smart Contract: ${riskResult.reason}`);
                    this.stats.blockchainRejected++;
                    return validation;
                }
            }

            // Validate position size
            const positionContractId = this.smartContracts.get('positionSize');
            if (positionContractId) {
                const positionResult = await this.blockchainValidator.executeSmartContract(
                    positionContractId,
                    { size: signal.size || 10000 }
                );
                validation.smartContractResults.push(positionResult);

                console.log(`   Position Size: ${positionResult.approved ? '✅' : '❌'} ${positionResult.reason}`);

                if (!positionResult.approved) {
                    validation.reasons.push(`Smart Contract: ${positionResult.reason}`);
                    this.stats.blockchainRejected++;
                    return validation;
                }
            }

            validation.smartContractApproved = true;
            validation.blockchainApproved = true;
            this.stats.blockchainApproved++;
        }

        // ═══════════════════════════════════════════════════════════════
        // FINAL APPROVAL
        // ═══════════════════════════════════════════════════════════════

        validation.approved = validation.mathApproved &&
                             (!this.config.enableSmartContracts || validation.smartContractApproved);

        if (validation.approved) {
            validation.recommendation = {
                positionSize: validation.edge?.recommendedPositionSize || '5%',
                confidence: 'HIGH',
                expectedValue: validation.edge?.expectedValue,
                riskRewardRatio: validation.edge?.riskRewardRatio
            };

            console.log('\n🎉 TRADE FULLY APPROVED (Math + Blockchain)');
            console.log(`   Recommended Position Size: ${validation.recommendation.positionSize}`);
        }

        return validation;
    }

    /**
     * RECORD TRADE WITH BLOCKCHAIN AND TOKENIZATION
     * Called after trade closes to record on blockchain and update tokens
     */
    async recordTrade(trade) {
        this.stats.tradesRecorded++;

        console.log(`\n📝 Recording trade: ${trade.symbol} (${trade.strategy})`);

        // ═══════════════════════════════════════════════════════════════
        // STEP 1: Math Advantage Recording
        // ═══════════════════════════════════════════════════════════════

        await this.mathAdvantage.recordTrade(trade);
        console.log('   ✅ Math metrics updated');

        // ═══════════════════════════════════════════════════════════════
        // STEP 2: Blockchain Recording (Immutable)
        // ═══════════════════════════════════════════════════════════════

        if (this.config.enableBlockchain) {
            const txHash = await this.blockchainValidator.recordTradeOnChain({
                ...trade,
                // Add math edge metrics to blockchain record
                expectedValue: trade.expectedValue,
                winProbability: trade.winProbability,
                kellySize: trade.kellySize
            });

            console.log(`   ⛓️  Recorded on blockchain: ${txHash ? txHash.substring(0, 16) + '...' : 'pending'}`);
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 3: Performance Tokenization
        // ═══════════════════════════════════════════════════════════════

        if (this.config.enableTokenization) {
            // Get current performance metrics for this strategy
            const performance = this.mathAdvantage.getPerformanceReport();
            const strategyMetrics = performance.strategyEdges?.[trade.strategy] ||
                                   performance.overallEdge;

            await this.tokenization.recordPerformance(trade.strategy, {
                totalReturn: (trade.profit / (trade.entry * (trade.size || 1))),
                totalProfit: trade.profit,
                winRate: strategyMetrics.winRate || 0.5,
                sharpeRatio: strategyMetrics.sharpeRatio || 1.0,
                trades: strategyMetrics.totalTrades || 1
            });

            this.stats.tokensGenerated++;
            console.log('   🪙 Performance tokens updated');
        }

        // ═══════════════════════════════════════════════════════════════
        // STEP 4: Validate Against Smart Contracts (Post-Trade)
        // ═══════════════════════════════════════════════════════════════

        if (this.config.enableSmartContracts) {
            // Check win rate threshold
            const winRateContractId = this.smartContracts.get('winRate');
            if (winRateContractId) {
                const performance = this.mathAdvantage.getPerformanceReport();
                const winRateCheck = await this.blockchainValidator.executeSmartContract(
                    winRateContractId,
                    { winRate: performance.overallEdge.winRate }
                );

                if (!winRateCheck.approved) {
                    console.log(`   ⚠️  WARNING: ${winRateCheck.reason}`);
                    this.emit('winRateWarning', winRateCheck);
                }
            }

            // Check drawdown limit
            const drawdownContractId = this.smartContracts.get('drawdown');
            if (drawdownContractId) {
                const performance = this.mathAdvantage.getPerformanceReport();
                const drawdownCheck = await this.blockchainValidator.executeSmartContract(
                    drawdownContractId,
                    { currentDrawdown: performance.overallEdge.maxDrawdown || 0 }
                );

                if (!drawdownCheck.approved) {
                    console.log(`   🚨 CRITICAL: ${drawdownCheck.reason}`);
                    this.emit('drawdownAlert', drawdownCheck);
                }
            }
        }

        this.emit('tradeRecorded', trade);
    }

    /**
     * Get comprehensive dashboard combining all systems
     */
    getComprehensiveDashboard() {
        const mathReport = this.mathAdvantage.getPerformanceReport();
        const blockchainStats = this.blockchainValidator.getBlockchainStats();
        const tokenAnalytics = this.tokenization.getTokenAnalytics();

        return {
            system: {
                totalValidations: this.stats.totalValidations,
                mathApprovalRate: this.stats.totalValidations > 0
                    ? ((this.stats.mathApproved / this.stats.totalValidations) * 100).toFixed(1) + '%'
                    : 'N/A',
                blockchainApprovalRate: this.stats.totalValidations > 0
                    ? ((this.stats.blockchainApproved / this.stats.totalValidations) * 100).toFixed(1) + '%'
                    : 'N/A',
                tradesRecorded: this.stats.tradesRecorded
            },
            mathEdge: mathReport.overallEdge,
            blockchain: blockchainStats,
            tokenization: tokenAnalytics,
            timestamp: Date.now()
        };
    }

    /**
     * Print comprehensive dashboard
     */
    printDashboard() {
        const dashboard = this.getComprehensiveDashboard();

        console.log('\n' + '='.repeat(70));
        console.log('📊 MATH ADVANTAGE + BLOCKCHAIN DASHBOARD');
        console.log('='.repeat(70));

        // System Stats
        console.log('\n🔧 SYSTEM STATISTICS:');
        console.log(`   Total Validations: ${dashboard.system.totalValidations}`);
        console.log(`   Math Approval Rate: ${dashboard.system.mathApprovalRate}`);
        console.log(`   Blockchain Approval Rate: ${dashboard.system.blockchainApprovalRate}`);
        console.log(`   Trades Recorded: ${dashboard.system.tradesRecorded}`);

        // Math Edge Performance
        console.log('\n📈 MATH EDGE PERFORMANCE:');
        console.log(`   Win Rate: ${(dashboard.mathEdge.winRate * 100).toFixed(1)}%`);
        console.log(`   Expectancy: $${dashboard.mathEdge.expectancy.toFixed(2)}`);
        console.log(`   Sharpe Ratio: ${dashboard.mathEdge.sharpeRatio.toFixed(2)}`);
        console.log(`   Profit Factor: ${dashboard.mathEdge.profitFactor.toFixed(2)}`);
        console.log(`   Total Profit: $${dashboard.mathEdge.totalProfit.toFixed(2)}`);

        // Blockchain Stats
        console.log('\n⛓️  BLOCKCHAIN:');
        console.log(`   Total Blocks: ${dashboard.blockchain.totalBlocks}`);
        console.log(`   Total Transactions: ${dashboard.blockchain.totalTransactions}`);
        console.log(`   Smart Contracts: ${dashboard.blockchain.smartContracts}`);
        console.log(`   Chain Verified: ${dashboard.blockchain.chainVerified ? '✅' : '❌'}`);
        console.log(`   Chain Integrity: ${dashboard.blockchain.chainIntegrity}`);

        // Tokenization
        if (dashboard.tokenization.token.totalSupply > 0) {
            console.log('\n🪙 PERFORMANCE TOKENS:');
            console.log(`   Token: ${dashboard.tokenization.token.name} (${dashboard.tokenization.token.symbol})`);
            console.log(`   Total Supply: ${dashboard.tokenization.token.totalSupply.toLocaleString()}`);
            console.log(`   Token Price: $${dashboard.tokenization.token.price.toFixed(4)}`);
            console.log(`   Total Value: $${dashboard.tokenization.performance.totalValue.toFixed(2)}`);
            console.log(`   Active Strategies: ${dashboard.tokenization.performance.strategies}`);
        }

        console.log('\n' + '='.repeat(70) + '\n');
    }

    /**
     * Verify blockchain integrity
     */
    async verifyBlockchain() {
        console.log('\n🔍 Verifying blockchain integrity...');
        const isValid = this.blockchainValidator.verifyChain();

        if (isValid) {
            console.log('✅ Blockchain verified - all trades immutable and valid\n');
        } else {
            console.log('❌ Blockchain verification FAILED - possible tampering detected\n');
        }

        return isValid;
    }

    /**
     * Export complete system state for audit
     */
    exportAuditReport() {
        return {
            system: 'NexusTradeAI Math Advantage + Blockchain',
            exportTime: new Date().toISOString(),
            statistics: this.stats,
            mathAdvantage: this.mathAdvantage.getPerformanceReport(),
            blockchain: this.blockchainValidator.exportBlockchain(),
            tokenization: this.tokenization.getTokenAnalytics(),
            smartContracts: Array.from(this.smartContracts.entries()).map(([name, id]) => ({
                name,
                contractId: id
            }))
        };
    }

    /**
     * Stop all systems
     */
    stop() {
        console.log('\n🛑 Stopping Math Advantage + Blockchain...');

        // Print final dashboard
        this.printDashboard();

        // Verify blockchain integrity
        this.verifyBlockchain();

        // Print token dashboard
        if (this.config.enableTokenization) {
            this.tokenization.printDashboard();
        }

        // Export final audit report
        const auditReport = this.exportAuditReport();
        console.log('\n📄 Final Audit Report Generated');
        console.log(`   Total Blocks: ${auditReport.blockchain.totalBlocks}`);
        console.log(`   Total Transactions: ${auditReport.blockchain.totalTransactions}`);
        console.log(`   Blockchain Verified: ${auditReport.blockchain.verified ? '✅' : '❌'}`);

        // Stop monitoring
        this.mathAdvantage.stop();

        console.log('\n✅ System stopped successfully\n');
    }
}

module.exports = MathAdvantageWithBlockchain;
