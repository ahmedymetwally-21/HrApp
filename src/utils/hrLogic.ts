import {
  AttendanceLog,
  ClockInEvaluation,
  ClockInPolicyMode,
  DocumentExpiryStatus,
  Employee,
  GeofenceZone,
  GPSReading,
  LeaveBalance,
  LeaveType,
  MonthlyPayrollRow,
  PayrollAdjustment,
  PunchSource,
} from '../types/hr';

const EARTH_RADIUS_METERS = 6371000;

/**
 * Computes exact geodesic distance in meters using the Haversine formula.
 */
export function calculateDistanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_METERS * c);
}

/**
 * Resolves effective PC vs. Mobile GPS clock-in policy for an employee.
 */
export function resolveClockInPolicy(
  employee: Employee,
  globalPolicy: ClockInPolicyMode
): ClockInPolicyMode {
  if (employee.clockInPolicyOverride && employee.clockInPolicyOverride !== 'inherit') {
    return employee.clockInPolicyOverride;
  }
  return globalPolicy;
}

/**
 * Evaluates whether an employee is allowed to clock in or out based on assigned geofences,
 * GPS accuracy, device type (desktop vs mobile), and active clock-in policy.
 */
export function evaluateClockInEligibility(params: {
  reading: GPSReading | null;
  assignedZones: GeofenceZone[];
  effectivePolicy: ClockInPolicyMode;
  isDesktopDevice: boolean;
  maxAccuracyMeters?: number;
}): ClockInEvaluation {
  const {
    reading,
    assignedZones,
    effectivePolicy,
    isDesktopDevice,
    maxAccuracyMeters = 150,
  } = params;

  const activeZones = assignedZones.filter((z) => z.active);
  const punchSource: PunchSource = isDesktopDevice ? 'Web/PC' : 'Mobile GPS';

  if (activeZones.length === 0) {
    return {
      allowed: false,
      insideZone: false,
      nearestZone: null,
      distanceMeters: null,
      effectivePolicy,
      punchSource,
      blockReason: 'No active geofence locations are assigned to your profile. Contact HR.',
    };
  }

  // Policy Check 1: Strict Mobile GPS Only blocks desktop devices
  if (effectivePolicy === ClockInPolicyMode.StrictMobileGPS && isDesktopDevice) {
    return {
      allowed: false,
      insideZone: false,
      nearestZone: activeZones[0],
      distanceMeters: reading
        ? calculateDistanceMeters(
            reading.latitude,
            reading.longitude,
            activeZones[0].latitude,
            activeZones[0].longitude
          )
        : null,
      effectivePolicy,
      punchSource,
      blockReason:
        'Strict Mobile GPS policy is active. Clock-in from desktop PCs is blocked — use your mobile phone.',
    };
  }

  if (!reading) {
    return {
      allowed: false,
      insideZone: false,
      nearestZone: activeZones[0],
      distanceMeters: null,
      effectivePolicy,
      punchSource,
      blockReason: 'Waiting for GPS location signal. Enable location permissions or use the GPS Simulator.',
    };
  }

  // Find nearest assigned zone (prefer any zone the user is strictly inside)
  let nearestZone: GeofenceZone = activeZones[0];
  let nearestDistance = calculateDistanceMeters(
    reading.latitude,
    reading.longitude,
    activeZones[0].latitude,
    activeZones[0].longitude
  );
  let matchedZone: GeofenceZone | null =
    nearestDistance <= activeZones[0].radiusMeters ? activeZones[0] : null;
  let matchedDistance = nearestDistance;

  for (let i = 1; i < activeZones.length; i++) {
    const zone = activeZones[i];
    const dist = calculateDistanceMeters(
      reading.latitude,
      reading.longitude,
      zone.latitude,
      zone.longitude
    );
    if (dist <= zone.radiusMeters && (!matchedZone || dist < matchedDistance)) {
      matchedZone = zone;
      matchedDistance = dist;
    }
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestZone = zone;
    }
  }

  const targetZone = matchedZone ?? nearestZone;
  const targetDistance = matchedZone ? matchedDistance : nearestDistance;
  const insideZone = matchedZone !== null;

  // Policy Check 2: Strict Mobile GPS blocks low-accuracy IP geolocation (> 150m)
  if (
    effectivePolicy === ClockInPolicyMode.StrictMobileGPS &&
    reading.accuracyMeters > maxAccuracyMeters
  ) {
    return {
      allowed: false,
      insideZone,
      nearestZone: targetZone,
      distanceMeters: targetDistance,
      effectivePolicy,
      punchSource,
      blockReason: `Low GPS accuracy (±${Math.round(reading.accuracyMeters)}m exceeds ${maxAccuracyMeters}m limit). Move outdoors or enable high-accuracy GPS.`,
    };
  }

  // Strict Geofence Enforcement: must be inside an assigned radius
  if (!insideZone) {
    const metersOutside = Math.max(1, targetDistance - targetZone.radiusMeters);
    return {
      allowed: false,
      insideZone: false,
      nearestZone: targetZone,
      distanceMeters: targetDistance,
      effectivePolicy,
      punchSource,
      blockReason: `Outside allowed zone — you are ${targetDistance}m from ${targetZone.name} (${metersOutside}m outside the ${targetZone.radiusMeters}m boundary).`,
    };
  }

  return {
    allowed: true,
    insideZone: true,
    nearestZone: targetZone,
    distanceMeters: targetDistance,
    effectivePolicy,
    punchSource,
    blockReason: null,
  };
}

/**
 * Classifies document expiry status relative to a reference YYYY-MM-DD date.
 * Expired: < 0 days remaining; Expiring Soon: 0..30 days remaining; Valid: > 30 days.
 */
export function getDocumentExpiryStatus(
  expiryDateIso: string,
  referenceDateIso: string = new Date().toISOString().slice(0, 10)
): { status: DocumentExpiryStatus; daysRemaining: number } {
  const expiryMs = Date.parse(`${expiryDateIso}T00:00:00Z`);
  const refMs = Date.parse(`${referenceDateIso}T00:00:00Z`);
  const daysRemaining = Math.floor((expiryMs - refMs) / (1000 * 60 * 60 * 24));

  if (daysRemaining < 0) {
    return { status: 'expired', daysRemaining };
  }
  if (daysRemaining <= 30) {
    return { status: 'expiring_soon', daysRemaining };
  }
  return { status: 'valid', daysRemaining };
}

/**
 * Calculates inclusive calendar days between start and end dates (YYYY-MM-DD).
 * Returns 0 if endDate < startDate or invalid.
 */
export function calculateInclusiveDays(startDateIso: string, endDateIso: string): number {
  if (!startDateIso || !endDateIso) return 0;
  const startMs = Date.parse(`${startDateIso}T00:00:00Z`);
  const endMs = Date.parse(`${endDateIso}T00:00:00Z`);
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs < startMs) {
    return 0;
  }
  return Math.floor((endMs - startMs) / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Returns remaining leave balance for a specific LeaveType (Infinity for Unpaid Leave).
 */
export function getRemainingLeaveDays(balance: LeaveBalance, type: LeaveType): number {
  switch (type) {
    case LeaveType.Annual:
      return Math.max(0, balance.annualTotal - balance.annualUsed);
    case LeaveType.Sick:
      return Math.max(0, balance.sickTotal - balance.sickUsed);
    case LeaveType.Emergency:
      return Math.max(0, balance.emergencyTotal - balance.emergencyUsed);
    case LeaveType.Unpaid:
      return Infinity;
  }
}

/**
 * Validates a leave request before submission.
 */
export function validateLeaveSubmission(params: {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  balance: LeaveBalance;
}): { valid: boolean; days: number; error: string | null } {
  const { type, startDate, endDate, reason, balance } = params;
  const days = calculateInclusiveDays(startDate, endDate);
  if (days <= 0) {
    return { valid: false, days: 0, error: 'End date must be on or after the start date.' };
  }
  if (!reason.trim() || reason.trim().length < 4) {
    return { valid: false, days, error: 'Please provide a brief reason for your leave request.' };
  }
  const remaining = getRemainingLeaveDays(balance, type);
  if (days > remaining) {
    return {
      valid: false,
      days,
      error: `Insufficient ${type} balance (${remaining} day${remaining === 1 ? '' : 's'} remaining, ${days} requested).`,
    };
  }
  return { valid: true, days, error: null };
}

/**
 * Applies or reverses approved leave days against an employee's leave balance.
 */
export function adjustLeaveBalance(
  balance: LeaveBalance,
  type: LeaveType,
  deltaDays: number
): LeaveBalance {
  const next = { ...balance };
  switch (type) {
    case LeaveType.Annual:
      next.annualUsed = Math.max(0, next.annualUsed + deltaDays);
      break;
    case LeaveType.Sick:
      next.sickUsed = Math.max(0, next.sickUsed + deltaDays);
      break;
    case LeaveType.Emergency:
      next.emergencyUsed = Math.max(0, next.emergencyUsed + deltaDays);
      break;
    case LeaveType.Unpaid:
      next.unpaidUsed = Math.max(0, next.unpaidUsed + deltaDays);
      break;
  }
  return next;
}

/**
 * Calculates monthly payroll row for an employee.
 * Gross = Base + Housing + Transport + Other
 * Net = Gross + Bonuses - Deductions
 */
export function calculateEmployeePayroll(
  employee: Employee,
  month: string,
  adjustments: PayrollAdjustment[]
): MonthlyPayrollRow {
  const empMonthAdj = adjustments.filter(
    (a) => a.employeeId === employee.id && a.month === month
  );
  const bonuses = empMonthAdj.filter((a) => a.kind === 'bonus');
  const deductions = empMonthAdj.filter((a) => a.kind === 'deduction');

  const { baseSalary, housingAllowance, transportAllowance, otherAllowance } = employee.salary;
  const totalAllowances = housingAllowance + transportAllowance + otherAllowance;
  const grossSalary = baseSalary + totalAllowances;
  const totalBonuses = bonuses.reduce((sum, item) => sum + item.amountAED, 0);
  const totalDeductions = deductions.reduce((sum, item) => sum + item.amountAED, 0);
  const netSalary = Math.max(0, grossSalary + totalBonuses - totalDeductions);

  return {
    employee,
    month,
    baseSalary,
    housingAllowance,
    transportAllowance,
    otherAllowance,
    totalAllowances,
    grossSalary,
    bonuses,
    totalBonuses,
    deductions,
    totalDeductions,
    netSalary,
  };
}

/**
 * Determines whether a clock-in ISO timestamp is late relative to workStartTime ("HH:MM") + gracePeriodMinutes.
 */
export function evaluateLateArrival(
  clockInIso: string,
  workStartTime: string,
  gracePeriodMinutes: number
): { isLate: boolean; lateMinutes: number } {
  const date = new Date(clockInIso);
  const [startH, startM] = workStartTime.split(':').map(Number);
  const actualMinutes = date.getHours() * 60 + date.getMinutes();
  const thresholdMinutes = startH * 60 + startM + gracePeriodMinutes;
  const diff = actualMinutes - thresholdMinutes;
  if (diff > 0) {
    return { isLate: true, lateMinutes: diff + gracePeriodMinutes };
  }
  return { isLate: false, lateMinutes: 0 };
}

export function formatAED(amount: number): string {
  return `AED ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatShortDate(dateIso: string): string {
  if (!dateIso) return '—';
  const d = new Date(`${dateIso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateIso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatTime(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function escapeCSV(value: string | number | boolean | undefined | null): string {
  const str = String(value ?? '');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function buildPayrollCSV(rows: MonthlyPayrollRow[]): string {
  const headers = [
    'Month',
    'Employee ID',
    'Full Name',
    'Department',
    'Job Title',
    'Base Salary (AED)',
    'Housing Allowance (AED)',
    'Transport Allowance (AED)',
    'Other Allowance (AED)',
    'Gross Salary (AED)',
    'Bonuses (AED)',
    'Deductions (AED)',
    'Deduction Reasons',
    'Net Salary (AED)',
  ];
  const lines = rows.map((r) => [
    r.month,
    r.employee.employeeCode,
    r.employee.fullName,
    r.employee.department,
    r.employee.jobTitle,
    r.baseSalary.toFixed(2),
    r.housingAllowance.toFixed(2),
    r.transportAllowance.toFixed(2),
    r.otherAllowance.toFixed(2),
    r.grossSalary.toFixed(2),
    r.totalBonuses.toFixed(2),
    r.totalDeductions.toFixed(2),
    r.deductions.map((d) => `${d.category}: ${d.reason} (${d.amountAED} AED)`).join(' | '),
    r.netSalary.toFixed(2),
  ]);
  return [headers, ...lines].map((row) => row.map(escapeCSV).join(',')).join('\n');
}

export function buildAttendanceCSV(logs: AttendanceLog[], employees: Employee[]): string {
  const empMap = new Map(employees.map((e) => [e.id, e]));
  const headers = [
    'Date',
    'Employee ID',
    'Full Name',
    'Department',
    'Zone',
    'Clock In',
    'Clock Out',
    'Source',
    'GPS Coordinates',
    'Accuracy (m)',
    'Status',
  ];
  const lines = logs.map((l) => {
    const emp = empMap.get(l.employeeId);
    return [
      l.date,
      emp?.employeeCode ?? l.employeeId,
      emp?.fullName ?? 'Unknown',
      emp?.department ?? '—',
      l.clockInZoneName,
      formatTime(l.clockInTime),
      l.clockOutTime ? formatTime(l.clockOutTime) : 'Active Shift',
      l.punchSource,
      `${l.clockInLat.toFixed(5)}, ${l.clockInLng.toFixed(5)}`,
      Math.round(l.accuracyMeters),
      l.isLate ? `Late (${l.lateMinutes}m)` : 'On Time',
    ];
  });
  return [headers, ...lines].map((row) => row.map(escapeCSV).join(',')).join('\n');
}

export function triggerCSVDownload(filename: string, csvContent: string): void {
  const blob = new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
