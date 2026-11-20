import React, { useState } from 'react';
import {
  AlertTriangle,
  Clock,
  LogOut,
  RefreshCw,
  Server,
  WifiOff,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { EndpointFailure, Language } from '../types/hr';

export interface StartupErrorScreenProps {
  lang: Language;
  apiBaseUrl: string;
  failures: EndpointFailure[];
  isTimeout?: boolean;
  onRetry: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onSwitchToDemoMode?: () => void;
}

export const StartupErrorScreen: React.FC<StartupErrorScreenProps> = ({
  lang,
  apiBaseUrl,
  failures,
  isTimeout = false,
  onRetry,
  onSignOut,
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

  const anyTimeout = isTimeout || failures.some((f) => f.isTimeout || f.status === 408);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center px-4 py-10 pt-safe pb-safe">
      <div
        role="alert"
        className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7 shadow-sm space-y-5"
      >
        <div className="flex items-start gap-3.5">
          <div
            className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${
              anyTimeout
                ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400'
                : 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400'
            }`}
          >
            {anyTimeout ? (
              <Clock className="w-5 h-5" />
            ) : failures.some((f) => f.status === null) ? (
              <WifiOff className="w-5 h-5" />
            ) : (
              <AlertTriangle className="w-5 h-5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-slate-900 dark:text-white">
              {anyTimeout ? t(lang, 'startupTimeoutTitle') : t(lang, 'startupErrorTitle')}
            </h1>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              {t(lang, 'startupErrorSubtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs">
          <Server className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 truncate" dir="ltr">
            {apiBaseUrl}
          </span>
        </div>

        <div className="space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {t(lang, 'failedEndpoints')} ({failures.length})
          </p>
          <div className="max-h-60 overflow-y-auto space-y-2 pe-0.5">
            {failures.map((f, idx) => {
              const statusLabel =
                f.status !== null
                  ? `${f.status}${f.statusText ? ` ${f.statusText}` : ''}`
                  : f.isTimeout
                    ? 'TIMEOUT'
                    : 'NETWORK';
              const badgeClass =
                f.status === 403
                  ? 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                  : f.status === 404
                    ? 'bg-orange-50 dark:bg-orange-950/60 text-orange-800 dark:text-orange-300 border-orange-200 dark:border-orange-900'
                    : 'bg-rose-50 dark:bg-rose-950/60 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-900';
              return (
                <div
                  key={`${f.endpoint}-${idx}`}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 p-3 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <code
                      dir="ltr"
                      className="text-xs font-mono font-semibold text-slate-900 dark:text-slate-100"
                    >
                      GET {f.endpoint}
                    </code>
                    <span
                      dir="ltr"
                      className={`inline-flex items-center px-2 py-0.5 rounded-md border text-[11px] font-mono font-semibold ${badgeClass}`}
                    >
                      {statusLabel}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 break-words">
                    {f.message}
                  </p>
                </div>
              );
            })}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row gap-2.5">
          <button
            type="button"
            disabled={retrying}
            onClick={() => void handleRetry()}
            className="flex-1 min-h-[44px] px-4 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            <span>{retrying ? t(lang, 'retrying') : t(lang, 'retry')}</span>
          </button>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="flex-1 min-h-[44px] px-4 rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span>{t(lang, 'signOut')}</span>
          </button>
        </div>

        {onSwitchToDemoMode && (
          <button
            type="button"
            onClick={onSwitchToDemoMode}
            className="w-full py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors cursor-pointer"
          >
            {t(lang, 'switchToDemo')}
          </button>
        )}
      </div>
    </div>
  );
};

export default StartupErrorScreen;
