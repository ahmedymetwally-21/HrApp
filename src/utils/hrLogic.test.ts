import test from 'node:test';
import assert from 'node:assert/strict';
import {
  advanceLeaveApproval,
  buildLeaveApprovalChain,
  calculateEmployeePayroll,
  calculateHaversineDistanceMeters,
  canRoleActOnLeaveStep,
  evaluateClockInEligibility,
  evaluateModelLateness,
  getDocumentExpiryStatus,
  getMissingModelDocuments,
  getScopedEmployees,
  isSharedEmployeeInCompany,
  validateApiBaseUrl,
} from './hrLogic';
import {
  ApprovalWorkflow,
  AttendanceLog,
  BuiltInDocumentType,
  ClockInPolicyMode,
  DeductionCategory,
  Employee,
  EmployeeDocument,
  EmployeeModel,
  GeofenceZone,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PayrollAdjustment,
  UserRole,
} from '../types/hr';

const driversModel: EmployeeModel = {
  id: 'model-drivers',
  name: 'Drivers Model',
  description: '6-day fixed shift with Driving License required',
  shiftStart: '08:00',
  shiftEnd: '17:00',
  workingDays: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
  graceMinutes: 15,
  latenessTiers: [
    { id: 't1', minLateMinutes: 16, maxLateMinutes: 30, penaltyAED: 50 },
    { id: 't2', minLateMinutes: 31, maxLateMinutes: 60, penaltyAED: 100 },
    { id: 't3', minLateMinutes: 61, maxLateMinutes: null, penaltyAED: 150 },
  ],
  leaveQuotas: { annualTotal: 30, sickTotal: 15, emergencyTotal: 5, unpaidLimit: 30 },
  requiredDocuments: [
    BuiltInDocumentType.Passport,
    BuiltInDocumentType.EmiratesID,
    BuiltInDocumentType.DrivingLicense,
  ],
};

const baseEmp = (overrides: Partial<Employee>): Employee => ({
  id: 'emp-1',
  employeeCode: 'YLD-101',
  fullName: 'Test User',
  email: 'test@yaldi.ae',
  phone: '+971 50 000 0000',
  role: UserRole.Employee,
  primaryCompanyId: 'comp-yaldi',
  sharedCompanyIds: [],
  sectionId: 'sec-drivers',
  managedSectionIds: [],
  modelId: 'model-drivers',
  jobTitle: 'Fleet Driver',
  joinDate: '2024-01-01',
  active: true,
  assignedZoneIds: ['zone-1'],
  salary: {
    baseSalary: 5000,
    housingAllowance: 1500,
    transportAllowance: 500,
    otherAllowance: 0,
  },
  leaveBalance: {
    annualTotal: 30,
    annualUsed: 4,
    sickTotal: 15,
    sickUsed: 0,
    emergencyTotal: 5,
    emergencyUsed: 0,
    unpaidUsed: 0,
  },
  ...overrides,
});

const defaultWorkflow: ApprovalWorkflow = {
  id: 'wf-default',
  name: 'Standard 3-Step Approval',
  companyId: 'all',
  sectionId: 'all',
  steps: ['section_manager', 'hr_admin', 'main_manager'],
  autoApproveMaxDays: 0,
};

test('Haversine and strict geofence enforcement work for Drivers and PC Web policy', () => {
  const zone: GeofenceZone = {
    id: 'zone-1',
    companyId: 'comp-yaldi',
    name: 'Al Quoz Garage',
    address: 'Al Quoz Industrial 3, Dubai',
    latitude: 25.1342,
    longitude: 55.2286,
    radiusMeters: 150,
    active: true,
  };

  assert.equal(calculateHaversineDistanceMeters(25.1342, 55.2286, 25.1342, 55.2286), 0);

  const inside = evaluateClockInEligibility({
    reading: { latitude: 25.1345, longitude: 55.2288, accuracyMeters: 12, isSimulated: true },
    assignedZones: [zone],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
    maxAccuracyMeters: 150,
  });
  assert.equal(inside.allowed, true);
  assert.equal(inside.punchSource, 'Mobile App');

  const outside = evaluateClockInEligibility({
    reading: { latitude: 25.139, longitude: 55.2286, accuracyMeters: 12, isSimulated: true },
    assignedZones: [zone],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
    maxAccuracyMeters: 150,
  });
  assert.equal(outside.allowed, false);
  assert.ok((outside.outsideByMeters ?? 0) > 300);

  const pcBlocked = evaluateClockInEligibility({
    reading: { latitude: 25.1342, longitude: 55.2286, accuracyMeters: 20, isSimulated: true },
    assignedZones: [zone],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: true,
    maxAccuracyMeters: 150,
  });
  assert.equal(pcBlocked.allowed, false);
});

test('Employee Model tiered fixed AED lateness penalties evaluate grace period and tiers accurately', () => {
  // Within 15m grace period (08:14) -> 0 AED
  const onTime = evaluateModelLateness({
    clockInIso: '2026-11-19T08:14:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(onTime.isLate, false);
  assert.equal(onTime.penaltyAED, 0);

  // 24 mins late -> Tier 1 (50 AED)
  const tier1 = evaluateModelLateness({
    clockInIso: '2026-11-19T08:24:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(tier1.isLate, true);
  assert.equal(tier1.lateMinutes, 24);
  assert.equal(tier1.penaltyAED, 50);

  // 45 mins late -> Tier 2 (100 AED)
  const tier2 = evaluateModelLateness({
    clockInIso: '2026-11-19T08:45:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(tier2.penaltyAED, 100);

  // 75 mins late -> Tier 3 (150 AED)
  const tier3 = evaluateModelLateness({
    clockInIso: '2026-11-19T09:15:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(tier3.penaltyAED, 150);
});

test('Multi-company isolation, Shared Employees, and Section Manager strict RBAC scoping', () => {
  const driversMgr = baseEmp({
    id: 'emp-mgr',
    role: UserRole.SectionManager,
    primaryCompanyId: 'comp-yaldi',
    sectionId: 'sec-drivers',
    managedSectionIds: ['sec-drivers'],
  });
  const sharedDriver = baseEmp({
    id: 'emp-shared',
    primaryCompanyId: 'comp-wegdaniyah',
    sharedCompanyIds: ['comp-yaldi'],
    sectionId: 'sec-drivers',
  });
  const officeStaff = baseEmp({
    id: 'emp-office',
    primaryCompanyId: 'comp-yaldi',
    sectionId: 'sec-office',
  });

  const all = [driversMgr, sharedDriver, officeStaff];

  // Shared driver appears in comp-yaldi with shared badge
  assert.equal(isSharedEmployeeInCompany(sharedDriver, 'comp-yaldi'), true);
  assert.equal(isSharedEmployeeInCompany(sharedDriver, 'comp-wegdaniyah'), false);

  // Section Manager for Drivers only sees Drivers section (excludes Office Staff)
  const scoped = getScopedEmployees({
    employees: all,
    viewer: driversMgr,
    activeRole: UserRole.SectionManager,
    selectedCompanyId: 'comp-yaldi',
  });
  assert.deepEqual(
    scoped.map((e) => e.id),
    ['emp-mgr', 'emp-shared']
  );
});

test('Multi-step leave chain Smart Auto-Skip skips Step 1 for Section Manager and blocks Co-Manager approvals', () => {
  // Regular employee starts at Step 1 (Section Manager)
  const empChain = buildLeaveApprovalChain({
    applicantRole: UserRole.Employee,
    days: 3,
    workflow: defaultWorkflow,
  });
  assert.equal(empChain.currentStepIndex, 0);
  assert.equal(empChain.steps[0].role, 'section_manager');
  assert.equal(empChain.steps[0].status, 'pending');

  // Section Manager applying for themselves auto-skips Step 1 -> starts at Step 2 (HR)
  const mgrChain = buildLeaveApprovalChain({
    applicantRole: UserRole.SectionManager,
    days: 4,
    workflow: defaultWorkflow,
  });
  assert.equal(mgrChain.steps[0].status, 'skipped');
  assert.equal(mgrChain.currentStepIndex, 1);
  assert.equal(mgrChain.steps[1].role, 'hr_admin');

  // Co-Manager cannot approve Step 1; Section Manager can
  const leave: LeaveRequest = {
    id: 'lv-1',
    employeeId: 'emp-1',
    companyId: 'comp-yaldi',
    sectionId: 'sec-drivers',
    type: LeaveType.Annual,
    startDate: '2026-12-01',
    endDate: '2026-12-03',
    days: 3,
    reason: 'Family travel',
    status: LeaveStatus.Pending,
    submittedAt: '2026-11-19T08:00:00Z',
    approvalSteps: empChain.steps,
    currentStepIndex: empChain.currentStepIndex,
    coManagerNotes: [],
  };

  const coMgr = baseEmp({
    id: 'emp-comgr',
    role: UserRole.SectionCoManager,
    managedSectionIds: ['sec-drivers'],
  });
  const secMgr = baseEmp({
    id: 'emp-secmgr',
    role: UserRole.SectionManager,
    managedSectionIds: ['sec-drivers'],
  });
  const hrAdmin = baseEmp({ id: 'emp-hr', role: UserRole.HRAdmin, sectionId: 'sec-hr' });
  const mainMgr = baseEmp({ id: 'emp-main', role: UserRole.MainManager, sectionId: 'sec-mgmt' });

  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.SectionCoManager, actorEmployee: coMgr }), false);
  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.SectionManager, actorEmployee: secMgr }), true);

  // Advance through all 3 steps
  const afterStep1 = advanceLeaveApproval({ leave, decision: 'approved', actorName: 'Sec Mgr', remark: 'Covered' });
  assert.equal(afterStep1.currentStepIndex, 1);
  assert.equal(afterStep1.status, LeaveStatus.Pending);
  assert.equal(canRoleActOnLeaveStep({ leave: afterStep1, actorRole: UserRole.HRAdmin, actorEmployee: hrAdmin }), true);

  const afterStep2 = advanceLeaveApproval({ leave: afterStep1, decision: 'approved', actorName: 'HR', remark: 'Verified' });
  assert.equal(afterStep2.currentStepIndex, 2);
  assert.equal(canRoleActOnLeaveStep({ leave: afterStep2, actorRole: UserRole.MainManager, actorEmployee: mainMgr }), true);

  const afterStep3 = advanceLeaveApproval({ leave: afterStep2, decision: 'approved', actorName: 'Main Mgr', remark: 'Approved' });
  assert.equal(afterStep3.status, LeaveStatus.Approved);
  assert.equal(afterStep3.currentStepIndex, -1);
});

test('Payroll auto-includes unexcused lateness deductions and drops them once excused by Section Manager', () => {
  const emp = baseEmp({});
  const lateLog: AttendanceLog = {
    id: 'att-1',
    employeeId: emp.id,
    companyId: emp.primaryCompanyId,
    date: '2026-11-18',
    clockInTime: '2026-11-18T08:45:00',
    clockOutTime: '2026-11-18T17:05:00',
    zoneId: 'zone-1',
    zoneName: 'Al Quoz Garage',
    clockInLat: 25.1342,
    clockInLng: 55.2286,
    accuracyMeters: 12,
    punchSource: 'Mobile App',
    isLate: true,
    lateMinutes: 45,
    latenessPenaltyAED: 100,
    latenessExcused: false,
  };
  const manualFine: PayrollAdjustment = {
    id: 'adj-1',
    employeeId: emp.id,
    companyId: emp.primaryCompanyId,
    month: '2026-11',
    kind: 'deduction',
    category: DeductionCategory.FinePenalty,
    amountAED: 200,
    date: '2026-11-10',
    reason: 'Salik fine reimbursement',
    createdBy: 'HR',
    createdByRole: UserRole.HRAdmin,
    createdAt: '2026-11-10T10:00:00Z',
  };

  const unexcusedPay = calculateEmployeePayroll(emp, '2026-11', [manualFine], [lateLog]);
  assert.equal(unexcusedPay.grossSalary, 7000);
  assert.equal(unexcusedPay.autoLatenessDeductions, 100);
  assert.equal(unexcusedPay.manualDeductions, 200);
  assert.equal(unexcusedPay.netSalary, 6700);

  const excusedPay = calculateEmployeePayroll(
    emp,
    '2026-11',
    [manualFine],
    [{ ...lateLog, latenessExcused: true }]
  );
  assert.equal(excusedPay.autoLatenessDeductions, 0);
  assert.equal(excusedPay.netSalary, 6800);
});

test('Model document compliance flags missing Driving License and expiry windows accurately', () => {
  const docs: EmployeeDocument[] = [
    {
      id: 'd1',
      employeeId: 'emp-1',
      type: BuiltInDocumentType.Passport,
      documentNumber: 'P123',
      issueDate: '2022-01-01',
      expiryDate: '2026-11-10',
      fileName: 'p.pdf',
      fileType: 'application/pdf',
      uploadedAt: '2024-01-01',
    },
    {
      id: 'd2',
      employeeId: 'emp-1',
      type: BuiltInDocumentType.EmiratesID,
      documentNumber: '784-1',
      issueDate: '2024-01-01',
      expiryDate: '2026-12-05',
      fileName: 'eid.pdf',
      fileType: 'application/pdf',
      uploadedAt: '2024-01-01',
    },
  ];
  const ref = new Date(2026, 10, 19); // Nov 19, 2026
  assert.equal(getDocumentExpiryStatus('2026-11-10', ref).status, 'expired');
  assert.equal(getDocumentExpiryStatus('2026-12-05', ref).status, 'expiring_soon');
  assert.deepEqual(getMissingModelDocuments(docs, driversModel), [BuiltInDocumentType.DrivingLicense]);
  assert.equal(validateApiBaseUrl('http://192.168.1.50:8000/api/v1').valid, true);
  assert.equal(validateApiBaseUrl('bad-url').valid, false);
});
