import React from 'react';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { Provider } from 'react-redux';
import { PersistGate } from 'redux-persist/integration/react';

// Import Redux store and persistor
import { store, persistor } from '../store/store';

// Import global styles
import '../styles/globals.css';
import '../styles/premium-design-system.css';

// Loading component for PersistGate
const LoadingComponent: React.FC = () => (
  <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
    <div className="text-center">
      <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
      <p className="text-gray-600 dark:text-gray-400">Loading NexusTradeAI...</p>
    </div>
  </div>
);

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Head>
        <title>NexusTradeAI - Institutional Trading Platform</title>
        <meta name="description" content="Enterprise-grade AI-powered trading platform with quantum-enhanced strategies" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <Provider store={store}>
        <PersistGate loading={<LoadingComponent />} persistor={persistor}>
          <Component {...pageProps} />
        </PersistGate>
      </Provider>
    </>
  );
}

export default MyApp;
