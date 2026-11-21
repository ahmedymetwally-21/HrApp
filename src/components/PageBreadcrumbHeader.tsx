import React from 'react';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { t } from '../i18n/translations';
import { Language } from '../types/hr';

interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

interface PageBreadcrumbHeaderProps {
  lang: Language;
  breadcrumbs?: BreadcrumbItem[];
  crumbs?: BreadcrumbItem[];
  title: string;
  subtitle?: string;
  onBack: () => void;
  actions?: React.ReactNode;
}

export const PageBreadcrumbHeader: React.FC<PageBreadcrumbHeaderProps> = ({
  lang,
  breadcrumbs,
  crumbs,
  title,
  subtitle,
  onBack,
  actions,
}) => {
  const trail = breadcrumbs ?? crumbs ?? [];
  return (
    <div className="space-y-3">
      {/* Breadcrumb bar + Back button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5 rtl:rotate-180" />
            <span>{t(lang, 'back')}</span>
          </button>

          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 min-w-0 overflow-hidden">
            {trail.map((crumb, idx) => {
              const isLast = idx === trail.length - 1;
              return (
                <React.Fragment key={`${crumb.label}-${idx}`}>
                  {idx > 0 && (
                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 shrink-0 rtl:rotate-180" />
                  )}
                  {crumb.onClick && !isLast ? (
                    <button
                      type="button"
                      onClick={crumb.onClick}
                      className="hover:text-teal-700 dark:hover:text-teal-400 transition-colors truncate cursor-pointer"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span
                      className={`truncate ${
                        isLast ? 'font-medium text-slate-800 dark:text-slate-200' : ''
                      }`}
                    >
                      {crumb.label}
                    </span>
                  )}
                </React.Fragment>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main Title + Right Action Slot */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
      </div>
    </div>
  );
};
