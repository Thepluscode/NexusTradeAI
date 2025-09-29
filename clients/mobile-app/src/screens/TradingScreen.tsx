//clients/mobile-app/src/screens/TradingScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  Dimensions
} from 'react-native';
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  Activity,
  Search,
  Plus,
  Filter,
  BarChart3
} from 'lucide-react-native';
import { LineChart } from 'react-native-chart-kit';

const { width } = Dimensions.get('window');

interface MarketItem {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  market: string;
}

const TradingScreen: React.FC = () => {
  const [selectedMarket, setSelectedMarket] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [marketData, setMarketData] = useState<MarketItem[]>([
    { symbol: 'AAPL', price: 175.84, change: 2.45, changePercent: 1.41, volume: 52840000, market: 'NASDAQ' },
    { symbol: 'BTC/USD', price: 43250.00, change: -1205.50, changePercent: -2.71, volume: 28500000, market: 'Crypto' },
    { symbol: 'EUR/USD', price: 1.0875, change: 0.0012, changePercent: 0.11, volume: 125000000, market: 'Forex' },
    { symbol: 'GOLD', price: 2035.40, change: 15.80, changePercent: 0.78, volume: 8920000, market: 'Commodity' }
  ]);

  const markets = ['all', 'stocks', 'crypto', 'forex', 'commodities'];
  
  const chartData = {
    labels: ['1h', '4h', '1d', '1w', '1m'],
    datasets: [{
      data: [175.20, 174.80, 175.84, 173.50, 171.20],
      color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
      strokeWidth: 2
    }]
  };

  const filteredData = marketData.filter(item =>
    item.symbol.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleTradePress = (symbol: string) => {
    Alert.alert(
      'Trade Options',
      `Select action for ${symbol}`,
      [
        { text: 'Buy', onPress: () => handleTrade(symbol, 'buy') },
        { text: 'Sell', onPress: () => handleTrade(symbol, 'sell') },
        { text: 'Chart', onPress: () => handleViewChart(symbol) },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const handleTrade = (symbol: string, action: 'buy' | 'sell') => {
    // Navigate to order entry screen
    console.log(`${action} ${symbol}`);
  };

  const handleViewChart = (symbol: string) => {
    // Navigate to chart screen
    console.log(`View chart for ${symbol}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Trading</Text>
        <TouchableOpacity style={styles.filterButton}>
          <Filter size={20} color="#94a3b8" />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={20} color="#94a3b8" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search symbols..."
          placeholderTextColor="#94a3b8"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Market Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.marketFilter}
        contentContainerStyle={styles.marketFilterContent}
      >
        {markets.map((market) => (
          <TouchableOpacity
            key={market}
            style={[
              styles.marketButton,
              selectedMarket === market && styles.marketButtonActive
            ]}
            onPress={() => setSelectedMarket(market)}
          >
            <Text style={[
              styles.marketButtonText,
              selectedMarket === market && styles.marketButtonTextActive
            ]}>
              {market.charAt(0).toUpperCase() + market.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Chart */}
        <View style={styles.chartCard}>
          <View style={styles.chartHeader}>
            <Text style={styles.chartTitle}>AAPL - $175.84</Text>
            <View style={styles.priceChange}>
              <TrendingUp size={16} color="#10b981" />
              <Text style={styles.priceChangeText}>+1.41%</Text>
            </View>
          </View>
          <LineChart
            data={chartData}
            width={width - 40}
            height={200}
            chartConfig={{
              backgroundColor: '#1e293b',
              backgroundGradientFrom: '#1e293b',
              backgroundGradientTo: '#1e293b',
              decimalPlaces: 2,
              color: (opacity = 1) => `rgba(59, 130, 246, ${opacity})`,
              labelColor: (opacity = 1) => `rgba(148, 163, 184, ${opacity})`,
              style: { borderRadius: 16 },
              propsForDots: {
                r: '4',
                strokeWidth: '2',
                stroke: '#3b82f6'
              }
            }}
            bezier
            style={styles.chart}
          />
        </View>

        {/* Market Data List */}
        <View style={styles.marketList}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Market Data</Text>
            <TouchableOpacity style={styles.addButton}>
              <Plus size={16} color="#3b82f6" />
              <Text style={styles.addButtonText}>Watchlist</Text>
            </TouchableOpacity>
          </View>

          {filteredData.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.marketItem}
              onPress={() => handleTradePress(item.symbol)}
            >
              <View style={styles.marketItemLeft}>
                <Text style={styles.symbol}>{item.symbol}</Text>
                <Text style={styles.market}>{item.market}</Text>
              </View>
              
              <View style={styles.marketItemCenter}>
                <LineChart
                  data={{
                    labels: [],
                    datasets: [{
                      data: [1, 1.2, 0.8, 1.5, 1.3, 1.1]
                    }]
                  }}
                  width={60}
                  height={30}
                  chartConfig={{
                    color: () => item.changePercent >= 0 ? '#10b981' : '#ef4444',
                    strokeWidth: 1.5
                  }}
                  withDots={false}
                  withInnerLines={false}
                  withOuterLines={false}
                  withYAxisLabel={false}
                  withXAxisLabel={false}
                  style={{ paddingRight: 0 }}
                />
              </View>

              <View style={styles.marketItemRight}>
                <Text style={styles.price}>${item.price.toFixed(2)}</Text>
                <View style={styles.change}>
                  {item.changePercent >= 0 ? (
                    <TrendingUp size={12} color="#10b981" />
                  ) : (
                    <TrendingDown size={12} color="#ef4444" />
                  )}
                  <Text style={[
                    styles.changeText,
                    { color: item.changePercent >= 0 ? '#10b981' : '#ef4444' }
                  ]}>
                    {item.changePercent.toFixed(2)}%
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick Actions */}
        <View style={styles.quickActions}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>
          <View style={styles.actionGrid}>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#10b98120' }]}>
              <TrendingUp size={24} color="#10b981" />
              <Text style={styles.actionText}>Buy Order</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#ef444420' }]}>
              <TrendingDown size={24} color="#ef4444" />
              <Text style={styles.actionText}>Sell Order</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#3b82f620' }]}>
              <BarChart3 size={24} color="#3b82f6" />
              <Text style={styles.actionText}>Analysis</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionButton, { backgroundColor: '#f59e0b20' }]}>
              <Activity size={24} color="#f59e0b" />
              <Text style={styles.actionText}>Alerts</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
    paddingTop: 50
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 20
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  filterButton: {
    padding: 8
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    marginHorizontal: 20,
    marginBottom: 20,
    borderRadius: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#334155'
  },
  searchIcon: {
    marginRight: 12
  },
  searchInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 16,
    paddingVertical: 12
  },
  marketFilter: {
    marginBottom: 20
  },
  marketFilterContent: {
    paddingHorizontal: 20
  },
  marketButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#1e293b',
    borderRadius: 20,
    marginRight: 12,
    borderWidth: 1,
    borderColor: '#334155'
  },
  marketButtonActive: {
    backgroundColor: '#3b82f6'
  },
  marketButtonText: {
    color: '#94a3b8',
    fontSize: 14,
    fontWeight: '500'
  },
  marketButtonTextActive: {
    color: '#ffffff'
  },
  content: {
    flex: 1,
    paddingHorizontal: 20
  },
  chartCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#334155'
  },
  chartHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  priceChange: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  priceChangeText: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4
  },
  chart: {
    borderRadius: 16
  },
  marketList: {
    marginBottom: 20
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3b82f620',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20
  },
  addButtonText: {
    color: '#3b82f6',
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4
  },
  marketItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155'
  },
  marketItemLeft: {
    flex: 1
  },
  symbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  market: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2
  },
  marketItemCenter: {
    marginHorizontal: 16
  },
  marketItemRight: {
    alignItems: 'flex-end'
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff'
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2
  },
  changeText: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4
  },
  quickActions: {
    marginBottom: 20
  },
  actionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between'
  },
  actionButton: {
    width: (width - 60) / 2,
    aspectRatio: 1.5,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)'
  },
  actionText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8
  }
});

export default TradingScreen;