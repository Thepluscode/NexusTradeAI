import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, AlertTriangle, Info, X, Settings, RefreshCw } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'error' | 'warning' | 'info';
  title: string;
  message: string;
  duration?: number;
  action?: {
    label: string;
    onClick: () => void;
  };
}

interface ToastProps {
  toast: ToastMessage;
  onClose: (id: string) => void;
}

const Toast: React.FC<ToastProps> = ({ toast, onClose }) => {
  useEffect(() => {
    if (toast.duration !== 0) {
      const timer = setTimeout(() => {
        onClose(toast.id);
      }, toast.duration || 5000);

      return () => clearTimeout(timer);
    }
  }, [toast.id, toast.duration, onClose]);

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'error':
        return <AlertTriangle className="w-5 h-5 text-red-400" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'info':
      default:
        return <Info className="w-5 h-5 text-blue-400" />;
    }
  };

  const getBorderColor = () => {
    switch (toast.type) {
      case 'success':
        return 'border-green-500/30';
      case 'error':
        return 'border-red-500/30';
      case 'warning':
        return 'border-yellow-500/30';
      case 'info':
      default:
        return 'border-blue-500/30';
    }
  };

  const getBackgroundColor = () => {
    switch (toast.type) {
      case 'success':
        return 'bg-green-500/10';
      case 'error':
        return 'bg-red-500/10';
      case 'warning':
        return 'bg-yellow-500/10';
      case 'info':
      default:
        return 'bg-blue-500/10';
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, x: 300, scale: 0.9 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.9 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={`
        relative w-full max-w-sm bg-slate-800/95 backdrop-blur-xl border rounded-xl p-4 shadow-2xl
        ${getBorderColor()} ${getBackgroundColor()}
      `}
    >
      <div className="flex items-start space-x-3">
        <div className="flex-shrink-0 mt-0.5">
          {getIcon()}
        </div>
        
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-white mb-1">
            {toast.title}
          </h4>
          <p className="text-sm text-slate-300 leading-relaxed">
            {toast.message}
          </p>
          
          {toast.action && (
            <button
              onClick={toast.action.onClick}
              className="mt-3 text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              {toast.action.label}
            </button>
          )}
        </div>
        
        <button
          onClick={() => onClose(toast.id)}
          className="flex-shrink-0 p-1 text-slate-400 hover:text-white transition-colors rounded"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </motion.div>
  );
};

interface ToastContainerProps {
  toasts: ToastMessage[];
  onClose: (id: string) => void;
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts, onClose }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast toast={toast} onClose={onClose} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
};

// Toast hook for managing toasts
export const useToast = () => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (toast: Omit<ToastMessage, 'id'>) => {
    const id = Math.random().toString(36).substr(2, 9);
    setToasts(prev => [...prev, { ...toast, id }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const clearAllToasts = () => {
    setToasts([]);
  };

  // Convenience methods
  const success = (title: string, message: string, options?: Partial<ToastMessage>) => {
    addToast({ type: 'success', title, message, ...options });
  };

  const error = (title: string, message: string, options?: Partial<ToastMessage>) => {
    addToast({ type: 'error', title, message, ...options });
  };

  const warning = (title: string, message: string, options?: Partial<ToastMessage>) => {
    addToast({ type: 'warning', title, message, ...options });
  };

  const info = (title: string, message: string, options?: Partial<ToastMessage>) => {
    addToast({ type: 'info', title, message, ...options });
  };

  return {
    toasts,
    addToast,
    removeToast,
    clearAllToasts,
    success,
    error,
    warning,
    info,
  };
};

export default Toast;
