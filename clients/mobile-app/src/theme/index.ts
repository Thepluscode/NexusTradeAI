import { Dimensions } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Colors - Robinhood inspired
export const colors = {
  // Primary colors
  primary: '#00C805', // Robinhood green
  primaryDark: '#00A004',
  primaryLight: '#4DD865',
  
  // Secondary colors
  secondary: '#FF6B35',
  secondaryDark: '#E55A2B',
  secondaryLight: '#FF8A5B',
  
  // Status colors
  success: '#00C805',
  error: '#FF6B35',
  warning: '#FFB800',
  info: '#007AFF',
  
  // Trading colors
  bullish: '#00C805',
  bearish: '#FF6B35',
  
  // Neutral colors
  background: '#FFFFFF',
  backgroundSecondary: '#F8F9FA',
  backgroundTertiary: '#F1F3F4',
  
  // Dark mode
  backgroundDark: '#0D1421',
  backgroundSecondaryDark: '#1A1F2E',
  backgroundTertiaryDark: '#252A3A',
  
  // Text colors
  textPrimary: '#1D2129',
  textSecondary: '#65676B',
  textTertiary: '#8A8D91',
  textInverse: '#FFFFFF',
  
  // Dark mode text
  textPrimaryDark: '#E4E6EA',
  textSecondaryDark: '#B0B3B8',
  textTertiaryDark: '#8A8D91',
  
  // Border colors
  border: '#E4E6EA',
  borderSecondary: '#CED0D4',
  borderDark: '#3A3B3C',
  borderSecondaryDark: '#4E4F50',
  
  // Card colors
  card: '#FFFFFF',
  cardDark: '#242526',
  
  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(0, 0, 0, 0.3)',
  
  // Transparent
  transparent: 'transparent',
};

// Typography
export const typography = {
  // Font families
  fontFamily: {
    regular: 'System',
    medium: 'System',
    semiBold: 'System',
    bold: 'System',
  },
  
  // Font sizes
  fontSize: {
    xs: 12,
    sm: 14,
    base: 16,
    lg: 18,
    xl: 20,
    '2xl': 24,
    '3xl': 30,
    '4xl': 36,
    '5xl': 48,
  },
  
  // Font weights
  fontWeight: {
    normal: '400' as const,
    medium: '500' as const,
    semiBold: '600' as const,
    bold: '700' as const,
  },
  
  // Line heights
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
};

// Spacing
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  '2xl': 48,
  '3xl': 64,
};

// Border radius
export const borderRadius = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 24,
  full: 9999,
};

// Shadows
export const shadows = {
  sm: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.18,
    shadowRadius: 1.0,
    elevation: 1,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.23,
    shadowRadius: 2.62,
    elevation: 4,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.30,
    shadowRadius: 4.65,
    elevation: 8,
  },
  xl: {
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.37,
    shadowRadius: 7.49,
    elevation: 12,
  },
};

// Layout
export const layout = {
  screenWidth,
  screenHeight,
  isSmallDevice: screenWidth < 375,
  isLargeDevice: screenWidth >= 414,
  headerHeight: 60,
  tabBarHeight: 65,
  statusBarHeight: 44, // iOS default
};

// Animation
export const animation = {
  duration: {
    fast: 150,
    normal: 300,
    slow: 500,
  },
  easing: {
    ease: 'ease',
    easeIn: 'ease-in',
    easeOut: 'ease-out',
    easeInOut: 'ease-in-out',
  },
};

// Z-index
export const zIndex = {
  hide: -1,
  auto: 'auto',
  base: 0,
  docked: 10,
  dropdown: 1000,
  sticky: 1100,
  banner: 1200,
  overlay: 1300,
  modal: 1400,
  popover: 1500,
  skipLink: 1600,
  toast: 1700,
  tooltip: 1800,
};

// Breakpoints
export const breakpoints = {
  sm: 480,
  md: 768,
  lg: 992,
  xl: 1200,
};

// Component specific styles
export const components = {
  button: {
    height: {
      sm: 36,
      md: 44,
      lg: 52,
    },
    borderRadius: borderRadius.lg,
  },
  input: {
    height: 44,
    borderRadius: borderRadius.md,
    borderWidth: 1,
  },
  card: {
    borderRadius: borderRadius.xl,
    padding: spacing.md,
  },
};

// Export default theme
export const theme = {
  colors,
  typography,
  spacing,
  borderRadius,
  shadows,
  layout,
  animation,
  zIndex,
  breakpoints,
  components,
};

export default theme;
