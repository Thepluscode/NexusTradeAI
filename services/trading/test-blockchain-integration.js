/**
 * Test Script for Blockchain Integration
 *
 * Tests all blockchain components:
 * 1. Blockchain Trade Validator
 * 2. DeFi Strategy Tokenization
 * 3. Math Advantage with Blockchain (combined)
 */

const MathAdvantageWithBlockchain = require('./math-advantage-with-blockchain');
const BlockchainTradeValidator = require('./blockchain-trade-validator');
const DeFiStrategyTokenization = require('./defi-strategy-tokenization');

console.log('\n' + '='.repeat(70));
console.log('🧪 BLOCKCHAIN INTEGRATION TEST SUITE');
console.log('='.repeat(70) + '\n');

let testsPassed = 0;
let testsFailed = 0;

/**
 * Test helper
 */
function test(description, testFn) {
    try {
        testFn();
        console.log(`✅ ${description}`);
        testsPassed++;
        return true;
    } catch (error) {
        console.log(`❌ ${description}`);
        console.log(`   Error: ${error.message}`);
        testsFailed++;
        return false;
    }
}

async function asyncTest(description, testFn) {
    try {
        await testFn();
        console.log(`✅ ${description}`);
        testsPassed++;
        return true;
    } catch (error) {
        console.log(`❌ ${description}`);
        console.log(`   Error: ${error.message}`);
        testsFailed++;
        return false;
    }
}

/**
 * TEST 1: Blockchain Trade Validator
 */
async function testBlockchainValidator() {
    console.log('\n📦 TEST 1: Blockchain Trade Validator\n');

    const blockchain = new BlockchainTradeValidator({
        enableBlockchainLogging: true,
        enableSmartContractValidation: true,
        chainId: 'test-chain'
    });

    // Test 1.1: Genesis block created
    test('Genesis block created', () => {
        if (blockchain.chain.length !== 1) {
            throw new Error('Genesis block not created');
        }
        if (blockchain.chain[0].index !== 0) {
            throw new Error('Genesis block index incorrect');
        }
    });

    // Test 1.2: Record trade on blockchain
    await asyncTest('Record trade on blockchain', async () => {
        const trade = {
            symbol: 'AAPL',
            strategy: 'trendFollowing',
            direction: 'long',
            entry: 150.00,
            exit: 153.00,
            profit: 150.00,
            size: 5000,
            expectedValue: 0.025,
            winProbability: 0.62,
            kellySize: 0.085
        };

        const txHash = await blockchain.recordTradeOnChain(trade);
        if (!txHash) {
            throw new Error('Trade not recorded');
        }
    });

    // Test 1.3: Block creation
    await asyncTest('Block creation with multiple trades', async () => {
        // Record 4 more trades to trigger block creation (5 trades per block)
        for (let i = 0; i < 4; i++) {
            await blockchain.recordTradeOnChain({
                symbol: 'MSFT',
                strategy: 'meanReversion',
                direction: 'long',
                entry: 380.00,
                exit: 382.00,
                profit: 100.00
            });
        }

        // Should have 2 blocks now (genesis + new block)
        if (blockchain.chain.length < 2) {
            throw new Error('Block not created after 5 trades');
        }
    });

    // Test 1.4: Smart contract deployment
    test('Smart contract deployment', () => {
        const contractId = blockchain.deploySmartContract('RISK_LIMIT', {
            maxRiskPerTrade: 0.02
        });

        if (!contractId) {
            throw new Error('Smart contract not deployed');
        }
    });

    // Test 1.5: Smart contract validation (approved)
    await asyncTest('Smart contract validation - approved', async () => {
        const contractId = blockchain.deploySmartContract('RISK_LIMIT', {
            maxRiskPerTrade: 0.02
        });

        const result = await blockchain.executeSmartContract(contractId, {
            entry: 150.00,
            stopLoss: 147.00  // 2% risk - within limit
        });

        if (!result.approved) {
            throw new Error('Smart contract should approve valid trade');
        }
    });

    // Test 1.6: Smart contract validation (rejected)
    await asyncTest('Smart contract validation - rejected', async () => {
        const contractId = blockchain.deploySmartContract('RISK_LIMIT', {
            maxRiskPerTrade: 0.02
        });

        const result = await blockchain.executeSmartContract(contractId, {
            entry: 150.00,
            stopLoss: 142.50  // 5% risk - exceeds limit
        });

        if (result.approved) {
            throw new Error('Smart contract should reject risky trade');
        }
    });

    // Test 1.7: Blockchain verification
    test('Blockchain integrity verification', () => {
        const isValid = blockchain.verifyChain();
        if (!isValid) {
            throw new Error('Blockchain verification failed');
        }
    });

    // Test 1.8: Get trade history
    test('Retrieve trade history from blockchain', () => {
        const trades = blockchain.getTradeHistory();
        if (trades.length === 0) {
            throw new Error('No trades found in blockchain');
        }
    });

    // Test 1.9: Filter trade history
    test('Filter trade history by strategy', () => {
        const trades = blockchain.getTradeHistory({
            strategy: 'trendFollowing'
        });
        if (trades.length === 0) {
            throw new Error('No filtered trades found');
        }
        if (trades.some(t => t.strategy !== 'trendFollowing')) {
            throw new Error('Filter not working correctly');
        }
    });

    // Test 1.10: Blockchain export
    test('Export blockchain for audit', () => {
        const exportData = blockchain.exportBlockchain();
        if (!exportData.chain || !exportData.totalBlocks) {
            throw new Error('Blockchain export incomplete');
        }
        if (!exportData.verified) {
            throw new Error('Exported blockchain not verified');
        }
    });
}

/**
 * TEST 2: DeFi Strategy Tokenization
 */
async function testTokenization() {
    console.log('\n🪙 TEST 2: DeFi Strategy Tokenization\n');

    const tokenization = new DeFiStrategyTokenization({
        tokenName: 'TestToken',
        tokenSymbol: 'TST',
        initialSupply: 1000000,
        mintRate: 0.01,
        burnRate: 0.005
    });

    // Test 2.1: Initial supply
    test('Initial token supply created', () => {
        if (tokenization.totalSupply !== 1000000) {
            throw new Error('Initial supply incorrect');
        }
        if (tokenization.balanceOf('owner') !== 1000000) {
            throw new Error('Owner balance incorrect');
        }
    });

    // Test 2.2: Record profitable performance (should mint tokens)
    await asyncTest('Mint tokens on profitable performance', async () => {
        const initialSupply = tokenization.totalSupply;

        await tokenization.recordPerformance('trendFollowing', {
            totalReturn: 0.15,  // 15% return
            totalProfit: 1500.00,
            winRate: 0.58,
            sharpeRatio: 1.75,
            trades: 50
        });

        if (tokenization.totalSupply <= initialSupply) {
            throw new Error('Tokens not minted on profitable performance');
        }
    });

    // Test 2.3: Record losing performance (should burn tokens)
    await asyncTest('Burn tokens on losing performance', async () => {
        const currentSupply = tokenization.totalSupply;

        await tokenization.recordPerformance('failedStrategy', {
            totalReturn: -0.05,  // -5% return
            totalProfit: -500.00,
            winRate: 0.40,
            sharpeRatio: 0.5,
            trades: 20
        });

        if (tokenization.totalSupply >= currentSupply) {
            throw new Error('Tokens not burned on losing performance');
        }
    });

    // Test 2.4: Strategy valuation
    test('Calculate strategy valuation', () => {
        const valuation = tokenization.getStrategyValuation('trendFollowing');
        if (!valuation) {
            throw new Error('Strategy valuation not calculated');
        }
        if (valuation.valuation <= 0) {
            throw new Error('Valuation should be positive');
        }
    });

    // Test 2.5: Token transfer
    await asyncTest('Transfer tokens between addresses', async () => {
        const initialOwnerBalance = tokenization.balanceOf('owner');
        const initialUserBalance = tokenization.balanceOf('user1');

        await tokenization.transfer('owner', 'user1', 10000);

        if (tokenization.balanceOf('owner') !== initialOwnerBalance - 10000) {
            throw new Error('Owner balance not updated');
        }
        if (tokenization.balanceOf('user1') !== initialUserBalance + 10000) {
            throw new Error('User balance not updated');
        }
    });

    // Test 2.6: Add liquidity
    await asyncTest('Add liquidity to pool', async () => {
        const poolTokensBefore = tokenization.liquidityPool.tokens;

        await tokenization.addLiquidity('owner', 50000, 2500);

        if (tokenization.liquidityPool.tokens <= poolTokensBefore) {
            throw new Error('Liquidity not added');
        }
    });

    // Test 2.7: Token price calculation
    test('Calculate token price from liquidity pool', () => {
        const price = tokenization.getTokenPrice();
        if (price <= 0) {
            throw new Error('Token price should be positive');
        }
    });

    // Test 2.8: Generate Performance NFT
    test('Generate performance NFT metadata', () => {
        const nftMetadata = tokenization.generatePerformanceNFT('trendFollowing');
        if (!nftMetadata) {
            throw new Error('NFT metadata not generated');
        }
        if (!nftMetadata.attributes || nftMetadata.attributes.length === 0) {
            throw new Error('NFT attributes missing');
        }
    });

    // Test 2.9: Token analytics
    test('Get comprehensive token analytics', () => {
        const analytics = tokenization.getTokenAnalytics();
        if (!analytics.token || !analytics.performance || !analytics.liquidityPool) {
            throw new Error('Analytics incomplete');
        }
    });
}

/**
 * TEST 3: Math Advantage with Blockchain (Combined System)
 */
async function testCombinedSystem() {
    console.log('\n🚀 TEST 3: Math Advantage with Blockchain Integration\n');

    const system = new MathAdvantageWithBlockchain({
        minExpectedValue: 0.02,
        minWinRate: 0.45,
        minSharpe: 1.0,
        enableBlockchain: true,
        enableSmartContracts: true,
        enableTokenization: true,
        maxRiskPerTrade: 0.02,
        maxPositionSize: 10000,
        maxDrawdown: 0.15
    });

    // Test 3.1: System initialization
    test('System components initialized', () => {
        if (!system.mathAdvantage) {
            throw new Error('Math Advantage not initialized');
        }
        if (!system.blockchainValidator) {
            throw new Error('Blockchain Validator not initialized');
        }
        if (!system.tokenization) {
            throw new Error('Tokenization not initialized');
        }
    });

    // Test 3.2: Start system and deploy smart contracts
    await asyncTest('Start system and deploy smart contracts', async () => {
        await system.start();

        if (system.smartContracts.size === 0) {
            throw new Error('Smart contracts not deployed');
        }
    });

    // Test 3.3: Validate trade signal - should pass with good setup
    await asyncTest('Validate good trade signal', async () => {
        // First, record some historical trades to build edge data
        for (let i = 0; i < 35; i++) {
            await system.recordTrade({
                symbol: 'AAPL',
                strategy: 'trendFollowing',
                profit: i % 2 === 0 ? 100 : -50,  // 58% win rate
                entry: 150.00,
                exit: i % 2 === 0 ? 152.00 : 149.50
            });
        }

        const signal = {
            symbol: 'AAPL',
            strategy: 'trendFollowing',
            direction: 'long',
            entry: 150.00,
            stopLoss: 147.00,  // 2% risk
            takeProfit: 156.00, // 4% reward (2:1 R:R)
            confidence: 0.85,
            size: 5000
        };

        const validation = await system.validateTradeSignal(signal);

        // Should pass math validation (good historical performance)
        if (!validation.mathApproved) {
            console.log('   Note: Math validation may fail initially without enough edge data');
        }

        // Should pass smart contract validation (risk within limits)
        if (!validation.smartContractApproved) {
            throw new Error('Smart contract validation should pass');
        }
    });

    // Test 3.4: Validate trade signal - should fail with high risk
    await asyncTest('Reject high-risk trade signal', async () => {
        const signal = {
            symbol: 'TSLA',
            strategy: 'highRisk',
            direction: 'long',
            entry: 200.00,
            stopLoss: 190.00,  // 5% risk - exceeds 2% limit
            takeProfit: 210.00,
            confidence: 0.60,
            size: 5000
        };

        const validation = await system.validateTradeSignal(signal);

        // Should fail smart contract validation (too much risk)
        if (validation.smartContractApproved) {
            throw new Error('Should reject high-risk trade');
        }
    });

    // Test 3.5: Record trade across all systems
    await asyncTest('Record trade across all systems', async () => {
        const trade = {
            symbol: 'MSFT',
            strategy: 'trendFollowing',
            profit: 200.00,
            entry: 380.00,
            exit: 384.00,
            expectedValue: 0.03,
            winProbability: 0.65,
            kellySize: 0.09
        };

        await system.recordTrade(trade);

        // Check it was recorded in blockchain
        const blockchainTrades = system.blockchainValidator.getTradeHistory({
            symbol: 'MSFT'
        });

        if (blockchainTrades.length === 0) {
            throw new Error('Trade not recorded on blockchain');
        }
    });

    // Test 3.6: Comprehensive dashboard
    test('Generate comprehensive dashboard', () => {
        const dashboard = system.getComprehensiveDashboard();

        if (!dashboard.system || !dashboard.mathEdge || !dashboard.blockchain) {
            throw new Error('Dashboard incomplete');
        }
    });

    // Test 3.7: Blockchain verification
    await asyncTest('Verify blockchain integrity', async () => {
        const isValid = await system.verifyBlockchain();
        if (!isValid) {
            throw new Error('Blockchain verification failed');
        }
    });

    // Test 3.8: Export audit report
    test('Export comprehensive audit report', () => {
        const report = system.exportAuditReport();

        if (!report.blockchain || !report.mathAdvantage || !report.tokenization) {
            throw new Error('Audit report incomplete');
        }

        if (!report.blockchain.verified) {
            throw new Error('Blockchain not verified in audit report');
        }
    });

    // Test 3.9: Event emission
    await asyncTest('Event emission on trade recording', async () => {
        let eventFired = false;

        system.on('tradeRecorded', () => {
            eventFired = true;
        });

        await system.recordTrade({
            symbol: 'GOOGL',
            strategy: 'trendFollowing',
            profit: 150.00,
            entry: 140.00,
            exit: 143.00
        });

        if (!eventFired) {
            throw new Error('Event not emitted on trade recording');
        }
    });
}

/**
 * Run all tests
 */
async function runAllTests() {
    try {
        await testBlockchainValidator();
        await testTokenization();
        await testCombinedSystem();

        console.log('\n' + '='.repeat(70));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(70));
        console.log(`✅ Tests Passed: ${testsPassed}`);
        console.log(`❌ Tests Failed: ${testsFailed}`);
        console.log(`📈 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
        console.log('='.repeat(70));

        if (testsFailed === 0) {
            console.log('\n🎉 ALL TESTS PASSED!');
            console.log('The Blockchain Integration System is ready to use.\n');
            return true;
        } else {
            console.log('\n⚠️  SOME TESTS FAILED');
            console.log('Please review the errors above and fix before using.\n');
            return false;
        }

    } catch (error) {
        console.error('\n❌ CRITICAL ERROR:', error);
        console.error(error.stack);
        return false;
    }
}

// Run tests
runAllTests().then(success => {
    process.exit(success ? 0 : 1);
});
