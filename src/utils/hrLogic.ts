import {
  AdcbWpsEdrRow,
  AdcbWpsExportResult,
  AdcbWpsScrRow,
  ApprovalStepRecord,
  ApprovalStepRole,
  ApprovalWorkflow,
  AttendanceLog,
  ClockInEvaluation,
  ClockInPolicyMode,
  Company,
  DeductionApprovalRequest,
  DeductionApprovalStatus,
  DeductionApprovalTrigger,
  DeductionCategory,
  DeductionTargetBucket,
  DeductionWorkflowChain,
  DeductionWorkflowConfig,
  DocumentTypeValue,
  Employee,
  EmployeeDocument,
  EmployeeGroup,
  EmployeeModel,
  EmployeePendingBalanceItem,
  EmployeeType,
  EndpointFailure,
  GeofenceZone,
  GPSReading,
  HiddenSectionKey,
  LeaveBalance,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  MonthlyPayrollRow,
  PatchMoneyRelease,
  PatchReleaseAllocation,
  PayrollAdjustment,
  PayrollEntry,
  ProAssignment,
  Project,
  PunchSource,
  RequestApprovalStep,
  RequestAuditEntry,
  RequestCategory,
  ResolvedSalaryRelease,
  ResolvedWorkflowStep,
  SalaryReleaseSchedule,
  UnifiedRequest,
  UserRole,
  VisibilityRule,
  WorkflowModuleAssignments,
  WorkflowModuleKey,
  WorkflowStepRoleKey,
  WorkflowTemplateStep,
  WorkType,
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
    case 'hr_manager':
    case 'hrmanager':
      return UserRole.HRManager;
    case 'hr_admin':
    case 'hradmin':
    case 'hr':
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

export function isHRRole(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === UserRole.HRAdmin || normalized === UserRole.HRManager;
}

export function isAdminOrHRRole(role: unknown): boolean {
  const normalized = normalizeUserRole(role);
  return (
    normalized === UserRole.MainManager ||
    normalized === UserRole.HRManager ||
    normalized === UserRole.HRAdmin
  );
}

export type StartupEndpointKey =
  | 'companies'
  | 'sections'
  | 'labels'
  | 'groups'
  | 'projects'
  | 'visibilityRules'
  | 'myVisibility'
  | 'employeeModels'
  | 'employees'
  | 'proAssignments'
  | 'geofences'
  | 'documents'
  | 'attendance'
  | 'attendanceAudit'
  | 'leaves'
  | 'workflows'
  | 'workflowTemplates'
  | 'workflowAssignments'
  | 'requests'
  | 'payrollAdjustments'
  | 'payrollCategories'
  | 'payrollEntries'
  | 'deductionApprovals'
  | 'patchReleases'
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
  { key: 'groups', path: '/groups' },
  { key: 'projects', path: '/projects' },
  { key: 'visibilityRules', path: '/visibility-rules' },
  { key: 'myVisibility', path: '/visibility-rules/me' },
  { key: 'employeeModels', path: '/employee-models' },
  { key: 'employees', path: '/users' },
  { key: 'proAssignments', path: '/pro-assignments' },
  { key: 'geofences', path: '/locations' },
  { key: 'documents', path: '/documents' },
  { key: 'attendance', path: '/attendance' },
  { key: 'attendanceAudit', path: '/attendance/audit' },
  { key: 'leaves', path: '/leaves' },
  { key: 'workflows', path: '/approval-workflows' },
  { key: 'workflowTemplates', path: '/workflow-templates' },
  { key: 'workflowAssignments', path: '/workflow-assignments' },
  { key: 'requests', path: '/requests' },
  { key: 'payrollAdjustments', path: '/payroll/deductions' },
  { key: 'payrollCategories', path: '/payroll/categories' },
  { key: 'payrollEntries', path: '/payroll/entries' },
  { key: 'deductionApprovals', path: '/payroll/deduction-approvals' },
  { key: 'patchReleases', path: '/payroll/patch-releases' },
  { key: 'salaryReleases', path: '/payroll/releases' },
  { key: 'settings', path: '/settings' },
];

/**
 * Returns only the startup endpoints allowed for the authenticated user's role,
 * preventing unnecessary 403 Forbidden bursts for non-admin users while keeping
 * full access for Main Manager, HR Manager & HR Admin.
 */
export function getStartupEndpointsForRole(role: UserRole | string): StartupEndpointSpec[] {
  const normalized = normalizeUserRole(role);
  if (isAdminOrHRRole(normalized)) {
    return ALL_STARTUP_ENDPOINTS;
  }

  let allowedKeys: Set<StartupEndpointKey>;
  if (normalized === UserRole.Accounting) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'groups',
      'projects',
      'myVisibility',
      'employees',
      'attendance',
      'leaves',
      'workflowTemplates',
      'workflowAssignments',
      'requests',
      'payrollAdjustments',
      'payrollCategories',
      'payrollEntries',
      'deductionApprovals',
      'patchReleases',
      'salaryReleases',
      'settings',
    ]);
  } else if (normalized === UserRole.PRO) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'groups',
      'projects',
      'myVisibility',
      'employeeModels',
      'employees',
      'proAssignments',
      'documents',
      'workflowTemplates',
      'workflowAssignments',
      'requests',
      'settings',
    ]);
  } else if (normalized === UserRole.SectionManager || normalized === UserRole.SectionCoManager) {
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'groups',
      'projects',
      'myVisibility',
      'employeeModels',
      'employees',
      'geofences',
      'documents',
      'attendance',
      'attendanceAudit',
      'leaves',
      'workflowTemplates',
      'workflowAssignments',
      'requests',
      'payrollAdjustments',
      'payrollCategories',
      'payrollEntries',
      'deductionApprovals',
      'patchReleases',
      'salaryReleases',
      'settings',
    ]);
  } else {
    // Employee
    allowedKeys = new Set<StartupEndpointKey>([
      'companies',
      'sections',
      'labels',
      'groups',
      'projects',
      'myVisibility',
      'employeeModels',
      'employees',
      'geofences',
      'documents',
      'attendance',
      'leaves',
      'workflowTemplates',
      'workflowAssignments',
      'requests',
      'payrollAdjustments',
      'payrollCategories',
      'payrollEntries',
      'deductionApprovals',
      'patchReleases',
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

    if (isAdminOrHRRole(activeRole)) {
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
    // If HR Admin / HR Manager applies, auto-skip hr_admin step
    if (isHRRole(applicantRole) && role === 'hr_admin') {
      return {
        stepOrder: idx + 1,
        role,
        status: 'skipped',
        actorName: 'System Auto-Skip',
        remark: 'Skipped HR step because applicant is HR.',
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
    return isHRRole(actorRole);
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
    isAdminOrHRRole(normalized) ||
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
 * Month arithmetic helpers (`YYYY-MM`) for Phase 1A temporary durations,
 * permanent historical preservation, and ADCB WPS period formatting.
 */
export function addMonthsToYYYYMM(month: string, deltaMonths: number): string {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr);
  const mon = Number(mStr);
  if (!Number.isFinite(year) || !Number.isFinite(mon)) return month;
  const total = year * 12 + (mon - 1) + deltaMonths;
  const nextYear = Math.floor(total / 12);
  const nextMonth = ((total % 12) + 12) % 12;
  return `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}`;
}

export function computeTemporaryEndMonth(effectiveFrom: string, durationMonths: number): string {
  const count = Math.max(1, Math.floor(durationMonths || 1));
  return addMonthsToYYYYMM(effectiveFrom, count - 1);
}

export function getMonthPeriodMeta(month: string): {
  periodStart: string;
  periodEnd: string;
  daysInPeriod: number;
  salaryMonthCode: string; // MMYYYY
} {
  const [yStr, mStr] = month.split('-');
  const year = Number(yStr) || new Date().getFullYear();
  const mon = Number(mStr) || 1;
  const daysInPeriod = new Date(year, mon, 0).getDate();
  const mm = String(mon).padStart(2, '0');
  const dd = String(daysInPeriod).padStart(2, '0');
  return {
    periodStart: `${year}-${mm}-01`,
    periodEnd: `${year}-${mm}-${dd}`,
    daysInPeriod,
    salaryMonthCode: `${mm}${year}`,
  };
}

export function isPayrollEntryActiveInMonth(entry: PayrollEntry, month: string): boolean {
  if (!entry.effectiveFrom || !month) return false;
  if (month < entry.effectiveFrom) return false;
  if (entry.effectiveTo && month > entry.effectiveTo) return false;
  return true;
}

/**
 * Historical Preservation Rule for Permanent Additional Earnings:
 * - Editing a permanent earning effective from `effectiveFromMonth` closes the existing
 *   record at `effectiveFromMonth - 1` (preserving all historical months strictly intact)
 *   and inserts a new permanent record starting at `effectiveFromMonth` with the new values.
 * - If `effectiveFromMonth <= existing.effectiveFrom` (no historical months paid yet),
 *   updates the record in place.
 */
export function editPermanentPayrollEntry(params: {
  entries: PayrollEntry[];
  entryId: string;
  effectiveFromMonth: string;
  patch: {
    categoryId?: string;
    categoryName?: string;
    amountAED?: number;
    reason?: string;
  };
  newEntryId: string;
  nowIso?: string;
}): PayrollEntry[] {
  const { entries, entryId, effectiveFromMonth, patch, newEntryId, nowIso = new Date().toISOString() } = params;
  const existing = entries.find((e) => e.id === entryId);
  if (!existing || !existing.isPermanent) return entries;

  if (effectiveFromMonth <= existing.effectiveFrom) {
    return entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            categoryId: patch.categoryId ?? e.categoryId,
            categoryName: patch.categoryName ?? e.categoryName,
            amountAED: patch.amountAED !== undefined ? patch.amountAED : e.amountAED,
            reason: patch.reason !== undefined ? patch.reason : e.reason,
            effectiveFrom: effectiveFromMonth,
            effectiveTo: null,
            updatedAt: nowIso,
          }
        : e
    );
  }

  const closedEndMonth = addMonthsToYYYYMM(effectiveFromMonth, -1);
  const replacement: PayrollEntry = {
    ...existing,
    id: newEntryId,
    categoryId: patch.categoryId ?? existing.categoryId,
    categoryName: patch.categoryName ?? existing.categoryName,
    amountAED: patch.amountAED !== undefined ? patch.amountAED : existing.amountAED,
    reason: patch.reason !== undefined ? patch.reason : existing.reason,
    isPermanent: true,
    effectiveFrom: effectiveFromMonth,
    effectiveTo: null,
    durationMonths: null,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  return [
    replacement,
    ...entries.map((e) =>
      e.id === entryId
        ? {
            ...e,
            effectiveTo: closedEndMonth,
            updatedAt: nowIso,
          }
        : e
    ),
  ];
}

/**
 * Stops a permanent additional earning starting from `stopFromMonth` inclusive,
 * preserving all historical months before `stopFromMonth` intact.
 */
export function stopPermanentPayrollEntry(params: {
  entries: PayrollEntry[];
  entryId: string;
  stopFromMonth: string;
  nowIso?: string;
}): PayrollEntry[] {
  const { entries, entryId, stopFromMonth, nowIso = new Date().toISOString() } = params;
  const existing = entries.find((e) => e.id === entryId);
  if (!existing || !existing.isPermanent) return entries;

  const endMonth = addMonthsToYYYYMM(stopFromMonth, -1);
  return entries.map((e) =>
    e.id === entryId
      ? {
          ...e,
          effectiveTo: endMonth,
          updatedAt: nowIso,
        }
      : e
  );
}

/**
 * Counts approved Unpaid Leave calendar days falling within the target `YYYY-MM` month.
 */
export function countUnpaidLeaveDaysInMonth(
  employeeId: string,
  month: string,
  leaves: LeaveRequest[] = []
): number {
  const { periodStart, periodEnd } = getMonthPeriodMeta(month);
  const [msy, msm, msd] = periodStart.split('-').map(Number);
  const [mey, mem, med] = periodEnd.split('-').map(Number);
  const monthStartMs = new Date(msy, msm - 1, msd).getTime();
  const monthEndMs = new Date(mey, mem - 1, med).getTime();

  let total = 0;
  for (const lv of leaves) {
    if (
      lv.employeeId !== employeeId ||
      lv.status !== LeaveStatus.Approved ||
      lv.type !== LeaveType.Unpaid
    ) {
      continue;
    }
    const [lsy, lsm, lsd] = lv.startDate.split('-').map(Number);
    const [ley, lem, led] = lv.endDate.split('-').map(Number);
    if (!lsy || !ley) continue;
    const lvStartMs = new Date(lsy, lsm - 1, lsd).getTime();
    const lvEndMs = new Date(ley, lem - 1, led).getTime();

    const overlapStart = Math.max(monthStartMs, lvStartMs);
    const overlapEnd = Math.min(monthEndMs, lvEndMs);
    if (overlapEnd >= overlapStart) {
      total += Math.round((overlapEnd - overlapStart) / 86_400_000) + 1;
    }
  }
  return total;
}

export const DEFAULT_DEDUCTION_WORKFLOW_CONFIG: DeductionWorkflowConfig = {
  office_employee: 'manager_then_hr',
  driver: 'manager_then_hr',
  management: 'main_manager_only',
  autoEscalationHours: 48,
};

export function inferDefaultEmployeeType(employee: {
  role?: UserRole;
  sectionId?: string;
  modelId?: string;
}): EmployeeType {
  const role = normalizeUserRole(employee.role);
  if (role === UserRole.MainManager || employee.sectionId === 'sec-mgmt') {
    return 'management';
  }
  if (employee.sectionId === 'sec-drivers' || employee.modelId === 'model-drivers') {
    return 'driver';
  }
  return 'office_employee';
}

export type PendingReviewerRole = 'section_manager' | 'hr_admin' | 'main_manager';

export function resolveEmployeeDeductionWorkflow(
  employee: Pick<Employee, 'employeeType' | 'deductionWorkflowOverride'> & {
    role?: UserRole | string;
  },
  config: DeductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG
): DeductionWorkflowChain {
  const normalizedRole = employee.role ? normalizeUserRole(employee.role) : null;
  // HR Admin / HR Manager's own deductions/latency ALWAYS route directly to Main Manager
  if (normalizedRole && isHRRole(normalizedRole)) {
    return 'main_manager_only';
  }

  let baseChain: DeductionWorkflowChain;
  if (
    employee.deductionWorkflowOverride &&
    employee.deductionWorkflowOverride !== 'inherit'
  ) {
    baseChain = employee.deductionWorkflowOverride;
  } else {
    const type = employee.employeeType || 'office_employee';
    baseChain = config[type] ?? 'manager_then_hr';
  }

  // Section Manager's own deductions/latency ALWAYS skip Section Manager and go directly to HR
  if (normalizedRole === UserRole.SectionManager && baseChain === 'manager_then_hr') {
    return 'hr_only';
  }

  return baseChain;
}

export function resolveInitialDeductionStatus(params: {
  targetRole?: UserRole | string;
  workflowChain: DeductionWorkflowChain;
}): DeductionApprovalStatus {
  const normalizedRole = params.targetRole ? normalizeUserRole(params.targetRole) : null;
  if (normalizedRole && isHRRole(normalizedRole)) {
    return 'pending_main_manager';
  }
  if (normalizedRole === UserRole.SectionManager) {
    return params.workflowChain === 'main_manager_only'
      ? 'pending_main_manager'
      : 'pending_hr_approval';
  }
  if (params.workflowChain === 'main_manager_only') return 'pending_main_manager';
  if (params.workflowChain === 'hr_only') return 'pending_hr_approval';
  return 'pending_manager';
}

/**
 * Evaluates auto-escalation and role-based routing dynamically:
 * - HR Admin / HR Manager's own pending requests always resolve to `pending_main_manager`.
 * - Section Manager's own `pending_manager` requests always skip to `pending_hr_approval`.
 * - Regular employee `pending_manager` requests past `escalationDeadline` resolve to `escalated_to_hr`.
 */
export function getEffectiveDeductionStatus(
  request: Pick<DeductionApprovalRequest, 'status' | 'escalationDeadline'>,
  now: Date = new Date(),
  targetRole?: UserRole | string
): DeductionApprovalStatus {
  if (request.status === 'approved' || request.status === 'waived') {
    return request.status;
  }

  const normalizedTarget = targetRole ? normalizeUserRole(targetRole) : null;
  if (normalizedTarget && isHRRole(normalizedTarget)) {
    return 'pending_main_manager';
  }
  if (normalizedTarget === UserRole.SectionManager && request.status === 'pending_manager') {
    return 'pending_hr_approval';
  }

  if (request.status === 'pending_manager' && request.escalationDeadline) {
    const deadlineMs = new Date(request.escalationDeadline).getTime();
    if (!Number.isNaN(deadlineMs) && now.getTime() >= deadlineMs) {
      return 'escalated_to_hr';
    }
  }
  return request.status;
}

export function buildNewDeductionApprovalRequest(params: {
  id: string;
  employee: Employee;
  month: string;
  triggerType: DeductionApprovalTrigger;
  date: string;
  amountAED: number;
  targetBucket: DeductionTargetBucket;
  reason: string;
  createdBy: string;
  createdByRole: UserRole;
  workflowConfig: DeductionWorkflowConfig;
  now?: Date;
}): DeductionApprovalRequest {
  const now = params.now ?? new Date();
  const chain = resolveEmployeeDeductionWorkflow(params.employee, params.workflowConfig);
  const timeoutHours = Math.max(1, Number(params.workflowConfig.autoEscalationHours) || 48);
  const escalationDeadline = new Date(now.getTime() + timeoutHours * 3_600_000).toISOString();

  const initialStatus = resolveInitialDeductionStatus({
    targetRole: params.employee.role,
    workflowChain: chain,
  });

  return {
    id: params.id,
    employeeId: params.employee.id,
    companyId: params.employee.primaryCompanyId,
    sectionId: params.employee.sectionId,
    month: params.month,
    triggerType: params.triggerType,
    date: params.date,
    amountAED: Number(Number(params.amountAED).toFixed(2)),
    targetBucket: params.targetBucket,
    reason: params.reason.trim(),
    workflowChain: chain,
    status: initialStatus,
    escalationDeadline,
    createdBy: params.createdBy,
    createdByRole: params.createdByRole,
    createdAt: now.toISOString(),
  };
}

export function getPendingReviewerForStatus(
  status: DeductionApprovalStatus
): PendingReviewerRole | null {
  if (status === 'approved' || status === 'waived') return null;
  if (status === 'pending_main_manager') return 'main_manager';
  if (
    status === 'pending_hr_approval' ||
    status === 'pending_hr_decision' ||
    status === 'escalated_to_hr'
  ) {
    return 'hr_admin';
  }
  return 'section_manager';
}

export function canActOnDeductionApproval(params: {
  request: DeductionApprovalRequest;
  actorUserId?: string;
  actorRole: UserRole;
  actorManagedSectionIds: string[];
  targetRole?: UserRole | string;
  now?: Date;
}): {
  canManagerAct: boolean;
  canHrAct: boolean;
  effectiveStatus: DeductionApprovalStatus;
  isSelf: boolean;
  pendingReviewerRole: PendingReviewerRole | null;
} {
  const effectiveStatus = getEffectiveDeductionStatus(
    params.request,
    params.now,
    params.targetRole
  );
  const pendingReviewerRole = getPendingReviewerForStatus(effectiveStatus);
  const isSelf = Boolean(params.actorUserId && params.request.employeeId === params.actorUserId);
  const isFinalized = effectiveStatus === 'approved' || effectiveStatus === 'waived';

  // Rule 1: Strict No Self-Approval (never allow acting on own deduction row)
  if (isSelf || isFinalized) {
    return {
      canManagerAct: false,
      canHrAct: false,
      effectiveStatus,
      isSelf,
      pendingReviewerRole,
    };
  }

  const role = normalizeUserRole(params.actorRole);
  const targetRole = params.targetRole ? normalizeUserRole(params.targetRole) : null;

  // Rule 2: Role-Based Routing
  // HR Admin / HR Manager's own latency/deduction -> Main Manager ONLY
  const targetIsHR = Boolean(targetRole && isHRRole(targetRole));
  if (effectiveStatus === 'pending_main_manager' || targetIsHR) {
    return {
      canManagerAct: false,
      canHrAct: role === UserRole.MainManager,
      effectiveStatus: targetIsHR ? 'pending_main_manager' : effectiveStatus,
      isSelf: false,
      pendingReviewerRole: 'main_manager',
    };
  }

  // Section Manager's own latency/deduction OR regular employee awaiting HR final approval
  if (
    effectiveStatus === 'pending_hr_approval' ||
    effectiveStatus === 'pending_hr_decision' ||
    effectiveStatus === 'escalated_to_hr'
  ) {
    return {
      canManagerAct: false,
      canHrAct: isAdminOrHRRole(role),
      effectiveStatus,
      isSelf: false,
      pendingReviewerRole: 'hr_admin',
    };
  }

  // Regular employee at Step 1 (`pending_manager`): Section Manager (of section) or Main Manager forwards to HR
  const managesSection =
    role === UserRole.MainManager ||
    (role === UserRole.SectionManager &&
      params.actorManagedSectionIds.includes(params.request.sectionId));

  const canManagerAct =
    effectiveStatus === 'pending_manager' &&
    targetRole !== UserRole.SectionManager &&
    managesSection;

  return {
    canManagerAct,
    canHrAct: false,
    effectiveStatus,
    isSelf: false,
    pendingReviewerRole,
  };
}

export interface AttendanceLatenessPermissions {
  isSelf: boolean;
  isLatePending: boolean;
  stage:
    | 'on_time'
    | 'excused'
    | 'approved'
    | 'pending_manager'
    | 'pending_hr_approval'
    | 'pending_hr_decision'
    | 'escalated_to_hr'
    | 'pending_main_manager';
  pendingReviewerRole: PendingReviewerRole | null;
  /** True ONLY when Section Manager (or Main Manager) reviews a regular employee's lateness and forwards to HR (cannot finalize). */
  canManagerReview: boolean;
  /** True ONLY when HR Admin (for Employee/Section Manager) or Main Manager (for HR Admin/Section Manager/Employee at HR stage) can finalize/excuse lateness. */
  canFinalizeExcuse: boolean;
  /** True when the actor is authorized to modify punch timestamps (strictly false for self). */
  canModifyPunch: boolean;
}

/**
 * Evaluates strict No Self-Approval and Role-Based Routing rules for Attendance lateness logs:
 * 1. No Self-Approval: `log.employeeId === actorUserId` NEVER gets Accept/Excuse/Approve/Reject/Waive or punch-edit buttons.
 * 2. Regular Employee: Section Manager reviews/recommends first (`pending_manager`) -> moves to HR (`pending_hr_approval`/`pending_hr_decision`) for final acceptance.
 *    A Section Manager CANNOT finalize/excuse a regular employee's lateness without HR's final approval.
 * 3. Section Manager's own latency: Skips Section Manager -> goes directly to HR (`pending_hr_approval`). Only HR Admin or Main Manager sees action buttons.
 * 4. HR Admin's own latency: Goes directly to Main Manager (`pending_main_manager`). Only Main Manager sees action buttons.
 */
export function evaluateAttendanceLatenessPermissions(params: {
  log: AttendanceLog;
  targetEmployee?: Pick<Employee, 'id' | 'role' | 'sectionId' | 'employeeType' | 'deductionWorkflowOverride'> | null;
  actorUserId: string;
  actorRole: UserRole;
  actorManagedSectionIds: string[];
  linkedApproval?: DeductionApprovalRequest | null;
  workflowConfig?: DeductionWorkflowConfig;
  now?: Date;
}): AttendanceLatenessPermissions {
  const isSelf = params.log.employeeId === params.actorUserId;
  const actor = normalizeUserRole(params.actorRole);
  const targetRole = params.targetEmployee
    ? normalizeUserRole(params.targetEmployee.role)
    : UserRole.Employee;
  const managesSection = params.targetEmployee
    ? params.actorManagedSectionIds.includes(params.targetEmployee.sectionId)
    : false;

  const canModifyPunch =
    !isSelf &&
    (actor === UserRole.MainManager ||
      (isHRRole(actor) && !isAdminOrHRRole(targetRole)) ||
      (actor === UserRole.SectionManager &&
        managesSection &&
        targetRole !== UserRole.SectionManager &&
        !isAdminOrHRRole(targetRole)));

  if (!params.log.isLate) {
    return {
      isSelf,
      isLatePending: false,
      stage: 'on_time',
      pendingReviewerRole: null,
      canManagerReview: false,
      canFinalizeExcuse: false,
      canModifyPunch,
    };
  }

  if (params.log.latenessExcused) {
    return {
      isSelf,
      isLatePending: false,
      stage: 'excused',
      pendingReviewerRole: null,
      canManagerReview: false,
      canFinalizeExcuse: false,
      canModifyPunch,
    };
  }

  // Determine effective stage from linked latency approval or role-based initial routing
  let stage: Exclude<AttendanceLatenessPermissions['stage'], 'on_time'>;
  if (params.linkedApproval) {
    const eff = getEffectiveDeductionStatus(params.linkedApproval, params.now, targetRole);
    stage = eff === 'waived' ? 'excused' : eff;
  } else {
    const chain = params.targetEmployee
      ? resolveEmployeeDeductionWorkflow(
          params.targetEmployee,
          params.workflowConfig ?? DEFAULT_DEDUCTION_WORKFLOW_CONFIG
        )
      : 'manager_then_hr';
    const initial = resolveInitialDeductionStatus({ targetRole, workflowChain: chain });
    stage = initial === 'waived' ? 'excused' : initial;
  }

  if (stage === 'excused' || stage === 'approved') {
    return {
      isSelf,
      isLatePending: false,
      stage,
      pendingReviewerRole: null,
      canManagerReview: false,
      canFinalizeExcuse: false,
      canModifyPunch,
    };
  }

  const pendingReviewerRole = getPendingReviewerForStatus(stage);

  // Rule 1: Strict No Self-Approval
  if (isSelf) {
    return {
      isSelf: true,
      isLatePending: true,
      stage,
      pendingReviewerRole,
      canManagerReview: false,
      canFinalizeExcuse: false,
      canModifyPunch: false,
    };
  }

  // Rule 2a: HR Admin / HR Manager's own latency -> Main Manager ONLY
  if (stage === 'pending_main_manager' || isHRRole(targetRole)) {
    return {
      isSelf: false,
      isLatePending: true,
      stage: 'pending_main_manager',
      pendingReviewerRole: 'main_manager',
      canManagerReview: false,
      canFinalizeExcuse: actor === UserRole.MainManager,
      canModifyPunch,
    };
  }

  // Rule 2b: Section Manager's own latency OR Regular Employee forwarded/escalated to HR
  if (
    stage === 'pending_hr_approval' ||
    stage === 'pending_hr_decision' ||
    stage === 'escalated_to_hr'
  ) {
    return {
      isSelf: false,
      isLatePending: true,
      stage,
      pendingReviewerRole: 'hr_admin',
      canManagerReview: false,
      canFinalizeExcuse: isAdminOrHRRole(actor),
      canModifyPunch,
    };
  }

  // Rule 2c: Regular Employee at Step 1 (`pending_manager`) -> Section Manager reviews & forwards to HR (CANNOT finalize!)
  const canManagerReview =
    targetRole !== UserRole.SectionManager &&
    ((actor === UserRole.SectionManager && managesSection) || actor === UserRole.MainManager);

  return {
    isSelf: false,
    isLatePending: true,
    stage: 'pending_manager',
    pendingReviewerRole: 'section_manager',
    canManagerReview,
    canFinalizeExcuse: false,
    canModifyPunch,
  };
}

export function applyManagerDeductionDecision(params: {
  request: DeductionApprovalRequest;
  decision: 'approved' | 'rejected';
  actorName: string;
  note: string;
  now?: Date;
}): DeductionApprovalRequest {
  const now = params.now ?? new Date();
  const nextStatus: DeductionApprovalStatus =
    params.decision === 'approved' ? 'pending_hr_approval' : 'pending_hr_decision';

  return {
    ...params.request,
    status: nextStatus,
    managerActorName: params.actorName,
    managerDecision: params.decision,
    managerNote: params.note.trim() || undefined,
    managerDecidedAt: now.toISOString(),
  };
}

export function applyHrDeductionDecision(params: {
  request: DeductionApprovalRequest;
  decision: 'approved' | 'waived';
  actorName: string;
  note: string;
  now?: Date;
}): DeductionApprovalRequest {
  const now = params.now ?? new Date();
  const nextStatus: DeductionApprovalStatus =
    params.decision === 'approved' ? 'approved' : 'waived';

  return {
    ...params.request,
    status: nextStatus,
    hrActorName: params.actorName,
    hrDecision: params.decision,
    hrNote: params.note.trim() || undefined,
    hrDecidedAt: now.toISOString(),
  };
}

/**
 * Validates that split-bucket patch release allocations are positive and sum exactly to totalAmountAED.
 */
export function validatePatchReleaseAllocations(
  totalAmountAED: number,
  allocations: PatchReleaseAllocation[]
): { valid: boolean; allocatedSum: number; remaining: number; error?: string } {
  const target = Number(Number(totalAmountAED).toFixed(2));
  if (!Number.isFinite(target) || target <= 0) {
    return {
      valid: false,
      allocatedSum: 0,
      remaining: 0,
      error: 'Release amount must be greater than AED 0.',
    };
  }
  const activeAllocs = allocations.filter((a) => Number(a.amountAED) > 0);
  if (activeAllocs.length === 0) {
    return {
      valid: false,
      allocatedSum: 0,
      remaining: target,
      error: 'Allocate the release amount across at least one pending balance bucket.',
    };
  }
  for (const a of activeAllocs) {
    if (a.amountAED < 0 || !Number.isFinite(a.amountAED)) {
      return {
        valid: false,
        allocatedSum: 0,
        remaining: target,
        error: 'Allocation amounts must be valid positive numbers.',
      };
    }
  }
  const allocatedSum = Number(
    activeAllocs.reduce((sum, a) => sum + Number(a.amountAED), 0).toFixed(2)
  );
  const remaining = Number((target - allocatedSum).toFixed(2));
  if (Math.abs(remaining) > 0.009) {
    return {
      valid: false,
      allocatedSum,
      remaining,
      error:
        remaining > 0
          ? `AED ${remaining.toFixed(2)} still needs to be allocated across buckets.`
          : `Allocated total exceeds release amount by AED ${Math.abs(remaining).toFixed(2)}.`,
    };
  }
  return { valid: true, allocatedSum, remaining: 0 };
}

/**
 * 3-Bucket Monthly AED Payroll Computation (Phase 1A + Phase 1B):
 * 1) Main Salary (Basic + Housing + Transport + Other Allowances — untouched)
 * 2) Additional Earning (In Payroll) — released via WPS (added to Variable Income)
 * 3) Additional Earning (Off Cycle) — released outside WPS (NEVER included in WPS exports)
 *
 * Phase 1B Rules:
 * - Only finalized `status === 'approved'` DeductionApprovalRequests apply to payroll.
 *   Pending (`pending_manager`, `pending_hr_approval`, `pending_hr_decision`, `escalated_to_hr`)
 *   and `waived` requests NEVER reduce payroll.
 * - Any Patch Money Release allocated to `upcoming_main_salary` or `upcoming_additional_in_payroll`
 *   for this month is automatically subtracted from `wpsVariableIncome` so the employee is never paid twice
 *   while keeping `wpsFixedIncome` (Basic Salary) intact!
 */
export function calculateEmployeePayroll(
  employee: Employee,
  month: string,
  adjustments: PayrollAdjustment[],
  attendanceLogs: AttendanceLog[] = [],
  salaryReleases: SalaryReleaseSchedule[] = [],
  payrollEntries: PayrollEntry[] = [],
  leaves: LeaveRequest[] = [],
  deductionApprovals: DeductionApprovalRequest[] = [],
  patchReleases: PatchMoneyRelease[] = []
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
      targetBucket: 'main_salary',
      source: 'auto_lateness',
      attendanceLogId: log.id,
      createdBy: 'Employee Model Policy',
      createdByRole: UserRole.HRAdmin,
      createdAt: log.clockInTime,
    }));

  const manualDeductionsList = manualItems.filter((a) => a.kind === 'deduction');
  const bonuses = manualItems.filter((a) => a.kind === 'bonus');
  const deductions = [...autoLatenessItems, ...manualDeductionsList];

  // Phase 1A active permanent & temporary entries for this month
  const activeEntries = payrollEntries.filter(
    (entry) => entry.employeeId === employee.id && isPayrollEntryActiveInMonth(entry, month)
  );
  const inPayrollEarningEntries = activeEntries.filter((e) => e.type === 'earning_in_payroll');
  const offCycleEarningEntries = activeEntries.filter((e) => e.type === 'earning_off_cycle');
  const inPayrollDeductionEntries = activeEntries.filter((e) => e.type === 'deduction_in_payroll');
  const offCycleDeductionEntries = activeEntries.filter((e) => e.type === 'deduction_off_cycle');

  // Phase 1B finalized approved off-day / latency deduction requests (ONLY status === 'approved')
  const approvedDeductionRequests = deductionApprovals.filter(
    (req) =>
      req.employeeId === employee.id &&
      req.month === month &&
      req.status === 'approved'
  );
  const approvedInPayrollWorkflowDeductions = approvedDeductionRequests
    .filter((req) => req.targetBucket !== 'additional_off_cycle')
    .reduce((sum, req) => sum + req.amountAED, 0);
  const approvedOffCycleWorkflowDeductions = approvedDeductionRequests
    .filter((req) => req.targetBucket === 'additional_off_cycle')
    .reduce((sum, req) => sum + req.amountAED, 0);
  const approvedWorkflowDeductions = Number(
    (approvedInPayrollWorkflowDeductions + approvedOffCycleWorkflowDeductions).toFixed(2)
  );

  // Phase 1B patch money releases impacting this month
  const appliedPatchReleases = patchReleases.filter(
    (rel) =>
      rel.employeeId === employee.id && rel.allocations.some((a) => a.month === month && a.amountAED > 0)
  );
  let earlyWpsReleasedAED = 0;
  let earlyOffCycleReleasedAED = 0;
  for (const rel of appliedPatchReleases) {
    for (const alloc of rel.allocations) {
      if (alloc.month !== month || alloc.amountAED <= 0) continue;
      if (
        alloc.bucket === 'upcoming_main_salary' ||
        alloc.bucket === 'upcoming_additional_in_payroll'
      ) {
        earlyWpsReleasedAED += alloc.amountAED;
      } else if (alloc.bucket === 'off_cycle' || alloc.bucket === 'upcoming_off_cycle') {
        earlyOffCycleReleasedAED += alloc.amountAED;
      }
    }
  }
  earlyWpsReleasedAED = Number(earlyWpsReleasedAED.toFixed(2));
  earlyOffCycleReleasedAED = Number(earlyOffCycleReleasedAED.toFixed(2));

  const legacyBonuses = bonuses.reduce((sum, b) => sum + b.amountAED, 0);
  const inPayrollEntriesTotal = inPayrollEarningEntries.reduce((sum, e) => sum + e.amountAED, 0);
  const offCycleEarnings = offCycleEarningEntries.reduce((sum, e) => sum + e.amountAED, 0);

  const inPayrollEarnings = legacyBonuses + inPayrollEntriesTotal;
  const totalBonuses = inPayrollEarnings + offCycleEarnings;

  const autoLatenessDeductions = autoLatenessItems.reduce((sum, d) => sum + d.amountAED, 0);
  const manualDeductions = manualDeductionsList.reduce((sum, d) => sum + d.amountAED, 0);
  const entryInPayrollDeductions = inPayrollDeductionEntries.reduce(
    (sum, d) => sum + d.amountAED,
    0
  );
  const entryOffCycleDeductions = offCycleDeductionEntries.reduce((sum, d) => sum + d.amountAED, 0);

  const inPayrollDeductions = Number(
    (
      autoLatenessDeductions +
      manualDeductions +
      entryInPayrollDeductions +
      approvedInPayrollWorkflowDeductions
    ).toFixed(2)
  );
  const offCycleDeductions = Number(
    (entryOffCycleDeductions + approvedOffCycleWorkflowDeductions).toFixed(2)
  );
  const totalDeductions = Number((inPayrollDeductions + offCycleDeductions).toFixed(2));

  // WPS Rule: Basic Salary (Fixed Income) stays intact; deductions & early WPS patch releases reduce Variable Income
  const wpsFixedIncome = Number(baseSalary.toFixed(2));
  const wpsVariableIncome = Number(
    Math.max(0, totalAllowances + inPayrollEarnings - inPayrollDeductions - earlyWpsReleasedAED).toFixed(2)
  );
  const wpsTotalPayout = Number((wpsFixedIncome + wpsVariableIncome).toFixed(2));
  const offCycleNetPayout = Number(Math.max(0, offCycleEarnings - offCycleDeductions).toFixed(2));
  const remainingOffCyclePayout = Number(
    Math.max(0, offCycleNetPayout - earlyOffCycleReleasedAED).toFixed(2)
  );
  const netSalary = Number(
    Math.max(0, grossSalary + inPayrollEarnings + offCycleEarnings - totalDeductions).toFixed(2)
  );
  const remainingNetPayable = Number(
    Math.max(0, netSalary - earlyWpsReleasedAED - earlyOffCycleReleasedAED).toFixed(2)
  );
  const unpaidLeaveDays = countUnpaidLeaveDaysInMonth(employee.id, month, leaves);
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
    inPayrollEarnings,
    offCycleEarnings,
    inPayrollDeductions,
    offCycleDeductions,
    wpsFixedIncome,
    wpsVariableIncome,
    wpsTotalPayout,
    offCycleNetPayout,
    approvedWorkflowDeductions,
    earlyWpsReleasedAED,
    earlyOffCycleReleasedAED,
    remainingOffCyclePayout,
    remainingNetPayable,
    unpaidLeaveDays,
    totalBonuses,
    autoLatenessDeductions,
    manualDeductions,
    totalDeductions,
    netSalary,
    deductions,
    bonuses,
    inPayrollEarningEntries,
    offCycleEarningEntries,
    inPayrollDeductionEntries,
    offCycleDeductionEntries,
    approvedDeductionRequests,
    appliedPatchReleases,
    release,
  };
}

/**
 * Computes an employee's pending unpaid balances across recent months & buckets
 * for the "Release Money / Patch" modal and Employee Profile Salary tab.
 */
export function calculateEmployeePendingBalances(params: {
  employee: Employee;
  currentMonth: string; // YYYY-MM
  adjustments: PayrollAdjustment[];
  attendanceLogs?: AttendanceLog[];
  salaryReleases?: SalaryReleaseSchedule[];
  payrollEntries?: PayrollEntry[];
  leaves?: LeaveRequest[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
}): EmployeePendingBalanceItem[] {
  const {
    employee,
    currentMonth,
    adjustments,
    attendanceLogs = [],
    salaryReleases = [],
    payrollEntries = [],
    leaves = [],
    deductionApprovals = [],
    patchReleases = [],
  } = params;

  if (!isPayrollEligible(employee)) return [];

  const prevMonth = addMonthsToYYYYMM(currentMonth, -1);
  const items: EmployeePendingBalanceItem[] = [];

  const releasedByMonthBucket = (m: string, bucket: PatchReleaseAllocation['bucket']): number =>
    Number(
      patchReleases
        .filter((r) => r.employeeId === employee.id)
        .flatMap((r) => r.allocations)
        .filter((a) => a.month === m && a.bucket === bucket)
        .reduce((sum, a) => sum + a.amountAED, 0)
        .toFixed(2)
    );

  // 1) Previous month unpaid Off-Cycle balance (e.g. Oct Off-Cycle)
  const prevRow = calculateEmployeePayroll(
    employee,
    prevMonth,
    adjustments,
    attendanceLogs,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases
  );
  const prevOffCycleReleased = Number(
    (
      releasedByMonthBucket(prevMonth, 'off_cycle') +
      releasedByMonthBucket(prevMonth, 'upcoming_off_cycle')
    ).toFixed(2)
  );
  const prevOffCycleAvail = Number(Math.max(0, prevRow.offCycleNetPayout - prevOffCycleReleased).toFixed(2));
  if (prevRow.offCycleNetPayout > 0 && prevOffCycleAvail > 0) {
    items.push({
      key: `${prevMonth}:off_cycle`,
      month: prevMonth,
      bucket: 'off_cycle',
      earnedOrScheduledAED: prevRow.offCycleNetPayout,
      alreadyReleasedAED: prevOffCycleReleased,
      availableAED: prevOffCycleAvail,
      impactsWps: false,
    });
  }

  // 2) Current month balances
  const currRow = calculateEmployeePayroll(
    employee,
    currentMonth,
    adjustments,
    attendanceLogs,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases
  );

  // Current month Off-Cycle
  const currOffCycleReleased = Number(
    (
      releasedByMonthBucket(currentMonth, 'off_cycle') +
      releasedByMonthBucket(currentMonth, 'upcoming_off_cycle')
    ).toFixed(2)
  );
  const currOffCycleAvail = Number(Math.max(0, currRow.offCycleNetPayout - currOffCycleReleased).toFixed(2));
  if (currRow.offCycleNetPayout > 0 && currOffCycleAvail > 0) {
    items.push({
      key: `${currentMonth}:off_cycle`,
      month: currentMonth,
      bucket: 'off_cycle',
      earnedOrScheduledAED: currRow.offCycleNetPayout,
      alreadyReleasedAED: currOffCycleReleased,
      availableAED: currOffCycleAvail,
      impactsWps: false,
    });
  }

  // Current month Upcoming Additional Earning (In Payroll) — impacts WPS Variable Income
  const currInPayrollReleased = releasedByMonthBucket(currentMonth, 'upcoming_additional_in_payroll');
  const currInPayrollAvail = Number(
    Math.max(0, currRow.inPayrollEarnings - currInPayrollReleased).toFixed(2)
  );
  if (currRow.inPayrollEarnings > 0 && currInPayrollAvail > 0) {
    items.push({
      key: `${currentMonth}:upcoming_additional_in_payroll`,
      month: currentMonth,
      bucket: 'upcoming_additional_in_payroll',
      earnedOrScheduledAED: currRow.inPayrollEarnings,
      alreadyReleasedAED: currInPayrollReleased,
      availableAED: currInPayrollAvail,
      impactsWps: true,
    });
  }

  // Current month Upcoming Main Salary (allowances/main salary advanceable headroom — impacts WPS Variable Income)
  const currMainReleased = releasedByMonthBucket(currentMonth, 'upcoming_main_salary');
  const currMainScheduled = currRow.grossSalary;
  const currMainAvail = Number(Math.max(0, currMainScheduled - currMainReleased).toFixed(2));
  if (currMainScheduled > 0 && currMainAvail > 0) {
    items.push({
      key: `${currentMonth}:upcoming_main_salary`,
      month: currentMonth,
      bucket: 'upcoming_main_salary',
      earnedOrScheduledAED: currMainScheduled,
      alreadyReleasedAED: currMainReleased,
      availableAED: currMainAvail,
      impactsWps: true,
    });
  }

  return items;
}

/**
 * Multi-Company ADCB WPS Export Builder.
 * Produces structured EDR rows, SCR summary row, and ordered `aoaRows` for SheetJS (.xlsx),
 * cleanly decoupled so `.SIF` / `.CSV` formatters can reuse the exact same data model.
 */
export function buildAdcbWpsExport(params: {
  company: Company;
  month: string;
  payrollRows: MonthlyPayrollRow[];
  fileDate?: Date;
}): AdcbWpsExportResult {
  const { company, month, payrollRows, fileDate = new Date() } = params;
  const period = getMonthPeriodMeta(month);
  const warnings: string[] = [];

  if (!company.molEstablishmentId?.trim()) {
    warnings.push(`${company.name}: Missing MOL Establishment ID in Company Settings.`);
  }
  if (!company.wpsRoutingCode?.trim()) {
    warnings.push(`${company.name}: Missing WPS Routing Code in Company Settings.`);
  }
  if (!company.companyIban?.trim()) {
    warnings.push(`${company.name}: Missing Company IBAN in Company Settings.`);
  }

  const eligibleCompanyRows = payrollRows.filter(
    (r) =>
      r.employee.primaryCompanyId === company.id &&
      r.employee.active &&
      isPayrollEligible(r.employee)
  );

  const totalEarlyWpsOffsetAed = Number(
    eligibleCompanyRows.reduce((sum, r) => sum + (r.earlyWpsReleasedAED ?? 0), 0).toFixed(2)
  );

  const edrRows: AdcbWpsEdrRow[] = eligibleCompanyRows.map((row) => {
    const mohrePersonId = (row.employee.mohrePersonId ?? '').trim();
    const bankRoutingCode = (row.employee.bankDetails?.bankRoutingCode ?? '').trim();
    const iban = (row.employee.bankDetails?.iban ?? '').trim();

    if (!mohrePersonId) {
      warnings.push(`${row.employee.fullName} (${row.employee.employeeCode}): Missing MOHRE Person ID.`);
    }
    if (!bankRoutingCode) {
      warnings.push(`${row.employee.fullName} (${row.employee.employeeCode}): Missing Bank Routing Code.`);
    }
    if (!iban) {
      warnings.push(`${row.employee.fullName} (${row.employee.employeeCode}): Missing IBAN.`);
    }

    return {
      recordType: 'EDR',
      mohrePersonId,
      bankRoutingCode,
      iban,
      periodStart: period.periodStart,
      periodEnd: period.periodEnd,
      daysInPeriod: period.daysInPeriod,
      fixedIncome: Number(row.wpsFixedIncome.toFixed(2)),
      variableIncome: Number(row.wpsVariableIncome.toFixed(2)),
      unpaidLeaveDays: row.unpaidLeaveDays,
      employeeFullName: row.employee.fullName,
    };
  });

  const totalPayoutAed = Number(
    edrRows.reduce((sum, r) => sum + r.fixedIncome + r.variableIncome, 0).toFixed(2)
  );

  const fYear = fileDate.getFullYear();
  const fMonth = String(fileDate.getMonth() + 1).padStart(2, '0');
  const fDay = String(fileDate.getDate()).padStart(2, '0');
  const fHour = String(fileDate.getHours()).padStart(2, '0');
  const fMin = String(fileDate.getMinutes()).padStart(2, '0');

  const scrRow: AdcbWpsScrRow = {
    recordType: 'SCR',
    molEstablishmentId: (company.molEstablishmentId ?? '').trim(),
    companyWpsRoutingCode: (company.wpsRoutingCode ?? '').trim(),
    fileDate: `${fYear}-${fMonth}-${fDay}`,
    fileTime: `${fHour}${fMin}`,
    salaryMonth: period.salaryMonthCode,
    totalEdrCount: edrRows.length,
    totalPayoutAed,
    currency: 'AED',
    companyIban: (company.companyIban ?? '').trim(),
  };

  const aoaRows: (string | number)[][] = [
    ...edrRows.map((r) => [
      r.recordType,
      r.mohrePersonId,
      r.bankRoutingCode,
      r.iban,
      r.periodStart,
      r.periodEnd,
      r.daysInPeriod,
      r.fixedIncome,
      r.variableIncome,
      r.unpaidLeaveDays,
      r.employeeFullName,
    ]),
    [
      scrRow.recordType,
      scrRow.molEstablishmentId,
      scrRow.companyWpsRoutingCode,
      scrRow.fileDate,
      scrRow.fileTime,
      scrRow.salaryMonth,
      scrRow.totalEdrCount,
      scrRow.totalPayoutAed,
      scrRow.currency,
      scrRow.companyIban,
    ],
  ];

  return {
    company,
    month,
    salaryMonthCode: period.salaryMonthCode,
    edrRows,
    scrRow,
    aoaRows,
    warnings,
    totalEarlyWpsOffsetAed,
  };
}

/**
 * Pluggable `.SIF` / `.CSV` formatter for ADCB WPS (ready for future export format options).
 */
export function formatAdcbWpsAsSif(result: AdcbWpsExportResult): string {
  return result.aoaRows.map((row) => row.join(',')).join('\n');
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
    'Bank Routing Code': r.employee.bankDetails?.bankRoutingCode ?? '',
    'Account Number': r.employee.bankDetails?.accountNumber ?? '',
    IBAN: r.employee.bankDetails?.iban ?? '',
    'MOHRE Person ID': r.employee.mohrePersonId ?? '',
    'Base Salary (AED)': Number(r.baseSalary.toFixed(2)),
    'Allowances (AED)': Number(r.totalAllowances.toFixed(2)),
    'Gross (AED)': Number(r.grossSalary.toFixed(2)),
    'In-Payroll Earnings (AED)': Number(r.inPayrollEarnings.toFixed(2)),
    'Off-Cycle Earnings (AED)': Number(r.offCycleEarnings.toFixed(2)),
    'In-Payroll Deductions (AED)': Number(r.inPayrollDeductions.toFixed(2)),
    'Off-Cycle Deductions (AED)': Number(r.offCycleDeductions.toFixed(2)),
    'WPS Payout (AED)': Number(r.wpsTotalPayout.toFixed(2)),
    'Off-Cycle Net (AED)': Number(r.offCycleNetPayout.toFixed(2)),
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

/**
 * RBAC check for the Admin/HR Reset Password action:
 * - Only `main_manager`, `hr_manager`, and `hr_admin` may reset passwords.
 * - `hr_admin` / `hr_manager` CANNOT reset a `main_manager` account (button hidden).
 * - `main_manager` may reset any employee account.
 */
export function canResetEmployeePassword(
  actorRole: UserRole | string,
  targetRole: UserRole | string
): boolean {
  const actor = normalizeUserRole(actorRole);
  const target = normalizeUserRole(targetRole);
  if (actor === UserRole.MainManager) {
    return true;
  }
  if (isHRRole(actor)) {
    return target !== UserRole.MainManager;
  }
  return false;
}

/**
 * Generates a readable, unambiguous random temporary password (min 6 chars, default 10)
 * containing at least one uppercase letter, lowercase letter, digit, and symbol.
 */
export function generateTemporaryPassword(length = 10): string {
  const targetLen = Math.max(6, Math.min(32, Math.floor(length || 10)));
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '@#$%&*!';
  const all = upper + lower + digits + symbols;

  const getRandomIndex = (max: number): number => {
    if (typeof globalThis.crypto !== 'undefined' && typeof globalThis.crypto.getRandomValues === 'function') {
      const buf = new Uint32Array(1);
      globalThis.crypto.getRandomValues(buf);
      return buf[0] % max;
    }
    return Math.floor(Math.random() * max);
  };

  const chars: string[] = [
    upper[getRandomIndex(upper.length)],
    lower[getRandomIndex(lower.length)],
    digits[getRandomIndex(digits.length)],
    symbols[getRandomIndex(symbols.length)],
  ];

  while (chars.length < targetLen) {
    chars.push(all[getRandomIndex(all.length)]);
  }

  // Fisher-Yates shuffle
  for (let i = chars.length - 1; i > 0; i--) {
    const j = getRandomIndex(i + 1);
    const tmp = chars[i];
    chars[i] = chars[j];
    chars[j] = tmp;
  }

  return chars.join('');
}

export const ALL_WORK_TYPES: WorkType[] = ['office', 'remote', 'hybrid', 'field'];

export function normalizeWorkType(raw: unknown): WorkType {
  if (typeof raw !== 'string') return 'office';
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (key === 'remote' || key === 'wfh' || key === 'work_from_home') return 'remote';
  if (key === 'hybrid') return 'hybrid';
  if (key === 'field' || key === 'on_field' || key === 'site') return 'field';
  return 'office';
}

export const ALL_HIDDEN_SECTION_KEYS: HiddenSectionKey[] = [
  'leave_balances',
  'salary_breakdown',
  'attendance_logs',
  'deductions',
  'payslips',
];

export function normalizeHiddenSectionKey(raw: unknown): HiddenSectionKey | null {
  if (typeof raw !== 'string') return null;
  const key = raw.trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (
    key === 'leave_balances' ||
    key === 'salary_breakdown' ||
    key === 'attendance_logs' ||
    key === 'deductions' ||
    key === 'payslips'
  ) {
    return key;
  }
  return null;
}

/**
 * Evaluates which UI sections are hidden for a given employee based on active Visibility Rules.
 * Used in Demo Mode (and unit tests); in Live Mode the server's `GET /visibility-rules/me`
 * provides the authoritative list.
 */
export function evaluateUserHiddenSections(
  employee:
    | (Pick<Employee, 'id' | 'employeeType' | 'groupIds'> & { role?: UserRole | string })
    | null
    | undefined,
  rules: VisibilityRule[] = [],
  options?: { includeAdmins?: boolean }
): HiddenSectionKey[] {
  if (!employee) return [];
  if (!options?.includeAdmins && employee.role && isAdminOrHRRole(employee.role)) {
    return [];
  }

  const hidden = new Set<HiddenSectionKey>();
  const empGroupIds = new Set(employee.groupIds ?? []);
  const empType = employee.employeeType ?? 'office_employee';

  for (const rule of rules) {
    if (!rule.active) continue;
    let matches = false;
    if (rule.targetType === 'all') {
      matches = true;
    } else if (rule.targetType === 'group') {
      matches = (rule.targetIds ?? []).some((gid) => empGroupIds.has(gid));
    } else if (rule.targetType === 'employee_type') {
      matches = (rule.targetIds ?? []).includes(empType);
    } else if (rule.targetType === 'employees') {
      matches = (rule.targetIds ?? []).includes(employee.id);
    }

    if (matches) {
      for (const sec of rule.hiddenSections ?? []) {
        const normalized = normalizeHiddenSectionKey(sec);
        if (normalized) hidden.add(normalized);
      }
    }
  }

  return Array.from(hidden);
}

/**
 * Convenience helper to check if a section is hidden by visibility rules.
 */
export function isSectionHidden(
  hiddenSections: HiddenSectionKey[] | undefined,
  section: HiddenSectionKey
): boolean {
  if (!hiddenSections || hiddenSections.length === 0) return false;
  return hiddenSections.includes(section);
}

/* ============================================================================
 * Phase 2 (Yaldi HR v4.0) — Named Approval Workflows & Unified Requests
 * ========================================================================== */

export const ALL_WORKFLOW_STEP_ROLES: WorkflowStepRoleKey[] = [
  'section_manager',
  'project_manager',
  'supervisor',
  'hr_admin',
  'hr_manager',
  'main_manager',
];

export const ALL_WORKFLOW_MODULES: WorkflowModuleKey[] = [
  'custom_clock',
  'time_off',
  'advance_loan',
  'general',
  'payroll',
];

export const ALL_REQUEST_CATEGORIES: RequestCategory[] = [
  'custom_clock',
  'time_off',
  'advance_loan',
  'salary_adjustment',
  'general',
];

export const DEFAULT_WORKFLOW_ASSIGNMENTS: WorkflowModuleAssignments = {
  custom_clock: null,
  time_off: null,
  advance_loan: null,
  general: null,
  payroll: null,
};

export function isBypassEligibleRole(role: UserRole | string): boolean {
  const normalized = normalizeUserRole(role);
  return normalized === UserRole.HRManager || normalized === UserRole.MainManager;
}

export function calculateLoanMonthlyDeduction(
  amountAED: number,
  repaymentMonths: number
): number {
  const amt = Number(amountAED);
  const months = Math.max(1, Math.floor(Number(repaymentMonths) || 1));
  if (!Number.isFinite(amt) || amt <= 0) return 0;
  return Number((amt / months).toFixed(2));
}

const DEFAULT_STEP_ROLE_LABELS: Record<WorkflowStepRoleKey, string> = {
  section_manager: 'Section Manager',
  project_manager: 'Project Manager',
  supervisor: 'Supervisor',
  hr_admin: 'HR Admin',
  hr_manager: 'HR Manager',
  main_manager: 'Main Manager',
};

/**
 * Resolves a Named Workflow's ordered steps into real approver names & IDs
 * for a specific employee using section managers, project managers, project
 * supervisors, HR admins/managers, main managers, or specific employees.
 */
export function resolveWorkflowStepsForEmployee(params: {
  steps: WorkflowTemplateStep[];
  employee: Employee | null | undefined;
  employees: Employee[];
  projects: Project[];
}): ResolvedWorkflowStep[] {
  const { steps, employee, employees, projects } = params;
  const activeEmployees = employees.filter((e) => e.active);
  const empById = new Map(employees.map((e) => [e.id, e]));

  const findRoleEmployee = (roleKey: WorkflowStepRoleKey): Employee | undefined => {
    if (roleKey === 'section_manager') {
      if (!employee) return activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.SectionManager);
      return (
        activeEmployees.find(
          (e) =>
            normalizeUserRole(e.role) === UserRole.SectionManager &&
            (e.managedSectionIds.includes(employee.sectionId) || e.sectionId === employee.sectionId)
        ) ?? activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.SectionManager)
      );
    }

    if (roleKey === 'project_manager') {
      const empProjects = employee?.projectIds?.length
        ? projects.filter((p) => employee.projectIds!.includes(p.id) && p.active)
        : projects.filter((p) => p.active && (!employee || p.companyId === employee.primaryCompanyId));
      for (const proj of empProjects) {
        if (proj.managerId) {
          const mgr = empById.get(proj.managerId);
          if (mgr && mgr.active) return mgr;
        }
      }
      return undefined;
    }

    if (roleKey === 'supervisor') {
      const empProjects = employee?.projectIds?.length
        ? projects.filter((p) => employee.projectIds!.includes(p.id) && p.active)
        : projects.filter((p) => p.active && (!employee || p.companyId === employee.primaryCompanyId));
      for (const proj of empProjects) {
        for (const supId of proj.supervisorIds ?? []) {
          const sup = empById.get(supId);
          if (sup && sup.active && sup.id !== employee?.id) return sup;
        }
      }
      return undefined;
    }

    if (roleKey === 'hr_admin') {
      return (
        activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.HRAdmin) ??
        activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.HRManager)
      );
    }

    if (roleKey === 'hr_manager') {
      return (
        activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.HRManager) ??
        activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.HRAdmin)
      );
    }

    if (roleKey === 'main_manager') {
      return activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.MainManager);
    }

    return undefined;
  };

  return steps.map((step, index) => {
    const stepOrder = index + 1;
    if (step.type === 'employee') {
      const target = step.employeeId ? empById.get(step.employeeId) : undefined;
      const isSelf = Boolean(employee && target && target.id === employee.id);
      return {
        stepOrder,
        type: 'employee',
        roleLabel: target?.jobTitle || 'Specific Employee',
        approverId: target?.id ?? null,
        approverName: target?.fullName ?? 'Unassigned',
        skipped: isSelf,
        skipReason: isSelf ? 'Auto-skipped (applicant is this approver)' : undefined,
      };
    }

    const roleKey: WorkflowStepRoleKey = step.role ?? 'section_manager';
    const matched = findRoleEmployee(roleKey);
    const isSelf = Boolean(employee && matched && matched.id === employee.id);
    return {
      stepOrder,
      type: 'role',
      role: roleKey,
      roleLabel: DEFAULT_STEP_ROLE_LABELS[roleKey] ?? roleKey,
      approverId: matched?.id ?? null,
      approverName: matched?.fullName ?? 'Unassigned',
      skipped: isSelf,
      skipReason: isSelf ? 'Auto-skipped (applicant holds this role)' : undefined,
    };
  });
}

/**
 * Salary Adjustment requests ALWAYS require HR Manager approval only.
 */
export function resolveSalaryAdjustmentSteps(params: {
  employees: Employee[];
  targetEmployee?: Employee | null;
}): ResolvedWorkflowStep[] {
  const { employees, targetEmployee } = params;
  const activeEmployees = employees.filter((e) => e.active);
  const hrManager =
    activeEmployees.find(
      (e) =>
        normalizeUserRole(e.role) === UserRole.HRManager &&
        e.id !== targetEmployee?.id
    ) ??
    activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.HRManager) ??
    activeEmployees.find((e) => normalizeUserRole(e.role) === UserRole.MainManager);

  return [
    {
      stepOrder: 1,
      type: 'role',
      role: 'hr_manager',
      roleLabel: 'HR Manager',
      approverId: hrManager?.id ?? null,
      approverName: hrManager?.fullName ?? 'Unassigned',
    },
  ];
}

/**
 * Evaluates whether the logged-in user can Approve/Reject or Bypass & Approve a UnifiedRequest.
 * Enforces strict No Self-Approval and HR Manager / Main Manager exclusive bypass.
 */
export function canActOnUnifiedRequest(params: {
  request: UnifiedRequest;
  currentUser: Employee;
  activeRole: UserRole | string;
  projects?: Project[];
}): {
  isSelf: boolean;
  canApproveReject: boolean;
  canBypass: boolean;
  activeStep: RequestApprovalStep | null;
} {
  const { request, currentUser, projects = [] } = params;
  const role = normalizeUserRole(params.activeRole);

  // Strict No Self-Approval: never allow approving/bypassing own request
  const isSelf =
    request.employeeId === currentUser.id ||
    (request.category !== 'salary_adjustment' && request.createdById === currentUser.id);

  const activeStep =
    request.status === 'pending' &&
    request.currentStepIndex >= 0 &&
    request.currentStepIndex < request.steps.length
      ? request.steps[request.currentStepIndex]
      : null;

  if (request.status !== 'pending' || isSelf) {
    return { isSelf, canApproveReject: false, canBypass: false, activeStep };
  }

  const canBypass = isBypassEligibleRole(role);

  if (!activeStep || activeStep.status !== 'pending') {
    return { isSelf, canApproveReject: false, canBypass, activeStep };
  }

  // Salary adjustments require HR Manager approval strictly (or Main Manager bypass)
  if (request.category === 'salary_adjustment') {
    const isHrMgr = role === UserRole.HRManager;
    return {
      isSelf,
      canApproveReject: isHrMgr,
      canBypass,
      activeStep,
    };
  }

  // Specific Employee step
  if (activeStep.type === 'employee') {
    return {
      isSelf,
      canApproveReject: activeStep.approverId === currentUser.id,
      canBypass,
      activeStep,
    };
  }

  // If step resolved to a concrete approverId that matches currentUser
  if (activeStep.approverId && activeStep.approverId === currentUser.id) {
    return { isSelf, canApproveReject: true, canBypass, activeStep };
  }

  // Role-based matching
  const stepRole = activeStep.role;
  let roleMatches = false;
  if (stepRole === 'section_manager') {
    const managed =
      currentUser.managedSectionIds.length > 0
        ? currentUser.managedSectionIds
        : [currentUser.sectionId];
    roleMatches = role === UserRole.SectionManager && managed.includes(request.sectionId);
  } else if (stepRole === 'project_manager') {
    roleMatches = projects.some(
      (p) => p.active && p.managerId === currentUser.id
    );
  } else if (stepRole === 'supervisor') {
    roleMatches = projects.some(
      (p) => p.active && (p.supervisorIds ?? []).includes(currentUser.id)
    );
  } else if (stepRole === 'hr_admin') {
    roleMatches = role === UserRole.HRAdmin || role === UserRole.HRManager;
  } else if (stepRole === 'hr_manager') {
    roleMatches = role === UserRole.HRManager;
  } else if (stepRole === 'main_manager') {
    roleMatches = role === UserRole.MainManager;
  }

  return { isSelf, canApproveReject: roleMatches, canBypass, activeStep };
}

/**
 * Returns the requests belonging to the "Pending My Approval" tab and live badge count:
 * - For HR Manager & Main Manager: all pending requests (excluding their own).
 * - For all other roles: pending requests where they are the active step's approver (excluding their own).
 */
export function getPendingRequestsForApprover(params: {
  requests: UnifiedRequest[];
  currentUser: Employee;
  activeRole: UserRole | string;
  projects?: Project[];
}): UnifiedRequest[] {
  const { requests, currentUser, activeRole, projects = [] } = params;
  return requests.filter((req) => {
    if (req.status !== 'pending') return false;
    const perm = canActOnUnifiedRequest({
      request: req,
      currentUser,
      activeRole,
      projects,
    });
    return !perm.isSelf && (perm.canApproveReject || perm.canBypass);
  });
}

/**
 * Pure state-transition helper for Approve / Reject / Bypass actions on a UnifiedRequest.
 */
export function applyUnifiedRequestAction(params: {
  request: UnifiedRequest;
  action: 'approve' | 'reject' | 'bypass';
  actorId: string;
  actorName: string;
  actorRole: UserRole;
  comment?: string;
  nowIso?: string;
}): UnifiedRequest {
  const {
    request,
    action,
    actorId,
    actorName,
    actorRole,
    comment,
    nowIso = new Date().toISOString(),
  } = params;

  if (request.status !== 'pending') return request;
  const trimmedComment = comment?.trim() || undefined;
  const auditId = `aud-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  if (action === 'bypass') {
    const nextSteps: RequestApprovalStep[] = request.steps.map((s, idx) => {
      if (s.status === 'pending' || idx >= request.currentStepIndex) {
        return {
          ...s,
          status: 'bypassed',
          actorId,
          actorName,
          actorRole,
          comment: trimmedComment,
          decidedAt: nowIso,
        };
      }
      return s;
    });

    const auditEntry: RequestAuditEntry = {
      id: auditId,
      action: 'bypassed',
      actorId,
      actorName,
      actorRole,
      stepOrder: request.steps[request.currentStepIndex]?.stepOrder,
      comment: trimmedComment,
      timestamp: nowIso,
    };

    return {
      ...request,
      status: 'bypassed',
      currentStepIndex: -1,
      steps: nextSteps,
      auditLog: [...request.auditLog, auditEntry],
      updatedAt: nowIso,
    };
  }

  const idx = request.currentStepIndex;
  if (idx < 0 || idx >= request.steps.length) return request;

  const stepOrder = request.steps[idx].stepOrder;
  const nextSteps: RequestApprovalStep[] = request.steps.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: action === 'approve' ? 'approved' : 'rejected',
          actorId,
          actorName,
          actorRole,
          comment: trimmedComment,
          decidedAt: nowIso,
        }
      : s
  );

  const auditEntry: RequestAuditEntry = {
    id: auditId,
    action: action === 'approve' ? 'approved' : 'rejected',
    actorId,
    actorName,
    actorRole,
    stepOrder,
    comment: trimmedComment,
    timestamp: nowIso,
  };

  if (action === 'reject') {
    return {
      ...request,
      status: 'rejected',
      currentStepIndex: -1,
      steps: nextSteps,
      auditLog: [...request.auditLog, auditEntry],
      updatedAt: nowIso,
    };
  }

  const nextPendingIdx = nextSteps.findIndex((s, i) => i > idx && s.status === 'pending');
  return {
    ...request,
    status: nextPendingIdx === -1 ? 'approved' : 'pending',
    currentStepIndex: nextPendingIdx,
    steps: nextSteps,
    auditLog: [...request.auditLog, auditEntry],
    updatedAt: nowIso,
  };
}



