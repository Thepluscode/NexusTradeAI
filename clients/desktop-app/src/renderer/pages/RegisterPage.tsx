import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useDispatch } from 'react-redux';
import { AppDispatch } from '../store/store';
import {
  EyeIcon,
  EyeSlashIcon,
  ShieldCheckIcon,
  ComputerDesktopIcon,
  CheckCircleIcon,
  UserIcon,
  EnvelopeIcon,
  LockClosedIcon,
} from '@heroicons/react/24/outline';
import { cn } from '../utils/cn';

interface RegisterPageProps {}

interface FormData {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  confirmPassword: string;
  accountType: 'retail' | 'professional' | 'institutional' | '';
  agreeToTerms: boolean;
  agreeToPrivacy: boolean;
}

const RegisterPage: React.FC<RegisterPageProps> = () => {
  const dispatch = useDispatch<AppDispatch>();
  
  const [formData, setFormData] = useState<FormData>({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    accountType: '',
    agreeToTerms: false,
    agreeToPrivacy: false,
  });
  
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<Partial<FormData>>({});

  const accountTypes = [
    {
      value: 'retail',
      label: 'Retail Trader',
      price: '$29/month',
      description: 'Perfect for individual traders',
      features: ['Basic AI predictions', 'Mobile & desktop access', 'Standard support']
    },
    {
      value: 'professional',
      label: 'Professional',
      price: '$99/month',
      description: 'For serious traders and small firms',
      features: ['Advanced AI strategies', 'Priority support', 'API access', 'Advanced analytics']
    },
    {
      value: 'institutional',
      label: 'Institutional',
      price: '$999/month',
      description: 'For hedge funds and institutions',
      features: ['Custom AI models', 'Dedicated support', 'White-label options', 'Direct market access']
    }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    const checked = (e.target as HTMLInputElement).checked;
    
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    
    // Clear error when user starts typing
    if (errors[name as keyof FormData]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Partial<FormData> = {};

    if (!formData.firstName.trim()) newErrors.firstName = 'First name is required';
    if (!formData.lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    if (!formData.email.includes('@')) newErrors.email = 'Please enter a valid email';
    if (!formData.password) newErrors.password = 'Password is required';
    if (formData.password.length < 8) newErrors.password = 'Password must be at least 8 characters';
    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (!formData.accountType) newErrors.accountType = 'Please select an account type';
    if (!formData.agreeToTerms) newErrors.agreeToTerms = 'You must agree to the terms';
    if (!formData.agreeToPrivacy) newErrors.agreeToPrivacy = 'You must agree to the privacy policy';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) return;
    
    setIsLoading(true);

    try {
      // Simulate registration API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock successful registration
      console.log('Registration successful', formData);
      
      // Dispatch registration success action
      // dispatch(registerSuccess(userData));
      
    } catch (err) {
      console.error('Registration failed:', err);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Logo and Title */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <span className="text-white text-xl font-bold">NT</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Create Your Account
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Join NexusTrade Desktop and start trading with AI
          </p>
        </motion.div>

        {/* Desktop App Badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          className="flex items-center justify-center space-x-2 mb-6 p-3 bg-blue-100 dark:bg-blue-900/30 rounded-lg"
        >
          <ComputerDesktopIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          <span className="text-sm font-medium text-blue-800 dark:text-blue-300">
            Desktop Application Registration
          </span>
        </motion.div>

        {/* Registration Form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 border border-gray-200 dark:border-gray-700"
        >
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Name Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="firstName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  First Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="firstName"
                    name="firstName"
                    type="text"
                    required
                    value={formData.firstName}
                    onChange={handleInputChange}
                    className={cn(
                      "w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                      errors.firstName ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                    )}
                    placeholder="First name"
                  />
                </div>
                {errors.firstName && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.firstName}</p>
                )}
              </div>

              <div>
                <label htmlFor="lastName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Last Name
                </label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="lastName"
                    name="lastName"
                    type="text"
                    required
                    value={formData.lastName}
                    onChange={handleInputChange}
                    className={cn(
                      "w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                      errors.lastName ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                    )}
                    placeholder="Last name"
                  />
                </div>
                {errors.lastName && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.lastName}</p>
                )}
              </div>
            </div>

            {/* Email Field */}
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Email Address
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  value={formData.email}
                  onChange={handleInputChange}
                  className={cn(
                    "w-full pl-10 pr-4 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                    errors.email ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                  )}
                  placeholder="Enter your email"
                />
              </div>
              {errors.email && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.email}</p>
              )}
            </div>

            {/* Password Fields */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Password
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={formData.password}
                    onChange={handleInputChange}
                    className={cn(
                      "w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                      errors.password ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                    )}
                    placeholder="Create password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.password}</p>
                )}
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Confirm Password
                </label>
                <div className="relative">
                  <LockClosedIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    id="confirmPassword"
                    name="confirmPassword"
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className={cn(
                      "w-full pl-10 pr-12 py-3 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent",
                      errors.confirmPassword ? "border-red-300 dark:border-red-600" : "border-gray-300 dark:border-gray-600"
                    )}
                    placeholder="Confirm password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    {showConfirmPassword ? <EyeSlashIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <p className="mt-1 text-sm text-red-600 dark:text-red-400">{errors.confirmPassword}</p>
                )}
              </div>
            </div>

            {/* Account Type Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
                Choose Your Account Type
              </label>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {accountTypes.map((type) => (
                  <motion.div
                    key={type.value}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    className={cn(
                      "relative p-4 border-2 rounded-lg cursor-pointer transition-all",
                      formData.accountType === type.value
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20"
                        : "border-gray-200 dark:border-gray-600 hover:border-gray-300 dark:hover:border-gray-500"
                    )}
                    onClick={() => setFormData(prev => ({ ...prev, accountType: type.value as any }))}
                  >
                    <input
                      type="radio"
                      name="accountType"
                      value={type.value}
                      checked={formData.accountType === type.value}
                      onChange={handleInputChange}
                      className="sr-only"
                    />
                    
                    {formData.accountType === type.value && (
                      <CheckCircleIcon className="absolute top-2 right-2 h-5 w-5 text-blue-500" />
                    )}
                    
                    <div className="text-center">
                      <h3 className="font-semibold text-gray-900 dark:text-white">{type.label}</h3>
                      <p className="text-lg font-bold text-blue-600 dark:text-blue-400 mt-1">{type.price}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{type.description}</p>
                    </div>
                  </motion.div>
                ))}
              </div>
              {errors.accountType && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">{errors.accountType}</p>
              )}
            </div>

            {/* Terms and Privacy */}
            <div className="space-y-3">
              <label className="flex items-start space-x-3">
                <input
                  name="agreeToTerms"
                  type="checkbox"
                  checked={formData.agreeToTerms}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I agree to the{' '}
                  <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Terms of Service
                  </button>
                </span>
              </label>
              {errors.agreeToTerms && (
                <p className="text-sm text-red-600 dark:text-red-400">{errors.agreeToTerms}</p>
              )}

              <label className="flex items-start space-x-3">
                <input
                  name="agreeToPrivacy"
                  type="checkbox"
                  checked={formData.agreeToPrivacy}
                  onChange={handleInputChange}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 dark:border-gray-600 rounded"
                />
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  I agree to the{' '}
                  <button type="button" className="text-blue-600 dark:text-blue-400 hover:underline">
                    Privacy Policy
                  </button>
                </span>
              </label>
              {errors.agreeToPrivacy && (
                <p className="text-sm text-red-600 dark:text-red-400">{errors.agreeToPrivacy}</p>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={cn(
                'w-full py-3 px-4 rounded-lg font-medium text-white transition-all duration-200',
                isLoading
                  ? 'bg-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2'
              )}
            >
              {isLoading ? (
                <div className="flex items-center justify-center space-x-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Creating Account...</span>
                </div>
              ) : (
                'Create Account'
              )}
            </button>
          </form>

          {/* Security Notice */}
          <div className="mt-6 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <div className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400">
              <ShieldCheckIcon className="h-4 w-4 text-green-500" />
              <span>Your data is protected with bank-level encryption</span>
            </div>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-center mt-6"
        >
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Already have an account?{' '}
            <button className="text-blue-600 dark:text-blue-400 hover:text-blue-500 dark:hover:text-blue-300 font-medium">
              Sign in
            </button>
          </p>
        </motion.div>
      </div>
    </div>
  );
};

export default RegisterPage;
