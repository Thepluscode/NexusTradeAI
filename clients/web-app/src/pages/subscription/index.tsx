// Subscription Index Page - NexusTradeAI
// Redirects to the plans page

import { useEffect } from 'react';
import { useRouter } from 'next/router';

const SubscriptionIndex: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the plans page
    router.replace('/subscription/plans');
  }, [router]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-white">Redirecting to subscription plans...</p>
      </div>
    </div>
  );
};

export default SubscriptionIndex;
