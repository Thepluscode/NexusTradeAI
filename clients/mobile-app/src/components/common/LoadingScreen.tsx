import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

interface LoadingScreenProps {
  message?: string;
}

const { width, height } = Dimensions.get('window');

const LoadingScreen: React.FC<LoadingScreenProps> = ({ 
  message = 'Loading NexusTrade...' 
}) => {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Logo animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation for loading indicator
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();

    return () => {
      rotateAnimation.stop();
    };
  }, [fadeAnim, scaleAnim, rotateAnim]);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#1a1a2e" />
      
      <LinearGradient
        colors={['#1a1a2e', '#16213e', '#0f3460']}
        style={styles.gradient}
      >
        <Animated.View
          style={[
            styles.logoContainer,
            {
              opacity: fadeAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Logo */}
          <View style={styles.logo}>
            <LinearGradient
              colors={['#4facfe', '#00f2fe']}
              style={styles.logoGradient}
            >
              <Text style={styles.logoText}>NT</Text>
            </LinearGradient>
          </View>

          {/* App Name */}
          <Text style={styles.appName}>NexusTrade</Text>
          <Text style={styles.tagline}>AI-Powered Trading</Text>
        </Animated.View>

        {/* Loading Indicator */}
        <View style={styles.loadingContainer}>
          <Animated.View
            style={[
              styles.loadingRing,
              {
                transform: [{ rotate: spin }],
              },
            ]}
          >
            <LinearGradient
              colors={['#4facfe', '#00f2fe', 'transparent', 'transparent']}
              style={styles.ringGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
            />
          </Animated.View>
          
          <View style={styles.loadingDots}>
            {[0, 1, 2].map((index) => (
              <Animated.View
                key={index}
                style={[
                  styles.dot,
                  {
                    opacity: fadeAnim,
                    transform: [
                      {
                        scale: Animated.sequence([
                          Animated.delay(index * 200),
                          Animated.loop(
                            Animated.sequence([
                              Animated.timing(new Animated.Value(1), {
                                toValue: 1.5,
                                duration: 600,
                                useNativeDriver: true,
                              }),
                              Animated.timing(new Animated.Value(1.5), {
                                toValue: 1,
                                duration: 600,
                                useNativeDriver: true,
                              }),
                            ])
                          ),
                        ]),
                      },
                    ],
                  },
                ]}
              />
            ))}
          </View>
        </View>

        {/* Loading Message */}
        <Animated.View
          style={[
            styles.messageContainer,
            { opacity: fadeAnim },
          ]}
        >
          <Text style={styles.message}>{message}</Text>
        </Animated.View>

        {/* Version Info */}
        <View style={styles.versionContainer}>
          <Text style={styles.version}>Version 1.0.0</Text>
        </View>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  gradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 60,
  },
  logo: {
    width: 80,
    height: 80,
    borderRadius: 20,
    marginBottom: 20,
    elevation: 10,
    shadowColor: '#4facfe',
    shadowOffset: {
      width: 0,
      height: 5,
    },
    shadowOpacity: 0.3,
    shadowRadius: 10,
  },
  logoGradient: {
    flex: 1,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  logoText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
  },
  appName: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    color: '#a0a0a0',
    fontWeight: '300',
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  loadingRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    marginBottom: 20,
  },
  ringGradient: {
    flex: 1,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  loadingDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4facfe',
    marginHorizontal: 4,
  },
  messageContainer: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  message: {
    fontSize: 16,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.8,
  },
  versionContainer: {
    position: 'absolute',
    bottom: 50,
    alignItems: 'center',
  },
  version: {
    fontSize: 12,
    color: '#666',
    fontWeight: '300',
  },
});

export default LoadingScreen;
