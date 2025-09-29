import math
import time
from typing import List, Dict, Any, Optional, Tuple
import json

class TechnicalIndicators:
    def __init__(self):
        self.cache = {}
        self.ichimoku_cache = {}

    # ===========================================
    # TREND INDICATORS
    # ===========================================

    def ichimoku(self, highs: List[float], lows: List[float], periods: Dict[str, int] = None) -> Dict[str, List[float]]:
        """
        Calculate Ichimoku Cloud components.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            periods: Optional periods for calculation (default: {conversion: 9, base: 26, spanB: 52, lagging: 26, displacement: 26}).
        
        Returns:
            Dictionary containing Ichimoku Cloud components.
        """
        if periods is None:
            periods = {"conversion": 9, "base": 26, "spanB": 52, "lagging": 26, "displacement": 26}
        
        cache_key = f"ichimoku_{len(highs)}_{len(lows)}_{json.dumps(periods, sort_keys=True)}"
        
        if cache_key in self.ichimoku_cache:
            return self.ichimoku_cache[cache_key]
        
        conversion, base, spanB, lagging, displacement = (
            periods["conversion"],
            periods["base"],
            periods["spanB"],
            periods["lagging"],
            periods["displacement"]
        )
        
        # Tenkan-sen (Conversion Line)
        conversion_line = []
        for i in range(conversion - 1, len(highs)):
            period_high = max(highs[i - conversion + 1:i + 1])
            period_low = min(lows[i - conversion + 1:i + 1])
            conversion_line.append((period_high + period_low) / 2)
        
        # Kijun-sen (Base Line)
        base_line = []
        for i in range(base - 1, len(highs)):
            period_high = max(highs[i - base + 1:i + 1])
            period_low = min(lows[i - base + 1:i + 1])
            base_line.append((period_high + period_low) / 2)
        
        # Senkou Span A (Leading Span A)
        span_a = []
        base_start = base - conversion
        for i in range(len(base_line)):
            if i >= base_start:
                span_a.append((conversion_line[i - base_start] + base_line[i]) / 2)
        
        # Senkou Span B (Leading Span B)
        span_b = []
        for i in range(spanB - 1, len(highs)):
            period_high = max(highs[i - spanB + 1:i + 1])
            period_low = min(lows[i - spanB + 1:i + 1])
            span_b.append((period_high + period_low) / 2)
        
        # Chikou Span (Lagging Span)
        chikou_span = []
        for i in range(len(highs) - lagging):
            chikou_span.append(highs[i + lagging])
        
        result = {
            "conversionLine": conversion_line,
            "baseLine": base_line,
            "spanA": [None] * displacement + span_a[:len(span_a) - displacement],
            "spanB": [None] * displacement + span_b[:len(span_b) - displacement],
            "chikouSpan": chikou_span + [None] * lagging
        }
        
        self.ichimoku_cache[cache_key] = result
        return result

    def sma(self, prices: List[float], period: int) -> List[float]:
        """
        Calculate Simple Moving Average (SMA).
        
        Args:
            prices: List of price values.
            period: Period for calculation.
        
        Returns:
            List of SMA values.
        """
        result = []
        for i in range(period - 1, len(prices)):
            sum_prices = sum(prices[i - period + 1:i + 1])
            result.append(sum_prices / period)
        return result

    def ema(self, prices: List[float], period: int) -> List[float]:
        """
        Calculate Exponential Moving Average (EMA).
        
        Args:
            prices: List of price values.
            period: Period for calculation.
        
        Returns:
            List of EMA values.
        """
        result = []
        multiplier = 2 / (period + 1)
        
        ema = sum(prices[:period]) / period
        result.append(ema)
        
        for i in range(period, len(prices)):
            ema = (prices[i] - ema) * multiplier + ema
            result.append(ema)
        
        return result

    # ===========================================
    # VOLUME INDICATORS
    # ===========================================

    def volume_profile(self, prices: List[float], volumes: List[float], price_bins: int = 20) -> Dict[str, Any]:
        """
        Calculate Volume Profile.
        
        Args:
            prices: List of price values (usually close prices).
            volumes: List of volume values.
            price_bins: Number of price bins (default: 20).
        
        Returns:
            Dictionary containing volume profile data.
        """
        if len(prices) != len(volumes):
            raise ValueError("Prices and volumes lists must have the same length")
        
        min_price = min(prices)
        max_price = max(prices)
        price_range = max_price - min_price
        bin_size = price_range / price_bins
        
        bins = [0] * price_bins
        bin_prices = [min_price + (i * bin_size) + (bin_size / 2) for i in range(price_bins)]
        
        for price, volume in zip(prices, volumes):
            if price == max_price:
                bins[price_bins - 1] += volume
            else:
                bin_index = min(int(((price - min_price) / price_range) * price_bins), price_bins - 1)
                bins[bin_index] += volume
        
        total_volume = sum(bins)
        target_volume = total_volume * 0.7
        
        sorted_bins = sorted(
            [{"volume": volume, "price": price} for volume, price in zip(bins, bin_prices)],
            key=lambda x: x["volume"],
            reverse=True
        )
        
        volume_sum = 0
        value_area = []
        for bin_data in sorted_bins:
            if volume_sum >= target_volume:
                break
            volume_sum += bin_data["volume"]
            value_area.append(bin_data["price"])
        
        value_area_high = max(value_area) if value_area else max_price
        value_area_low = min(value_area) if value_area else min_price
        point_of_control = sorted_bins[0]["price"] if sorted_bins else min_price
        
        return {
            "bins": bin_prices,
            "volumes": bins,
            "totalVolume": total_volume,
            "valueArea": {
                "high": value_area_high,
                "low": value_area_low,
                "volume": volume_sum
            },
            "pointOfControl": point_of_control,
            "profileHigh": max_price,
            "profileLow": min_price
        }

    # ===========================================
    # SUPPORT/RESISTANCE INDICATORS
    # ===========================================

    def fibonacci_retracement(self, high: float, low: float, levels: List[float] = None) -> Dict[str, Any]:
        """
        Calculate Fibonacci Retracement Levels.
        
        Args:
            high: Swing high price.
            low: Swing low price.
            levels: Custom retracement levels (default: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]).
        
        Returns:
            Dictionary containing Fibonacci retracement levels and extensions.
        """
        if levels is None:
            levels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1]
        
        diff = high - low
        retracements = {f"{level * 100}%": high - (diff * level) for level in levels}
        
        extensions = {
            "0%": high,
            "100%": low,
            "161.8%": low - (diff * 0.618),
            "261.8%": low - (diff * 1.618),
            "423.6%": low - (diff * 3.236)
        }
        
        return {
            "high": high,
            "low": low,
            "range": diff,
            "retracements": retracements,
            "extensions": extensions
        }

    def pivot_points(self, high: float, low: float, close: float, type: str = "standard") -> Dict[str, Any]:
        """
        Calculate Pivot Points.
        
        Args:
            high: Previous period high.
            low: Previous period low.
            close: Previous period close.
            type: Type of pivot points ('standard', 'fibonacci', 'demark') (default: 'standard').
        
        Returns:
            Dictionary containing pivot points and support/resistance levels.
        """
        pivot = (high + low + close) / 3
        range_ = high - low
        
        result = {"pivot": pivot, "supports": {}, "resistances": {}}
        
        if type.lower() == "fibonacci":
            result["supports"] = {
                "s1": pivot - (0.382 * range_),
                "s2": pivot - (0.618 * range_),
                "s3": pivot - (1.0 * range_)
            }
            result["resistances"] = {
                "r1": pivot + (0.382 * range_),
                "r2": pivot + (0.618 * range_),
                "r3": pivot + (1.0 * range_)
            }
        elif type.lower() == "demark":
            x = high + (low * 2) + close
            result["pivot"] = x / 2 - high + low
            result["supports"] = {"s1": x / 2 - high}
            result["resistances"] = {"r1": x / 2 - low}
        else:  # standard
            result["supports"] = {
                "s1": (2 * pivot) - high,
                "s2": pivot - range_,
                "s3": low - 2 * (high - pivot)
            }
            result["resistances"] = {
                "r1": (2 * pivot) - low,
                "r2": pivot + range_,
                "r3": high + 2 * (pivot - low)
            }
        
        return result

    # ===========================================
    # FOREX INDICATORS
    # ===========================================

    def atr(self, highs: List[float], lows: List[float], closes: List[float], period: int = 14) -> List[float]:
        """
        Calculate Average True Range (ATR).
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            period: Period for calculation (default: 14).
        
        Returns:
            List of ATR values.
        """
        true_ranges = [0]
        
        for i in range(1, len(highs)):
            tr1 = highs[i] - lows[i]
            tr2 = abs(highs[i] - closes[i-1])
            tr3 = abs(lows[i] - closes[i-1])
            true_ranges.append(max(tr1, tr2, tr3))
        
        atr = []
        sum_tr = sum(true_ranges[1:period + 1])
        atr.append(sum_tr / period)
        
        for i in range(period + 1, len(true_ranges)):
            atr.append((atr[-1] * (period - 1) + true_ranges[i]) / period)
        
        return [None] * period + atr

    def parabolic_sar(self, highs: List[float], lows: List[float], acceleration: float = 0.02, maximum: float = 0.2) -> List[float]:
        """
        Calculate Parabolic SAR (Stop and Reverse).
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            acceleration: Acceleration factor (default: 0.02).
            maximum: Maximum acceleration factor (default: 0.2).
        
        Returns:
            List of SAR values.
        """
        if len(highs) != len(lows):
            raise ValueError("Highs and lows lists must have the same length")
        
        if len(highs) < 2:
            return [None]
        
        sar = [None] * len(highs)
        ep = lows[0]
        af = acceleration
        is_up = True
        sar[0] = lows[0] if is_up else highs[0]
        
        for i in range(1, len(highs)):
            prev_sar = sar[i-1]
            sar[i] = prev_sar + af * (ep - prev_sar)
            
            if is_up:
                if lows[i] < sar[i]:
                    is_up = False
                    sar[i] = max(highs[i-1], highs[i-2] if i >= 2 else highs[i-1])
                    ep = lows[i]
                    af = acceleration
                else:
                    if highs[i] > ep:
                        ep = highs[i]
                        af = min(af + acceleration, maximum)
                    if i >= 2:
                        sar[i] = min(sar[i], lows[i-1], lows[i-2])
                    sar[i] = min(sar[i], lows[i-1])
            else:
                if highs[i] > sar[i]:
                    is_up = True
                    sar[i] = min(lows[i-1], lows[i-2] if i >= 2 else lows[i-1])
                    ep = highs[i]
                    af = acceleration
                else:
                    if lows[i] < ep:
                        ep = lows[i]
                        af = min(af + acceleration, maximum)
                    if i >= 2:
                        sar[i] = max(sar[i], highs[i-1], highs[i-2])
                    sar[i] = max(sar[i], highs[i-1])
        
        return sar

    def demarker(self, highs: List[float], lows: List[float], period: int = 14) -> List[float]:
        """
        Calculate DeMarker Indicator.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            period: Period for calculation (default: 14).
        
        Returns:
            List of DeMarker values (0 to 1).
        """
        if len(highs) != len(lows):
            raise ValueError("Highs and lows lists must have the same length")
        
        demark = [None] * len(highs)
        de_max = [0]
        de_min = [0]
        
        for i in range(1, len(highs)):
            diff_high = highs[i] - highs[i-1]
            diff_low = lows[i-1] - lows[i]
            de_max.append(diff_high if diff_high > 0 else 0)
            de_min.append(diff_low if diff_low > 0 else 0)
        
        for i in range(period, len(highs)):
            sum_de_max = sum(de_max[i - period + 1:i + 1])
            sum_de_min = sum(de_min[i - period + 1:i + 1])
            sum_de = sum_de_max + sum_de_min
            demark[i] = 0 if sum_de == 0 else sum_de_max / sum_de
        
        return demark

    def cmo(self, prices: List[float], period: int = 14) -> List[float]:
        """
        Calculate Chande Momentum Oscillator (CMO).
        
        Args:
            prices: List of price values.
            period: Period for calculation (default: 14).
        
        Returns:
            List of CMO values (-100 to 100).
        """
        if len(prices) < period:
            return [None] * len(prices)
        
        gains = [0]
        losses = [0]
        
        for i in range(1, len(prices)):
            diff = prices[i] - prices[i-1]
            gains.append(diff if diff > 0 else 0)
            losses.append(-diff if diff < 0 else 0)
        
        cmo = [None] * period
        for i in range(period, len(prices)):
            sum_gain = sum(gains[i - period + 1:i + 1])
            sum_loss = sum(losses[i - period + 1:i + 1])
            sum_total = sum_gain + sum_loss
            cmo.append(0 if sum_total == 0 else 100 * ((sum_gain - sum_loss) / sum_total))
        
        return cmo

    def keltner_channels(self, highs: List[float], lows: List[float], closes: List[float], 
                        period: int = 20, multiplier: float = 2, atr_period: int = 10) -> Dict[str, List[float]]:
        """
        Calculate Keltner Channels.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            period: Period for EMA calculation (default: 20).
            multiplier: ATR multiplier (default: 2).
            atr_period: Period for ATR calculation (default: 10).
        
        Returns:
            Dictionary with middle, upper, and lower bands.
        """
        middle = self.ema(closes, period)
        atr = self.atr(highs, lows, closes, atr_period)
        
        offset = len(closes) - len(middle)
        adjusted_atr = atr[offset:]
        
        upper = []
        lower = []
        for i in range(len(middle)):
            atr_value = adjusted_atr[i] if i < len(adjusted_atr) else 0
            upper.append(middle[i] + atr_value * multiplier)
            lower.append(middle[i] - atr_value * multiplier)
        
        return {
            "middle": [None] * offset + middle,
            "upper": [None] * offset + upper,
            "lower": [None] * offset + lower
        }

    # ===========================================
    # CRYPTOCURRENCY INDICATORS
    # ===========================================

    def bitcoin_dominance(self, btc_market_cap: float, total_crypto_market_cap: float, 
                        history: List[Dict[str, float]] = None) -> Dict[str, Any]:
        """
        Calculate Bitcoin Dominance.
        
        Args:
            btc_market_cap: Bitcoin's market capitalization.
            total_crypto_market_cap: Total crypto market capitalization.
            history: Optional historical data for trend analysis.
        
        Returns:
            Dictionary containing dominance metrics.
        """
        if history is None:
            history = []
        if total_crypto_market_cap <= 0:
            raise ValueError("Total market cap must be greater than 0")
        
        dominance = (btc_market_cap / total_crypto_market_cap) * 100
        trend_data = self._calculate_dominance_trend(dominance, history)
        
        return {
            "dominance": round(dominance, 2),
            "trend": trend_data["trend"],
            "change24h": trend_data["change24h"],
            "timestamp": int(time.time() * 1000),
            "btcMarketCap": btc_market_cap,
            "totalCryptoMarketCap": total_crypto_market_cap
        }

    def _calculate_dominance_trend(self, current_dominance: float, history: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Calculate dominance trend (private helper method).
        
        Args:
            current_dominance: Current Bitcoin dominance percentage.
            history: Historical dominance data.
        
        Returns:
            Dictionary with trend and change over 24 hours.
        """
        if len(history) < 2:
            return {"trend": "neutral", "change24h": 0}
        
        last_24h = history[-24:] if len(history) >= 24 else history
        if len(last_24h) < 2:
            return {"trend": "neutral", "change24h": 0}
        
        oldest = last_24h[0]
        change_24h = ((current_dominance - oldest["dominance"]) / oldest["dominance"]) * 100
        
        trend = "neutral"
        if change_24h > 1:
            trend = "strong_up"
        elif change_24h > 0.1:
            trend = "up"
        elif change_24h < -1:
            trend = "strong_down"
        elif change_24h < -0.1:
            trend = "down"
        
        return {
            "trend": trend,
            "change24h": round(change_24h, 2)
        }

    def nvt_ratio(self, market_cap: float, daily_tx_volume: float, options: Dict[str, int] = None) -> Dict[str, Any]:
        """
        Calculate Network Value to Transactions (NVT) Ratio.
        
        Args:
            market_cap: Market capitalization.
            daily_tx_volume: Daily transaction volume in USD.
            options: Calculation options (default: {"period": 1}).
        
        Returns:
            Dictionary containing NVT ratio metrics.
        """
        if options is None:
            options = {}
        period = options.get("period", 1)
        if daily_tx_volume <= 0:
            return None
        
        annualized_tx_volume = daily_tx_volume * (365 if period == 1 else period)
        ratio = market_cap / annualized_tx_volume
        
        return {
            "nvt": round(ratio, 2),
            "marketCap": market_cap,
            "txVolume": daily_tx_volume,
            "period": period,
            "timestamp": int(time.time() * 1000)
        }

    def realized_price(self, utxos: List[Dict[str, float]]) -> float:
        """
        Calculate Realized Price.
        
        Args:
            utxos: List of UTXOs with value and price when moved.
        
        Returns:
            Realized price in USD.
        """
        if not utxos:
            return None
        
        total_value = sum(utxo["value"] * utxo["price"] for utxo in utxos)
        total_coins = sum(utxo["value"] for utxo in utxos)
        
        return total_value / total_coins if total_coins > 0 else 0

    def sopr(self, spent_outputs: List[Dict[str, float]]) -> Dict[str, Any]:
        """
        Calculate Spent Output Profit Ratio (SOPR).
        
        Args:
            spent_outputs: List of spent outputs with value, acquisition price, and current price.
        
        Returns:
            Dictionary containing SOPR metrics.
        """
        if not spent_outputs:
            return None
        
        profit_sum = 0
        loss_sum = 0
        profit_count = 0
        loss_count = 0
        
        for output in spent_outputs:
            profit_ratio = (output["currentPrice"] / output["acquisitionPrice"]) - 1
            if profit_ratio >= 0:
                profit_sum += profit_ratio * output["value"]
                profit_count += 1
            else:
                loss_sum += abs(profit_ratio) * output["value"]
                loss_count += 1
        
        total_sum = profit_sum + loss_sum
        sopr_value = 1 + ((profit_sum - loss_sum) / total_sum) if total_sum > 0 else 1
        
        return {
            "sopr": round(sopr_value, 4),
            "profitVolume": profit_sum,
            "lossVolume": loss_sum,
            "profitCount": profit_count,
            "lossCount": loss_count,
            "totalTransactions": len(spent_outputs),
            "timestamp": int(time.time() * 1000)
        }

    def mvrv_ratio(self, market_cap: float, realized_cap: float) -> Dict[str, Any]:
        """
        Calculate Market Value to Realized Value (MVRV) Ratio.
        
        Args:
            market_cap: Current market capitalization.
            realized_cap: Realized capitalization.
        
        Returns:
            Dictionary containing MVRV metrics.
        """
        if realized_cap <= 0:
            return None
        
        ratio = market_cap / realized_cap
        
        return {
            "mvrv": round(ratio, 4),
            "marketCap": market_cap,
            "realizedCap": realized_cap,
            "timestamp": int(time.time() * 1000),
            "isOverbought": ratio > 3.7,
            "isOversold": ratio < 1,
            "zone": ("Danger Zone (Selling)" if ratio > 3.7 else
                    "Selling Zone" if ratio > 2.4 else
                    "Fair Value" if ratio > 1.2 else
                    "Buying Zone")
        }

    def hash_rate_difficulty(self, hash_rate: float, difficulty: float, options: Dict[str, float] = None) -> Dict[str, Any]:
        """
        Calculate Network Hash Rate Difficulty.
        
        Args:
            hash_rate: Current network hash rate.
            difficulty: Current mining difficulty.
            options: Calculation options (default: {"blockTime": 600, "blockReward": 6.25}).
        
        Returns:
            Dictionary containing difficulty metrics.
        """
        if options is None:
            options = {}
        block_time = options.get("blockTime", 600)
        block_reward = options.get("blockReward", 6.25)
        
        hash_price = (block_reward * 144 * 1e12) / (difficulty * 2**32)
        
        electricity_cost = 0.05  # $0.05 per kWh
        power_efficiency = 0.1  # J/GH
        daily_cost = (hash_rate / 1e9) * power_efficiency * 24 * electricity_cost
        
        daily_revenue = (hash_rate / 1e12) * hash_price * 24
        profit_margin = ((daily_revenue - daily_cost) / daily_revenue) * 100 if daily_revenue > 0 else 0
        
        return {
            "hashRate": hash_rate / 1e12,
            "difficulty": difficulty,
            "hashPrice": round(hash_price, 6),
            "dailyRevenue": round(daily_revenue, 2),
            "dailyCost": round(daily_cost, 2),
            "profitMargin": round(profit_margin, 2),
            "isProfitable": profit_margin > 0,
            "timestamp": int(time.time() * 1000)
        }

    # ===========================================
    # FOREX-SPECIFIC INDICATORS
    # ===========================================

    def atr_trailing_stops(self, highs: List[float], lows: List[float], closes: List[float], 
                         period: int = 14, multiplier: float = 2) -> Dict[str, List[float]]:
        """
        Calculate ATR Trailing Stops.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            period: ATR period (default: 14).
            multiplier: ATR multiplier (default: 2).
        
        Returns:
            Dictionary with upper and lower bands.
        """
        atr_values = self.atr(highs, lows, closes, period)
        upper = []
        lower = []
        
        upper_band = None
        lower_band = None
        
        for i in range(len(closes)):
            atr = atr_values[i] if i < len(atr_values) else 0
            
            if i == 0:
                upper_band = closes[i] + (atr * multiplier)
                lower_band = closes[i] - (atr * multiplier)
            else:
                if closes[i] > upper_band and closes[i-1] <= upper_band:
                    lower_band = closes[i] - (atr * multiplier)
                elif closes[i] < lower_band and closes[i-1] >= lower_band:
                    upper_band = closes[i] + (atr * multiplier)
                else:
                    if closes[i] > upper_band:
                        upper_band = max(upper_band, closes[i] - (atr * multiplier))
                    elif closes[i] < lower_band:
                        lower_band = min(lower_band, closes[i] + (atr * multiplier))
            
            upper.append(upper_band)
            lower.append(lower_band)
        
        return {"upper": upper, "lower": lower}

    def forex_session_strength(self, prices: List[Dict[str, Any]]) -> Dict[str, Any]:
        """
        Analyze Forex Market Session Strength.
        
        Args:
            prices: List of OHLCV data with timestamps.
        
        Returns:
            Dictionary containing session metrics.
        """
        if not prices:
            return {}
        
        sessions = {
            "sydney": {"start": 22, "end": 7, "name": "Sydney"},
            "tokyo": {"start": 0, "end": 9, "name": "Tokyo"},
            "london": {"start": 8, "end": 17, "name": "London"},
            "newyork": {"start": 13, "end": 22, "name": "New York"}
        }
        
        session_data = {
            key: {
                "name": session["name"],
                "totalBars": 0,
                "bullishBars": 0,
                "bearishBars": 0,
                "totalRange": 0,
                "totalVolume": 0,
                "priceChange": 0,
                "firstPrice": None,
                "lastPrice": None
            } for key, session in sessions.items()
        }
        
        for price in prices:
            date = time.gmtime(price["timestamp"] / 1000)
            hour = date.tm_hour
            
            for key, session in sessions.items():
                in_session = (hour >= session["start"] and hour < session["end"]) if session["end"] > session["start"] else (
                    hour >= session["start"] or hour < session["end"])
                
                if in_session:
                    session = session_data[key]
                    session["totalBars"] += 1
                    if price["close"] > price["open"]:
                        session["bullishBars"] += 1
                    if price["close"] < price["open"]:
                        session["bearishBars"] += 1
                    session["totalRange"] += (price["high"] - price["low"]) / price["open"] * 100
                    session["totalVolume"] += price.get("volume", 0)
                    if session["firstPrice"] is None:
                        session["firstPrice"] = price["open"]
                    session["lastPrice"] = price["close"]
        
        results = {}
        for key, data in session_data.items():
            if data["totalBars"] > 0:
                results[key] = {
                    "name": data["name"],
                    "totalBars": data["totalBars"],
                    "bullishPercent": (data["bullishBars"] / data["totalBars"]) * 100,
                    "bearishPercent": (data["bearishBars"] / data["totalBars"]) * 100,
                    "avgRange": data["totalRange"] / data["totalBars"],
                    "totalVolume": data["totalVolume"],
                    "priceChange": ((data["lastPrice"] - data["firstPrice"]) / data["firstPrice"] * 100 
                                   if data["firstPrice"] is not None and data["lastPrice"] is not None else 0),
                    "strength": 0
                }
        
        ranges = [s["avgRange"] for s in results.values() if s["avgRange"]]
        volumes = [s["totalVolume"] for s in results.values() if s["totalVolume"]]
        
        min_range = min(ranges) if ranges else 0
        max_range = max(ranges) if ranges else 1
        range_diff = max_range - min_range or 1
        
        min_volume = min(volumes) if volumes else 0
        max_volume = max(volumes) if volumes else 1
        volume_diff = max_volume - min_volume or 1
        
        for key in results:
            session = results[key]
            range_score = ((session["avgRange"] - min_range) / range_diff) * 50
            volume_score = ((session["totalVolume"] - min_volume) / volume_diff) * 50
            session["strength"] = min(100, round(range_score + volume_score))
        
        return results

    def forex_correlation_matrix(self, price_data: Dict[str, List[float]], period: int = 20) -> Dict[str, Dict[str, float]]:
        """
        Calculate Forex Correlation Matrix.
        
        Args:
            price_data: Dictionary with pair names as keys and price lists as values.
            period: Lookback period for correlation (default: 20).
        
        Returns:
            Dictionary containing correlation matrix.
        """
        pairs = list(price_data.keys())
        matrix = {pair1: {pair2: 0 for pair2 in pairs} for pair1 in pairs}
        
        for i, pair1 in enumerate(pairs):
            prices1 = price_data[pair1]
            for j in range(i, len(pairs)):
                pair2 = pairs[j]
                prices2 = price_data[pair2]
                
                if pair1 == pair2:
                    matrix[pair1][pair2] = 1
                    continue
                
                returns1 = []
                returns2 = []
                for k in range(1, min(len(prices1), len(prices2), period)):
                    if prices1[k] and prices2[k] and prices1[k-1] and prices2[k-1]:
                        returns1.append((prices1[k] - prices1[k-1]) / prices1[k-1])
                        returns2.append((prices2[k] - prices2[k-1]) / prices2[k-1])
                
                correlation = self._calculate_correlation(returns1, returns2)
                matrix[pair1][pair2] = correlation
                matrix[pair2][pair1] = correlation
        
        return matrix

    def _calculate_correlation(self, x: List[float], y: List[float]) -> float:
        """
        Calculate correlation coefficient between two lists (private helper method).
        
        Args:
            x: First list of values.
            y: Second list of values.
        
        Returns:
            Correlation coefficient.
        """
        if len(x) != len(y) or not x:
            return 0
        
        n = len(x)
        sum_x = sum(x)
        sum_y = sum(y)
        sum_xy = sum(xi * yi for xi, yi in zip(x, y))
        sum_x2 = sum(xi * xi for xi in x)
        sum_y2 = sum(yi * yi for yi in y)
        
        numerator = sum_xy - (sum_x * sum_y / n)
        denominator = math.sqrt((sum_x2 - (sum_x * sum_x / n)) * (sum_y2 - (sum_y * sum_y / n)))
        
        return numerator / denominator if denominator != 0 else 0

    def currency_strength(self, currency_pairs: Dict[str, Dict[str, float]], base_currency: str) -> Dict[str, Any]:
        """
        Calculate Currency Strength.
        
        Args:
            currency_pairs: Dictionary with currency pairs and their price data.
            base_currency: Base currency to measure strength for (e.g., 'USD').
        
        Returns:
            Dictionary containing strength metrics and scores.
        """
        scores = {}
        currencies = set()
        
        for pair in currency_pairs.keys():
            pair_currencies = [pair[i:i+3] for i in range(0, len(pair), 3) if len(pair[i:i+3]) == 3]
            if len(pair_currencies) == 2:
                currencies.add(pair_currencies[0])
                currencies.add(pair_currencies[1])
        
        for currency in currencies:
            scores[currency] = {"strength": 0, "pairs": 0, "change24h": 0}
        
        for pair, data in currency_pairs.items():
            pair_currencies = [pair[i:i+3] for i in range(0, len(pair), 3) if len(pair[i:i+3]) == 3]
            if len(pair_currencies) != 2:
                continue
            from_curr, to_curr = pair_currencies
            price_change = data.get("change24h", 0)
            
            if from_curr == base_currency:
                scores[to_curr]["strength"] -= price_change
                scores[to_curr]["pairs"] += 1
            elif to_curr == base_currency:
                scores[from_curr]["strength"] += price_change
                scores[from_curr]["pairs"] += 1
            else:
                scores[from_curr]["strength"] += price_change / 2
                scores[to_curr]["strength"] -= price_change / 2
                scores[from_curr]["pairs"] += 1
                scores[to_curr]["pairs"] += 1
            
            scores[from_curr]["change24h"] += price_change
        
        for currency, data in scores.items():
            if data["pairs"] > 0:
                data["strength"] = round(data["strength"] / data["pairs"], 4)
                data["change24h"] = round(data["change24h"] / data["pairs"], 4)
        
        sorted_currencies = sorted(
            [{"currency": currency, **data} for currency, data in scores.items()],
            key=lambda x: x["strength"],
            reverse=True
        )
        
        return {
            "baseCurrency": base_currency,
            "timestamp": int(time.time() * 1000),
            "currencies": sorted_currencies
        }

    def forex_sentiment(self, prices: List[Dict[str, Any]], period: int = 14) -> Dict[str, Any]:
        """
        Analyze Forex Market Sentiment.
        
        Args:
            prices: List of OHLCV data.
            period: Analysis period (default: 14).
        
        Returns:
            Dictionary containing sentiment metrics.
        """
        if len(prices) < period:
            return {
                "bullish": 0,
                "bearish": 0,
                "ratio": 1,
                "sentiment": "neutral",
                "strength": 0
            }
        
        bullish = 0
        bearish = 0
        total_volume = 0
        
        for i in range(len(prices) - period, len(prices)):
            p = prices[i]
            change = (p["close"] - p["open"]) / p["open"] * 100
            total_volume += p.get("volume", 0)
            
            if p["close"] > p["open"]:
                bullish += p.get("volume", 0) * (1 + change / 100)
            else:
                bearish += p.get("volume", 0) * (1 - change / 100)
        
        ratio = bullish / bearish if bearish != 0 else 1
        strength = (bullish - bearish) / (bullish + bearish) * 100 if (bullish + bearish) != 0 else 0
        
        sentiment = "neutral"
        if ratio > 1.5:
            sentiment = "strong bullish"
        elif ratio > 1.1:
            sentiment = "bullish"
        elif ratio < 0.67:
            sentiment = "strong bearish"
        elif ratio < 0.9:
            sentiment = "bearish"
        
        return {
            "bullish": round(bullish, 2),
            "bearish": round(bearish, 2),
            "ratio": round(ratio, 2),
            "strength": round(strength, 2),
            "sentiment": sentiment,
            "period": period,
            "totalVolume": total_volume
        }

    def carry_trade(self, base_rate: float, quote_rate: float, price: float, period: int = 30) -> Dict[str, Any]:
        """
        Calculate Carry Trade Returns.
        
        Args:
            base_rate: Interest rate of base currency.
            quote_rate: Interest rate of quote currency.
            price: Current exchange rate.
            period: Holding period in days (default: 30).
        
        Returns:
            Dictionary containing carry trade metrics.
        """
        base_period_rate = base_rate * (period / 365) / 100
        quote_period_rate = quote_rate * (period / 365) / 100
        
        forward_rate = price * (1 + quote_period_rate) / (1 + base_period_rate)
        
        interest_gain = quote_period_rate - base_period_rate
        expected_price_change = (forward_rate - price) / price
        total_return = interest_gain + expected_price_change
        
        return {
            "baseRate": round(base_rate, 4),
            "quoteRate": round(quote_rate, 4),
            "currentRate": round(price, 6),
            "forwardRate": round(forward_rate, 6),
            "interestGain": round(interest_gain * 100, 4),
            "expectedPriceChange": round(expected_price_change * 100, 4),
            "totalReturn": round(total_return * 100, 4),
            "period": period,
            "timestamp": int(time.time() * 1000)
        }

    # ===========================================
    # MOMENTUM INDICATORS
    # ===========================================

    def rsi(self, prices: List[float], period: int = 14) -> List[float]:
        """
        Calculate Relative Strength Index (RSI).
        
        Args:
            prices: List of price values.
            period: Period for calculation (default: 14).
        
        Returns:
            List of RSI values (0 to 100).
        """
        if len(prices) < period + 1:
            return [None] * len(prices)
        
        changes = [0]
        gains = [0]
        losses = [0]
        
        for i in range(1, len(prices)):
            change = prices[i] - prices[i-1]
            changes.append(change)
            gains.append(change if change > 0 else 0)
            losses.append(-change if change < 0 else 0)
        
        avg_gain = sum(gains[1:period + 1]) / period
        avg_loss = sum(losses[1:period + 1]) / period
        
        rsi = [None] * period
        for i in range(period, len(prices)):
            if i > period:
                avg_gain = (avg_gain * (period - 1) + gains[i]) / period
                avg_loss = (avg_loss * (period - 1) + losses[i]) / period
            rs = 100 if avg_loss == 0 else avg_gain / avg_loss
            rsi.append(100 - (100 / (1 + rs)))
        
        return rsi

    def macd(self, prices: List[float], fast_period: int = 12, slow_period: int = 26, signal_period: int = 9) -> Dict[str, List[float]]:
        """
        Calculate Moving Average Convergence Divergence (MACD).
        
        Args:
            prices: List of price values.
            fast_period: Fast EMA period (default: 12).
            slow_period: Slow EMA period (default: 26).
            signal_period: Signal line period (default: 9).
        
        Returns:
            Dictionary with MACD, signal, and histogram lines.
        """
        fast_ema = self.ema(prices, fast_period)
        slow_ema = self.ema(prices, slow_period)
        
        macd_line = []
        offset = len(fast_ema) - len(slow_ema)
        for i in range(len(slow_ema)):
            if fast_ema[i + offset] is not None and slow_ema[i] is not None:
                macd_line.append(fast_ema[i + offset] - slow_ema[i])
            else:
                macd_line.append(None)
        
        signal_line = self.ema([x for x in macd_line if x is not None], signal_period)
        
        histogram = []
        signal_offset = len(macd_line) - len(signal_line)
        for i in range(len(signal_line)):
            if macd_line[i + signal_offset] is not None and signal_line[i] is not None:
                histogram.append(macd_line[i + signal_offset] - signal_line[i])
            else:
                histogram.append(None)
        
        prefix = [None] * (len(prices) - len(macd_line))
        return {
            "macd": prefix + macd_line,
            "signal": prefix + signal_line + [None] * (len(macd_line) - len(signal_line)),
            "histogram": prefix + histogram + [None] * (len(macd_line) - len(histogram))
        }

    def stochastic(self, highs: List[float], lows: List[float], closes: List[float], 
                  k_period: int = 14, k_slowing: int = 3, d_period: int = 3) -> Dict[str, List[float]]:
        """
        Calculate Stochastic Oscillator.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            k_period: %K period (default: 14).
            k_slowing: %K slowing (default: 3).
            d_period: %D period (default: 3).
        
        Returns:
            Dictionary with %K and %D values.
        """
        if len(highs) != len(lows) or len(highs) != len(closes):
            raise ValueError("Highs, lows, and closes lists must have the same length")
        
        k_values = []
        for i in range(k_period - 1, len(highs)):
            current_close = closes[i]
            highest_high = max(highs[i - k_period + 1:i + 1])
            lowest_low = min(lows[i - k_period + 1:i + 1])
            k = ((current_close - lowest_low) / (highest_high - lowest_low)) * 100 if highest_high != lowest_low else 0
            k_values.append(k)
        
        k_smoothed = self.sma(k_values, k_slowing)
        d_smoothed = self.sma(k_smoothed, d_period)
        
        prefix = [None] * (k_period - 1)
        return {
            "k": prefix + k_smoothed,
            "d": prefix + d_smoothed
        }

    def cci(self, highs: List[float], lows: List[float], closes: List[float], period: int = 20) -> List[float]:
        """
        Calculate Commodity Channel Index (CCI).
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            period: Period for calculation (default: 20).
        
        Returns:
            List of CCI values.
        """
        if len(highs) != len(lows) or len(highs) != len(closes):
            raise ValueError("Highs, lows, and closes lists must have the same length")
        
        if len(closes) < period:
            return [None] * len(closes)
        
        typical_prices = [(high + low + close) / 3 for high, low, close in zip(highs, lows, closes)]
        cci_values = []
        
        for i in range(period - 1, len(typical_prices)):
            period_tps = typical_prices[i - period + 1:i + 1]
            sma = sum(period_tps) / period
            mean_deviation = sum(abs(tp - sma) for tp in period_tps) / period
            cci = (typical_prices[i] - sma) / (0.015 * (mean_deviation or 1))
            cci_values.append(cci)
        
        return [None] * (period - 1) + cci_values

    # ===========================================
    # VOLATILITY INDICATORS
    # ===========================================

    def supertrend(self, highs: List[float], lows: List[float], closes: List[float], 
                  period: int = 10, multiplier: float = 3) -> Dict[str, List[float]]:
        """
        Calculate Supertrend.
        
        Args:
            highs: List of high prices.
            lows: List of low prices.
            closes: List of closing prices.
            period: Period for ATR calculation (default: 10).
            multiplier: ATR multiplier (default: 3).
        
        Returns:
            Dictionary containing Supertrend values and signals.
        """
        atr = self.atr(highs, lows, closes, period)
        
        result = {
            "trend": [None] * (period - 1),
            "direction": [None] * (period - 1),
            "upperBand": [None] * (period - 1),
            "lowerBand": [None] * (period - 1)
        }
        
        prev_upper = (highs[period-1] + lows[period-1]) / 2 + multiplier * atr[0]
        prev_lower = (highs[period-1] + lows[period-1]) / 2 - multiplier * atr[0]
        
        result["upperBand"].append(prev_upper)
        result["lowerBand"].append(prev_lower)
        result["trend"].append(1 if closes[period-1] > prev_upper else -1)
        result["direction"].append(result["trend"][-1])
        
        for i in range(period, len(highs)):
            current_atr = atr[i - period + 1]
            hl2 = (highs[i] + lows[i]) / 2
            
            basic_upper = hl2 + (multiplier * current_atr)
            basic_lower = hl2 - (multiplier * current_atr)
            
            if result["trend"][-1] == 1:
                upper = min(basic_upper, prev_upper)
                lower = basic_lower
            else:
                upper = basic_upper
                lower = max(basic_lower, prev_lower)
            
            if closes[i] > upper:
                trend = 1
                direction = 1
            elif closes[i] < lower:
                trend = -1
                direction = -1
            else:
                trend = result["trend"][-1]
                direction = 0
            
            prev_upper = upper
            prev_lower = lower
            
            result["upperBand"].append(upper)
            result["lowerBand"].append(lower)
            result["trend"].append(trend)
            result["direction"].append(direction)
        
        return result

    def calculate_all_indicators(self, data: Dict[str, List[float]], config: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Calculate multiple indicators at once for efficiency.
        
        Args:
            data: Dictionary containing OHLCV data.
            config: Configuration for indicators.
        
        Returns:
            Dictionary containing all calculated indicators.
        """
        if config is None:
            config = {}
        opens = data.get("opens", [])
        highs = data.get("highs", [])
        lows = data.get("lows", [])
        closes = data.get("closes", [])
        volumes = data.get("volumes", [])
        
        result = {}
        
        if config.get("sma"):
            result["sma"] = {period: self.sma(closes, period) for period in config["sma"]}
        
        if config.get("ema"):
            result["ema"] = {period: self.ema(closes, period) for period in config["ema"]}
        
        if config.get("atr"):
            result["atr"] = self.atr(highs, lows, closes, config["atr"].get("period", 14))
        
        if config.get("supertrend"):
            result["supertrend"] = self.supertrend(
                highs,
                lows,
                closes,
                config["supertrend"].get("period", 10),
                config["supertrend"].get("multiplier", 3)
            )
        
        if config.get("ichimoku"):
            result["ichimoku"] = self.ichimoku(
                highs,
                lows,
                config["ichimoku"].get("periods", {
                    "conversion": 9,
                    "base": 26,
                    "spanB": 52,
                    "lagging": 26,
                    "displacement": 26
                })
            )
        
        return result