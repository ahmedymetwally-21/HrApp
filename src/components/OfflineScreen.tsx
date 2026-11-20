import React, { useState } from 'react';
import { RefreshCw, Server, WifiOff } from 'lucide-react';
import { t } from '../i18n/translations';
import { Language } from '../types/hr';

interface OfflineScreenProps {
  lang: Language;
  serverUrl: string;
  reason?: string;
  onRetry: () => Promise<void>;
  onSwitchToDemoMode?: () => void;
}

export const OfflineScreen: React.FC<OfflineScreenProps> = ({
  lang,
  serverUrl,
  reason,
  onRetry,
  onSwitchToDemoMode,
}) => {
  const [retrying, setRetrying] = useState(false);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await onRetry();
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div
      role="alert"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center px-5 py-10 pt-safe pb-safe"
    >
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-rose-50 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900 flex items-center justify-center mx-auto">
          <WifiOff className="w-7 h-7" />
        </div>

        <h1 className="mt-5 text-xl font-bold text-slate-900 dark:text-white">
          {t(lang, 'offlineTitle')}
        </h1>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
          {reason || t(lang, 'offlineSubtitle')}
        </p>

        <div
          dir="ltr"
          className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 flex items-center justify-center gap-2 text-xs text-slate-600 dark:text-slate-400 font-mono truncate"
        >
          <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="truncate">{serverUrl}</span>
        </div>

        <div className="mt-6 space-y-2.5">
          <button
            type="button"
            onClick={() => void handleRetry()}
            disabled={retrying}
            className="w-full min-h-[46px] rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? t(lang, 'checkingConnection') : t(lang, 'retryConnection')}
          </button>

          {onSwitchToDemoMode && (
            <button
              type="button"
              onClick={onSwitchToDemoMode}
              className="w-full min-h-[42px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              {t(lang, 'switchToDemo')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
