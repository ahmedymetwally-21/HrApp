import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crosshair,
  Download,
  Laptop,
  MapPin,
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
  UserRole,
} from '../types/hr';
import {
  buildAttendanceCSV,
  evaluateClockInEligibility,
  formatShortDate,
  formatTime,
  resolveClockInPolicy,
  triggerCSVDownload,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { GeofenceMap } from './GeofenceMap';

interface AttendanceViewProps {
  currentUser: Employee;
  activeRole: UserRole;
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
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
}

export const AttendanceView: React.FC<AttendanceViewProps> = ({
  currentUser,
  activeRole,
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
  onClockIn,
  onClockOut,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'all' | 'Mobile GPS' | 'Web/PC'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'on_time' | 'late'>('all');
  const [busy, setBusy] = useState(false);

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

  const handleExportCSV = () => {
    const csv = buildAttendanceCSV(visibleLogs, employees);
    triggerCSVDownload(`masar-attendance-${today}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {/* Top Geofence Punch Card + Map */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Clock-In Control Panel */}
        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Geofenced Attendance</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {currentUser.fullName} &middot; {currentUser.jobTitle}
                </p>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-md border whitespace-nowrap shrink-0 ${
                  activeShift
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-slate-50 text-slate-600 border-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {activeShift ? 'Clocked In' : 'Off Shift'}
              </span>
            </div>

            {/* Policy & Device Context */}
            <div className="mt-4 py-3 border-y border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                {simulatedDevice === 'mobile' ? (
                  <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                ) : (
                  <Laptop className="w-3.5 h-3.5 text-indigo-600" />
                )}
                Punch tag: <strong className="text-slate-900">{evaluation.punchSource}</strong>
              </span>
              <span className="whitespace-nowrap">
                Policy:{' '}
                <strong className="text-slate-900">
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
                  className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm text-emerald-900"
                >
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                    <div>
                      <p className="font-medium text-emerald-900">
                        Verified inside {evaluation.nearestZone?.name}
                      </p>
                      <p className="text-xs text-emerald-700 mt-0.5 font-mono tabular-nums">
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
                  className="rounded-lg border border-rose-200 bg-rose-50/70 p-3.5 text-sm text-rose-900"
                >
                  <div className="flex items-start gap-2.5">
                    {evaluation.insideZone ? (
                      <ShieldAlert className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-rose-600 mt-0.5 shrink-0" />
                    )}
                    <div>
                      <p className="font-medium text-rose-900">Clock-In Restricted</p>
                      <p className="text-xs text-rose-700 mt-0.5">{evaluation.blockReason}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Active Shift Summary */}
            {activeShift && (
              <div className="mt-3 flex items-center justify-between text-xs text-slate-600 bg-slate-50 rounded-lg px-3.5 py-2.5 border border-slate-200/80">
                <span>
                  Started <strong className="font-mono text-slate-900">{formatTime(activeShift.clockInTime)}</strong> at{' '}
                  <strong className="text-slate-900">{activeShift.clockInZoneName}</strong>
                </span>
                <span className="font-mono text-slate-500">{activeShift.punchSource}</span>
              </div>
            )}

            {/* Primary Clock In / Out Action */}
            <button
              type="button"
              onClick={handleClockAction}
              disabled={!evaluation.allowed || busy}
              className={`mt-5 w-full min-h-[48px] rounded-xl px-5 py-3 text-sm font-semibold transition-all flex items-center justify-center gap-2 ${
                !evaluation.allowed
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : activeShift
                    ? 'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.99] cursor-pointer shadow-xs'
                    : 'bg-indigo-700 text-white hover:bg-indigo-800 active:scale-[0.99] cursor-pointer shadow-xs'
              }`}
            >
              <MapPin className="w-4 h-4" />
              {busy
                ? 'Recording Punch...'
                : activeShift
                  ? 'Clock Out Now'
                  : 'Clock In Now'}
            </button>
          </div>

          {/* Built-in GPS & Device Simulator Panel */}
          <div className="mt-6 pt-4 border-t border-slate-200">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <span className="text-xs font-semibold text-slate-800">
                Simulate GPS Location & Device
              </span>
              <button
                type="button"
                onClick={onRequestLiveGPS}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer whitespace-nowrap"
              >
                <Crosshair className="w-3.5 h-3.5" />
                Use Browser GPS
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={() => onChangeSimPreset('inside_primary')}
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                  simPreset === 'inside_primary'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Inside Primary Zone
              </button>
              <button
                type="button"
                onClick={() => onChangeSimPreset('outside')}
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                  simPreset === 'outside'
                    ? 'bg-rose-50 border-rose-300 text-rose-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Outside Zone (420m)
              </button>
              <button
                type="button"
                onClick={() => onChangeSimPreset('inside_secondary')}
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                  simPreset === 'inside_secondary'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Jebel Ali Hub Zone
              </button>
              <button
                type="button"
                onClick={() => onChangeSimPreset('low_accuracy')}
                className={`px-2.5 py-2 text-xs font-medium rounded-lg border text-left transition-colors cursor-pointer ${
                  simPreset === 'low_accuracy'
                    ? 'bg-amber-50 border-amber-300 text-amber-900'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                Low-Accuracy IP (280m)
              </button>
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-slate-500 whitespace-nowrap">Simulated Device:</span>
              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 shrink-0">
                <button
                  type="button"
                  onClick={() => onChangeSimulatedDevice('mobile')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    simulatedDevice === 'mobile'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Mobile Phone
                </button>
                <button
                  type="button"
                  onClick={() => onChangeSimulatedDevice('desktop')}
                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    simulatedDevice === 'desktop'
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Desktop PC
                </button>
              </div>
            </div>

            <p className="mt-2 text-[11px] text-slate-500 font-mono truncate">
              {gpsStatusMessage}
            </p>
          </div>
        </section>

        {/* Live Interactive Leaflet Map */}
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-4 sm:p-5 flex flex-col">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Assigned Geofence Zones</h3>
              <p className="text-xs text-slate-500">
                {assignedZones.length > 0
                  ? assignedZones.map((z) => `${z.name} (${z.radiusMeters}m)`).join(' · ')
                  : 'No zones assigned'}
              </p>
            </div>
            {gpsReading && (
              <span className="text-xs font-mono tabular-nums text-slate-500">
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
      <section className="bg-white border border-slate-200 rounded-xl">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {activeRole === UserRole.Employee ? 'My Attendance History' : 'Company Attendance Logs'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
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
                className="w-full sm:w-52 pl-9 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value as 'all' | 'Mobile GPS' | 'Web/PC')}
              aria-label="Filter by punch source"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">All Sources</option>
              <option value="Mobile GPS">Mobile GPS</option>
              <option value="Web/PC">Web/PC</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'on_time' | 'late')}
              aria-label="Filter by punctuality"
              className="px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg bg-white text-slate-700"
            >
              <option value="all">All Status</option>
              <option value="on_time">On Time</option>
              <option value="late">Late Arrival</option>
            </select>

            <button
              type="button"
              onClick={handleExportCSV}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {visibleLogs.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No attendance records match the current filters.
          </div>
        ) : (
          <>
            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Geofence Zone</th>
                    <th className="py-3 px-4">Clock In / Out</th>
                    <th className="py-3 px-4">Source</th>
                    <th className="py-3 px-4">Coordinates</th>
                    <th className="py-3 px-4 text-right">Punctuality</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {visibleLogs.map((log) => {
                    const emp = empMap.get(log.employeeId);
                    return (
                      <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                            <div>
                              <div className="font-medium text-slate-900 leading-tight">
                                {emp?.fullName ?? 'Unknown'}
                              </div>
                              <div className="text-xs text-slate-500">
                                {emp?.employeeCode} &middot; {emp?.department}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-700 whitespace-nowrap">
                          {formatShortDate(log.date)}
                        </td>
                        <td className="py-3 px-4 text-slate-700 text-xs font-medium">
                          {log.clockInZoneName}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-800 whitespace-nowrap">
                          {formatTime(log.clockInTime)} &rarr;{' '}
                          {log.clockOutTime ? (
                            formatTime(log.clockOutTime)
                          ) : (
                            <span className="text-emerald-700 font-medium">Active</span>
                          )}
                        </td>
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded border ${
                              log.punchSource === 'Mobile GPS'
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                                : 'bg-slate-100 text-slate-700 border-slate-200'
                            }`}
                          >
                            {log.punchSource === 'Mobile GPS' ? (
                              <Smartphone className="w-3 h-3" />
                            ) : (
                              <Laptop className="w-3 h-3" />
                            )}
                            {log.punchSource}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-mono text-xs tabular-nums text-slate-500 whitespace-nowrap">
                          {log.clockInLat.toFixed(4)}, {log.clockInLng.toFixed(4)} (&plusmn;
                          {Math.round(log.accuracyMeters)}m)
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          {log.isLate ? (
                            <span className="text-xs font-medium text-rose-700">
                              Late ({log.lateMinutes}m)
                            </span>
                          ) : (
                            <span className="text-xs font-medium text-emerald-700">On Time</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="md:hidden divide-y divide-slate-100">
              {visibleLogs.map((log) => {
                const emp = empMap.get(log.employeeId);
                return (
                  <div key={log.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {emp?.fullName ?? 'Unknown'}
                          </p>
                          <p className="text-xs text-slate-500 truncate">{log.clockInZoneName}</p>
                        </div>
                      </div>
                      <span
                        className={`text-xs font-medium whitespace-nowrap ${
                          log.isLate ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {log.isLate ? `Late (${log.lateMinutes}m)` : 'On Time'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                      <span className="font-mono tabular-nums">
                        {formatShortDate(log.date)} &middot; {formatTime(log.clockInTime)} &rarr;{' '}
                        {log.clockOutTime ? formatTime(log.clockOutTime) : 'Active'}
                      </span>
                      <span className="font-medium text-slate-700">{log.punchSource}</span>
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
