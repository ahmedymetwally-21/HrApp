import React, { useState } from 'react';
import {
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Lock,
  Mail,
  MapPin,
  Moon,
  Server,
  ShieldCheck,
  Sun,
  UserCheck,
  Users,
} from 'lucide-react';
import { ServerConfig } from '../services/api';
import { UserRole } from '../types/hr';
import { validateApiBaseUrl } from '../utils/hrLogic';

interface LoginViewProps {
  serverConfig: ServerConfig;
  theme: 'light' | 'dark';
  onToggleTheme: () => void;
  onUpdateServerConfig: (config: ServerConfig) => void;
  onEmailLogin: (email: string, password: string) => Promise<void>;
  onDemoRoleLogin: (role: UserRole) => Promise<void>;
}

export const LoginView: React.FC<LoginViewProps> = ({
  serverConfig,
  theme,
  onToggleTheme,
  onUpdateServerConfig,
  onEmailLogin,
  onDemoRoleLogin,
}) => {
  const [email, setEmail] = useState('omar.khalid@masar.ae');
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
      setUrlFeedback(check.error);
      return;
    }
    onUpdateServerConfig({
      ...serverConfig,
      apiBaseUrl: check.normalized,
    });
    setUrlDraft(check.normalized);
    setUrlFeedback('Server endpoint saved.');
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col pt-safe pb-safe">
      {/* Minimal Top Header */}
      <header className="px-5 sm:px-8 py-4 flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-indigo-700 text-white flex items-center justify-center shrink-0">
            <MapPin className="w-5 h-5" />
          </div>
          <span className="font-display text-lg font-bold tracking-tight text-slate-900 dark:text-white">
            Masar HR
          </span>
        </div>

        <button
          type="button"
          onClick={onToggleTheme}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center justify-center transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </header>

      {/* Main Split Login Layout */}
      <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-6 sm:py-10">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
          {/* Left Panel: Sign-In Form + Server Config */}
          <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
                Sign in to your workspace
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Geofenced attendance, UAE document vault, leave approvals, and AED payroll.
              </p>

              <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                {authError && (
                  <p
                    role="alert"
                    className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2.5"
                  >
                    {authError}
                  </p>
                )}

                <div>
                  <label
                    htmlFor="login-email"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Work Email
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="login-password"
                    className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="login-password"
                      type="password"
                      required
                      autoComplete="current-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full min-h-[46px] rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                >
                  <span>{submitting ? 'Signing In...' : 'Sign In'}</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </form>
            </div>

            {/* Collapsible Self-Hosted Server Settings */}
            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                aria-expanded={showServerPanel}
                onClick={() => setShowServerPanel((s) => !s)}
                className="w-full flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 cursor-pointer py-1"
              >
                <span className="inline-flex items-center gap-2">
                  <Server className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  Server Connection ({serverConfig.useMockApi ? 'Demo / Local Mode' : 'Self-Hosted API'})
                </span>
                {showServerPanel ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showServerPanel && (
                <div className="mt-3 space-y-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3.5">
                  <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 w-full">
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateServerConfig({ ...serverConfig, useMockApi: true })
                      }
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        serverConfig.useMockApi
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Demo / Local Mode
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateServerConfig({ ...serverConfig, useMockApi: false })
                      }
                      className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                        !serverConfig.useMockApi
                          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Self-Hosted REST API
                    </button>
                  </div>

                  <div>
                    <label
                      htmlFor="login-server-url"
                      className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      Self-Hosted Server URL (Ubuntu / PC Backend)
                    </label>
                    <div className="flex gap-2">
                      <input
                        id="login-server-url"
                        type="url"
                        value={urlDraft}
                        onChange={(e) => {
                          setUrlDraft(e.target.value);
                          setUrlFeedback(null);
                        }}
                        placeholder="http://192.168.1.50:8000/api/v1"
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={handleSaveServerUrl}
                        className="px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-700 text-white text-xs font-medium hover:bg-slate-800 dark:hover:bg-indigo-800 cursor-pointer shrink-0"
                      >
                        Save
                      </button>
                    </div>
                    {urlFeedback && (
                      <p className="mt-1 text-[11px] text-indigo-700 dark:text-indigo-400">
                        {urlFeedback}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* Right Panel: Quick Demo Role Switcher */}
          <section className="lg:col-span-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 sm:p-8 flex flex-col justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Quick Demo Role Switcher
              </h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {serverConfig.useMockApi
                  ? 'Launch immediately as any role using pre-seeded UAE workforce data.'
                  : 'Switch back to Demo / Local Mode in Server Connection to use instant demo roles.'}
              </p>

              <div className="mt-5 space-y-3">
                <button
                  type="button"
                  disabled={!serverConfig.useMockApi}
                  onClick={() => onDemoRoleLogin(UserRole.Employee)}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-950/60 transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Employee — Omar Khalid
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Geofenced clock-in/out, leave applications, personal docs & payslips
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  disabled={!serverConfig.useMockApi}
                  onClick={() => onDemoRoleLogin(UserRole.Admin)}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-950/60 transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center shrink-0">
                      <Users className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Admin (HR) — Layla Al-Mansoori
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Employee CRUD, Document Vault, Leaflet geofences, leaves & payroll deductions
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>

                <button
                  type="button"
                  disabled={!serverConfig.useMockApi}
                  onClick={() => onDemoRoleLogin(UserRole.Management)}
                  className="w-full text-left p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-slate-50/60 dark:bg-slate-950/60 transition-colors flex items-center justify-between gap-3 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white">
                        Management — Tariq Al-Hashemi
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Executive KPIs, absent/late tracking, payroll oversight & final overrides
                      </p>
                    </div>
                  </div>
                  <ArrowRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <UserCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>
                Demo credentials: <strong className="font-mono text-slate-700 dark:text-slate-300">omar.khalid@masar.ae</strong> /{' '}
                <strong className="font-mono text-slate-700 dark:text-slate-300">layla.mansoori@masar.ae</strong>
              </span>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};
