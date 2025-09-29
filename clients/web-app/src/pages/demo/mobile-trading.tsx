// Mobile Trading Demo Page

import React, { useState } from 'react';
import Head from 'next/head';
import { motion, AnimatePresence } from 'framer-motion';
import MobileTradingDashboard from '../../components/Mobile/MobileTradingDashboard';
import MobileOrderEntry from '../../components/Mobile/MobileOrderEntry';
import { Smartphone, Tablet, Monitor } from 'lucide-react';

const MobileTradingDemo: React.FC = () => {
  const [showOrderEntry, setShowOrderEntry] = useState(false);
  const [deviceView, setDeviceView] = useState<'mobile' | 'tablet' | 'desktop'>('mobile');

  const handleOrderSubmit = (orderData: any) => {
    console.log('Order submitted:', orderData);
    // Handle order submission
  };

  const getDeviceClass = () => {
    switch (deviceView) {
      case 'mobile':
        return 'max-w-sm mx-auto';
      case 'tablet':
        return 'max-w-md mx-auto';
      case 'desktop':
        return 'max-w-lg mx-auto';
      default:
        return 'max-w-sm mx-auto';
    }
  };

  return (
    <>
      <Head>
        <title>Mobile Trading Demo - NexusTradeAI</title>
        <meta name="description" content="Mobile-optimized trading interface demo" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800">
        {/* Desktop Controls */}
        <div className="hidden md:block fixed top-4 left-4 z-50">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4">
            <h3 className="text-white font-semibold mb-3">Device Preview</h3>
            <div className="flex space-x-2">
              <button
                onClick={() => setDeviceView('mobile')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  deviceView === 'mobile'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Smartphone className="w-4 h-4" />
                <span>Mobile</span>
              </button>
              <button
                onClick={() => setDeviceView('tablet')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  deviceView === 'tablet'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Tablet className="w-4 h-4" />
                <span>Tablet</span>
              </button>
              <button
                onClick={() => setDeviceView('desktop')}
                className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                  deviceView === 'desktop'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Monitor className="w-4 h-4" />
                <span>Desktop</span>
              </button>
            </div>
            
            <div className="mt-4 pt-4 border-t border-slate-700">
              <button
                onClick={() => setShowOrderEntry(true)}
                className="w-full bg-gradient-to-r from-green-600 to-green-500 text-white px-4 py-2 rounded-lg font-medium hover:from-green-700 hover:to-green-600 transition-all"
              >
                Open Order Entry
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Demo Container */}
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className={`${getDeviceClass()} transition-all duration-300`}>
            {/* Device Frame */}
            <div className="relative">
              {/* Mobile Frame */}
              {deviceView === 'mobile' && (
                <div className="relative bg-slate-900 rounded-[2.5rem] p-2 shadow-2xl border-4 border-slate-800">
                  <div className="bg-black rounded-[2rem] overflow-hidden relative">
                    {/* Notch */}
                    <div className="absolute top-0 left-1/2 transform -translate-x-1/2 w-32 h-6 bg-black rounded-b-2xl z-10"></div>
                    
                    {/* Screen Content */}
                    <div className="relative z-0">
                      <MobileTradingDashboard />
                    </div>
                  </div>
                </div>
              )}

              {/* Tablet Frame */}
              {deviceView === 'tablet' && (
                <div className="relative bg-slate-900 rounded-3xl p-4 shadow-2xl border-4 border-slate-800">
                  <div className="bg-black rounded-2xl overflow-hidden">
                    <MobileTradingDashboard />
                  </div>
                </div>
              )}

              {/* Desktop Frame */}
              {deviceView === 'desktop' && (
                <div className="relative bg-slate-900 rounded-2xl p-6 shadow-2xl border-4 border-slate-800">
                  <div className="bg-black rounded-xl overflow-hidden">
                    <MobileTradingDashboard />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Order Entry Modal */}
        <AnimatePresence>
          {showOrderEntry && (
            <MobileOrderEntry
              symbol="BTC-USDT"
              currentPrice={43250.67}
              onOrderSubmit={handleOrderSubmit}
              onClose={() => setShowOrderEntry(false)}
            />
          )}
        </AnimatePresence>

        {/* Mobile Instructions */}
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-40">
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4"
          >
            <h3 className="text-white font-semibold mb-2">Mobile Trading Demo</h3>
            <p className="text-slate-400 text-sm mb-3">
              Experience professional trading on mobile with touch-optimized interface and gesture controls.
            </p>
            <button
              onClick={() => setShowOrderEntry(true)}
              className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white px-4 py-2 rounded-lg font-medium"
            >
              Try Order Entry
            </button>
          </motion.div>
        </div>

        {/* Features List */}
        <div className="hidden lg:block fixed top-4 right-4 z-50">
          <div className="bg-slate-900/90 backdrop-blur-xl border border-slate-700/50 rounded-xl p-4 max-w-xs">
            <h3 className="text-white font-semibold mb-3">Mobile Features</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Touch-optimized interface</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Swipe gestures</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Quick order entry</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Real-time portfolio</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Responsive design</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-slate-300">Dark mode optimized</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default MobileTradingDemo;
