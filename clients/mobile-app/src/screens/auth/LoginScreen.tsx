//clients/mobile-app/src/screens/auth/LoginScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  Alert,
  ActivityIndicator,
  Animated
} from 'react-native';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  Shield,
  Smartphone,
  AlertCircle
} from 'lucide-react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const LoginScreen: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [fadeAnim] = useState(new Animated.Value(0));

  useEffect(() => {
    checkBiometricAvailability();
    
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 1000,
      useNativeDriver: true
    }).start();
  }, []);

  const checkBiometricAvailability = async () => {
    const compatible = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    setBiometricAvailable(compatible && enrolled);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    setIsLoading(true);
    
    try {
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Store credentials securely
      await SecureStore.setItemAsync('userToken', 'mock_token');
      await SecureStore.setItemAsync('userEmail', email);
      
      Alert.alert('Success', 'Login successful!');
    } catch (error) {
      Alert.alert('Error', 'Login failed. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Authenticate to access your trading account',
        cancelLabel: 'Cancel',
        fallbackLabel: 'Use password',
        disableDeviceFallback: false
      });

      if (result.success) {
        // Check if user has saved credentials
        const savedToken = await SecureStore.getItemAsync('userToken');
        if (savedToken) {
          Alert.alert('Success', 'Biometric login successful!');
        } else {
          Alert.alert('Info', 'Please login with credentials first to enable biometric login');
        }
      }
    } catch (error) {
      Alert.alert('Error', 'Biometric authentication failed');
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <Animated.View style={[styles.content, { opacity: fadeAnim }]}>
        {/* Logo and Title */}
        <View style={styles.header}>
          <View style={styles.logo}>
            <Shield size={40} color="#ffffff" />
          </View>
          <Text style={styles.title}>Nexus Trade AI</Text>
          <Text style={styles.subtitle}>Welcome back to your trading platform</Text>
        </View>

        {/* Login Form */}
        <View style={styles.form}>
          {/* Email Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <Mail size={20} color="#64748b" />
            </View>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#64748b"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          {/* Password Input */}
          <View style={styles.inputContainer}>
            <View style={styles.inputIcon}>
              <Lock size={20} color="#64748b" />
            </View>
            <TextInput
              style={[styles.input, { paddingRight: 50 }]}
              placeholder="Password"
              placeholderTextColor="#64748b"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff size={20} color="#64748b" />
              ) : (
                <Eye size={20} color="#64748b" />
              )}
            </TouchableOpacity>
          </View>

          {/* Forgot Password */}
          <TouchableOpacity style={styles.forgotPassword}>
            <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
          </TouchableOpacity>

          {/* Login Button */}
          <TouchableOpacity
            style={[styles.loginButton, isLoading && styles.loginButtonDisabled]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.loginButtonText}>Sign In</Text>
            )}
          </TouchableOpacity>

          {/* Biometric Login */}
          {biometricAvailable && (
            <>
              <View style={styles.divider}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>or</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleBiometricLogin}
              >
                <Smartphone size={20} color="#3b82f6" />
                <Text style={styles.biometricButtonText}>Use Biometric Login</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        {/* Sign Up Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity>
            <Text style={styles.signUpText}>Create one</Text>
          </TouchableOpacity>
        </View>

        {/* Security Notice */}
        <View style={styles.securityNotice}>
          <Shield size={16} color="#64748b" />
          <Text style={styles.securityNoticeText}>
            Your data is protected with bank-level security
          </Text>
        </View>
      </Animated.View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a'
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center'
  },
  header: {
    alignItems: 'center',
    marginBottom: 40
  },
  logo: {
    width: 80,
    height: 80,
    backgroundColor: '#3b82f6',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#ffffff',
    marginBottom: 8
  },
  subtitle: {
    fontSize: 16,
    color: '#64748b',
    textAlign: 'center'
  },
  form: {
    marginBottom: 32
  },
  inputContainer: {
    position: 'relative',
    marginBottom: 16
  },
  inputIcon: {
    position: 'absolute',
    left: 16,
    top: 18,
    zIndex: 1
  },
  input: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 12,
    paddingHorizontal: 50,
    paddingVertical: 16,
    fontSize: 16,
    color: '#ffffff'
  },
  passwordToggle: {
    position: 'absolute',
    right: 16,
    top: 18
  },
  forgotPassword: {
    alignSelf: 'flex-end',
    marginBottom: 24
  },
  forgotPasswordText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '500'
  },
  loginButton: {
    backgroundColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6
  },
  loginButtonDisabled: {
    opacity: 0.6
  },
  loginButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600'
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#334155'
  },
  dividerText: {
    color: '#64748b',
    fontSize: 14,
    marginHorizontal: 16
  },
  biometricButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#3b82f6',
    borderRadius: 12,
    paddingVertical: 16,
    marginBottom: 24
  },
  biometricButtonText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: '500',
    marginLeft: 8
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24
  },
  footerText: {
    color: '#64748b',
    fontSize: 14
  },
  signUpText: {
    color: '#3b82f6',
    fontSize: 14,
    fontWeight: '600'
  },
  securityNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16
  },
  securityNoticeText: {
    color: '#64748b',
    fontSize: 12,
    marginLeft: 8,
    textAlign: 'center'
  }
});

export default LoginScreen;