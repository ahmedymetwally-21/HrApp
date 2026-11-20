/**
 * Yaldi HR — Relational Database-Ready TypeScript Schema
 *
 * Designed to map 1:1 to self-hosted PostgreSQL tables:
 * - companies
 * - sections
 * - employee_models
 * - users
 * - user_companies
 * - locations
 * - attendance_logs
 * - attendance_audit
 * - documents
 * - leave_requests
 * - approval_workflows
 * - payroll_deductions
 */

export type Language = 'en' | 'ar' | 'ur';

export enum UserRole {
  MainManager = 'main_manager',
  HRAdmin = 'hr_admin',
  SectionManager = 'section_manager',
  SectionCoManager = 'section_co_manager',
  Employee = 'employee',
}

export enum ClockInPolicyMode {
  StrictMobileGPS = 'strict_mobile_gps',
  AllowOfficePC = 'allow_office_pc',
}

export type PunchSource = 'Mobile App' | 'PC Web';

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
  Lateness = 'Lateness',
  UnpaidLeave = 'Unpaid Leave',
  FinePenalty = 'Fine / Penalty',
  SalaryAdvance = 'Salary Advance',
  DamageOther = 'Damage / Other',
}

export type AdjustmentKind = 'deduction' | 'bonus';

export enum BuiltInDocumentType {
  Passport = 'Passport',
  EmiratesID = 'Emirates ID (EID)',
  Visa = 'Visa',
  LaborCard = 'Labor Card',
  EmploymentContract = 'Employment Contract',
  DrivingLicense = 'Driving License',
}

export type DocumentTypeValue = BuiltInDocumentType | string;

export type Weekday = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type ApprovalStepRole = 'section_manager' | 'hr_admin' | 'main_manager';

export interface Company {
  id: string;
  code: string;
  name: string;
  industry: string;
  city: string;
  active: boolean;
}

export interface Section {
  id: string;
  name: string;
  code: string;
}

export interface LatenessPenaltyTier {
  id: string;
  minLateMinutes: number;
  maxLateMinutes: number | null; // null means open-ended (e.g. > 60 mins)
  penaltyAED: number;
}

export interface LeaveQuotas {
  annualTotal: number;
  sickTotal: number;
  emergencyTotal: number;
  unpaidLimit: number;
}

export interface EmployeeModel {
  id: string;
  name: string;
  description: string;
  shiftStart: string; // HH:mm fixed shift start
  shiftEnd: string;   // HH:mm fixed shift end (no overtime calculated)
  workingDays: Weekday[];
  graceMinutes: number;
  latenessTiers: LatenessPenaltyTier[];
  leaveQuotas: LeaveQuotas;
  requiredDocuments: DocumentTypeValue[];
}

export interface SalaryStructure {
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
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

export interface ShiftSchedule {
  shiftStart: string;
  shiftEnd: string;
  workingDays: Weekday[];
}

export interface PendingShiftProposal {
  shiftStart: string;
  shiftEnd: string;
  workingDays: Weekday[];
  proposedBy: string;
  proposedAt: string;
  status: 'pending_manager_approval';
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  role: UserRole;
  primaryCompanyId: string;
  sharedCompanyIds: string[]; // Secondary companies where this employee also operates
  sectionId: string;
  managedSectionIds: string[]; // For Section Manager / Section Co-Manager scoping
  modelId: string;
  jobTitle: string;
  joinDate: string; // YYYY-MM-DD
  active: boolean;
  assignedZoneIds: string[];
  clockInPolicyOverride?: ClockInPolicyMode | 'inherit';
  salary: SalaryStructure;
  leaveBalance: LeaveBalance;
  customShift?: ShiftSchedule; // Overrides model fixed shift once approved
  pendingShiftProposal?: PendingShiftProposal | null;
}

export interface GeofenceZone {
  id: string;
  companyId: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radiusMeters: number; // 50m - 500m
  active: boolean;
}

export interface EmployeeDocument {
  id: string;
  employeeId: string;
  type: DocumentTypeValue;
  documentNumber: string;
  issueDate: string;
  expiryDate: string;
  fileName: string;
  fileType: string;
  fileDataUrl?: string;
  uploadedAt: string;
  notes?: string;
}

export interface AttendanceLog {
  id: string;
  employeeId: string;
  companyId: string;
  date: string; // YYYY-MM-DD
  clockInTime: string; // ISO
  clockOutTime: string | null; // ISO
  zoneId: string;
  zoneName: string;
  clockInLat: number;
  clockInLng: number;
  clockOutLat?: number;
  clockOutLng?: number;
  accuracyMeters: number;
  punchSource: PunchSource;
  isLate: boolean;
  lateMinutes: number;
  latenessPenaltyAED: number;
  latenessExcused: boolean;
  excuseNote?: string;
  excusedBy?: string;
  modifiedBy?: string;
  notes?: string;
}

export interface AttendanceAuditEntry {
  id: string;
  attendanceLogId: string;
  employeeId: string;
  action: 'excuse_accepted' | 'punch_modified';
  actorName: string;
  actorRole: UserRole;
  summary: string;
  previousValue?: string;
  newValue?: string;
  timestamp: string;
}

export interface ApprovalStepRecord {
  stepOrder: number;
  role: ApprovalStepRole;
  status: 'pending' | 'approved' | 'rejected' | 'skipped';
  actorName?: string;
  remark?: string;
  decidedAt?: string;
}

export interface CoManagerNote {
  id: string;
  authorName: string;
  note: string;
  createdAt: string;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  companyId: string;
  sectionId: string;
  type: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  attachmentName?: string;
  attachmentDataUrl?: string;
  status: LeaveStatus;
  submittedAt: string;
  approvalSteps: ApprovalStepRecord[];
  currentStepIndex: number; // Index into approvalSteps, or -1 if finalized
  coManagerNotes: CoManagerNote[];
}

export interface ApprovalWorkflow {
  id: string;
  name: string;
  companyId: string | 'all';
  sectionId: string | 'all';
  steps: ApprovalStepRole[];
  autoApproveMaxDays: number; // 0 disables auto-approval
}

export interface PayrollAdjustment {
  id: string;
  employeeId: string;
  companyId: string;
  month: string; // YYYY-MM
  kind: AdjustmentKind;
  category: DeductionCategory | 'Performance Bonus' | 'Incentive';
  amountAED: number;
  date: string;
  reason: string;
  source?: 'manual' | 'auto_lateness';
  attendanceLogId?: string;
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string;
}

export interface AppSettings {
  groupName: string;
  currency: 'AED';
  globalClockInPolicy: ClockInPolicyMode;
  maxMobileAccuracyMeters: number;
  customDocumentTypes: string[];
  apiBaseUrl: string;
}

export interface HRDatabase {
  companies: Company[];
  sections: Section[];
  employeeModels: EmployeeModel[];
  employees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  attendanceAudit: AttendanceAuditEntry[];
  leaves: LeaveRequest[];
  workflows: ApprovalWorkflow[];
  payrollAdjustments: PayrollAdjustment[];
  settings: AppSettings;
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
  reason: string;
  nearestZone: GeofenceZone | null;
  distanceMeters: number | null;
  outsideByMeters: number | null;
  effectivePolicy: ClockInPolicyMode;
  punchSource: PunchSource;
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
  totalBonuses: number;
  autoLatenessDeductions: number;
  manualDeductions: number;
  totalDeductions: number;
  netSalary: number;
  deductions: PayrollAdjustment[];
  bonuses: PayrollAdjustment[];
}

/* ============================================================================
 * Relational PostgreSQL Table Row Mirrors (1:1 Self-Hosted Backend Reference)
 * ========================================================================== */

export interface CompanyRow {
  id: string;
  code: string;
  name: string;
  industry: string;
  city: string;
  active: boolean;
}

export interface SectionRow {
  id: string;
  code: string;
  name: string;
}

export interface EmployeeModelRow {
  id: string;
  name: string;
  shift_start: string;
  shift_end: string;
  working_days_json: string;
  grace_minutes: number;
  lateness_tiers_json: string;
  leave_quotas_json: string;
  required_documents_json: string;
}

export interface UserRow {
  id: string;
  employee_code: string;
  full_name: string;
  email: string;
  phone: string;
  role: UserRole;
  primary_company_id: string;
  section_id: string;
  model_id: string;
  job_title: string;
  base_salary_aed: number;
  allowances_aed: number;
  active: boolean;
}

export interface UserCompanyRow {
  user_id: string;
  company_id: string;
  is_primary: boolean;
}

export interface LocationRow {
  id: string;
  company_id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  radius_meters: number;
  active: boolean;
}

export interface AttendanceLogRow {
  id: string;
  user_id: string;
  company_id: string;
  work_date: string;
  clock_in_at: string;
  clock_out_at: string | null;
  location_id: string;
  punch_source: PunchSource;
  late_minutes: number;
  lateness_penalty_aed: number;
  lateness_excused: boolean;
}

export interface AttendanceAuditRow {
  id: string;
  attendance_log_id: string;
  user_id: string;
  action: 'excuse_accepted' | 'punch_modified';
  actor_name: string;
  summary: string;
  created_at: string;
}

export interface DocumentRow {
  id: string;
  user_id: string;
  doc_type: string;
  document_number: string;
  issue_date: string;
  expiry_date: string;
  file_url: string;
}

export interface LeaveRequestRow {
  id: string;
  user_id: string;
  company_id: string;
  section_id: string;
  leave_type: LeaveType;
  start_date: string;
  end_date: string;
  days: number;
  status: LeaveStatus;
  approval_steps_json: string;
}

export interface ApprovalWorkflowRow {
  id: string;
  company_id: string | null;
  section_id: string | null;
  steps_json: string;
  auto_approve_max_days: number;
}

export interface PayrollDeductionRow {
  id: string;
  user_id: string;
  company_id: string;
  payroll_month: string;
  kind: AdjustmentKind;
  category: string;
  amount_aed: number;
  reason: string;
  created_by: string;
}
