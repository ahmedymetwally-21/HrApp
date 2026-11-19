/**
 * Masar HR Centralized API Client (`services/api.ts`)
 *
 * Flip `USE_MOCK_API` (or toggle Demo vs. Live Server Mode in Login / Admin Settings)
 * to switch cleanly between:
 *  - Demo / Local Mode: pre-populated realistic UAE dataset in localStorage
 *  - Live Self-Hosted Mode: REST API (GET/POST/PUT/DELETE) with JWT Bearer tokens
 *    pointing to your self-hosted PC / Ubuntu backend (VITE_API_BASE_URL).
 */

import {
  AppSettings,
  AttendanceLog,
  AuthSession,
  Employee,
  EmployeeDocument,
  GeofenceZone,
  HRDatabase,
  LeaveRequest,
  LeaveStatus,
  PayrollAdjustment,
  PunchSource,
  UserRole,
} from '../types/hr';
import { adjustLeaveBalance, evaluateLateArrival } from '../utils/hrLogic';
import { createInitialSeedData } from './seedData';

/**
 * Single boolean default flag for switching between localStorage Demo Mode and live REST API.
 * Can also be overridden at runtime via the Login / Admin Server Settings UI.
 */
export const USE_MOCK_API =
  (import.meta.env.VITE_USE_MOCK_API as string | undefined) !== 'false';

const DEFAULT_API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://192.168.1.50:8000/api/v1';

const STORAGE_KEY = 'masar_hr_db_v2';
const SESSION_KEY = 'masar_hr_session_v1';
const SERVER_CONFIG_KEY = 'masar_hr_server_config_v1';

export interface ServerConfig {
  useMockApi: boolean;
  apiBaseUrl: string;
}

export class ServerUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ServerUnreachableError';
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
    // Fallback to defaults
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
    // Ignore storage write failure
  }
  return normalized;
}

function getStoredSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as AuthSession) : null;
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
    // Ignore storage error
  }
}

async function restFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const config = getServerConfig();
  const session = getStoredSession();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  if (session?.token) {
    headers.Authorization = `Bearer ${session.token}`;
  }

  let res: Response;
  try {
    res = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers,
    });
  } catch {
    throw new ServerUnreachableError(
      `Unable to reach self-hosted HR server at ${config.apiBaseUrl}. Verify LAN/VPN connectivity.`
    );
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(text || `Server returned HTTP ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readDb(): HRDatabase {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as HRDatabase;
      if (parsed && Array.isArray(parsed.employees) && Array.isArray(parsed.geofences)) {
        return parsed;
      }
    }
  } catch {
    // Fallback to fresh seed data
  }
  const seeded = createInitialSeedData();
  writeDb(seeded);
  return seeded;
}

function writeDb(db: HRDatabase): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch (err) {
    console.warn('Unable to persist HR database to localStorage:', err);
  }
}

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

  // --- Auth ---
  auth: {
    getSession(): AuthSession | null {
      return getStoredSession();
    },

    async login(email: string, password: string): Promise<AuthSession> {
      const cfg = getServerConfig();
      if (!cfg.useMockApi) {
        const session = await restFetch<AuthSession>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        });
        saveSession(session);
        return session;
      }

      if (!email.trim() || !password.trim()) {
        throw new Error('Enter both your work email and password.');
      }
      const db = readDb();
      const matched = db.employees.find(
        (e) => e.email.toLowerCase() === email.trim().toLowerCase() && e.active
      );
      if (!matched) {
        throw new Error(
          'No active employee account found with that email. Try omar.khalid@masar.ae or use the Demo Role Switcher.'
        );
      }
      const session: AuthSession = {
        token: `demo-jwt-${matched.id}-${Date.now()}`,
        userId: matched.id,
        role: matched.role,
        mode: 'demo',
      };
      saveSession(session);
      return session;
    },

    async demoLogin(role: UserRole): Promise<AuthSession> {
      const db = readDb();
      const preferredMap: Record<UserRole, string> = {
        [UserRole.Employee]: 'emp-omar',
        [UserRole.Admin]: 'emp-layla',
        [UserRole.Management]: 'emp-tariq',
      };
      const emp =
        db.employees.find((e) => e.id === preferredMap[role]) ??
        db.employees.find((e) => e.role === role) ??
        db.employees[0];
      const session: AuthSession = {
        token: `demo-jwt-${emp.id}-${Date.now()}`,
        userId: emp.id,
        role,
        mode: 'demo',
      };
      saveSession(session);
      return session;
    },

    async logout(): Promise<void> {
      saveSession(null);
    },
  },

  async getDatabase(): Promise<HRDatabase> {
    const cfg = getServerConfig();
    if (!cfg.useMockApi) {
      const [employees, geofences, documents, attendance, leaves, payrollAdjustments, settings] =
        await Promise.all([
          restFetch<Employee[]>('/users'),
          restFetch<GeofenceZone[]>('/locations'),
          restFetch<EmployeeDocument[]>('/documents'),
          restFetch<AttendanceLog[]>('/attendance'),
          restFetch<LeaveRequest[]>('/leaves'),
          restFetch<PayrollAdjustment[]>('/payroll/adjustments'),
          restFetch<AppSettings>('/settings'),
        ]);
      return { employees, geofences, documents, attendance, leaves, payrollAdjustments, settings };
    }
    const db = readDb();
    return { ...db, settings: { ...db.settings, apiBaseUrl: cfg.apiBaseUrl } };
  },

  async resetDemoData(): Promise<HRDatabase> {
    const fresh = createInitialSeedData();
    writeDb(fresh);
    return fresh;
  },

  // --- Employees (`users`) ---
  employees: {
    async list(): Promise<Employee[]> {
      if (!getServerConfig().useMockApi) return restFetch<Employee[]>('/users');
      return readDb().employees;
    },

    async create(input: Omit<Employee, 'id'>): Promise<Employee> {
      if (!getServerConfig().useMockApi) {
        return restFetch<Employee>('/users', { method: 'POST', body: JSON.stringify(input) });
      }
      const db = readDb();
      const created: Employee = { ...input, id: generateId('emp') };
      db.employees = [created, ...db.employees];
      writeDb(db);
      return created;
    },

    async update(id: string, patch: Partial<Employee>): Promise<Employee> {
      if (!getServerConfig().useMockApi) {
        return restFetch<Employee>(`/users/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
      }
      const db = readDb();
      let updated: Employee | null = null;
      db.employees = db.employees.map((emp) => {
        if (emp.id !== id) return emp;
        updated = { ...emp, ...patch, id: emp.id };
        return updated;
      });
      if (!updated) throw new Error(`Employee ${id} not found`);
      writeDb(db);
      return updated;
    },
  },

  // --- Documents (`documents`) ---
  documents: {
    async list(): Promise<EmployeeDocument[]> {
      if (!getServerConfig().useMockApi) return restFetch<EmployeeDocument[]>('/documents');
      return readDb().documents;
    },

    async upload(input: Omit<EmployeeDocument, 'id' | 'uploadedAt'>): Promise<EmployeeDocument> {
      if (!getServerConfig().useMockApi) {
        return restFetch<EmployeeDocument>('/documents', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: EmployeeDocument = {
        ...input,
        id: generateId('doc'),
        uploadedAt: new Date().toISOString(),
      };
      db.documents = [created, ...db.documents];
      writeDb(db);
      return created;
    },

    async remove(id: string): Promise<void> {
      if (!getServerConfig().useMockApi) {
        await restFetch<void>(`/documents/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.documents = db.documents.filter((d) => d.id !== id);
      writeDb(db);
    },
  },

  // --- Geofences (`locations`) ---
  geofences: {
    async list(): Promise<GeofenceZone[]> {
      if (!getServerConfig().useMockApi) return restFetch<GeofenceZone[]>('/locations');
      return readDb().geofences;
    },

    async create(input: Omit<GeofenceZone, 'id'>): Promise<GeofenceZone> {
      if (!getServerConfig().useMockApi) {
        return restFetch<GeofenceZone>('/locations', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: GeofenceZone = { ...input, id: generateId('zone') };
      db.geofences = [...db.geofences, created];
      writeDb(db);
      return created;
    },

    async update(id: string, patch: Partial<GeofenceZone>): Promise<GeofenceZone> {
      if (!getServerConfig().useMockApi) {
        return restFetch<GeofenceZone>(`/locations/${id}`, {
          method: 'PUT',
          body: JSON.stringify(patch),
        });
      }
      const db = readDb();
      let updated: GeofenceZone | null = null;
      db.geofences = db.geofences.map((z) => {
        if (z.id !== id) return z;
        updated = { ...z, ...patch, id: z.id };
        return updated;
      });
      if (!updated) throw new Error(`Geofence ${id} not found`);
      writeDb(db);
      return updated;
    },

    async remove(id: string): Promise<void> {
      if (!getServerConfig().useMockApi) {
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

  // --- Attendance (`attendance_logs`) ---
  attendance: {
    async list(): Promise<AttendanceLog[]> {
      if (!getServerConfig().useMockApi) return restFetch<AttendanceLog[]>('/attendance');
      return readDb().attendance;
    },

    async clockIn(params: {
      employeeId: string;
      zoneId: string;
      zoneName: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      punchSource: PunchSource;
    }): Promise<AttendanceLog> {
      if (!getServerConfig().useMockApi) {
        return restFetch<AttendanceLog>('/attendance/clock-in', {
          method: 'POST',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      const nowIso = new Date().toISOString();
      const today = nowIso.slice(0, 10);
      const { isLate, lateMinutes } = evaluateLateArrival(
        nowIso,
        db.settings.workStartTime,
        db.settings.gracePeriodMinutes
      );

      const log: AttendanceLog = {
        id: generateId('att'),
        employeeId: params.employeeId,
        date: today,
        clockInTime: nowIso,
        clockInZoneId: params.zoneId,
        clockInZoneName: params.zoneName,
        clockInLat: params.latitude,
        clockInLng: params.longitude,
        accuracyMeters: params.accuracyMeters,
        punchSource: params.punchSource,
        isLate,
        lateMinutes,
      };
      db.attendance = [log, ...db.attendance];
      writeDb(db);
      return log;
    },

    async clockOut(params: {
      logId: string;
      latitude: number;
      longitude: number;
    }): Promise<AttendanceLog> {
      if (!getServerConfig().useMockApi) {
        return restFetch<AttendanceLog>(`/attendance/${params.logId}/clock-out`, {
          method: 'POST',
          body: JSON.stringify(params),
        });
      }
      const db = readDb();
      let updated: AttendanceLog | null = null;
      const nowIso = new Date().toISOString();
      db.attendance = db.attendance.map((log) => {
        if (log.id !== params.logId) return log;
        updated = {
          ...log,
          clockOutTime: nowIso,
          clockOutLat: params.latitude,
          clockOutLng: params.longitude,
        };
        return updated;
      });
      if (!updated) throw new Error(`Attendance log ${params.logId} not found`);
      writeDb(db);
      return updated;
    },
  },

  // --- Leaves (`leave_requests`) ---
  leaves: {
    async list(): Promise<LeaveRequest[]> {
      if (!getServerConfig().useMockApi) return restFetch<LeaveRequest[]>('/leaves');
      return readDb().leaves;
    },

    async submit(
      input: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt'>
    ): Promise<LeaveRequest> {
      if (!getServerConfig().useMockApi) {
        return restFetch<LeaveRequest>('/leaves', { method: 'POST', body: JSON.stringify(input) });
      }
      const db = readDb();
      const created: LeaveRequest = {
        ...input,
        id: generateId('lv'),
        status: LeaveStatus.Pending,
        submittedAt: new Date().toISOString(),
      };
      db.leaves = [created, ...db.leaves];
      writeDb(db);
      return created;
    },

    async decide(params: {
      leaveId: string;
      status: LeaveStatus.Approved | LeaveStatus.Rejected;
      reviewerName: string;
      reviewerRole: UserRole;
      comment: string;
    }): Promise<{ leave: LeaveRequest; employees: Employee[] }> {
      if (!getServerConfig().useMockApi) {
        return restFetch<{ leave: LeaveRequest; employees: Employee[] }>(
          `/leaves/${params.leaveId}/decision`,
          { method: 'PUT', body: JSON.stringify(params) }
        );
      }
      const db = readDb();
      const existing = db.leaves.find((l) => l.id === params.leaveId);
      if (!existing) throw new Error(`Leave request ${params.leaveId} not found`);

      const prevStatus = existing.status;
      const isOverride =
        prevStatus !== LeaveStatus.Pending && params.reviewerRole === UserRole.Management;

      if (prevStatus !== LeaveStatus.Approved && params.status === LeaveStatus.Approved) {
        db.employees = db.employees.map((e) =>
          e.id === existing.employeeId
            ? { ...e, leaveBalance: adjustLeaveBalance(e.leaveBalance, existing.type, existing.days) }
            : e
        );
      } else if (prevStatus === LeaveStatus.Approved && params.status === LeaveStatus.Rejected) {
        db.employees = db.employees.map((e) =>
          e.id === existing.employeeId
            ? {
                ...e,
                leaveBalance: adjustLeaveBalance(e.leaveBalance, existing.type, -existing.days),
              }
            : e
        );
      }

      const updatedLeave: LeaveRequest = {
        ...existing,
        status: params.status,
        reviewedBy: params.reviewerName,
        reviewedByRole: params.reviewerRole,
        reviewedAt: new Date().toISOString(),
        managerComment: params.comment.trim() || existing.managerComment,
        overriddenByManagement: isOverride ? true : existing.overriddenByManagement,
      };

      db.leaves = db.leaves.map((l) => (l.id === params.leaveId ? updatedLeave : l));
      writeDb(db);
      return { leave: updatedLeave, employees: db.employees };
    },
  },

  // --- Payroll Adjustments (`payroll_adjustments`) ---
  payroll: {
    async listAdjustments(): Promise<PayrollAdjustment[]> {
      if (!getServerConfig().useMockApi) {
        return restFetch<PayrollAdjustment[]>('/payroll/adjustments');
      }
      return readDb().payrollAdjustments;
    },

    async addAdjustment(
      input: Omit<PayrollAdjustment, 'id' | 'createdAt'>
    ): Promise<PayrollAdjustment> {
      if (!getServerConfig().useMockApi) {
        return restFetch<PayrollAdjustment>('/payroll/adjustments', {
          method: 'POST',
          body: JSON.stringify(input),
        });
      }
      const db = readDb();
      const created: PayrollAdjustment = {
        ...input,
        id: generateId('adj'),
        createdAt: new Date().toISOString(),
      };
      db.payrollAdjustments = [created, ...db.payrollAdjustments];
      writeDb(db);
      return created;
    },

    async removeAdjustment(id: string): Promise<void> {
      if (!getServerConfig().useMockApi) {
        await restFetch<void>(`/payroll/adjustments/${id}`, { method: 'DELETE' });
        return;
      }
      const db = readDb();
      db.payrollAdjustments = db.payrollAdjustments.filter((a) => a.id !== id);
      writeDb(db);
    },
  },

  // --- Settings ---
  settings: {
    async get(): Promise<AppSettings> {
      if (!getServerConfig().useMockApi) return restFetch<AppSettings>('/settings');
      return readDb().settings;
    },

    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      if (!getServerConfig().useMockApi) {
        return restFetch<AppSettings>('/settings', { method: 'PUT', body: JSON.stringify(patch) });
      }
      const db = readDb();
      db.settings = { ...db.settings, ...patch };
      writeDb(db);
      return db.settings;
    },
  },
};
