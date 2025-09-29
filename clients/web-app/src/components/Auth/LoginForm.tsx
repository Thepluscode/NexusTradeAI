//clients/web-app/src/components/auth/LoginForm.tsx
import React, { useState } from 'react';
import { useDispatch } from 'react-redux';
import { useRouter } from 'next/router';
import {
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  Shield,
  Smartphone,
  CheckCircle
} from 'lucide-react';
import { login } from '../../store/slices/authSlice';

interface LoginFormProps {
  onToggleMode: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ onToggleMode }) => {
  const dispatch = useDispatch();
  const router = useRouter();
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false,
    twoFactorCode: ''
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [step, setStep] = useState<'credentials' | 'twoFactor'>('credentials');
  const [twoFactorMethod, setTwoFactorMethod] = useState<'app' | 'sms'>('app');

  const handleInputChange = (field: string, value: string | boolean) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (error) setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      if (step === 'credentials') {
        // Validate credentials first
        const response = await fetch('/api/auth/validate-credentials', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: formData.email,
            password: formData.password
          })
        });

        const result = await response.json();
        
        if (result.success) {
          if (result.requiresTwoFactor) {
            setStep('twoFactor');
          } else {
            // Complete login
            dispatch(login({
              email: formData.email,
              password: formData.password,
              rememberMe: formData.rememberMe
            }) as any);
          }
        } else {
          setError(result.message || 'Invalid credentials');
        }
      } else {
        // Complete 2FA login
        dispatch(login({
          email: formData.email,
          password: formData.password,
          twoFactorCode: formData.twoFactorCode,
          rememberMe: formData.rememberMe
        }) as any);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (!window.navigator.credentials) {
      setError('Biometric authentication not supported');
      return;
    }

    try {
      setIsLoading(true);
      // WebAuthn implementation would go here
      const credential = await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(32),
          rp: { name: "Nexus Trade AI" },
          user: {
            id: new Uint8Array(16),
            name: formData.email,
            displayName: formData.email
          },
          pubKeyCredParams: [{ alg: -7, type: "public-key" }]
        }
      });
      
      // Process credential and login
      console.log('Biometric login successful', credential);
    } catch (err) {
      setError('Biometric authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  if (step === 'twoFactor') {
    return (
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Two-Factor Authentication</h2>
          <p className="text-gray-600 mt-2">
            Enter the verification code from your authenticator app
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 2FA Method Selection */}
          <div className="flex space-x-2 mb-4">
            <button
              type="button"
              onClick={() => setTwoFactorMethod('app')}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 border rounded-lg transition-colors ${
                twoFactorMethod === 'app'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Smartphone className="w-4 h-4" />
              <span className="text-sm font-medium">Authenticator App</span>
            </button>
            <button
              type="button"
              onClick={() => setTwoFactorMethod('sms')}
              className={`flex-1 flex items-center justify-center space-x-2 py-3 px-4 border rounded-lg transition-colors ${
                twoFactorMethod === 'sms'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              <Mail className="w-4 h-4" />
              <span className="text-sm font-medium">SMS</span>
            </button>
          </div>

          {/* 2FA Code Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Verification Code
            </label>
            <input
              type="text"
              value={formData.twoFactorCode}
              onChange={(e) => handleInputChange('twoFactorCode', e.target.value)}
              placeholder="Enter 6-digit code"
              maxLength={6}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-2xl tracking-widest"
              autoComplete="one-time-code"
            />
          </div>

          {error && (
            <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || formData.twoFactorCode.length !== 6}
            className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
          >
            {isLoading ? 'Verifying...' : 'Verify & Login'}
          </button>

          <button
            type="button"
            onClick={() => setStep('credentials')}
            className="w-full text-gray-600 hover:text-gray-800 py-2 transition-colors"
          >
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-gray-900">Welcome Back</h2>
        <p className="text-gray-600 mt-2">Sign in to your trading account</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Email Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Email Address
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Mail className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="block w-full pl-10 pr-3 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="your@email.com"
              required
            />
          </div>
        </div>

        {/* Password Field */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Password
          </label>
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Lock className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={formData.password}
              onChange={(e) => handleInputChange('password', e.target.value)}
              className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="Enter your password"
              required
            />
            <button
              type="button"
              className="absolute inset-y-0 right-0 pr-3 flex items-center"
              onClick={() => setShowPassword(!showPassword)}
            >
              {showPassword ? (
                <EyeOff className="h-5 w-5 text-gray-400" />
              ) : (
                <Eye className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>
        </div>

        {/* Remember Me & Forgot Password */}
        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.rememberMe}
              onChange={(e) => handleInputChange('rememberMe', e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
            />
            <span className="ml-2 text-sm text-gray-600">Remember me</span>
          </label>
          <a href="/forgot-password" className="text-sm text-blue-600 hover:text-blue-500">
            Forgot password?
          </a>
        </div>

        {error && (
          <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {/* Login Button */}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {isLoading ? 'Signing in...' : 'Sign In'}
        </button>

        {/* Biometric Login */}
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-gray-300" />
          </div>
          <div className="relative flex justify-center text-sm">
            <span className="px-2 bg-white text-gray-500">or</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleBiometricLogin}
          className="w-full flex items-center justify-center space-x-2 py-3 px-4 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Shield className="w-4 h-4" />
          <span>Use Biometric Login</span>
        </button>

        {/* Sign Up Link */}
        <div className="text-center">
          <span className="text-gray-600">Don't have an account? </span>
          <button
            type="button"
            onClick={onToggleMode}
            className="text-blue-600 hover:text-blue-500 font-medium"
          >
            Create one
          </button>
        </div>
      </form>
    </div>
  );
};

export default LoginForm;