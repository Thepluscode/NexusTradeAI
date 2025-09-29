// Simple demo page for the OrderEntry component

import React from 'react';
import Head from 'next/head';
import OrderEntrySimple from '../../components/Trading/OrderEntrySimple';

const OrderEntrySimpleDemo: React.FC = () => {
  const handleOrderSubmit = (orderData: any) => {
    console.log('Order submitted:', orderData);
    alert(`Order submitted: ${orderData.side.toUpperCase()} ${orderData.quantity} ${orderData.symbol}`);
  };

  return (
    <>
      <Head>
        <title>Order Entry Simple Demo - Nexus Trade AI</title>
        <meta name="description" content="Simple Order Entry Component Demo" />
      </Head>
      
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-4">
              Enhanced Order Entry Component
            </h1>
            <p className="text-slate-400 text-lg">
              Modern, professional trading interface with dark theme and gradients
            </p>
          </div>
          
          <div className="max-w-6xl mx-auto">
            <OrderEntrySimple
              symbol="AAPL"
              currentPrice={175.84}
              onOrderSubmit={handleOrderSubmit}
            />
          </div>
          
          <div className="mt-12 text-center">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700 p-6 max-w-4xl mx-auto">
              <h2 className="text-2xl font-bold text-white mb-4">✨ Enhanced Features</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-left">
                <div className="space-y-2">
                  <h3 className="font-semibold text-blue-400">🎨 Modern UI/UX</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Dark theme with gradients</li>
                    <li>• Professional styling</li>
                    <li>• Clean typography</li>
                    <li>• Responsive design</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-green-400">🤖 AI Integration</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Live recommendations</li>
                    <li>• Confidence scoring</li>
                    <li>• Technical analysis</li>
                    <li>• Smart suggestions</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h3 className="font-semibold text-purple-400">📊 Trading Features</h3>
                  <ul className="text-sm text-slate-300 space-y-1">
                    <li>• Buy/Sell interface</li>
                    <li>• Portfolio tracking</li>
                    <li>• Balance visibility</li>
                    <li>• Order validation</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default OrderEntrySimpleDemo;
