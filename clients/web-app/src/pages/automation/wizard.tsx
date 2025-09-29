// Automation Setup Wizard - NexusTradeAI

import React, { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  Cog,
  DollarSign,
  Target,
  TrendingUp,
  Shield,
  Bot,
  Zap,
  BarChart3,
  Settings
} from 'lucide-react';

const AutomationWizardPage: React.FC = () => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isLaunched, setIsLaunched] = useState(false);
  const [formData, setFormData] = useState({
    riskTolerance: '',
    investmentGoal: '',
    timeHorizon: '',
    initialCapital: '',
    tradingStyle: '',
    assetClasses: [] as string[],
    rebalanceFrequency: '',
    stopLoss: ''
  });

  const totalSteps = 5;

  const steps = [
    { id: 1, title: 'Risk Profile', icon: Shield },
    { id: 2, title: 'Investment Goals', icon: Target },
    { id: 3, title: 'Trading Style', icon: TrendingUp },
    { id: 4, title: 'Portfolio Setup', icon: BarChart3 },
    { id: 5, title: 'Review & Launch', icon: Zap }
  ];

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleInputChange = (field: string, value: string | string[]) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleAssetClassToggle = (assetClass: string) => {
    const current = formData.assetClasses;
    if (current.includes(assetClass)) {
      handleInputChange('assetClasses', current.filter(ac => ac !== assetClass));
    } else {
      handleInputChange('assetClasses', [...current, assetClass]);
    }
  };

  const handleLaunchAutomation = async () => {
    // Validate that all required fields are filled
    const requiredFields = ['riskTolerance', 'investmentGoal', 'timeHorizon', 'initialCapital', 'tradingStyle'];
    const missingFields = requiredFields.filter(field => !formData[field]);

    if (missingFields.length > 0) {
      alert(`Please complete the following fields: ${missingFields.join(', ')}`);
      return;
    }

    if (formData.assetClasses.length === 0) {
      alert('Please select at least one asset class');
      return;
    }

    setIsLaunching(true);

    try {
      // Create automation configuration
      const automationConfig = {
        ...formData,
        createdAt: new Date().toISOString(),
        status: 'active'
      };

      // In a real app, this would be sent to the backend
      console.log('Launching automation with config:', automationConfig);

      // Simulate API call delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      setIsLaunched(true);
    } catch (error) {
      console.error('Failed to launch automation:', error);
      alert('Failed to launch automation. Please try again.');
    } finally {
      setIsLaunching(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Shield className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">What's your risk tolerance?</h2>
              <p className="text-slate-400">This helps us recommend the right automation strategy for you.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { id: 'conservative', label: 'Conservative', desc: 'Low risk, steady returns', color: 'green' },
                { id: 'moderate', label: 'Moderate', desc: 'Balanced risk and return', color: 'yellow' },
                { id: 'aggressive', label: 'Aggressive', desc: 'High risk, high potential returns', color: 'red' }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleInputChange('riskTolerance', option.id)}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    formData.riskTolerance === option.id
                      ? `border-${option.color}-500 bg-${option.color}-500/10`
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <h3 className="text-lg font-semibold text-white mb-2">{option.label}</h3>
                  <p className="text-slate-400 text-sm">{option.desc}</p>
                </button>
              ))}
            </div>
          </div>
        );

      case 2:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Target className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">What's your investment goal?</h2>
              <p className="text-slate-400">Define your primary objective for automated trading.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { id: 'growth', label: 'Capital Growth', desc: 'Maximize long-term returns' },
                { id: 'income', label: 'Generate Income', desc: 'Focus on dividend and interest income' },
                { id: 'preservation', label: 'Capital Preservation', desc: 'Protect existing wealth' },
                { id: 'speculation', label: 'Active Trading', desc: 'Short-term profit opportunities' }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleInputChange('investmentGoal', option.id)}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    formData.investmentGoal === option.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <h3 className="text-lg font-semibold text-white mb-2">{option.label}</h3>
                  <p className="text-slate-400 text-sm">{option.desc}</p>
                </button>
              ))}
            </div>

            <div className="mt-8">
              <label className="block text-white font-medium mb-4">Investment Time Horizon</label>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                {[
                  { id: 'short', label: '< 1 year' },
                  { id: 'medium', label: '1-3 years' },
                  { id: 'long', label: '3-10 years' },
                  { id: 'very_long', label: '10+ years' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleInputChange('timeHorizon', option.id)}
                    className={`p-3 rounded-lg border transition-all ${
                      formData.timeHorizon === option.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <TrendingUp className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Choose your trading style</h2>
              <p className="text-slate-400">Select the automation approach that fits your preferences.</p>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {[
                {
                  id: 'passive',
                  label: 'Passive Investing',
                  desc: 'Buy and hold with periodic rebalancing',
                  features: ['Low fees', 'Minimal trading', 'Long-term focus']
                },
                {
                  id: 'active',
                  label: 'Active Trading',
                  desc: 'AI-driven active trading strategies',
                  features: ['Dynamic allocation', 'Market timing', 'Higher potential returns']
                }
              ].map((option) => (
                <button
                  key={option.id}
                  onClick={() => handleInputChange('tradingStyle', option.id)}
                  className={`p-6 rounded-xl border-2 transition-all text-left ${
                    formData.tradingStyle === option.id
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-600 bg-slate-800/50 hover:border-slate-500'
                  }`}
                >
                  <h3 className="text-lg font-semibold text-white mb-2">{option.label}</h3>
                  <p className="text-slate-400 text-sm mb-4">{option.desc}</p>
                  <ul className="space-y-1">
                    {option.features.map((feature, index) => (
                      <li key={index} className="text-slate-300 text-sm flex items-center">
                        <CheckCircle className="w-4 h-4 text-green-400 mr-2" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                </button>
              ))}
            </div>

            <div className="mt-8">
              <label className="block text-white font-medium mb-4">Initial Capital</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                  { id: '1000', label: '$1,000' },
                  { id: '5000', label: '$5,000' },
                  { id: '10000', label: '$10,000' },
                  { id: '25000', label: '$25,000+' }
                ].map((option) => (
                  <button
                    key={option.id}
                    onClick={() => handleInputChange('initialCapital', option.id)}
                    className={`p-3 rounded-lg border transition-all ${
                      formData.initialCapital === option.id
                        ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                        : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );

      case 4:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <BarChart3 className="w-16 h-16 text-blue-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Portfolio Configuration</h2>
              <p className="text-slate-400">Configure your automated portfolio settings.</p>
            </div>
            
            <div className="space-y-6">
              <div>
                <label className="block text-white font-medium mb-4">Asset Classes (Select multiple)</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: 'stocks', label: 'Stocks' },
                    { id: 'bonds', label: 'Bonds' },
                    { id: 'crypto', label: 'Crypto' },
                    { id: 'commodities', label: 'Commodities' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleAssetClassToggle(option.id)}
                      className={`p-3 rounded-lg border transition-all ${
                        formData.assetClasses.includes(option.id)
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white font-medium mb-4">Rebalancing Frequency</label>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                  {[
                    { id: 'daily', label: 'Daily' },
                    { id: 'weekly', label: 'Weekly' },
                    { id: 'monthly', label: 'Monthly' },
                    { id: 'quarterly', label: 'Quarterly' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleInputChange('rebalanceFrequency', option.id)}
                      className={`p-3 rounded-lg border transition-all ${
                        formData.rebalanceFrequency === option.id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-white font-medium mb-4">Stop Loss Percentage</label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {[
                    { id: '5', label: '5%' },
                    { id: '10', label: '10%' },
                    { id: '15', label: '15%' },
                    { id: '20', label: '20%' }
                  ].map((option) => (
                    <button
                      key={option.id}
                      onClick={() => handleInputChange('stopLoss', option.id)}
                      className={`p-3 rounded-lg border transition-all ${
                        formData.stopLoss === option.id
                          ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                          : 'border-slate-600 bg-slate-800/50 text-slate-300 hover:border-slate-500'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );

      case 5:
        return (
          <div className="space-y-6">
            <div className="text-center mb-8">
              <Zap className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-white mb-2">Review & Launch</h2>
              <p className="text-slate-400">Review your automation settings and launch your portfolio.</p>
            </div>
            
            <div className="bg-slate-800/50 rounded-xl p-6 space-y-4">
              <h3 className="text-lg font-semibold text-white mb-4">Your Automation Configuration</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Risk Tolerance:</span>
                    <span className="text-white capitalize">{formData.riskTolerance}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Investment Goal:</span>
                    <span className="text-white capitalize">{formData.investmentGoal}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Time Horizon:</span>
                    <span className="text-white capitalize">{formData.timeHorizon}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Trading Style:</span>
                    <span className="text-white capitalize">{formData.tradingStyle}</span>
                  </div>
                </div>
                
                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Initial Capital:</span>
                    <span className="text-white">${formData.initialCapital}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Asset Classes:</span>
                    <span className="text-white">{formData.assetClasses.join(', ')}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Rebalancing:</span>
                    <span className="text-white capitalize">{formData.rebalanceFrequency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Stop Loss:</span>
                    <span className="text-white">{formData.stopLoss}%</span>
                  </div>
                </div>
              </div>
            </div>

            {!isLaunched ? (
              <div className="bg-gradient-to-r from-green-600 to-blue-600 rounded-xl p-6 text-center">
                <h3 className="text-xl font-bold text-white mb-2">Ready to Launch!</h3>
                <p className="text-green-100 mb-4">
                  Your automated portfolio will start trading based on your preferences.
                </p>
                <button
                  onClick={handleLaunchAutomation}
                  disabled={isLaunching}
                  className="bg-white text-green-600 px-8 py-3 rounded-lg font-semibold hover:bg-gray-100 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLaunching ? (
                    <>
                      <div className="w-5 h-5 inline mr-2 animate-spin rounded-full border-2 border-green-600 border-t-transparent"></div>
                      Launching...
                    </>
                  ) : (
                    <>
                      <Bot className="w-5 h-5 inline mr-2" />
                      Launch Automation
                    </>
                  )}
                </button>
              </div>
            ) : (
              <div className="bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl p-6 text-center">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Automation Successfully Launched!</h3>
                <p className="text-green-100 mb-4">
                  Your automated portfolio has been created and is now active. You can monitor its performance in your portfolio dashboard.
                </p>
                <div className="space-y-2 mb-6">
                  <button
                    onClick={() => window.location.href = '/automation/portfolio'}
                    className="bg-white text-green-600 px-6 py-2 rounded-lg font-semibold hover:bg-gray-100 transition-all mr-3"
                  >
                    View Portfolio
                  </button>
                  <button
                    onClick={() => window.location.href = '/dashboard'}
                    className="bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700 transition-all border border-white/20"
                  >
                    Back to Dashboard
                  </button>
                </div>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <>
      <Head>
        <title>Automation Setup Wizard - NexusTradeAI</title>
        <meta name="description" content="Set up your automated trading portfolio with our step-by-step wizard" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Navigation */}
        <nav className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-700/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <div className="flex items-center space-x-4">
                <Link href="/dashboard" className="flex items-center space-x-2 text-slate-400 hover:text-white transition-colors">
                  <ArrowLeft className="w-5 h-5" />
                  <span>Back to Dashboard</span>
                </Link>
                <div className="w-px h-6 bg-slate-700"></div>
                <div className="flex items-center space-x-3">
                  <div className="w-8 h-8 bg-gradient-to-br from-cyan-500 to-cyan-600 rounded-lg flex items-center justify-center">
                    <Cog className="w-5 h-5 text-white" />
                  </div>
                  <span className="text-xl font-bold text-white">Automation Setup</span>
                </div>
              </div>
            </div>
          </div>
        </nav>

        {/* Progress Bar */}
        <div className="bg-slate-900/50 border-b border-slate-700/50">
          <div className="max-w-4xl mx-auto px-4 py-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-slate-400">Step {currentStep} of {totalSteps}</span>
              <span className="text-sm text-slate-400">{Math.round((currentStep / totalSteps) * 100)}% Complete</span>
            </div>
            <div className="w-full bg-slate-700 rounded-full h-2">
              <div
                className="bg-gradient-to-r from-cyan-500 to-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(currentStep / totalSteps) * 100}%` }}
              ></div>
            </div>
            <div className="flex justify-between mt-4">
              {steps.map((step) => (
                <div key={step.id} className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    currentStep >= step.id ? 'bg-cyan-500' : 'bg-slate-700'
                  }`}>
                    <step.icon className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-xs text-slate-400 mt-1 hidden md:block">{step.title}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-4xl mx-auto px-4 py-12">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentStep}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              {renderStepContent()}
            </motion.div>
          </AnimatePresence>

          {/* Navigation Buttons */}
          <div className="flex justify-between mt-12">
            <button
              onClick={handlePrevious}
              disabled={currentStep === 1}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                currentStep === 1
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-slate-700 text-white hover:bg-slate-600'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Previous</span>
            </button>

            <button
              onClick={handleNext}
              disabled={currentStep === totalSteps}
              className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
                currentStep === totalSteps
                  ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white hover:from-cyan-700 hover:to-blue-700'
              }`}
            >
              <span>Next</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default AutomationWizardPage;
