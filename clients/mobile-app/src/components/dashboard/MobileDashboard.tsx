//clients/mobile-app/src/components/Dashboard/MobileDashboard.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  Text,
  SafeAreaView
} from 'react-native';
import { 
  TrendingUp, 
  TrendingDown, 
  Eye, 
  EyeOff, 
  Bell,
  Search,
  Plus,
  Activity,
  Brain,
  Shield
} from 'lucide-react-native';

const { width } = Dimensions.get('window');

interface MobileDashboardProps {
  portfolio: any;
  marketData: any[];
  aiInsights: any[];
}

const MobileDashboard: React.FC<MobileDashboardProps> = ({
  portfolio,
  marketData,
  aiInsights
}) => {
  const [refreshing, setRefreshing] = useState(false);
  const [showBalance, setShowBalance] = useState(true);
  const [selectedTab, setSelectedTab] = useState('overview');

  const onRefresh = () => {
    setRefreshing(true);
    // Simulate API call
    setTimeout(() => setRefreshing(false), 2000);
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.logo}>
            <Brain size={20} color="#ffffff" />
          </View>
          <Text style={styles.logoText}>Nexus Trade</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity style={styles.headerButton}>
            <Search size={20} color="#94a3b8" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.headerButton}>
            <Bell size={20} color="#94a3b8" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Portfolio Overview */}
        <View style={styles.portfolioCard}>
          <View style={styles.portfolioHeader}>
            <Text style={styles.portfolioTitle}>Portfolio Value</Text>
            <TouchableOpacity onPress={() => setShowBalance(!showBalance)}>
              {showBalance ? (
                <Eye size={20} color="#94a3b8" />
              ) : (
                <EyeOff size={20} color="#94a3b8" />
              )}
            </TouchableOpacity>
          </View>
          
          <Text style={styles.portfolioValue}>
            {showBalance ? `$${portfolio.totalValue.toLocaleString()}` : '••••••'}
          </Text>
          
          <View style={styles.portfolioChange}>
            {portfolio.dayChangePercent >= 0 ? (
              <TrendingUp size={16} color="#10b981" />
            ) : (
              <TrendingDown size={16} color="#ef4444" />
            )}
            <Text style={[
              styles.changeText,
              { color: portfolio.dayChangePercent >= 0 ? '#10b981' : '#ef4444' }
            ]}>
              {showBalance ? `$${portfolio.dayChange.toLocaleString()}` : '••••'} 
              ({portfolio.dayChangePercent.toFixed(2)}%)
            </Text>
          </View>
        </View>

        {/* Quick Stats */}
        <View style={styles.statsGrid}>
          <StatCard
            title="Available Cash"
            value={showBalance ? `$${(125000).toLocaleString()}` : '••••••'}
            icon={<Activity size={16} color="#10b981" />}
            color="#10b981"
          />
          <StatCard
            title="Active Positions"
            value={portfolio.positions.length.toString()}
            icon={<TrendingUp size={16} color="#3b82f6" />}
            color="#3b82f6"
          />
          <StatCard
            title="AI Score"
            value="8.7"
            icon={<Brain size={16} color="#f59e0b" />}
            color="#f59e0b"
          />
          <StatCard
            title="Risk Level"
            value="Low"
            icon={<Shield size={16} color="#10b981" />}
            color="#10b981"
          />
        </View>

        {/* Tab Navigation */}
        <View style={styles.tabContainer}>
          {['overview', 'positions', 'watchlist', 'ai'].map((tab) => (
            <TouchableOpacity
              key={tab}
              onPress={() => setSelectedTab(tab)}
              style={[
                styles.tab,
                selectedTab === tab && styles.activeTab
              ]}
            >
              <Text style={[
                styles.tabText,
                selectedTab === tab && styles.activeTabText
              ]}>
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Tab Content */}
        {selectedTab === 'overview' && (
          <OverviewTab marketData={marketData} />
        )}
        {selectedTab === 'positions' && (
          <PositionsTab positions={portfolio.positions} showBalance={showBalance} />
        )}
        {selectedTab === 'watchlist' && (
          <WatchlistTab marketData={marketData} />
        )}
        {selectedTab === 'ai' && (
          <AITab insights={aiInsights} />
        )}
      </ScrollView>

      {/* Floating Action Button */}
      <TouchableOpacity style={styles.fab}>
        <Plus size={24} color="#ffffff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const StatCard: React.FC<{
  title: string;
  value: string;
  icon: React.ReactNode;
  color: string;
}> = ({ title, value, icon, color }) => (
  <View style={styles.statCard}>
    <View style={styles.statHeader}>
      <Text style={styles.statTitle}>{title}</Text>
      {icon}
    </View>
    <Text style={[styles.statValue, { color }]}>{value}</Text>
  </View>
);

const OverviewTab: React.FC<{ marketData: any[] }> = ({ marketData }) => (
  <View style={styles.tabContent}>
    <Text style={styles.sectionTitle}>Market Movers</Text>
    {marketData.slice(0, 5).map((item, index) => (
      <MarketDataRow key={index} data={item} />
    ))}
  </View>
);

const PositionsTab: React.FC<{ positions: any[]; showBalance: boolean }> = ({ 
  positions, 
  showBalance 
}) => (
  <View style={styles.tabContent}>
    <Text style={styles.sectionTitle}>Your Positions</Text>
    {positions.map((position, index) => (
      <PositionRow key={index} position={position} showBalance={showBalance} />
    ))}
  </View>
);

const WatchlistTab: React.FC<{ marketData: any[] }> = ({ marketData }) => (
  <View style={styles.tabContent}>
    <Text style={styles.sectionTitle}>Watchlist</Text>
    {marketData.map((item, index) => (
      <MarketDataRow key={index} data={item} />
    ))}
  </View>
);

const AITab: React.FC<{ insights: any[] }> = ({ insights }) => (
  <View style={styles.tabContent}>
    <Text style={styles.sectionTitle}>AI Insights</Text>
    {insights.map((insight, index) => (
      <AIInsightCard key={index} insight={insight} />
    ))}
  </View>
);

const MarketDataRow: React.FC<{ data: any }> = ({ data }) => (
  <View style={styles.dataRow}>
    <View style={styles.dataLeft}>
      <Text style={styles.symbol}>{data.symbol}</Text>
      <Text style={styles.market}>{data.market}</Text>
    </View>
    <View style={styles.dataRight}>
      <Text style={styles.price}>${data.price.toFixed(2)}</Text>
      <View style={styles.change}>
        {data.changePercent >= 0 ? (
          <TrendingUp size={12} color="#10b981" />
        ) : (
          <TrendingDown size={12} color="#ef4444" />
        )}
        <Text style={[
          styles.changePercent,
          { color: data.changePercent >= 0 ? '#10b981' : '#ef4444' }
        ]}>
          {data.changePercent.toFixed(2)}%
        </Text>
      </View>
    </View>
  </View>
);

const PositionRow: React.FC<{ position: any; showBalance: boolean }> = ({ 
  position, 
  showBalance 
}) => (
  <View style={styles.dataRow}>
    <View style={styles.dataLeft}>
      <Text style={styles.symbol}>{position.symbol}</Text>
      <Text style={styles.market}>{position.quantity} shares</Text>
    </View>
    <View style={styles.dataRight}>
      <Text style={styles.price}>
        {showBalance ? `$${position.currentPrice.toFixed(2)}` : '••••'}
      </Text>
      <Text style={[
        styles.pnl,
        { color: position.unrealizedPnL >= 0 ? '#10b981' : '#ef4444' }
      ]}>
        {showBalance ? 
          `${position.unrealizedPnL >= 0 ? '+' : ''}$${position.unrealizedPnL.toFixed(2)}` : 
          '••••'
        }
      </Text>
    </View>
  </View>
);

const AIInsightCard: React.FC<{ insight: any }> = ({ insight }) => (
  <View style={styles.insightCard}>
    <View style={styles.insightHeader}>
      <Text style={styles.insightSymbol}>{insight.symbol}</Text>
      <View style={[
        styles.insightType,
        { 
          backgroundColor: insight.type === 'bullish' ? '#10b98120' : 
                           insight.type === 'bearish' ? '#ef444420' : '#94a3b820'
        }
      ]}>
        <Text style={[
          styles.insightTypeText,
          { 
            color: insight.type === 'bullish' ? '#10b981' : 
                   insight.type === 'bearish' ? '#ef4444' : '#94a3b8'
          }
        ]}>
          {insight.type.toUpperCase()}
        </Text>
      </View>
    </View>
    <Text style={styles.insightDescription}>{insight.description}</Text>
    <View style={styles.insightFooter}>
      <Text style={styles.insightConfidence}>
        Confidence: {insight.confidence}%
      </Text>
      <Text style={styles.insightTimeframe}>{insight.timeframe}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    width: 32,
    height: 32,
    backgroundColor: '#3b82f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  logoText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerButton: {
    padding: 8,
    marginLeft: 8,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  portfolioCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 20,
    marginVertical: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  portfolioHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  portfolioTitle: {
    fontSize: 16,
    color: '#94a3b8',
  },
  portfolioValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  portfolioChange: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  changeText: {
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  statCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    width: (width - 60) / 2,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  statTitle: {
    fontSize: 12,
    color: '#94a3b8',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  activeTab: {
    backgroundColor: '#3b82f6',
  },
  tabText: {
    fontSize: 14,
    color: '#94a3b8',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#ffffff',
  },
  tabContent: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 16,
  },
  dataRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  dataLeft: {
    flex: 1,
  },
  symbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  market: {
    fontSize: 12,
    color: '#94a3b8',
    marginTop: 2,
  },
  dataRight: {
    alignItems: 'flex-end',
  },
  price: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  change: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  changePercent: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4,
  },
  pnl: {
    fontSize: 12,
    fontWeight: '600',
    marginTop: 2,
  },
  insightCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#334155',
  },
  insightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  insightSymbol: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  insightType: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  insightTypeText: {
    fontSize: 10,
    fontWeight: 'bold',
  },
  insightDescription: {
    fontSize: 14,
    color: '#e2e8f0',
    marginBottom: 8,
  },
  insightFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  insightConfidence: {
    fontSize: 12,
    color: '#94a3b8',
  },
  insightTimeframe: {
    fontSize: 12,
    color: '#94a3b8',
  },
  fab: {
    position: 'absolute',
    bottom: 30,
    right: 20,
    width: 56,
    height: 56,
    backgroundColor: '#3b82f6',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});

export default MobileDashboard;