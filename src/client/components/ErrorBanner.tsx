import React from 'react';
import { AlertCircle, X } from 'lucide-react';

interface ErrorBannerProps {
  message: string | null;
  onDismiss: () => void;
}

export const ErrorBanner: React.FC<ErrorBannerProps> = ({ message, onDismiss }) => {
  if (!message) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-4">
      <div className="bg-rose-950/60 border border-rose-800/80 text-rose-200 px-4 py-3 rounded-xl flex items-center justify-between shadow-lg shadow-rose-950/30 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <p className="text-sm font-medium">{message}</p>
        </div>
        <button
          onClick={onDismiss}
          className="p-1 text-rose-400 hover:text-rose-100 hover:bg-rose-900/50 rounded-lg transition-colors"
          aria-label="Dismiss error"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
