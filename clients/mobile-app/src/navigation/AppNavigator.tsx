//clients/mobile-app/src/navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { createDrawerNavigator } from '@react-navigation/drawer';
import {
  Home,
  TrendingUp,
  Brain,
  Settings,
  User,
  Activity,
  BarChart3,
  Shield
} from 'lucide-react-native';

// Screens
import DashboardScreen from '../screens/DashboardScreen';
import TradingScreen from '../screens/TradingScreen';
import PortfolioScreen from '../screens/PortfolioScreen';
import AIInsightsScreen from '../screens/AIInsightsScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ProfileScreen from '../screens/ProfileScreen';
import OrderEntryScreen from '../screens/OrderEntryScreen';
import ChartScreen from '../screens/ChartScreen';
import WatchlistScreen from '../screens/WatchlistScreen';
import NewsScreen from '../screens/NewsScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import SignupScreen from '../screens/auth/SignupScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();
const Drawer = createDrawerNavigator();

const TabNavigator = () => (
  <Tab.Navigator
    screenOptions={{
      headerShown: false,
      tabBarStyle: {
        backgroundColor: '#1e293b',
        borderTopColor: '#334155',
        borderTopWidth: 1,
        height: 80,
        paddingBottom: 20,
        paddingTop: 10
      },
      tabBarActiveTintColor: '#3b82f6',
      tabBarInactiveTintColor: '#94a3b8',
      tabBarLabelStyle: {
        fontSize: 12,
        fontWeight: '600'
      }
    }}
  >
    <Tab.Screen
      name="Dashboard"
      component={DashboardScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Home size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Trading"
      component={TradingScreen}
      options={{
        tabBarIcon: ({ color, size }) => <TrendingUp size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Portfolio"
      component={PortfolioScreen}
      options={{
        tabBarIcon: ({ color, size }) => <BarChart3 size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="AI Insights"
      component={AIInsightsScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Brain size={size} color={color} />
      }}
    />
    <Tab.Screen
      name="Settings"
      component={SettingsScreen}
      options={{
        tabBarIcon: ({ color, size }) => <Settings size={size} color={color} />
      }}
    />
  </Tab.Navigator>
);

const MainStackNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#0f172a' }
    }}
  >
    <Stack.Screen name="MainTabs" component={TabNavigator} />
    <Stack.Screen name="OrderEntry" component={OrderEntryScreen} />
    <Stack.Screen name="Chart" component={ChartScreen} />
    <Stack.Screen name="Watchlist" component={WatchlistScreen} />
    <Stack.Screen name="News" component={NewsScreen} />
    <Stack.Screen name="Profile" component={ProfileScreen} />
  </Stack.Navigator>
);

const AuthStackNavigator = () => (
  <Stack.Navigator
    screenOptions={{
      headerShown: false,
      cardStyle: { backgroundColor: '#0f172a' }
    }}
  >
    <Stack.Screen name="Login" component={LoginScreen} />
    <Stack.Screen name="Signup" component={SignupScreen} />
  </Stack.Navigator>
);

const AppNavigator: React.FC<{ isAuthenticated: boolean }> = ({ isAuthenticated }) => (
  <NavigationContainer>
    {isAuthenticated ? <MainStackNavigator /> : <AuthStackNavigator />}
  </NavigationContainer>
);

export default AppNavigator;