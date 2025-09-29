import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Platform } from 'react-native';
import Icon from 'react-native-vector-icons/Ionicons';

// Import screens
import DashboardScreen from '../screens/main/DashboardScreen';
import MarketsScreen from '../screens/main/MarketsScreen';
import TradingScreen from '../screens/main/TradingScreen';
import PortfolioScreen from '../screens/main/PortfolioScreen';
import ProfileScreen from '../screens/main/ProfileScreen';

// Import theme
import { colors, spacing } from '../theme';

// Types
export type MainTabParamList = {
  Dashboard: undefined;
  Markets: undefined;
  Trading: undefined;
  Portfolio: undefined;
  Profile: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();

const MainTabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      initialRouteName="Dashboard"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName: string;

          switch (route.name) {
            case 'Dashboard':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Markets':
              iconName = focused ? 'trending-up' : 'trending-up-outline';
              break;
            case 'Trading':
              iconName = focused ? 'swap-horizontal' : 'swap-horizontal-outline';
              break;
            case 'Portfolio':
              iconName = focused ? 'pie-chart' : 'pie-chart-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
            default:
              iconName = 'help-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingBottom: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
          paddingTop: spacing.xs,
          height: Platform.OS === 'ios' ? 85 : 65,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: '500',
          marginTop: 2,
        },
        tabBarItemStyle: {
          paddingVertical: spacing.xs,
        },
      })}
    >
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{
          tabBarLabel: 'Home',
        }}
      />
      <Tab.Screen
        name="Markets"
        component={MarketsScreen}
        options={{
          tabBarLabel: 'Markets',
        }}
      />
      <Tab.Screen
        name="Trading"
        component={TradingScreen}
        options={{
          tabBarLabel: 'Trade',
        }}
      />
      <Tab.Screen
        name="Portfolio"
        component={PortfolioScreen}
        options={{
          tabBarLabel: 'Portfolio',
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: 'Profile',
        }}
      />
    </Tab.Navigator>
  );
};

export default MainTabNavigator;
