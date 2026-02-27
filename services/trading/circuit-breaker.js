/**
 * Circuit Breaker - Risk Management System
 * Prevents catastrophic losses by stopping trading when limits are exceeded
 */

class CircuitBreaker {
    constructor(config) {
        this.config = config;
        this.dailyProfit = 0;
        this.dailyTrades = 0;
        this.consecutiveLosses = 0;
        this.maxConsecutiveLosses = 0;
        this.startOfDay = new Date().toDateString();
        this.isTripped = false;
        this.tripReason = null;
    }

    // Reset daily counters at start of new trading day
    checkAndResetDaily() {
        const today = new Date().toDateString();
        if (today !== this.startOfDay) {
            console.log('🔄 New trading day - resetting circuit breaker');
            this.dailyProfit = 0;
            this.dailyTrades = 0;
            this.consecutiveLosses = 0;
            this.startOfDay = today;
            this.isTripped = false;
            this.tripReason = null;
        }
    }

    // Record a completed trade
    recordTrade(profit) {
        this.checkAndResetDaily();

        this.dailyProfit += profit;
        this.dailyTrades++;

        if (profit < 0) {
            this.consecutiveLosses++;
            this.maxConsecutiveLosses = Math.max(this.maxConsecutiveLosses, this.consecutiveLosses);
        } else {
            this.consecutiveLosses = 0;
        }

        // Check if circuit breaker should trip
        this.checkLimits();
    }

    // Check all risk limits
    checkLimits() {
        // 1. Daily loss limit (INCREASED for 10 position strategy)
        const maxDailyLoss = this.config.maxDailyLoss || -5000; // Increased from -1000 to -5000
        if (this.dailyProfit <= maxDailyLoss) {
            this.trip(`Daily loss limit exceeded: $${this.dailyProfit.toFixed(2)} (limit: $${maxDailyLoss})`);
            return false;
        }

        // 2. Consecutive losses limit (INCREASED for more positions)
        const maxConsecutive = 7; // Increased from 5 to 7
        if (this.consecutiveLosses >= maxConsecutive) {
            this.trip(`Too many consecutive losses: ${this.consecutiveLosses} (limit: ${maxConsecutive})`);
            return false;
        }

        // 3. Maximum daily trades limit (INCREASED for 10 positions)
        const maxDailyTrades = 100; // Increased from 50 to 100
        if (this.dailyTrades >= maxDailyTrades) {
            this.trip(`Maximum daily trades reached: ${this.dailyTrades} (limit: ${maxDailyTrades})`);
            return false;
        }

        return true;
    }

    // Trip the circuit breaker
    trip(reason) {
        if (!this.isTripped) {
            this.isTripped = true;
            this.tripReason = reason;
            console.log('\n🚨 ═══════════════════════════════════════════════');
            console.log('🚨 CIRCUIT BREAKER TRIPPED!');
            console.log(`🚨 Reason: ${reason}`);
            console.log('🚨 Trading has been STOPPED for today');
            console.log('🚨 ═══════════════════════════════════════════════\n');
        }
    }

    // Check if trading is allowed
    canTrade() {
        this.checkAndResetDaily();
        return !this.isTripped;
    }

    // Get current status
    getStatus() {
        return {
            isTripped: this.isTripped,
            tripReason: this.tripReason,
            dailyProfit: this.dailyProfit,
            dailyTrades: this.dailyTrades,
            consecutiveLosses: this.consecutiveLosses,
            maxConsecutiveLosses: this.maxConsecutiveLosses,
            canTrade: this.canTrade()
        };
    }

    // Manual reset (use with caution!)
    reset() {
        console.log('⚠️  Circuit breaker manually reset');
        this.isTripped = false;
        this.tripReason = null;
    }
}

module.exports = CircuitBreaker;
