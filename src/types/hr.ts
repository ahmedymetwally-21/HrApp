export enum UserRole {
  Employee = 'employee',
  Admin = 'admin',
  Management = 'management',
}

export enum ClockInPolicyMode {
  StrictMobileGPS = 'strict_mobile_gps',
  AllowOfficePC = 'allow_office_pc',
}

export enum DocumentType {
  Passport = 'Passport',
  EmiratesID = 'Emirates ID (EID)',
  Visa = 'Visa',
  LaborCard = 'Labor Card',
  EmploymentContract = 'Contract',
}

export type DocumentExpiryStatus = 'expired' | 'expiring_soon' | 'valid';

export enum LeaveType {
  Annual = 'Annual Leave',
  Sick = 'Sick Leave',
  Emergency = 'Emergency Leave',
  Unpaid = 'Unpaid Leave',
}

export enum LeaveStatus {
  Pending = 'Pending',
  Approved = 'Approved',
  Rejected = 'Rejected',
}

export enum DeductionCategory {
  LateArrival = 'Late Arrival',
  UnpaidLeave = 'Unpaid Leave',
  FinePenalty = 'Fine / Penalty',
  SalaryAdvance = 'Salary Advance',
  DamageOther = 'Damage / Other',
}

export type AdjustmentKind = 'deduction' | 'bonus';

export type PunchSource = 'Mobile App' | 'PC Web';

// ============================================================================
// Relational PostgreSQL Schema Mirror Types
// Mirrors tables: users, locations, user_locations, attendance_logs,
// documents, leave_requests, payroll_adjustments
// ============================================================================

export interface UserRow {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  avatar_url: string;
  role: UserRole;
  department: string;
  job_title: string;
  join_date: string;
  active: boolean;
  clock_in_policy_override: ClockInPolicyMode | 'inherit';
  base_salary_aed: number;
  housing_allowance_aed: number;
  transport_allowance_aed: number;
  other_allowance_aed: number;
}

export interface LocationRow {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  active: boolean;
}

export interface UserLocationRow {
  user_id: string;
  location_id: string;
}

export interface AttendanceLogRow {
  id: string;
  user_id: string;
  work_date: string;
  clock_in_time: string;
  clock_out_time?: string;
  location_id: string;
  location_name: string;
  clock_in_lat: number;
  clock_in_lng: number;
  clock_out_lat?: number;
  clock_out_lng?: number;
  accuracy_meters: number;
  device_type: PunchSource;
  is_late: boolean;
  late_minutes: number;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  doc_type: DocumentType;
  document_number: string;
  file_name: string;
  mime_type: string;
  file_url?: string;
  issue_date: string;
  expiry_date: string;
  uploaded_at: string;
  notes?: string;
}

export interface LeaveRequestRow {
  id: string;
  user_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  reason: string;
  attachment_name?: string;
  attachment_url?: string;
  status: LeaveStatus;
  submitted_at: string;
  reviewed_by?: string;
  reviewed_by_role?: UserRole;
  reviewed_at?: string;
  manager_comment?: string;
  overridden_by_management?: boolean;
}

export interface PayrollAdjustmentRow {
  id: string;
  user_id: string;
  pay_month: string; // YYYY-MM
  kind: AdjustmentKind;
  category: DeductionCategory | 'Performance Bonus' | 'Overtime Allowance';
  amount_aed: number;
  effective_date: string;
  reason: string;
  created_by: string;
  created_by_role: UserRole;
  created_at: string;
}

// ============================================================================
// Application Domain Models
// ============================================================================

export interface GeofenceZone {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
  active: boolean;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: DocumentType;
  documentNumber: string;
  fileName: string;
  fileType: string;
  fileDataUrl?: string;
  issueDate: string; // YYYY-MM-DD
  expiryDate: string; // YYYY-MM-DD
  uploadedAt: string; // ISO
  notes?: string;
}

export interface LeaveBalance {
  annualTotal: number;
  annualUsed: number;
  sickTotal: number;
  sickUsed: number;
  emergencyTotal: number;
  emergencyUsed: number;
  unpaidUsed: number;
}

export interface SalaryStructure {
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl: string;
  role: UserRole;
  department: string;
  jobTitle: string;
  joinDate: string; // YYYY-MM-DD
  active: boolean;
  assignedZoneIds: string[];
  clockInPolicyOverride?: ClockInPolicyMode | 'inherit';
  salary: SalaryStructure;
  leaveBalance: LeaveBalance;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  date: string; // YYYY-MM-DD
  clockInTime: string; // ISO
  clockOutTime?: string; // ISO
  clockInZoneId: string;
  clockInZoneName: string;
  clockInLat: number;
  clockInLng: number;
  clockOutLat?: number;
  clockOutLng?: number;
  accuracyMeters: number;
  punchSource: PunchSource;
  isLate: boolean;
  lateMinutes: number;
  notes?: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  type: LeaveType;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  days: number;
  reason: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  status: LeaveStatus;
  submittedAt: string; // ISO
  reviewedBy?: string;
  reviewedByRole?: UserRole;
  reviewedAt?: string;
  managerComment?: string;
  overriddenByManagement?: boolean;
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  month: string; // YYYY-MM
  kind: AdjustmentKind;
  category: DeductionCategory | 'Performance Bonus' | 'Overtime Allowance';
  amountAED: number;
  date: string; // YYYY-MM-DD
  reason: string;
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string; // ISO
}

export interface AppSettings {
  companyName: string;
  globalClockInPolicy: ClockInPolicyMode;
  workStartTime: string; // "09:00"
  gracePeriodMinutes: number; // e.g. 15
  maxMobileAccuracyMeters: number; // 150
  apiBaseUrl: string;
}

export interface AuthSession {
  token: string;
  userId: string;
  role: UserRole;
  mode: 'demo' | 'live';
}

export interface GPSReading {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
  isSimulated: boolean;
  label?: string;
}

export interface ClockInEvaluation {
  allowed: boolean;
  insideZone: boolean;
  nearestZone: GeofenceZone | null;
  distanceMeters: number | null;
  effectivePolicy: ClockInPolicyMode;
  punchSource: PunchSource;
  blockReason: string | null;
}

export interface MonthlyPayrollRow {
  employee: Employee;
  month: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  totalAllowances: number;
  grossSalary: number;
  bonuses: PayrollAdjustment[];
  totalBonuses: number;
  deductions: PayrollAdjustment[];
  totalDeductions: number;
  netSalary: number;
}

export interface HRDatabase {
  employees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  payrollAdjustments: PayrollAdjustment[];
  settings: AppSettings;
}
