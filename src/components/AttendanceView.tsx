import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  EyeOff,
  History,
  Info,
  Laptop,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { getDeductionApprovalStatusLabel, t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AppSettings,
  AttendanceAuditEntry,
  AttendanceLog,
  Company,
  DeductionApprovalRequest,
  Employee,
  EmployeeModel,
  GeofenceZone,
  GPSReading,
  HiddenSectionKey,
  Language,
  RosterTodayStatus,
  UserRole,
} from '../types/hr';
import {
  buildAttendanceCSV,
  evaluateAttendanceLatenessPermissions,
  evaluateClockInEligibility,
  formatAED,
  formatShortDate,
  formatTime,
  isAttendanceTracked,
  isSectionHidden,
  PendingReviewerRole,
  resolveClockInPolicy,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { GeofenceMap } from './GeofenceMap';
import { SlideOverDrawer } from './SlideOverDrawer';

interface AttendanceViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  models: EmployeeModel[];
  scopedEmployees: Employee[];
  geofences: GeofenceZone[];
  attendance: AttendanceLog[];
  attendanceAudit: AttendanceAuditEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  settings: AppSettings;
  hiddenSections?: HiddenSectionKey[];
  gpsReading: GPSReading | null;
  simulatedDevice: 'mobile' | 'desktop';
  todayRoster?: RosterTodayStatus | null;
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
  onAcceptExcuse: (params: {
    logId: string;
    excuseNote: string;
    linkedApprovalId?: string | null;
  }) => Promise<void>;
  onManagerReviewLateness?: (params: {
    log: AttendanceLog;
    linkedApproval: DeductionApprovalRequest | null;
    decision: 'approved' | 'rejected';
    note: string;
  }) => Promise<void>;
  onHrConfirmLatenessDeduction?: (params: {
    log: AttendanceLog;
    linkedApproval: DeductionApprovalRequest | null;
    note: string;
  }) => Promise<void>;
  onModifyRecord: (params: {
    logId: string;
    clockInHHmm: string;
    clockOutHHmm: string | null;
    reason: string;
  }) => Promise<void>;
}

function getPendingReviewerLabel(lang: Language, reviewer: PendingReviewerRole | null): string {
  if (reviewer === 'main_manager') return t(lang, 'pendingReviewerMainManager');
  if (reviewer === 'hr_admin') return t(lang, 'pendingReviewerHr');
  if (reviewer === 'section_manager') return t(lang, 'pendingReviewerManager');
  return t(lang, 'pendingReviewer');
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  lang,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  scopedEmployees,
  geofences,
  attendance,
  attendanceAudit,
  deductionApprovals = [],
  settings,
  hiddenSections = [],
  gpsReading,
  simulatedDevice,
  todayRoster = null,
  onClockIn,
  onClockOut,
  onAcceptExcuse,
  onManagerReviewLateness,
  onHrConfirmLatenessDeduction,
  onModifyRecord,
}) => {
  const hideAttendanceLogs = isSectionHidden(hiddenSections, 'attendance_logs');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'late' | 'excused'>('all');
  const [showMap, setShowMap] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'audit'>('details');

  // Review / excuse / modify state
  const [excuseText, setExcuseText] = useState('');
  const [actionBusy, setActionBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editIn, setEditIn] = useState('08:00');
  const [editOut, setEditOut] = useState('17:00');
  const [editReason, setEditReason] = useState('');

  const todayIso = new Date().toISOString().slice(0, 10);
  const empMap = useMemo(() => new Map(scopedEmployees.map((e) => [e.id, e])), [scopedEmployees]);
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  // Index latest latency deduction approval per (employeeId, date)
  const latencyApprovalMap = useMemo(() => {
    const map = new Map<string, DeductionApprovalRequest>();
    for (const req of deductionApprovals) {
      if (req.triggerType !== 'latency') continue;
      const key = `${req.employeeId}::${req.date}`;
      const existing = map.get(key);
      if (!existing || req.createdAt > existing.createdAt) {
        map.set(key, req);
      }
    }
    return map;
  }, [deductionApprovals]);

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

  const visibleLogs = useMemo(() => {
    return attendance.filter((log) => {
      const emp = empMap.get(log.employeeId);
      if (!emp || !isAttendanceTracked(emp)) return false;
      if (selectedCompanyId !== 'all' && log.companyId !== selectedCompanyId) {
        if (
          emp.primaryCompanyId !== selectedCompanyId &&
          !emp.sharedCompanyIds.includes(selectedCompanyId)
        ) {
          return false;
        }
      }
      if (statusFilter === 'late' && (!log.isLate || log.latenessExcused)) return false;
      if (statusFilter === 'excused' && !log.latenessExcused) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${emp?.fullName ?? ''} ${log.zoneName} ${log.date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [attendance, empMap, selectedCompanyId, statusFilter, search]);

  const selectedLog = attendance.find((l) => l.id === selectedLogId) ?? null;
  const selectedEmp = selectedLog ? empMap.get(selectedLog.employeeId) ?? null : null;
  const selectedLinkedApproval = selectedLog
    ? latencyApprovalMap.get(`${selectedLog.employeeId}::${selectedLog.date}`) ?? null
    : null;
  const selectedPerm = useMemo(() => {
    if (!selectedLog) return null;
    return evaluateAttendanceLatenessPermissions({
      log: selectedLog,
      targetEmployee: selectedEmp,
      actorUserId: currentUser.id,
      actorRole: activeRole,
      actorManagedSectionIds: currentUser.managedSectionIds,
      linkedApproval: selectedLinkedApproval,
      workflowConfig: settings.deductionWorkflowConfig,
    });
  }, [
    selectedLog,
    selectedEmp,
    currentUser.id,
    currentUser.managedSectionIds,
    activeRole,
    selectedLinkedApproval,
    settings.deductionWorkflowConfig,
  ]);

  const selectedAudits = useMemo(
    () =>
      selectedLog
        ? attendanceAudit.filter((a) => a.attendanceLogId === selectedLog.id)
        : [],
    [attendanceAudit, selectedLog]
  );

  const openLogDrawer = (log: AttendanceLog) => {
    setSelectedLogId(log.id);
    setDrawerTab('details');
    setExcuseText('');
    setEditMode(false);
    setEditIn(new Date(log.clockInTime).toTimeString().slice(0, 5));
    setEditOut(log.clockOutTime ? new Date(log.clockOutTime).toTimeString().slice(0, 5) : '17:00');
    setEditReason('');
  };

  const handleExport = async () => {
    const csv = buildAttendanceCSV(visibleLogs, empMap, companyMap);
    await nativeBridge.saveTextFile(
      `yaldi-attendance-${todayIso}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleSaveModify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLog || !selectedPerm?.canModifyPunch || !editReason.trim()) return;
    setActionBusy(true);
    try {
      await onModifyRecord({
        logId: selectedLog.id,
        clockInHHmm: editIn,
        clockOutHHmm: editOut || null,
        reason: editReason.trim(),
      });
      setEditMode(false);
      setEditReason('');
    } finally {
      setActionBusy(false);
    }
  };

  const handleFinalizeExcuse = async () => {
    if (!selectedLog || !selectedPerm?.canFinalizeExcuse) return;
    setActionBusy(true);
    try {
      await onAcceptExcuse({
        logId: selectedLog.id,
        excuseNote:
          excuseText.trim() ||
          (activeRole === UserRole.MainManager
            ? 'Accepted by Main Manager'
            : 'Final approval by HR Admin'),
        linkedApprovalId: selectedLinkedApproval?.id ?? null,
      });
      setExcuseText('');
    } finally {
      setActionBusy(false);
    }
  };

  const handleManagerReview = async (decision: 'approved' | 'rejected') => {
    if (!selectedLog || !selectedPerm?.canManagerReview || !onManagerReviewLateness) return;
    setActionBusy(true);
    try {
      await onManagerReviewLateness({
        log: selectedLog,
        linkedApproval: selectedLinkedApproval,
        decision,
        note: excuseText.trim(),
      });
      setExcuseText('');
    } finally {
      setActionBusy(false);
    }
  };

  const handleHrConfirmDeduction = async () => {
    if (!selectedLog || !selectedPerm?.canFinalizeExcuse || !onHrConfirmLatenessDeduction) return;
    setActionBusy(true);
    try {
      await onHrConfirmLatenessDeduction({
        log: selectedLog,
        linkedApproval: selectedLinkedApproval,
        note: excuseText.trim(),
      });
      setExcuseText('');
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Compact Top Clock-In Strip — STRICTLY HIDDEN for Main Manager (Executive Exemption) */}
      {activeRole !== UserRole.MainManager && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
          {todayRoster?.status === 'leave' && (
            <div className="rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 px-4 py-3 text-xs font-semibold text-amber-900 dark:text-amber-200 flex items-center gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>You are scheduled on Leave today — Clock-In and Clock-Out are disabled.</span>
            </div>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  clockEval.allowed ? 'bg-emerald-500' : 'bg-rose-500'
                }`}
              />
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  {clockEval.isGeofenceExempt && clockEval.allowed
                    ? t(lang, 'geofenceExempt')
                    : clockEval.allowed
                      ? `${t(lang, 'insideZone')} · ${clockEval.nearestZone?.name}`
                      : clockEval.reason}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {openShiftLog
                    ? `${t(lang, 'onShift')} since ${formatTime(openShiftLog.clockInTime)}`
                    : t(lang, 'offShift')}{' '}
                  · {clockEval.punchSource}
                  {todayRoster?.status === 'shift' && todayRoster.shiftStart && (
                    <>
                      {' '}
                      ·{' '}
                      <span className="font-mono font-medium text-teal-700 dark:text-teal-300">
                        Rostered Shift: {todayRoster.shiftStart} – {todayRoster.shiftEnd}
                        {todayRoster.isOvernight ? ' (Overnight)' : ''}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setShowMap((v) => !v)}
                aria-expanded={showMap}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Info className="w-3.5 h-3.5" />
                {showMap ? t(lang, 'hideMap') : t(lang, 'mapDetails')}
              </button>

              <button
                type="button"
                onClick={() =>
                  openShiftLog ? void onClockOut(openShiftLog.id) : void onClockIn()
                }
                disabled={
                  todayRoster?.status === 'leave' || (!openShiftLog && !clockEval.allowed)
                }
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  openShiftLog
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-teal-700 hover:bg-teal-800'
                }`}
              >
                <Clock className="w-4 h-4" />
                {openShiftLog ? t(lang, 'clockOut') : t(lang, 'clockIn')}
              </button>
            </div>
          </div>

          {showMap && (
            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <GeofenceMap
                zones={assignedZones}
                userLocation={gpsReading}
                isInsideZone={clockEval.allowed}
                heightClass="h-64"
              />
            </div>
          )}
        </section>
      )}

      {/* Minimalist Attendance List (hidden if restricted by visibility rules) */}
      {hideAttendanceLogs ? (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <EyeOff className="w-7 h-7 text-slate-400 mx-auto" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(lang, 'restrictedByPolicyTitle')}
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            {t(lang, 'restrictedByPolicyDesc')}
          </p>
        </section>
      ) : (
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'search')}
              aria-label="Search attendance"
              className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'late', label: t(lang, 'late') },
                  { id: 'excused', label: t(lang, 'excused') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    statusFilter === tab.id
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {activeRole !== UserRole.Employee && (
              <button
                type="button"
                onClick={() => void handleExport()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {t(lang, 'exportCsv')}
              </button>
            )}
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleLogs.map((log) => {
              const emp = empMap.get(log.employeeId);
              const linked = latencyApprovalMap.get(`${log.employeeId}::${log.date}`) ?? null;
              const perm = evaluateAttendanceLatenessPermissions({
                log,
                targetEmployee: emp,
                actorUserId: currentUser.id,
                actorRole: activeRole,
                actorManagedSectionIds: currentUser.managedSectionIds,
                linkedApproval: linked,
                workflowConfig: settings.deductionWorkflowConfig,
              });

              const statusDot = !log.isLate
                ? 'bg-emerald-500'
                : log.latenessExcused || perm.stage === 'excused'
                  ? 'bg-emerald-500'
                  : perm.stage === 'approved'
                    ? 'bg-rose-600'
                    : perm.stage === 'pending_hr_approval' ||
                        perm.stage === 'pending_hr_decision' ||
                        perm.stage === 'pending_main_manager'
                      ? 'bg-teal-500'
                      : 'bg-amber-500';

              const statusLabel = !log.isLate
                ? t(lang, 'onTime')
                : log.latenessExcused || perm.stage === 'excused'
                  ? t(lang, 'excused')
                  : `${t(lang, 'late')} (${log.lateMinutes}m · AED ${log.latenessPenaltyAED})`;

              const showPendingReviewerBadge =
                perm.isLatePending && (perm.isSelf || (!perm.canManagerReview && !perm.canFinalizeExcuse));

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => openLogDrawer(log)}
                  data-testid={`attendance-row-${log.id}`}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {emp?.fullName ?? 'Unknown'}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {formatShortDate(log.date)} · {log.zoneName}
                      </p>
                    </div>
                  </div>

                  <div className="hidden sm:block text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300 shrink-0">
                    {formatTime(log.clockInTime)} → {formatTime(log.clockOutTime)}
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {showPendingReviewerBadge && (
                      <span
                        data-testid={`pending-reviewer-badge-${log.id}`}
                        className="hidden md:inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap"
                      >
                        <Clock className="w-3 h-3 text-slate-400" />
                        {getPendingReviewerLabel(lang, perm.pendingReviewerRole)}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      <span className={`w-2 h-2 rounded-full ${statusDot}`} />
                      {statusLabel}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>
      )}

      {/* Progressive Disclosure Drawer: Full GPS, Role-Routed Latency Review, Punch Edit & Audit Log */}
      <SlideOverDrawer
        open={Boolean(selectedLog) && !hideAttendanceLogs}
        onClose={() => setSelectedLogId(null)}
        title={selectedEmp?.fullName ?? 'Attendance Record'}
        subtitle={
          selectedLog
            ? `${formatShortDate(selectedLog.date)} · ${companyMap.get(selectedLog.companyId) ?? ''}`
            : undefined
        }
      >
        {selectedLog && selectedPerm && (
          <div className="space-y-5">
            {/* Tabs */}
            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 w-full">
              <button
                type="button"
                onClick={() => setDrawerTab('details')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                  drawerTab === 'details'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'overview')}
              </button>
              <button
                type="button"
                onClick={() => setDrawerTab('audit')}
                className={`flex-1 py-1.5 text-xs font-semibold rounded-md cursor-pointer inline-flex items-center justify-center gap-1.5 ${
                  drawerTab === 'audit'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                {t(lang, 'auditLog')} ({selectedAudits.length})
              </button>
            </div>

            {drawerTab === 'details' ? (
              <div className="space-y-5">
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500 dark:text-slate-400">Clock In / Out</dt>
                    <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {formatTime(selectedLog.clockInTime)} → {formatTime(selectedLog.clockOutTime)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500 dark:text-slate-400">Device Source</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                      {selectedLog.punchSource === 'Mobile App' ? (
                        <Smartphone className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                      ) : (
                        <Laptop className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {selectedLog.punchSource}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500 dark:text-slate-400">Zone &amp; GPS</dt>
                    <dd className="mt-1 font-medium text-slate-900 dark:text-white">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-teal-600" />
                        {selectedLog.zoneName}
                      </span>
                      <span className="block font-mono text-[11px] text-slate-500 mt-0.5" dir="ltr">
                        {selectedLog.clockInLat.toFixed(4)}, {selectedLog.clockInLng.toFixed(4)} (±
                        {Math.round(selectedLog.accuracyMeters)}m)
                      </span>
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500 dark:text-slate-400">Lateness Penalty</dt>
                    <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white tabular-nums">
                      {selectedLog.isLate
                        ? selectedLog.latenessExcused || selectedPerm.stage === 'excused'
                          ? 'Excused (AED 0.00)'
                          : `${selectedLog.lateMinutes}m · ${formatAED(selectedLog.latenessPenaltyAED)}`
                        : 'On Time (AED 0.00)'}
                    </dd>
                  </div>
                </dl>

                {selectedLog.excuseNote && (
                  <div className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 p-3.5 text-xs text-emerald-800 dark:text-emerald-300">
                    <p className="font-semibold inline-flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Excused by {selectedLog.excusedBy}
                    </p>
                    <p className="mt-1">{selectedLog.excuseNote}</p>
                  </div>
                )}

                {/* Linked Manager Recommendation Context (visible to HR/Main Manager & audit) */}
                {selectedLinkedApproval?.managerDecision && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs space-y-1">
                    <p className="font-semibold text-slate-800 dark:text-slate-100">
                      Section Manager ({selectedLinkedApproval.managerActorName ?? 'Manager'}):{' '}
                      <span
                        className={
                          selectedLinkedApproval.managerDecision === 'approved'
                            ? 'text-teal-700 dark:text-teal-300'
                            : 'text-amber-700 dark:text-amber-300'
                        }
                      >
                        {selectedLinkedApproval.managerDecision === 'approved'
                          ? 'Approved Deduction → Sent to HR'
                          : 'Recommended Excuse/Waive → Sent to HR'}
                      </span>
                    </p>
                    {selectedLinkedApproval.managerNote && (
                      <p className="text-slate-600 dark:text-slate-400">
                        &ldquo;{selectedLinkedApproval.managerNote}&rdquo;
                      </p>
                    )}
                  </div>
                )}

                {/* Rule 1: STRICT NO SELF-APPROVAL — Never show Accept/Excuse/Approve/Reject/Waive or Punch Edit */}
                {selectedPerm.isSelf && selectedPerm.isLatePending && (
                  <div
                    data-testid="attendance-self-pending-reviewer"
                    className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 p-4 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {getPendingReviewerLabel(lang, selectedPerm.pendingReviewerRole)}
                      </span>
                      {selectedPerm.stage !== 'on_time' &&
                        selectedPerm.stage !== 'excused' && (
                          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                            {getDeductionApprovalStatusLabel(lang, selectedPerm.stage)}
                          </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {t(lang, 'selfApprovalBlockedNote')}
                    </p>
                  </div>
                )}

                {/* Non-Self Pending Reviewer State (when current user is NOT the active stage reviewer) */}
                {!selectedPerm.isSelf &&
                  selectedPerm.isLatePending &&
                  !selectedPerm.canManagerReview &&
                  !selectedPerm.canFinalizeExcuse && (
                    <div
                      data-testid="attendance-pending-reviewer"
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950 p-4 space-y-2"
                    >
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-200/80 dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200">
                        <Clock className="w-3.5 h-3.5 text-slate-500" />
                        {getPendingReviewerLabel(lang, selectedPerm.pendingReviewerRole)}
                      </span>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {selectedPerm.stage === 'pending_manager'
                          ? t(lang, 'awaitingSectionManagerReview')
                          : selectedPerm.stage === 'pending_main_manager'
                            ? t(lang, 'awaitingMainManagerApproval')
                            : t(lang, 'awaitingHrFinalAcceptance')}
                      </p>
                    </div>
                  )}

                {/* Role-Routed Action Area (strictly gated by evaluateAttendanceLatenessPermissions) */}
                {!selectedPerm.isSelf &&
                  (selectedPerm.canManagerReview ||
                    selectedPerm.canFinalizeExcuse ||
                    selectedPerm.canModifyPunch) && (
                    <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                          {selectedPerm.canManagerReview
                            ? t(lang, 'managerReviewStepTitle')
                            : t(lang, 'hrFinalReviewTitle')}
                        </span>
                        {selectedPerm.canModifyPunch && (
                          <button
                            type="button"
                            onClick={() => setEditMode((v) => !v)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                            {t(lang, 'modifyPunch')}
                          </button>
                        )}
                      </div>

                      {/* Step 1: Section Manager reviews regular employee -> forwards to HR (CANNOT finalize!) */}
                      {selectedPerm.canManagerReview && onManagerReviewLateness && (
                        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3.5 space-y-2.5">
                          <p className="text-xs font-semibold text-amber-900 dark:text-amber-200">
                            {t(lang, 'managerReviewStepHint')}
                          </p>
                          <input
                            type="text"
                            value={excuseText}
                            onChange={(e) => setExcuseText(e.target.value)}
                            placeholder={t(lang, 'decisionNotePlaceholder')}
                            aria-label="Manager review note"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleManagerReview('approved')}
                              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t(lang, 'approveDeductionToHr')}
                            </button>
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleManagerReview('rejected')}
                              className="inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-900 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {t(lang, 'recommendExcuseToHr')}
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Final Step: HR Admin (Employee / Section Manager) or Main Manager (HR Admin / Section Manager / Employee) */}
                      {selectedPerm.canFinalizeExcuse && (
                        <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/40 dark:bg-emerald-950/25 p-3.5 space-y-2.5">
                          <p className="text-xs font-medium text-emerald-900 dark:text-emerald-200">
                            Final review for {formatAED(selectedLog.latenessPenaltyAED)} lateness
                            penalty ({getDeductionApprovalStatusLabel(lang, selectedPerm.stage as never)})
                          </p>
                          <input
                            type="text"
                            value={excuseText}
                            onChange={(e) => setExcuseText(e.target.value)}
                            placeholder="Reason for accepting excuse or confirming deduction..."
                            aria-label="Final review note"
                            className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                          />
                          <div className="flex flex-col sm:flex-row gap-2">
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleFinalizeExcuse()}
                              className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {t(lang, 'acceptExcuse')}
                            </button>
                            {onHrConfirmLatenessDeduction && (
                              <button
                                type="button"
                                disabled={actionBusy}
                                onClick={() => void handleHrConfirmDeduction()}
                                className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
                              >
                                <ShieldCheck className="w-3.5 h-3.5" />
                                {t(lang, 'confirmDeductionFinal')}
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {editMode && selectedPerm.canModifyPunch && (
                        <form
                          onSubmit={handleSaveModify}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-3"
                        >
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label
                                htmlFor="mod-in"
                                className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                              >
                                Clock In (HH:mm)
                              </label>
                              <input
                                id="mod-in"
                                type="time"
                                required
                                value={editIn}
                                onChange={(e) => setEditIn(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                            <div>
                              <label
                                htmlFor="mod-out"
                                className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                              >
                                Clock Out (HH:mm)
                              </label>
                              <input
                                id="mod-out"
                                type="time"
                                value={editOut}
                                onChange={(e) => setEditOut(e.target.value)}
                                className="w-full px-3 py-1.5 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                              />
                            </div>
                          </div>
                          <div>
                            <label
                              htmlFor="mod-reason"
                              className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1"
                            >
                              Audit Reason (Required)
                            </label>
                            <input
                              id="mod-reason"
                              type="text"
                              required
                              value={editReason}
                              onChange={(e) => setEditReason(e.target.value)}
                              placeholder="e.g., Fixed missed punch-out after handover..."
                              className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            />
                          </div>
                          <div className="flex justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditMode(false)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                            >
                              {t(lang, 'cancel')}
                            </button>
                            <button
                              type="submit"
                              disabled={actionBusy}
                              className="px-3 py-1.5 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              Apply Immediately
                            </button>
                          </div>
                        </form>
                      )}
                    </div>
                  )}
              </div>
            ) : (
              <div className="space-y-3">
                {selectedAudits.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400 text-center py-6">
                    No manual modifications recorded for this attendance punch.
                  </p>
                ) : (
                  selectedAudits.map((aud) => (
                    <div
                      key={aud.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {aud.actorName}
                        </span>
                        <span className="font-mono text-[11px] text-slate-500">
                          {formatShortDate(aud.timestamp)} · {formatTime(aud.timestamp)}
                        </span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-300">{aud.summary}</p>
                      {aud.previousValue && aud.newValue && (
                        <p className="text-[11px] font-mono text-slate-500">
                          {aud.previousValue} → {aud.newValue}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>
    </div>
  );
};
