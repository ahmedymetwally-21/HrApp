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
  EndpointFailure,
  GeofenceZone,
  GPSReading,
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  MonthlyPayrollRow,
  PayrollAdjustment,
  ProAssignment,
  PunchSource,
  ResolvedSalaryRelease,
  SalaryReleaseSchedule,
  UserRole,
} from '../types/hr';

/**
 * Case-insensitive role normalization so Live PostgreSQL/FastAPI roles
 * (e.g. `admin`, `ADMIN`, `main_manager`, `Main Manager`, `hr`, `HR Admin`, `section_manager`)
 * resolve to the exact same canonical `UserRole` permissions as Demo Mode.
 */
export function normalizeUserRole(raw: unknown): UserRole {
  if (typeof raw !== 'string' || !raw.trim()) {
    return UserRole.Employee;
  }
  const key = raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/_+/g, '_');

  switch (key) {
    case 'main_manager':
    case 'mainmanager':
    case 'admin':
    case 'super_admin':
    case 'superadmin':
    case 'owner':
    case 'ceo':
    case 'director':
    case 'general_manager':
    case 'gm':
      return UserRole.MainManager;
    case 'hr_admin':
    case 'hradmin':
    case 'hr':
    case 'hr_manager':
    case 'human_resources':
    case 'human_resource':
      return UserRole.HRAdmin;
    case 'section_manager':
    case 'sectionmanager':
    case 'manager':
    case 'dept_manager':
    case 'department_manager':
    case 'team_lead':
      return UserRole.SectionManager;
    case 'section_co_manager':
    case 'sectioncomanager':
    case 'co_manager':
    case 'comanager':
    case 'assistant_manager':
    case 'deputy_manager':
      return UserRole.SectionCoManager;
    case 'pro':
    case 'pro_officer':
    case 'public_relations':
    case 'public_relations_officer':
      return UserRole.PRO;
    case 'accounting':
    case 'accountant':
    case 'finance':
    case 'payroll_officer':
    case 'payroll':
      return UserRole.Accounting;
    case 'employee':
    case 'staff':
    case 'driver':
    case 'user':
    case 'worker':
    default:
      return UserRole.Employee;
  }
}

export function isMainManagerRole(role: unknown): boolean {
  return normalizeUserRole(role) === UserRole.MainManager;
}

export function isAdminOrHRRole(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === UserRole.MainManager || normalized === UserRole.HRAdmin;
}

export type StartupEndpointKey =
  | 'companies'
  | 'sections'
  | 'labels'
  | 'employeeModels'
  | 'employees'
  | 'proAssignments'
  | 'geofences'
  | 'documents'
  | 'attendance'
  | 'attendanceAudit'
  | 'leaves'
  | 'workflows'
  | 'payrollAdjustments'
  | 'salaryReleases'
  | 'settings';

export interface StartupEndpointSpec {
  key: StartupEndpointKey;
  path: string;
}

export const ALL_STARTUP_ENDPOINTS: StartupEndpointSpec[] = [
  { key: 'companies', path: '/companies' },
  { key: 'sections', path: '/sections' },
  { key: 'labels', path: '/labels' },
  { key: 'employeeModels', path: '/employee-models' },
  { key: 'employees', path: '/users' },
  { key: 'proAssignments', path: '/pro-assignments' },
  { key: 'geofences', path: '/locations' },
  { key: 'documents', path: '/documents' },
  { key: 'attendance', path: '/attendance' },
  { key: 'attendanceAudit', path: '/attendance/audit' },
  { key: 'leaves', path: '/leaves' },
  { key: 'workflows', path: '/approval-workflows' },
  { key: 'payrollAdjustments', path: '/payroll/deductions' },
  { key: 'salaryReleases', path: '/payroll/releases' },
  { key: 'settings', path: '/settings' },
];

/**
 * Returns only the startup endpoints allowed for the authenticated user's role,
 * preventing unnecessary 403 Forbidden bursts for non-admin users while keeping
 * full access for Main Manager & HR Admin.
 */
export function getStartupEndpointsForRole(role: UserRole | string): StartupEndpointSpec[] {
  const normalized = normalizeUserRole(role);
  if (normalized === UserRole.MainManager || normalized === UserRole.HRAdmin) {
    return ALL_STARTUP_ENDPOINTS;
  }

  let allowedKeys: Set<StartupEndpointKey>;
  if (normalized === UserRole.Accounting) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'employees',
      'attendance',
      'payrollAdjustments',
      'salaryReleases',
      'settings',
    ]);
  } else if (normalized === UserRole.PRO) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'employeeModels',
      'employees',
      'proAssignments',
      'documents',
      'settings',
    ]);
  } else if (normalized === UserRole.SectionManager || normalized === UserRole.SectionCoManager) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'employeeModels',
      'employees',
      'geofences',
      'documents',
      'attendance',
      'attendanceAudit',
      'leaves',
      'payrollAdjustments',
      'salaryReleases',
      'settings',
    ]);
  } else {
    // Employee
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'employeeModels',
      'employees',
      'geofences',
      'documents',
      'attendance',
      'leaves',
      'payrollAdjustments',
      'salaryReleases',
      'settings',
    ]);
  }

  return ALL_STARTUP_ENDPOINTS.filter((spec) => allowedKeys.has(spec.key));
}

export interface SettledStartupItem {
  key: StartupEndpointKey;
  path: string;
  ok: boolean;
  value?: unknown;
  failure?: EndpointFailure;
}

/**
 * Evaluates settled startup endpoint results:
 * - Individual `403 Forbidden` responses default gracefully to empty collections (`[]`)
 *   so non-admin users are never blocked by restricted endpoints.
 * - Non-403 failures (401, 404, 500, 408 timeout, network errors) OR a 100% 403 failure
 *   across every requested endpoint are surfaced as fatal startup failures so the
 *   Error Card can display exact endpoints and HTTP status codes.
 */
export function evaluateStartupEndpointResults(items: SettledStartupItem[]): {
  fatalFailures: EndpointFailure[];
  forbiddenEndpoints: string[];
  values: Partial<Record<StartupEndpointKey, unknown>>;
} {
  const fatalFailures: EndpointFailure[] = [];
  const forbiddenFailures: EndpointFailure[] = [];
  const values: Partial<Record<StartupEndpointKey, unknown>> = {};

  for (const item of items) {
    if (item.ok) {
      values[item.key] = item.value;
      continue;
    }
    const fail = item.failure ?? {
      endpoint: item.path,
      status: null,
      statusText: 'Error',
      message: 'Unknown error while loading endpoint.',
    };
    if (fail.status === 403) {
      forbiddenFailures.push(fail);
    } else {
      fatalFailures.push(fail);
    }
  }

  // If EVERY single requested endpoint returned 403 (nothing succeeded), surface them as fatal
  // so the user sees the 403 Forbidden error card instead of an empty broken app.
  const succeededCount = items.filter((i) => i.ok).length;
  if (succeededCount === 0 && forbiddenFailures.length > 0 && fatalFailures.length === 0) {
    return {
      fatalFailures: forbiddenFailures,
      forbiddenEndpoints: forbiddenFailures.map((f) => f.endpoint),
      values,
    };
  }

  return {
    fatalFailures,
    forbiddenEndpoints: forbiddenFailures.map((f) => f.endpoint),
    values,
  };
}

/**
 * Main Manager Executive Exemptions:
 * Main Managers are strictly exempt from attendance tracking and monthly payroll.
 */
export function isAttendanceTracked(employee: Pick<Employee, 'role'>): boolean {
  return normalizeUserRole(employee.role) !== UserRole.MainManager;
}

export function isPayrollEligible(employee: Pick<Employee, 'role'>): boolean {
  return normalizeUserRole(employee.role) !== UserRole.MainManager;
}

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
  hasNoAssignedZones?: boolean;
}): ClockInEvaluation {
  const {
    reading,
    assignedZones,
    effectivePolicy,
    isDesktopDevice,
    maxAccuracyMeters,
    hasNoAssignedZones = false,
  } = params;
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
      isGeofenceExempt: hasNoAssignedZones,
    };
  }

  // No-Zone Option: employees intentionally assigned [] zones are Geofence Exempt
  if (hasNoAssignedZones) {
    return {
      allowed: true,
      reason: 'Geofence Exempt — clock in allowed from any location.',
      nearestZone: null,
      distanceMeters: 0,
      outsideByMeters: 0,
      effectivePolicy,
      punchSource,
      isGeofenceExempt: true,
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
      isGeofenceExempt: false,
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
 * PRO Time-Limited Document Access helpers
 */
export function isProAssignmentActive(
  assignment: ProAssignment,
  now: Date = new Date()
): boolean {
  const nowMs = now.getTime();
  const startMs = new Date(assignment.accessStart).getTime();
  const endMs = new Date(assignment.accessExpiresAt).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs)) return false;
  return nowMs >= startMs && nowMs <= endMs;
}

export function getActiveProAssignedEmployeeIds(
  proAssignments: ProAssignment[],
  proUserId: string,
  now: Date = new Date()
): Set<string> {
  const ids = new Set<string>();
  proAssignments.forEach((a) => {
    if (a.proUserId === proUserId && isProAssignmentActive(a, now)) {
      ids.add(a.employeeId);
    }
  });
  return ids;
}

/**
 * Attached company list for strict Accounting / non-group company scoping.
 */
export function getUserAttachedCompanyIds(user: Pick<Employee, 'primaryCompanyId' | 'sharedCompanyIds'>): string[] {
  const set = new Set<string>([user.primaryCompanyId, ...user.sharedCompanyIds]);
  return Array.from(set).filter(Boolean);
}

/**
 * Strict RBAC Scoping:
 * - Main Manager & HR Admin: all employees in selected company (or all companies for Main Manager)
 * - Section Manager & Section Co-Manager: strictly scoped to their managedSectionIds
 * - PRO: ONLY employees with an active (non-expired) HR-assigned PRO grant
 * - Accounting: ONLY payroll-eligible employees whose primary/shared company is explicitly attached to the Accounting user
 * - Employee: strictly self only
 */
export function getScopedEmployees(params: {
  employees: Employee[];
  viewer: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  proAssignments?: ProAssignment[];
  now?: Date;
}): Employee[] {
  const {
    employees,
    viewer,
    activeRole: rawActiveRole,
    selectedCompanyId,
    proAssignments = [],
    now = new Date(),
  } = params;
  const activeRole = normalizeUserRole(rawActiveRole);

  if (activeRole === UserRole.PRO) {
    const activeIds = getActiveProAssignedEmployeeIds(proAssignments, viewer.id, now);
    return employees.filter(
      (emp) => activeIds.has(emp.id) && isEmployeeInCompany(emp, selectedCompanyId)
    );
  }

  if (activeRole === UserRole.Accounting) {
    const attachedCompanyIds = new Set(getUserAttachedCompanyIds(viewer));
    return employees.filter((emp) => {
      if (!isPayrollEligible(emp)) return false;
      // Strict company scoping: zero data for unattached companies
      if (!attachedCompanyIds.has(emp.primaryCompanyId)) return false;
      if (selectedCompanyId !== 'all') {
        if (!attachedCompanyIds.has(selectedCompanyId)) return false;
        return emp.primaryCompanyId === selectedCompanyId;
      }
      return true;
    });
  }

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
  const { leave, actorEmployee } = params;
  const actorRole = normalizeUserRole(params.actorRole);
  if (leave.status !== LeaveStatus.Pending || leave.currentStepIndex < 0) return false;
  if (leave.employeeId === actorEmployee.id && actorRole !== UserRole.MainManager) return false;

  // Section Co-Manager, Employee, PRO, and Accounting can NEVER formally approve/reject leaves
  if (
    actorRole === UserRole.SectionCoManager ||
    actorRole === UserRole.Employee ||
    actorRole === UserRole.PRO ||
    actorRole === UserRole.Accounting
  ) {
    return false;
  }

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

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Returns a real renderable & downloadable URL/dataURI for any employee document.
 * Uses the real uploaded `fileDataUrl` when present, or synthesizes a high-clarity SVG
 * document scan for pre-seeded demo documents so View & Download always work with real content.
 */
export function getDocumentPreviewSource(doc: EmployeeDocument): {
  url: string;
  isImage: boolean;
  isPdf: boolean;
  mimeType: string;
} {
  if (doc.fileDataUrl && doc.fileDataUrl.trim().length > 0) {
    const isPdf =
      doc.fileType === 'application/pdf' ||
      doc.fileDataUrl.startsWith('data:application/pdf') ||
      doc.fileName.toLowerCase().endsWith('.pdf');
    const isImage =
      doc.fileType.startsWith('image/') ||
      doc.fileDataUrl.startsWith('data:image/') ||
      /\.(png|jpe?g|webp|gif|svg)$/i.test(doc.fileName);
    return {
      url: doc.fileDataUrl,
      isImage,
      isPdf,
      mimeType: doc.fileType || (isPdf ? 'application/pdf' : 'image/png'),
    };
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="840" height="540" viewBox="0 0 840 540">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#f8fafc"/>
        <stop offset="100%" stop-color="#eef2ff"/>
      </linearGradient>
    </defs>
    <rect width="840" height="540" rx="20" fill="url(#bg)" stroke="#cbd5e1" stroke-width="2"/>
    <rect x="0" y="0" width="840" height="84" rx="20" fill="#1e1b4b"/>
    <rect x="0" y="64" width="840" height="20" fill="#1e1b4b"/>
    <text x="40" y="44" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="700" fill="#ffffff">YALDI HR — VERIFIED DOCUMENT COPY</text>
    <text x="40" y="68" font-family="system-ui, -apple-system, sans-serif" font-size="12" fill="#c7d2fe">UNITED ARAB EMIRATES · EMPLOYEE COMPLIANCE ARCHIVE</text>
    <rect x="40" y="114" width="760" height="310" rx="14" fill="#ffffff" stroke="#e2e8f0" stroke-width="1.5"/>
    <text x="72" y="160" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#64748b">DOCUMENT TYPE</text>
    <text x="72" y="192" font-family="system-ui, sans-serif" font-size="26" font-weight="700" fill="#0f172a">${escapeXml(String(doc.type))}</text>
    <text x="72" y="246" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#64748b">DOCUMENT NUMBER</text>
    <text x="72" y="276" font-family="ui-monospace, monospace" font-size="22" font-weight="700" fill="#312e81">${escapeXml(doc.documentNumber)}</text>
    <text x="72" y="330" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#64748b">ISSUE DATE</text>
    <text x="72" y="358" font-family="ui-monospace, monospace" font-size="18" fill="#0f172a">${escapeXml(doc.issueDate)}</text>
    <text x="340" y="330" font-family="system-ui, sans-serif" font-size="13" font-weight="600" fill="#64748b">EXPIRY DATE</text>
    <text x="340" y="358" font-family="ui-monospace, monospace" font-size="18" font-weight="700" fill="#b45309">${escapeXml(doc.expiryDate)}</text>
    <text x="72" y="398" font-family="ui-monospace, monospace" font-size="13" fill="#475569">File: ${escapeXml(doc.fileName)}</text>
    <text x="40" y="470" font-family="system-ui, sans-serif" font-size="12" fill="#64748b">Uploaded: ${escapeXml(doc.uploadedAt.slice(0, 10))} · Authorized Viewing &amp; Download via Yaldi HR</text>
  </svg>`;

  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return {
    url,
    isImage: true,
    isPdf: false,
    mimeType: 'image/svg+xml',
  };
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
 * Salary Release Control RBAC:
 * Schedule/Delay/Status controls are shown ONLY to HR, Main Manager, Section Managers, and Co-Managers.
 * Accounting & Employees NEVER see release/delay controls.
 */
export function canControlSalaryRelease(role: UserRole | string): boolean {
  const normalized = normalizeUserRole(role);
  return (
    normalized === UserRole.HRAdmin ||
    normalized === UserRole.MainManager ||
    normalized === UserRole.SectionManager ||
    normalized === UserRole.SectionCoManager
  );
}

/**
 * Resolves effective salary release date & status for an employee for a given month:
 * 1) Employee-level override (highest priority)
 * 2) Section-level schedule for that company (or 'all' companies)
 * 3) Default 28th of the month (`Scheduled`)
 */
export function resolveSalaryRelease(
  employee: Employee,
  month: string,
  schedules: SalaryReleaseSchedule[] = []
): ResolvedSalaryRelease {
  const empMatch = schedules.find(
    (s) => s.month === month && s.scopeType === 'employee' && s.scopeId === employee.id
  );
  if (empMatch) {
    return {
      month,
      payPeriod: empMatch.payPeriod,
      releaseDate: empMatch.releaseDate,
      status: empMatch.status,
      delayedUntilDate: empMatch.delayedUntilDate ?? null,
      delayReason: empMatch.delayReason ?? null,
      source: 'employee',
    };
  }

  const secCompanyMatch = schedules.find(
    (s) =>
      s.month === month &&
      s.scopeType === 'section' &&
      s.scopeId === employee.sectionId &&
      s.companyId === employee.primaryCompanyId
  );
  const secGlobalMatch = schedules.find(
    (s) =>
      s.month === month &&
      s.scopeType === 'section' &&
      s.scopeId === employee.sectionId &&
      s.companyId === 'all'
  );
  const secMatch = secCompanyMatch ?? secGlobalMatch;
  if (secMatch) {
    return {
      month,
      payPeriod: secMatch.payPeriod,
      releaseDate: secMatch.releaseDate,
      status: secMatch.status,
      delayedUntilDate: secMatch.delayedUntilDate ?? null,
      delayReason: secMatch.delayReason ?? null,
      source: 'section',
    };
  }

  return {
    month,
    payPeriod: month,
    releaseDate: `${month}-28`,
    status: 'Scheduled',
    delayedUntilDate: null,
    delayReason: null,
    source: 'default',
  };
}

/**
 * Monthly AED payroll computation combining:
 * - Gross Salary (Base + Housing + Transport + Other)
 * - Automatic unexcused lateness deductions from attendance logs for that month
 * - Manual deductions & bonuses from payroll_deductions
 * - Resolved section/employee salary release schedule & delay status
 */
export function calculateEmployeePayroll(
  employee: Employee,
  month: string,
  adjustments: PayrollAdjustment[],
  attendanceLogs: AttendanceLog[] = [],
  salaryReleases: SalaryReleaseSchedule[] = []
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
  const release = resolveSalaryRelease(employee, month, salaryReleases);

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
    release,
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

export function buildPayrollExportRecords(
  rows: MonthlyPayrollRow[],
  companiesById: Map<string, string>,
  sectionsById: Map<string, string>,
  labelNamesById: Map<string, string> = new Map()
): Record<string, string | number>[] {
  return rows.map((r) => ({
    'Employee ID': r.employee.employeeCode,
    'Employee Name': r.employee.fullName,
    Company: companiesById.get(r.employee.primaryCompanyId) ?? r.employee.primaryCompanyId,
    Section: sectionsById.get(r.employee.sectionId) ?? r.employee.sectionId,
    Labels: r.employee.labelIds
      .map((id) => labelNamesById.get(id))
      .filter(Boolean)
      .join(', '),
    Month: r.month,
    'Release Status': r.release.status,
    'Release Date':
      r.release.status === 'Delayed' && r.release.delayedUntilDate
        ? r.release.delayedUntilDate
        : r.release.releaseDate,
    'Delay Reason': r.release.delayReason ?? '',
    'Bank Name': r.employee.bankDetails?.bankName ?? '',
    'Account Number': r.employee.bankDetails?.accountNumber ?? '',
    IBAN: r.employee.bankDetails?.iban ?? '',
    'Base Salary (AED)': Number(r.baseSalary.toFixed(2)),
    'Allowances (AED)': Number(r.totalAllowances.toFixed(2)),
    'Gross (AED)': Number(r.grossSalary.toFixed(2)),
    'Bonuses (AED)': Number(r.totalBonuses.toFixed(2)),
    'Auto Lateness Deductions (AED)': Number(r.autoLatenessDeductions.toFixed(2)),
    'Manual Deductions (AED)': Number(r.manualDeductions.toFixed(2)),
    'Total Deductions (AED)': Number(r.totalDeductions.toFixed(2)),
    'Net Salary (AED)': Number(r.netSalary.toFixed(2)),
  }));
}

export function buildPayrollCSV(
  rows: MonthlyPayrollRow[],
  companiesById: Map<string, string>,
  sectionsById: Map<string, string>,
  labelNamesById: Map<string, string> = new Map()
): string {
  const records = buildPayrollExportRecords(rows, companiesById, sectionsById, labelNamesById);
  if (records.length === 0) {
    return 'Employee ID,Employee Name,Company,Section,Month,Net Salary (AED)';
  }
  const headers = Object.keys(records[0]);
  const lines = records.map((rec) => headers.map((h) => csvEscape(rec[h])).join(','));
  return [headers.join(','), ...lines].join('\n');
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
