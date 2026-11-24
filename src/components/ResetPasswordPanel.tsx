import React, { useEffect, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { Language } from '../types/hr';
import { generateTemporaryPassword } from '../utils/hrLogic';

interface ResetPasswordPanelProps {
  lang: Language;
  employeeId: string;
  employeeName: string;
  employeeEmail: string;
  open: boolean;
  onClose: () => void;
  onResetPassword: (employeeId: string, newPassword: string) => Promise<void>;
}

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

export const ResetPasswordPanel: React.FC<ResetPasswordPanelProps> = ({
  lang,
  employeeId,
  employeeName,
  employeeEmail,
  open,
  onClose,
  onResetPassword,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completedPassword, setCompletedPassword] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Clear sensitive temporary password state if target employee changes
  useEffect(() => {
    setNewPassword('');
    setConfirmPassword('');
    setShowNewPassword(false);
    setShowConfirmPassword(false);
    setError(null);
    setCompletedPassword(null);
    setCopied(false);
  }, [employeeId]);

  const handleGenerateRandom = () => {
    const generated = generateTemporaryPassword(10);
    setNewPassword(generated);
    setConfirmPassword(generated);
    setShowNewPassword(true);
    setShowConfirmPassword(true);
    setError(null);
  };

  const handleCopyPassword = async () => {
    if (!completedPassword) return;
    let didCopy = false;
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(completedPassword);
        didCopy = true;
      } catch {
        didCopy = false;
      }
    }
    if (!didCopy) {
      try {
        const textarea = document.createElement('textarea');
        textarea.value = completedPassword;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        didCopy = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch {
        didCopy = false;
      }
    }
    if (didCopy) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (trimmedNew.length < 6) {
      setError(t(lang, 'resetPasswordMinLengthError'));
      return;
    }
    if (trimmedNew !== trimmedConfirm) {
      setError(t(lang, 'resetPasswordMismatchError'));
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      await onResetPassword(employeeId, trimmedNew);
      setCompletedPassword(trimmedNew);
      setNewPassword('');
      setConfirmPassword('');
      setCopied(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'passwordUpdateError'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleCloseForm = () => {
    setNewPassword('');
    setConfirmPassword('');
    setError(null);
    onClose();
  };

  const handleDismissSuccess = () => {
    setCompletedPassword(null);
    setCopied(false);
  };

  if (!open && !completedPassword) return null;

  return (
    <div className="space-y-4">
      {completedPassword && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/90 dark:bg-emerald-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
        >
          <div className="flex items-start gap-3 min-w-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-emerald-900 dark:text-emerald-200">
                {t(lang, 'resetPasswordSuccessTitle')} — {employeeName}
              </p>
              <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-0.5">
                {t(lang, 'resetPasswordSuccessBody')}
              </p>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-mono text-xs font-semibold text-slate-900 dark:text-slate-100 select-all">
                  {completedPassword}
                </span>
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>{t(lang, 'copied')}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>{t(lang, 'copyPassword')}</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleDismissSuccess}
            aria-label={t(lang, 'close')}
            className="self-start p-1.5 rounded-lg text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {open && (
        <section
          aria-label={t(lang, 'resetPasswordTitle')}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs"
        >
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900 flex items-center justify-center shrink-0">
                <KeyRound className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {t(lang, 'resetPasswordTitle')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {employeeName} · {employeeEmail}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCloseForm}
              aria-label={t(lang, 'close')}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate className="p-5 space-y-4">
            {error && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <label
                    htmlFor={`reset-new-pwd-${employeeId}`}
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400"
                  >
                    {t(lang, 'newTemporaryPassword')} *
                  </label>
                  <button
                    type="button"
                    onClick={handleGenerateRandom}
                    className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>{t(lang, 'generateRandom')}</span>
                  </button>
                </div>
                <div className="relative">
                  <input
                    id={`reset-new-pwd-${employeeId}`}
                    type={showNewPassword ? 'text' : 'password'}
                    minLength={6}
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => {
                      setNewPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={t(lang, 'passwordMinLengthPlaceholder')}
                    className={`${INPUT_CLASS} pe-10 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={
                      showNewPassword ? t(lang, 'hidePassword') : t(lang, 'showPassword')
                    }
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label
                  htmlFor={`reset-confirm-pwd-${employeeId}`}
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  {t(lang, 'confirmNewPassword')} *
                </label>
                <div className="relative">
                  <input
                    id={`reset-confirm-pwd-${employeeId}`}
                    type={showConfirmPassword ? 'text' : 'password'}
                    minLength={6}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => {
                      setConfirmPassword(e.target.value);
                      if (error) setError(null);
                    }}
                    placeholder={t(lang, 'passwordConfirmPlaceholder')}
                    className={`${INPUT_CLASS} pe-10 font-mono`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={
                      showConfirmPassword ? t(lang, 'hidePassword') : t(lang, 'showPassword')
                    }
                    className="absolute inset-y-0 end-0 px-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-300">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>{t(lang, 'resetPasswordNextLoginNote')}</span>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleCloseForm}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>
                  {submitting
                    ? t(lang, 'resetPasswordResetting')
                    : t(lang, 'resetPasswordConfirmAction')}
                </span>
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
};
