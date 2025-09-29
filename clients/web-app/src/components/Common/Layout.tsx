//clients/web-app/src/components/Common/Layout.tsx
import React, { ReactNode } from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

interface LayoutProps {
  children: ReactNode;
  showSidebar?: boolean;
  sidebarContent?: ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ 
  children, 
  showSidebar = true, 
  sidebarContent 
}) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 text-white">
      <Header />
      <div className="flex h-[calc(100vh-80px)]">
        {showSidebar && (
          <aside className="w-80 border-r border-slate-700 bg-slate-900/50 backdrop-blur-sm">
            {sidebarContent || <Sidebar />}
          </aside>
        )}
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;