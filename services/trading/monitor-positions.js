const axios = require('axios');
const fs = require('fs');

async function monitorPositions() {
  console.log('\n📊 POSITION MONITORING STARTED');
  console.log('='.repeat(80));

  let iteration = 0;
  const maxIterations = 12;

  const interval = setInterval(async () => {
    try {
      iteration++;

      const positions = JSON.parse(fs.readFileSync('./data/positions.json', 'utf8'));
      const activePositions = Object.values(positions.active || {});

      if (activePositions.length === 0) {
        console.log('\n⚠️  No active positions');
        clearInterval(interval);
        return;
      }

      console.log(`\n⏱️  Update #${iteration} - ${new Date().toLocaleTimeString()}`);
      console.log('-'.repeat(80));

      let totalUnrealizedPnL = 0;

      for (const pos of activePositions) {
        try {
          const response = await axios.get(`http://localhost:3001/api/market/quote/${pos.symbol}`);
          const currentPrice = response.data.price;

          const pnl = pos.direction === 'long'
            ? (currentPrice - pos.entry) * pos.size
            : (pos.entry - currentPrice) * pos.size;

          const pnlPercent = ((pnl / (pos.entry * pos.size)) * 100);
          totalUnrealizedPnL += pnl;

          const targetDistance = pos.direction === 'long'
            ? ((pos.target - currentPrice) / currentPrice * 100)
            : ((currentPrice - pos.target) / currentPrice * 100);

          const stopDistance = pos.direction === 'long'
            ? ((currentPrice - pos.stop) / currentPrice * 100)
            : ((pos.stop - currentPrice) / currentPrice * 100);

          const pnlIcon = pnl >= 0 ? '🟢' : '🔴';

          console.log(`📈 ${pos.symbol} ${pos.direction.toUpperCase()}`);
          console.log(`   Entry: $${pos.entry.toFixed(2)} | Current: $${currentPrice.toFixed(2)} | Size: ${pos.size} shares`);
          console.log(`   ${pnlIcon} P&L: $${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
          console.log(`   🎯 Target: $${pos.target.toFixed(2)} (${targetDistance >= 0 ? '+' : ''}${targetDistance.toFixed(2)}% away)`);
          console.log(`   🛑 Stop: $${pos.stop.toFixed(2)} (${stopDistance >= 0 ? '+' : ''}${stopDistance.toFixed(2)}% cushion)`);
          console.log();

        } catch (error) {
          console.log(`   ⚠️  Error fetching price for ${pos.symbol}: ${error.message}`);
        }
      }

      console.log('-'.repeat(80));
      console.log(`💰 Total Unrealized P&L: $${totalUnrealizedPnL.toFixed(2)}`);
      console.log(`📊 Active Positions: ${activePositions.length}`);

      const performance = JSON.parse(fs.readFileSync('./data/performance.json', 'utf8'));
      console.log(`⚡ Circuit Breaker: ${performance.circuitBreakerStatus}`);

      if (iteration >= maxIterations) {
        console.log('\n✅ Monitoring completed');
        console.log('='.repeat(80));
        clearInterval(interval);
      }

    } catch (error) {
      console.error('Error in monitoring:', error.message);
    }
  }, 5000);
}

monitorPositions();
