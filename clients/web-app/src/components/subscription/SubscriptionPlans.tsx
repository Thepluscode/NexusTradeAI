import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Star, Zap } from 'lucide-react';

interface SubscriptionPlansProps {
  showSubscriptionCTA?: boolean;
  currentPlan?: string;
  onPlanSelect?: (planId: string) => void;
  onUpgrade?: (planId: string) => void;
}

const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  showSubscriptionCTA = true,
  currentPlan,
  onPlanSelect,
  onUpgrade
}) => {
  const [isAnnual, setIsAnnual] = useState(false);

  const plans = [
    {
      id: 'basic',
      name: 'Basic',
      description: 'Perfect for beginners',
      monthlyPrice: 29,
      annualPrice: 290,
      features: [
        'Basic trading algorithms',
        'Email support',
        'Mobile app access',
        'Portfolio tracking',
        'Basic analytics'
      ],
      popular: false
    },
    {
      id: 'pro',
      name: 'Professional',
      description: 'For serious traders',
      monthlyPrice: 99,
      annualPrice: 990,
      features: [
        'Advanced algorithms',
        'Priority support',
        'API access',
        'Custom strategies',
        'Advanced analytics',
        'Risk management tools'
      ],
      popular: true
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      description: 'For institutions',
      monthlyPrice: 299,
      annualPrice: 2990,
      features: [
        'All features',
        'Dedicated support',
        'Custom integrations',
        'White-label options',
        'SLA guarantee',
        'Custom development'
      ],
      popular: false
    }
  ];

  const handlePlanSelect = (planId: string) => {
    if (onPlanSelect) {
      onPlanSelect(planId);
    } else {
      console.log('Selected plan:', planId);
      alert(`Selected ${plans.find(p => p.id === planId)?.name} plan!`);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-12">
      <div className="text-center mb-12">
        <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent mb-4">
          Choose Your Trading Plan
        </h1>
        <p className="text-xl text-gray-600 max-w-2xl mx-auto">
          Unlock the power of AI-driven trading with our professional-grade algorithms
        </p>
      </div>

      <div className="flex items-center justify-center gap-4 mb-12">
        <button
          onClick={() => setIsAnnual(false)}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            !isAnnual ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Monthly
        </button>
        <button
          onClick={() => setIsAnnual(true)}
          className={`px-4 py-2 rounded-lg font-semibold transition-all ${
            isAnnual ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Annual
          <span className="ml-2 bg-green-500 text-white px-2 py-1 rounded-full text-xs">Save 20%</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {plans.map((plan) => (
          <motion.div
            key={plan.id}
            className={`relative bg-white rounded-2xl p-8 shadow-lg border-2 transition-all hover:shadow-xl hover:-translate-y-1 ${
              plan.popular ? 'border-blue-500' : 'border-gray-200'
            }`}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {plan.popular && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-1 rounded-full text-sm font-semibold">
                <Star className="w-4 h-4 inline mr-1" />
                Most Popular
              </div>
            )}
            
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-gray-900 mb-2">{plan.name}</h3>
              <p className="text-gray-600 mb-4">{plan.description}</p>
              <div className="text-4xl font-bold text-gray-900">
                ${isAnnual ? plan.annualPrice : plan.monthlyPrice}
                <span className="text-lg font-normal text-gray-600">
                  /{isAnnual ? 'year' : 'month'}
                </span>
              </div>
              {isAnnual && (
                <div className="text-sm text-green-600 font-medium mt-2">
                  Save ${(plan.monthlyPrice * 12) - plan.annualPrice} per year
                </div>
              )}
            </div>

            <ul className="space-y-3 mb-8">
              {plan.features.map((feature, index) => (
                <li key={index} className="flex items-center">
                  <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center mr-3">
                    <Check className="w-3 h-3 text-white" />
                  </div>
                  <span className="text-gray-700">{feature}</span>
                </li>
              ))}
            </ul>

            <button
              onClick={() => handlePlanSelect(plan.id)}
              className={`w-full py-3 px-4 rounded-lg font-semibold transition-all ${
                plan.popular
                  ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white hover:from-blue-700 hover:to-purple-700'
                  : currentPlan === plan.id
                  ? 'bg-green-500 text-white cursor-default'
                  : 'bg-gray-100 text-gray-900 hover:bg-gray-200'
              }`}
              disabled={currentPlan === plan.id}
            >
              {currentPlan === plan.id ? (
                <>
                  <Check className="w-4 h-4 inline mr-2" />
                  Current Plan
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4 inline mr-2" />
                  {currentPlan ? 'Upgrade' : 'Select Plan'}
                </>
              )}
            </button>
          </motion.div>
        ))}
      </div>

      {showSubscriptionCTA && (
        <div className="mt-12 text-center">
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 rounded-2xl p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-4">
              Ready to Start Trading with AI?
            </h3>
            <p className="text-gray-600 mb-6 max-w-2xl mx-auto">
              Join thousands of traders who are already using our AI-powered platform to maximize their returns.
              Start with a 14-day free trial on any plan.
            </p>
            <div className="flex items-center justify-center gap-4 text-sm text-gray-500">
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-500 mr-1" />
                14-day free trial
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-500 mr-1" />
                No credit card required
              </div>
              <div className="flex items-center">
                <Check className="w-4 h-4 text-green-500 mr-1" />
                Cancel anytime
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SubscriptionPlans;
