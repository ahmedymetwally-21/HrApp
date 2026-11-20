import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  Download,
  Edit3,
  History,
  Info,
  Laptop,
  MapPin,
  Search,
  ShieldCheck,
  Smartphone,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AppSettings,
  AttendanceAuditEntry,
  AttendanceLog,
  Company,
  Employee,
  EmployeeModel,
  GeofenceZone,
  GPSReading,
  Language,
  UserRole,
} from '../types/hr';
import {
  buildAttendanceCSV,
  evaluateClockInEligibility,
  formatAED,
  formatShortDate,
  formatTime,
  isAttendanceTracked,
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
  settings: AppSettings;
  gpsReading: GPSReading | null;
  simulatedDevice: 'mobile' | 'desktop';
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
  onAcceptExcuse: (params: { logId: string; excuseNote: string }) => Promise<void>;
  onModifyRecord: (params: {
    logId: string;
    clockInHHmm: string;
    clockOutHHmm: string | null;
    reason: string;
  }) => Promise<void>;
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
  settings,
  gpsReading,
  simulatedDevice,
  onClockIn,
  onClockOut,
  onAcceptExcuse,
  onModifyRecord,
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'late' | 'excused'>('all');
  const [showMap, setShowMap] = useState(false);
  const [selectedLogId, setSelectedLogId] = useState<string | null>(null);
  const [drawerTab, setDrawerTab] = useState<'details' | 'audit'>('details');

  // Section Manager immediate actions state
  const [excuseText, setExcuseText] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editIn, setEditIn] = useState('08:00');
  const [editOut, setEditOut] = useState('17:00');
  const [editReason, setEditReason] = useState('');

  const todayIso = new Date().toISOString().slice(0, 10);
  const empMap = useMemo(() => new Map(scopedEmployees.map((e) => [e.id, e])), [scopedEmployees]);
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);

  const canModifyAttendance =
    activeRole === UserRole.SectionManager || activeRole === UserRole.MainManager;

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
        const emp = empMap.get(log.employeeId);
        const hay = `${emp?.fullName ?? ''} ${log.zoneName} ${log.date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [attendance, empMap, selectedCompanyId, statusFilter, search]);

  const selectedLog = attendance.find((l) => l.id === selectedLogId) ?? null;
  const selectedEmp = selectedLog ? empMap.get(selectedLog.employeeId) ?? null : null;
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
    if (!selectedLog || !editReason.trim()) return;
    await onModifyRecord({
      logId: selectedLog.id,
      clockInHHmm: editIn,
      clockOutHHmm: editOut || null,
      reason: editReason.trim(),
    });
    setEditMode(false);
    setEditReason('');
  };

  const handleExcuseSubmit = async () => {
    if (!selectedLog) return;
    await onAcceptExcuse({
      logId: selectedLog.id,
      excuseNote: excuseText.trim() || 'Accepted by Section Manager',
    });
    setExcuseText('');
  };

  return (
    <div className="space-y-5">
      {/* Compact Top Clock-In Strip — STRICTLY HIDDEN for Main Manager (Executive Exemption) */}
      {activeRole !== UserRole.MainManager && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
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
                disabled={!openShiftLog && !clockEval.allowed}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  openShiftLog
                    ? 'bg-rose-600 hover:bg-rose-700'
                    : 'bg-indigo-700 hover:bg-indigo-800'
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

      {/* Minimalist Attendance List (Max 3–4 Visible Fields per Row) */}
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
              const statusDot = !log.isLate
                ? 'bg-emerald-500'
                : log.latenessExcused
                  ? 'bg-amber-500'
                  : 'bg-rose-500';
              const statusLabel = !log.isLate
                ? t(lang, 'onTime')
                : log.latenessExcused
                  ? t(lang, 'excused')
                  : `${t(lang, 'late')} (${log.lateMinutes}m · AED ${log.latenessPenaltyAED})`;

              return (
                <button
                  key={log.id}
                  type="button"
                  onClick={() => openLogDrawer(log)}
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

                  <div className="flex items-center gap-3 shrink-0">
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

      {/* Progressive Disclosure Drawer: Full GPS, Excuse Acceptance, Immediate Edit & Audit Log */}
      <SlideOverDrawer
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLogId(null)}
        title={selectedEmp?.fullName ?? 'Attendance Record'}
        subtitle={
          selectedLog
            ? `${formatShortDate(selectedLog.date)} · ${companyMap.get(selectedLog.companyId) ?? ''}`
            : undefined
        }
      >
        {selectedLog && (
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
                        <Smartphone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      ) : (
                        <Laptop className="w-3.5 h-3.5 text-slate-500" />
                      )}
                      {selectedLog.punchSource}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500 dark:text-slate-400">Zone & GPS</dt>
                    <dd className="mt-1 font-medium text-slate-900 dark:text-white">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="w-3 h-3 text-indigo-600" />
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
                        ? selectedLog.latenessExcused
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

                {/* Section Manager / Main Manager Immediate Actions (No Secondary Approval) */}
                {canModifyAttendance && (
                  <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                        <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                        Manager Immediate Authority
                      </span>
                      <button
                        type="button"
                        onClick={() => setEditMode((v) => !v)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        {t(lang, 'modifyPunch')}
                      </button>
                    </div>

                    {selectedLog.isLate && !selectedLog.latenessExcused && (
                      <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3.5 space-y-2.5">
                        <p className="text-xs font-medium text-amber-900 dark:text-amber-200">
                          Waive {formatAED(selectedLog.latenessPenaltyAED)} lateness deduction immediately
                        </p>
                        <input
                          type="text"
                          value={excuseText}
                          onChange={(e) => setExcuseText(e.target.value)}
                          placeholder="Reason for accepting excuse (e.g., E311 traffic verified)..."
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() => void handleExcuseSubmit()}
                          className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          {t(lang, 'acceptExcuse')}
                        </button>
                      </div>
                    )}

                    {editMode && (
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
                            className="px-3 py-1.5 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
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
