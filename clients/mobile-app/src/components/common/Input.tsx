import React, { useState, useRef } from 'react';
import {
  View,
  TextInput,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity,
  TextInputProps,
} from 'react-native';
import Icon from 'react-native-vector-icons/Feather';

interface InputProps extends TextInputProps {
  label?: string;
  error?: string;
  leftIcon?: string;
  rightIcon?: string;
  onRightIconPress?: () => void;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'small' | 'medium' | 'large';
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  leftIcon,
  rightIcon,
  onRightIconPress,
  variant = 'outlined',
  size = 'medium',
  style,
  ...props
}) => {
  const [isFocused, setIsFocused] = useState(false);
  const animatedValue = useRef(new Animated.Value(0)).current;
  const borderColorAnim = useRef(new Animated.Value(0)).current;

  const handleFocus = () => {
    setIsFocused(true);
    Animated.parallel([
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
      Animated.timing(borderColorAnim, {
        toValue: 1,
        duration: 200,
        useNativeDriver: false,
      }),
    ]).start();
  };

  const handleBlur = () => {
    setIsFocused(false);
    if (!props.value) {
      Animated.parallel([
        Animated.timing(animatedValue, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
        Animated.timing(borderColorAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      Animated.timing(borderColorAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  };

  const labelStyle = {
    position: 'absolute' as const,
    left: leftIcon ? 45 : 16,
    top: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [size === 'large' ? 20 : size === 'small' ? 12 : 16, -8],
    }),
    fontSize: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: [16, 12],
    }),
    color: animatedValue.interpolate({
      inputRange: [0, 1],
      outputRange: ['#999', '#4facfe'],
    }),
    backgroundColor: '#ffffff',
    paddingHorizontal: 4,
    zIndex: 1,
  };

  const borderColor = borderColorAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [error ? '#ff6b6b' : '#e1e1e1', error ? '#ff6b6b' : '#4facfe'],
  });

  const getContainerStyle = () => {
    const baseStyle = [styles.container];
    
    switch (variant) {
      case 'filled':
        baseStyle.push(styles.filledContainer);
        break;
      case 'outlined':
        baseStyle.push(styles.outlinedContainer);
        break;
      default:
        baseStyle.push(styles.defaultContainer);
    }
    
    baseStyle.push(styles[`${size}Container`]);
    
    return baseStyle;
  };

  const getInputStyle = () => {
    const baseStyle = [styles.input, styles[`${size}Input`]];
    
    if (leftIcon) {
      baseStyle.push(styles.inputWithLeftIcon);
    }
    
    if (rightIcon) {
      baseStyle.push(styles.inputWithRightIcon);
    }
    
    return baseStyle;
  };

  return (
    <View style={[styles.wrapper, style]}>
      <Animated.View
        style={[
          getContainerStyle(),
          variant === 'outlined' && { borderColor },
        ]}
      >
        {label && (
          <Animated.Text style={labelStyle}>
            {label}
          </Animated.Text>
        )}
        
        {leftIcon && (
          <View style={styles.leftIconContainer}>
            <Icon name={leftIcon} size={20} color="#999" />
          </View>
        )}
        
        <TextInput
          {...props}
          style={getInputStyle()}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholderTextColor="#999"
        />
        
        {rightIcon && (
          <TouchableOpacity
            style={styles.rightIconContainer}
            onPress={onRightIconPress}
          >
            <Icon name={rightIcon} size={20} color="#999" />
          </TouchableOpacity>
        )}
      </Animated.View>
      
      {error && (
        <Text style={styles.errorText}>{error}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    position: 'relative',
  },
  defaultContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#e1e1e1',
    backgroundColor: 'transparent',
  },
  filledContainer: {
    backgroundColor: '#f5f5f5',
    borderWidth: 0,
  },
  outlinedContainer: {
    borderWidth: 1,
    backgroundColor: '#ffffff',
  },
  
  // Sizes
  smallContainer: {
    height: 40,
  },
  mediumContainer: {
    height: 48,
  },
  largeContainer: {
    height: 56,
  },
  
  input: {
    flex: 1,
    fontSize: 16,
    color: '#333',
    paddingHorizontal: 16,
  },
  smallInput: {
    fontSize: 14,
  },
  mediumInput: {
    fontSize: 16,
  },
  largeInput: {
    fontSize: 18,
  },
  
  inputWithLeftIcon: {
    paddingLeft: 45,
  },
  inputWithRightIcon: {
    paddingRight: 45,
  },
  
  leftIconContainer: {
    position: 'absolute',
    left: 16,
    zIndex: 1,
  },
  rightIconContainer: {
    position: 'absolute',
    right: 16,
    zIndex: 1,
  },
  
  errorText: {
    fontSize: 12,
    color: '#ff6b6b',
    marginTop: 4,
    marginLeft: 16,
  },
});

export default Input;
