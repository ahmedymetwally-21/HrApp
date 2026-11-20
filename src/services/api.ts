/**
 * Yaldi HR Centralized Self-Hosted REST + Local Demo API Client (`services/api.ts`)
 *
 * Flip `USE_MOCK_API` (or switch in Login / Profile Server Settings) to swap cleanly between:
 *  - Demo / Local Mode: pre-populated multi-company UAE dataset in localStorage
 *  - Live Self-Hosted Mode: REST API (GET/POST/PUT/DELETE) with JWT Bearer tokens
 *    pointing to your self-hosted PostgreSQL + FastAPI/Node.js PC/Ubuntu server.
 */

import {
  AppSettings,
  ApprovalWorkflow,
  AttendanceAuditEntry,
  AttendanceLog,
  AuthSession,
  ClockInPolicyMode,
  Company,
  CreateEmployeePayload,
  Employee,
  EmployeeDocument,
  EmployeeLabel,
  EmployeeModel,
  EndpointFailure,
  GeofenceZone,
  HRDatabase,
  LeaveRequest,
  LeaveStatus,
  PayrollAdjustment,
  ProAssignment,
  PunchSource,
  SalaryReleaseSchedule,
  SalaryReleaseStatus,
  Section,
  ShiftSchedule,
  UserRole,
} from '../types/hr';
import {
  adjustLeaveBalance,
  advanceLeaveApproval,
  buildLeaveApprovalChain,
  evaluateModelLateness,
  evaluateStartupEndpointResults,
  getEffectiveShiftStart,
  getStartupEndpointsForRole,
  isAttendanceTracked,
  normalizeUserRole,
  resolveApprovalWorkflow,
  SettledStartupItem,
} from '../utils/hrLogic';
import { createInitialSeedData } from './seedData';

export const USE_MOCK_API =
  (import.meta.env.VITE_USE_MOCK_API as string | undefined) !== 'false';

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://192.168.1.50:8000/api/v1';

const STORAGE_KEY = 'yaldi_hr_db_v2';
const SESSION_KEY = 'yaldi_hr_session_v2';
const SERVER_CONFIG_KEY = 'yaldi_hr_server_config_v1';

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

export class ApiHttpError extends Error {
  endpoint: string;
  status: number | null;
  statusText: string;
  isTimeout: boolean;

  constructor(params: {
    endpoint: string;
    status: number | null;
    statusText: string;
    message: string;
    isTimeout?: boolean;
  }) {
    super(params.message);
    this.name = 'ApiHttpError';
    this.endpoint = params.endpoint;
    this.status = params.status;
    this.statusText = params.statusText;
    this.isTimeout = Boolean(params.isTimeout);
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

  return {
    id: asString(obj.id ?? obj.user_id ?? ''),
    employeeCode: asString(obj.employeeCode ?? obj.employee_code ?? ''),
    fullName: asString(obj.fullName ?? obj.full_name ?? obj.name ?? 'Employee'),
    email: asString(obj.email ?? ''),
    phone: asString(obj.phone ?? ''),
    avatarUrl: asString(obj.avatarUrl ?? obj.avatar_url ?? '') || undefined,
    passwordHash: asString(obj.passwordHash ?? obj.password_hash ?? '') || undefined,
    mustChangePassword: asBoolean(obj.mustChangePassword ?? obj.must_change_password, false),
    role: normalizeUserRole(obj.role),
    primaryCompanyId: asString(obj.primaryCompanyId ?? obj.primary_company_id ?? ''),
    sharedCompanyIds: asStringArray(obj.sharedCompanyIds ?? obj.shared_company_ids),
    sectionId: asString(obj.sectionId ?? obj.section_id ?? ''),
    managedSectionIds: asStringArray(
      obj.managedSectionIds ?? obj.managed_section_ids ?? obj.managed_section_ids_json
    ),
    labelIds: asStringArray(obj.labelIds ?? obj.label_ids),
    modelId: asString(obj.modelId ?? obj.model_id ?? ''),
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
    bankDetails:
      bankName || accountNumber || iban
        ? { bankName, accountNumber, iban }
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
    throw new ApiHttpError({
      endpoint: path,
      status: res.status,
      statusText,
      message: extractErrorMessage(rawBody, res.status, statusText),
    });
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function readDb(): HRDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HRDatabase;
      if (parsed && Array.isArray(parsed.companies) && Array.isArray(parsed.employees)) {
        return parsed;
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

  async pingServer(): Promise<boolean> {
    const cfg = getServerConfig();
    if (cfg.useMockApi) return true;
    try {
      const res = await fetch(`${cfg.apiBaseUrl}/health`, { method: 'GET' });
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
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const raw = await restFetch<unknown>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        const session = normalizeAuthSession(raw, email.trim(), 'live');
        saveSession(session);
        return session;
      }
      if (!email.trim() || !password.trim()) {
        throw new Error('Enter both work email and password.');
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
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const res = await restFetch<Record<string, unknown>>('/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            ...params,
            user_id: params.userId,
            current_password: params.currentPassword,
            new_password: params.newPassword,
            is_forced_first_login: Boolean(params.isForcedFirstLogin),
          }),
        });
        const current = getStoredSession();
        const next = res?.session
          ? normalizeAuthSession(res.session, current?.email, 'live')
          : current
            ? { ...current, mustChangePassword: false }
            : null;
        if (next) {
          next.mustChangePassword = false;
          saveSession(next);
        }
        return next;
      }
      if (!params.newPassword || params.newPassword.trim().length < 6) {
        throw new Error('New password must be at least 6 characters.');
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
          ? { ...e, passwordHash: params.newPassword.trim(), mustChangePassword: false }
          : e
      );
      writeDb(db);
      const current = getStoredSession();
      if (current && current.userId === params.userId) {
        const updated: AuthSession = { ...current, mustChangePassword: false };
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
      const rawEmployees = Array.isArray(rawValues.employees) ? rawValues.employees : [];
      const rawSettings =
        rawValues.settings && typeof rawValues.settings === 'object'
          ? {
              ...createDefaultLiveSettings(cfg.apiBaseUrl),
              ...(rawValues.settings as Partial<AppSettings>),
              apiBaseUrl: cfg.apiBaseUrl,
            }
          : createDefaultLiveSettings(cfg.apiBaseUrl);

      return {
        companies: Array.isArray(rawValues.companies) ? (rawValues.companies as Company[]) : [],
        sections: Array.isArray(rawValues.sections) ? (rawValues.sections as Section[]) : [],
        labels: Array.isArray(rawValues.labels) ? (rawValues.labels as EmployeeLabel[]) : [],
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
        payrollAdjustments: Array.isArray(rawValues.payrollAdjustments)
          ? (rawValues.payrollAdjustments as PayrollAdjustment[])
          : [],
        salaryReleases: Array.isArray(rawValues.salaryReleases)
          ? (rawValues.salaryReleases as SalaryReleaseSchedule[])
          : [],
        settings: rawSettings,
      };
    }
    const db = readDb();
    return {
      ...db,
      employees: db.employees.map((e) => ({ ...e, role: normalizeUserRole(e.role) })),
      labels: db.labels ?? [],
      proAssignments: db.proAssignments ?? [],
      salaryReleases: db.salaryReleases ?? [],
      settings: { ...db.settings, apiBaseUrl: cfg.apiBaseUrl },
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
        return restFetch<Company>('/companies', { method: 'POST', body: JSON.stringify(input) });
      }
      const db = readDb();
      const created: Company = { ...input, id: makeId('comp') };
      db.companies = [...db.companies, created];
      writeDb(db);
      return created;
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
        return restFetch<Employee>('/users', { method: 'POST', body: JSON.stringify(input) });
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
    async update(id: string, patch: Partial<Employee>): Promise<Employee> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<Employee>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
      }
      const db = readDb();
      let updated: Employee | null = null;
      db.employees = db.employees.map((e) => {
        if (e.id === id) {
          updated = { ...e, ...patch };
          return updated;
        }
        return e;
      });
      if (!updated) throw new Error('Employee not found.');
      writeDb(db);
      return updated;
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
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const list = db.salaryReleases ?? [];
      const existingIdx = list.findIndex(
        (s) =>
          s.month === input.month &&
          s.scopeType === input.scopeType &&
          s.scopeId === input.scopeId &&
          s.companyId === input.companyId
      );
      const record: SalaryReleaseSchedule = {
        id: existingIdx >= 0 ? list[existingIdx].id : makeId('rel'),
        ...input,
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

  settings: {
    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        return restFetch<AppSettings>('/settings', {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
      const db = readDb();
      db.settings = { ...db.settings, ...patch };
      writeDb(db);
      return db.settings;
    },
  },
};
