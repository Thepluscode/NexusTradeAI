import React from 'react';
import {
  View,
  StyleSheet,
  ViewStyle,
  TouchableOpacity,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface CardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  variant?: 'default' | 'elevated' | 'outlined' | 'gradient';
  padding?: 'none' | 'small' | 'medium' | 'large';
  onPress?: () => void;
  gradientColors?: string[];
}

const Card: React.FC<CardProps> = ({
  children,
  style,
  variant = 'default',
  padding = 'medium',
  onPress,
  gradientColors = ['#4facfe', '#00f2fe'],
}) => {
  const getCardStyle = () => {
    const baseStyle = [styles.card, styles[padding]];
    
    switch (variant) {
      case 'elevated':
        baseStyle.push(styles.elevated);
        break;
      case 'outlined':
        baseStyle.push(styles.outlined);
        break;
      case 'gradient':
        baseStyle.push(styles.gradient);
        break;
      default:
        baseStyle.push(styles.default);
    }
    
    if (style) {
      baseStyle.push(style);
    }
    
    return baseStyle;
  };

  const CardContent = () => (
    <View style={getCardStyle()}>
      {children}
    </View>
  );

  const GradientCard = () => (
    <LinearGradient
      colors={gradientColors}
      style={[getCardStyle(), { padding: 0 }]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
    >
      <View style={[styles[padding], { backgroundColor: 'transparent' }]}>
        {children}
      </View>
    </LinearGradient>
  );

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.8}>
        {variant === 'gradient' ? <GradientCard /> : <CardContent />}
      </TouchableOpacity>
    );
  }

  return variant === 'gradient' ? <GradientCard /> : <CardContent />;
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  
  // Variants
  default: {
    backgroundColor: '#ffffff',
  },
  elevated: {
    backgroundColor: '#ffffff',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  outlined: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e1e1e1',
  },
  gradient: {
    backgroundColor: 'transparent',
  },
  
  // Padding variants
  none: {
    padding: 0,
  },
  small: {
    padding: 12,
  },
  medium: {
    padding: 16,
  },
  large: {
    padding: 24,
  },
});

export default Card;
