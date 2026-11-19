import React from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div
      role="status"
      className="fixed bottom-20 lg:bottom-4 left-4 z-50 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 shadow-md"
    >
      <WifiOff className="w-3.5 h-3.5 text-amber-600 shrink-0" />
      <span>Offline Mode — Showing locally cached workspace data</span>
    </div>
  );
};
