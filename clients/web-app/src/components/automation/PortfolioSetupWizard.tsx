import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle, ArrowRight, ArrowLeft, Target, TrendingUp, Shield } from 'lucide-react';

interface PortfolioSetupWizardProps {
  onComplete?: (config: any) => void;
}

const PortfolioSetupWizard: React.FC<PortfolioSetupWizardProps> = ({ onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [config, setConfig] = useState({
    riskTolerance: '',
    investmentGoal: '',
    timeHorizon: '',
    initialAmount: '',
    strategies: [] as string[]
  });

  const totalSteps = 4;

  const steps = [
    { id: 1, title: 'Risk Assessment', icon: Shield },
    { id: 2, title: 'Investment Goals', icon: Target },
    { id: 3, title: 'Time Horizon', icon: TrendingUp },
    { id: 4, title: 'Strategy Selection', icon: CheckCircle }
  ];

  const handleNext = () => {
    if (currentStep < totalSteps) {
      setCurrentStep(currentStep + 1);
    } else {
      handleComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleComplete = () => {
    if (onComplete) {
      onComplete(config);
    } else {
      alert(`Portfolio setup complete!

Configuration:
- Risk Tolerance: ${config.riskTolerance}
- Investment Goal: ${config.investmentGoal}
- Time Horizon: ${config.timeHorizon}
- Initial Amount: ${config.initialAmount}
- Strategies: ${config.strategies.join(', ')}

Your automated portfolio is ready to launch!`);
    }
  };

  const updateConfig = (field: string, value: string | string[]) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const toggleStrategy = (strategy: string) => {
    const current = config.strategies;
    if (current.includes(strategy)) {
      updateConfig('strategies', current.filter(s => s !== strategy));
    } else {
      updateConfig('strategies', [...current, strategy]);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm text-gray-600">Step {currentStep} of {totalSteps}</span>
          <span className="text-sm text-gray-600">{Math.round((currentStep / totalSteps) * 100)}% Complete</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-blue-500 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>
        <div className="flex justify-between mt-4">
          {steps.map((step) => (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                currentStep >= step.id ? 'bg-blue-500 text-white' : 'bg-gray-300 text-gray-600'
              }`}>
                <step.icon className="w-4 h-4" />
              </div>
              <span className="text-xs text-gray-600 mt-1 hidden md:block">{step.title}</span>
            </div>
          ))}
        </div>
      </div>

      <motion.div
        key={currentStep}
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-xl p-8 shadow-lg border border-gray-200"
      >
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Portfolio Setup Step {currentStep}</h2>
          <p className="text-gray-600">Configure your automated portfolio settings</p>
        </div>

        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button className="p-6 rounded-xl border-2 border-gray-300 bg-white hover:border-blue-300 transition-all text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Option 1</h3>
              <p className="text-gray-600 text-sm">Sample configuration option</p>
            </button>
            <button className="p-6 rounded-xl border-2 border-gray-300 bg-white hover:border-blue-300 transition-all text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Option 2</h3>
              <p className="text-gray-600 text-sm">Sample configuration option</p>
            </button>
            <button className="p-6 rounded-xl border-2 border-gray-300 bg-white hover:border-blue-300 transition-all text-left">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Option 3</h3>
              <p className="text-gray-600 text-sm">Sample configuration option</p>
            </button>
          </div>
        </div>
      </motion.div>

      <div className="flex justify-between mt-8">
        <button
          onClick={handlePrevious}
          disabled={currentStep === 1}
          className={`flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-all ${
            currentStep === 1
              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
          }`}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Previous</span>
        </button>

        <button
          onClick={handleNext}
          className="flex items-center space-x-2 bg-blue-500 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-600 transition-all"
        >
          <span>{currentStep === totalSteps ? 'Complete Setup' : 'Next'}</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};

export default PortfolioSetupWizard;