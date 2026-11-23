import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  ClipboardCheck,
  Compass,
  FolderKanban,
  Layers,
  Megaphone,
  Search,
  Users,
  X,
} from 'lucide-react';
import {
  Announcement,
  Employee,
  EmployeeGroup,
  Project,
  UnifiedRequest,
} from '../types/hr';
import type { NavSection } from '../types/nav';

interface GlobalSearchModalProps {
  open: boolean;
  onClose: () => void;
  allowedNavIds: NavSection[];
  employees: Employee[];
  requests: UnifiedRequest[];
  projects: Project[];
  groups: EmployeeGroup[];
  announcements: Announcement[];
  onNavigate: (nav: NavSection) => void;
}

const NAV_DIRECTORY: { id: NavSection; title: string; subtitle: string; keywords: string }[] = [
  { id: 'dashboard', title: 'Home', subtitle: 'Workspace overview & announcements', keywords: 'dashboard home overview' },
  { id: 'requests', title: 'Approvals & Requests', subtitle: 'Unified approvals inbox & request submission', keywords: 'requests approvals inbox' },
  { id: 'employees', title: 'Employees Directory', subtitle: 'Manage workforce profiles & records', keywords: 'employees team staff directory' },
  { id: 'documents', title: 'Documents Vault', subtitle: 'Passports, visas, Emirates IDs & compliance', keywords: 'documents vault visa passport' },
  { id: 'pro_assignments', title: 'PRO Assignments', subtitle: 'Time-limited PRO document access', keywords: 'pro assignments access' },
  { id: 'attendance', title: 'Attendance Logs & Clock-In', subtitle: 'Geofenced punches & lateness review', keywords: 'attendance clock in out gps' },
  { id: 'roster', title: 'Monthly Roster', subtitle: 'Monthly shift schedules & bulk Excel upload', keywords: 'roster schedule shifts excel' },
  { id: 'leaves', title: 'Leave Requests', subtitle: 'Annual, sick & emergency leave approvals', keywords: 'leaves vacation time off' },
  { id: 'payroll', title: 'Payroll Overview & WPS', subtitle: 'Monthly AED payroll, approval gate & WPS export', keywords: 'payroll salary wps payslip' },
  { id: 'earnings_deductions', title: 'Earnings & Deductions', subtitle: 'In-payroll and off-cycle entries', keywords: 'earnings deductions bonus allowance' },
  { id: 'deduction_approvals', title: 'Deduction Approvals', subtitle: 'Off-day & latency deduction workflows', keywords: 'deduction approvals latency' },
  { id: 'patch_releases', title: 'Patch Money Releases', subtitle: 'Mid-month partial disbursements', keywords: 'patch releases advance cash' },
  { id: 'release_schedules', title: 'Release Schedules', subtitle: 'Scoped salary release & approval gating', keywords: 'release schedules salary dates' },
  { id: 'settings_companies', title: 'Companies', subtitle: 'Group entities & WPS configuration', keywords: 'settings companies mol iban' },
  { id: 'settings_groups', title: 'Employee Groups', subtitle: 'Manage custom employee groups', keywords: 'settings groups tags' },
  { id: 'settings_projects', title: 'Projects', subtitle: 'Projects, managers & supervisors', keywords: 'settings projects sites' },
  { id: 'settings_visibility_rules', title: 'Visibility Rules', subtitle: 'Hide sensitive sections by audience', keywords: 'settings visibility rules privacy' },
  { id: 'settings_workflow_templates', title: 'Named Workflows', subtitle: 'Approval templates & module assignments', keywords: 'settings workflow templates approvals' },
  { id: 'settings_models', title: 'Employee Models', subtitle: 'Shifts, grace periods & leave quotas', keywords: 'settings models shifts' },
  { id: 'settings_geofences', title: 'Geofences & Policy', subtitle: 'Office GPS zones & clock-in policy', keywords: 'settings geofences locations gps' },
  { id: 'settings_payroll_workflows', title: 'Payroll Workflows & Categories', subtitle: 'Earnings categories & escalation rules', keywords: 'settings payroll workflows categories' },
  { id: 'settings_general', title: 'General Settings', subtitle: 'Sections, doc types & Dashboard Quick Actions', keywords: 'settings general quick actions sections' },
];

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  open,
  onClose,
  allowedNavIds,
  employees,
  requests,
  projects,
  groups,
  announcements,
  onNavigate,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 10);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const allowedSet = useMemo(() => new Set(allowedNavIds), [allowedNavIds]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    const pages = NAV_DIRECTORY.filter((item) => {
      if (!allowedSet.has(item.id)) return false;
      if (!q) return true;
      return `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase().includes(q);
    }).slice(0, q ? 8 : 6);

    const matchedEmployees =
      q && allowedSet.has('employees')
        ? employees
            .filter((emp) =>
              `${emp.fullName} ${emp.employeeCode} ${emp.email} ${emp.jobTitle}`
                .toLowerCase()
                .includes(q)
            )
            .slice(0, 6)
        : [];

    const matchedRequests =
      q && allowedSet.has('requests')
        ? requests
            .filter((req) =>
              `${req.id} ${req.employeeName ?? ''} ${req.category} ${req.reason}`
                .toLowerCase()
                .includes(q)
            )
            .slice(0, 6)
        : [];

    const matchedProjects =
      q && allowedSet.has('settings_projects')
        ? projects
            .filter((p) => `${p.name} ${p.code}`.toLowerCase().includes(q))
            .slice(0, 5)
        : [];

    const matchedGroups =
      q && allowedSet.has('settings_groups')
        ? groups
            .filter((g) => g.name.toLowerCase().includes(q))
            .slice(0, 5)
        : [];

    const matchedAnnouncements =
      q && allowedSet.has('dashboard')
        ? announcements
            .filter((a) => `${a.title} ${a.body}`.toLowerCase().includes(q))
            .slice(0, 5)
        : [];

    return {
      pages,
      matchedEmployees,
      matchedRequests,
      matchedProjects,
      matchedGroups,
      matchedAnnouncements,
    };
  }, [query, allowedSet, employees, requests, projects, groups, announcements]);

  if (!open) return null;

  const totalMatches =
    results.pages.length +
    results.matchedEmployees.length +
    results.matchedRequests.length +
    results.matchedProjects.length +
    results.matchedGroups.length +
    results.matchedAnnouncements.length;

  const selectRoute = (nav: NavSection) => {
    onNavigate(nav);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Search"
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/55 backdrop-blur-xs flex items-start justify-center pt-[10vh] px-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden"
      >
        {/* Search Input Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center gap-3">
          <Search className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search employees, requests, projects, announcements, pages..."
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results Body */}
        <div className="max-h-[60vh] overflow-y-auto p-3 space-y-4">
          {totalMatches === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No results found for &ldquo;{query}&rdquo;.
            </div>
          ) : (
            <>
              {results.pages.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Pages &amp; Settings
                  </p>
                  {results.pages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectRoute(item.id)}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Compass className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {item.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {item.subtitle}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.matchedEmployees.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Employees
                  </p>
                  {results.matchedEmployees.map((emp) => (
                    <button
                      key={emp.id}
                      type="button"
                      onClick={() => selectRoute('employees')}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Users className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {emp.fullName}{' '}
                            <span className="font-mono text-[11px] text-slate-400">
                              ({emp.employeeCode})
                            </span>
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {emp.jobTitle || emp.email}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.matchedRequests.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Requests
                  </p>
                  {results.matchedRequests.map((req) => (
                    <button
                      key={req.id}
                      type="button"
                      onClick={() => selectRoute('requests')}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClipboardCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {req.employeeName || req.employeeId} · {req.category.replace(/_/g, ' ')}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {req.reason}
                          </p>
                        </div>
                      </div>
                      <span className="text-[10px] font-mono uppercase text-slate-400 shrink-0">
                        {req.status}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {(results.matchedProjects.length > 0 || results.matchedGroups.length > 0) && (
                <div className="space-y-1">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Projects &amp; Groups
                  </p>
                  {results.matchedProjects.map((proj) => (
                    <button
                      key={proj.id}
                      type="button"
                      onClick={() => selectRoute('settings_projects')}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <FolderKanban className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {proj.name}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                            Project · {proj.code}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                  {results.matchedGroups.map((grp) => (
                    <button
                      key={grp.id}
                      type="button"
                      onClick={() => selectRoute('settings_groups')}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Layers className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {grp.name}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Employee Group
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}

              {results.matchedAnnouncements.length > 0 && (
                <div className="space-y-1">
                  <p className="px-2.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                    Announcements
                  </p>
                  {results.matchedAnnouncements.map((ann) => (
                    <button
                      key={ann.id}
                      type="button"
                      onClick={() => selectRoute('dashboard')}
                      className="w-full px-3 py-2 rounded-xl flex items-center justify-between gap-3 text-start hover:bg-slate-100 dark:hover:bg-slate-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Megaphone className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                            {ann.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {ann.body}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 flex items-center justify-between text-[11px] text-slate-400">
          <span>Click any item to jump directly to it</span>
          <span className="font-mono">ESC to close</span>
        </div>
      </div>
    </div>
  );
};
