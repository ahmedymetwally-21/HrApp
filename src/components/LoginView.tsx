import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  FileBadge,
  Globe,
  Landmark,
  Lock,
  Mail,
  MapPin,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  UserCheck,
  UserCog,
  Users,
} from 'lucide-react';
import { LANGUAGE_META, getRoleLabel, t } from '../i18n/translations';
import { ServerConfig } from '../services/api';
import { Language, UserRole } from '../types/hr';
import { validateApiBaseUrl } from '../utils/hrLogic';

interface LoginViewProps {
  lang: Language;
  onChangeLang: (lang: Language) => void;
  serverConfig: ServerConfig;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUpdateServerConfig: (config: ServerConfig) => void;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onDemoRoleLogin: (role: UserRole) => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({
  lang,
  onChangeLang,
  serverConfig,
  theme,
  onToggleTheme,
  onUpdateServerConfig,
  onEmailLogin,
  onDemoRoleLogin,
}) => {
  const [email, setEmail] = useState('tariq.hashemi@yaldi.ae');
  const [password, setPassword] = useState('demo1234');
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const [showServerPanel, setShowServerPanel] = useState(false);
  const [urlDraft, setUrlDraft] = useState(serverConfig.apiBaseUrl);
  const [urlFeedback, setUrlFeedback] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setSubmitting(true);
    try {
      await onEmailLogin(email, password);
    } catch (err) {
      setAuthError(err instanceof Error ? err.message : 'Unable to sign in.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveServerUrl = () => {
    const check = validateApiBaseUrl(urlDraft);
    if (!check.valid) {
      setUrlFeedback(check.error || 'Invalid URL.');
      return;
    }
    onUpdateServerConfig({ ...serverConfig, apiBaseUrl: urlDraft });
    setUrlFeedback('Server URL saved.');
  };

  const demoRoles: {
    role: UserRole;
    name: string;
    scope: string;
    icon: React.ComponentType<{ className?: string }>;
    tint: string;
  }[] = [
    {
      role: UserRole.MainManager,
      name: 'Tariq Al-Hashemi',
      scope: 'All 4 Companies · Workflow Builder · Exempt from Clock-In & Payroll',
      icon: ShieldCheck,
      tint: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
    },
    {
      role: UserRole.HRManager,
      name: 'Layla Al-Mansoori',
      scope: 'Groups · Projects · Visibility Rules · Full HR & Payroll Access',
      icon: Users,
      tint: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
    },
    {
      role: UserRole.HRAdmin,
      name: 'Layla Al-Mansoori',
      scope: 'Companies · Models · Labels · PRO Access · Payroll · Step 2 HR',
      icon: Users,
      tint: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300',
    },
    {
      role: UserRole.SectionManager,
      name: 'Karim Haddad',
      scope: 'Drivers & Ops Sections · Immediate Excuse/Edit · Step 1 Leave',
      icon: UserCog,
      tint: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300',
    },
    {
      role: UserRole.SectionCoManager,
      name: 'Priya Nair',
      scope: 'Drivers Section · Monitor & Recommend Notes Only',
      icon: UserCheck,
      tint: 'bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300',
    },
    {
      role: UserRole.PRO,
      name: 'Hassan Al-Qasimi',
      scope: 'Time-Limited Document View/Download · Zero Salary Access',
      icon: FileBadge,
      tint: 'bg-violet-50 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300',
    },
    {
      role: UserRole.Accounting,
      name: 'Nadia Mansour',
      scope: 'Salaries & Bank IBAN (Yaldi + Al Wegdaniyah Only) · Zero Docs',
      icon: Landmark,
      tint: 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300',
    },
    {
      role: UserRole.Employee,
      name: 'Omar Khalid',
      scope: 'Shared Driver · Geofenced Clock-In · Docs & My Salary',
      icon: MapPin,
      tint: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    },
  ];

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col pt-safe pb-safe">
      {/* Minimalist Header */}
      <header className="w-full max-w-5xl mx-auto px-5 py-5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {t(lang, 'brand')}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <div
            role="group"
            aria-label={t(lang, 'language')}
            className="inline-flex items-center rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-0.5"
          >
            {(['en', 'ar', 'ur'] as Language[]).map((code) => (
              <button
                key={code}
                type="button"
                onClick={() => onChangeLang(code)}
                className={`px-2.5 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                  lang === code
                    ? 'bg-teal-700 text-white'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {LANGUAGE_META[code].nativeLabel}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex items-center justify-center px-5 py-6">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sign In Card */}
          <section className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7">
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              {t(lang, 'signInTitle')}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'signInSubtitle')}
            </p>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {authError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-xl px-3.5 py-2.5"
                >
                  {authError}
                </p>
              )}

              <div>
                <label
                  htmlFor="login-email"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {t(lang, 'workEmail')}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full ps-10 pe-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                >
                  {t(lang, 'password')}
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute start-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full ps-10 pe-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[46px] rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-60"
              >
                <span>{submitting ? t(lang, 'signingIn') : t(lang, 'signIn')}</span>
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            </form>

            {/* Collapsible Self-Hosted Server URL Configuration */}
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setShowServerPanel((s) => !s)}
                aria-expanded={showServerPanel}
                className="w-full flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Server className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  {t(lang, 'serverConnection')} (
                  {serverConfig.useMockApi ? t(lang, 'demoMode') : t(lang, 'liveServerMode')})
                </span>
                {showServerPanel ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showServerPanel && (
                <div className="mt-3.5 space-y-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
                  <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 w-full">
                    <button
                      type="button"
                      onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: true })}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        serverConfig.useMockApi
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t(lang, 'demoMode')}
                    </button>
                    <button
                      type="button"
                      onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: false })}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                        !serverConfig.useMockApi
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {t(lang, 'liveServerMode')}
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="login-server-url"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      {t(lang, 'serverUrlLabel')}
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="login-server-url"
                        type="url"
                        dir="ltr"
                        value={urlDraft}
                        onChange={(e) => {
                          setUrlDraft(e.target.value);
                          setUrlFeedback(null);
                        }}
                        placeholder="http://192.168.1.50:8000/api/v1"
                        className="flex-1 min-w-0 px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={handleSaveServerUrl}
                        className="px-3 py-2 rounded-lg bg-slate-900 dark:bg-teal-600 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-teal-500 cursor-pointer shrink-0"
                      >
                        {t(lang, 'save')}
                      </button>
                    </div>
                    {urlFeedback && (
                      <p className="mt-1.5 text-[11px] text-teal-700 dark:text-teal-400">
                        {urlFeedback}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Quick Demo Role Switcher (All 5 RBAC Roles) */}
          <section className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-7">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'demoRoleSwitcher')}
                </h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'demoRoleSubtitle')}
                </p>
              </div>
              <Globe className="w-4 h-4 text-slate-400 shrink-0" />
            </div>

            {serverConfig.useMockApi ? (
              <div className="mt-4 space-y-2.5">
                {demoRoles.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.role}
                      type="button"
                      onClick={() => void onDemoRoleLogin(item.role)}
                      className="w-full p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-teal-300 dark:hover:border-teal-700 hover:bg-teal-50/40 dark:hover:bg-teal-950/30 text-start flex items-center gap-3.5 transition-colors cursor-pointer"
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${item.tint}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {getRoleLabel(lang, item.role)} — {item.name}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {item.scope}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-slate-400 shrink-0 rtl:rotate-180" />
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="mt-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p className="font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'liveServerMode')} Active
                </p>
                <p>
                  Sign in with your self-hosted PostgreSQL / REST API credentials at{' '}
                  <span className="font-mono text-slate-800 dark:text-slate-200" dir="ltr">
                    {serverConfig.apiBaseUrl}
                  </span>
                  .
                </p>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
};
