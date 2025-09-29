import React from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import HapticFeedback from 'react-native-haptic-feedback';

interface ButtonProps {
  title: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'success';
  size?: 'small' | 'medium' | 'large';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  textStyle?: TextStyle;
  haptic?: boolean;
}

const Button: React.FC<ButtonProps> = ({
  title,
  onPress,
  variant = 'primary',
  size = 'medium',
  loading = false,
  disabled = false,
  style,
  textStyle,
  haptic = true,
}) => {
  const handlePress = () => {
    if (loading || disabled) return;
    
    if (haptic) {
      HapticFeedback.trigger('impactLight');
    }
    
    onPress();
  };

  const getButtonStyle = () => {
    const baseStyle = [styles.button, styles[size]];
    
    if (disabled || loading) {
      baseStyle.push(styles.disabled);
    }
    
    if (style) {
      baseStyle.push(style);
    }
    
    return baseStyle;
  };

  const getTextStyle = () => {
    const baseStyle = [styles.text, styles[`${size}Text`], styles[`${variant}Text`]];
    
    if (disabled || loading) {
      baseStyle.push(styles.disabledText);
    }
    
    if (textStyle) {
      baseStyle.push(textStyle);
    }
    
    return baseStyle;
  };

  const getGradientColors = () => {
    switch (variant) {
      case 'primary':
        return ['#4facfe', '#00f2fe'];
      case 'secondary':
        return ['#667eea', '#764ba2'];
      case 'danger':
        return ['#ff6b6b', '#ee5a52'];
      case 'success':
        return ['#56ab2f', '#a8e6cf'];
      default:
        return ['#4facfe', '#00f2fe'];
    }
  };

  if (variant === 'outline') {
    return (
      <TouchableOpacity
        style={[getButtonStyle(), styles.outline]}
        onPress={handlePress}
        activeOpacity={0.7}
        disabled={disabled || loading}
      >
        {loading ? (
          <ActivityIndicator color="#4facfe" size="small" />
        ) : (
          <Text style={getTextStyle()}>{title}</Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <TouchableOpacity
      style={getButtonStyle()}
      onPress={handlePress}
      activeOpacity={0.8}
      disabled={disabled || loading}
    >
      <LinearGradient
        colors={getGradientColors()}
        style={styles.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
      >
        {loading ? (
          <ActivityIndicator color="#ffffff" size="small" />
        ) : (
          <Text style={getTextStyle()}>{title}</Text>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  outline: {
    borderWidth: 2,
    borderColor: '#4facfe',
    backgroundColor: 'transparent',
    elevation: 0,
    shadowOpacity: 0,
  },
  
  // Sizes
  small: {
    height: 36,
    minWidth: 80,
  },
  medium: {
    height: 48,
    minWidth: 120,
  },
  large: {
    height: 56,
    minWidth: 160,
  },
  
  // Text styles
  text: {
    fontWeight: '600',
    textAlign: 'center',
  },
  smallText: {
    fontSize: 14,
  },
  mediumText: {
    fontSize: 16,
  },
  largeText: {
    fontSize: 18,
  },
  
  // Variant text colors
  primaryText: {
    color: '#ffffff',
  },
  secondaryText: {
    color: '#ffffff',
  },
  outlineText: {
    color: '#4facfe',
  },
  dangerText: {
    color: '#ffffff',
  },
  successText: {
    color: '#ffffff',
  },
  
  // Disabled states
  disabled: {
    opacity: 0.6,
  },
  disabledText: {
    opacity: 0.7,
  },
});

export default Button;
