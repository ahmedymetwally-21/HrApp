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
  EmploymentContract = 'Employment Contract',
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
  Other = 'Other',
}

export type AdjustmentKind = 'deduction' | 'bonus';

export type PunchSource = 'Mobile GPS' | 'Web/PC';

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
