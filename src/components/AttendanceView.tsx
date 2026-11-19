import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Crosshair,
  Download,
  Laptop,
  MapPin,
  RefreshCw,
  Search,
  ShieldAlert,
  Smartphone,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceLog,
  ClockInPolicyMode,
  Employee,
  GeofenceZone,
  GPSReading,
  PunchSource,
  UserRole,
} from '../types/hr';
import { nativeBridge } from '../services/nativeBridge';
import {
  buildAttendanceCSV,
  evaluateClockInEligibility,
  formatShortDate,
  formatTime,
  resolveClockInPolicy,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { GeofenceMap } from './GeofenceMap';

interface AttendanceViewProps {
  currentUser: Employee;
  activeRole: UserRole;
  isDemoMode: boolean;
  employees: Employee[];
  geofences: GeofenceZone[];
  attendance: AttendanceLog[];
  settings: AppSettings;
  gpsReading: GPSReading | null;
  gpsStatusMessage: string;
  simPreset: 'live' | 'inside_primary' | 'inside_secondary' | 'outside' | 'low_accuracy';
  simulatedDevice: 'mobile' | 'desktop';
  onChangeSimPreset: (
    preset: 'live' | 'inside_primary' | 'inside_secondary' | 'outside' | 'low_accuracy'
  ) => void;
  onChangeSimulatedDevice: (device: 'mobile' | 'desktop') => void;
  onRequestLiveGPS: () => void;
  onRefresh: () => Promise<void>;
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentUser,
  activeRole,
  isDemoMode,
  employees,
  geofences,
  attendance,
  settings,
  gpsReading,
  gpsStatusMessage,
  simPreset,
  simulatedDevice,
  onChangeSimPreset,
  onChangeSimulatedDevice,
  onRequestLiveGPS,
  onRefresh,
  onClockIn,
  onClockOut,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | PunchSource>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_time' | 'late'>('all');
  const [simExpanded, setSimExpanded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const today = new Date().toISOString().slice(0, 10);
  const assignedZones = useMemo(
    () => geofences.filter((z) => currentUser.assignedZoneIds.includes(z.id)),
    [geofences, currentUser.assignedZoneIds]
  );

  const effectivePolicy = resolveClockInPolicy(currentUser, settings.globalClockInPolicy);
  const evaluation = useMemo(
    () =>
      evaluateClockInEligibility({
        reading: gpsReading,
        assignedZones,
        effectivePolicy,
        isDesktopDevice: simulatedDevice === 'desktop',
        maxAccuracyMeters: settings.maxMobileAccuracyMeters,
      }),
    [gpsReading, assignedZones, effectivePolicy, simulatedDevice, settings.maxMobileAccuracyMeters]
  );

  const activeShift = useMemo(
    () =>
      attendance.find(
        (log) => log.employeeId === currentUser.id && log.date === today && !log.clockOutTime
      ),
    [attendance, currentUser.id, today]
  );

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const visibleLogs = useMemo(() => {
    const base =
      activeRole === UserRole.Employee
        ? attendance.filter((l) => l.employeeId === currentUser.id)
        : attendance;

    return base.filter((log) => {
      const emp = empMap.get(log.employeeId);
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const hay = `${emp?.fullName ?? ''} ${emp?.employeeCode ?? ''} ${log.clockInZoneName} ${log.date}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (sourceFilter !== 'all' && log.punchSource !== sourceFilter) return false;
      if (statusFilter === 'late' && !log.isLate) return false;
      if (statusFilter === 'on_time' && log.isLate) return false;
      return true;
    });
  }, [attendance, activeRole, currentUser.id, empMap, searchQuery, sourceFilter, statusFilter]);

  const handleClockAction = async () => {
    if (!evaluation.allowed || busy) return;
    setBusy(true);
    try {
      if (activeShift) {
        await onClockOut(activeShift.id);
      } else {
        await onClockIn();
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePullRefresh = async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const handleExportCSV = async () => {
    const csv = buildAttendanceCSV(visibleLogs, employees);
    await nativeBridge.saveTextFile(
      `masar-attendance-${today}.csv`,
      `\uFEFF${csv}`,
      'text/csv;charset=utf-8;'
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Geofence Punch Card + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Clock-In Control Panel */}
        <section className="lg:col-span-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  Geofenced Attendance
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                  {currentUser.fullName} &middot; {currentUser.jobTitle}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handlePullRefresh}
                  aria-label="Refresh attendance and GPS"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
                <span
                  className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border whitespace-nowrap ${
                    activeShift
                      ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-900'
                      : 'bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {activeShift ? 'Clocked In' : 'Off Shift'}
                </span>
              </div>
            </div>

            {/* Policy & Device Context */}
            <div className="mt-4 py-3 border-y border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {simulatedDevice === 'mobile' ? (
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                ) : (
                  <Laptop className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                )}
                Device:{' '}
                <strong className="text-slate-900 dark:text-white">{evaluation.punchSource}</strong>
              </span>
              <span className="whitespace-nowrap">
                Policy:{' '}
                <strong className="text-slate-900 dark:text-white">
                  {effectivePolicy === ClockInPolicyMode.StrictMobileGPS
                    ? 'Strict Mobile GPS'
                    : 'Office PC & Mobile'}
                </strong>
              </span>
            </div>

            {/* GPS Verification Banner */}
            <div className="mt-4">
              {evaluation.allowed ? (
                <div
                  role="status"
                  className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/70 dark:bg-emerald-950/40 p-3.5 text-sm text-emerald-900 dark:text-emerald-200"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-emerald-900 dark:text-emerald-200">
                        Verified inside {evaluation.nearestZone?.name}
                      </p>
                      <p className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5 font-mono tabular-nums">
                        {evaluation.distanceMeters}m from center (max{' '}
                        {evaluation.nearestZone?.radiusMeters}m) &middot; Accuracy &plusmn;
                        {Math.round(gpsReading?.accuracyMeters ?? 0)}m
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div
                  role="alert"
                  className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/40 p-3.5 text-sm text-rose-900 dark:text-rose-200"
                >
                  <div className="flex items-start gap-2.5">
                    {evaluation.insideZone ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-rose-900 dark:text-rose-200">
                        Clock-In Locked
                      </p>
                      <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                        {evaluation.blockReason}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Shift Summary */}
            {activeShift && (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-950 rounded-lg px-3.5 py-2.5 border border-slate-200/80 dark:border-slate-800">
                <span>
                  Started{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {formatTime(activeShift.clockInTime)}
                  </strong>{' '}
                  at <strong className="text-slate-900 dark:text-white">{activeShift.clockInZoneName}</strong>
                </span>
                <span className="font-mono text-slate-500 dark:text-slate-400">
                  {activeShift.punchSource}
                </span>
              </div>
            )}

            {/* Primary Clock In / Out Action */}
            <button
              type="button"
              onClick={handleClockAction}
              disabled={!evaluation.allowed || busy}
              className={`mt-5 w-full min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                !evaluation.allowed
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-not-allowed'
                  : activeShift
                    ? 'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.99] cursor-pointer shadow-xs'
                    : 'bg-indigo-700 text-white hover:bg-indigo-800 active:scale-[0.99] cursor-pointer shadow-xs'
              }`}
            >
              <MapPin className="w-4 h-4" />
              {busy ? 'Recording Punch...' : activeShift ? 'Clock Out Now' : 'Clock In Now'}
            </button>
          </div>

          {/* Collapsible Simulate GPS Panel (Demo Mode) */}
          {isDemoMode && (
            <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                aria-expanded={simExpanded}
                onClick={() => setSimExpanded((v) => !v)}
                className="w-full flex items-center justify-between gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-700 dark:hover:text-indigo-400 cursor-pointer py-1"
              >
                <span>Simulate GPS & Device (Demo Testing)</span>
                {simExpanded ? (
                  <ChevronUp className="w-4 h-4 text-slate-400" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                )}
              </button>

              {simExpanded && (
                <div className="mt-3 space-y-3">
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => onChangeSimPreset('inside_primary')}
                      className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                        simPreset === 'inside_primary'
                          ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Inside Primary Zone
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeSimPreset('outside')}
                      className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                        simPreset === 'outside'
                          ? 'bg-rose-50 dark:bg-rose-950/70 border-rose-300 dark:border-rose-700 text-rose-900 dark:text-rose-200'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Outside Zone (420m)
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeSimPreset('inside_secondary')}
                      className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                        simPreset === 'inside_secondary'
                          ? 'bg-indigo-50 dark:bg-indigo-950/70 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Jebel Ali Hub Zone
                    </button>
                    <button
                      type="button"
                      onClick={() => onChangeSimPreset('low_accuracy')}
                      className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                        simPreset === 'low_accuracy'
                          ? 'bg-amber-50 dark:bg-amber-950/70 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200'
                          : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      Low-Accuracy IP (280m)
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      Simulated Device:
                    </span>
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onChangeSimulatedDevice('mobile')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          simulatedDevice === 'mobile'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        Mobile App
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeSimulatedDevice('desktop')}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                          simulatedDevice === 'desktop'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        PC Web
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono truncate">
                      {gpsStatusMessage}
                    </p>
                    <button
                      type="button"
                      onClick={onRequestLiveGPS}
                      className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Crosshair className="w-3.5 h-3.5" />
                      Live GPS
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Live Interactive Leaflet Map */}
        <section className="lg:col-span-7 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Assigned Geofence Zones
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {assignedZones.length > 0
                  ? assignedZones.map((z) => `${z.name} (${z.radiusMeters}m)`).join(' · ')
                  : 'No zones assigned'}
              </p>
            </div>
            {gpsReading && (
              <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
                {gpsReading.latitude.toFixed(5)}, {gpsReading.longitude.toFixed(5)}
              </span>
            )}
          </div>
          <div className="flex-1 min-h-[280px]">
            <GeofenceMap
              zones={assignedZones.length > 0 ? assignedZones : geofences}
              userLocation={gpsReading}
              isInsideZone={evaluation.insideZone}
              heightClass="h-full min-h-[300px]"
            />
          </div>
        </section>
      </div>

      {/* Attendance Logs Table (Desktop) / Card List (Mobile) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
        <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">
              {activeRole === UserRole.Employee ? 'My Attendance History' : 'Company Attendance Logs'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
              {visibleLogs.length} record{visibleLogs.length === 1 ? '' : 's'} &middot; Work start{' '}
              {settings.workStartTime} ({settings.gracePeriodMinutes}m grace)
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:flex-none">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search employee or zone..."
                aria-label="Search attendance logs"
                className="w-full sm:w-52 pl-9 pr-3 py-1.5 text-sm border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | PunchSource)}
              aria-label="Filter by device type"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Devices</option>
              <option value="Mobile App">Mobile App</option>
              <option value="PC Web">PC Web</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'on_time' | 'late')}
              aria-label="Filter by punctuality"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Status</option>
              <option value="on_time">On Time</option>
              <option value="late">Late Arrival</option>
            </select>

            <button
              type="button"
              onClick={() => void handleExportCSV()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No attendance records match the current filters.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Geofence Zone</th>
                    <th className="py-3 px-4">Clock In / Out</th>
                    <th className="py-3 px-4">Device</th>
                    <th className="py-3 px-4">Coordinates</th>
                    <th className="py-3 px-4 text-right">Punctuality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {visibleLogs.map((log) => {
                    const emp = empMap.get(log.employeeId);
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                      >
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white leading-tight">
                                {emp?.fullName ?? 'Unknown'}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400">
                                {emp?.employeeCode} &middot; {emp?.department}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {formatShortDate(log.date)}
                        </td>
                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 text-xs font-medium">
                          {log.clockInZoneName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {formatTime(log.clockInTime)} &rarr;{' '}
                          {log.clockOutTime ? (
                            formatTime(log.clockOutTime)
                          ) : (
                            <span className="text-emerald-700 dark:text-emerald-400 font-medium">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
                              log.punchSource === 'Mobile App'
                                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-900'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                            }`}
                          >
                            {log.punchSource === 'Mobile App' ? (
                              <Smartphone className="w-3 h-3" />
                            ) : (
                              <Laptop className="w-3 h-3" />
                            )}
                            {log.punchSource}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                          {log.clockInLat.toFixed(4)}, {log.clockInLng.toFixed(4)} (&plusmn;
                          {Math.round(log.accuracyMeters)}m)
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {log.isLate ? (
                            <span className="text-xs font-medium text-rose-700 dark:text-rose-400">
                              Late ({log.lateMinutes}m)
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              On Time
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {visibleLogs.map((log) => {
                const emp = empMap.get(log.employeeId);
                return (
                  <div key={log.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {emp?.fullName ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {log.clockInZoneName}
                          </p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          log.isLate
                            ? 'text-rose-700 dark:text-rose-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                        }`}
                      >
                        {log.isLate ? `Late (${log.lateMinutes}m)` : 'On Time'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 dark:text-slate-400 pt-1">
                      <span className="font-mono tabular-nums">
                        {formatShortDate(log.date)} &middot; {formatTime(log.clockInTime)} &rarr;{' '}
                        {log.clockOutTime ? formatTime(log.clockOutTime) : 'Active'}
                      </span>
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        {log.punchSource}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>
    </div>
  );
};
