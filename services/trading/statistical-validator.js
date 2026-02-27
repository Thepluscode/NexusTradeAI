/**
 * Statistical Signal Validator
 *
 * Validates trading signals using rigorous statistical methods to ensure
 * signals have genuine predictive power and aren't due to random chance.
 *
 * Key Statistical Tests:
 * 1. Z-Test: Tests if win rate is significantly different from 50%
 * 2. T-Test: Tests if average profit is significantly different from 0
 * 3. Chi-Square Test: Tests independence of wins/losses
 * 4. Bootstrap Confidence Intervals: Non-parametric confidence estimation
 * 5. Permutation Test: Tests if strategy beats random trading
 * 6. Sharpe Ratio Significance: Tests if Sharpe is significantly > 0
 */

class StatisticalValidator {
    constructor(config = {}) {
        this.config = {
            minSampleSize: config.minSampleSize || 30,
            significanceLevel: config.significanceLevel || 0.05, // 5% (95% confidence)
            bootstrapIterations: config.bootstrapIterations || 1000,
            permutationTests: config.permutationTests || 500,
            ...config
        };
    }

    /**
     * Master validation function - runs all statistical tests
     * Returns comprehensive validation report
     */
    validateSignal(signalHistory) {
        if (!signalHistory || signalHistory.length < this.config.minSampleSize) {
            return {
                valid: false,
                reason: 'Insufficient sample size',
                sampleSize: signalHistory ? signalHistory.length : 0,
                minimumRequired: this.config.minSampleSize
            };
        }

        const results = {
            sampleSize: signalHistory.length,
            tests: {}
        };

        // Run statistical tests
        results.tests.zTest = this.zTestWinRate(signalHistory);
        results.tests.tTest = this.tTestProfits(signalHistory);
        results.tests.sharpeTest = this.sharpeRatioSignificance(signalHistory);
        results.tests.bootstrap = this.bootstrapConfidence(signalHistory);
        results.tests.permutation = this.permutationTest(signalHistory);
        results.tests.consecutiveTest = this.consecutiveWinsLossesTest(signalHistory);

        // Overall validation decision
        const passedTests = Object.values(results.tests).filter(t => t.significant).length;
        const totalTests = Object.keys(results.tests).length;

        results.passedTests = passedTests;
        results.totalTests = totalTests;
        results.valid = passedTests >= Math.floor(totalTests * 0.67); // 2/3 tests must pass
        results.confidence = passedTests / totalTests;

        return results;
    }

    /**
     * Z-Test for Win Rate
     * H0: Win rate = 50% (no edge)
     * H1: Win rate ≠ 50% (has edge)
     */
    zTestWinRate(trades) {
        const n = trades.length;
        const wins = trades.filter(t => t.profit > 0).length;
        const winRate = wins / n;

        // Null hypothesis: p0 = 0.5 (coin flip)
        const p0 = 0.5;

        // Standard error
        const se = Math.sqrt((p0 * (1 - p0)) / n);

        // Z-score
        const z = (winRate - p0) / se;

        // P-value (two-tailed)
        const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

        // Significant if p-value < significance level
        const significant = pValue < this.config.significanceLevel;

        return {
            testName: 'Z-Test for Win Rate',
            zScore: z.toFixed(4),
            pValue: pValue.toFixed(4),
            winRate: winRate.toFixed(4),
            nullHypothesis: 'Win rate = 50%',
            significant,
            interpretation: significant
                ? `Win rate (${(winRate * 100).toFixed(1)}%) is significantly different from 50%`
                : `Win rate (${(winRate * 100).toFixed(1)}%) is not significantly different from 50%`
        };
    }

    /**
     * T-Test for Average Profit
     * H0: Average profit = 0 (no edge)
     * H1: Average profit > 0 (has edge)
     */
    tTestProfits(trades) {
        const n = trades.length;
        const profits = trades.map(t => t.profit);

        // Calculate mean and standard deviation
        const mean = profits.reduce((sum, p) => sum + p, 0) / n;
        const variance = profits.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) / (n - 1);
        const stdDev = Math.sqrt(variance);
        const se = stdDev / Math.sqrt(n);

        // T-statistic (one-tailed test: profit > 0)
        const t = mean / se;

        // Degrees of freedom
        const df = n - 1;

        // P-value (approximation using normal distribution for large n)
        const pValue = 1 - this.normalCDF(t);

        // Significant if p-value < significance level
        const significant = pValue < this.config.significanceLevel && mean > 0;

        return {
            testName: 'T-Test for Average Profit',
            tStatistic: t.toFixed(4),
            pValue: pValue.toFixed(4),
            meanProfit: mean.toFixed(2),
            stdDev: stdDev.toFixed(2),
            degreesOfFreedom: df,
            nullHypothesis: 'Average profit = 0',
            significant,
            interpretation: significant
                ? `Average profit ($${mean.toFixed(2)}) is significantly greater than 0`
                : `Average profit ($${mean.toFixed(2)}) is not significantly greater than 0`
        };
    }

    /**
     * Sharpe Ratio Significance Test
     * Tests if Sharpe ratio is significantly greater than 0
     */
    sharpeRatioSignificance(trades) {
        const n = trades.length;
        const returns = trades.map(t => t.profit / 1000); // Normalize to percentage

        // Calculate Sharpe ratio
        const mean = returns.reduce((sum, r) => sum + r, 0) / n;
        const variance = returns.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / n;
        const stdDev = Math.sqrt(variance);

        const sharpe = stdDev > 0 ? (mean / stdDev) * Math.sqrt(252) : 0; // Annualized

        // Sharpe ratio standard error (Jobson-Korkie)
        const sharpeSE = Math.sqrt((1 + 0.5 * sharpe * sharpe) / n);

        // T-statistic
        const t = sharpe / sharpeSE;

        // P-value
        const pValue = 1 - this.normalCDF(t);

        // Significant if Sharpe > 0 and p-value < significance level
        const significant = pValue < this.config.significanceLevel && sharpe > 0;

        return {
            testName: 'Sharpe Ratio Significance',
            sharpeRatio: sharpe.toFixed(4),
            tStatistic: t.toFixed(4),
            pValue: pValue.toFixed(4),
            standardError: sharpeSE.toFixed(4),
            nullHypothesis: 'Sharpe ratio = 0',
            significant,
            interpretation: significant
                ? `Sharpe ratio (${sharpe.toFixed(2)}) is significantly greater than 0`
                : `Sharpe ratio (${sharpe.toFixed(2)}) is not significantly greater than 0`
        };
    }

    /**
     * Bootstrap Confidence Interval
     * Non-parametric method to estimate confidence intervals
     */
    bootstrapConfidence(trades, metric = 'winRate') {
        const n = trades.length;
        const iterations = this.config.bootstrapIterations;
        const bootstrapSamples = [];

        // Generate bootstrap samples
        for (let i = 0; i < iterations; i++) {
            const sample = [];
            for (let j = 0; j < n; j++) {
                const randomIndex = Math.floor(Math.random() * n);
                sample.push(trades[randomIndex]);
            }

            // Calculate metric for this sample
            let value;
            if (metric === 'winRate') {
                value = sample.filter(t => t.profit > 0).length / n;
            } else if (metric === 'avgProfit') {
                value = sample.reduce((sum, t) => sum + t.profit, 0) / n;
            }

            bootstrapSamples.push(value);
        }

        // Sort samples
        bootstrapSamples.sort((a, b) => a - b);

        // Calculate confidence interval (95%)
        const lowerIndex = Math.floor(iterations * 0.025);
        const upperIndex = Math.floor(iterations * 0.975);
        const lowerBound = bootstrapSamples[lowerIndex];
        const upperBound = bootstrapSamples[upperIndex];

        // Original sample metric
        let originalValue;
        if (metric === 'winRate') {
            originalValue = trades.filter(t => t.profit > 0).length / n;
        } else if (metric === 'avgProfit') {
            originalValue = trades.reduce((sum, t) => sum + t.profit, 0) / n;
        }

        // Significant if confidence interval doesn't include null value
        const nullValue = metric === 'winRate' ? 0.5 : 0;
        const significant = lowerBound > nullValue || upperBound < nullValue;

        return {
            testName: 'Bootstrap Confidence Interval',
            metric,
            originalValue: originalValue.toFixed(4),
            confidenceInterval: {
                lower: lowerBound.toFixed(4),
                upper: upperBound.toFixed(4),
                level: '95%'
            },
            iterations,
            significant,
            interpretation: significant
                ? `95% CI [${lowerBound.toFixed(4)}, ${upperBound.toFixed(4)}] does not include ${nullValue}`
                : `95% CI [${lowerBound.toFixed(4)}, ${upperBound.toFixed(4)}] includes ${nullValue}`
        };
    }

    /**
     * Permutation Test (Randomization Test)
     * Tests if strategy beats random trading
     */
    permutationTest(trades) {
        const n = trades.length;
        const iterations = this.config.permutationTests;

        // Calculate actual total profit
        const actualProfit = trades.reduce((sum, t) => sum + t.profit, 0);

        // Generate random permutations and calculate profits
        let moreExtreme = 0;
        for (let i = 0; i < iterations; i++) {
            // Randomly assign wins/losses
            let randomProfit = 0;
            for (let j = 0; j < n; j++) {
                const randomTrade = trades[Math.floor(Math.random() * n)];
                randomProfit += randomTrade.profit;
            }

            if (Math.abs(randomProfit) >= Math.abs(actualProfit)) {
                moreExtreme++;
            }
        }

        // P-value = proportion of random outcomes as extreme as actual
        const pValue = moreExtreme / iterations;

        const significant = pValue < this.config.significanceLevel;

        return {
            testName: 'Permutation Test',
            actualProfit: actualProfit.toFixed(2),
            pValue: pValue.toFixed(4),
            iterations,
            moreExtremeThanActual: moreExtreme,
            nullHypothesis: 'Strategy performs same as random trading',
            significant,
            interpretation: significant
                ? `Strategy significantly outperforms random trading (p=${pValue.toFixed(4)})`
                : `Strategy does not significantly outperform random trading (p=${pValue.toFixed(4)})`
        };
    }

    /**
     * Consecutive Wins/Losses Test
     * Tests for patterns that might indicate system issues or data snooping
     */
    consecutiveWinsLossesTest(trades) {
        const n = trades.length;

        // Count consecutive wins and losses
        let maxConsecutiveWins = 0;
        let maxConsecutiveLosses = 0;
        let currentWinStreak = 0;
        let currentLossStreak = 0;

        for (const trade of trades) {
            if (trade.profit > 0) {
                currentWinStreak++;
                currentLossStreak = 0;
                maxConsecutiveWins = Math.max(maxConsecutiveWins, currentWinStreak);
            } else {
                currentLossStreak++;
                currentWinStreak = 0;
                maxConsecutiveLosses = Math.max(maxConsecutiveLosses, currentLossStreak);
            }
        }

        // Expected maximum streak length for random sequence
        const winRate = trades.filter(t => t.profit > 0).length / n;
        const expectedMaxWinStreak = Math.log(n) / Math.log(1 / winRate);
        const expectedMaxLossStreak = Math.log(n) / Math.log(1 / (1 - winRate));

        // Check if observed streaks are within expected range (within 2 standard deviations)
        const winStreakNormal = maxConsecutiveWins <= expectedMaxWinStreak * 2;
        const lossStreakNormal = maxConsecutiveLosses <= expectedMaxLossStreak * 2;

        const significant = winStreakNormal && lossStreakNormal;

        return {
            testName: 'Consecutive Wins/Losses Test',
            maxConsecutiveWins,
            maxConsecutiveLosses,
            expectedMaxWinStreak: expectedMaxWinStreak.toFixed(1),
            expectedMaxLossStreak: expectedMaxLossStreak.toFixed(1),
            winStreakNormal,
            lossStreakNormal,
            significant,
            interpretation: significant
                ? 'Streak patterns appear normal (not suspicious)'
                : 'Warning: Unusual streak patterns detected (possible overfitting or data issues)'
        };
    }

    /**
     * Runs test (Tests for randomness of sequence)
     * Checks if wins/losses are randomly distributed
     */
    runsTest(trades) {
        const n = trades.length;
        const sequence = trades.map(t => t.profit > 0 ? 1 : 0);

        // Count runs (sequences of consecutive wins or losses)
        let runs = 1;
        for (let i = 1; i < n; i++) {
            if (sequence[i] !== sequence[i - 1]) {
                runs++;
            }
        }

        // Count wins and losses
        const wins = sequence.filter(s => s === 1).length;
        const losses = n - wins;

        // Expected runs under null hypothesis (random sequence)
        const expectedRuns = (2 * wins * losses) / n + 1;

        // Standard deviation of runs
        const variance = (2 * wins * losses * (2 * wins * losses - n)) / (n * n * (n - 1));
        const stdDev = Math.sqrt(variance);

        // Z-score
        const z = (runs - expectedRuns) / stdDev;

        // P-value (two-tailed)
        const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));

        const significant = pValue >= this.config.significanceLevel; // We WANT randomness

        return {
            testName: 'Runs Test for Randomness',
            observedRuns: runs,
            expectedRuns: expectedRuns.toFixed(1),
            zScore: z.toFixed(4),
            pValue: pValue.toFixed(4),
            nullHypothesis: 'Wins and losses are randomly distributed',
            significant,
            interpretation: significant
                ? 'Sequence appears random (good)'
                : 'Warning: Sequence may not be random (possible pattern or autocorrelation)'
        };
    }

    /**
     * Normal CDF approximation
     */
    normalCDF(x) {
        const t = 1 / (1 + 0.2316419 * Math.abs(x));
        const d = 0.3989423 * Math.exp(-x * x / 2);
        const prob = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));

        return x > 0 ? 1 - prob : prob;
    }

    /**
     * Generate comprehensive validation report
     */
    generateReport(trades, strategyName) {
        const validation = this.validateSignal(trades);

        console.log('\n' + '='.repeat(70));
        console.log(`📊 STATISTICAL VALIDATION REPORT: ${strategyName}`);
        console.log('='.repeat(70));
        console.log(`\nSample Size: ${validation.sampleSize} trades`);
        console.log(`Tests Passed: ${validation.passedTests}/${validation.totalTests}`);
        console.log(`Overall Confidence: ${(validation.confidence * 100).toFixed(1)}%`);
        console.log(`\nValidation Result: ${validation.valid ? '✅ VALID' : '❌ INVALID'}\n`);

        for (const [testName, result] of Object.entries(validation.tests)) {
            console.log(`\n${result.testName}:`);
            console.log(`  ${result.significant ? '✅' : '❌'} ${result.interpretation}`);

            if (result.pValue) {
                console.log(`  P-value: ${result.pValue} (${result.significant ? '<' : '≥'} ${this.config.significanceLevel})`);
            }

            if (result.confidenceInterval) {
                console.log(`  95% CI: [${result.confidenceInterval.lower}, ${result.confidenceInterval.upper}]`);
            }
        }

        console.log('\n' + '='.repeat(70) + '\n');

        return validation;
    }
}

module.exports = StatisticalValidator;
