import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface SlideOverDrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  maxWidthClass?: string;
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}

export const SlideOverDrawer: React.FC<SlideOverDrawerProps> = ({
  open,
  onClose,
  title,
  subtitle,
  maxWidthClass = 'max-w-xl',
  headerExtra,
  children,
}) => {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/50 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} h-full bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden`}
      >
        <div className="px-5 py-4 pt-safe border-b border-slate-200 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
          <div className="min-w-0">
            <h3 className="text-base font-semibold text-slate-900 dark:text-white truncate">
              {title}
            </h3>
            {subtitle && (
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {subtitle}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {headerExtra}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close drawer"
              className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 pb-safe">{children}</div>
      </div>
    </div>
  );
};
