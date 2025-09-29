import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { Toaster } from 'react-hot-toast';

import { store } from './store/store';
import { useAppSelector } from './store/hooks';
import Layout from './components/Layout/Layout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TradingPage from './pages/TradingPage';
import PortfolioPage from './pages/PortfolioPage';
import MarketsPage from './pages/MarketsPage';
import SettingsPage from './pages/SettingsPage';
import LoadingScreen from './components/common/LoadingScreen';

// IPC event listeners
const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAppSelector((state) => state.auth);
  const [isAppReady, setIsAppReady] = useState(false);

  useEffect(() => {
    // Set up IPC listeners
    const setupIpcListeners = () => {
      // Navigation events from menu
      window.electronAPI?.onNavigateTo((page: string) => {
        // Handle navigation from menu
        console.log('Navigate to:', page);
      });

      // Trading hotkeys
      window.electronAPI?.onNewOrder(() => {
        // Handle new order hotkey
        console.log('New order hotkey triggered');
      });

      window.electronAPI?.onQuickBuy(() => {
        // Handle quick buy
        console.log('Quick buy triggered');
      });

      window.electronAPI?.onQuickSell(() => {
        // Handle quick sell
        console.log('Quick sell triggered');
      });

      // Update events
      window.electronAPI?.onUpdateStatus((message: string) => {
        console.log('Update status:', message);
      });

      // App ready
      setIsAppReady(true);
    };

    setupIpcListeners();

    // Cleanup listeners on unmount
    return () => {
      // Remove listeners if needed
    };
  }, []);

  if (!isAppReady || isLoading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/trading" element={<TradingPage />} />
        <Route path="/portfolio" element={<PortfolioPage />} />
        <Route path="/markets" element={<MarketsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <Router>
        <div className="app">
          <AppContent />
          <Toaster
            position="top-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: '#363636',
                color: '#fff',
              },
              success: {
                duration: 3000,
                iconTheme: {
                  primary: '#4ade80',
                  secondary: '#fff',
                },
              },
              error: {
                duration: 5000,
                iconTheme: {
                  primary: '#ef4444',
                  secondary: '#fff',
                },
              },
            }}
          />
        </div>
      </Router>
    </Provider>
  );
};

export default App;
