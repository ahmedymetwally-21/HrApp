import React, { useMemo } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  FileWarning,
  MapPin,
  Receipt,
  Users,
  Wallet,
} from 'lucide-react';
import {
  AppSettings,
  AttendanceLog,
  Employee,
  EmployeeDocument,
  GeofenceZone,
  GPSReading,
  LeaveRequest,
  LeaveStatus,
  PayrollAdjustment,
  UserRole,
} from '../types/hr';
import {
  calculateEmployeePayroll,
  evaluateClockInEligibility,
  formatAED,
  formatShortDate,
  formatTime,
  getDocumentExpiryStatus,
  resolveClockInPolicy,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';

export type NavSection =
  | 'dashboard'
  | 'attendance'
  | 'employees'
  | 'leaves'
  | 'payroll'
  | 'geofences';

interface DashboardViewProps {
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  payrollAdjustments: PayrollAdjustment[];
  settings: AppSettings;
  gpsReading: GPSReading | null;
  simulatedDevice: 'mobile' | 'desktop';
  onNavigate: (section: NavSection) => void;
  onClockIn: () => Promise<void>;
  onClockOut: (logId: string) => Promise<void>;
  onQuickLeaveDecision: (
    leaveId: string,
    status: LeaveStatus.Approved | LeaveStatus.Rejected
  ) => Promise<void>;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentUser,
  activeRole,
  employees,
  geofences,
  documents,
  attendance,
  leaves,
  payrollAdjustments,
  settings,
  gpsReading,
  simulatedDevice,
  onNavigate,
  onClockIn,
  onClockOut,
  onQuickLeaveDecision,
}) => {
  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const activeEmployees = useMemo(() => employees.filter((e) => e.active), [employees]);
  const todayLogs = useMemo(() => attendance.filter((a) => a.date === today), [attendance, today]);
  const lateToday = useMemo(() => todayLogs.filter((a) => a.isLate), [todayLogs]);
  const pendingLeaves = useMemo(
    () => leaves.filter((l) => l.status === LeaveStatus.Pending),
    [leaves]
  );

  const expiringDocs = useMemo(() => {
    const scopeDocs =
      activeRole === UserRole.Employee
        ? documents.filter((d) => d.employeeId === currentUser.id)
        : documents;

    return scopeDocs
      .map((doc) => ({ doc, ...getDocumentExpiryStatus(doc.expiryDate) }))
      .filter((item) => item.status === 'expired' || item.status === 'expiring_soon')
      .sort((a, b) => a.daysRemaining - b.daysRemaining);
  }, [documents, activeRole, currentUser.id]);

  const totalMonthlyNetPayroll = useMemo(() => {
    return activeEmployees.reduce(
      (sum, emp) => sum + calculateEmployeePayroll(emp, currentMonth, payrollAdjustments).netSalary,
      0
    );
  }, [activeEmployees, currentMonth, payrollAdjustments]);

  const departmentPayroll = useMemo(() => {
    const map = new Map<string, { count: number; net: number }>();
    activeEmployees.forEach((emp) => {
      const row = calculateEmployeePayroll(emp, currentMonth, payrollAdjustments);
      const curr = map.get(emp.department) ?? { count: 0, net: 0 };
      map.set(emp.department, { count: curr.count + 1, net: curr.net + row.netSalary });
    });
    return Array.from(map.entries()).sort((a, b) => b[1].net - a[1].net);
  }, [activeEmployees, currentMonth, payrollAdjustments]);

  // Employee-specific clock-in state
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

  const myPayslip = useMemo(
    () => calculateEmployeePayroll(currentUser, currentMonth, payrollAdjustments),
    [currentUser, currentMonth, payrollAdjustments]
  );

  // --- EMPLOYEE ROLE DASHBOARD ---
  if (activeRole === UserRole.Employee) {
    const lb = currentUser.leaveBalance;
    return (
      <div className="space-y-6">
        {/* Hero Clock-In Action Banner */}
        <section className="bg-white border border-slate-200 rounded-xl p-5 sm:p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2 max-w-xl">
            <p className="text-xs font-medium text-indigo-700">
              {formatShortDate(today)} &middot; {currentUser.department}
            </p>
            <h2 className="text-2xl font-bold text-slate-900">
              Good day, {currentUser.fullName.split(' ')[0]}
            </h2>
            {evaluation.allowed ? (
              <p className="text-sm text-emerald-700 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Inside <strong>{evaluation.nearestZone?.name}</strong> (
                  <span className="font-mono">{evaluation.distanceMeters}m</span> from pin &middot;{' '}
                  {evaluation.punchSource})
                </span>
              </p>
            ) : (
              <p className="text-sm text-rose-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{evaluation.blockReason}</span>
              </p>
            )}
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 shrink-0">
            <button
              type="button"
              disabled={!evaluation.allowed}
              onClick={() => (activeShift ? onClockOut(activeShift.id) : onClockIn())}
              className={`min-h-[48px] px-6 py-3 rounded-xl text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors ${
                !evaluation.allowed
                  ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
                  : activeShift
                    ? 'bg-rose-600 text-white hover:bg-rose-700 cursor-pointer'
                    : 'bg-indigo-700 text-white hover:bg-indigo-800 cursor-pointer'
              }`}
            >
              <MapPin className="w-4 h-4" />
              {activeShift ? 'Clock Out Now' : 'Clock In Now'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="min-h-[48px] px-4 py-3 rounded-xl border border-slate-200 bg-white text-sm font-medium text-slate-700 hover:bg-slate-50 inline-flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Open Map & Simulator
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </section>

        {/* Personal Summary Strip */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <button
            type="button"
            onClick={() => onNavigate('leaves')}
            className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer"
          >
            <p className="text-xs font-medium text-slate-500">Annual Leave Remaining</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
              {Math.max(0, lb.annualTotal - lb.annualUsed)}{' '}
              <span className="text-sm font-sans font-normal text-slate-500">
                / {lb.annualTotal} days
              </span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Sick: {Math.max(0, lb.sickTotal - lb.sickUsed)}d &middot; Emergency:{' '}
              {Math.max(0, lb.emergencyTotal - lb.emergencyUsed)}d
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('payroll')}
            className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer"
          >
            <p className="text-xs font-medium text-slate-500">Current Month Net Pay</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-indigo-900">
              {formatAED(myPayslip.netSalary)}
            </p>
            <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
              {myPayslip.totalDeductions > 0
                ? `Includes -${formatAED(myPayslip.totalDeductions)} deductions`
                : 'No deductions this month'}
            </p>
          </button>

          <button
            type="button"
            onClick={() => onNavigate('employees')}
            className="text-left bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 transition-colors cursor-pointer"
          >
            <p className="text-xs font-medium text-slate-500">Document Alerts</p>
            <p
              className={`mt-2 text-2xl font-bold font-mono tabular-nums ${
                expiringDocs.length > 0 ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {expiringDocs.length}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {expiringDocs.length > 0
                ? 'Passport / EID / Visa requires renewal'
                : 'All personal documents up to date'}
            </p>
          </button>
        </section>

        {/* Personal Alerts & Latest Payslip Breakdown */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">My Expiring Documents</h3>
              <button
                type="button"
                onClick={() => onNavigate('employees')}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                Open Vault
              </button>
            </div>
            {expiringDocs.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No documents expiring within 30 days.</p>
            ) : (
              <div className="divide-y divide-slate-100 mt-1">
                {expiringDocs.map(({ doc, status, daysRemaining }) => (
                  <div key={doc.id} className="py-3 flex items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{doc.type}</p>
                      <p className="text-xs text-slate-500 font-mono">
                        No. {doc.documentNumber} &middot; Expires {formatShortDate(doc.expiryDate)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2 py-0.5 rounded border whitespace-nowrap ${
                        status === 'expired'
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}
                    >
                      {status === 'expired'
                        ? `Expired ${Math.abs(daysRemaining)}d ago`
                        : `${daysRemaining}d left`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="bg-white border border-slate-200 rounded-xl p-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="text-sm font-semibold text-slate-900">
                Current Month Deductions & Bonuses
              </h3>
              <button
                type="button"
                onClick={() => onNavigate('payroll')}
                className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
              >
                Full Payslip
              </button>
            </div>
            {myPayslip.deductions.length === 0 && myPayslip.bonuses.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">
                No deductions or bonuses logged for this month.
              </p>
            ) : (
              <div className="divide-y divide-slate-100 mt-1">
                {myPayslip.bonuses.map((b) => (
                  <div key={b.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-emerald-800">{b.category}</p>
                      <p className="text-xs text-slate-600">{b.reason}</p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-emerald-700 whitespace-nowrap">
                      +{formatAED(b.amountAED)}
                    </span>
                  </div>
                ))}
                {myPayslip.deductions.map((d) => (
                  <div key={d.id} className="py-3 flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium text-rose-800">{d.category}</p>
                      <p className="text-xs text-slate-600">{d.reason}</p>
                    </div>
                    <span className="font-mono text-xs font-semibold text-rose-700 whitespace-nowrap">
                      -{formatAED(d.amountAED)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    );
  }

  // --- ADMIN (HR) & MANAGEMENT EXECUTIVE DASHBOARD ---
  const isManagement = activeRole === UserRole.Management;
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {isManagement ? 'Executive Workforce Overview' : 'HR Operations Dashboard'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {formatShortDate(today)} &middot; Live geofenced attendance, approvals, compliance, and
            AED payroll summary.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onNavigate('payroll')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
          >
            <Receipt className="w-3.5 h-3.5" />
            Monthly Payroll
          </button>
          <button
            type="button"
            onClick={() => onNavigate('geofences')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 cursor-pointer whitespace-nowrap"
          >
            <MapPin className="w-3.5 h-3.5" />
            Manage Geofences
          </button>
        </div>
      </div>

      {/* Multi-Column KPI Grid */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Live Attendance</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900">
            {todayLogs.length}
            <span className="text-sm font-normal text-slate-400"> / {activeEmployees.length}</span>
          </p>
          <p className="mt-1 text-xs text-slate-500">Clocked in today</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Late Arrivals</span>
            <Clock className="w-4 h-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700">
            {lateToday.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Past {settings.workStartTime} grace</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Pending Approvals</span>
            <CalendarClock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700">
            {pendingLeaves.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Leave requests awaiting</p>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Expiring Docs</span>
            <FileWarning className="w-4 h-4 text-rose-600" />
          </div>
          <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-rose-700">
            {expiringDocs.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Expired or &le; 30 days</p>
        </div>

        <div className="col-span-2 lg:col-span-1 bg-white border border-slate-200 rounded-xl p-4">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500">
            <span>Monthly Payroll</span>
            <Wallet className="w-4 h-4 text-indigo-700" />
          </div>
          <p className="mt-2 text-lg sm:text-xl font-bold font-mono tabular-nums text-indigo-900 truncate">
            {formatAED(totalMonthlyNetPayroll)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Net payable ({currentMonth})</p>
        </div>
      </section>

      {/* Main Split: Pending Leave Queue + Document Compliance Alerts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Pending Leave Approvals ({pendingLeaves.length})
              </h3>
              <p className="text-xs text-slate-500">
                {isManagement
                  ? 'Approve, reject, or override HR leave decisions'
                  : 'Action pending requests directly from your queue'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('leaves')}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              View All
            </button>
          </div>

          {pendingLeaves.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All leave requests have been reviewed.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {pendingLeaves.map((req) => {
                const emp = empMap.get(req.employeeId);
                return (
                  <div
                    key={req.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900">
                          {emp?.fullName} &middot;{' '}
                          <span className="font-normal text-indigo-700">{req.type}</span>
                        </p>
                        <p className="text-xs text-slate-500 font-mono">
                          {formatShortDate(req.startDate)} &rarr; {formatShortDate(req.endDate)} (
                          {req.days}d)
                        </p>
                        <p className="text-xs text-slate-600 mt-1 line-clamp-1">{req.reason}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onQuickLeaveDecision(req.id, LeaveStatus.Approved)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 cursor-pointer"
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => onQuickLeaveDecision(req.id, LeaveStatus.Rejected)}
                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs font-medium hover:bg-rose-50 cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                Document Expiry Compliance
              </h3>
              <p className="text-xs text-slate-500">Flagged &le; 30 days or expired</p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('employees')}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              Directory
            </button>
          </div>

          {expiringDocs.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              All company compliance documents are valid.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expiringDocs.map(({ doc, status, daysRemaining }) => {
                const emp = empMap.get(doc.employeeId);
                return (
                  <div key={doc.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">
                        {emp?.fullName}
                      </p>
                      <p className="text-xs text-slate-500">
                        {doc.type} &middot; Expires {formatShortDate(doc.expiryDate)}
                      </p>
                    </div>
                    <span
                      className={`text-xs font-semibold px-2.5 py-1 rounded-md border whitespace-nowrap shrink-0 ${
                        status === 'expired'
                          ? 'text-rose-700 bg-rose-50 border-rose-200'
                          : 'text-amber-800 bg-amber-50 border-amber-200'
                      }`}
                    >
                      {status === 'expired'
                        ? `Expired (${Math.abs(daysRemaining)}d)`
                        : `Expiring (${daysRemaining}d)`}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* Bottom Split: Today's Live Punches + Department Payroll */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <section className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Today&apos;s Live Attendance</h3>
            <button
              type="button"
              onClick={() => onNavigate('attendance')}
              className="text-xs font-medium text-indigo-700 hover:text-indigo-900 cursor-pointer"
            >
              Full Logs
            </button>
          </div>
          {todayLogs.length === 0 ? (
            <div className="p-6 text-sm text-slate-500">No clock-ins recorded yet today.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayLogs.map((log) => {
                const emp = empMap.get(log.employeeId);
                return (
                  <div key={log.id} className="px-5 py-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {emp?.fullName}
                        </p>
                        <p className="text-xs text-slate-500 truncate">
                          {log.clockInZoneName} &middot; {log.punchSource}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-mono tabular-nums text-slate-800">
                        {formatTime(log.clockInTime)}
                      </p>
                      <p
                        className={`text-[11px] font-medium ${
                          log.isLate ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {log.isLate ? `Late (${log.lateMinutes}m)` : 'On Time'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="lg:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">Department Payroll Summary</h3>
            <span className="text-xs font-mono text-slate-500">{currentMonth}</span>
          </div>
          <div className="divide-y divide-slate-100">
            {departmentPayroll.map(([dept, info]) => (
              <div key={dept} className="px-5 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{dept}</p>
                  <p className="text-xs text-slate-500">
                    {info.count} active employee{info.count === 1 ? '' : 's'}
                  </p>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900">
                  {formatAED(info.net)}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};
