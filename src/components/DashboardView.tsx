import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  FileWarning,
  FolderOpen,
  Info,
  MapPin,
  Receipt,
  RefreshCw,
  ShieldCheck,
  Users,
  Wallet,
  Workflow,
  Zap,
} from 'lucide-react';
import { getSalaryStatusLabel, getStepRoleLabel, t } from '../i18n/translations';
import {
  Announcement,
  AppSettings,
  AttendanceLog,
  Company,
  DeductionApprovalRequest,
  Employee,
  EmployeeDocument,
  EmployeeGroup,
  EmployeeModel,
  GeofenceZone,
  GPSReading,
  HiddenSectionKey,
  Language,
  LeaveRequest,
  LeaveStatus,
  PatchMoneyRelease,
  PayrollAdjustment,
  PayrollApprovalRun,
  PayrollEntry,
  ProAssignment,
  Project,
  QuickActionConfigItem,
  RosterTodayStatus,
  SalaryReleaseSchedule,
  Section,
  UnifiedRequest,
  UserRole,
} from '../types/hr';
import {
  calculateEmployeePayroll,
  canActOnDeductionApproval,
  canRoleActOnLeaveStep,
  evaluateClockInEligibility,
  formatAED,
  formatShortDate,
  formatTime,
  getDocumentExpiryStatus,
  getEffectiveShiftEnd,
  getEffectiveShiftStart,
  getPendingRequestsForApprover,
  isAttendanceTracked,
  isPayrollEligible,
  isProAssignmentActive,
  isSectionHidden,
  resolveClockInPolicy,
} from '../utils/hrLogic';
import { AnnouncementsCard } from './AnnouncementsCard';
import { Avatar } from './Avatar';
import { GeofenceMap } from './GeofenceMap';
import type { NavSection } from '../types/nav';

export type { NavSection };

export const DEFAULT_QUICK_ACTIONS: QuickActionConfigItem[] = [
  {
    id: 'requests',
    label: 'Approvals & Requests',
    description: 'Review pending inbox items or submit a new request',
    targetNav: 'requests',
    enabled: true,
    order: 0,
  },
  {
    id: 'roster',
    label: 'Monthly Roster',
    description: 'Check shift schedules and bulk upload monthly rosters',
    targetNav: 'roster',
    enabled: true,
    order: 1,
  },
  {
    id: 'payroll',
    label: 'Payroll & Salary Release',
    description: 'Monthly AED payroll, approval gate & WPS export',
    targetNav: 'payroll',
    enabled: true,
    order: 2,
  },
  {
    id: 'deduction_approvals',
    label: 'Deduction Approvals',
    description: 'Review latency and off-day deduction workflows',
    targetNav: 'deduction_approvals',
    enabled: true,
    order: 3,
  },
  {
    id: 'leaves',
    label: 'Leave Requests',
    description: 'Manage annual, sick, and emergency leave requests',
    targetNav: 'leaves',
    enabled: true,
    order: 4,
  },
  {
    id: 'employees',
    label: 'Employees Directory',
    description: 'Browse workforce profiles, documents & assignments',
    targetNav: 'employees',
    enabled: true,
    order: 5,
  },
  {
    id: 'workflow_templates',
    label: 'Named Workflows',
    description: 'Configure multi-step approval templates & routing',
    targetNav: 'settings_workflow_templates',
    enabled: true,
    order: 6,
  },
];

interface DashboardViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  models: EmployeeModel[];
  projects?: Project[];
  groups?: EmployeeGroup[];
  announcements?: Announcement[];
  requests?: UnifiedRequest[];
  payrollApprovalRuns?: PayrollApprovalRun[];
  allowedNavIds?: NavSection[];
  scopedEmployees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  payrollAdjustments: PayrollAdjustment[];
  payrollEntries?: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
  salaryReleases: SalaryReleaseSchedule[];
  proAssignments: ProAssignment[];
  settings: AppSettings;
  hiddenSections?: HiddenSectionKey[];
  gpsReading: GPSReading | null;
  simulatedDevice: 'mobile' | 'desktop';
  todayRoster?: RosterTodayStatus | null;
  onNavigate: (section: NavSection) => void;
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
  onDecideShiftProposal: (employeeId: string, approve: boolean) => Promise<void>;
  onRefresh: () => Promise<void>;
  onCreateAnnouncement?: (input: Omit<Announcement, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteAnnouncement?: (id: string) => Promise<void>;
  onUploadAnnouncementAttachment?: (
    file: File
  ) => Promise<{ url: string; fileName: string; fileType?: string }>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  lang,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  models,
  projects = [],
  groups = [],
  announcements = [],
  requests = [],
  payrollApprovalRuns = [],
  allowedNavIds,
  scopedEmployees,
  geofences,
  documents,
  attendance,
  leaves,
  payrollAdjustments,
  payrollEntries = [],
  deductionApprovals = [],
  patchReleases = [],
  salaryReleases,
  proAssignments,
  settings,
  hiddenSections = [],
  gpsReading,
  simulatedDevice,
  todayRoster = null,
  onNavigate,
  onClockIn,
  onClockOut,
  onDecideShiftProposal,
  onRefresh,
  onCreateAnnouncement,
  onDeleteAnnouncement,
  onUploadAnnouncementAttachment,
}) => {
  const [showMapInfo, setShowMapInfo] = useState(false);
  const [busyPunch, setBusyPunch] = useState(false);

  const hideLeaveBalances = isSectionHidden(hiddenSections, 'leave_balances');
  const hideSalaryBreakdown = isSectionHidden(hiddenSections, 'salary_breakdown');
  const hideAttendanceLogs = isSectionHidden(hiddenSections, 'attendance_logs');
  const hidePayslips = isSectionHidden(hiddenSections, 'payslips');

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonth = todayIso.slice(0, 7);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const scopedIds = useMemo(() => new Set(scopedEmployees.map((e) => e.id)), [scopedEmployees]);

  const userModel = modelMap.get(currentUser.modelId) ?? models[0];
  const assignedZones = useMemo(
    () => geofences.filter((z) => currentUser.assignedZoneIds.includes(z.id)),
    [geofences, currentUser.assignedZoneIds]
  );

  const openShiftLog = useMemo(
    () =>
      attendance.find(
        (a) => a.employeeId === currentUser.id && a.date === todayIso && a.clockOutTime === null
      ) ?? null,
    [attendance, currentUser.id, todayIso]
  );

  const clockEval = useMemo(() => {
    const effectivePolicy = resolveClockInPolicy(currentUser, settings.globalClockInPolicy);
    return evaluateClockInEligibility({
      reading: gpsReading,
      assignedZones,
      effectivePolicy,
      isDesktopDevice: simulatedDevice === 'desktop',
      maxAccuracyMeters: settings.maxMobileAccuracyMeters,
      hasNoAssignedZones: currentUser.assignedZoneIds.length === 0,
    });
  }, [currentUser, settings, gpsReading, assignedZones, simulatedDevice]);

  const handlePrimaryPunch = async () => {
    setBusyPunch(true);
    try {
      if (openShiftLog) {
        await onClockOut(openShiftLog.id);
      } else {
        await onClockIn();
      }
    } finally {
      setBusyPunch(false);
    }
  };

  // HR-configured Quick Actions filtered by allowed routes + live pending badges
  const configuredQuickActions = useMemo(() => {
    const source =
      settings.quickActions && settings.quickActions.length > 0
        ? settings.quickActions
        : DEFAULT_QUICK_ACTIONS;
    return [...source]
      .sort((a, b) => a.order - b.order)
      .filter((item) => item.enabled)
      .filter((item) =>
        allowedNavIds ? allowedNavIds.includes(item.targetNav as NavSection) : true
      );
  }, [settings.quickActions, allowedNavIds]);

  const quickActionBadges = useMemo(() => {
    const pendingReqCount = getPendingRequestsForApprover({
      requests,
      currentUser,
      activeRole,
      projects,
    }).length;

    const empById = new Map(scopedEmployees.map((e) => [e.id, e]));
    const pendingDeductionBadge = deductionApprovals.filter((req) => {
      const targetEmp = empById.get(req.employeeId);
      const perm = canActOnDeductionApproval({
        request: req,
        actorUserId: currentUser.id,
        actorRole: activeRole,
        actorManagedSectionIds: currentUser.managedSectionIds,
        targetRole: targetEmp?.role,
      });
      return !perm.isSelf && (perm.canManagerAct || perm.canHrAct);
    }).length;

    const pendingLeavesBadge =
      activeRole === UserRole.Employee
        ? leaves.filter(
            (l) => l.employeeId === currentUser.id && l.status === LeaveStatus.Pending
          ).length
        : leaves.filter(
            (l) =>
              scopedIds.has(l.employeeId) &&
              l.status === LeaveStatus.Pending &&
              (canRoleActOnLeaveStep({
                leave: l,
                actorRole: activeRole,
                actorEmployee: currentUser,
              }) ||
                activeRole === UserRole.SectionCoManager)
          ).length;

    const pendingPayrollRunsBadge = payrollApprovalRuns.filter(
      (r) => r.status === 'pending'
    ).length;

    const docAlertsBadge = documents.filter(
      (d) => scopedIds.has(d.employeeId) && getDocumentExpiryStatus(d.expiryDate).status !== 'valid'
    ).length;

    return {
      requests: pendingReqCount,
      deduction_approvals: pendingDeductionBadge,
      leaves: pendingLeavesBadge,
      payroll: pendingPayrollRunsBadge,
      release_schedules: pendingPayrollRunsBadge,
      documents: docAlertsBadge,
    } as Record<string, number>;
  }, [
    requests,
    currentUser,
    activeRole,
    projects,
    scopedEmployees,
    deductionApprovals,
    leaves,
    scopedIds,
    payrollApprovalRuns,
    documents,
  ]);

  const getQuickActionIcon = (targetNav: string) => {
    if (targetNav === 'requests') return ClipboardCheck;
    if (targetNav === 'roster') return CalendarDays;
    if (targetNav === 'payroll' || targetNav === 'release_schedules') return Wallet;
    if (targetNav === 'deduction_approvals') return ShieldCheck;
    if (targetNav === 'leaves') return CalendarClock;
    if (targetNav === 'employees') return Users;
    if (targetNav === 'settings_workflow_templates') return Workflow;
    return Zap;
  };

  const renderAnnouncementsSection = () => {
    if (!onCreateAnnouncement || !onDeleteAnnouncement || !onUploadAnnouncementAttachment) {
      return null;
    }
    return (
      <AnnouncementsCard
        currentUser={currentUser}
        activeRole={activeRole}
        announcements={announcements}
        companies={companies}
        projects={projects}
        groups={groups}
        onCreateAnnouncement={onCreateAnnouncement}
        onDeleteAnnouncement={onDeleteAnnouncement}
        onUploadAttachment={onUploadAnnouncementAttachment}
      />
    );
  };

  const renderQuickActionsSection = () => {
    if (configuredQuickActions.length === 0) return null;
    return (
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            Quick Actions
          </h3>
          <span className="text-[11px] text-slate-400">
            {configuredQuickActions.length} shortcut{configuredQuickActions.length === 1 ? '' : 's'}
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {configuredQuickActions.map((qa) => {
            const Icon = getQuickActionIcon(qa.targetNav);
            const badgeCount = quickActionBadges[qa.targetNav] ?? 0;
            return (
              <button
                key={qa.id}
                type="button"
                onClick={() => onNavigate(qa.targetNav as NavSection)}
                className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 p-3.5 text-start hover:border-teal-400 dark:hover:border-teal-600 hover:bg-white dark:hover:bg-slate-900 transition-colors cursor-pointer flex items-start justify-between gap-3"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center shrink-0">
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate group-hover:text-teal-700 dark:group-hover:text-teal-300">
                      {qa.label}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {qa.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {badgeCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-rose-600 text-white text-[10px] font-bold font-mono inline-flex items-center justify-center">
                      {badgeCount}
                    </span>
                  )}
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 rtl:rotate-180" />
                </div>
              </button>
            );
          })}
        </div>
      </section>
    );
  };

  // ============================================================================
  // PRO HOME SCREEN (Strictly Time-Limited Assigned Documents Only — Zero Salary)
  // ============================================================================
  if (activeRole === UserRole.PRO) {
    const activeGrants = proAssignments.filter(
      (a) => a.proUserId === currentUser.id && isProAssignmentActive(a)
    );
    const proDocAlerts = documents.filter(
      (d) => getDocumentExpiryStatus(d.expiryDate).status !== 'valid'
    );

    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
              {t(lang, 'navProDocs')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Time-limited government & visa document access for assigned employees.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <FolderOpen className="w-4 h-4" />
            Open Assigned Docs
          </button>
        </div>

        {renderAnnouncementsSection()}

        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('pro_assignments')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 cursor-pointer transition-colors"
          >
            <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {scopedEmployees.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Active Assigned Employees</p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 cursor-pointer transition-colors"
          >
            <FolderOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {documents.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">Accessible Documents</p>
          </button>
          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 cursor-pointer transition-colors"
          >
            <FileWarning className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {proDocAlerts.length}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{t(lang, 'expiringDocs')}</p>
          </button>
        </section>

        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Active Access Windows
            </h3>
            <span className="text-xs text-slate-500">{activeGrants.length} active</span>
          </div>
          {activeGrants.length === 0 ? (
            <p className="p-8 text-center text-xs text-slate-500">
              No active employee assignments at the moment.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {activeGrants.map((g) => {
                const emp = scopedEmployees.find((e) => e.id === g.employeeId);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => onNavigate('documents')}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {emp?.fullName ?? g.employeeId}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {g.notes || 'Document access'}
                        </p>
                      </div>
                    </div>
                    <span className="text-xs font-medium text-teal-700 dark:text-teal-300 shrink-0">
                      {t(lang, 'accessExpires')}: {formatShortDate(g.accessExpiresAt)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    );
  }

  // ============================================================================
  // CLEAN EMPLOYEE HOME SCREEN (Radical Simplicity: ONE Primary CTA + Hidden Map)
  // ============================================================================
  if (activeRole === UserRole.Employee) {
    const myDocs = documents.filter((d) => d.employeeId === currentUser.id);
    const myDocAlerts = myDocs.filter(
      (d) => getDocumentExpiryStatus(d.expiryDate).status !== 'valid'
    ).length;
    const myPendingLeaves = leaves.filter(
      (l) => l.employeeId === currentUser.id && l.status === LeaveStatus.Pending
    ).length;
    const myPayroll = calculateEmployeePayroll(
      currentUser,
      currentMonth,
      payrollAdjustments,
      attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases
    );
    const shiftStart =
      todayRoster?.status === 'shift' && todayRoster.shiftStart
        ? todayRoster.shiftStart
        : userModel
          ? getEffectiveShiftStart(currentUser, userModel)
          : '08:00';
    const shiftEnd =
      todayRoster?.status === 'shift' && todayRoster.shiftEnd
        ? todayRoster.shiftEnd
        : userModel
          ? getEffectiveShiftEnd(currentUser, userModel)
          : '17:00';
    const isRosterLeave = todayRoster?.status === 'leave';
    const hasRosterShift = todayRoster?.status === 'shift' && Boolean(todayRoster.shiftStart);

    return (
      <div className="max-w-xl mx-auto space-y-5">
        {isRosterLeave && (
          <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span>You are scheduled on Leave today — Clock-In and Clock-Out are disabled.</span>
          </div>
        )}

        {/* Primary Focused Clock-In / Clock-Out Card */}
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-center">
          <div className="flex items-center justify-between gap-2 text-start">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 truncate">
                {companyMap.get(currentUser.primaryCompanyId)?.name}
              </p>
              <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {hasRosterShift
                  ? `Rostered Shift: ${todayRoster!.shiftStart} – ${todayRoster!.shiftEnd}${
                      todayRoster!.isOvernight ? ' (Overnight)' : ''
                    }`
                  : `${shiftStart}–${shiftEnd}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowMapInfo((v) => !v)}
              aria-expanded={showMapInfo}
              aria-label={showMapInfo ? t(lang, 'hideMap') : t(lang, 'mapDetails')}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer shrink-0 whitespace-nowrap ${
                showMapInfo
                  ? 'border-teal-300 dark:border-teal-700 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              <Info className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden sm:inline">
                {showMapInfo ? t(lang, 'hideMap') : t(lang, 'mapDetails')}
              </span>
              <span className="sm:hidden">{showMapInfo ? t(lang, 'hideMap') : 'Map & GPS'}</span>
            </button>
          </div>

          {/* Simple Green / Red Zone Status */}
          <div className="mt-6 flex flex-col items-center">
            <div
              className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold ${
                clockEval.allowed
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                  : 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  clockEval.allowed ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <span>
                {clockEval.isGeofenceExempt && clockEval.allowed
                  ? t(lang, 'geofenceExempt')
                  : clockEval.allowed
                    ? `${t(lang, 'insideZone')} · ${clockEval.nearestZone?.name}`
                    : t(lang, 'outsideZone')}
              </span>
            </div>

            {!clockEval.allowed && (
              <p className="mt-2.5 text-xs text-rose-700 dark:text-rose-300 max-w-sm">
                {clockEval.reason}
              </p>
            )}

            {/* ONE Clear Primary Action Button */}
            <button
              type="button"
              onClick={() => void handlePrimaryPunch()}
              disabled={isRosterLeave || busyPunch || (!openShiftLog && !clockEval.allowed)}
              className={`mt-6 w-full max-w-xs min-h-[56px] rounded-xl text-base font-semibold text-white flex items-center justify-center gap-2.5 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                openShiftLog
                  ? 'bg-rose-600 hover:bg-rose-700'
                  : 'bg-teal-600 hover:bg-teal-700'
              }`}
            >
              <Clock className="w-5 h-5" />
              <span>{openShiftLog ? t(lang, 'clockOut') : t(lang, 'clockIn')}</span>
            </button>

            <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 font-mono tabular-nums">
              {openShiftLog
                ? `${t(lang, 'onShift')} · ${formatTime(openShiftLog.clockInTime)} (${openShiftLog.zoneName})`
                : t(lang, 'offShift')}
            </p>
          </div>

          {/* Progressive Disclosure: Map & GPS Details ONLY when tapped */}
          {showMapInfo && (
            <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-start space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
                <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                  <MapPin className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                  {clockEval.nearestZone?.name ?? 'No Zone'}
                </span>
                {gpsReading && (
                  <span className="font-mono tabular-nums" dir="ltr">
                    {gpsReading.latitude.toFixed(5)}, {gpsReading.longitude.toFixed(5)} (±
                    {Math.round(gpsReading.accuracyMeters)}m)
                  </span>
                )}
              </div>
              <GeofenceMap
                zones={assignedZones}
                userLocation={gpsReading}
                isInsideZone={clockEval.allowed}
                heightClass="h-56"
              />
            </div>
          )}
        </section>

        {/* Quiet Quick Access Strip (respecting employee visibility rules) */}
        <section
          className={`grid gap-3 ${
            hideSalaryBreakdown && hidePayslips ? 'grid-cols-2' : 'grid-cols-3'
          }`}
        >
          <button
            type="button"
            onClick={() => onNavigate('leaves')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
          >
            <CalendarClock className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <p className="mt-2.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {hideLeaveBalances
                ? '—'
                : `${Math.max(0, currentUser.leaveBalance.annualTotal - currentUser.leaveBalance.annualUsed)}d`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {t(lang, 'navLeaves')} {myPendingLeaves > 0 ? `(${myPendingLeaves})` : ''}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('documents')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
          >
            <FolderOpen className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            <p className="mt-2.5 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {myDocs.length}
            </p>
            <p
              className={`text-xs truncate ${
                myDocAlerts > 0
                  ? 'text-amber-700 dark:text-amber-400 font-medium'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {myDocAlerts > 0
                ? `${myDocAlerts} ${myDocAlerts === 1 ? 'alert' : 'alerts'}`
                : t(lang, 'navMyDocs')}
            </p>
          </button>

          {!(hideSalaryBreakdown && hidePayslips) && (
            <button
              type="button"
              onClick={() => onNavigate('payroll')}
              className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
            >
              <Receipt className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              <p className="mt-2.5 text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {hideSalaryBreakdown ? '—' : myPayroll.netSalary.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {getSalaryStatusLabel(lang, myPayroll.release.status)} ·{' '}
                {formatShortDate(
                  myPayroll.release.status === 'Delayed' && myPayroll.release.delayedUntilDate
                    ? myPayroll.release.delayedUntilDate
                    : myPayroll.release.releaseDate
                )}
              </p>
            </button>
          )}
        </section>

        {renderQuickActionsSection()}

        {renderAnnouncementsSection()}
      </div>
    );
  }

  // ============================================================================
  // MANAGEMENT / HR / SECTION MANAGER / CO-MANAGER WORKSPACE HOME
  // (Main Manager accounts are strictly excluded from Attendance & Payroll metrics)
  // ============================================================================
  const activeScoped = scopedEmployees.filter((e) => e.active);
  const trackedActiveScoped = activeScoped.filter(isAttendanceTracked);
  const trackedIds = new Set(trackedActiveScoped.map((e) => e.id));
  const todayLogs = attendance.filter((a) => a.date === todayIso && trackedIds.has(a.employeeId));
  const presentIds = new Set(todayLogs.map((a) => a.employeeId));
  const lateTodayCount = todayLogs.filter((a) => a.isLate && !a.latenessExcused).length;
  const absentTodayCount = Math.max(0, trackedActiveScoped.length - presentIds.size);

  const actionableLeaves = leaves.filter(
    (l) =>
      scopedIds.has(l.employeeId) &&
      l.status === LeaveStatus.Pending &&
      (canRoleActOnLeaveStep({ leave: l, actorRole: activeRole, actorEmployee: currentUser }) ||
        activeRole === UserRole.SectionCoManager)
  );

  const pendingShiftProposals = scopedEmployees.filter((e) => Boolean(e.pendingShiftProposal));
  const canApproveShift =
    activeRole === UserRole.MainManager || activeRole === UserRole.SectionManager;

  const docAlerts = documents
    .filter((d) => scopedIds.has(d.employeeId))
    .map((d) => ({ doc: d, expiry: getDocumentExpiryStatus(d.expiryDate) }))
    .filter((x) => x.expiry.status !== 'valid')
    .sort((a, b) => a.expiry.daysRemaining - b.expiry.daysRemaining);

  const totalNetPayroll = activeScoped
    .filter(isPayrollEligible)
    .reduce((sum, emp) => {
      if (selectedCompanyId !== 'all' && emp.primaryCompanyId !== selectedCompanyId) {
        return sum;
      }
      return (
        sum +
        calculateEmployeePayroll(
          emp,
          currentMonth,
          payrollAdjustments,
          attendance,
          salaryReleases,
          payrollEntries,
          leaves,
          deductionApprovals,
          patchReleases
        ).netSalary
      );
    }, 0);

  const scopeTitle =
    selectedCompanyId === 'all'
      ? t(lang, 'allCompanies')
      : companyMap.get(selectedCompanyId)?.name ?? t(lang, 'brand');

  return (
    <div className="space-y-6">
      {/* Compact Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">{scopeTitle}</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {formatShortDate(todayIso)} · {activeScoped.length} staff in view
            {(activeRole === UserRole.SectionManager || activeRole === UserRole.SectionCoManager) &&
              ` · ${currentUser.managedSectionIds
                .map((id) => sectionMap.get(id)?.name)
                .filter(Boolean)
                .join(', ')}`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void onRefresh()}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t(lang, 'refresh')}
        </button>
      </div>

      {/* Company Announcements */}
      {renderAnnouncementsSection()}

      {/* HR-Configured Quick Actions with Live Pending Badges */}
      {renderQuickActionsSection()}

      {/* Clean KPI Cards (respecting visibility rules) */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {!hideAttendanceLogs && (
          <button
            type="button"
            onClick={() => onNavigate('attendance')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>{t(lang, 'liveAttendance')}</span>
              <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {presentIds.size}
              <span className="text-sm font-normal text-slate-400">
                {' '}
                / {trackedActiveScoped.length}
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {lateTodayCount} {t(lang, 'late')} · {absentTodayCount} absent
            </p>
          </button>
        )}

        <button
          type="button"
          onClick={() => onNavigate('leaves')}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>{t(lang, 'pendingApprovals')}</span>
            <CalendarClock className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            {actionableLeaves.length + pendingShiftProposals.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {actionableLeaves.length} leaves · {pendingShiftProposals.length} shifts
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigate('documents')}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
            <span>{t(lang, 'expiringDocs')}</span>
            <FileWarning className="w-4 h-4 text-rose-600 dark:text-rose-400" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            {docAlerts.length}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Expired or ≤ 30 days</p>
        </button>

        {!hideSalaryBreakdown && (
          <button
            type="button"
            onClick={() => onNavigate('payroll')}
            className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 text-start hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-xs font-medium">
              <span>{t(lang, 'monthlyPayroll')}</span>
              <Wallet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-teal-800 dark:text-teal-300 truncate">
              {formatAED(totalNetPayroll)}
            </p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Net ({currentMonth})</p>
          </button>
        )}
      </section>

      {/* Two Focused Action Panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Pending Leave & Shift Approvals */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(lang, 'pendingApprovals')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('leaves')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {t(lang, 'navLeaves')}
            </button>
          </div>

          {actionableLeaves.length === 0 && pendingShiftProposals.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 flex flex-col items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
              <span>{t(lang, 'allClear')}</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {pendingShiftProposals.map((emp) => (
                <div
                  key={`shift-${emp.id}`}
                  className="px-5 py-3.5 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar src={emp.avatarUrl} name={emp.fullName} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                        {emp.fullName}
                      </p>
                      <p className="text-xs text-amber-700 dark:text-amber-400 truncate">
                        Shift Proposal: {emp.pendingShiftProposal?.shiftStart}–
                        {emp.pendingShiftProposal?.shiftEnd}
                      </p>
                    </div>
                  </div>
                  {canApproveShift ? (
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onDecideShiftProposal(emp.id, true)}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 cursor-pointer"
                      >
                        {t(lang, 'approve')}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDecideShiftProposal(emp.id, false)}
                        className="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        {t(lang, 'reject')}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-amber-700 dark:text-amber-400 shrink-0">
                      {t(lang, 'pendingManagerApproval')}
                    </span>
                  )}
                </div>
              ))}

              {actionableLeaves.slice(0, 4).map((lv) => {
                const emp = scopedEmployees.find((e) => e.id === lv.employeeId);
                const activeStep = lv.approvalSteps[lv.currentStepIndex];
                return (
                  <button
                    key={lv.id}
                    type="button"
                    onClick={() => onNavigate('leaves')}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {emp?.fullName}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                          {lv.type} · {lv.days}d ·{' '}
                          {activeStep ? getStepRoleLabel(lang, activeStep.role) : ''}
                        </p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0 rtl:rotate-180" />
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Expiring Documents Watchlist */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(lang, 'expiringDocs')}
            </h3>
            <button
              type="button"
              onClick={() => onNavigate('documents')}
              className="text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {t(lang, 'navDocuments')}
            </button>
          </div>

          {docAlerts.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400">
              All compliance documents are valid.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {docAlerts.slice(0, 5).map(({ doc, expiry }) => {
                const emp = scopedEmployees.find((e) => e.id === doc.employeeId);
                const isExpired = expiry.status === 'expired';
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onNavigate('documents')}
                    className="w-full px-5 py-3.5 flex items-center justify-between gap-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AlertTriangle
                        className={`w-4 h-4 shrink-0 ${
                          isExpired
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-600 dark:text-amber-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {emp?.fullName} · {doc.type}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatShortDate(doc.expiryDate)}
                        </p>
                      </div>
                    </div>
                    <span
                      className={`text-xs font-semibold shrink-0 ${
                        isExpired
                          ? 'text-rose-700 dark:text-rose-400'
                          : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {isExpired
                        ? `${Math.abs(expiry.daysRemaining)}d overdue`
                        : `${expiry.daysRemaining}d left`}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
