import {
  ApprovalStepRecord,
  ApprovalStepRole,
  ApprovalWorkflow,
  AttendanceLog,
  ClockInEvaluation,
  ClockInPolicyMode,
  DeductionCategory,
  DocumentTypeValue,
  Employee,
  EmployeeDocument,
  EmployeeModel,
  GeofenceZone,
  GPSReading,
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  MonthlyPayrollRow,
  PayrollAdjustment,
  PunchSource,
  UserRole,
} from '../types/hr';

const EARTH_RADIUS_METERS = 6_371_000;

/**
 * Haversine distance in meters between two WGS84 coordinates.
 */
export function calculateHaversineDistanceMeters(
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
 * Strict map geofence enforcement for ALL employees (including Drivers)
 * plus PC Web vs Mobile App policy.
 */
export function evaluateClockInEligibility(params: {
  reading: GPSReading | null;
  assignedZones: GeofenceZone[];
  effectivePolicy: ClockInPolicyMode;
  isDesktopDevice: boolean;
  maxAccuracyMeters: number;
}): ClockInEvaluation {
  const { reading, assignedZones, effectivePolicy, isDesktopDevice, maxAccuracyMeters } = params;
  const activeZones = assignedZones.filter((z) => z.active);
  const punchSource: PunchSource = isDesktopDevice ? 'PC Web' : 'Mobile App';

  if (effectivePolicy === ClockInPolicyMode.StrictMobileGPS && isDesktopDevice) {
    return {
      allowed: false,
      reason: 'Strict Mobile GPS policy is active. Clock in using the mobile app.',
      nearestZone: activeZones[0] ?? null,
      distanceMeters: null,
      outsideByMeters: null,
      effectivePolicy,
      punchSource,
    };
  }

  if (activeZones.length === 0) {
    return {
      allowed: false,
      reason: 'No active geofence locations are assigned to your profile.',
      nearestZone: null,
      distanceMeters: null,
      outsideByMeters: null,
      effectivePolicy,
      punchSource,
    };
  }

  if (!reading) {
    return {
      allowed: false,
      reason: 'Waiting for GPS location signal. Enable location services to clock in.',
      nearestZone: activeZones[0],
      distanceMeters: null,
      outsideByMeters: null,
      effectivePolicy,
      punchSource,
    };
  }

  if (
    effectivePolicy === ClockInPolicyMode.StrictMobileGPS &&
    reading.accuracyMeters > maxAccuracyMeters
  ) {
    return {
      allowed: false,
      reason: `GPS accuracy (±${Math.round(reading.accuracyMeters)}m) exceeds the ${maxAccuracyMeters}m limit.`,
      nearestZone: activeZones[0],
      distanceMeters: null,
      outsideByMeters: null,
      effectivePolicy,
      punchSource,
    };
  }

  let nearestZone: GeofenceZone = activeZones[0];
  let nearestDistance = calculateHaversineDistanceMeters(
    reading.latitude,
    reading.longitude,
    nearestZone.latitude,
    nearestZone.longitude
  );

  for (let i = 1; i < activeZones.length; i++) {
    const z = activeZones[i];
    const dist = calculateHaversineDistanceMeters(
      reading.latitude,
      reading.longitude,
      z.latitude,
      z.longitude
    );
    if (dist < nearestDistance) {
      nearestDistance = dist;
      nearestZone = z;
    }
  }

  if (nearestDistance <= nearestZone.radiusMeters) {
    return {
      allowed: true,
      reason: `Inside ${nearestZone.name} (${nearestDistance}m from pin)`,
      nearestZone,
      distanceMeters: nearestDistance,
      outsideByMeters: 0,
      effectivePolicy,
      punchSource,
    };
  }

  const outsideBy = Math.max(1, nearestDistance - nearestZone.radiusMeters);
  return {
    allowed: false,
    reason: `You are ${outsideBy}m outside ${nearestZone.name} (${nearestDistance}m from pin). Move within ${nearestZone.radiusMeters}m to clock in.`,
    nearestZone,
    distanceMeters: nearestDistance,
    outsideByMeters: outsideBy,
    effectivePolicy,
    punchSource,
  };
}

/**
 * Fixed-shift lateness & tiered fixed AED deduction calculator (NO overtime).
 */
export function evaluateModelLateness(params: {
  clockInIso: string;
  shiftStartHHmm: string;
  model: EmployeeModel;
}): { isLate: boolean; lateMinutes: number; penaltyAED: number } {
  const { clockInIso, shiftStartHHmm, model } = params;
  const clockIn = new Date(clockInIso);
  const [startH, startM] = shiftStartHHmm.split(':').map(Number);
  if (Number.isNaN(startH) || Number.isNaN(startM)) {
    return { isLate: false, lateMinutes: 0, penaltyAED: 0 };
  }
  const actualMinutes = clockIn.getHours() * 60 + clockIn.getMinutes();
  const scheduledMinutes = startH * 60 + startM;
  const diff = actualMinutes - scheduledMinutes;

  if (diff <= model.graceMinutes) {
    return { isLate: false, lateMinutes: 0, penaltyAED: 0 };
  }

  const penaltyAED = matchLatenessPenaltyAED(diff, model);
  return { isLate: true, lateMinutes: diff, penaltyAED };
}

export function matchLatenessPenaltyAED(lateMinutes: number, model: EmployeeModel): number {
  if (lateMinutes <= model.graceMinutes) return 0;
  const sortedTiers = [...model.latenessTiers].sort(
    (a, b) => a.minLateMinutes - b.minLateMinutes
  );
  for (const tier of sortedTiers) {
    const withinMax = tier.maxLateMinutes === null || lateMinutes <= tier.maxLateMinutes;
    if (lateMinutes >= tier.minLateMinutes && withinMax) {
      return tier.penaltyAED;
    }
  }
  // If lateMinutes exceeds highest finite tier, apply highest tier penalty
  const highest = sortedTiers[sortedTiers.length - 1];
  return highest && lateMinutes >= highest.minLateMinutes ? highest.penaltyAED : 0;
}

export function getEffectiveShiftStart(employee: Employee, model: EmployeeModel): string {
  return employee.customShift?.shiftStart ?? model.shiftStart;
}

export function getEffectiveShiftEnd(employee: Employee, model: EmployeeModel): string {
  return employee.customShift?.shiftEnd ?? model.shiftEnd;
}

/**
 * Multi-company visibility helpers (isolated company view + shared employees + Group View)
 */
export function isEmployeeInCompany(employee: Employee, selectedCompanyId: string): boolean {
  if (selectedCompanyId === 'all') return true;
  return (
    employee.primaryCompanyId === selectedCompanyId ||
    employee.sharedCompanyIds.includes(selectedCompanyId)
  );
}

export function isSharedEmployeeInCompany(employee: Employee, selectedCompanyId: string): boolean {
  if (selectedCompanyId === 'all') return employee.sharedCompanyIds.length > 0;
  return (
    employee.primaryCompanyId !== selectedCompanyId &&
    employee.sharedCompanyIds.includes(selectedCompanyId)
  );
}

/**
 * Strict RBAC Scoping:
 * - Main Manager & HR Admin: all employees in selected company (or all companies for Main Manager)
 * - Section Manager & Section Co-Manager: strictly scoped to their managedSectionIds
 * - Employee: strictly self only
 */
export function getScopedEmployees(params: {
  employees: Employee[];
  viewer: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
}): Employee[] {
  const { employees, viewer, activeRole, selectedCompanyId } = params;
  return employees.filter((emp) => {
    if (!isEmployeeInCompany(emp, selectedCompanyId)) return false;

    if (activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin) {
      return true;
    }
    if (
      activeRole === UserRole.SectionManager ||
      activeRole === UserRole.SectionCoManager
    ) {
      const allowedSections =
        viewer.managedSectionIds.length > 0 ? viewer.managedSectionIds : [viewer.sectionId];
      return allowedSections.includes(emp.sectionId) || emp.id === viewer.id;
    }
    return emp.id === viewer.id;
  });
}

/**
 * Customizable Multi-Step Leave Approval Chain Builder with Smart Auto-Skip.
 * Resolution priority:
 * 1) Exact company + section workflow
 * 2) Exact section workflow across all companies
 * 3) Exact company workflow across all sections
 * 4) Global default workflow (all + all)
 * 5) Built-in fallback: Section Manager -> HR -> Main Manager
 */
export function resolveApprovalWorkflow(
  workflows: ApprovalWorkflow[],
  companyId: string,
  sectionId: string
): ApprovalWorkflow {
  const exact = workflows.find((w) => w.companyId === companyId && w.sectionId === sectionId);
  if (exact) return exact;
  const bySection = workflows.find((w) => w.companyId === 'all' && w.sectionId === sectionId);
  if (bySection) return bySection;
  const byCompany = workflows.find((w) => w.companyId === companyId && w.sectionId === 'all');
  if (byCompany) return byCompany;
  const fallback = workflows.find((w) => w.companyId === 'all' && w.sectionId === 'all');
  if (fallback) return fallback;
  return {
    id: 'wf-builtin',
    name: 'Default Approval Chain',
    companyId: 'all',
    sectionId: 'all',
    steps: ['section_manager', 'hr_admin', 'main_manager'],
    autoApproveMaxDays: 0,
  };
}

export function buildLeaveApprovalChain(params: {
  applicantRole: UserRole;
  days: number;
  workflow: ApprovalWorkflow;
}): {
  steps: ApprovalStepRecord[];
  currentStepIndex: number;
  initialStatus: LeaveStatus;
} {
  const { applicantRole, days, workflow } = params;

  if (workflow.autoApproveMaxDays > 0 && days <= workflow.autoApproveMaxDays) {
    const steps: ApprovalStepRecord[] = workflow.steps.map((role, idx) => ({
      stepOrder: idx + 1,
      role,
      status: 'approved',
      actorName: 'Auto-Approval Policy',
      remark: `Auto-approved (≤ ${workflow.autoApproveMaxDays} day${workflow.autoApproveMaxDays === 1 ? '' : 's'}).`,
      decidedAt: new Date().toISOString(),
    }));
    return { steps, currentStepIndex: -1, initialStatus: LeaveStatus.Approved };
  }

  const steps: ApprovalStepRecord[] = workflow.steps.map((role, idx) => {
    // Smart Auto-Skip: When a Section Manager submits a leave for themselves, skip Step 1 (section_manager)
    if (applicantRole === UserRole.SectionManager && role === 'section_manager') {
      return {
        stepOrder: idx + 1,
        role,
        status: 'skipped',
        actorName: 'System Auto-Skip',
        remark: 'Skipped Step 1 because applicant is a Section Manager.',
        decidedAt: new Date().toISOString(),
      };
    }
    // If HR Admin applies, auto-skip hr_admin step
    if (applicantRole === UserRole.HRAdmin && role === 'hr_admin') {
      return {
        stepOrder: idx + 1,
        role,
        status: 'skipped',
        actorName: 'System Auto-Skip',
        remark: 'Skipped HR step because applicant is HR Admin.',
        decidedAt: new Date().toISOString(),
      };
    }
    return {
      stepOrder: idx + 1,
      role,
      status: 'pending',
    };
  });

  const firstPending = steps.findIndex((s) => s.status === 'pending');
  if (firstPending === -1) {
    return { steps, currentStepIndex: -1, initialStatus: LeaveStatus.Approved };
  }

  return {
    steps,
    currentStepIndex: firstPending,
    initialStatus: LeaveStatus.Pending,
  };
}

export function canRoleActOnLeaveStep(params: {
  leave: LeaveRequest;
  actorRole: UserRole;
  actorEmployee: Employee;
}): boolean {
  const { leave, actorRole, actorEmployee } = params;
  if (leave.status !== LeaveStatus.Pending || leave.currentStepIndex < 0) return false;
  if (leave.employeeId === actorEmployee.id && actorRole !== UserRole.MainManager) return false;

  // Section Co-Manager can NEVER formally approve/reject leaves
  if (actorRole === UserRole.SectionCoManager || actorRole === UserRole.Employee) return false;

  const activeStep = leave.approvalSteps[leave.currentStepIndex];
  if (!activeStep || activeStep.status !== 'pending') return false;

  if (activeStep.role === 'section_manager') {
    if (actorRole !== UserRole.SectionManager) return false;
    const managed =
      actorEmployee.managedSectionIds.length > 0
        ? actorEmployee.managedSectionIds
        : [actorEmployee.sectionId];
    return managed.includes(leave.sectionId);
  }
  if (activeStep.role === 'hr_admin') {
    return actorRole === UserRole.HRAdmin;
  }
  if (activeStep.role === 'main_manager') {
    return actorRole === UserRole.MainManager;
  }
  return false;
}

export function advanceLeaveApproval(params: {
  leave: LeaveRequest;
  decision: 'approved' | 'rejected';
  actorName: string;
  remark: string;
}): LeaveRequest {
  const { leave, decision, actorName, remark } = params;
  const idx = leave.currentStepIndex;
  if (idx < 0 || idx >= leave.approvalSteps.length) return leave;

  const nextSteps = leave.approvalSteps.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: decision,
          actorName,
          remark: remark.trim() || undefined,
          decidedAt: new Date().toISOString(),
        }
      : s
  );

  if (decision === 'rejected') {
    return {
      ...leave,
      approvalSteps: nextSteps,
      currentStepIndex: -1,
      status: LeaveStatus.Rejected,
    };
  }

  const nextPendingIdx = nextSteps.findIndex((s, i) => i > idx && s.status === 'pending');
  if (nextPendingIdx === -1) {
    return {
      ...leave,
      approvalSteps: nextSteps,
      currentStepIndex: -1,
      status: LeaveStatus.Approved,
    };
  }

  return {
    ...leave,
    approvalSteps: nextSteps,
    currentStepIndex: nextPendingIdx,
    status: LeaveStatus.Pending,
  };
}

/**
 * Document expiry classification & model-specific required documents checker.
 */
export function getDocumentExpiryStatus(
  expiryDateStr: string,
  referenceDate: Date = new Date()
): { status: 'expired' | 'expiring_soon' | 'valid'; daysRemaining: number } {
  const refDay = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  );
  const [y, m, d] = expiryDateStr.split('-').map(Number);
  const expDay = new Date(y, (m || 1) - 1, d || 1);
  const diffDays = Math.ceil((expDay.getTime() - refDay.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { status: 'expired', daysRemaining: diffDays };
  if (diffDays <= 30) return { status: 'expiring_soon', daysRemaining: diffDays };
  return { status: 'valid', daysRemaining: diffDays };
}

export function getMissingModelDocuments(
  employeeDocs: EmployeeDocument[],
  model: EmployeeModel | undefined
): DocumentTypeValue[] {
  if (!model) return [];
  const uploaded = new Set(employeeDocs.map((d) => d.type));
  return model.requiredDocuments.filter((reqType) => !uploaded.has(reqType));
}

export function calculateInclusiveDays(startDate: string, endDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map(Number);
  const [ey, em, ed] = endDate.split('-').map(Number);
  if (!sy || !ey) return 0;
  const start = new Date(sy, sm - 1, sd);
  const end = new Date(ey, em - 1, ed);
  const diff = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  return diff > 0 ? diff : 0;
}

export function validateLeaveSubmission(params: {
  type: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
  balance: LeaveBalance;
}): { valid: true; days: number } | { valid: false; error: string } {
  const days = calculateInclusiveDays(params.startDate, params.endDate);
  if (days <= 0) {
    return { valid: false, error: 'End date must be on or after the start date.' };
  }
  if (!params.reason.trim() || params.reason.trim().length < 4) {
    return { valid: false, error: 'Please provide a brief reason for your leave request.' };
  }
  if (params.type === LeaveType.Annual) {
    const remaining = params.balance.annualTotal - params.balance.annualUsed;
    if (days > remaining) {
      return {
        valid: false,
        error: `Requested ${days} days exceeds remaining Annual Leave balance (${remaining} days).`,
      };
    }
  }
  if (params.type === LeaveType.Sick) {
    const remaining = params.balance.sickTotal - params.balance.sickUsed;
    if (days > remaining) {
      return {
        valid: false,
        error: `Requested ${days} days exceeds remaining Sick Leave balance (${remaining} days).`,
      };
    }
  }
  if (params.type === LeaveType.Emergency) {
    const remaining = params.balance.emergencyTotal - params.balance.emergencyUsed;
    if (days > remaining) {
      return {
        valid: false,
        error: `Requested ${days} days exceeds remaining Emergency Leave balance (${remaining} days).`,
      };
    }
  }
  return { valid: true, days };
}

export function adjustLeaveBalance(
  balance: LeaveBalance,
  type: LeaveType,
  deltaDays: number
): LeaveBalance {
  const next = { ...balance };
  if (type === LeaveType.Annual) {
    next.annualUsed = Math.max(0, next.annualUsed + deltaDays);
  } else if (type === LeaveType.Sick) {
    next.sickUsed = Math.max(0, next.sickUsed + deltaDays);
  } else if (type === LeaveType.Emergency) {
    next.emergencyUsed = Math.max(0, next.emergencyUsed + deltaDays);
  } else {
    next.unpaidUsed = Math.max(0, next.unpaidUsed + deltaDays);
  }
  return next;
}

/**
 * Monthly AED payroll computation combining:
 * - Gross Salary (Base + Housing + Transport + Other)
 * - Automatic unexcused lateness deductions from attendance logs for that month
 * - Manual deductions & bonuses from payroll_deductions
 */
export function calculateEmployeePayroll(
  employee: Employee,
  month: string,
  adjustments: PayrollAdjustment[],
  attendanceLogs: AttendanceLog[] = []
): MonthlyPayrollRow {
  const { baseSalary, housingAllowance, transportAllowance, otherAllowance } = employee.salary;
  const totalAllowances = housingAllowance + transportAllowance + otherAllowance;
  const grossSalary = baseSalary + totalAllowances;

  const manualItems = adjustments.filter(
    (a) => a.employeeId === employee.id && a.month === month
  );

  // Convert unexcused late attendance logs (without duplicate manual log) into automatic lateness deduction rows
  const existingLogIds = new Set(
    manualItems.map((m) => m.attendanceLogId).filter(Boolean) as string[]
  );
  const autoLatenessItems: PayrollAdjustment[] = attendanceLogs
    .filter(
      (log) =>
        log.employeeId === employee.id &&
        log.date.startsWith(month) &&
        log.isLate &&
        !log.latenessExcused &&
        log.latenessPenaltyAED > 0 &&
        !existingLogIds.has(log.id)
    )
    .map((log) => ({
      id: `auto-late-${log.id}`,
      employeeId: employee.id,
      companyId: employee.primaryCompanyId,
      month,
      kind: 'deduction',
      category: DeductionCategory.Lateness,
      amountAED: log.latenessPenaltyAED,
      date: log.date,
      reason: `Unexcused late arrival (${log.lateMinutes}m late at ${log.zoneName})`,
      source: 'auto_lateness',
      attendanceLogId: log.id,
      createdBy: 'Employee Model Policy',
      createdByRole: UserRole.HRAdmin,
      createdAt: log.clockInTime,
    }));

  const manualDeductionsList = manualItems.filter((a) => a.kind === 'deduction');
  const bonuses = manualItems.filter((a) => a.kind === 'bonus');
  const deductions = [...autoLatenessItems, ...manualDeductionsList];

  const autoLatenessDeductions = autoLatenessItems.reduce((sum, d) => sum + d.amountAED, 0);
  const manualDeductions = manualDeductionsList.reduce((sum, d) => sum + d.amountAED, 0);
  const totalDeductions = autoLatenessDeductions + manualDeductions;
  const totalBonuses = bonuses.reduce((sum, b) => sum + b.amountAED, 0);
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
    totalBonuses,
    autoLatenessDeductions,
    manualDeductions,
    totalDeductions,
    netSalary,
    deductions,
    bonuses,
  };
}

export function formatAED(amount: number): string {
  return `AED ${amount.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatShortDate(isoOrDate: string): string {
  if (!isoOrDate) return '—';
  const datePart = isoOrDate.includes('T') ? isoOrDate.slice(0, 10) : isoOrDate;
  const [y, m, d] = datePart.split('-').map(Number);
  if (!y || !m || !d) return isoOrDate;
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function formatTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function csvEscape(value: string | number | null | undefined): string {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function buildAttendanceCSV(
  logs: AttendanceLog[],
  employeesById: Map<string, Employee>,
  companiesById: Map<string, string>
): string {
  const header = [
    'Employee ID',
    'Employee Name',
    'Company',
    'Date',
    'Zone',
    'Clock In',
    'Clock Out',
    'Device',
    'Status',
    'Late Minutes',
    'Penalty (AED)',
    'Excused',
  ];
  const rows = logs.map((l) => {
    const emp = employeesById.get(l.employeeId);
    return [
      emp?.employeeCode ?? l.employeeId,
      emp?.fullName ?? 'Unknown',
      companiesById.get(l.companyId) ?? l.companyId,
      l.date,
      l.zoneName,
      formatTime(l.clockInTime),
      formatTime(l.clockOutTime),
      l.punchSource,
      l.isLate ? (l.latenessExcused ? 'Excused Late' : 'Late') : 'On Time',
      l.lateMinutes,
      l.latenessExcused ? 0 : l.latenessPenaltyAED,
      l.latenessExcused ? 'Yes' : 'No',
    ]
      .map(csvEscape)
      .join(',');
  });
  return [header.join(','), ...rows].join('\n');
}

export function buildPayrollCSV(
  rows: MonthlyPayrollRow[],
  companiesById: Map<string, string>,
  sectionsById: Map<string, string>
): string {
  const header = [
    'Employee ID',
    'Employee Name',
    'Primary Company',
    'Section',
    'Month',
    'Base Salary (AED)',
    'Allowances (AED)',
    'Gross (AED)',
    'Bonuses (AED)',
    'Auto Lateness Deductions (AED)',
    'Manual Deductions (AED)',
    'Total Deductions (AED)',
    'Net Salary (AED)',
  ];
  const lines = rows.map((r) =>
    [
      r.employee.employeeCode,
      r.employee.fullName,
      companiesById.get(r.employee.primaryCompanyId) ?? r.employee.primaryCompanyId,
      sectionsById.get(r.employee.sectionId) ?? r.employee.sectionId,
      r.month,
      r.baseSalary.toFixed(2),
      r.totalAllowances.toFixed(2),
      r.grossSalary.toFixed(2),
      r.totalBonuses.toFixed(2),
      r.autoLatenessDeductions.toFixed(2),
      r.manualDeductions.toFixed(2),
      r.totalDeductions.toFixed(2),
      r.netSalary.toFixed(2),
    ]
      .map(csvEscape)
      .join(',')
  );
  return [header.join(','), ...lines].join('\n');
}

export function validateApiBaseUrl(url: string): { valid: boolean; error?: string } {
  const trimmed = url.trim();
  if (!trimmed) {
    return { valid: false, error: 'Server URL is required for Self-Hosted API mode.' };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Server URL must start with http:// or https://' };
    }
    return { valid: true };
  } catch {
    return {
      valid: false,
      error: 'Enter a valid server URL (e.g. http://192.168.1.50:8000/api/v1).',
    };
  }
}

export function getDefaultStepsForWorkflow(): ApprovalStepRole[] {
  return ['section_manager', 'hr_admin', 'main_manager'];
}
