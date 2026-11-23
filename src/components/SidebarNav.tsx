import React, { useEffect, useState } from 'react';
import {
  Banknote,
  Building2,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ClipboardCheck,
  Clock,
  EyeOff,
  FileText,
  FolderKanban,
  GitBranch,
  KeyRound,
  Layers,
  LayoutDashboard,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Users,
  Wallet,
  Workflow,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { Language, UserRole } from '../types/hr';
import {
  getGroupForRoute,
  NavSection,
  SIDEBAR_GROUPS,
  SidebarGroupId,
} from '../types/nav';

interface SidebarNavProps {
  lang: Language;
  activeRole: UserRole;
  activeNav: NavSection;
  allowedNavIds: NavSection[];
  collapsed: boolean;
  pendingDeductionCount?: number;
  pendingRequestsCount?: number;
  onSelectNav: (nav: NavSection) => void;
  onToggleCollapse: () => void;
}

const GROUP_ICONS: Record<SidebarGroupId, React.ComponentType<{ className?: string }>> = {
  people: Users,
  time: Clock,
  payroll: Wallet,
  settings: Settings,
};

const ITEM_ICONS: Record<NavSection, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  requests: ClipboardCheck,
  employees: Users,
  documents: FileText,
  pro_assignments: KeyRound,
  attendance: Clock,
  roster: CalendarDays,
  leaves: CalendarClock,
  payroll: Wallet,
  earnings_deductions: SlidersHorizontal,
  deduction_approvals: ShieldCheck,
  patch_releases: Banknote,
  release_schedules: CalendarClock,
  settings_companies: Building2,
  settings_groups: Layers,
  settings_projects: FolderKanban,
  settings_visibility_rules: EyeOff,
  settings_workflow_templates: Workflow,
  settings_models: Users,
  settings_geofences: MapPin,
  settings_payroll_workflows: GitBranch,
  settings_general: Settings,
};

export const SidebarNav: React.FC<SidebarNavProps> = ({
  lang,
  activeRole,
  activeNav,
  allowedNavIds,
  collapsed,
  pendingDeductionCount = 0,
  pendingRequestsCount = 0,
  onSelectNav,
  onToggleCollapse,
}) => {
  const allowedSet = new Set(allowedNavIds);

  const [expandedGroups, setExpandedGroups] = useState<Record<SidebarGroupId, boolean>>(() => {
    const activeGroup = getGroupForRoute(activeNav);
    return {
      people: activeGroup === 'people' || activeGroup === null,
      time: activeGroup === 'time',
      payroll: activeGroup === 'payroll',
      settings: activeGroup === 'settings',
    };
  });

  // Always auto-expand the group containing the currently active route
  useEffect(() => {
    const activeGroup = getGroupForRoute(activeNav);
    if (activeGroup) {
      setExpandedGroups((prev) => (prev[activeGroup] ? prev : { ...prev, [activeGroup]: true }));
    }
  }, [activeNav]);

  const toggleGroup = (groupId: SidebarGroupId) => {
    setExpandedGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const getItemLabel = (id: NavSection, fallbackKey: string): string => {
    if (id === 'roster') {
      return 'Monthly Roster';
    }
    if (id === 'payroll' && activeRole === UserRole.Employee) {
      return t(lang, 'navMySalary');
    }
    if (id === 'documents' && activeRole === UserRole.Employee) {
      return t(lang, 'navMyDocs');
    }
    if (id === 'employees' && activeRole === UserRole.PRO) {
      return t(lang, 'navProDocs');
    }
    return t(lang, fallbackKey);
  };

  const visibleGroups = SIDEBAR_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => allowedSet.has(item.id)),
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={`hidden lg:flex flex-col border-e border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0 transition-[width] duration-200 print:hidden ${
        collapsed ? 'w-[72px]' : 'w-64'
      }`}
    >
      <nav aria-label="Main Navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {/* Top-level single item: Dashboard */}
        {allowedSet.has('dashboard') && (
          <button
            type="button"
            onClick={() => onSelectNav('dashboard')}
            title={collapsed ? t(lang, 'navDashboard') : undefined}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
              activeNav === 'dashboard'
                ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white font-medium'
            } ${collapsed ? 'justify-center px-2' : ''}`}
          >
            <LayoutDashboard className="w-[18px] h-[18px] shrink-0" />
            {!collapsed && <span className="truncate">{t(lang, 'navDashboard')}</span>}
          </button>
        )}

        {/* Top-level single item: Approvals & Requests (with live pending badge) */}
        {allowedSet.has('requests') && (
          <button
            type="button"
            onClick={() => onSelectNav('requests')}
            title={
              collapsed
                ? pendingRequestsCount > 0
                  ? `Approvals & Requests (${pendingRequestsCount})`
                  : 'Approvals & Requests'
                : undefined
            }
            className={`relative w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${
              activeNav === 'requests'
                ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300 font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white font-medium'
            } ${collapsed ? 'justify-center px-2' : 'justify-between'}`}
          >
            <span className="flex items-center gap-3 min-w-0">
              <ClipboardCheck className="w-[18px] h-[18px] shrink-0" />
              {!collapsed && <span className="truncate">Approvals &amp; Requests</span>}
            </span>
            {pendingRequestsCount > 0 && !collapsed && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[11px] font-mono tabular-nums font-semibold shrink-0">
                {pendingRequestsCount > 99 ? '99+' : pendingRequestsCount}
              </span>
            )}
            {pendingRequestsCount > 0 && collapsed && (
              <span className="absolute top-1.5 end-1.5 min-w-[16px] h-4 px-1 rounded-full bg-rose-600 text-white text-[10px] font-mono tabular-nums font-bold flex items-center justify-center">
                {pendingRequestsCount > 9 ? '9+' : pendingRequestsCount}
              </span>
            )}
          </button>
        )}

        {/* Collapsible Groups */}
        {visibleGroups.map((group) => {
          const GroupIcon = GROUP_ICONS[group.id];
          const isGroupActive = group.items.some((i) => i.id === activeNav);
          const isOpen = expandedGroups[group.id];

          if (collapsed) {
            // In collapsed rail mode, show direct clickable icons for each item in the group
            return (
              <div
                key={group.id}
                className="pt-2 mt-2 border-t border-slate-100 dark:border-slate-800 space-y-1"
              >
                {group.items.map((item) => {
                  const Icon = ITEM_ICONS[item.id];
                  const active = activeNav === item.id;
                  const label = getItemLabel(item.id, item.labelKey);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectNav(item.id)}
                      title={label}
                      aria-label={label}
                      className={`w-full flex items-center justify-center p-2.5 rounded-lg transition-colors cursor-pointer ${
                        active
                          ? 'bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                          : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70 hover:text-slate-900 dark:hover:text-white'
                      }`}
                    >
                      <Icon className="w-[18px] h-[18px] shrink-0" />
                    </button>
                  );
                })}
              </div>
            );
          }

          return (
            <div key={group.id} className="pt-1">
              <button
                type="button"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={isOpen}
                className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  isGroupActive
                    ? 'text-teal-700 dark:text-teal-300 bg-teal-50/40 dark:bg-teal-950/20'
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <GroupIcon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{t(lang, group.labelKey)}</span>
                </span>
                <ChevronDown
                  className={`w-3.5 h-3.5 shrink-0 transition-transform duration-150 ${
                    isOpen ? 'rotate-0' : '-rotate-90 rtl:rotate-90'
                  }`}
                />
              </button>

              {isOpen && (
                <div className="mt-1 ms-3 ps-3 border-s border-slate-200/80 dark:border-slate-800 space-y-0.5">
                  {group.items.map((item) => {
                    const active = activeNav === item.id;
                    const label = getItemLabel(item.id, item.labelKey);
                    const showBadge =
                      item.id === 'deduction_approvals' && pendingDeductionCount > 0;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => onSelectNav(item.id)}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-[13px] transition-colors cursor-pointer text-start ${
                          active
                            ? 'bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 font-semibold'
                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-white font-medium'
                        }`}
                      >
                        <span className="truncate">{label}</span>
                        {showBadge && (
                          <span className="text-[11px] font-mono tabular-nums font-semibold text-rose-600 dark:text-rose-400 shrink-0">
                            {pendingDeductionCount}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Collapse Rail Footer */}
      <div className="p-3 border-t border-slate-100 dark:border-slate-800">
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 transition-colors cursor-pointer"
        >
          {collapsed ? (
            <PanelLeftOpen className="w-4 h-4 rtl:rotate-180" />
          ) : (
            <>
              <PanelLeftClose className="w-4 h-4 rtl:rotate-180" />
              <span>{t(lang, 'collapseSidebar')}</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
};
