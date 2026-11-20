import React, { useState } from 'react';
import { ArrowRight, KeyRound, Lock, LogOut, ShieldAlert } from 'lucide-react';
import { getRoleLabel, t } from '../i18n/translations';
import { Employee, Language, UserRole } from '../types/hr';
import { Avatar } from './Avatar';

export interface ForcePasswordChangeScreenProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  onChangePassword: (newPassword: string) => Promise<void>;
  onSignOut: () => Promise<void>;
}

export const ForcePasswordChangeScreen: React.FC<ForcePasswordChangeScreenProps> = ({
  lang,
  currentUser,
  activeRole,
  onChangePassword,
  onSignOut,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.trim().length < 6) {
      setError(t(lang, 'passwordMinLengthError'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t(lang, 'passwordMismatchError'));
      return;
    }
    setSubmitting(true);
    try {
      await onChangePassword(newPassword);
    } catch (err) {
      setError(err instanceof Error ? err.message : t(lang, 'passwordUpdateError'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center px-5 py-10 pt-safe pb-safe">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 shadow-sm">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar src={currentUser.avatarUrl} name={currentUser.fullName} size="md" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                {currentUser.fullName}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {getRoleLabel(lang, activeRole)} · {currentUser.employeeCode}
              </p>
            </div>
          </div>
          <div className="w-9 h-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <KeyRound className="w-4 h-4" />
          </div>
        </div>

        <div className="mt-5">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2.5 py-1 rounded-lg mb-3">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{t(lang, 'firstLoginSecurityBadge')}</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'createNewPasswordTitle')}
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {t(lang, 'createNewPasswordSubtitle')}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {error && (
            <p
              role="alert"
              className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl px-3.5 py-2.5"
            >
              {error}
            </p>
          )}

          <div>
            <label
              htmlFor="force-new-pw"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'newPassword')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="force-new-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t(lang, 'passwordMinLengthPlaceholder')}
                className="w-full ps-10 pe-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="force-confirm-pw"
              className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
            >
              {t(lang, 'confirmPassword')}
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
              <input
                id="force-confirm-pw"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t(lang, 'passwordConfirmPlaceholder')}
                className="w-full ps-10 pe-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full min-h-[46px] rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
          >
            <span>{t(lang, 'updatePassword')}</span>
            <ArrowRight className="w-4 h-4 rtl:rotate-180" />
          </button>

          <button
            type="button"
            onClick={() => void onSignOut()}
            className="w-full py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            {t(lang, 'signOut')}
          </button>
        </form>
      </div>
    </div>
  );
};

export default ForcePasswordChangeScreen;
