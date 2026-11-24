/**
 * Yaldi HR Centralized Self-Hosted REST + Local Demo API Client (`services/api.ts`)
 *
 * Flip `USE_MOCK_API` (or switch in Login / Profile Server Settings) to swap cleanly between:
 *  - Demo / Local Mode: pre-populated multi-company UAE dataset in localStorage
 *  - Live Self-Hosted Mode: REST API (GET/POST/PUT/DELETE) with JWT Bearer tokens
 *    pointing to your self-hosted PostgreSQL + FastAPI/Node.js PC/Ubuntu server.
 */

import {
  Announcement,
  AppSettings,
  ApprovalWorkflow,
  AttendanceAuditEntry,
  AttendanceLog,
  AuthSession,
  BulkImportResult,
  BulkImportRowError,
  BulkImportUserRow,
  ClockInPolicyMode,
  Company,
  CreateEmployeePayload,
  CreateUnifiedRequestInput,
  DeductionApprovalRequest,
  DeductionApprovalStatus,
  DeductionApprovalTrigger,
  DeductionTargetBucket,
  DeductionWorkflowChain,
  DeductionWorkflowConfig,
  Employee,
  EmployeeDocument,
  EmployeeGroup,
  EmployeeLabel,
  EmployeeModel,
  EmployeeOrgUpdatePayload,
  EmployeeType,
  EndpointFailure,
  GeofenceZone,
  HiddenSectionKey,
  HRDatabase,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PatchMoneyRelease,
  PatchPaymentMethod,
  PatchReleaseAllocation,
  PayrollAdjustment,
  PayrollApprovalRun,
  PayrollCategoryItem,
  PayrollEntry,
  PayrollEntryType,
  PayrollReleaseScopeType,
  ProAssignment,
  Project,
  PunchSource,
  QuickActionConfigItem,
  RequestActionInput,
  RequestApprovalStep,
  RequestAuditEntry,
  RequestCategory,
  RequestPayload,
  RequestStatus,
  RequestStepStatus,
  RequestUploadResult,
  ResolvedWorkflowStep,
  RosterBulkUploadResult,
  RosterEntry,
  RosterTodayStatus,
  RosterUploadBatch,
  RosterUploadError,
  SalaryReleaseSchedule,
  SalaryReleaseStatus,
  Section,
  ShiftSchedule,
  TimeOffSubType,
  UnifiedRequest,
  UpdateEmployeePayload,
  UserRole,
  VisibilityRule,
  VisibilityRuleTargetType,
  WorkflowModuleAssignments,
  WorkflowModuleKey,
  WorkflowStepRoleKey,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from '../types/hr';
import {
  adjustLeaveBalance,
  advanceLeaveApproval,
  ALL_WORKFLOW_MODULES,
  applyHrDeductionDecision,
  applyManagerDeductionDecision,
  applyUnifiedRequestAction,
  buildLeaveApprovalChain,
  buildNewDeductionApprovalRequest,
  calculateInclusiveDays,
  calculateLoanMonthlyDeduction,
  computeTemporaryEndMonth,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  DEFAULT_WORKFLOW_ASSIGNMENTS,
  editPermanentPayrollEntry,
  evaluateModelLateness,
  evaluateStartupEndpointResults,
  evaluateUserHiddenSections,
  getEffectiveShiftStart,
  getStartupEndpointsForRole,
  inferDefaultEmployeeType,
  isAttendanceTracked,
  normalizeHiddenSectionKey,
  normalizeUserRole,
  normalizeWorkType,
  parseRetryAfterSeconds,
  resolveApprovalWorkflow,
  resolveSalaryAdjustmentSteps,
  resolveWorkflowStepsForEmployee,
  SettledStartupItem,
  stopPermanentPayrollEntry,
  validatePasswordPolicy,
  validatePatchReleaseAllocations,
  validateSignInInput,
} from '../utils/hrLogic';
import {
  normalizeEmployeeTypeValue,
  parseBulkImportResponse,
  resolveCompanyMatch,
  resolveSectionMatch,
} from '../utils/bulkImportLogic';
import { createInitialSeedData } from './seedData';

export const USE_MOCK_API =
  (import.meta.env.VITE_USE_MOCK_API as string | undefined) !== 'false';

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://192.168.1.50:8000/api/v1';

const STORAGE_KEY = 'yaldi_hr_db_v2';
const SESSION_KEY = 'yaldi_hr_session_v2';
const SERVER_CONFIG_KEY = 'yaldi_hr_server_config_v1';
const ROSTER_STORAGE_KEY = 'yaldi_hr_rosters_v1';
const ROSTER_HISTORY_STORAGE_KEY = 'yaldi_hr_roster_history_v1';
const PAYROLL_RUNS_STORAGE_KEY = 'yaldi_hr_payroll_runs_v1';
const ANNOUNCEMENTS_STORAGE_KEY = 'yaldi_hr_announcements_v1';

export const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export interface ServerConfig {
  useMockApi: boolean;
  apiBaseUrl: string;
}

export class ServerUnreachableError extends Error {
  endpoint?: string;
  constructor(message: string, endpoint?: string) {
    super(message);
    this.name = 'ServerUnreachableError';
    this.endpoint = endpoint;
  }
}

export const CLIENT_PLATFORM_HEADER = 'web-dashboard';
export const SESSION_EXPIRED_MESSAGE = 'Session expired or revoked. Please sign in again.';

type UnauthorizedListener = (message: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

export class ApiHttpError extends Error {
  endpoint: string;
  status: number | null;
  statusText: string;
  isTimeout: boolean;
  retryAfterSeconds?: number;

  constructor(params: {
    endpoint: string;
    status: number | null;
    statusText: string;
    message: string;
    isTimeout?: boolean;
    retryAfterSeconds?: number;
  }) {
    super(params.message);
    this.name = 'ApiHttpError';
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.statusText = params.statusText;
    this.isTimeout = Boolean(params.isTimeout);
    this.retryAfterSeconds = params.retryAfterSeconds;
  }

  toEndpointFailure(): EndpointFailure {
    return {
      endpoint: this.endpoint,
      status: this.status,
      statusText: this.statusText,
      message: this.message,
      isTimeout: this.isTimeout,
    };
  }
}

export class StartupLoadError extends Error {
  failures: EndpointFailure[];
  isTimeout: boolean;

  constructor(failures: EndpointFailure[], message?: string) {
    const summary =
      message ||
      failures
        .map((f) => `${f.endpoint} (${f.status ?? (f.isTimeout ? 'TIMEOUT' : 'NETWORK')}): ${f.message}`)
        .join('; ');
    super(summary || 'Failed to load workspace data.');
    this.name = 'StartupLoadError';
    this.failures = failures;
    this.isTimeout = failures.some((f) => f.isTimeout || f.status === 408);
  }
}

export function getServerConfig(): ServerConfig {
  try {
    const raw = localStorage.getItem(SERVER_CONFIG_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ServerConfig>;
      return {
        useMockApi: typeof parsed.useMockApi === 'boolean' ? parsed.useMockApi : USE_MOCK_API,
        apiBaseUrl: parsed.apiBaseUrl || DEFAULT_API_BASE_URL,
      };
    }
  } catch {
    // Fallback
  }
  return { useMockApi: USE_MOCK_API, apiBaseUrl: DEFAULT_API_BASE_URL };
}

export function saveServerConfig(config: ServerConfig): ServerConfig {
  const normalized: ServerConfig = {
    useMockApi: config.useMockApi,
    apiBaseUrl: config.apiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_API_BASE_URL,
  };
  try {
    localStorage.setItem(SERVER_CONFIG_KEY, JSON.stringify(normalized));
  } catch {
    // Ignore
  }
  return normalized;
}

function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return normalizeAuthSession(parsed);
  } catch {
    return null;
  }
}

function saveSession(session: AuthSession | null): void {
  try {
    if (session) {
      localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
      localStorage.removeItem(SESSION_KEY);
    }
  } catch {
    // Ignore
  }
}

function handleUnauthorizedSession(): void {
  saveSession(null);
  unauthorizedListeners.forEach((listener) => {
    try {
      listener(SESSION_EXPIRED_MESSAGE);
    } catch {
      // Ignore listener errors
    }
  });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((v) => String(v)).filter(Boolean);
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v)).filter(Boolean);
    } catch {
      return [];
    }
  }
  return [];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function asBoolean(value: unknown, fallback = false): boolean {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 1) return true;
  if (value === 'false' || value === 0) return false;
  return fallback;
}

/**
 * Normalizes Live FastAPI/PostgreSQL or Demo login responses (camelCase, snake_case, or nested `user` object)
 * into a canonical `AuthSession` with a case-insensitively normalized `UserRole`.
 */
export function normalizeAuthSession(
  raw: unknown,
  fallbackEmail?: string,
  defaultMode: 'demo' | 'live' = 'live'
): AuthSession {
  const obj = asRecord(raw);
  const userObj = asRecord(obj.user);

  const token = asString(obj.token ?? obj.access_token ?? obj.jwt ?? '');
  const userId = asString(
    obj.userId ?? obj.user_id ?? userObj.id ?? userObj.user_id ?? obj.id ?? ''
  );
  const rawRole = obj.role ?? userObj.role ?? UserRole.Employee;
  const role = normalizeUserRole(rawRole);
  const mustChangePassword = asBoolean(
    obj.mustChangePassword ??
      obj.must_change_password ??
      userObj.mustChangePassword ??
      userObj.must_change_password,
    false
  );
  const mode = obj.mode === 'demo' ? 'demo' : obj.mode === 'live' ? 'live' : defaultMode;

  return {
    token,
    userId,
    role,
    mode,
    mustChangePassword,
    fullName: asString(
      obj.fullName ?? obj.full_name ?? userObj.fullName ?? userObj.full_name ?? userObj.name ?? ''
    ) || undefined,
    email: asString(obj.email ?? userObj.email ?? fallbackEmail ?? '') || undefined,
    employeeCode:
      asString(
        obj.employeeCode ?? obj.employee_code ?? userObj.employeeCode ?? userObj.employee_code ?? ''
      ) || undefined,
    avatarUrl:
      asString(
        obj.avatarUrl ?? obj.avatar_url ?? userObj.avatarUrl ?? userObj.avatar_url ?? ''
      ) || undefined,
    primaryCompanyId:
      asString(
        obj.primaryCompanyId ??
          obj.primary_company_id ??
          userObj.primaryCompanyId ??
          userObj.primary_company_id ??
          ''
      ) || undefined,
    sectionId:
      asString(
        obj.sectionId ?? obj.section_id ?? userObj.sectionId ?? userObj.section_id ?? ''
      ) || undefined,
  };
}

export function normalizeCompany(raw: unknown): Company {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? ''),
    code: asString(obj.code ?? ''),
    name: asString(obj.name ?? ''),
    industry: asString(obj.industry ?? ''),
    city: asString(obj.city ?? ''),
    active: asBoolean(obj.active, true),
    molEstablishmentId:
      asString(obj.molEstablishmentId ?? obj.mol_establishment_id ?? '') || undefined,
    wpsRoutingCode: asString(obj.wpsRoutingCode ?? obj.wps_routing_code ?? '') || undefined,
    companyIban: asString(obj.companyIban ?? obj.company_iban ?? '') || undefined,
  };
}

export function normalizePayrollCategory(raw: unknown): PayrollCategoryItem {
  const obj = asRecord(raw);
  const rawType = asString(obj.type, 'earning_in_payroll') as PayrollEntryType;
  return {
    id: asString(obj.id ?? ''),
    type: rawType,
    name: asString(obj.name ?? ''),
    active: asBoolean(obj.active, true),
    description: asString(obj.description ?? '') || undefined,
  };
}

export function normalizePayrollEntry(raw: unknown): PayrollEntry {
  const obj = asRecord(raw);
  const isPermanent = asBoolean(obj.isPermanent ?? obj.is_permanent, false);
  const rawDuration = obj.durationMonths ?? obj.duration_months;
  const durationMonths =
    rawDuration === null || rawDuration === undefined || isPermanent
      ? null
      : asNumber(rawDuration, 1);
  const rawEffectiveTo = obj.effectiveTo ?? obj.effective_to;
  return {
    id: asString(obj.id ?? ''),
    employeeId: asString(obj.employeeId ?? obj.employee_id ?? obj.user_id ?? ''),
    companyId: asString(obj.companyId ?? obj.company_id ?? ''),
    type: asString(obj.type, 'earning_in_payroll') as PayrollEntryType,
    categoryId: asString(obj.categoryId ?? obj.category_id ?? ''),
    categoryName: asString(obj.categoryName ?? obj.category_name ?? ''),
    amountAED: asNumber(obj.amountAED ?? obj.amount_aed ?? obj.amount, 0),
    isPermanent,
    effectiveFrom: asString(obj.effectiveFrom ?? obj.effective_from ?? ''),
    effectiveTo:
      rawEffectiveTo === null || rawEffectiveTo === undefined || rawEffectiveTo === ''
        ? null
        : asString(rawEffectiveTo),
    durationMonths,
    targetBucket: (obj.targetBucket ?? obj.target_bucket ?? null) as DeductionTargetBucket | null,
    reason: asString(obj.reason ?? ''),
    createdBy: asString(obj.createdBy ?? obj.created_by ?? ''),
    createdByRole: normalizeUserRole(obj.createdByRole ?? obj.created_by_role),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? new Date().toISOString()),
    updatedAt: asString(obj.updatedAt ?? obj.updated_at ?? '') || undefined,
  };
}

export function normalizeDeductionApproval(raw: unknown): DeductionApprovalRequest {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? ''),
    employeeId: asString(obj.employeeId ?? obj.employee_id ?? obj.user_id ?? ''),
    companyId: asString(obj.companyId ?? obj.company_id ?? ''),
    sectionId: asString(obj.sectionId ?? obj.section_id ?? ''),
    month: asString(obj.month ?? obj.payroll_month ?? ''),
    triggerType: asString(obj.triggerType ?? obj.trigger_type, 'latency') as DeductionApprovalTrigger,
    date: asString(obj.date ?? obj.incident_date ?? ''),
    amountAED: asNumber(obj.amountAED ?? obj.amount_aed ?? obj.amount, 0),
    targetBucket: asString(
      obj.targetBucket ?? obj.target_bucket,
      'main_salary'
    ) as DeductionTargetBucket,
    reason: asString(obj.reason ?? ''),
    workflowChain: asString(
      obj.workflowChain ?? obj.workflow_chain,
      'manager_then_hr'
    ) as DeductionWorkflowChain,
    status: asString(obj.status, 'pending_manager') as DeductionApprovalStatus,
    escalationDeadline: asString(
      obj.escalationDeadline ?? obj.escalation_deadline ?? new Date().toISOString()
    ),
    managerActorName:
      asString(obj.managerActorName ?? obj.manager_actor_name ?? '') || undefined,
    managerDecision:
      (obj.managerDecision ?? obj.manager_decision ?? undefined) as
        | 'approved'
        | 'rejected'
        | undefined,
    managerNote: asString(obj.managerNote ?? obj.manager_note ?? '') || undefined,
    managerDecidedAt:
      asString(obj.managerDecidedAt ?? obj.manager_decided_at ?? '') || undefined,
    hrActorName: asString(obj.hrActorName ?? obj.hr_actor_name ?? '') || undefined,
    hrDecision:
      (obj.hrDecision ?? obj.hr_decision ?? undefined) as 'approved' | 'waived' | undefined,
    hrNote: asString(obj.hrNote ?? obj.hr_note ?? '') || undefined,
    hrDecidedAt: asString(obj.hrDecidedAt ?? obj.hr_decided_at ?? '') || undefined,
    createdBy: asString(obj.createdBy ?? obj.created_by ?? ''),
    createdByRole: normalizeUserRole(obj.createdByRole ?? obj.created_by_role),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? new Date().toISOString()),
  };
}

export function normalizePatchRelease(raw: unknown): PatchMoneyRelease {
  const obj = asRecord(raw);
  const rawAllocs = obj.allocations ?? obj.allocations_json;
  let parsedAllocs: unknown[] = [];
  if (Array.isArray(rawAllocs)) {
    parsedAllocs = rawAllocs;
  } else if (typeof rawAllocs === 'string' && rawAllocs.trim().startsWith('[')) {
    try {
      const p = JSON.parse(rawAllocs);
      if (Array.isArray(p)) parsedAllocs = p;
    } catch {
      parsedAllocs = [];
    }
  }
  const allocations: PatchReleaseAllocation[] = parsedAllocs.map((a) => {
    const rec = asRecord(a);
    return {
      month: asString(rec.month ?? rec.payroll_month ?? ''),
      bucket: asString(rec.bucket, 'off_cycle') as PatchReleaseAllocation['bucket'],
      amountAED: asNumber(rec.amountAED ?? rec.amount_aed ?? rec.amount, 0),
    };
  });

  return {
    id: asString(obj.id ?? ''),
    employeeId: asString(obj.employeeId ?? obj.employee_id ?? obj.user_id ?? ''),
    companyId: asString(obj.companyId ?? obj.company_id ?? ''),
    totalAmountAED: asNumber(obj.totalAmountAED ?? obj.total_amount_aed ?? obj.total_amount, 0),
    allocations,
    paymentMethod: asString(
      obj.paymentMethod ?? obj.payment_method,
      'Cash'
    ) as PatchPaymentMethod,
    releaseDate: asString(obj.releaseDate ?? obj.release_date ?? new Date().toISOString().slice(0, 10)),
    releasedBy: asString(obj.releasedBy ?? obj.released_by ?? ''),
    releasedByRole: normalizeUserRole(obj.releasedByRole ?? obj.released_by_role),
    referenceNote: asString(obj.referenceNote ?? obj.reference_note ?? '') || undefined,
    createdAt: asString(obj.createdAt ?? obj.created_at ?? new Date().toISOString()),
  };
}

export function normalizeDeductionWorkflowConfig(raw: unknown): DeductionWorkflowConfig {
  const obj = asRecord(raw);
  return {
    office_employee: asString(
      obj.office_employee ?? obj.officeEmployee,
      DEFAULT_DEDUCTION_WORKFLOW_CONFIG.office_employee
    ) as DeductionWorkflowChain,
    driver: asString(
      obj.driver,
      DEFAULT_DEDUCTION_WORKFLOW_CONFIG.driver
    ) as DeductionWorkflowChain,
    management: asString(
      obj.management,
      DEFAULT_DEDUCTION_WORKFLOW_CONFIG.management
    ) as DeductionWorkflowChain,
    autoEscalationHours: Math.max(
      1,
      asNumber(
        obj.autoEscalationHours ?? obj.auto_escalation_hours,
        DEFAULT_DEDUCTION_WORKFLOW_CONFIG.autoEscalationHours
      )
    ),
  };
}

export function normalizeEmployeeGroup(raw: unknown): EmployeeGroup {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? ''),
    name: asString(obj.name ?? ''),
    description: asString(obj.description ?? '') || undefined,
    color: asString(obj.color ?? '#0D9488'),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? '') || undefined,
  };
}

export function normalizeProject(raw: unknown): Project {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? ''),
    code: asString(obj.code ?? ''),
    name: asString(obj.name ?? ''),
    companyId: asString(obj.companyId ?? obj.company_id ?? ''),
    managerId: asString(obj.managerId ?? obj.manager_id ?? '') || null,
    supervisorIds: asStringArray(
      obj.supervisorIds ?? obj.supervisor_ids ?? obj.supervisor_ids_json
    ),
    description: asString(obj.description ?? '') || undefined,
    active: asBoolean(obj.active, true),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? '') || undefined,
  };
}

export function normalizeVisibilityRule(raw: unknown): VisibilityRule {
  const obj = asRecord(raw);
  const rawTargetType = asString(obj.targetType ?? obj.target_type ?? 'all');
  const targetType: VisibilityRuleTargetType =
    rawTargetType === 'group' ||
    rawTargetType === 'employee_type' ||
    rawTargetType === 'employees' ||
    rawTargetType === 'all'
      ? rawTargetType
      : 'all';
  const rawSections = asStringArray(
    obj.hiddenSections ?? obj.hidden_sections ?? obj.hidden_sections_json
  );
  const hiddenSections: HiddenSectionKey[] = rawSections
    .map((s) => normalizeHiddenSectionKey(s))
    .filter((s): s is HiddenSectionKey => s !== null);

  return {
    id: asString(obj.id ?? ''),
    name: asString(obj.name ?? ''),
    targetType,
    targetIds: asStringArray(obj.targetIds ?? obj.target_ids ?? obj.target_ids_json),
    hiddenSections,
    active: asBoolean(obj.active, true),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? '') || undefined,
  };
}

export function normalizeMyHiddenSections(raw: unknown): HiddenSectionKey[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = asRecord(raw);
    const candidate = obj.hiddenSections ?? obj.hidden_sections ?? obj.sections ?? [];
    if (Array.isArray(candidate)) list = candidate;
  }
  const unique = new Set<HiddenSectionKey>();
  for (const item of list) {
    const normalized = normalizeHiddenSectionKey(item);
    if (normalized) unique.add(normalized);
  }
  return Array.from(unique);
}

const VALID_STEP_ROLES = new Set<WorkflowStepRoleKey>([
  'section_manager',
  'project_manager',
  'supervisor',
  'hr_admin',
  'hr_manager',
  'main_manager',
]);

function normalizeStepRole(raw: unknown): WorkflowStepRoleKey {
  const s = asString(raw, 'section_manager').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (VALID_STEP_ROLES.has(s as WorkflowStepRoleKey)) {
    return s as WorkflowStepRoleKey;
  }
  if (s === 'hr') return 'hr_admin';
  if (s === 'admin' || s === 'gm' || s === 'general_manager') return 'main_manager';
  return 'section_manager';
}

export function normalizeWorkflowTemplate(raw: unknown): WorkflowTemplate {
  const obj = asRecord(raw);
  let rawSteps: unknown[] = [];
  const candidateSteps = obj.steps ?? obj.steps_json;
  if (Array.isArray(candidateSteps)) {
    rawSteps = candidateSteps;
  } else if (typeof candidateSteps === 'string' && candidateSteps.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(candidateSteps);
      if (Array.isArray(parsed)) rawSteps = parsed;
    } catch {
      rawSteps = [];
    }
  }

  const steps: WorkflowTemplateStep[] = rawSteps.map((s, idx) => {
    const rec = asRecord(s);
    const employeeId =
      asString(
        rec.employeeId ??
          rec.employee_id ??
          rec.userId ??
          rec.user_id ??
          rec.approverUserId ??
          rec.approver_user_id ??
          ''
      ) || undefined;
    const rawType = asString(rec.type ?? rec.stepType ?? rec.step_type ?? rec.approverType ?? rec.approver_type ?? '').toLowerCase();
    const isEmployee =
      rawType === 'employee' ||
      rawType === 'user' ||
      rawType === 'specific_employee' ||
      rawType === 'specific_user' ||
      (!rawType && Boolean(employeeId));
    return {
      stepOrder: asNumber(rec.stepOrder ?? rec.step_order ?? rec.order, idx + 1),
      type: isEmployee ? 'employee' : 'role',
      role: isEmployee
        ? undefined
        : normalizeStepRole(rec.role ?? rec.approverRole ?? rec.approver_role),
      employeeId: isEmployee ? employeeId : undefined,
    };
  });

  return {
    id: asString(obj.id ?? ''),
    name: asString(obj.name ?? ''),
    description: asString(obj.description ?? '') || undefined,
    steps,
    createdAt: asString(obj.createdAt ?? obj.created_at ?? '') || undefined,
    updatedAt: asString(obj.updatedAt ?? obj.updated_at ?? '') || undefined,
  };
}

export function normalizeWorkflowAssignments(raw: unknown): WorkflowModuleAssignments {
  const result: WorkflowModuleAssignments = { ...DEFAULT_WORKFLOW_ASSIGNMENTS };
  if (!raw) return result;

  if (Array.isArray(raw)) {
    for (const item of raw) {
      const rec = asRecord(item);
      const mod = asString(rec.module ?? rec.moduleKey ?? rec.module_key ?? rec.category ?? '').trim() as WorkflowModuleKey;
      if (ALL_WORKFLOW_MODULES.includes(mod)) {
        const wfId = asString(
          rec.workflowTemplateId ??
            rec.workflow_template_id ??
            rec.templateId ??
            rec.template_id ??
            rec.workflowId ??
            rec.workflow_id ??
            ''
        );
        result[mod] = wfId || null;
      }
    }
    return result;
  }

  if (typeof raw === 'object') {
    const obj = asRecord(raw);
    const source =
      obj.assignments && typeof obj.assignments === 'object'
        ? obj.assignments
        : obj;
    if (Array.isArray(source)) {
      return normalizeWorkflowAssignments(source);
    }
    const mapRec = asRecord(source);
    for (const mod of ALL_WORKFLOW_MODULES) {
      const val = mapRec[mod];
      if (typeof val === 'string' && val.trim()) {
        result[mod] = val.trim();
      } else if (val && typeof val === 'object') {
        const inner = asRecord(val);
        const id = asString(
          inner.workflowTemplateId ?? inner.workflow_template_id ?? inner.id ?? ''
        );
        result[mod] = id || null;
      } else if (val === null) {
        result[mod] = null;
      }
    }
  }
  return result;
}

export function normalizeResolvedWorkflowSteps(raw: unknown): ResolvedWorkflowStep[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    const obj = asRecord(raw);
    const candidate = obj.steps ?? obj.resolvedSteps ?? obj.resolved_steps ?? obj.chain ?? [];
    if (Array.isArray(candidate)) list = candidate;
  }
  return list.map((item, idx) => {
    const rec = asRecord(item);
    const rawType = asString(
      rec.approverType ?? rec.approver_type ?? rec.type ?? rec.stepType ?? rec.step_type ?? 'role'
    ).toLowerCase();
    const isEmployee =
      rawType === 'employee' ||
      rawType === 'user' ||
      rawType === 'specific_employee' ||
      rawType === 'specific_user';
    const role = isEmployee
      ? undefined
      : normalizeStepRole(rec.role ?? rec.approverRole ?? rec.approver_role);
    return {
      stepOrder: asNumber(rec.stepOrder ?? rec.step_order ?? rec.order, idx + 1),
      type: isEmployee ? 'employee' : 'role',
      role,
      roleLabel: asString(
        rec.roleLabel ?? rec.role_label ?? rec.label ?? (role ? role.replace(/_/g, ' ') : 'Approver')
      ),
      approverId:
        asString(
          rec.approverId ??
            rec.approver_id ??
            rec.employeeId ??
            rec.employee_id ??
            rec.userId ??
            rec.user_id ??
            ''
        ) || null,
      approverName: asString(
        rec.approverName ??
          rec.approver_name ??
          rec.employeeName ??
          rec.employee_name ??
          rec.name ??
          'Unassigned'
      ),
      skipped: asBoolean(rec.skipped, false),
      skipReason: asString(rec.skipReason ?? rec.skip_reason ?? '') || undefined,
    };
  });
}

export function normalizeUnifiedRequest(raw: unknown): UnifiedRequest {
  const obj = asRecord(raw);
  const rawCat = asString(obj.category ?? obj.requestType ?? obj.request_type ?? 'general').trim().toLowerCase();
  const category: RequestCategory =
    rawCat === 'custom_clock' ||
    rawCat === 'time_off' ||
    rawCat === 'advance_loan' ||
    rawCat === 'salary_adjustment' ||
    rawCat === 'general'
      ? rawCat
      : 'general';

  const rawStatus = asString(obj.status ?? 'pending').trim().toLowerCase();
  const status: RequestStatus =
    rawStatus === 'approved' ||
    rawStatus === 'rejected' ||
    rawStatus === 'bypassed' ||
    rawStatus === 'pending'
      ? rawStatus
      : 'pending';

  const rawStepsCandidate = obj.steps ?? obj.approvalSteps ?? obj.approval_steps ?? [];
  const rawSteps = Array.isArray(rawStepsCandidate) ? rawStepsCandidate : [];
  const steps: RequestApprovalStep[] = rawSteps.map((s, idx) => {
    const rec = asRecord(s);
    const rawStepType = asString(rec.type ?? rec.stepType ?? rec.step_type ?? 'role').toLowerCase();
    const isEmp = rawStepType === 'employee' || rawStepType === 'user';
    const rawStepStatus = asString(rec.status ?? 'pending').toLowerCase();
    const stepStatus: RequestStepStatus =
      rawStepStatus === 'approved' ||
      rawStepStatus === 'rejected' ||
      rawStepStatus === 'bypassed' ||
      rawStepStatus === 'skipped'
        ? rawStepStatus
        : 'pending';
    return {
      stepOrder: asNumber(rec.stepOrder ?? rec.step_order, idx + 1),
      type: isEmp ? 'employee' : 'role',
      role: isEmp ? undefined : normalizeStepRole(rec.role ?? rec.approverRole ?? rec.approver_role),
      roleLabel: asString(rec.roleLabel ?? rec.role_label ?? rec.label ?? '') || undefined,
      approverId:
        asString(rec.approverId ?? rec.approver_id ?? rec.employeeId ?? rec.employee_id ?? '') || null,
      approverName: asString(rec.approverName ?? rec.approver_name ?? '') || undefined,
      status: stepStatus,
      actorId: asString(rec.actorId ?? rec.actor_id ?? '') || undefined,
      actorName: asString(rec.actorName ?? rec.actor_name ?? '') || undefined,
      actorRole: rec.actorRole ?? rec.actor_role ? normalizeUserRole(rec.actorRole ?? rec.actor_role) : undefined,
      comment: asString(rec.comment ?? rec.remark ?? rec.reason ?? '') || undefined,
      decidedAt: asString(rec.decidedAt ?? rec.decided_at ?? '') || undefined,
    };
  });

  const rawAuditCandidate = obj.auditLog ?? obj.audit_log ?? obj.history ?? [];
  const rawAudit = Array.isArray(rawAuditCandidate) ? rawAuditCandidate : [];
  const auditLog: RequestAuditEntry[] = rawAudit.map((a, idx) => {
    const rec = asRecord(a);
    const rawAct = asString(rec.action ?? 'submitted').toLowerCase();
    const act: RequestAuditEntry['action'] =
      rawAct === 'approved' || rawAct === 'approve'
        ? 'approved'
        : rawAct === 'rejected' || rawAct === 'reject'
          ? 'rejected'
          : rawAct === 'bypassed' || rawAct === 'bypass'
            ? 'bypassed'
            : 'submitted';
    return {
      id: asString(rec.id ?? `aud-${idx}`),
      action: act,
      actorId: asString(rec.actorId ?? rec.actor_id ?? '') || undefined,
      actorName: asString(rec.actorName ?? rec.actor_name ?? 'User'),
      actorRole: rec.actorRole ?? rec.actor_role ? normalizeUserRole(rec.actorRole ?? rec.actor_role) : undefined,
      stepOrder: rec.stepOrder !== undefined || rec.step_order !== undefined
        ? asNumber(rec.stepOrder ?? rec.step_order, 1)
        : undefined,
      comment: asString(rec.comment ?? rec.reason ?? rec.note ?? '') || undefined,
      timestamp: asString(rec.timestamp ?? rec.createdAt ?? rec.created_at ?? new Date().toISOString()),
    };
  });

  let rawPayloadObj = asRecord(obj.payload ?? obj.details ?? obj.data);
  if (typeof obj.payload === 'string' && obj.payload.trim().startsWith('{')) {
    try {
      rawPayloadObj = asRecord(JSON.parse(obj.payload));
    } catch {
      rawPayloadObj = {};
    }
  }

  const amountAED =
    rawPayloadObj.amountAED ?? rawPayloadObj.amount_aed ?? obj.amountAED ?? obj.amount_aed;
  const repaymentMonths =
    rawPayloadObj.repaymentMonths ?? rawPayloadObj.repayment_months ?? obj.repaymentMonths ?? obj.repayment_months;

  const payload: RequestPayload = {
    date: asString(rawPayloadObj.date ?? obj.date ?? '') || undefined,
    clockInTime: asString(rawPayloadObj.clockInTime ?? rawPayloadObj.clock_in_time ?? obj.clockInTime ?? obj.clock_in_time ?? '') || undefined,
    clockOutTime: asString(rawPayloadObj.clockOutTime ?? rawPayloadObj.clock_out_time ?? obj.clockOutTime ?? obj.clock_out_time ?? '') || undefined,
    leaveSubType:
      (asString(rawPayloadObj.leaveSubType ?? rawPayloadObj.leave_sub_type ?? rawPayloadObj.subType ?? rawPayloadObj.sub_type ?? '') ||
        undefined) as TimeOffSubType | undefined,
    startDate: asString(rawPayloadObj.startDate ?? rawPayloadObj.start_date ?? obj.startDate ?? obj.start_date ?? '') || undefined,
    endDate: asString(rawPayloadObj.endDate ?? rawPayloadObj.end_date ?? obj.endDate ?? obj.end_date ?? '') || undefined,
    days:
      rawPayloadObj.days !== undefined || obj.days !== undefined
        ? asNumber(rawPayloadObj.days ?? obj.days, 0)
        : undefined,
    amountAED: amountAED !== undefined ? asNumber(amountAED, 0) : undefined,
    repaymentMonths: repaymentMonths !== undefined ? asNumber(repaymentMonths, 1) : undefined,
    startMonth: asString(rawPayloadObj.startMonth ?? rawPayloadObj.start_month ?? obj.startMonth ?? obj.start_month ?? '') || undefined,
    monthlyDeductionAED:
      rawPayloadObj.monthlyDeductionAED !== undefined || rawPayloadObj.monthly_deduction_aed !== undefined
        ? asNumber(rawPayloadObj.monthlyDeductionAED ?? rawPayloadObj.monthly_deduction_aed, 0)
        : amountAED !== undefined && repaymentMonths !== undefined
          ? calculateLoanMonthlyDeduction(asNumber(amountAED, 0), asNumber(repaymentMonths, 1))
          : undefined,
    targetEmployeeId:
      asString(rawPayloadObj.targetEmployeeId ?? rawPayloadObj.target_employee_id ?? '') || undefined,
    targetEmployeeName:
      asString(rawPayloadObj.targetEmployeeName ?? rawPayloadObj.target_employee_name ?? '') || undefined,
    currentBaseSalaryAED:
      rawPayloadObj.currentBaseSalaryAED !== undefined || rawPayloadObj.current_base_salary_aed !== undefined
        ? asNumber(rawPayloadObj.currentBaseSalaryAED ?? rawPayloadObj.current_base_salary_aed, 0)
        : undefined,
    newBaseSalaryAED:
      rawPayloadObj.newBaseSalaryAED !== undefined || rawPayloadObj.new_base_salary_aed !== undefined
        ? asNumber(rawPayloadObj.newBaseSalaryAED ?? rawPayloadObj.new_base_salary_aed, 0)
        : undefined,
    subject: asString(rawPayloadObj.subject ?? obj.subject ?? '') || undefined,
    message: asString(rawPayloadObj.message ?? obj.message ?? '') || undefined,
    attachmentUrl:
      asString(rawPayloadObj.attachmentUrl ?? rawPayloadObj.attachment_url ?? obj.attachmentUrl ?? obj.attachment_url ?? '') || undefined,
    attachmentName:
      asString(rawPayloadObj.attachmentName ?? rawPayloadObj.attachment_name ?? obj.attachmentName ?? obj.attachment_name ?? '') || undefined,
  };

  const rawStepIdx = obj.currentStepIndex ?? obj.current_step_index;
  const derivedStepIdx =
    status !== 'pending'
      ? -1
      : rawStepIdx !== undefined && rawStepIdx !== null
        ? asNumber(rawStepIdx, 0)
        : steps.findIndex((s) => s.status === 'pending');

  return {
    id: asString(obj.id ?? ''),
    category,
    employeeId: asString(obj.employeeId ?? obj.employee_id ?? obj.userId ?? obj.user_id ?? ''),
    employeeName: asString(obj.employeeName ?? obj.employee_name ?? '') || undefined,
    companyId: asString(obj.companyId ?? obj.company_id ?? ''),
    sectionId: asString(obj.sectionId ?? obj.section_id ?? ''),
    workflowTemplateId:
      asString(obj.workflowTemplateId ?? obj.workflow_template_id ?? '') || null,
    workflowTemplateName:
      asString(obj.workflowTemplateName ?? obj.workflow_template_name ?? '') || undefined,
    status,
    currentStepIndex: derivedStepIdx,
    steps,
    auditLog,
    reason: asString(obj.reason ?? payload.message ?? ''),
    payload,
    createdById: asString(obj.createdById ?? obj.created_by_id ?? obj.employeeId ?? obj.employee_id ?? ''),
    createdByName: asString(obj.createdByName ?? obj.created_by_name ?? obj.employeeName ?? obj.employee_name ?? ''),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? new Date().toISOString()),
    updatedAt: asString(obj.updatedAt ?? obj.updated_at ?? '') || undefined,
  };
}

export function normalizeEmployee(raw: unknown): Employee {
  const obj = asRecord(raw);
  const salaryObj = asRecord(obj.salary);
  const bankObj = asRecord(obj.bankDetails ?? obj.bank_details);
  const leaveObj = asRecord(obj.leaveBalance ?? obj.leave_balance);

  const bankName = asString(bankObj.bankName ?? bankObj.bank_name ?? obj.bank_name ?? '');
  const accountNumber = asString(
    bankObj.accountNumber ?? bankObj.account_number ?? obj.account_number ?? ''
  );
  const iban = asString(bankObj.iban ?? obj.iban ?? '');
  const bankRoutingCode =
    asString(bankObj.bankRoutingCode ?? bankObj.bank_routing_code ?? obj.bank_routing_code ?? '') ||
    undefined;
  const mohrePersonId =
    asString(obj.mohrePersonId ?? obj.mohre_person_id ?? '') || undefined;

  const normalizedRole = normalizeUserRole(obj.role);
  const sectionId = asString(obj.sectionId ?? obj.section_id ?? '');
  const modelId = asString(obj.modelId ?? obj.model_id ?? '');
  const rawEmpType = asString(obj.employeeType ?? obj.employee_type ?? '');
  const employeeType: EmployeeType =
    rawEmpType === 'office_employee' || rawEmpType === 'driver' || rawEmpType === 'management'
      ? rawEmpType
      : inferDefaultEmployeeType({ role: normalizedRole, sectionId, modelId });

  const rawOverride = asString(
    obj.deductionWorkflowOverride ?? obj.deduction_workflow_override ?? 'inherit'
  );
  const deductionWorkflowOverride: DeductionWorkflowChain | 'inherit' =
    rawOverride === 'manager_then_hr' ||
    rawOverride === 'hr_only' ||
    rawOverride === 'main_manager_only'
      ? rawOverride
      : 'inherit';

  return {
    id: asString(obj.id ?? obj.user_id ?? ''),
    employeeCode: asString(obj.employeeCode ?? obj.employee_code ?? ''),
    fullName: asString(obj.fullName ?? obj.full_name ?? obj.name ?? 'Employee'),
    email: asString(obj.email ?? ''),
    phone: asString(obj.phone ?? ''),
    avatarUrl: asString(obj.avatarUrl ?? obj.avatar_url ?? '') || undefined,
    passwordHash: asString(obj.passwordHash ?? obj.password_hash ?? '') || undefined,
    mustChangePassword: asBoolean(obj.mustChangePassword ?? obj.must_change_password, false),
    role: normalizedRole,
    employeeType,
    deductionWorkflowOverride,
    primaryCompanyId: asString(obj.primaryCompanyId ?? obj.primary_company_id ?? ''),
    sharedCompanyIds: asStringArray(obj.sharedCompanyIds ?? obj.shared_company_ids),
    sectionId,
    managedSectionIds: asStringArray(
      obj.managedSectionIds ?? obj.managed_section_ids ?? obj.managed_section_ids_json
    ),
    labelIds: asStringArray(obj.labelIds ?? obj.label_ids),
    modelId,
    workType: normalizeWorkType(obj.workType ?? obj.work_type),
    groupIds: asStringArray(obj.groupIds ?? obj.group_ids ?? obj.group_ids_json),
    projectIds: asStringArray(obj.projectIds ?? obj.project_ids ?? obj.project_ids_json),
    jobTitle: asString(obj.jobTitle ?? obj.job_title ?? ''),
    joinDate: asString(obj.joinDate ?? obj.join_date ?? new Date().toISOString().slice(0, 10)),
    active: asBoolean(obj.active, true),
    assignedZoneIds: asStringArray(
      obj.assignedZoneIds ?? obj.assigned_zone_ids ?? obj.assigned_zone_ids_json
    ),
    clockInPolicyOverride:
      (obj.clockInPolicyOverride ?? obj.clock_in_policy_override ?? 'inherit') as
        | ClockInPolicyMode
        | 'inherit',
    salary: {
      baseSalary: asNumber(
        salaryObj.baseSalary ?? salaryObj.base_salary ?? obj.base_salary_aed ?? obj.base_salary,
        0
      ),
      housingAllowance: asNumber(
        salaryObj.housingAllowance ?? salaryObj.housing_allowance ?? obj.housing_allowance,
        0
      ),
      transportAllowance: asNumber(
        salaryObj.transportAllowance ?? salaryObj.transport_allowance ?? obj.transport_allowance,
        0
      ),
      otherAllowance: asNumber(
        salaryObj.otherAllowance ??
          salaryObj.other_allowance ??
          obj.other_allowance ??
          obj.allowances_aed,
        0
      ),
    },
    mohrePersonId,
    bankDetails:
      bankName || accountNumber || iban || bankRoutingCode
        ? { bankName, accountNumber, iban, bankRoutingCode }
        : undefined,
    leaveBalance: {
      annualTotal: asNumber(leaveObj.annualTotal ?? leaveObj.annual_total, 30),
      annualUsed: asNumber(leaveObj.annualUsed ?? leaveObj.annual_used, 0),
      sickTotal: asNumber(leaveObj.sickTotal ?? leaveObj.sick_total, 15),
      sickUsed: asNumber(leaveObj.sickUsed ?? leaveObj.sick_used, 0),
      emergencyTotal: asNumber(leaveObj.emergencyTotal ?? leaveObj.emergency_total, 5),
      emergencyUsed: asNumber(leaveObj.emergencyUsed ?? leaveObj.emergency_used, 0),
      unpaidUsed: asNumber(leaveObj.unpaidUsed ?? leaveObj.unpaid_used, 0),
    },
    customShift: (obj.customShift ?? obj.custom_shift) as ShiftSchedule | undefined,
    pendingShiftProposal: (obj.pendingShiftProposal ??
      obj.pending_shift_proposal ??
      null) as Employee['pendingShiftProposal'],
  };
}

function createDefaultLiveSettings(apiBaseUrl: string): AppSettings {
  return {
    groupName: 'Yaldi HR',
    currency: 'AED',
    globalClockInPolicy: ClockInPolicyMode.StrictMobileGPS,
    maxMobileAccuracyMeters: 150,
    customDocumentTypes: [],
    apiBaseUrl,
    deductionWorkflowConfig: { ...DEFAULT_DEDUCTION_WORKFLOW_CONFIG },
  };
}

function getDefaultStatusText(status: number): string {
  const map: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    408: 'Request Timeout',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };
  return map[status] ?? 'HTTP Error';
}

function extractErrorMessage(rawBody: string, status: number, statusText: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) return `HTTP ${status} ${statusText}`;
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.detail === 'string' && parsed.detail.trim()) return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      const first = asRecord(parsed.detail[0]);
      if (typeof first.msg === 'string') return first.msg;
    }
    if (typeof parsed.message === 'string' && parsed.message.trim()) return parsed.message;
    if (typeof parsed.error === 'string' && parsed.error.trim()) return parsed.error;
  } catch {
    // Plain text response
  }
  return trimmed.slice(0, 240);
}

async function restFetch<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  const config = getServerConfig();
  const session = getStoredSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Client-Platform': CLIENT_PLATFORM_HEADER,
    ...((init.headers as Record<string, string>) || {}),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  const controller = new AbortController();
  const timerId = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
  } catch (err) {
    globalThis.clearTimeout(timerId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiHttpError({
        endpoint: path,
        status: 408,
        statusText: 'Request Timeout',
        message: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
        isTimeout: true,
      });
    }
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ApiHttpError({
        endpoint: path,
        status: 408,
        statusText: 'Request Timeout',
        message: `Request timed out after ${Math.round(timeoutMs / 1000)} seconds.`,
        isTimeout: true,
      });
    }
    throw new ServerUnreachableError(
      `Cannot connect to self-hosted server at ${config.apiBaseUrl}.`,
      path
    );
  }
  globalThis.clearTimeout(timerId);

  if (!res.ok) {
    const rawBody = await res.text().catch(() => '');
    const statusText = res.statusText || getDefaultStatusText(res.status);
    const isLoginEndpoint = path === '/auth/login' || path.startsWith('/auth/login?');
    if (res.status === 401 && !isLoginEndpoint) {
      handleUnauthorizedSession();
    }
    const retryAfterSeconds =
      res.status === 429
        ? parseRetryAfterSeconds(res.headers?.get('Retry-After'), 60)
        : undefined;
    throw new ApiHttpError({
      endpoint: path,
      status: res.status,
      statusText,
      message:
        res.status === 401 && !isLoginEndpoint
          ? SESSION_EXPIRED_MESSAGE
          : extractErrorMessage(rawBody, res.status, statusText),
      retryAfterSeconds,
    });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function readDb(): HRDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<HRDatabase>;
      if (parsed && Array.isArray(parsed.companies) && Array.isArray(parsed.employees)) {
        // Non-destructive Phase 1A + 1B + v4.0 Phase 1 & 2 migration for previously cached local demo databases
        const needsMigration =
          !Array.isArray(parsed.groups) ||
          !Array.isArray(parsed.projects) ||
          !Array.isArray(parsed.visibilityRules) ||
          !Array.isArray(parsed.workflowTemplates) ||
          !parsed.workflowAssignments ||
          !Array.isArray(parsed.requests) ||
          !Array.isArray(parsed.payrollCategories) ||
          !Array.isArray(parsed.payrollEntries) ||
          !Array.isArray(parsed.deductionApprovals) ||
          !Array.isArray(parsed.patchReleases) ||
          !parsed.settings?.deductionWorkflowConfig ||
          !parsed.employees.some((e) => e.id === 'emp-alanood') ||
          parsed.companies.some((c) => !c.molEstablishmentId) ||
          parsed.employees.some(
            (e) => !e.employeeType || !e.workType || !Array.isArray(e.groupIds) || !Array.isArray(e.projectIds)
          );

        if (needsMigration) {
          const fresh = createInitialSeedData();
          const freshCompById = new Map(fresh.companies.map((c) => [c.id, c]));
          const freshEmpById = new Map(fresh.employees.map((e) => [e.id, e]));
          const existingEmpIds = new Set(parsed.employees.map((e) => e.id));
          const mergedEmployees: Employee[] = parsed.employees.map((e) => {
            const seedEmp = freshEmpById.get(e.id);
            return {
              ...e,
              workType: normalizeWorkType(e.workType ?? seedEmp?.workType ?? 'office'),
              groupIds: Array.isArray(e.groupIds) ? e.groupIds : (seedEmp?.groupIds ?? []),
              projectIds: Array.isArray(e.projectIds) ? e.projectIds : (seedEmp?.projectIds ?? []),
              employeeType:
                e.employeeType ??
                seedEmp?.employeeType ??
                inferDefaultEmployeeType({
                  role: e.role,
                  sectionId: e.sectionId,
                  modelId: e.modelId,
                }),
              deductionWorkflowOverride:
                e.deductionWorkflowOverride ?? seedEmp?.deductionWorkflowOverride ?? 'inherit',
              mohrePersonId: e.mohrePersonId ?? seedEmp?.mohrePersonId,
              bankDetails: e.bankDetails
                ? {
                    ...e.bankDetails,
                    bankRoutingCode:
                      e.bankDetails.bankRoutingCode ?? seedEmp?.bankDetails?.bankRoutingCode,
                  }
                : seedEmp?.bankDetails,
            };
          });
          // Ensure seeded HR Manager account exists for Phase 2 Demo Mode
          const seedHrMgr = fresh.employees.find((e) => e.id === 'emp-alanood');
          if (seedHrMgr && !existingEmpIds.has(seedHrMgr.id)) {
            mergedEmployees.splice(2, 0, seedHrMgr);
          }

          const migrated: HRDatabase = {
            ...(parsed as HRDatabase),
            companies: parsed.companies.map((c) => {
              const seedComp = freshCompById.get(c.id);
              return {
                ...c,
                molEstablishmentId: c.molEstablishmentId ?? seedComp?.molEstablishmentId,
                wpsRoutingCode: c.wpsRoutingCode ?? seedComp?.wpsRoutingCode,
                companyIban: c.companyIban ?? seedComp?.companyIban,
              };
            }),
            groups: Array.isArray(parsed.groups) ? parsed.groups : fresh.groups,
            projects: Array.isArray(parsed.projects) ? parsed.projects : fresh.projects,
            visibilityRules: Array.isArray(parsed.visibilityRules)
              ? parsed.visibilityRules
              : fresh.visibilityRules,
            workflowTemplates: Array.isArray(parsed.workflowTemplates)
              ? parsed.workflowTemplates
              : fresh.workflowTemplates,
            workflowAssignments: parsed.workflowAssignments
              ? normalizeWorkflowAssignments(parsed.workflowAssignments)
              : fresh.workflowAssignments,
            requests: Array.isArray(parsed.requests) ? parsed.requests : fresh.requests,
            employees: mergedEmployees,
            payrollCategories:
              Array.isArray(parsed.payrollCategories) && parsed.payrollCategories.length > 0
                ? parsed.payrollCategories
                : fresh.payrollCategories,
            payrollEntries: Array.isArray(parsed.payrollEntries)
              ? parsed.payrollEntries
              : fresh.payrollEntries,
            deductionApprovals: Array.isArray(parsed.deductionApprovals)
              ? parsed.deductionApprovals
              : fresh.deductionApprovals,
            patchReleases: Array.isArray(parsed.patchReleases)
              ? parsed.patchReleases
              : fresh.patchReleases,
            settings: {
              ...fresh.settings,
              ...(parsed.settings ?? {}),
              deductionWorkflowConfig: parsed.settings?.deductionWorkflowConfig
                ? normalizeDeductionWorkflowConfig(parsed.settings.deductionWorkflowConfig)
                : fresh.settings.deductionWorkflowConfig,
            },
          };
          writeDb(migrated);
          return migrated;
        }
        return parsed as HRDatabase;
      }
    }
  } catch {
    // Fallback
  }
  const seeded = createInitialSeedData();
  writeDb(seeded);
  return seeded;
}

function writeDb(db: HRDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn('Unable to persist Yaldi HR database:', err);
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

const ROLE_DEFAULT_DEMO_USER: Record<UserRole, string> = {
  [UserRole.MainManager]: 'emp-tariq',
  [UserRole.HRManager]: 'emp-alanood',
  [UserRole.HRAdmin]: 'emp-layla',
  [UserRole.SectionManager]: 'emp-karim',
  [UserRole.SectionCoManager]: 'emp-priya',
  [UserRole.PRO]: 'emp-hassan',
  [UserRole.Accounting]: 'emp-nadia',
  [UserRole.Employee]: 'emp-omar',
};

export const api = {
  getServerConfig,
  saveServerConfig,

  onUnauthorized(listener: UnauthorizedListener): () => void {
    unauthorizedListeners.add(listener);
    return () => {
      unauthorizedListeners.delete(listener);
    };
  },

  async pingServer(): Promise<boolean> {
    const cfg = getServerConfig();
    if (cfg.useMockApi) return true;
    try {
      const res = await fetch(`${cfg.apiBaseUrl}/health`, {
        method: 'GET',
        headers: { 'X-Client-Platform': CLIENT_PLATFORM_HEADER },
      });
      return res.ok;
    } catch {
      return false;
    }
  },

  auth: {
    getSession(): AuthSession | null {
      return getStoredSession();
    },

    async login(email: string, password: string): Promise<AuthSession> {
      const trimmedEmail = email.trim();
      const validation = validateSignInInput(trimmedEmail, password);
      if (!validation.valid) {
        throw new Error(validation.error || 'Enter both work email and password.');
      }
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const raw = await restFetch<unknown>('/auth/login', {
          method: 'POST',
          headers: {
            'X-Client-Platform': CLIENT_PLATFORM_HEADER,
          },
          body: JSON.stringify({ email: trimmedEmail, password }),
        });
        const session = normalizeAuthSession(raw, trimmedEmail, 'live');
        saveSession(session);
        return session;
      }
      const db = readDb();
      const matched = db.employees.find(
        (e) => e.email.toLowerCase() === email.trim().toLowerCase() && e.active
      );
      if (!matched) {
        throw new Error('Account not found. Try tariq.hashemi@yaldi.ae or use the Demo Role Switcher.');
      }
      const expectedPassword = matched.passwordHash || 'demo1234';
      if (password !== expectedPassword) {
        throw new Error('Incorrect password. Please check your credentials and try again.');
      }
      const session: AuthSession = {
        token: `demo-jwt-${matched.id}-${Date.now()}`,
        userId: matched.id,
        role: normalizeUserRole(matched.role),
        mode: 'demo',
        mustChangePassword: matched.mustChangePassword,
        fullName: matched.fullName,
        email: matched.email,
        employeeCode: matched.employeeCode,
        avatarUrl: matched.avatarUrl,
        primaryCompanyId: matched.primaryCompanyId,
        sectionId: matched.sectionId,
      };
      saveSession(session);
      return session;
    },

    async demoLogin(role: UserRole): Promise<AuthSession> {
      const db = readDb();
      const normalizedRole = normalizeUserRole(role);
      const preferred = ROLE_DEFAULT_DEMO_USER[normalizedRole];
      const emp =
        db.employees.find((e) => e.id === preferred) ??
        db.employees.find((e) => normalizeUserRole(e.role) === normalizedRole) ??
        db.employees[0];
      const session: AuthSession = {
        token: `demo-jwt-${emp.id}-${Date.now()}`,
        userId: emp.id,
        role: normalizedRole,
        mode: 'demo',
        mustChangePassword: false,
        fullName: emp.fullName,
        email: emp.email,
        employeeCode: emp.employeeCode,
        avatarUrl: emp.avatarUrl,
        primaryCompanyId: emp.primaryCompanyId,
        sectionId: emp.sectionId,
      };
      saveSession(session);
      return session;
    },

    async changePassword(params: {
      userId: string;
      currentPassword?: string;
      newPassword: string;
      isForcedFirstLogin?: boolean;
    }): Promise<AuthSession | null> {
      const policyCheck = validatePasswordPolicy({
        newPassword: params.newPassword,
        currentPassword: params.isForcedFirstLogin ? undefined : params.currentPassword,
      });
      if (!policyCheck.valid) {
        throw new Error(
          policyCheck.error ||
            'Password must be 8–128 characters and include at least one letter and one number.'
        );
      }
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<Record<string, unknown>>('/auth/change-password', {
          method: 'POST',
          headers: {
            'X-Client-Platform': CLIENT_PLATFORM_HEADER,
          },
          body: JSON.stringify({
            ...params,
            user_id: params.userId,
            current_password: params.currentPassword,
            new_password: params.newPassword,
            is_forced_first_login: Boolean(params.isForcedFirstLogin),
          }),
        });
        const current = getStoredSession();
        const sessionObj = asRecord(res?.session);
        const freshToken = asString(
          res?.token ??
            res?.access_token ??
            res?.jwt ??
            sessionObj.token ??
            sessionObj.access_token ??
            ''
        );
        let next: AuthSession | null = null;
        if (res?.session) {
          next = normalizeAuthSession(res.session, current?.email, 'live');
        } else if (current) {
          next = { ...current, mustChangePassword: false };
        } else if (freshToken) {
          next = normalizeAuthSession(res, undefined, 'live');
        }
        if (next) {
          if (freshToken) {
            next.token = freshToken;
          }
          next.mustChangePassword = false;
          saveSession(next);
        }
        return next;
      }
      const db = readDb();
      const emp = db.employees.find((e) => e.id === params.userId);
      if (!emp) throw new Error('Account not found.');
      if (!params.isForcedFirstLogin) {
        const expected = emp.passwordHash || 'demo1234';
        if (params.currentPassword !== expected) {
          throw new Error('Current password is incorrect.');
        }
      }
      db.employees = db.employees.map((e) =>
        e.id === params.userId
          ? { ...e, passwordHash: params.newPassword, mustChangePassword: false }
          : e
      );
      writeDb(db);
      const current = getStoredSession();
      if (current && current.userId === params.userId) {
        const updated: AuthSession = {
          ...current,
          token: `demo-jwt-${emp.id}-${Date.now()}`,
          mustChangePassword: false,
        };
        saveSession(updated);
        return updated;
      }
      return current;
    },

    async logout(): Promise<void> {
      saveSession(null);
    },
  },

  async getDatabase(roleHint?: UserRole): Promise<HRDatabase> {
    const cfg = getServerConfig();
    if (!cfg.useMockApi) {
      const activeRole = normalizeUserRole(roleHint ?? getStoredSession()?.role);
      const specs = getStartupEndpointsForRole(activeRole);

      const settled = await Promise.allSettled(
        specs.map((spec) => restFetch<unknown>(spec.path, {}, DEFAULT_REQUEST_TIMEOUT_MS))
      );

      const items: SettledStartupItem[] = specs.map((spec, idx) => {
        const result = settled[idx];
        if (result.status === 'fulfilled') {
          return { key: spec.key, path: spec.path, ok: true, value: result.value };
        }
        const reason = result.reason;
        let failure: EndpointFailure;
        if (reason instanceof ApiHttpError) {
          // Graceful backward compatibility if live server hasn't deployed newer tables yet
          if (
            reason.status === 404 &&
            (spec.key === 'payrollCategories' ||
              spec.key === 'payrollEntries' ||
              spec.key === 'deductionApprovals' ||
              spec.key === 'patchReleases' ||
              spec.key === 'groups' ||
              spec.key === 'projects' ||
              spec.key === 'visibilityRules' ||
              spec.key === 'myVisibility' ||
              spec.key === 'workflowTemplates' ||
              spec.key === 'workflowAssignments' ||
              spec.key === 'requests' ||
              spec.key === 'payrollApprovalRuns' ||
              spec.key === 'announcements')
          ) {
            return {
              key: spec.key,
              path: spec.path,
              ok: true,
              value: spec.key === 'workflowAssignments' ? { ...DEFAULT_WORKFLOW_ASSIGNMENTS } : [],
            };
          }
          failure = reason.toEndpointFailure();
        } else if (reason instanceof ServerUnreachableError) {
          failure = {
            endpoint: spec.path,
            status: null,
            statusText: 'Network Error',
            message: reason.message,
          };
        } else {
          failure = {
            endpoint: spec.path,
            status: null,
            statusText: 'Error',
            message: reason instanceof Error ? reason.message : 'Unexpected error while loading data.',
          };
        }
        return { key: spec.key, path: spec.path, ok: false, failure };
      });

      const evaluated = evaluateStartupEndpointResults(items);
      if (evaluated.fatalFailures.length > 0) {
        throw new StartupLoadError(evaluated.fatalFailures);
      }

      const rawValues = evaluated.values;
      const rawCompanies = Array.isArray(rawValues.companies) ? rawValues.companies : [];
      const rawEmployees = Array.isArray(rawValues.employees) ? rawValues.employees : [];
      const rawGroups = Array.isArray(rawValues.groups) ? rawValues.groups : [];
      const rawProjects = Array.isArray(rawValues.projects) ? rawValues.projects : [];
      const rawVisibilityRules = Array.isArray(rawValues.visibilityRules)
        ? rawValues.visibilityRules
        : [];
      const myHiddenSections = normalizeMyHiddenSections(rawValues.myVisibility);
      const rawWorkflowTemplates = Array.isArray(rawValues.workflowTemplates)
        ? rawValues.workflowTemplates
        : [];
      const workflowAssignments = normalizeWorkflowAssignments(rawValues.workflowAssignments);
      const rawRequests = Array.isArray(rawValues.requests) ? rawValues.requests : [];
      const rawCategories = Array.isArray(rawValues.payrollCategories)
        ? rawValues.payrollCategories
        : [];
      const rawEntries = Array.isArray(rawValues.payrollEntries) ? rawValues.payrollEntries : [];
      const rawDeductionApprovals = Array.isArray(rawValues.deductionApprovals)
        ? rawValues.deductionApprovals
        : [];
      const rawPatchReleases = Array.isArray(rawValues.patchReleases)
        ? rawValues.patchReleases
        : [];
      const rawPayrollApprovalRuns = Array.isArray(rawValues.payrollApprovalRuns)
        ? rawValues.payrollApprovalRuns
        : [];
      const rawAnnouncements = Array.isArray(rawValues.announcements)
        ? rawValues.announcements
        : [];
      const rawSettingsObj = asRecord(rawValues.settings);
      const rawQuickActions = rawSettingsObj.quickActions ?? rawSettingsObj.quick_actions;
      const rawSettings: AppSettings =
        rawValues.settings && typeof rawValues.settings === 'object'
          ? {
              ...createDefaultLiveSettings(cfg.apiBaseUrl),
              ...(rawValues.settings as Partial<AppSettings>),
              apiBaseUrl: cfg.apiBaseUrl,
              deductionWorkflowConfig: normalizeDeductionWorkflowConfig(
                rawSettingsObj.deductionWorkflowConfig ?? rawSettingsObj.deduction_workflow_config
              ),
              quickActions: Array.isArray(rawQuickActions)
                ? rawQuickActions.map(normalizeQuickActionConfigItem)
                : undefined,
            }
          : createDefaultLiveSettings(cfg.apiBaseUrl);

      return {
        companies: rawCompanies.map(normalizeCompany),
        sections: Array.isArray(rawValues.sections) ? (rawValues.sections as Section[]) : [],
        labels: Array.isArray(rawValues.labels) ? (rawValues.labels as EmployeeLabel[]) : [],
        groups: rawGroups.map(normalizeEmployeeGroup),
        projects: rawProjects.map(normalizeProject),
        visibilityRules: rawVisibilityRules.map(normalizeVisibilityRule),
        myHiddenSections,
        employeeModels: Array.isArray(rawValues.employeeModels)
          ? (rawValues.employeeModels as EmployeeModel[])
          : [],
        employees: rawEmployees.map(normalizeEmployee),
        proAssignments: Array.isArray(rawValues.proAssignments)
          ? (rawValues.proAssignments as ProAssignment[])
          : [],
        geofences: Array.isArray(rawValues.geofences) ? (rawValues.geofences as GeofenceZone[]) : [],
        documents: Array.isArray(rawValues.documents) ? (rawValues.documents as EmployeeDocument[]) : [],
        attendance: Array.isArray(rawValues.attendance) ? (rawValues.attendance as AttendanceLog[]) : [],
        attendanceAudit: Array.isArray(rawValues.attendanceAudit)
          ? (rawValues.attendanceAudit as AttendanceAuditEntry[])
          : [],
        leaves: Array.isArray(rawValues.leaves) ? (rawValues.leaves as LeaveRequest[]) : [],
        workflows: Array.isArray(rawValues.workflows) ? (rawValues.workflows as ApprovalWorkflow[]) : [],
        workflowTemplates: rawWorkflowTemplates.map(normalizeWorkflowTemplate),
        workflowAssignments,
        requests: rawRequests.map(normalizeUnifiedRequest),
        payrollAdjustments: Array.isArray(rawValues.payrollAdjustments)
          ? (rawValues.payrollAdjustments as PayrollAdjustment[])
          : [],
        payrollCategories: rawCategories.map(normalizePayrollCategory),
        payrollEntries: rawEntries.map(normalizePayrollEntry),
        deductionApprovals: rawDeductionApprovals.map(normalizeDeductionApproval),
        patchReleases: rawPatchReleases.map(normalizePatchRelease),
        salaryReleases: Array.isArray(rawValues.salaryReleases)
          ? (rawValues.salaryReleases as SalaryReleaseSchedule[])
          : [],
        payrollApprovalRuns: rawPayrollApprovalRuns.map(normalizePayrollApprovalRun),
        announcements: rawAnnouncements.map(normalizeAnnouncement),
        settings: rawSettings,
      };
    }
    const db = readDb();
    const session = getStoredSession();
    const normalizedEmployees = db.employees.map((e) => ({
      ...e,
      role: normalizeUserRole(e.role),
      workType: normalizeWorkType(e.workType),
      groupIds: Array.isArray(e.groupIds) ? e.groupIds : [],
      projectIds: Array.isArray(e.projectIds) ? e.projectIds : [],
      employeeType:
        e.employeeType ??
        inferDefaultEmployeeType({ role: e.role, sectionId: e.sectionId, modelId: e.modelId }),
    }));
    const sessionEmp = session
      ? normalizedEmployees.find((e) => e.id === session.userId)
      : undefined;
    const myHiddenSections = sessionEmp
      ? evaluateUserHiddenSections(
          { ...sessionEmp, role: session?.role ?? sessionEmp.role },
          db.visibilityRules ?? []
        )
      : [];
    return {
      ...db,
      employees: normalizedEmployees,
      labels: db.labels ?? [],
      groups: db.groups ?? [],
      projects: db.projects ?? [],
      visibilityRules: db.visibilityRules ?? [],
      myHiddenSections,
      workflowTemplates: db.workflowTemplates ?? [],
      workflowAssignments: normalizeWorkflowAssignments(db.workflowAssignments),
      requests: db.requests ?? [],
      proAssignments: db.proAssignments ?? [],
      payrollCategories: db.payrollCategories ?? [],
      payrollEntries: db.payrollEntries ?? [],
      deductionApprovals: db.deductionApprovals ?? [],
      patchReleases: db.patchReleases ?? [],
      salaryReleases: db.salaryReleases ?? [],
      payrollApprovalRuns: readStoredPayrollRuns(),
      announcements: readStoredAnnouncements(),
      settings: {
        ...db.settings,
        apiBaseUrl: cfg.apiBaseUrl,
        deductionWorkflowConfig: normalizeDeductionWorkflowConfig(
          db.settings?.deductionWorkflowConfig
        ),
      },
    };
  },

  async resetDemoData(): Promise<HRDatabase> {
    const fresh = createInitialSeedData();
    writeDb(fresh);
    return fresh;
  },

  companies: {
    async create(input: Omit<Company, 'id'>): Promise<Company> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/companies', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            mol_establishment_id: input.molEstablishmentId ?? null,
            wps_routing_code: input.wpsRoutingCode ?? null,
            company_iban: input.companyIban ?? null,
          }),
        });
        return normalizeCompany(res);
      }
      const db = readDb();
      const created: Company = { ...input, id: makeId('comp') };
      db.companies = [...db.companies, created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<Company>): Promise<Company> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(`/companies/${id}`, {
          method: 'PUT',
          body: JSON.stringify({
            ...patch,
            mol_establishment_id: patch.molEstablishmentId,
            wps_routing_code: patch.wpsRoutingCode,
            company_iban: patch.companyIban,
          }),
        });
        return normalizeCompany(res);
      }
      const db = readDb();
      let updated: Company | null = null;
      db.companies = db.companies.map((c) => {
        if (c.id === id) {
          updated = { ...c, ...patch };
          return updated;
        }
        return c;
      });
      if (!updated) throw new Error('Company not found.');
      writeDb(db);
      return updated;
    },
    async toggleActive(id: string): Promise<Company> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<Company>(`/companies/${id}/toggle`, { method: 'PUT' });
      }
      const db = readDb();
      let updated: Company | null = null;
      db.companies = db.companies.map((c) => {
        if (c.id === id) {
          updated = { ...c, active: !c.active };
          return updated;
        }
        return c;
      });
      if (!updated) throw new Error('Company not found.');
      writeDb(db);
      return updated;
    },
  },

  sections: {
    async create(input: Omit<Section, 'id'>): Promise<Section> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<Section>('/sections', { method: 'POST', body: JSON.stringify(input) });
      }
      const db = readDb();
      const created: Section = { ...input, id: makeId('sec') };
      db.sections = [...db.sections, created];
      writeDb(db);
      return created;
    },
  },

  models: {
    async create(input: Omit<EmployeeModel, 'id'>): Promise<EmployeeModel> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<EmployeeModel>('/employee-models', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: EmployeeModel = { ...input, id: makeId('model') };
      db.employeeModels = [...db.employeeModels, created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<EmployeeModel>): Promise<EmployeeModel> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<EmployeeModel>(`/employee-models/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
      const db = readDb();
      let updated: EmployeeModel | null = null;
      db.employeeModels = db.employeeModels.map((m) => {
        if (m.id === id) {
          updated = { ...m, ...patch };
          return updated;
        }
        return m;
      });
      if (!updated) throw new Error('Employee model not found.');
      writeDb(db);
      return updated;
    },
  },

  labels: {
    async create(input: Omit<EmployeeLabel, 'id'>): Promise<EmployeeLabel> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<EmployeeLabel>('/labels', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: EmployeeLabel = { ...input, id: makeId('lbl') };
      db.labels = [...(db.labels ?? []), created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<EmployeeLabel>): Promise<EmployeeLabel> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<EmployeeLabel>(`/labels/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
      const db = readDb();
      let updated: EmployeeLabel | null = null;
      db.labels = (db.labels ?? []).map((l) => {
        if (l.id === id) {
          updated = { ...l, ...patch };
          return updated;
        }
        return l;
      });
      if (!updated) throw new Error('Label not found.');
      writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/labels/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.labels = (db.labels ?? []).filter((l) => l.id !== id);
      db.employees = db.employees.map((e) => ({
        ...e,
        labelIds: (e.labelIds ?? []).filter((lid) => lid !== id),
      }));
      writeDb(db);
    },
  },

  proAssignments: {
    async create(input: Omit<ProAssignment, 'id' | 'createdAt'>): Promise<ProAssignment> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<ProAssignment>('/pro-assignments', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: ProAssignment = {
        ...input,
        id: makeId('pro-asg'),
        createdAt: new Date().toISOString(),
      };
      db.proAssignments = [created, ...(db.proAssignments ?? [])];
      writeDb(db);
      return created;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/pro-assignments/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.proAssignments = (db.proAssignments ?? []).filter((a) => a.id !== id);
      writeDb(db);
    },
  },

  employees: {
    async create(input: CreateEmployeePayload): Promise<Employee> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/users', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            employee_type: input.employeeType,
            deduction_workflow_override: input.deductionWorkflowOverride ?? 'inherit',
            mohre_person_id: input.mohrePersonId ?? null,
          }),
        });
        return normalizeEmployee(res);
      }
      const db = readDb();
      const { initialPassword, ...rest } = input;
      if (!initialPassword || initialPassword.trim().length < 6) {
        throw new Error('Initial temporary password must be at least 6 characters.');
      }
      const created: Employee = {
        ...rest,
        id: makeId('emp'),
        passwordHash: initialPassword.trim(),
        mustChangePassword: true,
      };
      db.employees = [...db.employees, created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: UpdateEmployeePayload): Promise<Employee> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const payload: Record<string, unknown> = { ...patch };
        if (patch.employeeType !== undefined) {
          payload.employee_type = patch.employeeType;
        }
        if (patch.deductionWorkflowOverride !== undefined) {
          payload.deduction_workflow_override = patch.deductionWorkflowOverride;
        }
        if (patch.mohrePersonId !== undefined) {
          payload.mohre_person_id = patch.mohrePersonId;
        }
        const res = await restFetch<unknown>(`/users/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        return normalizeEmployee(res);
      }
      const db = readDb();
      const { resetPassword, ...employeePatch } = patch;
      if (resetPassword !== undefined && resetPassword.trim().length < 6) {
        throw new Error('Temporary password must be at least 6 characters.');
      }
      let updated: Employee | null = null;
      db.employees = db.employees.map((e) => {
        if (e.id === id) {
          updated = {
            ...e,
            ...employeePatch,
            ...(resetPassword !== undefined
              ? {
                  passwordHash: resetPassword.trim(),
                  mustChangePassword: true,
                }
              : {}),
          };
          return updated;
        }
        return e;
      });
      if (!updated) throw new Error('Employee not found.');
      writeDb(db);
      return updated;
    },
    async updateOrg(id: string, payload: EmployeeOrgUpdatePayload): Promise<Employee> {
      const cfg = getServerConfig();
      const body = {
        workType: normalizeWorkType(payload.workType),
        groupIds: Array.isArray(payload.groupIds) ? payload.groupIds : [],
        projectIds: Array.isArray(payload.projectIds) ? payload.projectIds : [],
      };
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(`/users/${id}/org`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        return normalizeEmployee(res);
      }
      const db = readDb();
      let updated: Employee | null = null;
      db.employees = db.employees.map((e) => {
        if (e.id === id) {
          updated = {
            ...e,
            workType: body.workType,
            groupIds: body.groupIds,
            projectIds: body.projectIds,
          };
          return updated;
        }
        return e;
      });
      if (!updated) throw new Error('Employee not found.');
      writeDb(db);
      return updated;
    },
    async bulkUpsert(payload: {
      users: BulkImportUserRow[];
      defaultPassword?: string;
    }): Promise<BulkImportResult> {
      const cfg = getServerConfig();
      const trimmedDefaultPwd = payload.defaultPassword?.trim();
      if (!cfg.useMockApi) {
        const body: Record<string, unknown> = {
          users: payload.users,
        };
        if (trimmedDefaultPwd) {
          body.defaultPassword = trimmedDefaultPwd;
        }
        const res = await restFetch<unknown>('/users/bulk', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        return parseBulkImportResponse(res);
      }

      const db = readDb();
      let createdCount = 0;
      let updatedCount = 0;
      const errors: BulkImportRowError[] = [];

      const findExistingIndex = (row: BulkImportUserRow): number => {
        if (row.id) {
          const byId = db.employees.findIndex(
            (e) => e.id.trim().toLowerCase() === row.id!.trim().toLowerCase()
          );
          if (byId >= 0) return byId;
        }
        if (row.employeeCode) {
          const byCode = db.employees.findIndex(
            (e) => e.employeeCode.trim().toLowerCase() === row.employeeCode!.trim().toLowerCase()
          );
          if (byCode >= 0) return byCode;
        }
        return -1;
      };

      const defaultCompanyId = db.companies[0]?.id ?? 'comp-yaldi';
      const defaultSectionId = db.sections[0]?.id ?? 'sec-ops';
      const defaultModel = db.employeeModels[0];

      payload.users.forEach((row, index) => {
        const rowNumber = index + 2;
        const emailClean = row.email?.trim().toLowerCase();
        const existingIdx = findExistingIndex(row);

        const matchedCompany = resolveCompanyMatch(row.primaryCompanyId || row.company, db.companies);
        const matchedSection = resolveSectionMatch(row.sectionId || row.section, db.sections);

        if (existingIdx >= 0) {
          const existing = db.employees[existingIdx];
          if (emailClean) {
            const emailConflict = db.employees.find(
              (e) => e.id !== existing.id && e.email.trim().toLowerCase() === emailClean
            );
            if (emailConflict) {
              errors.push({
                rowNumber,
                employeeCode: row.employeeCode || existing.employeeCode,
                email: emailClean,
                fullName: row.fullName || existing.fullName,
                error: `Email ${emailClean} already belongs to ${emailConflict.fullName}.`,
              });
              return;
            }
          }

          if (row.initialPassword && row.initialPassword.trim().length < 6) {
            errors.push({
              rowNumber,
              employeeCode: row.employeeCode || existing.employeeCode,
              email: emailClean || existing.email,
              fullName: row.fullName || existing.fullName,
              error: 'Password must be at least 6 characters.',
            });
            return;
          }

          const nextRole = row.role ? normalizeUserRole(row.role) : existing.role;
          const nextEmpType = row.employeeType
            ? normalizeEmployeeTypeValue(row.employeeType) ?? existing.employeeType
            : existing.employeeType;

          const hasBankUpdate = Boolean(row.bankName || row.iban || row.bankRoutingCode);
          const updatedEmp: Employee = {
            ...existing,
            employeeCode: row.employeeCode?.trim() || existing.employeeCode,
            fullName: row.fullName?.trim() || existing.fullName,
            email: emailClean || existing.email,
            phone: row.phone?.trim() || existing.phone,
            role: nextRole,
            employeeType: nextEmpType,
            primaryCompanyId: matchedCompany?.id ?? existing.primaryCompanyId,
            sectionId: matchedSection?.id ?? existing.sectionId,
            jobTitle: row.jobTitle?.trim() || existing.jobTitle,
            joinDate: row.joinDate?.trim() || existing.joinDate,
            mohrePersonId: row.mohrePersonId?.trim() || existing.mohrePersonId,
            salary: {
              baseSalary:
                row.baseSalary !== undefined ? Number(row.baseSalary) : existing.salary.baseSalary,
              housingAllowance:
                row.housingAllowance !== undefined
                  ? Number(row.housingAllowance)
                  : existing.salary.housingAllowance,
              transportAllowance:
                row.transportAllowance !== undefined
                  ? Number(row.transportAllowance)
                  : existing.salary.transportAllowance,
              otherAllowance:
                row.otherAllowance !== undefined
                  ? Number(row.otherAllowance)
                  : existing.salary.otherAllowance,
            },
            bankDetails: hasBankUpdate
              ? {
                  bankName: row.bankName?.trim() || existing.bankDetails?.bankName || '',
                  accountNumber: existing.bankDetails?.accountNumber || '',
                  iban: row.iban?.trim() || existing.bankDetails?.iban || '',
                  bankRoutingCode:
                    row.bankRoutingCode?.trim() || existing.bankDetails?.bankRoutingCode || '',
                }
              : existing.bankDetails,
            ...(row.initialPassword && row.initialPassword.trim().length >= 6
              ? {
                  passwordHash: row.initialPassword.trim(),
                  mustChangePassword: true,
                }
              : {}),
          };

          db.employees[existingIdx] = updatedEmp;
          updatedCount += 1;
        } else {
          // Create new employee
          const fullName = row.fullName?.trim();
          const effectivePwd = (row.initialPassword?.trim() || trimmedDefaultPwd || '').trim();

          if (!fullName || !emailClean) {
            errors.push({
              rowNumber,
              employeeCode: row.employeeCode,
              email: emailClean,
              fullName,
              error: 'Full name and email are required for new employees.',
            });
            return;
          }

          if (effectivePwd.length < 6) {
            errors.push({
              rowNumber,
              employeeCode: row.employeeCode,
              email: emailClean,
              fullName,
              error: 'Temporary password must be at least 6 characters.',
            });
            return;
          }

          const emailConflict = db.employees.find(
            (e) => e.email.trim().toLowerCase() === emailClean
          );
          if (emailConflict) {
            errors.push({
              rowNumber,
              employeeCode: row.employeeCode,
              email: emailClean,
              fullName,
              error: `Email ${emailClean} is already registered to ${emailConflict.fullName}.`,
            });
            return;
          }

          const resolvedRole = row.role ? normalizeUserRole(row.role) : UserRole.Employee;
          const resolvedSectionId = matchedSection?.id ?? defaultSectionId;
          const resolvedEmpType =
            normalizeEmployeeTypeValue(row.employeeType) ??
            inferDefaultEmployeeType({ role: resolvedRole, sectionId: resolvedSectionId });

          const generatedCode =
            row.employeeCode?.trim() ||
            `EMP-${String(db.employees.length + 101).padStart(3, '0')}`;

          const created: Employee = {
            id: makeId('emp'),
            employeeCode: generatedCode,
            fullName,
            email: emailClean,
            phone: row.phone?.trim() || '',
            passwordHash: effectivePwd,
            mustChangePassword: true,
            role: resolvedRole,
            employeeType: resolvedEmpType,
            deductionWorkflowOverride: 'inherit',
            primaryCompanyId: matchedCompany?.id ?? defaultCompanyId,
            sharedCompanyIds: [],
            sectionId: resolvedSectionId,
            managedSectionIds:
              resolvedRole === UserRole.SectionManager ||
              resolvedRole === UserRole.SectionCoManager
                ? [resolvedSectionId]
                : [],
            labelIds: [],
            modelId: defaultModel?.id ?? 'model-office',
            jobTitle: row.jobTitle?.trim() || 'Employee',
            joinDate: row.joinDate?.trim() || new Date().toISOString().slice(0, 10),
            active: true,
            assignedZoneIds: [],
            clockInPolicyOverride: 'inherit',
            salary: {
              baseSalary: Number(row.baseSalary ?? 0),
              housingAllowance: Number(row.housingAllowance ?? 0),
              transportAllowance: Number(row.transportAllowance ?? 0),
              otherAllowance: Number(row.otherAllowance ?? 0),
            },
            mohrePersonId: row.mohrePersonId?.trim() || undefined,
            bankDetails:
              row.bankName || row.iban || row.bankRoutingCode
                ? {
                    bankName: row.bankName?.trim() || '',
                    accountNumber: '',
                    iban: row.iban?.trim() || '',
                    bankRoutingCode: row.bankRoutingCode?.trim() || '',
                  }
                : undefined,
            leaveBalance: {
              annualTotal: defaultModel?.leaveQuotas.annualTotal ?? 30,
              annualUsed: 0,
              sickTotal: defaultModel?.leaveQuotas.sickTotal ?? 15,
              sickUsed: 0,
              emergencyTotal: defaultModel?.leaveQuotas.emergencyTotal ?? 5,
              emergencyUsed: 0,
              unpaidUsed: 0,
            },
          };

          db.employees = [...db.employees, created];
          createdCount += 1;
        }
      });

      writeDb(db);
      return {
        createdCount,
        updatedCount,
        failedCount: errors.length,
        errors,
      };
    },
    async bulkAssignZones(params: {
      companyId: string | 'all';
      sectionId: string | 'all';
      zoneIds: string[];
      replaceExisting: boolean;
    }): Promise<number> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<{ updatedCount: number }>('/users/bulk-assign-zones', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        return res.updatedCount;
      }
      const db = readDb();
      let count = 0;
      db.employees = db.employees.map((e) => {
        if (!isAttendanceTracked(e)) return e;
        if (
          params.companyId !== 'all' &&
          e.primaryCompanyId !== params.companyId &&
          !e.sharedCompanyIds.includes(params.companyId)
        ) {
          return e;
        }
        if (params.sectionId !== 'all' && e.sectionId !== params.sectionId) {
          return e;
        }
        count += 1;
        const nextZones = params.replaceExisting
          ? [...params.zoneIds]
          : Array.from(new Set([...e.assignedZoneIds, ...params.zoneIds]));
        return { ...e, assignedZoneIds: nextZones };
      });
      writeDb(db);
      return count;
    },
    async proposeShift(
      employeeId: string,
      schedule: ShiftSchedule,
      proposedBy: string
    ): Promise<Employee> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<Employee>(`/users/${employeeId}/shift-proposal`, {
          method: 'POST',
          body: JSON.stringify({ ...schedule, proposedBy }),
        });
      }
      const db = readDb();
      let updated: Employee | null = null;
      db.employees = db.employees.map((e) => {
        if (e.id === employeeId) {
          updated = {
            ...e,
            pendingShiftProposal: {
              ...schedule,
              proposedBy,
              proposedAt: new Date().toISOString(),
              status: 'pending_manager_approval',
            },
          };
          return updated;
        }
        return e;
      });
      if (!updated) throw new Error('Employee not found.');
      writeDb(db);
      return updated;
    },
    async decideShiftProposal(employeeId: string, approve: boolean): Promise<Employee> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<Employee>(`/users/${employeeId}/shift-proposal`, {
          method: 'PUT',
          body: JSON.stringify({ approve }),
        });
      }
      const db = readDb();
      let updated: Employee | null = null;
      db.employees = db.employees.map((e) => {
        if (e.id === employeeId && e.pendingShiftProposal) {
          updated = {
            ...e,
            customShift: approve
              ? {
                  shiftStart: e.pendingShiftProposal.shiftStart,
                  shiftEnd: e.pendingShiftProposal.shiftEnd,
                  workingDays: e.pendingShiftProposal.workingDays,
                }
              : e.customShift,
            pendingShiftProposal: null,
          };
          return updated;
        }
        return e;
      });
      if (!updated) throw new Error('Shift proposal not found.');
      writeDb(db);
      return updated;
    },
  },

  geofences: {
    async create(input: Omit<GeofenceZone, 'id'>): Promise<GeofenceZone> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<GeofenceZone>('/locations', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: GeofenceZone = { ...input, id: makeId('zone') };
      db.geofences = [...db.geofences, created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<GeofenceZone>): Promise<GeofenceZone> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<GeofenceZone>(`/locations/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
      const db = readDb();
      let updated: GeofenceZone | null = null;
      db.geofences = db.geofences.map((z) => {
        if (z.id === id) {
          updated = { ...z, ...patch };
          return updated;
        }
        return z;
      });
      if (!updated) throw new Error('Geofence not found.');
      writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/locations/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.geofences = db.geofences.filter((z) => z.id !== id);
      db.employees = db.employees.map((e) => ({
        ...e,
        assignedZoneIds: e.assignedZoneIds.filter((zid) => zid !== id),
      }));
      writeDb(db);
    },
  },

  documents: {
    async upload(input: Omit<EmployeeDocument, 'id' | 'uploadedAt'>): Promise<EmployeeDocument> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<EmployeeDocument>('/documents', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: EmployeeDocument = {
        ...input,
        id: makeId('doc'),
        uploadedAt: new Date().toISOString().slice(0, 10),
      };
      db.documents = [created, ...db.documents];
      writeDb(db);
      return created;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/documents/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.documents = db.documents.filter((d) => d.id !== id);
      writeDb(db);
    },
  },

  attendance: {
    async clockIn(params: {
      employeeId: string;
      companyId: string;
      zoneId: string;
      zoneName: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      punchSource: PunchSource;
      simulateLateMinutes?: number;
    }): Promise<AttendanceLog> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<AttendanceLog>('/attendance/clock-in', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      const emp = db.employees.find((e) => e.id === params.employeeId);
      const model = db.employeeModels.find((m) => m.id === emp?.modelId) ?? db.employeeModels[0];

      const now = new Date();
      let clockInIso = now.toISOString();
      if (params.simulateLateMinutes && params.simulateLateMinutes > 0 && emp && model) {
        const shiftStart = getEffectiveShiftStart(emp, model);
        const [sh, sm] = shiftStart.split(':').map(Number);
        const simulated = new Date();
        simulated.setHours(sh, sm + params.simulateLateMinutes, 0, 0);
        clockInIso = simulated.toISOString();
      }

      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
        now.getDate()
      ).padStart(2, '0')}`;

      const shiftStart = emp && model ? getEffectiveShiftStart(emp, model) : '08:00';
      const lateEval = model
        ? evaluateModelLateness({ clockInIso, shiftStartHHmm: shiftStart, model })
        : { isLate: false, lateMinutes: 0, penaltyAED: 0 };

      const created: AttendanceLog = {
        id: makeId('att'),
        employeeId: params.employeeId,
        companyId: params.companyId,
        date: today,
        clockInTime: clockInIso,
        clockOutTime: null,
        zoneId: params.zoneId,
        zoneName: params.zoneName,
        clockInLat: params.latitude,
        clockInLng: params.longitude,
        accuracyMeters: params.accuracyMeters,
        punchSource: params.punchSource,
        isLate: lateEval.isLate,
        lateMinutes: lateEval.lateMinutes,
        latenessPenaltyAED: lateEval.penaltyAED,
        latenessExcused: false,
      };
      db.attendance = [created, ...db.attendance];
      writeDb(db);
      return created;
    },

    async clockOut(params: {
      logId: string;
      latitude: number;
      longitude: number;
    }): Promise<AttendanceLog> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<AttendanceLog>(`/attendance/${params.logId}/clock-out`, {
          method: 'PUT',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      let updated: AttendanceLog | null = null;
      db.attendance = db.attendance.map((l) => {
        if (l.id === params.logId) {
          updated = {
            ...l,
            clockOutTime: new Date().toISOString(),
            clockOutLat: params.latitude,
            clockOutLng: params.longitude,
          };
          return updated;
        }
        return l;
      });
      if (!updated) throw new Error('Attendance record not found.');
      writeDb(db);
      return updated;
    },

    /**
     * Section Manager / Main Manager accepts a lateness excuse immediately (no secondary approval),
     * waiving the tiered AED penalty and logging an entry in attendance_audit.
     */
    async acceptLatenessExcuse(params: {
      logId: string;
      actorName: string;
      actorRole: UserRole;
      excuseNote: string;
    }): Promise<AttendanceLog> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<AttendanceLog>(`/attendance/${params.logId}/excuse`, {
          method: 'PUT',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      let updated: AttendanceLog | null = null;
      let prevPenalty = 0;
      db.attendance = db.attendance.map((l) => {
        if (l.id === params.logId) {
          prevPenalty = l.latenessPenaltyAED;
          updated = {
            ...l,
            latenessExcused: true,
            excuseNote: params.excuseNote.trim() || 'Lateness excuse accepted.',
            excusedBy: params.actorName,
          };
          return updated;
        }
        return l;
      });
      if (!updated) throw new Error('Attendance record not found.');

      const auditEntry: AttendanceAuditEntry = {
        id: makeId('aud'),
        attendanceLogId: params.logId,
        employeeId: (updated as AttendanceLog).employeeId,
        action: 'excuse_accepted',
        actorName: params.actorName,
        actorRole: params.actorRole,
        summary: `Accepted lateness excuse (${params.excuseNote.trim() || 'Excused'}). Waived AED ${prevPenalty}.`,
        previousValue: `Penalty: AED ${prevPenalty}`,
        newValue: 'Excused (AED 0)',
        timestamp: new Date().toISOString(),
      };
      db.attendanceAudit = [auditEntry, ...db.attendanceAudit];
      writeDb(db);
      return updated;
    },

    /**
     * Section Manager / Main Manager immediately modifies clock-in/clock-out times,
     * recalculates lateness penalty, and records an immutable audit entry.
     */
    async modifyRecord(params: {
      logId: string;
      clockInHHmm: string;
      clockOutHHmm: string | null;
      reason: string;
      actorName: string;
      actorRole: UserRole;
    }): Promise<AttendanceLog> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<AttendanceLog>(`/attendance/${params.logId}`, {
          method: 'PUT',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      let updated: AttendanceLog | null = null;
      let previousSummary = '';
      let newSummary = '';

      db.attendance = db.attendance.map((l) => {
        if (l.id !== params.logId) return l;
        const emp = db.employees.find((e) => e.id === l.employeeId);
        const model = db.employeeModels.find((m) => m.id === emp?.modelId) ?? db.employeeModels[0];

        const [y, m, d] = l.date.split('-').map(Number);
        const [inH, inM] = params.clockInHHmm.split(':').map(Number);
        const nextIn = new Date(y, m - 1, d, inH || 0, inM || 0, 0).toISOString();

        let nextOut: string | null = null;
        if (params.clockOutHHmm && params.clockOutHHmm.includes(':')) {
          const [outH, outM] = params.clockOutHHmm.split(':').map(Number);
          nextOut = new Date(y, m - 1, d, outH || 0, outM || 0, 0).toISOString();
        }

        const shiftStart = emp && model ? getEffectiveShiftStart(emp, model) : '08:00';
        const lateEval = model
          ? evaluateModelLateness({ clockInIso: nextIn, shiftStartHHmm: shiftStart, model })
          : { isLate: false, lateMinutes: 0, penaltyAED: 0 };

        const oldInStr = new Date(l.clockInTime).toTimeString().slice(0, 5);
        const oldOutStr = l.clockOutTime ? new Date(l.clockOutTime).toTimeString().slice(0, 5) : 'Missing';
        previousSummary = `In ${oldInStr} / Out ${oldOutStr}`;
        newSummary = `In ${params.clockInHHmm} / Out ${params.clockOutHHmm || 'Missing'}`;

        updated = {
          ...l,
          clockInTime: nextIn,
          clockOutTime: nextOut,
          isLate: lateEval.isLate,
          lateMinutes: lateEval.lateMinutes,
          latenessPenaltyAED: lateEval.penaltyAED,
          latenessExcused: lateEval.isLate ? l.latenessExcused : false,
          modifiedBy: params.actorName,
          notes: params.reason.trim() || l.notes,
        };
        return updated;
      });
      if (!updated) throw new Error('Attendance log not found.');

      const auditEntry: AttendanceAuditEntry = {
        id: makeId('aud'),
        attendanceLogId: params.logId,
        employeeId: (updated as AttendanceLog).employeeId,
        action: 'punch_modified',
        actorName: params.actorName,
        actorRole: params.actorRole,
        summary: params.reason.trim() || 'Modified attendance punch times.',
        previousValue: previousSummary,
        newValue: newSummary,
        timestamp: new Date().toISOString(),
      };
      db.attendanceAudit = [auditEntry, ...db.attendanceAudit];
      writeDb(db);
      return updated;
    },
  },

  leaves: {
    async submit(input: {
      employeeId: string;
      companyId: string;
      sectionId: string;
      applicantRole: UserRole;
      type: LeaveRequest['type'];
      startDate: string;
      endDate: string;
      days: number;
      reason: string;
      attachmentName?: string;
      attachmentDataUrl?: string;
    }): Promise<LeaveRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<LeaveRequest>('/leaves', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const wf = resolveApprovalWorkflow(db.workflows, input.companyId, input.sectionId);
      const chain = buildLeaveApprovalChain({
        applicantRole: input.applicantRole,
        days: input.days,
        workflow: wf,
      });

      const created: LeaveRequest = {
        id: makeId('lv'),
        employeeId: input.employeeId,
        companyId: input.companyId,
        sectionId: input.sectionId,
        type: input.type,
        startDate: input.startDate,
        endDate: input.endDate,
        days: input.days,
        reason: input.reason,
        attachmentName: input.attachmentName,
        attachmentDataUrl: input.attachmentDataUrl,
        status: chain.initialStatus,
        submittedAt: new Date().toISOString(),
        approvalSteps: chain.steps,
        currentStepIndex: chain.currentStepIndex,
        coManagerNotes: [],
      };
      db.leaves = [created, ...db.leaves];

      // Auto-deduct immediately if auto-approved by workflow policy
      if (created.status === LeaveStatus.Approved) {
        db.employees = db.employees.map((e) =>
          e.id === created.employeeId
            ? { ...e, leaveBalance: adjustLeaveBalance(e.leaveBalance, created.type, created.days) }
            : e
        );
      }
      writeDb(db);
      return created;
    },

    async decideStep(params: {
      leaveId: string;
      decision: 'approved' | 'rejected';
      actorName: string;
      remark: string;
    }): Promise<LeaveRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<LeaveRequest>(`/leaves/${params.leaveId}/decision`, {
          method: 'PUT',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      const target = db.leaves.find((l) => l.id === params.leaveId);
      if (!target) throw new Error('Leave request not found.');

      const prevStatus = target.status;
      const next = advanceLeaveApproval({
        leave: target,
        decision: params.decision,
        actorName: params.actorName,
        remark: params.remark,
      });

      db.leaves = db.leaves.map((l) => (l.id === params.leaveId ? next : l));

      if (prevStatus !== LeaveStatus.Approved && next.status === LeaveStatus.Approved) {
        db.employees = db.employees.map((e) =>
          e.id === next.employeeId
            ? { ...e, leaveBalance: adjustLeaveBalance(e.leaveBalance, next.type, next.days) }
            : e
        );
      }
      writeDb(db);
      return next;
    },

    async addCoManagerNote(params: {
      leaveId: string;
      authorName: string;
      note: string;
    }): Promise<LeaveRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<LeaveRequest>(`/leaves/${params.leaveId}/notes`, {
          method: 'POST',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      let updated: LeaveRequest | null = null;
      db.leaves = db.leaves.map((l) => {
        if (l.id !== params.leaveId) return l;
        updated = {
          ...l,
          coManagerNotes: [
            ...l.coManagerNotes,
            {
              id: makeId('cmn'),
              authorName: params.authorName,
              note: params.note.trim(),
              createdAt: new Date().toISOString(),
            },
          ],
        };
        return updated;
      });
      if (!updated) throw new Error('Leave request not found.');
      writeDb(db);
      return updated;
    },
  },

  workflows: {
    async save(workflow: Omit<ApprovalWorkflow, 'id'> & { id?: string }): Promise<ApprovalWorkflow> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<ApprovalWorkflow>('/approval-workflows', {
          method: workflow.id ? 'PUT' : 'POST',
          body: JSON.stringify(workflow),
        });
      }
      const db = readDb();
      if (workflow.id) {
        const updated: ApprovalWorkflow = { ...workflow, id: workflow.id };
        db.workflows = db.workflows.map((w) => (w.id === workflow.id ? updated : w));
        writeDb(db);
        return updated;
      }
      const created: ApprovalWorkflow = { ...workflow, id: makeId('wf') };
      db.workflows = [...db.workflows, created];
      writeDb(db);
      return created;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/approval-workflows/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.workflows = db.workflows.filter((w) => w.id !== id);
      writeDb(db);
    },
  },

  payroll: {
    async addAdjustment(
      input: Omit<PayrollAdjustment, 'id' | 'createdAt'>
    ): Promise<PayrollAdjustment> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<PayrollAdjustment>('/payroll/deductions', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: PayrollAdjustment = {
        ...input,
        id: makeId('adj'),
        source: 'manual',
        createdAt: new Date().toISOString(),
      };
      db.payrollAdjustments = [created, ...db.payrollAdjustments];
      writeDb(db);
      return created;
    },
    async removeAdjustment(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/payroll/deductions/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.payrollAdjustments = db.payrollAdjustments.filter((a) => a.id !== id);
      writeDb(db);
    },
    async upsertReleaseSchedule(input: {
      month: string;
      payPeriod: string;
      scopeType: 'section' | 'employee';
      scopeId: string;
      companyId: string | 'all';
      projectId?: string;
      employeeIds?: string[];
      approvalRunId?: string;
      releaseDate: string;
      status: SalaryReleaseStatus;
      delayedUntilDate?: string | null;
      delayReason?: string | null;
      updatedBy: string;
    }): Promise<SalaryReleaseSchedule> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<SalaryReleaseSchedule>('/payroll/releases', {
          method: 'PUT',
          body: JSON.stringify({
            ...input,
            project_id: input.projectId ?? null,
            employee_ids: input.employeeIds ?? null,
            approval_run_id: input.approvalRunId ?? null,
          }),
        });
      }
      const db = readDb();
      const list = db.salaryReleases ?? [];
      const existingIdx = list.findIndex(
        (s) =>
          s.month === input.month &&
          s.scopeType === input.scopeType &&
          s.scopeId === input.scopeId &&
          s.companyId === input.companyId &&
          (s.projectId ?? '') === (input.projectId ?? '')
      );
      const record: SalaryReleaseSchedule = {
        id: existingIdx >= 0 ? list[existingIdx].id : makeId('rel'),
        ...input,
        projectId: input.projectId,
        employeeIds: input.employeeIds,
        approvalRunId: input.approvalRunId,
        delayedUntilDate: input.status === 'Delayed' ? input.delayedUntilDate ?? null : null,
        delayReason: input.status === 'Delayed' ? input.delayReason ?? null : null,
        updatedAt: new Date().toISOString(),
      };
      if (existingIdx >= 0) {
        db.salaryReleases = list.map((s, i) => (i === existingIdx ? record : s));
      } else {
        db.salaryReleases = [record, ...list];
      }
      writeDb(db);
      return record;
    },
  },

  payrollCategories: {
    async create(input: Omit<PayrollCategoryItem, 'id'>): Promise<PayrollCategoryItem> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/payroll/categories', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return normalizePayrollCategory(res);
      }
      const db = readDb();
      const created: PayrollCategoryItem = { ...input, id: makeId('pcat') };
      db.payrollCategories = [...(db.payrollCategories ?? []), created];
      writeDb(db);
      return created;
    },
    async update(
      id: string,
      patch: Partial<PayrollCategoryItem>
    ): Promise<PayrollCategoryItem> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(`/payroll/categories/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        return normalizePayrollCategory(res);
      }
      const db = readDb();
      let updated: PayrollCategoryItem | null = null;
      db.payrollCategories = (db.payrollCategories ?? []).map((cat) => {
        if (cat.id === id) {
          updated = { ...cat, ...patch };
          return updated;
        }
        return cat;
      });
      if (!updated) throw new Error('Payroll category not found.');
      writeDb(db);
      return updated;
    },
  },

  payrollEntries: {
    async create(input: {
      employeeId: string;
      companyId: string;
      type: PayrollEntryType;
      categoryId: string;
      categoryName: string;
      amountAED: number;
      isPermanent: boolean;
      effectiveFrom: string;
      durationMonths: number | null;
      targetBucket?: DeductionTargetBucket | null;
      reason: string;
      createdBy: string;
      createdByRole: UserRole;
    }): Promise<PayrollEntry> {
      const isEarning =
        input.type === 'earning_in_payroll' || input.type === 'earning_off_cycle';
      const isPermanent = isEarning && Boolean(input.isPermanent);
      const durationMonths = isPermanent ? null : Math.max(1, Math.floor(input.durationMonths ?? 1));
      const effectiveTo = isPermanent
        ? null
        : computeTemporaryEndMonth(input.effectiveFrom, durationMonths ?? 1);
      const targetBucket = isEarning ? null : input.targetBucket ?? 'main_salary';

      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/payroll/entries', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            isPermanent,
            durationMonths,
            effectiveTo,
            targetBucket,
            employee_id: input.employeeId,
            company_id: input.companyId,
            category_id: input.categoryId,
            category_name: input.categoryName,
            amount_aed: input.amountAED,
            is_permanent: isPermanent,
            effective_from: input.effectiveFrom,
            effective_to: effectiveTo,
            duration_months: durationMonths,
            target_bucket: targetBucket,
            created_by: input.createdBy,
            created_by_role: input.createdByRole,
          }),
        });
        return normalizePayrollEntry(res);
      }

      const db = readDb();
      const created: PayrollEntry = {
        id: makeId('pe'),
        employeeId: input.employeeId,
        companyId: input.companyId,
        type: input.type,
        categoryId: input.categoryId,
        categoryName: input.categoryName,
        amountAED: Number(input.amountAED),
        isPermanent,
        effectiveFrom: input.effectiveFrom,
        effectiveTo,
        durationMonths,
        targetBucket,
        reason: input.reason.trim(),
        createdBy: input.createdBy,
        createdByRole: input.createdByRole,
        createdAt: new Date().toISOString(),
      };
      db.payrollEntries = [created, ...(db.payrollEntries ?? [])];
      writeDb(db);
      return created;
    },

    async editPermanent(params: {
      id: string;
      effectiveFromMonth: string;
      patch: {
        categoryId?: string;
        categoryName?: string;
        amountAED?: number;
        reason?: string;
      };
    }): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<unknown>(`/payroll/entries/${params.id}/edit-permanent`, {
          method: 'PUT',
          body: JSON.stringify({
            ...params,
            effective_from_month: params.effectiveFromMonth,
          }),
        });
        return;
      }
      const db = readDb();
      db.payrollEntries = editPermanentPayrollEntry({
        entries: db.payrollEntries ?? [],
        entryId: params.id,
        effectiveFromMonth: params.effectiveFromMonth,
        patch: params.patch,
        newEntryId: makeId('pe'),
      });
      writeDb(db);
    },

    async stopPermanent(params: { id: string; stopFromMonth: string }): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<unknown>(`/payroll/entries/${params.id}/stop-permanent`, {
          method: 'PUT',
          body: JSON.stringify({
            ...params,
            stop_from_month: params.stopFromMonth,
          }),
        });
        return;
      }
      const db = readDb();
      db.payrollEntries = stopPermanentPayrollEntry({
        entries: db.payrollEntries ?? [],
        entryId: params.id,
        stopFromMonth: params.stopFromMonth,
      });
      writeDb(db);
    },

    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/payroll/entries/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.payrollEntries = (db.payrollEntries ?? []).filter((e) => e.id !== id);
      writeDb(db);
    },
  },

  deductionApprovals: {
    async create(input: {
      employeeId: string;
      month: string;
      triggerType: DeductionApprovalTrigger;
      date: string;
      amountAED: number;
      targetBucket: DeductionTargetBucket;
      reason: string;
      createdBy: string;
      createdByRole: UserRole;
    }): Promise<DeductionApprovalRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/payroll/deduction-approvals', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            employee_id: input.employeeId,
            payroll_month: input.month,
            trigger_type: input.triggerType,
            amount_aed: input.amountAED,
            target_bucket: input.targetBucket,
            created_by: input.createdBy,
            created_by_role: input.createdByRole,
          }),
        });
        return normalizeDeductionApproval(res);
      }
      const db = readDb();
      const emp = db.employees.find((e) => e.id === input.employeeId);
      if (!emp) throw new Error('Employee not found.');
      const created = buildNewDeductionApprovalRequest({
        id: makeId('da'),
        employee: emp,
        month: input.month,
        triggerType: input.triggerType,
        date: input.date,
        amountAED: input.amountAED,
        targetBucket: input.targetBucket,
        reason: input.reason,
        createdBy: input.createdBy,
        createdByRole: input.createdByRole,
        workflowConfig: db.settings.deductionWorkflowConfig ?? DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
      });
      db.deductionApprovals = [created, ...(db.deductionApprovals ?? [])];
      writeDb(db);
      return created;
    },

    async managerDecide(params: {
      id: string;
      decision: 'approved' | 'rejected';
      actorName: string;
      note: string;
    }): Promise<DeductionApprovalRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(
          `/payroll/deduction-approvals/${params.id}/manager-decision`,
          {
            method: 'PUT',
            body: JSON.stringify({
              ...params,
              actor_name: params.actorName,
            }),
          }
        );
        return normalizeDeductionApproval(res);
      }
      const db = readDb();
      const target = (db.deductionApprovals ?? []).find((r) => r.id === params.id);
      if (!target) throw new Error('Deduction approval request not found.');
      const updated = applyManagerDeductionDecision({
        request: target,
        decision: params.decision,
        actorName: params.actorName,
        note: params.note,
      });
      db.deductionApprovals = (db.deductionApprovals ?? []).map((r) =>
        r.id === params.id ? updated : r
      );
      writeDb(db);
      return updated;
    },

    async hrDecide(params: {
      id: string;
      decision: 'approved' | 'waived';
      actorName: string;
      note: string;
    }): Promise<DeductionApprovalRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(
          `/payroll/deduction-approvals/${params.id}/hr-decision`,
          {
            method: 'PUT',
            body: JSON.stringify({
              ...params,
              actor_name: params.actorName,
            }),
          }
        );
        return normalizeDeductionApproval(res);
      }
      const db = readDb();
      const target = (db.deductionApprovals ?? []).find((r) => r.id === params.id);
      if (!target) throw new Error('Deduction approval request not found.');
      const updated = applyHrDeductionDecision({
        request: target,
        decision: params.decision,
        actorName: params.actorName,
        note: params.note,
      });
      db.deductionApprovals = (db.deductionApprovals ?? []).map((r) =>
        r.id === params.id ? updated : r
      );
      writeDb(db);
      return updated;
    },
  },

  patchReleases: {
    async create(input: {
      employeeId: string;
      companyId: string;
      totalAmountAED: number;
      allocations: PatchReleaseAllocation[];
      paymentMethod: PatchPaymentMethod;
      releaseDate: string;
      releasedBy: string;
      releasedByRole: UserRole;
      referenceNote?: string;
    }): Promise<PatchMoneyRelease> {
      const check = validatePatchReleaseAllocations(input.totalAmountAED, input.allocations);
      if (!check.valid) {
        throw new Error(check.error || 'Invalid split-bucket allocation.');
      }
      const cleanedAllocations = input.allocations
        .filter((a) => Number(a.amountAED) > 0)
        .map((a) => ({
          month: a.month,
          bucket: a.bucket,
          amountAED: Number(Number(a.amountAED).toFixed(2)),
        }));

      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/payroll/patch-releases', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            allocations: cleanedAllocations,
            employee_id: input.employeeId,
            company_id: input.companyId,
            total_amount_aed: Number(Number(input.totalAmountAED).toFixed(2)),
            payment_method: input.paymentMethod,
            release_date: input.releaseDate,
            released_by: input.releasedBy,
            released_by_role: input.releasedByRole,
            reference_note: input.referenceNote?.trim() || null,
          }),
        });
        return normalizePatchRelease(res);
      }
      const db = readDb();
      const created: PatchMoneyRelease = {
        id: makeId('pr'),
        employeeId: input.employeeId,
        companyId: input.companyId,
        totalAmountAED: Number(Number(input.totalAmountAED).toFixed(2)),
        allocations: cleanedAllocations,
        paymentMethod: input.paymentMethod,
        releaseDate: input.releaseDate,
        releasedBy: input.releasedBy,
        releasedByRole: input.releasedByRole,
        referenceNote: input.referenceNote?.trim() || undefined,
        createdAt: new Date().toISOString(),
      };
      db.patchReleases = [created, ...(db.patchReleases ?? [])];
      writeDb(db);
      return created;
    },

    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/payroll/patch-releases/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.patchReleases = (db.patchReleases ?? []).filter((r) => r.id !== id);
      writeDb(db);
    },
  },

  settings: {
    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<Record<string, unknown>>('/settings', {
          method: 'PUT',
          body: JSON.stringify({
            ...patch,
            deduction_workflow_config: patch.deductionWorkflowConfig,
            quick_actions: patch.quickActions,
          }),
        });
        const rawQa = res.quickActions ?? res.quick_actions ?? patch.quickActions;
        return {
          ...createDefaultLiveSettings(cfg.apiBaseUrl),
          ...(res as Partial<AppSettings>),
          apiBaseUrl: cfg.apiBaseUrl,
          deductionWorkflowConfig: normalizeDeductionWorkflowConfig(
            res.deductionWorkflowConfig ??
              res.deduction_workflow_config ??
              patch.deductionWorkflowConfig
          ),
          quickActions: Array.isArray(rawQa) ? rawQa.map(normalizeQuickActionConfigItem) : undefined,
        };
      }
      const db = readDb();
      db.settings = { ...db.settings, ...patch };
      writeDb(db);
      return db.settings;
    },
  },

  groups: {
    async list(): Promise<EmployeeGroup[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown[]>('/groups');
        return Array.isArray(res) ? res.map(normalizeEmployeeGroup) : [];
      }
      const db = readDb();
      return db.groups ?? [];
    },
    async create(input: Omit<EmployeeGroup, 'id' | 'createdAt'>): Promise<EmployeeGroup> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/groups', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        return normalizeEmployeeGroup(res);
      }
      const db = readDb();
      const created: EmployeeGroup = {
        id: makeId('grp'),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        color: input.color || '#0D9488',
        createdAt: new Date().toISOString(),
      };
      db.groups = [...(db.groups ?? []), created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<Omit<EmployeeGroup, 'id'>>): Promise<EmployeeGroup> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(`/groups/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
        return normalizeEmployeeGroup(res);
      }
      const db = readDb();
      let updated: EmployeeGroup | null = null;
      db.groups = (db.groups ?? []).map((g) => {
        if (g.id === id) {
          updated = { ...g, ...patch };
          return updated;
        }
        return g;
      });
      if (!updated) throw new Error('Group not found.');
      writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/groups/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.groups = (db.groups ?? []).filter((g) => g.id !== id);
      db.employees = db.employees.map((e) => ({
        ...e,
        groupIds: (e.groupIds ?? []).filter((gid) => gid !== id),
      }));
      db.visibilityRules = (db.visibilityRules ?? []).map((r) =>
        r.targetType === 'group'
          ? { ...r, targetIds: (r.targetIds ?? []).filter((tid) => tid !== id) }
          : r
      );
      writeDb(db);
    },
  },

  projects: {
    async list(): Promise<Project[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown[]>('/projects');
        return Array.isArray(res) ? res.map(normalizeProject) : [];
      }
      const db = readDb();
      return db.projects ?? [];
    },
    async create(input: Omit<Project, 'id' | 'createdAt'>): Promise<Project> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/projects', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            company_id: input.companyId,
            manager_id: input.managerId ?? null,
            supervisor_ids: input.supervisorIds ?? [],
          }),
        });
        return normalizeProject(res);
      }
      const db = readDb();
      const created: Project = {
        id: makeId('proj'),
        code: input.code.trim().toUpperCase(),
        name: input.name.trim(),
        companyId: input.companyId,
        managerId: input.managerId ?? null,
        supervisorIds: Array.isArray(input.supervisorIds) ? input.supervisorIds : [],
        description: input.description?.trim() || undefined,
        active: input.active ?? true,
        createdAt: new Date().toISOString(),
      };
      db.projects = [...(db.projects ?? []), created];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<Omit<Project, 'id'>>): Promise<Project> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const payload: Record<string, unknown> = { ...patch };
        if (patch.companyId !== undefined) payload.company_id = patch.companyId;
        if (patch.managerId !== undefined) payload.manager_id = patch.managerId;
        if (patch.supervisorIds !== undefined) payload.supervisor_ids = patch.supervisorIds;
        const res = await restFetch<unknown>(`/projects/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        return normalizeProject(res);
      }
      const db = readDb();
      let updated: Project | null = null;
      db.projects = (db.projects ?? []).map((p) => {
        if (p.id === id) {
          updated = { ...p, ...patch };
          return updated;
        }
        return p;
      });
      if (!updated) throw new Error('Project not found.');
      writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/projects/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.projects = (db.projects ?? []).filter((p) => p.id !== id);
      db.employees = db.employees.map((e) => ({
        ...e,
        projectIds: (e.projectIds ?? []).filter((pid) => pid !== id),
      }));
      writeDb(db);
    },
  },

  visibilityRules: {
    async list(): Promise<VisibilityRule[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown[]>('/visibility-rules');
        return Array.isArray(res) ? res.map(normalizeVisibilityRule) : [];
      }
      const db = readDb();
      return db.visibilityRules ?? [];
    },
    async getMe(): Promise<HiddenSectionKey[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/visibility-rules/me');
        return normalizeMyHiddenSections(res);
      }
      const db = readDb();
      const session = getStoredSession();
      if (!session) return [];
      const emp = db.employees.find((e) => e.id === session.userId);
      if (!emp) return [];
      return evaluateUserHiddenSections(
        { ...emp, role: session.role },
        db.visibilityRules ?? []
      );
    },
    async create(input: Omit<VisibilityRule, 'id' | 'createdAt'>): Promise<VisibilityRule> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/visibility-rules', {
          method: 'POST',
          body: JSON.stringify({
            ...input,
            target_type: input.targetType,
            target_ids: input.targetIds ?? [],
            hidden_sections: input.hiddenSections ?? [],
          }),
        });
        return normalizeVisibilityRule(res);
      }
      const db = readDb();
      const created: VisibilityRule = {
        id: makeId('vr'),
        name: input.name.trim(),
        targetType: input.targetType,
        targetIds: input.targetType === 'all' ? [] : (input.targetIds ?? []),
        hiddenSections: input.hiddenSections ?? [],
        active: input.active ?? true,
        createdAt: new Date().toISOString(),
      };
      db.visibilityRules = [created, ...(db.visibilityRules ?? [])];
      writeDb(db);
      return created;
    },
    async update(id: string, patch: Partial<Omit<VisibilityRule, 'id'>>): Promise<VisibilityRule> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const payload: Record<string, unknown> = { ...patch };
        if (patch.targetType !== undefined) payload.target_type = patch.targetType;
        if (patch.targetIds !== undefined) payload.target_ids = patch.targetIds;
        if (patch.hiddenSections !== undefined) payload.hidden_sections = patch.hiddenSections;
        const res = await restFetch<unknown>(`/visibility-rules/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        return normalizeVisibilityRule(res);
      }
      const db = readDb();
      let updated: VisibilityRule | null = null;
      db.visibilityRules = (db.visibilityRules ?? []).map((r) => {
        if (r.id === id) {
          updated = { ...r, ...patch };
          return updated;
        }
        return r;
      });
      if (!updated) throw new Error('Visibility rule not found.');
      writeDb(db);
      return updated;
    },
    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/visibility-rules/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.visibilityRules = (db.visibilityRules ?? []).filter((r) => r.id !== id);
      writeDb(db);
    },
  },

  workflowTemplates: {
    async list(): Promise<WorkflowTemplate[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown[]>('/workflow-templates');
        return Array.isArray(res) ? res.map(normalizeWorkflowTemplate) : [];
      }
      const db = readDb();
      return db.workflowTemplates ?? [];
    },

    async create(
      input: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>
    ): Promise<WorkflowTemplate> {
      const cfg = getServerConfig();
      const normalizedSteps = input.steps.map((s, idx) => {
        const backendApproverType = s.type === 'employee' ? 'specific_user' : 'role';
        return {
          stepOrder: idx + 1,
          step_order: idx + 1,
          approverType: backendApproverType,
          approver_type: backendApproverType,
          type: s.type,
          step_type: s.type,
          role: s.type === 'role' ? s.role : null,
          approverRole: s.type === 'role' ? s.role : null,
          approver_role: s.type === 'role' ? s.role : null,
          employeeId: s.type === 'employee' ? s.employeeId : null,
          employee_id: s.type === 'employee' ? s.employeeId : null,
          approverUserId: s.type === 'employee' ? s.employeeId : null,
          approver_user_id: s.type === 'employee' ? s.employeeId : null,
        };
      });
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/workflow-templates', {
          method: 'POST',
          body: JSON.stringify({
            name: input.name.trim(),
            description: input.description?.trim() || null,
            steps: normalizedSteps,
          }),
        });
        return normalizeWorkflowTemplate(res);
      }
      const db = readDb();
      const now = new Date().toISOString();
      const created: WorkflowTemplate = {
        id: makeId('wt'),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        steps: input.steps.map((s, idx) => ({
          stepOrder: idx + 1,
          type: s.type,
          role: s.type === 'role' ? s.role : undefined,
          employeeId: s.type === 'employee' ? s.employeeId : undefined,
        })),
        createdAt: now,
        updatedAt: now,
      };
      db.workflowTemplates = [...(db.workflowTemplates ?? []), created];
      writeDb(db);
      return created;
    },

    async update(
      id: string,
      patch: Partial<Omit<WorkflowTemplate, 'id'>>
    ): Promise<WorkflowTemplate> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const payload: Record<string, unknown> = {};
        if (patch.name !== undefined) payload.name = patch.name.trim();
        if (patch.description !== undefined) payload.description = patch.description?.trim() || null;
        if (patch.steps !== undefined) {
          payload.steps = patch.steps.map((s, idx) => {
            const backendApproverType = s.type === 'employee' ? 'specific_user' : 'role';
            return {
              stepOrder: idx + 1,
              step_order: idx + 1,
              approverType: backendApproverType,
              approver_type: backendApproverType,
              type: s.type,
              step_type: s.type,
              role: s.type === 'role' ? s.role : null,
              approverRole: s.type === 'role' ? s.role : null,
              approver_role: s.type === 'role' ? s.role : null,
              employeeId: s.type === 'employee' ? s.employeeId : null,
              employee_id: s.type === 'employee' ? s.employeeId : null,
              approverUserId: s.type === 'employee' ? s.employeeId : null,
              approver_user_id: s.type === 'employee' ? s.employeeId : null,
            };
          });
        }
        const res = await restFetch<unknown>(`/workflow-templates/${id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        return normalizeWorkflowTemplate(res);
      }
      const db = readDb();
      let updated: WorkflowTemplate | null = null;
      db.workflowTemplates = (db.workflowTemplates ?? []).map((t) => {
        if (t.id === id) {
          updated = {
            ...t,
            ...patch,
            steps: patch.steps
              ? patch.steps.map((s, idx) => ({
                  stepOrder: idx + 1,
                  type: s.type,
                  role: s.type === 'role' ? s.role : undefined,
                  employeeId: s.type === 'employee' ? s.employeeId : undefined,
                }))
              : t.steps,
            updatedAt: new Date().toISOString(),
          };
          return updated;
        }
        return t;
      });
      if (!updated) throw new Error('Workflow template not found.');
      writeDb(db);
      return updated;
    },

    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/workflow-templates/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.workflowTemplates = (db.workflowTemplates ?? []).filter((t) => t.id !== id);
      const nextAssign = { ...normalizeWorkflowAssignments(db.workflowAssignments) };
      for (const mod of ALL_WORKFLOW_MODULES) {
        if (nextAssign[mod] === id) {
          nextAssign[mod] = null;
        }
      }
      db.workflowAssignments = nextAssign;
      writeDb(db);
    },

    async resolve(id: string, employeeId: string): Promise<ResolvedWorkflowStep[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(
          `/workflow-templates/${encodeURIComponent(id)}/resolve?employeeId=${encodeURIComponent(employeeId)}`
        );
        return normalizeResolvedWorkflowSteps(res);
      }
      const db = readDb();
      const tpl = (db.workflowTemplates ?? []).find((t) => t.id === id);
      const emp = db.employees.find((e) => e.id === employeeId);
      if (!tpl) return [];
      return resolveWorkflowStepsForEmployee({
        steps: tpl.steps,
        employee: emp,
        employees: db.employees,
        projects: db.projects ?? [],
      });
    },
  },

  workflowAssignments: {
    async get(): Promise<WorkflowModuleAssignments> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/workflow-assignments');
        return normalizeWorkflowAssignments(res);
      }
      const db = readDb();
      return normalizeWorkflowAssignments(db.workflowAssignments);
    },

    async update(assignments: WorkflowModuleAssignments): Promise<WorkflowModuleAssignments> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/workflow-assignments', {
          method: 'PUT',
          body: JSON.stringify({
            assignments,
            ...assignments,
          }),
        });
        return normalizeWorkflowAssignments(res);
      }
      const db = readDb();
      db.workflowAssignments = normalizeWorkflowAssignments(assignments);
      writeDb(db);
      return db.workflowAssignments;
    },
  },

  requests: {
    async list(): Promise<UnifiedRequest[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown[]>('/requests');
        return Array.isArray(res) ? res.map(normalizeUnifiedRequest) : [];
      }
      const db = readDb();
      return db.requests ?? [];
    },

    async upload(file: File): Promise<RequestUploadResult> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const session = getStoredSession();
        const formData = new FormData();
        formData.append('file', file);
        const headers: Record<string, string> = {
          'X-Client-Platform': CLIENT_PLATFORM_HEADER,
        };
        if (session?.token) {
          headers.Authorization = `Bearer ${session.token}`;
        }
        const controller = new AbortController();
        const timerId = globalThis.setTimeout(
          () => controller.abort(),
          DEFAULT_REQUEST_TIMEOUT_MS * 2
        );
        try {
          const res = await fetch(`${cfg.apiBaseUrl}/requests/upload`, {
            method: 'POST',
            headers,
            body: formData,
            signal: controller.signal,
          });
          globalThis.clearTimeout(timerId);
          if (!res.ok) {
            const rawBody = await res.text().catch(() => '');
            const statusText = res.statusText || getDefaultStatusText(res.status);
            if (res.status === 401) {
              handleUnauthorizedSession();
            }
            throw new ApiHttpError({
              endpoint: '/requests/upload',
              status: res.status,
              statusText,
              message:
                res.status === 401
                  ? SESSION_EXPIRED_MESSAGE
                  : extractErrorMessage(rawBody, res.status, statusText),
            });
          }
          const data = asRecord(await res.json());
          return {
            url: asString(data.url ?? data.fileUrl ?? data.file_url ?? data.path ?? ''),
            fileName: asString(data.fileName ?? data.file_name ?? file.name),
            fileType: asString(data.fileType ?? data.file_type ?? file.type) || undefined,
          };
        } catch (err) {
          globalThis.clearTimeout(timerId);
          throw err;
        }
      }

      // Demo Mode: convert to local Data URL
      return new Promise<RequestUploadResult>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            url: typeof reader.result === 'string' ? reader.result : '',
            fileName: file.name,
            fileType: file.type || undefined,
          });
        };
        reader.onerror = () => reject(new Error('Unable to read selected file.'));
        reader.readAsDataURL(file);
      });
    },

    async create(input: CreateUnifiedRequestInput): Promise<UnifiedRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const payload = input.payload;
        const res = await restFetch<unknown>('/requests', {
          method: 'POST',
          body: JSON.stringify({
            category: input.category,
            request_type: input.category,
            employeeId: input.employeeId,
            employee_id: input.employeeId,
            companyId: input.companyId,
            company_id: input.companyId,
            sectionId: input.sectionId,
            section_id: input.sectionId,
            reason: input.reason.trim(),
            payload: {
              ...payload,
              clock_in_time: payload.clockInTime,
              clock_out_time: payload.clockOutTime,
              leave_sub_type: payload.leaveSubType,
              start_date: payload.startDate,
              end_date: payload.endDate,
              amount_aed: payload.amountAED,
              repayment_months: payload.repaymentMonths,
              start_month: payload.startMonth,
              monthly_deduction_aed: payload.monthlyDeductionAED,
              target_employee_id: payload.targetEmployeeId,
              current_base_salary_aed: payload.currentBaseSalaryAED,
              new_base_salary_aed: payload.newBaseSalaryAED,
              attachment_url: payload.attachmentUrl,
              attachment_name: payload.attachmentName,
            },
          }),
        });
        return normalizeUnifiedRequest(res);
      }

      // Demo Mode creation + workflow resolution
      const db = readDb();
      const targetEmp = db.employees.find((e) => e.id === input.employeeId);
      const nowIso = new Date().toISOString();

      let workflowTemplateId: string | null = null;
      let workflowTemplateName = 'Default Approval Chain';
      let resolved: ResolvedWorkflowStep[] = [];

      if (input.category === 'salary_adjustment') {
        workflowTemplateName = 'HR Manager Direct Approval';
        resolved = resolveSalaryAdjustmentSteps({
          employees: db.employees,
          targetEmployee: targetEmp,
        });
      } else {
        const assignments = normalizeWorkflowAssignments(db.workflowAssignments);
        const assignedTplId = assignments[input.category as WorkflowModuleKey] ?? null;
        const tpl = (db.workflowTemplates ?? []).find((t) => t.id === assignedTplId);
        if (tpl) {
          workflowTemplateId = tpl.id;
          workflowTemplateName = tpl.name;
          resolved = resolveWorkflowStepsForEmployee({
            steps: tpl.steps,
            employee: targetEmp,
            employees: db.employees,
            projects: db.projects ?? [],
          });
        } else {
          resolved = resolveWorkflowStepsForEmployee({
            steps: [
              { stepOrder: 1, type: 'role', role: 'section_manager' },
              { stepOrder: 2, type: 'role', role: 'hr_admin' },
              { stepOrder: 3, type: 'role', role: 'main_manager' },
            ],
            employee: targetEmp,
            employees: db.employees,
            projects: db.projects ?? [],
          });
        }
      }

      const steps: RequestApprovalStep[] = resolved.map((r) => ({
        stepOrder: r.stepOrder,
        type: r.type,
        role: r.role,
        roleLabel: r.roleLabel,
        approverId: r.approverId ?? null,
        approverName: r.approverName,
        status: r.skipped ? 'skipped' : 'pending',
        comment: r.skipReason,
        decidedAt: r.skipped ? nowIso : undefined,
      }));

      const firstPendingIdx = steps.findIndex((s) => s.status === 'pending');

      const enrichedPayload: RequestPayload = { ...input.payload };
      if (input.category === 'time_off' && enrichedPayload.startDate && enrichedPayload.endDate) {
        enrichedPayload.days = calculateInclusiveDays(
          enrichedPayload.startDate,
          enrichedPayload.endDate
        );
      }
      if (
        input.category === 'advance_loan' &&
        enrichedPayload.amountAED &&
        enrichedPayload.repaymentMonths
      ) {
        enrichedPayload.monthlyDeductionAED = calculateLoanMonthlyDeduction(
          enrichedPayload.amountAED,
          enrichedPayload.repaymentMonths
        );
      }

      const created: UnifiedRequest = {
        id: makeId('req'),
        category: input.category,
        employeeId: input.employeeId,
        employeeName: targetEmp?.fullName ?? input.createdByName,
        companyId: input.companyId,
        sectionId: input.sectionId,
        workflowTemplateId,
        workflowTemplateName,
        status: firstPendingIdx === -1 ? 'approved' : 'pending',
        currentStepIndex: firstPendingIdx,
        steps,
        auditLog: [
          {
            id: makeId('aud'),
            action: 'submitted',
            actorId: input.createdById,
            actorName: input.createdByName,
            actorRole: input.createdByRole,
            comment: input.reason.trim(),
            timestamp: nowIso,
          },
        ],
        reason: input.reason.trim(),
        payload: enrichedPayload,
        createdById: input.createdById,
        createdByName: input.createdByName,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      db.requests = [created, ...(db.requests ?? [])];
      writeDb(db);
      return created;
    },

    async action(input: RequestActionInput): Promise<UnifiedRequest> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(`/requests/${encodeURIComponent(input.id)}/action`, {
          method: 'POST',
          body: JSON.stringify({
            action: input.action,
            comment: input.comment?.trim() || null,
            reason: input.comment?.trim() || null,
          }),
        });
        return normalizeUnifiedRequest(res);
      }

      const db = readDb();
      const target = (db.requests ?? []).find((r) => r.id === input.id);
      if (!target) throw new Error('Request not found.');

      const updated = applyUnifiedRequestAction({
        request: target,
        action: input.action,
        actorId: input.actorId,
        actorName: input.actorName,
        actorRole: input.actorRole,
        comment: input.comment,
      });

      db.requests = (db.requests ?? []).map((r) => (r.id === input.id ? updated : r));

      // Demo Mode automated side-effects upon final approval / bypass
      if (updated.status === 'approved' || updated.status === 'bypassed') {
        const emp = db.employees.find((e) => e.id === updated.employeeId);
        if (
          updated.category === 'advance_loan' &&
          emp &&
          updated.payload.amountAED &&
          updated.payload.repaymentMonths &&
          updated.payload.startMonth
        ) {
          const monthly = calculateLoanMonthlyDeduction(
            updated.payload.amountAED,
            updated.payload.repaymentMonths
          );
          const loanCat =
            (db.payrollCategories ?? []).find(
              (c) =>
                c.type === 'deduction_in_payroll' &&
                c.name.toLowerCase().includes('advance')
            ) ?? (db.payrollCategories ?? []).find((c) => c.type === 'deduction_in_payroll');

          const newEntry: PayrollEntry = {
            id: makeId('pe'),
            employeeId: emp.id,
            companyId: emp.primaryCompanyId,
            type: 'deduction_in_payroll',
            categoryId: loanCat?.id ?? 'cat-ded-in-advance',
            categoryName: loanCat?.name ?? 'Salary Advance Repayment',
            amountAED: monthly,
            isPermanent: false,
            effectiveFrom: updated.payload.startMonth,
            effectiveTo: computeTemporaryEndMonth(
              updated.payload.startMonth,
              updated.payload.repaymentMonths
            ),
            durationMonths: updated.payload.repaymentMonths,
            targetBucket: 'main_salary',
            reason: `Approved Loan/Advance (${updated.id}): AED ${updated.payload.amountAED} over ${updated.payload.repaymentMonths} mo — ${updated.reason}`,
            createdBy: input.actorName,
            createdByRole: input.actorRole,
            createdAt: new Date().toISOString(),
          };
          db.payrollEntries = [newEntry, ...(db.payrollEntries ?? [])];
        } else if (
          updated.category === 'salary_adjustment' &&
          emp &&
          updated.payload.newBaseSalaryAED !== undefined &&
          updated.payload.newBaseSalaryAED > 0
        ) {
          db.employees = db.employees.map((e) =>
            e.id === emp.id
              ? {
                  ...e,
                  salary: {
                    ...e.salary,
                    baseSalary: Number(updated.payload.newBaseSalaryAED),
                  },
                }
              : e
          );
        } else if (
          updated.category === 'time_off' &&
          emp &&
          updated.payload.startDate &&
          updated.payload.endDate
        ) {
          const sub = updated.payload.leaveSubType ?? 'annual';
          const leaveTypeMap: Record<TimeOffSubType, LeaveType> = {
            annual: LeaveType.Annual,
            sick: LeaveType.Sick,
            emergency: LeaveType.Emergency,
            unpaid: LeaveType.Unpaid,
          };
          const days =
            updated.payload.days ??
            calculateInclusiveDays(updated.payload.startDate, updated.payload.endDate);
          const leaveType = leaveTypeMap[sub];
          db.employees = db.employees.map((e) =>
            e.id === emp.id
              ? { ...e, leaveBalance: adjustLeaveBalance(e.leaveBalance, leaveType, days) }
              : e
          );
        } else if (
          updated.category === 'custom_clock' &&
          emp &&
          updated.payload.date &&
          updated.payload.clockInTime
        ) {
          const clockInIso = `${updated.payload.date}T${updated.payload.clockInTime}:00`;
          const clockOutIso = updated.payload.clockOutTime
            ? `${updated.payload.date}T${updated.payload.clockOutTime}:00`
            : null;
          const existingLog = db.attendance.find(
            (a) => a.employeeId === emp.id && a.date === updated.payload.date
          );
          if (existingLog) {
            db.attendance = db.attendance.map((a) =>
              a.id === existingLog.id
                ? {
                    ...a,
                    clockInTime: clockInIso,
                    clockOutTime: clockOutIso,
                    modifiedBy: `${input.actorName} (Request ${updated.id})`,
                  }
                : a
            );
          } else {
            db.attendance = [
              {
                id: makeId('att'),
                employeeId: emp.id,
                companyId: emp.primaryCompanyId,
                date: updated.payload.date,
                clockInTime: clockInIso,
                clockOutTime: clockOutIso,
                zoneId: 'custom-request',
                zoneName: 'Approved Custom Clock-In',
                clockInLat: 25.1885,
                clockInLng: 55.2632,
                accuracyMeters: 0,
                punchSource: 'PC Web',
                isLate: false,
                lateMinutes: 0,
                latenessPenaltyAED: 0,
                latenessExcused: false,
                modifiedBy: `${input.actorName} (Request ${updated.id})`,
                notes: updated.reason,
              },
              ...db.attendance,
            ];
          }
        }
      }

      writeDb(db);
      return updated;
    },
  },

  rosters: {
    async list(params: { month: string; employeeId?: string }): Promise<RosterEntry[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const qs = new URLSearchParams({ month: params.month });
        if (params.employeeId) {
          qs.set('employeeId', params.employeeId);
        }
        const res = await restFetch<unknown>(`/rosters?${qs.toString()}`);
        const list = Array.isArray(res)
          ? res
          : Array.isArray(asRecord(res).items)
            ? (asRecord(res).items as unknown[])
            : Array.isArray(asRecord(res).entries)
              ? (asRecord(res).entries as unknown[])
              : Array.isArray(asRecord(res).rosters)
                ? (asRecord(res).rosters as unknown[])
                : [];
        return list.map(normalizeRosterEntry);
      }

      const entries = readStoredRosters();
      return entries
        .filter((entry) => {
          if (!entry.date.startsWith(params.month)) return false;
          if (params.employeeId && entry.userId !== params.employeeId) return false;
          return true;
        })
        .sort((a, b) => a.date.localeCompare(b.date) || a.employeeName.localeCompare(b.employeeName));
    },

    async today(): Promise<RosterTodayStatus> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/rosters/today');
        return normalizeRosterTodayStatus(res);
      }

      const todayIso = new Date().toISOString().slice(0, 10);
      const session = getStoredSession();
      if (!session?.userId) {
        return {
          date: todayIso,
          hasRoster: false,
          status: 'none',
          canClockIn: true,
        };
      }
      const entries = readStoredRosters();
      const match = entries.find(
        (entry) => entry.userId === session.userId && entry.date === todayIso
      );
      if (!match) {
        return {
          date: todayIso,
          hasRoster: false,
          status: 'none',
          canClockIn: true,
        };
      }
      return {
        date: todayIso,
        hasRoster: true,
        status: match.status,
        shiftStart: match.shiftStart || undefined,
        shiftEnd: match.shiftEnd || undefined,
        isOvernight: match.isOvernight,
        canClockIn: match.status !== 'leave',
      };
    },

    async bulkUpload(params: {
      fileName: string;
      month: string;
      rows: Record<string, unknown>[];
    }): Promise<RosterBulkUploadResult> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/rosters/bulk', {
          method: 'POST',
          body: JSON.stringify({
            fileName: params.fileName,
            month: params.month,
            rows: params.rows,
          }),
        });
        return normalizeRosterBulkUploadResult(res, params.month);
      }

      const db = readDb();
      const session = getStoredSession();
      const existingRosters = readStoredRosters();
      const rosterMap = new Map<string, RosterEntry>(
        existingRosters.map((item) => [`${item.userId}::${item.date}`, item])
      );

      const empByCode = new Map<string, Employee>();
      const empById = new Map<string, Employee>();
      for (const emp of db.employees) {
        empByCode.set(emp.employeeCode.trim().toUpperCase(), emp);
        empById.set(emp.id, emp);
      }

      const errors: RosterUploadError[] = [];
      const failedRows: Record<string, unknown>[] = [];
      let successCount = 0;

      params.rows.forEach((rawRow, idx) => {
        const rowNum = idx + 2;
        const rawCode = asString(
          rawRow['Employee ID'] ??
            rawRow['employeeCode'] ??
            rawRow['employee_code'] ??
            rawRow['Employee Code'] ??
            ''
        ).trim();
        const rawName = asString(
          rawRow['Employee Name'] ??
            rawRow['employeeName'] ??
            rawRow['employee_name'] ??
            ''
        ).trim();

        if (!rawCode) {
          errors.push({
            row: rowNum,
            employeeCode: '',
            employeeName: rawName || undefined,
            error: 'Missing Employee ID.',
          });
          failedRows.push(rawRow);
          return;
        }

        const emp = empByCode.get(rawCode.toUpperCase()) ?? empById.get(rawCode);
        if (!emp) {
          errors.push({
            row: rowNum,
            employeeCode: rawCode,
            employeeName: rawName || undefined,
            error: `Employee "${rawCode}" was not found.`,
          });
          failedRows.push(rawRow);
          return;
        }

        const dateColumns = Object.keys(rawRow).filter((key) => /^\d{4}-\d{2}-\d{2}$/.test(key.trim()));
        if (dateColumns.length === 0) {
          errors.push({
            row: rowNum,
            employeeCode: emp.employeeCode,
            employeeName: emp.fullName,
            error: 'No YYYY-MM-DD date columns found in row.',
          });
          failedRows.push(rawRow);
          return;
        }

        const parsedEntries: RosterEntry[] = [];
        let rowError: string | null = null;

        for (const colKey of dateColumns) {
          const dateStr = colKey.trim();
          const cellVal = asString(rawRow[colKey] ?? '').trim();
          if (!cellVal) continue;

          const parsed = parseRosterCellValue(cellVal);
          if (!parsed) {
            rowError = `Invalid value "${cellVal}" on ${dateStr}. Expected HH:MM,HH:MM, OFF, or Leave.`;
            break;
          }

          parsedEntries.push({
            id: rosterMap.get(`${emp.id}::${dateStr}`)?.id ?? makeId('ros'),
            userId: emp.id,
            employeeCode: emp.employeeCode,
            employeeName: emp.fullName,
            date: dateStr,
            status: parsed.status,
            shiftStart: parsed.shiftStart,
            shiftEnd: parsed.shiftEnd,
            isOvernight: parsed.isOvernight,
          });
        }

        if (rowError) {
          errors.push({
            row: rowNum,
            employeeCode: emp.employeeCode,
            employeeName: emp.fullName,
            error: rowError,
          });
          failedRows.push(rawRow);
          return;
        }

        for (const entry of parsedEntries) {
          rosterMap.set(`${entry.userId}::${entry.date}`, entry);
        }
        successCount += 1;
      });

      writeStoredRosters(Array.from(rosterMap.values()));

      const batchId = makeId('ros-batch');
      const nowIso = new Date().toISOString();
      const batch: RosterUploadBatch = {
        id: batchId,
        uploadedByName: session?.fullName || session?.email || 'HR Admin',
        fileName: params.fileName,
        month: params.month,
        totalRows: params.rows.length,
        successCount,
        failedCount: failedRows.length,
        errors,
        failedRows,
        createdAt: nowIso,
      };
      const existingHistory = readStoredRosterHistory();
      writeStoredRosterHistory([batch, ...existingHistory].slice(0, 50));

      return {
        batchId,
        month: params.month,
        totalRows: params.rows.length,
        successCount,
        failedCount: failedRows.length,
        errors,
        failedRows,
      };
    },

    async history(): Promise<RosterUploadBatch[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/rosters/history');
        const list = Array.isArray(res)
          ? res
          : Array.isArray(asRecord(res).items)
            ? (asRecord(res).items as unknown[])
            : Array.isArray(asRecord(res).batches)
              ? (asRecord(res).batches as unknown[])
              : [];
        return list.map(normalizeRosterUploadBatch);
      }

      return readStoredRosterHistory().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  },

  payrollApprovalRuns: {
    async list(month?: string): Promise<PayrollApprovalRun[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const path = month
          ? `/payroll/approval-runs?month=${encodeURIComponent(month)}`
          : '/payroll/approval-runs';
        const res = await restFetch<unknown>(path);
        const list = Array.isArray(res)
          ? res
          : Array.isArray(asRecord(res).items)
            ? (asRecord(res).items as unknown[])
            : [];
        return list.map(normalizePayrollApprovalRun);
      }

      const runs = readStoredPayrollRuns();
      return runs
        .filter((r) => (!month ? true : r.month === month))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async create(payload: {
      month: string;
      scopeType: PayrollReleaseScopeType;
      scopeId?: string | null;
      scopeLabel: string;
      employeeIds: string[];
      employeeCount: number;
      totalNetAED: number;
      notes?: string;
      createdById: string;
      createdByName: string;
    }): Promise<PayrollApprovalRun> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/payroll/approval-runs', {
          method: 'POST',
          body: JSON.stringify({
            month: payload.month,
            scopeType: payload.scopeType,
            scope_type: payload.scopeType,
            scopeId: payload.scopeId ?? null,
            scope_id: payload.scopeId ?? null,
            scopeLabel: payload.scopeLabel,
            scope_label: payload.scopeLabel,
            employeeIds: payload.employeeIds,
            employee_ids: payload.employeeIds,
            employeeCount: payload.employeeCount,
            employee_count: payload.employeeCount,
            totalNetAED: payload.totalNetAED,
            total_net_aed: payload.totalNetAED,
            notes: payload.notes?.trim() || null,
          }),
        });
        return normalizePayrollApprovalRun(res);
      }

      const db = readDb();
      const nowIso = new Date().toISOString();
      const assignments = normalizeWorkflowAssignments(db.workflowAssignments);
      const assignedTplId = assignments.payroll ?? null;
      const tpl = (db.workflowTemplates ?? []).find((item) => item.id === assignedTplId) ?? null;

      const templateSteps: WorkflowTemplateStep[] =
        tpl && tpl.steps.length > 0
          ? tpl.steps
          : [
              { stepOrder: 1, type: 'role', role: 'hr_manager' },
              { stepOrder: 2, type: 'role', role: 'main_manager' },
            ];

      const representativeEmp =
        db.employees.find((e) => payload.employeeIds.includes(e.id)) ??
        db.employees.find((e) => e.id === payload.createdById);

      const resolved = resolveWorkflowStepsForEmployee({
        steps: templateSteps,
        employee: representativeEmp,
        employees: db.employees,
        projects: db.projects ?? [],
      });

      const steps: RequestApprovalStep[] = resolved.map((r) => ({
        stepOrder: r.stepOrder,
        type: r.type,
        role: r.role,
        roleLabel: r.roleLabel,
        approverId: r.approverId ?? null,
        approverName: r.approverName,
        status: r.skipped ? 'skipped' : 'pending',
        comment: r.skipReason,
        decidedAt: r.skipped ? nowIso : undefined,
      }));

      const firstPendingIdx = steps.findIndex((s) => s.status === 'pending');

      const created: PayrollApprovalRun = {
        id: makeId('prun'),
        month: payload.month,
        scopeType: payload.scopeType,
        scopeId: payload.scopeId ?? null,
        scopeLabel: payload.scopeLabel,
        employeeIds: payload.employeeIds,
        employeeCount: payload.employeeCount,
        totalNetAED: Math.round(payload.totalNetAED * 100) / 100,
        status: firstPendingIdx === -1 ? 'approved' : 'pending',
        workflowTemplateId: tpl?.id ?? null,
        workflowTemplateName: tpl?.name ?? 'Default Payroll Approval (HR Manager → Main Manager)',
        currentStepIndex: firstPendingIdx,
        steps,
        auditLog: [
          {
            id: makeId('paud'),
            action: 'submitted',
            actorId: payload.createdById,
            actorName: payload.createdByName,
            comment: payload.notes?.trim() || `Submitted ${payload.scopeLabel} (${payload.month})`,
            timestamp: nowIso,
          },
        ],
        notes: payload.notes?.trim() || undefined,
        createdById: payload.createdById,
        createdByName: payload.createdByName,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const existing = readStoredPayrollRuns();
      writeStoredPayrollRuns([created, ...existing]);
      return created;
    },

    async action(input: {
      id: string;
      action: 'approve' | 'reject' | 'bypass';
      comment?: string;
      actorId: string;
      actorName: string;
      actorRole: UserRole;
    }): Promise<PayrollApprovalRun> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>(
          `/payroll/approval-runs/${encodeURIComponent(input.id)}/action`,
          {
            method: 'POST',
            body: JSON.stringify({
              action: input.action,
              comment: input.comment?.trim() || null,
            }),
          }
        );
        return normalizePayrollApprovalRun(res);
      }

      const runs = readStoredPayrollRuns();
      const target = runs.find((r) => r.id === input.id);
      if (!target) throw new Error('Payroll approval run not found.');
      if (target.status !== 'pending') {
        throw new Error('This payroll approval run has already been finalized.');
      }

      const nowIso = new Date().toISOString();
      const nextSteps = target.steps.map((s) => ({ ...s }));
      let nextStatus: PayrollApprovalRun['status'] = target.status;
      let nextStepIndex = target.currentStepIndex;
      const auditAction: RequestAuditEntry['action'] =
        input.action === 'bypass'
          ? 'bypassed'
          : input.action === 'approve'
            ? 'approved'
            : 'rejected';

      if (input.action === 'bypass') {
        for (let i = 0; i < nextSteps.length; i++) {
          if (nextSteps[i].status === 'pending') {
            nextSteps[i] = {
              ...nextSteps[i],
              status: 'bypassed',
              actorId: input.actorId,
              actorName: input.actorName,
              actorRole: input.actorRole,
              comment: input.comment?.trim() || 'Bypassed and approved',
              decidedAt: nowIso,
            };
          }
        }
        nextStatus = 'bypassed';
        nextStepIndex = -1;
      } else if (input.action === 'reject') {
        if (nextStepIndex >= 0 && nextStepIndex < nextSteps.length) {
          nextSteps[nextStepIndex] = {
            ...nextSteps[nextStepIndex],
            status: 'rejected',
            actorId: input.actorId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            comment: input.comment?.trim() || undefined,
            decidedAt: nowIso,
          };
        }
        nextStatus = 'rejected';
        nextStepIndex = -1;
      } else {
        if (nextStepIndex >= 0 && nextStepIndex < nextSteps.length) {
          nextSteps[nextStepIndex] = {
            ...nextSteps[nextStepIndex],
            status: 'approved',
            actorId: input.actorId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            comment: input.comment?.trim() || undefined,
            decidedAt: nowIso,
          };
        }
        const remainingIdx = nextSteps.findIndex(
          (s, idx) => idx > nextStepIndex && s.status === 'pending'
        );
        if (remainingIdx === -1) {
          nextStatus = 'approved';
          nextStepIndex = -1;
        } else {
          nextStatus = 'pending';
          nextStepIndex = remainingIdx;
        }
      }

      const updated: PayrollApprovalRun = {
        ...target,
        status: nextStatus,
        currentStepIndex: nextStepIndex,
        steps: nextSteps,
        auditLog: [
          ...target.auditLog,
          {
            id: makeId('paud'),
            action: auditAction,
            actorId: input.actorId,
            actorName: input.actorName,
            actorRole: input.actorRole,
            stepOrder:
              target.currentStepIndex >= 0 ? target.steps[target.currentStepIndex]?.stepOrder : undefined,
            comment: input.comment?.trim() || undefined,
            timestamp: nowIso,
          },
        ],
        updatedAt: nowIso,
      };

      writeStoredPayrollRuns(runs.map((r) => (r.id === input.id ? updated : r)));
      return updated;
    },
  },

  announcements: {
    async list(): Promise<Announcement[]> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/announcements');
        const list = Array.isArray(res)
          ? res
          : Array.isArray(asRecord(res).items)
            ? (asRecord(res).items as unknown[])
            : [];
        return list.map(normalizeAnnouncement);
      }

      return readStoredAnnouncements().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },

    async create(payload: Omit<Announcement, 'id' | 'createdAt'>): Promise<Announcement> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<unknown>('/announcements', {
          method: 'POST',
          body: JSON.stringify({
            title: payload.title.trim(),
            body: payload.body.trim(),
            priority: payload.priority,
            targetType: payload.targetType,
            target_type: payload.targetType,
            targetIds: payload.targetIds,
            target_ids: payload.targetIds,
            attachmentUrl: payload.attachmentUrl ?? null,
            attachment_url: payload.attachmentUrl ?? null,
            attachmentName: payload.attachmentName ?? null,
            attachment_name: payload.attachmentName ?? null,
            attachmentType: payload.attachmentType ?? null,
            attachment_type: payload.attachmentType ?? null,
          }),
        });
        return normalizeAnnouncement(res);
      }

      const created: Announcement = {
        ...payload,
        id: makeId('ann'),
        title: payload.title.trim(),
        body: payload.body.trim(),
        createdAt: new Date().toISOString(),
      };
      const existing = readStoredAnnouncements();
      writeStoredAnnouncements([created, ...existing]);
      return created;
    },

    async remove(id: string): Promise<void> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        await restFetch<void>(`/announcements/${encodeURIComponent(id)}`, { method: 'DELETE' });
        return;
      }
      const existing = readStoredAnnouncements();
      writeStoredAnnouncements(existing.filter((item) => item.id !== id));
    },

    async upload(file: File): Promise<{ url: string; fileName: string; fileType?: string }> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const session = getStoredSession();
        const formData = new FormData();
        formData.append('file', file);
        const headers: Record<string, string> = {
          'X-Client-Platform': CLIENT_PLATFORM_HEADER,
        };
        if (session?.token) {
          headers.Authorization = `Bearer ${session.token}`;
        }
        const controller = new AbortController();
        const timerId = globalThis.setTimeout(
          () => controller.abort(),
          DEFAULT_REQUEST_TIMEOUT_MS * 2
        );
        try {
          const res = await fetch(`${cfg.apiBaseUrl}/announcements/upload`, {
            method: 'POST',
            headers,
            body: formData,
            signal: controller.signal,
          });
          globalThis.clearTimeout(timerId);
          if (!res.ok) {
            const rawBody = await res.text().catch(() => '');
            const statusText = res.statusText || getDefaultStatusText(res.status);
            if (res.status === 401) {
              handleUnauthorizedSession();
            }
            throw new ApiHttpError({
              endpoint: '/announcements/upload',
              status: res.status,
              statusText,
              message:
                res.status === 401
                  ? SESSION_EXPIRED_MESSAGE
                  : extractErrorMessage(rawBody, res.status, statusText),
            });
          }
          const data = asRecord(await res.json());
          return {
            url: asString(data.url ?? data.fileUrl ?? data.file_url ?? data.path ?? ''),
            fileName: asString(data.fileName ?? data.file_name ?? file.name),
            fileType: asString(data.fileType ?? data.file_type ?? file.type) || undefined,
          };
        } catch (err) {
          globalThis.clearTimeout(timerId);
          throw err;
        }
      }

      return new Promise<{ url: string; fileName: string; fileType?: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          resolve({
            url: typeof reader.result === 'string' ? reader.result : '',
            fileName: file.name,
            fileType: file.type || undefined,
          });
        };
        reader.onerror = () => reject(new Error('Unable to read selected attachment file.'));
        reader.readAsDataURL(file);
      });
    },
  },
};

function readStoredRosters(): RosterEntry[] {
  try {
    const raw = localStorage.getItem(ROSTER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRosterEntry) : [];
  } catch {
    return [];
  }
}

function writeStoredRosters(entries: RosterEntry[]): void {
  try {
    localStorage.setItem(ROSTER_STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.warn('Unable to persist roster entries:', err);
  }
}

function readStoredRosterHistory(): RosterUploadBatch[] {
  try {
    const raw = localStorage.getItem(ROSTER_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeRosterUploadBatch) : [];
  } catch {
    return [];
  }
}

function writeStoredRosterHistory(batches: RosterUploadBatch[]): void {
  try {
    localStorage.setItem(ROSTER_HISTORY_STORAGE_KEY, JSON.stringify(batches));
  } catch (err) {
    console.warn('Unable to persist roster upload history:', err);
  }
}

function parseRosterCellValue(
  raw: string
): { status: 'shift' | 'off' | 'leave'; shiftStart: string; shiftEnd: string; isOvernight: boolean } | null {
  const trimmed = raw.trim();
  const upper = trimmed.toUpperCase();
  if (upper === 'OFF') {
    return { status: 'off', shiftStart: '', shiftEnd: '', isOvernight: false };
  }
  if (upper === 'LEAVE') {
    return { status: 'leave', shiftStart: '', shiftEnd: '', isOvernight: false };
  }

  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*[,\-–]\s*(\d{1,2}):(\d{2})$/);
  if (!match) return null;

  const sh = Number(match[1]);
  const sm = Number(match[2]);
  const eh = Number(match[3]);
  const em = Number(match[4]);

  if (sh < 0 || sh > 23 || eh < 0 || eh > 23 || sm < 0 || sm > 59 || em < 0 || em > 59) {
    return null;
  }

  const pad = (n: number) => String(n).padStart(2, '0');
  const shiftStart = `${pad(sh)}:${pad(sm)}`;
  const shiftEnd = `${pad(eh)}:${pad(em)}`;
  const startMins = sh * 60 + sm;
  const endMins = eh * 60 + em;

  return {
    status: 'shift',
    shiftStart,
    shiftEnd,
    isOvernight: endMins <= startMins,
  };
}

function normalizeRosterStatus(raw: unknown): 'shift' | 'off' | 'leave' {
  const val = asString(raw).trim().toLowerCase();
  if (val === 'off') return 'off';
  if (val === 'leave') return 'leave';
  return 'shift';
}

function normalizeRosterEntry(raw: unknown): RosterEntry {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? ''),
    userId: asString(obj.userId ?? obj.user_id ?? obj.employeeId ?? obj.employee_id ?? ''),
    employeeCode: asString(obj.employeeCode ?? obj.employee_code ?? ''),
    employeeName: asString(obj.employeeName ?? obj.employee_name ?? ''),
    date: asString(obj.date ?? ''),
    status: normalizeRosterStatus(obj.status),
    shiftStart: asString(obj.shiftStart ?? obj.shift_start ?? ''),
    shiftEnd: asString(obj.shiftEnd ?? obj.shift_end ?? ''),
    isOvernight: asBoolean(obj.isOvernight ?? obj.is_overnight, false),
  };
}

function normalizeRosterTodayStatus(raw: unknown): RosterTodayStatus {
  const obj = asRecord(raw);
  const rawStatus = asString(obj.status ?? 'none').trim().toLowerCase();
  const status: RosterTodayStatus['status'] =
    rawStatus === 'shift' || rawStatus === 'off' || rawStatus === 'leave' ? rawStatus : 'none';
  const shiftStart = asString(obj.shiftStart ?? obj.shift_start ?? '') || undefined;
  const shiftEnd = asString(obj.shiftEnd ?? obj.shift_end ?? '') || undefined;
  const hasRoster = asBoolean(obj.hasRoster ?? obj.has_roster, status !== 'none');
  const canClockIn = asBoolean(obj.canClockIn ?? obj.can_clock_in, status !== 'leave');

  return {
    date: asString(obj.date ?? new Date().toISOString().slice(0, 10)),
    hasRoster,
    status,
    shiftStart,
    shiftEnd,
    isOvernight: obj.isOvernight !== undefined || obj.is_overnight !== undefined
      ? asBoolean(obj.isOvernight ?? obj.is_overnight, false)
      : undefined,
    canClockIn,
  };
}

function normalizeRosterUploadError(raw: unknown): RosterUploadError {
  const obj = asRecord(raw);
  return {
    row: asNumber(obj.row ?? obj.rowNumber ?? obj.row_number, 0),
    employeeCode: asString(obj.employeeCode ?? obj.employee_code ?? ''),
    employeeName: asString(obj.employeeName ?? obj.employee_name ?? '') || undefined,
    error: asString(obj.error ?? obj.message ?? 'Invalid row'),
  };
}

function normalizeRosterBulkUploadResult(raw: unknown, fallbackMonth: string): RosterBulkUploadResult {
  const obj = asRecord(raw);
  const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];
  const rawFailedRows = Array.isArray(obj.failedRows ?? obj.failed_rows)
    ? ((obj.failedRows ?? obj.failed_rows) as Record<string, unknown>[])
    : [];
  return {
    batchId: asString(obj.batchId ?? obj.batch_id ?? obj.id ?? ''),
    month: asString(obj.month ?? fallbackMonth),
    totalRows: asNumber(obj.totalRows ?? obj.total_rows, 0),
    successCount: asNumber(obj.successCount ?? obj.success_count, 0),
    failedCount: asNumber(obj.failedCount ?? obj.failed_count, rawFailedRows.length),
    errors: rawErrors.map(normalizeRosterUploadError),
    failedRows: rawFailedRows,
  };
}

function normalizeRosterUploadBatch(raw: unknown): RosterUploadBatch {
  const obj = asRecord(raw);
  const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];
  const rawFailedRows = Array.isArray(obj.failedRows ?? obj.failed_rows)
    ? ((obj.failedRows ?? obj.failed_rows) as Record<string, unknown>[])
    : [];
  return {
    id: asString(obj.id ?? obj.batchId ?? obj.batch_id ?? ''),
    uploadedByName: asString(obj.uploadedByName ?? obj.uploaded_by_name ?? 'HR Admin'),
    fileName: asString(obj.fileName ?? obj.file_name ?? ''),
    month: asString(obj.month ?? ''),
    totalRows: asNumber(obj.totalRows ?? obj.total_rows, 0),
    successCount: asNumber(obj.successCount ?? obj.success_count, 0),
    failedCount: asNumber(obj.failedCount ?? obj.failed_count, rawFailedRows.length),
    errors: rawErrors.map(normalizeRosterUploadError),
    failedRows: rawFailedRows,
    createdAt: asString(obj.createdAt ?? obj.created_at ?? ''),
  };
}

function readStoredPayrollRuns(): PayrollApprovalRun[] {
  try {
    const raw = localStorage.getItem(PAYROLL_RUNS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizePayrollApprovalRun) : [];
  } catch {
    return [];
  }
}

function writeStoredPayrollRuns(runs: PayrollApprovalRun[]): void {
  try {
    localStorage.setItem(PAYROLL_RUNS_STORAGE_KEY, JSON.stringify(runs));
  } catch (err) {
    console.warn('Unable to persist payroll approval runs:', err);
  }
}

function readStoredAnnouncements(): Announcement[] {
  try {
    const raw = localStorage.getItem(ANNOUNCEMENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(normalizeAnnouncement) : [];
  } catch {
    return [];
  }
}

function writeStoredAnnouncements(items: Announcement[]): void {
  try {
    localStorage.setItem(ANNOUNCEMENTS_STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('Unable to persist announcements:', err);
  }
}

function normalizePayrollScopeType(raw: unknown): PayrollReleaseScopeType {
  const val = asString(raw).trim().toLowerCase();
  if (val === 'company' || val === 'project' || val === 'employees') return val;
  return 'all';
}

function normalizePayrollApprovalRun(raw: unknown): PayrollApprovalRun {
  const obj = asRecord(raw);
  const rawSteps = Array.isArray(obj.steps) ? obj.steps : [];
  const rawAudit = Array.isArray(obj.auditLog ?? obj.audit_log)
    ? ((obj.auditLog ?? obj.audit_log) as unknown[])
    : [];
  const rawStatus = asString(obj.status ?? 'pending').trim().toLowerCase();
  const status: PayrollApprovalRun['status'] =
    rawStatus === 'approved' || rawStatus === 'rejected' || rawStatus === 'bypassed'
      ? rawStatus
      : 'pending';

  const steps: RequestApprovalStep[] = rawSteps.map((st, idx) => {
    const s = asRecord(st);
    const stepStatusRaw = asString(s.status ?? 'pending').trim().toLowerCase();
    const stepStatus: RequestStepStatus =
      stepStatusRaw === 'approved' ||
      stepStatusRaw === 'rejected' ||
      stepStatusRaw === 'bypassed' ||
      stepStatusRaw === 'skipped'
        ? stepStatusRaw
        : 'pending';
    const typeVal = asString(s.type ?? s.step_type ?? s.approverType ?? s.approver_type ?? 'role');
    return {
      stepOrder: asNumber(s.stepOrder ?? s.step_order, idx + 1),
      type: typeVal === 'employee' || typeVal === 'specific_user' ? 'employee' : 'role',
      role: (asString(s.role ?? s.approverRole ?? s.approver_role ?? '') || undefined) as
        | WorkflowStepRoleKey
        | undefined,
      roleLabel: asString(s.roleLabel ?? s.role_label ?? '') || undefined,
      approverId:
        asString(s.approverId ?? s.approver_id ?? s.employeeId ?? s.employee_id ?? '') || null,
      approverName: asString(s.approverName ?? s.approver_name ?? '') || undefined,
      status: stepStatus,
      actorId: asString(s.actorId ?? s.actor_id ?? '') || undefined,
      actorName: asString(s.actorName ?? s.actor_name ?? '') || undefined,
      actorRole: s.actorRole ?? s.actor_role
        ? normalizeUserRole(s.actorRole ?? s.actor_role)
        : undefined,
      comment: asString(s.comment ?? '') || undefined,
      decidedAt: asString(s.decidedAt ?? s.decided_at ?? '') || undefined,
    };
  });

  const auditLog: RequestAuditEntry[] = rawAudit.map((entry, idx) => {
    const a = asRecord(entry);
    const actRaw = asString(a.action ?? 'submitted').trim().toLowerCase();
    const action: RequestAuditEntry['action'] =
      actRaw === 'approved' || actRaw === 'rejected' || actRaw === 'bypassed'
        ? actRaw
        : 'submitted';
    return {
      id: asString(a.id ?? `paud-${idx}`),
      action,
      actorId: asString(a.actorId ?? a.actor_id ?? '') || undefined,
      actorName: asString(a.actorName ?? a.actor_name ?? 'User'),
      actorRole: a.actorRole ?? a.actor_role
        ? normalizeUserRole(a.actorRole ?? a.actor_role)
        : undefined,
      stepOrder:
        a.stepOrder !== undefined || a.step_order !== undefined
          ? asNumber(a.stepOrder ?? a.step_order, 0)
          : undefined,
      comment: asString(a.comment ?? '') || undefined,
      timestamp: asString(a.timestamp ?? a.createdAt ?? a.created_at ?? ''),
    };
  });

  const employeeIds = asStringArray(obj.employeeIds ?? obj.employee_ids);
  return {
    id: asString(obj.id ?? ''),
    month: asString(obj.month ?? ''),
    scopeType: normalizePayrollScopeType(obj.scopeType ?? obj.scope_type),
    scopeId: asString(obj.scopeId ?? obj.scope_id ?? '') || null,
    scopeLabel: asString(obj.scopeLabel ?? obj.scope_label ?? 'All Employees'),
    employeeIds,
    employeeCount: asNumber(obj.employeeCount ?? obj.employee_count, employeeIds.length),
    totalNetAED: asNumber(obj.totalNetAED ?? obj.total_net_aed, 0),
    status,
    workflowTemplateId:
      asString(obj.workflowTemplateId ?? obj.workflow_template_id ?? '') || null,
    workflowTemplateName:
      asString(obj.workflowTemplateName ?? obj.workflow_template_name ?? '') || undefined,
    currentStepIndex: asNumber(
      obj.currentStepIndex ?? obj.current_step_index,
      steps.findIndex((s) => s.status === 'pending')
    ),
    steps,
    auditLog,
    notes: asString(obj.notes ?? '') || undefined,
    createdById: asString(obj.createdById ?? obj.created_by_id ?? ''),
    createdByName: asString(obj.createdByName ?? obj.created_by_name ?? 'User'),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? ''),
    updatedAt: asString(obj.updatedAt ?? obj.updated_at ?? '') || undefined,
  };
}

function normalizeAnnouncement(raw: unknown): Announcement {
  const obj = asRecord(raw);
  const priorityRaw = asString(obj.priority ?? 'normal').trim().toLowerCase();
  const priority: Announcement['priority'] =
    priorityRaw === 'urgent' || priorityRaw === 'important' ? priorityRaw : 'normal';
  const targetRaw = asString(obj.targetType ?? obj.target_type ?? 'all').trim().toLowerCase();
  const targetType: Announcement['targetType'] =
    targetRaw === 'company' || targetRaw === 'project' || targetRaw === 'group' ? targetRaw : 'all';

  return {
    id: asString(obj.id ?? ''),
    title: asString(obj.title ?? ''),
    body: asString(obj.body ?? obj.message ?? ''),
    priority,
    targetType,
    targetIds: asStringArray(obj.targetIds ?? obj.target_ids),
    attachmentUrl: asString(obj.attachmentUrl ?? obj.attachment_url ?? '') || undefined,
    attachmentName: asString(obj.attachmentName ?? obj.attachment_name ?? '') || undefined,
    attachmentType: asString(obj.attachmentType ?? obj.attachment_type ?? '') || undefined,
    createdById: asString(obj.createdById ?? obj.created_by_id ?? ''),
    createdByName: asString(obj.createdByName ?? obj.created_by_name ?? 'HR Admin'),
    createdAt: asString(obj.createdAt ?? obj.created_at ?? ''),
  };
}

function normalizeQuickActionConfigItem(raw: unknown, idx = 0): QuickActionConfigItem {
  const obj = asRecord(raw);
  return {
    id: asString(obj.id ?? `qa-${idx}`),
    label: asString(obj.label ?? ''),
    description: asString(obj.description ?? ''),
    targetNav: asString(obj.targetNav ?? obj.target_nav ?? 'dashboard'),
    enabled: asBoolean(obj.enabled, true),
    order: asNumber(obj.order, idx),
  };
}

