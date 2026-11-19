import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  const handleClick = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="Install Masar HR App"
        className={`inline-flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-indigo-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
          compact ? 'min-h-[40px] min-w-[40px] px-2.5' : 'px-3 py-2 text-xs font-medium'
        }`}
      >
        <Download className="w-4 h-4 shrink-0" />
        {!compact && <span>Install App</span>}
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center shrink-0">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 id="pwa-install-title" className="text-base font-semibold text-slate-900">
                    Install Masar HR
                  </h3>
                  <p className="text-xs text-slate-500">
                    Works offline on PC, iPhone, and Android
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                aria-label="Close install instructions"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-5 space-y-3 text-sm text-slate-600">
              {isIOS ? (
                <ol className="list-decimal list-inside space-y-2">
                  <li>
                    Tap the <strong className="text-slate-900">Share</strong> button in Safari&apos;s
                    toolbar.
                  </li>
                  <li>
                    Scroll down and tap <strong className="text-slate-900">Add to Home Screen</strong>.
                  </li>
                  <li>
                    Tap <strong className="text-slate-900">Add</strong> to launch Masar HR like a native
                    iOS app.
                  </li>
                </ol>
              ) : (
                <div className="space-y-2.5">
                  <p>
                    <strong className="text-slate-900">Desktop (Chrome / Edge):</strong> Click the
                    install icon in your browser&apos;s address bar and choose{' '}
                    <strong className="text-slate-900">Install</strong>.
                  </p>
                  <p>
                    <strong className="text-slate-900">iPhone / iPad (Safari):</strong> Tap{' '}
                    <strong className="text-slate-900">Share</strong> &rarr;{' '}
                    <strong className="text-slate-900">Add to Home Screen</strong>.
                  </p>
                  <p>
                    <strong className="text-slate-900">Android (Chrome):</strong> Tap the menu
                    (&#8942;) &rarr; <strong className="text-slate-900">Install App</strong>.
                  </p>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 transition-colors cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
