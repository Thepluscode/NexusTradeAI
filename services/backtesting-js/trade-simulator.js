const { getRoundTripCost } = require('../signals/cost-model');

class TradeSimulator {
  constructor(bot) {
    this.bot = bot;
    this.positions = new Map();
  }

  openPosition(symbol, direction, entryPrice, stopLoss, profitTarget, trailingActivation, trailingDistance, signalSnapshot) {
    if (this.positions.has(symbol)) return null;
    const position = {
      symbol, direction, entryPrice, stopLoss, profitTarget,
      trailingActivation, trailingDistance,
      trailingStop: null, highWaterMark: entryPrice,
      signalSnapshot, entryTime: signalSnapshot.time
    };
    this.positions.set(symbol, position);
    return position;
  }

  checkExits(bar) {
    const closed = [];
    for (const [symbol, pos] of this.positions) {
      const exit = this._checkExit(pos, bar);
      if (exit) {
        const costs = getRoundTripCost(this.bot, pos.entryPrice);
        const grossPnlPct = pos.direction === 'long'
          ? ((exit.price - pos.entryPrice) / pos.entryPrice) * 100
          : ((pos.entryPrice - exit.price) / pos.entryPrice) * 100;

        closed.push({
          symbol, direction: pos.direction,
          entryTime: pos.entryTime, exitTime: bar.time,
          entryPrice: pos.entryPrice, exitPrice: exit.price,
          grossPnlPct, costsPct: costs.costPct,
          netPnlPct: grossPnlPct - costs.costPct,
          exitReason: exit.reason,
          ...pos.signalSnapshot
        });
        this.positions.delete(symbol);
      } else {
        this._updateTrailingStop(pos, bar);
      }
    }
    return closed;
  }

  gapThroughFill(stopPrice, nextBarOpen, direction) {
    if (direction === 'long') {
      return Math.min(stopPrice, nextBarOpen);
    } else {
      return Math.max(stopPrice, nextBarOpen);
    }
  }

  _checkExit(pos, bar) {
    const { direction, stopLoss, profitTarget, trailingStop } = pos;

    if (direction === 'long') {
      if (bar.low <= stopLoss) {
        return { price: this.gapThroughFill(stopLoss, bar.open, 'long'), reason: 'stopLoss' };
      }
      if (trailingStop && bar.low <= trailingStop) {
        return { price: this.gapThroughFill(trailingStop, bar.open, 'long'), reason: 'trailingStop' };
      }
      if (bar.high >= profitTarget) {
        return { price: profitTarget, reason: 'profitTarget' };
      }
    } else {
      if (bar.high >= stopLoss) {
        return { price: this.gapThroughFill(stopLoss, bar.open, 'short'), reason: 'stopLoss' };
      }
      if (trailingStop && bar.high >= trailingStop) {
        return { price: this.gapThroughFill(trailingStop, bar.open, 'short'), reason: 'trailingStop' };
      }
      if (bar.low <= profitTarget) {
        return { price: profitTarget, reason: 'profitTarget' };
      }
    }
    return null;
  }

  _updateTrailingStop(pos, bar) {
    const pnl = pos.direction === 'long'
      ? (bar.close - pos.entryPrice) / pos.entryPrice
      : (pos.entryPrice - bar.close) / pos.entryPrice;

    if (pnl >= pos.trailingActivation / pos.entryPrice) {
      if (pos.direction === 'long') {
        const newStop = bar.close - pos.trailingDistance;
        if (!pos.trailingStop || newStop > pos.trailingStop) {
          pos.trailingStop = newStop;
        }
        pos.highWaterMark = Math.max(pos.highWaterMark, bar.high);
      } else {
        const newStop = bar.close + pos.trailingDistance;
        if (!pos.trailingStop || newStop < pos.trailingStop) {
          pos.trailingStop = newStop;
        }
        pos.highWaterMark = Math.min(pos.highWaterMark, bar.low);
      }
    }
  }
}

module.exports = { TradeSimulator };
