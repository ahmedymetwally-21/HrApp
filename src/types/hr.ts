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
  PRO = 'pro',
  Accounting = 'accounting',
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

export type PayrollEntryType =
  | 'earning_in_payroll'
  | 'earning_off_cycle'
  | 'deduction_in_payroll'
  | 'deduction_off_cycle';

export type DeductionTargetBucket =
  | 'additional_in_payroll'
  | 'additional_off_cycle'
  | 'main_salary';

export interface PayrollCategoryItem {
  id: string;
  type: PayrollEntryType;
  name: string;
  active: boolean;
  description?: string;
}

export interface PayrollEntry {
  id: string;
  employeeId: string;
  companyId: string;
  type: PayrollEntryType;
  categoryId: string;
  categoryName: string;
  amountAED: number;
  isPermanent: boolean;
  effectiveFrom: string; // YYYY-MM inclusive
  effectiveTo: string | null; // YYYY-MM inclusive; null = ongoing permanent
  durationMonths: number | null; // Set for temporary entries (e.g. 1, 3, 6)
  targetBucket?: DeductionTargetBucket | null; // Required for deduction_* types
  reason: string;
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string;
  updatedAt?: string;
}

export type EmployeeType = 'office_employee' | 'driver' | 'management';

export type DeductionWorkflowChain = 'manager_then_hr' | 'hr_only' | 'main_manager_only';

export interface DeductionWorkflowConfig {
  office_employee: DeductionWorkflowChain;
  driver: DeductionWorkflowChain;
  management: DeductionWorkflowChain;
  autoEscalationHours: number; // e.g., 48 (2 days) or 72 (3 days)
}

export type DeductionApprovalTrigger = 'off_day' | 'latency';

export type DeductionApprovalStatus =
  | 'pending_manager'
  | 'pending_hr_approval'
  | 'pending_hr_decision'
  | 'escalated_to_hr'
  | 'pending_main_manager'
  | 'approved'
  | 'waived';

export interface DeductionApprovalRequest {
  id: string;
  employeeId: string;
  companyId: string;
  sectionId: string;
  month: string; // YYYY-MM
  triggerType: DeductionApprovalTrigger;
  date: string; // YYYY-MM-DD
  amountAED: number;
  targetBucket: DeductionTargetBucket;
  reason: string;
  workflowChain: DeductionWorkflowChain;
  status: DeductionApprovalStatus;
  escalationDeadline: string; // ISO date-time
  managerActorName?: string;
  managerDecision?: 'approved' | 'rejected';
  managerNote?: string;
  managerDecidedAt?: string;
  hrActorName?: string;
  hrDecision?: 'approved' | 'waived';
  hrNote?: string;
  hrDecidedAt?: string;
  createdBy: string;
  createdByRole: UserRole;
  createdAt: string;
}

export type PatchReleaseBucket =
  | 'off_cycle'
  | 'upcoming_main_salary'
  | 'upcoming_additional_in_payroll'
  | 'upcoming_off_cycle';

export type PatchPaymentMethod = 'Cash' | 'Bank Transfer' | 'WPS';

export interface PatchReleaseAllocation {
  month: string; // YYYY-MM
  bucket: PatchReleaseBucket;
  amountAED: number;
}

export interface PatchMoneyRelease {
  id: string;
  employeeId: string;
  companyId: string;
  totalAmountAED: number;
  allocations: PatchReleaseAllocation[];
  paymentMethod: PatchPaymentMethod;
  releaseDate: string; // YYYY-MM-DD
  releasedBy: string;
  releasedByRole: UserRole;
  referenceNote?: string;
  createdAt: string;
}

export interface EmployeePendingBalanceItem {
  key: string;
  month: string;
  bucket: PatchReleaseBucket;
  earnedOrScheduledAED: number;
  alreadyReleasedAED: number;
  availableAED: number;
  impactsWps: boolean;
}

export interface Company {
  id: string;
  code: string;
  name: string;
  industry: string;
  city: string;
  active: boolean;
  molEstablishmentId?: string;
  wpsRoutingCode?: string;
  companyIban?: string;
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

export interface EmployeeLabel {
  id: string;
  name: string;
  color: string; // Hex color code
}

export interface BankDetails {
  bankName: string;
  accountNumber: string;
  iban: string;
  bankRoutingCode?: string;
}

export interface ProAssignment {
  id: string;
  proUserId: string;
  employeeId: string;
  accessStart: string; // ISO date-time
  accessExpiresAt: string; // ISO date-time
  assignedBy: string;
  notes?: string;
  createdAt: string;
}

export type SalaryReleaseStatus = 'Scheduled' | 'Processing' | 'Delayed' | 'Released';

export interface SalaryReleaseSchedule {
  id: string;
  month: string; // YYYY-MM
  payPeriod: string; // YYYY-MM or custom period label
  scopeType: 'section' | 'employee';
  scopeId: string; // sectionId or employeeId
  companyId: string | 'all';
  releaseDate: string; // YYYY-MM-DD
  status: SalaryReleaseStatus;
  delayedUntilDate?: string | null; // YYYY-MM-DD
  delayReason?: string | null;
  updatedBy: string;
  updatedAt: string;
}

export interface ResolvedSalaryRelease {
  month: string;
  payPeriod: string;
  releaseDate: string;
  status: SalaryReleaseStatus;
  delayedUntilDate?: string | null;
  delayReason?: string | null;
  source: 'employee' | 'section' | 'default';
}

export interface Employee {
  id: string;
  employeeCode: string;
  fullName: string;
  email: string;
  phone: string;
  avatarUrl?: string;
  passwordHash?: string; // Demo/local password store (hashed on real backend)
  mustChangePassword: boolean;
  role: UserRole;
  employeeType: EmployeeType;
  deductionWorkflowOverride?: DeductionWorkflowChain | 'inherit';
  primaryCompanyId: string;
  sharedCompanyIds: string[]; // Secondary/attached companies (also strict Accounting scope)
  sectionId: string;
  managedSectionIds: string[]; // Multi-section scoping for Section Manager / Co-Manager
  labelIds: string[]; // Multi-select custom HR status labels
  modelId: string;
  jobTitle: string;
  joinDate: string; // YYYY-MM-DD
  active: boolean;
  assignedZoneIds: string[]; // Empty array [] = Geofence Exempt (No-Zone Option)
  clockInPolicyOverride?: ClockInPolicyMode | 'inherit';
  salary: SalaryStructure;
  mohrePersonId?: string; // 14-digit UAE MOHRE Person ID / Labour Card #
  bankDetails?: BankDetails;
  leaveBalance: LeaveBalance;
  customShift?: ShiftSchedule; // Overrides model fixed shift once approved
  pendingShiftProposal?: PendingShiftProposal | null;
}

export type CreateEmployeePayload = Omit<
  Employee,
  'id' | 'mustChangePassword' | 'passwordHash'
> & {
  initialPassword: string;
};

export type UpdateEmployeePayload = Partial<Employee> & {
  resetPassword?: string;
};

export interface BulkImportUserRow {
  id?: string;
  employeeCode?: string;
  fullName?: string;
  email?: string;
  initialPassword?: string;
  role?: UserRole | string;
  phone?: string;
  company?: string;
  primaryCompanyId?: string;
  section?: string;
  sectionId?: string;
  employeeType?: EmployeeType | string;
  jobTitle?: string;
  joinDate?: string;
  baseSalary?: number;
  housingAllowance?: number;
  transportAllowance?: number;
  otherAllowance?: number;
  mohrePersonId?: string;
  bankName?: string;
  iban?: string;
  bankRoutingCode?: string;
}

export interface BulkImportRowError {
  rowNumber?: number;
  employeeCode?: string;
  email?: string;
  fullName?: string;
  error: string;
}

export interface BulkImportResult {
  createdCount: number;
  updatedCount: number;
  failedCount: number;
  errors: BulkImportRowError[];
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
  targetBucket?: DeductionTargetBucket | null;
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
  deductionWorkflowConfig: DeductionWorkflowConfig;
}

export interface HRDatabase {
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  employeeModels: EmployeeModel[];
  employees: Employee[];
  proAssignments: ProAssignment[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  attendanceAudit: AttendanceAuditEntry[];
  leaves: LeaveRequest[];
  workflows: ApprovalWorkflow[];
  payrollAdjustments: PayrollAdjustment[];
  payrollCategories: PayrollCategoryItem[];
  payrollEntries: PayrollEntry[];
  deductionApprovals: DeductionApprovalRequest[];
  patchReleases: PatchMoneyRelease[];
  salaryReleases: SalaryReleaseSchedule[];
  settings: AppSettings;
}

export interface AuthSession {
  token: string;
  userId: string;
  role: UserRole;
  mode: 'demo' | 'live';
  mustChangePassword?: boolean;
  fullName?: string;
  email?: string;
  employeeCode?: string;
  avatarUrl?: string;
  primaryCompanyId?: string;
  sectionId?: string;
}

export interface EndpointFailure {
  endpoint: string;
  status: number | null;
  statusText: string;
  message: string;
  isTimeout?: boolean;
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
  isGeofenceExempt?: boolean;
}

export interface MonthlyPayrollRow {
  employee: Employee;
  month: string;
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  otherAllowance: number;
  totalAllowances: number;
  grossSalary: number; // Main Salary = Basic + Allowances
  inPayrollEarnings: number; // Bucket 2: Additional Earning (In Payroll) + legacy bonuses
  offCycleEarnings: number; // Bucket 3: Additional Earning (Off Cycle) — NEVER in WPS
  inPayrollDeductions: number; // Auto-lateness + legacy deductions + deduction_in_payroll
  offCycleDeductions: number; // deduction_off_cycle
  wpsFixedIncome: number; // Basic Salary (kept intact in WPS report)
  wpsVariableIncome: number; // Allowances + In-Payroll Earnings - In-Payroll Deductions - Early WPS Patch Releases
  wpsTotalPayout: number; // wpsFixedIncome + wpsVariableIncome
  offCycleNetPayout: number; // Off-Cycle net payout (outside WPS)
  approvedWorkflowDeductions: number; // Final HR/Main-Manager approved off-day & latency deductions
  earlyWpsReleasedAED: number; // Patch releases allocated against upcoming Main Salary / Additional In-Payroll
  earlyOffCycleReleasedAED: number; // Patch releases allocated against this month's Off-Cycle bucket
  remainingOffCyclePayout: number; // max(0, offCycleNetPayout - earlyOffCycleReleasedAED)
  remainingNetPayable: number; // max(0, netSalary - earlyWpsReleasedAED - earlyOffCycleReleasedAED)
  unpaidLeaveDays: number;
  totalBonuses: number;
  autoLatenessDeductions: number;
  manualDeductions: number;
  totalDeductions: number;
  netSalary: number;
  deductions: PayrollAdjustment[];
  bonuses: PayrollAdjustment[];
  inPayrollEarningEntries: PayrollEntry[];
  offCycleEarningEntries: PayrollEntry[];
  inPayrollDeductionEntries: PayrollEntry[];
  offCycleDeductionEntries: PayrollEntry[];
  approvedDeductionRequests: DeductionApprovalRequest[];
  appliedPatchReleases: PatchMoneyRelease[];
  release: ResolvedSalaryRelease;
}

export interface AdcbWpsEdrRow {
  recordType: 'EDR';
  mohrePersonId: string;
  bankRoutingCode: string;
  iban: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  daysInPeriod: number;
  fixedIncome: number; // Basic Salary
  variableIncome: number; // Allowances + In-Payroll Earnings - In-Payroll Deductions
  unpaidLeaveDays: number;
  employeeFullName: string;
}

export interface AdcbWpsScrRow {
  recordType: 'SCR';
  molEstablishmentId: string;
  companyWpsRoutingCode: string;
  fileDate: string; // YYYY-MM-DD
  fileTime: string; // HHMM
  salaryMonth: string; // MMYYYY
  totalEdrCount: number;
  totalPayoutAed: number;
  currency: 'AED';
  companyIban: string;
}

export interface AdcbWpsExportResult {
  company: Company;
  month: string;
  salaryMonthCode: string; // MMYYYY
  edrRows: AdcbWpsEdrRow[];
  scrRow: AdcbWpsScrRow;
  aoaRows: (string | number)[][];
  warnings: string[];
  totalEarlyWpsOffsetAed: number;
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
  mol_establishment_id?: string | null;
  wps_routing_code?: string | null;
  company_iban?: string | null;
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
  avatar_url?: string | null;
  password_hash?: string;
  must_change_password: boolean;
  role: UserRole;
  employee_type?: EmployeeType;
  deduction_workflow_override?: DeductionWorkflowChain | 'inherit' | null;
  primary_company_id: string;
  section_id: string;
  managed_section_ids_json: string;
  assigned_zone_ids_json: string;
  model_id: string;
  job_title: string;
  base_salary_aed: number;
  allowances_aed: number;
  mohre_person_id?: string | null;
  bank_name?: string | null;
  bank_routing_code?: string | null;
  account_number?: string | null;
  iban?: string | null;
  active: boolean;
}

export interface EmployeeLabelRow {
  id: string;
  name: string;
  color: string;
}

export interface ProAssignmentRow {
  id: string;
  pro_user_id: string;
  employee_id: string;
  access_start: string;
  access_expires_at: string;
  assigned_by: string;
  notes?: string | null;
  created_at: string;
}

export interface SalaryReleaseScheduleRow {
  id: string;
  payroll_month: string;
  pay_period: string;
  scope_type: 'section' | 'employee';
  scope_id: string;
  company_id: string;
  release_date: string;
  status: SalaryReleaseStatus;
  delayed_until_date?: string | null;
  delay_reason?: string | null;
  updated_by: string;
  updated_at: string;
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
