import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Crosshair,
  Globe,
  KeyRound,
  Laptop,
  LogOut,
  Moon,
  Server,
  Smartphone,
  Sun,
  UserCog,
  X,
} from 'lucide-react';
import { LANGUAGE_META, getRoleLabel, t } from '../i18n/translations';
import { ServerConfig } from '../services/api';
import { Employee, Language, UserRole } from '../types/hr';
import { validateApiBaseUrl } from '../utils/hrLogic';
import { Avatar } from './Avatar';

export type SimPreset =
  | 'live'
  | 'inside_primary'
  | 'outside'
  | 'late_25m'
  | 'low_accuracy';

interface ProfileSettingsMenuProps {
  open: boolean;
  onClose: () => void;
  currentUser: Employee;
  activeRole: UserRole;
  lang: Language;
  theme: 'light' | 'dark';
  serverConfig: ServerConfig;
  simPreset: SimPreset;
  simulatedDevice: 'mobile' | 'desktop';
  onChangeLang: (lang: Language) => void;
  onToggleTheme: () => void;
  onSwitchDemoRole: (role: UserRole) => void;
  onChangeSimPreset: (preset: SimPreset) => void;
  onChangeSimulatedDevice: (device: 'mobile' | 'desktop') => void;
  onRequestLiveGPS: () => void;
  onUpdateServerConfig: (cfg: ServerConfig) => void;
  onOpenChangePassword: () => void;
  onSignOut: () => void;
}

export const ProfileSettingsMenu: React.FC<ProfileSettingsMenuProps> = ({
  open,
  onClose,
  currentUser,
  activeRole,
  lang,
  theme,
  serverConfig,
  simPreset,
  simulatedDevice,
  onChangeLang,
  onToggleTheme,
  onSwitchDemoRole,
  onChangeSimPreset,
  onChangeSimulatedDevice,
  onRequestLiveGPS,
  onUpdateServerConfig,
  onOpenChangePassword,
  onSignOut,
}) => {
  const [showSim, setShowSim] = useState(false);
  const [showServer, setShowServer] = useState(false);
  const [urlDraft, setUrlDraft] = useState(serverConfig.apiBaseUrl);
  const [urlMsg, setUrlMsg] = useState<string | null>(null);

  if (!open) return null;

  const handleSaveUrl = () => {
    const check = validateApiBaseUrl(urlDraft);
    if (!check.valid) {
      setUrlMsg(check.error || 'Invalid URL');
      return;
    }
    onUpdateServerConfig({ ...serverConfig, apiBaseUrl: urlDraft });
    setUrlMsg('Saved');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/35 backdrop-blur-xs"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="User profile and quick settings"
        className="w-full max-w-sm h-full bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden"
      >
        {/* User Summary */}
        <div className="p-5 pt-safe border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
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
          <button
            type="button"
            onClick={onClose}
            aria-label={t(lang, 'close')}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Language Switcher (EN / AR / UR) */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Globe className="w-3.5 h-3.5" />
              <span>{t(lang, 'language')}</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
              {(['en', 'ar', 'ur'] as Language[]).map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => onChangeLang(code)}
                  className={`py-2 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    lang === code
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {LANGUAGE_META[code].nativeLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Appearance Toggle */}
          <div className="flex items-center justify-between gap-3 py-2 border-y border-slate-100 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
              {t(lang, 'appearance')}
            </span>
            <button
              type="button"
              onClick={onToggleTheme}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {theme === 'dark' ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  {t(lang, 'lightMode')}
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-indigo-600" />
                  {t(lang, 'darkMode')}
                </>
              )}
            </button>
          </div>

          {/* Demo Role Switcher */}
          {serverConfig.useMockApi && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
                <UserCog className="w-3.5 h-3.5" />
                <span>{t(lang, 'demoRoleSwitcher')}</span>
              </div>
              <div className="space-y-1">
                {(Object.values(UserRole) as UserRole[]).map((role) => (
                  <button
                    key={role}
                    type="button"
                    onClick={() => {
                      onSwitchDemoRole(role);
                      onClose();
                    }}
                    className={`w-full px-3 py-2 rounded-lg text-start text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                      activeRole === role
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200 font-semibold'
                        : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <span>{getRoleLabel(lang, role)}</span>
                    {activeRole === role && (
                      <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Collapsible Simulate GPS (Demo Mode) */}
          {serverConfig.useMockApi && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowSim((s) => !s)}
                aria-expanded={showSim}
                className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span className="inline-flex items-center gap-2">
                  <Crosshair className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  {t(lang, 'simulateGps')}
                </span>
                {showSim ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>
              {showSim && (
                <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-2.5">
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { id: 'inside_primary', label: 'Inside Zone' },
                        { id: 'outside', label: 'Outside (420m)' },
                        { id: 'late_25m', label: 'Late (+25m)' },
                        { id: 'low_accuracy', label: 'Low GPS (280m)' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => onChangeSimPreset(p.id)}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                          simPreset === p.id
                            ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5">
                      <button
                        type="button"
                        onClick={() => onChangeSimulatedDevice('mobile')}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          simulatedDevice === 'mobile'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Smartphone className="w-3 h-3" />
                        Mobile
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeSimulatedDevice('desktop')}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-medium cursor-pointer ${
                          simulatedDevice === 'desktop'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                            : 'text-slate-500 dark:text-slate-400'
                        }`}
                      >
                        <Laptop className="w-3 h-3" />
                        PC Web
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={onRequestLiveGPS}
                      className="text-[11px] font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
                    >
                      Live GPS
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Collapsible Server Connection Settings */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            <button
              type="button"
              onClick={() => setShowServer((s) => !s)}
              aria-expanded={showServer}
              className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <Server className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                {t(lang, 'serverConnection')}
              </span>
              {showServer ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showServer && (
              <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 space-y-2.5">
                <div className="inline-flex rounded-lg bg-slate-200/70 dark:bg-slate-800 p-0.5 w-full">
                  <button
                    type="button"
                    onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: true })}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                      serverConfig.useMockApi
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t(lang, 'demoMode')}
                  </button>
                  <button
                    type="button"
                    onClick={() => onUpdateServerConfig({ ...serverConfig, useMockApi: false })}
                    className={`flex-1 py-1 text-[11px] font-semibold rounded cursor-pointer ${
                      !serverConfig.useMockApi
                        ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {t(lang, 'liveServerMode')}
                  </button>
                </div>
                <div className="flex gap-1.5">
                  <input
                    type="url"
                    dir="ltr"
                    value={urlDraft}
                    onChange={(e) => {
                      setUrlDraft(e.target.value);
                      setUrlMsg(null);
                    }}
                    className="flex-1 min-w-0 px-2.5 py-1.5 text-[11px] font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={handleSaveUrl}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-[11px] font-medium cursor-pointer"
                  >
                    {t(lang, 'save')}
                  </button>
                </div>
                {urlMsg && <p className="text-[11px] text-indigo-700 dark:text-indigo-400">{urlMsg}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Account Actions: Change Password + Sign Out */}
        <div className="p-4 pb-safe border-t border-slate-200 dark:border-slate-800 space-y-2">
          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenChangePassword();
            }}
            className="w-full min-h-[40px] rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            {t(lang, 'changePassword')}
          </button>
          <button
            type="button"
            onClick={() => {
              onClose();
              onSignOut();
            }}
            className="w-full min-h-[42px] rounded-xl border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            {t(lang, 'signOut')}
          </button>
        </div>
      </div>
    </div>
  );
};
