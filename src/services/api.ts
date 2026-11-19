/**
 * Masar HR Data Service Layer (Self-Hosting Ready)
 *
 * Currently backed by localStorage for zero-dependency execution in AI Studio.
 * To connect to a self-hosted Ubuntu backend (FastAPI / Node.js + PostgreSQL):
 * 1. Set USE_REMOTE_API = true and configure VITE_API_BASE_URL in .env
 * 2. Replace the localStorage reads/writes inside each method with fetch() calls
 *    pointing to your LAN REST endpoints (e.g., GET/POST ${baseUrl}/employees).
 */

import {
  AppSettings,
  AttendanceLog,
  Employee,
  EmployeeDocument,
  GeofenceZone,
  HRDatabase,
  LeaveRequest,
  LeaveStatus,
  PayrollAdjustment,
  UserRole,
} from '../types/hr';
import { adjustLeaveBalance, evaluateLateArrival } from '../utils/hrLogic';
import { createInitialSeedData } from './seedData';

const STORAGE_KEY = 'masar_hr_db_v1';

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
    // Fallback to fresh seed data if storage is unavailable or corrupted
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
  async getDatabase(): Promise<HRDatabase> {
    return readDb();
  },

  async resetDemoData(): Promise<HRDatabase> {
    const fresh = createInitialSeedData();
    writeDb(fresh);
    return fresh;
  },

  // --- Employees ---
  employees: {
    async list(): Promise<Employee[]> {
      return readDb().employees;
    },

    async create(input: Omit<Employee, 'id'>): Promise<Employee> {
      const db = readDb();
      const created: Employee = { ...input, id: generateId('emp') };
      db.employees = [created, ...db.employees];
      writeDb(db);
      return created;
    },

    async update(id: string, patch: Partial<Employee>): Promise<Employee> {
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

    async toggleActive(id: string, active: boolean): Promise<Employee> {
      return api.employees.update(id, { active });
    },
  },

  // --- Documents ---
  documents: {
    async list(): Promise<EmployeeDocument[]> {
      return readDb().documents;
    },

    async upload(input: Omit<EmployeeDocument, 'id' | 'uploadedAt'>): Promise<EmployeeDocument> {
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
      const db = readDb();
      db.documents = db.documents.filter((d) => d.id !== id);
      writeDb(db);
    },
  },

  // --- Geofences ---
  geofences: {
    async list(): Promise<GeofenceZone[]> {
      return readDb().geofences;
    },

    async create(input: Omit<GeofenceZone, 'id'>): Promise<GeofenceZone> {
      const db = readDb();
      const created: GeofenceZone = { ...input, id: generateId('zone') };
      db.geofences = [...db.geofences, created];
      writeDb(db);
      return created;
    },

    async update(id: string, patch: Partial<GeofenceZone>): Promise<GeofenceZone> {
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
      const db = readDb();
      db.geofences = db.geofences.filter((z) => z.id !== id);
      db.employees = db.employees.map((e) => ({
        ...e,
        assignedZoneIds: e.assignedZoneIds.filter((zid) => zid !== id),
      }));
      writeDb(db);
    },
  },

  // --- Attendance ---
  attendance: {
    async list(): Promise<AttendanceLog[]> {
      return readDb().attendance;
    },

    async clockIn(params: {
      employeeId: string;
      zoneId: string;
      zoneName: string;
      latitude: number;
      longitude: number;
      accuracyMeters: number;
      punchSource: 'Mobile GPS' | 'Web/PC';
    }): Promise<AttendanceLog> {
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

  // --- Leaves ---
  leaves: {
    async list(): Promise<LeaveRequest[]> {
      return readDb().leaves;
    },

    async submit(
      input: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt'>
    ): Promise<LeaveRequest> {
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
      const db = readDb();
      const existing = db.leaves.find((l) => l.id === params.leaveId);
      if (!existing) throw new Error(`Leave request ${params.leaveId} not found`);

      const prevStatus = existing.status;
      const isOverride =
        prevStatus !== LeaveStatus.Pending && params.reviewerRole === UserRole.Management;

      // Update employee balance cleanly when transitioning into or out of Approved
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

  // --- Payroll Adjustments (Deductions & Bonuses) ---
  payroll: {
    async listAdjustments(): Promise<PayrollAdjustment[]> {
      return readDb().payrollAdjustments;
    },

    async addAdjustment(
      input: Omit<PayrollAdjustment, 'id' | 'createdAt'>
    ): Promise<PayrollAdjustment> {
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
      const db = readDb();
      db.payrollAdjustments = db.payrollAdjustments.filter((a) => a.id !== id);
      writeDb(db);
    },
  },

  // --- Settings ---
  settings: {
    async get(): Promise<AppSettings> {
      return readDb().settings;
    },

    async update(patch: Partial<AppSettings>): Promise<AppSettings> {
      const db = readDb();
      db.settings = { ...db.settings, ...patch };
      writeDb(db);
      return db.settings;
    },
  },
};
