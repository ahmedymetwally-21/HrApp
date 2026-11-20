import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BuiltInDocumentType,
  ClockInPolicyMode,
  DeductionCategory,
  Employee,
  EmployeeDocument,
  EmployeeModel,
  GeofenceZone,
  LeaveStatus,
  ProAssignment,
  SalaryReleaseSchedule,
  UserRole,
} from '../types/hr';
import {
  advanceLeaveApproval,
  buildLeaveApprovalChain,
  buildPayrollExportRecords,
  calculateEmployeePayroll,
  calculateHaversineDistanceMeters,
  canControlSalaryRelease,
  canRoleActOnLeaveStep,
  evaluateClockInEligibility,
  evaluateModelLateness,
  getDocumentExpiryStatus,
  getDocumentPreviewSource,
  getMissingModelDocuments,
  getScopedEmployees,
  isAttendanceTracked,
  isPayrollEligible,
  resolveApprovalWorkflow,
} from './hrLogic';

const dubaiHQ: GeofenceZone = {
  id: 'zone-hq',
  companyId: 'comp-yaldi',
  name: 'Yaldi HQ',
  address: 'Business Bay, Dubai',
  latitude: 25.1862,
  longitude: 55.2744,
  radiusMeters: 200,
  active: true,
};

const driversModel: EmployeeModel = {
  id: 'model-drivers',
  name: 'Drivers Model',
  description: 'Drivers',
  shiftStart: '08:00',
  shiftEnd: '17:00',
  workingDays: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu'],
  graceMinutes: 15,
  latenessTiers: [
    { id: 't1', minLateMinutes: 16, maxLateMinutes: 30, penaltyAED: 50 },
    { id: 't2', minLateMinutes: 31, maxLateMinutes: 60, penaltyAED: 100 },
    { id: 't3', minLateMinutes: 61, maxLateMinutes: null, penaltyAED: 200 },
  ],
  leaveQuotas: { annualTotal: 30, sickTotal: 15, emergencyTotal: 5, unpaidLimit: 30 },
  requiredDocuments: [
    BuiltInDocumentType.Passport,
    BuiltInDocumentType.EmiratesID,
    BuiltInDocumentType.DrivingLicense,
  ],
};

function makeEmp(overrides: Partial<Employee>): Employee {
  return {
    id: 'emp-1',
    employeeCode: 'YLD-001',
    fullName: 'Test Staff',
    email: 'staff@yaldi.ae',
    phone: '+971 50 000 0000',
    mustChangePassword: false,
    role: UserRole.Employee,
    primaryCompanyId: 'comp-yaldi',
    sharedCompanyIds: [],
    sectionId: 'sec-drivers',
    managedSectionIds: [],
    labelIds: [],
    modelId: 'model-drivers',
    jobTitle: 'Driver',
    joinDate: '2024-01-01',
    active: true,
    assignedZoneIds: ['zone-hq'],
    salary: { baseSalary: 5000, housingAllowance: 1000, transportAllowance: 500, otherAllowance: 0 },
    bankDetails: {
      bankName: 'Emirates NBD',
      accountNumber: '101-555555-01',
      iban: 'AE070260001015555550101',
    },
    leaveBalance: {
      annualTotal: 30,
      annualUsed: 0,
      sickTotal: 15,
      sickUsed: 0,
      emergencyTotal: 5,
      emergencyUsed: 0,
      unpaidUsed: 0,
    },
    ...overrides,
  };
}

test('Haversine, strict geofence, and No-Zone exemption work accurately', () => {
  const insideDist = calculateHaversineDistanceMeters(25.1862, 55.2744, 25.1863, 55.2745);
  assert.ok(insideDist < 30);

  const allowed = evaluateClockInEligibility({
    reading: { latitude: 25.1863, longitude: 55.2745, accuracyMeters: 15, isSimulated: true },
    assignedZones: [dubaiHQ],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
    maxAccuracyMeters: 150,
    hasNoAssignedZones: false,
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.nearestZone?.id, 'zone-hq');

  const blockedOutside = evaluateClockInEligibility({
    reading: { latitude: 25.25, longitude: 55.36, accuracyMeters: 12, isSimulated: true },
    assignedZones: [dubaiHQ],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
    maxAccuracyMeters: 150,
    hasNoAssignedZones: false,
  });
  assert.equal(blockedOutside.allowed, false);
  assert.ok((blockedOutside.outsideByMeters ?? 0) > 1000);

  const exemptAllowed = evaluateClockInEligibility({
    reading: null,
    assignedZones: [],
    effectivePolicy: ClockInPolicyMode.AllowOfficePC,
    isDesktopDevice: false,
    maxAccuracyMeters: 150,
    hasNoAssignedZones: true,
  });
  assert.equal(exemptAllowed.allowed, true);
  assert.equal(exemptAllowed.isGeofenceExempt, true);
});

test('Employee Model tiered fixed AED lateness penalties evaluate grace period and tiers accurately', () => {
  const onTime = evaluateModelLateness({
    clockInIso: '2026-04-10T08:12:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(onTime.isLate, false);
  assert.equal(onTime.penaltyAED, 0);

  const tier1 = evaluateModelLateness({
    clockInIso: '2026-04-10T08:25:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(tier1.isLate, true);
  assert.equal(tier1.lateMinutes, 25);
  assert.equal(tier1.penaltyAED, 50);

  const tier3 = evaluateModelLateness({
    clockInIso: '2026-04-10T09:30:00',
    shiftStartHHmm: '08:00',
    model: driversModel,
  });
  assert.equal(tier3.penaltyAED, 200);
});

test('PRO time-limited access only exposes active (non-expired) assigned employees', () => {
  const proUser = makeEmp({ id: 'emp-pro', role: UserRole.PRO });
  const empActive = makeEmp({ id: 'emp-a', fullName: 'Active Emp' });
  const empExpired = makeEmp({ id: 'emp-e', fullName: 'Expired Emp' });
  const empUnassigned = makeEmp({ id: 'emp-u', fullName: 'Unassigned Emp' });

  const now = new Date('2026-06-15T12:00:00Z');
  const assignments: ProAssignment[] = [
    {
      id: 'pa-1',
      proUserId: 'emp-pro',
      employeeId: 'emp-a',
      accessStart: '2026-06-10T00:00:00Z',
      accessExpiresAt: '2026-06-20T23:59:59Z',
      assignedBy: 'HR Admin',
      createdAt: '2026-06-10T00:00:00Z',
    },
    {
      id: 'pa-2',
      proUserId: 'emp-pro',
      employeeId: 'emp-e',
      accessStart: '2026-05-01T00:00:00Z',
      accessExpiresAt: '2026-06-01T23:59:59Z',
      assignedBy: 'HR Admin',
      createdAt: '2026-05-01T00:00:00Z',
    },
  ];

  const scoped = getScopedEmployees({
    employees: [proUser, empActive, empExpired, empUnassigned],
    viewer: proUser,
    activeRole: UserRole.PRO,
    selectedCompanyId: 'all',
    proAssignments: assignments,
    now,
  });

  assert.deepEqual(
    scoped.map((e) => e.id),
    ['emp-a']
  );
});

test('Accounting strict company scoping returns zero data for unattached companies and excludes Main Manager', () => {
  const accUser = makeEmp({
    id: 'emp-acc',
    role: UserRole.Accounting,
    primaryCompanyId: 'comp-yaldi',
    sharedCompanyIds: ['comp-wegdaniyah'],
  });
  const mainMgr = makeEmp({
    id: 'emp-mm',
    role: UserRole.MainManager,
    primaryCompanyId: 'comp-yaldi',
  });
  const empYaldi = makeEmp({ id: 'emp-y', primaryCompanyId: 'comp-yaldi' });
  const empWgd = makeEmp({ id: 'emp-w', primaryCompanyId: 'comp-wegdaniyah' });
  const empUrban = makeEmp({ id: 'emp-u', primaryCompanyId: 'comp-urban' });

  assert.equal(isAttendanceTracked(mainMgr), false);
  assert.equal(isPayrollEligible(mainMgr), false);

  const allAttached = getScopedEmployees({
    employees: [accUser, mainMgr, empYaldi, empWgd, empUrban],
    viewer: accUser,
    activeRole: UserRole.Accounting,
    selectedCompanyId: 'all',
  });
  assert.equal(allAttached.some((e) => e.id === 'emp-u'), false);
  assert.equal(allAttached.some((e) => e.id === 'emp-mm'), false);
  assert.equal(allAttached.some((e) => e.id === 'emp-y'), true);
  assert.equal(allAttached.some((e) => e.id === 'emp-w'), true);

  const unattachedFilter = getScopedEmployees({
    employees: [accUser, mainMgr, empYaldi, empWgd, empUrban],
    viewer: accUser,
    activeRole: UserRole.Accounting,
    selectedCompanyId: 'comp-urban',
  });
  assert.equal(unattachedFilter.length, 0);
});

test('Multi-company isolation, Shared Employees, and multi-section Manager scoping', () => {
  const secMgr = makeEmp({
    id: 'emp-mgr',
    role: UserRole.SectionManager,
    sectionId: 'sec-drivers',
    managedSectionIds: ['sec-drivers', 'sec-ops'],
  });
  const sharedDriver = makeEmp({
    id: 'emp-drv',
    primaryCompanyId: 'comp-yaldi',
    sharedCompanyIds: ['comp-wegdaniyah'],
    sectionId: 'sec-drivers',
  });
  const opsStaff = makeEmp({
    id: 'emp-ops',
    primaryCompanyId: 'comp-yaldi',
    sectionId: 'sec-ops',
  });
  const hrStaff = makeEmp({
    id: 'emp-hr',
    primaryCompanyId: 'comp-yaldi',
    sectionId: 'sec-hr',
  });

  const scoped = getScopedEmployees({
    employees: [secMgr, sharedDriver, opsStaff, hrStaff],
    viewer: secMgr,
    activeRole: UserRole.SectionManager,
    selectedCompanyId: 'comp-yaldi',
  });
  assert.deepEqual(
    scoped.map((e) => e.id),
    ['emp-mgr', 'emp-drv', 'emp-ops']
  );
});

test('Multi-step leave chain Smart Auto-Skip skips Step 1 for Section Manager and blocks Co-Manager/PRO/Accounting', () => {
  const wf = resolveApprovalWorkflow([], 'comp-yaldi', 'sec-drivers');
  const chain = buildLeaveApprovalChain({
    applicantRole: UserRole.SectionManager,
    days: 4,
    workflow: wf,
  });

  assert.equal(chain.steps[0].status, 'skipped');
  assert.equal(chain.currentStepIndex, 1);
  assert.equal(chain.steps[1].role, 'hr_admin');

  const leave = {
    id: 'lv-1',
    employeeId: 'emp-mgr',
    companyId: 'comp-yaldi',
    sectionId: 'sec-drivers',
    type: 'Annual Leave' as never,
    startDate: '2026-05-01',
    endDate: '2026-05-04',
    days: 4,
    reason: 'Family travel',
    status: LeaveStatus.Pending,
    submittedAt: new Date().toISOString(),
    approvalSteps: chain.steps,
    currentStepIndex: chain.currentStepIndex,
    coManagerNotes: [],
  };

  const coMgr = makeEmp({ id: 'emp-co', role: UserRole.SectionCoManager });
  const proUser = makeEmp({ id: 'emp-pro', role: UserRole.PRO });
  const accUser = makeEmp({ id: 'emp-acc', role: UserRole.Accounting });
  const hrUser = makeEmp({ id: 'emp-hr', role: UserRole.HRAdmin });

  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.SectionCoManager, actorEmployee: coMgr }), false);
  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.PRO, actorEmployee: proUser }), false);
  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.Accounting, actorEmployee: accUser }), false);
  assert.equal(canRoleActOnLeaveStep({ leave, actorRole: UserRole.HRAdmin, actorEmployee: hrUser }), true);

  const afterHr = advanceLeaveApproval({
    leave,
    decision: 'approved',
    actorName: 'Layla HR',
    remark: 'Verified',
  });
  assert.equal(afterHr.status, LeaveStatus.Pending);
  assert.equal(afterHr.currentStepIndex, 2);
});

test('Payroll release schedules, Delay overrides, release control RBAC, and auto-lateness deductions work accurately', () => {
  assert.equal(canControlSalaryRelease(UserRole.HRAdmin), true);
  assert.equal(canControlSalaryRelease(UserRole.MainManager), true);
  assert.equal(canControlSalaryRelease(UserRole.SectionManager), true);
  assert.equal(canControlSalaryRelease(UserRole.SectionCoManager), true);
  assert.equal(canControlSalaryRelease(UserRole.Accounting), false);
  assert.equal(canControlSalaryRelease(UserRole.Employee), false);
  assert.equal(canControlSalaryRelease(UserRole.PRO), false);

  const emp = makeEmp({ id: 'emp-pay', sectionId: 'sec-drivers' });
  const schedules: SalaryReleaseSchedule[] = [
    {
      id: 'rel-sec',
      month: '2026-06',
      payPeriod: '2026-06',
      scopeType: 'section',
      scopeId: 'sec-drivers',
      companyId: 'all',
      releaseDate: '2026-06-28',
      status: 'Processing',
      updatedBy: 'HR Admin',
      updatedAt: '2026-06-20T00:00:00Z',
    },
    {
      id: 'rel-emp',
      month: '2026-06',
      payPeriod: '2026-06',
      scopeType: 'employee',
      scopeId: 'emp-pay',
      companyId: 'comp-yaldi',
      releaseDate: '2026-06-28',
      status: 'Delayed',
      delayedUntilDate: '2026-07-02',
      delayReason: 'IBAN verification',
      updatedBy: 'HR Admin',
      updatedAt: '2026-06-25T00:00:00Z',
    },
  ];

  const row = calculateEmployeePayroll(
    emp,
    '2026-06',
    [
      {
        id: 'adj-1',
        employeeId: 'emp-pay',
        companyId: 'comp-yaldi',
        month: '2026-06',
        kind: 'deduction',
        category: DeductionCategory.SalaryAdvance,
        amountAED: 300,
        date: '2026-06-10',
        reason: 'Advance',
        createdBy: 'HR',
        createdByRole: UserRole.HRAdmin,
        createdAt: '2026-06-10T00:00:00Z',
      },
    ],
    [
      {
        id: 'att-1',
        employeeId: 'emp-pay',
        companyId: 'comp-yaldi',
        date: '2026-06-05',
        clockInTime: '2026-06-05T08:25:00Z',
        clockOutTime: '2026-06-05T17:00:00Z',
        zoneId: 'zone-hq',
        zoneName: 'Yaldi HQ',
        clockInLat: 25.18,
        clockInLng: 55.27,
        accuracyMeters: 10,
        punchSource: 'Mobile App',
        isLate: true,
        lateMinutes: 25,
        latenessPenaltyAED: 50,
        latenessExcused: false,
      },
    ],
    schedules
  );

  assert.equal(row.release.status, 'Delayed');
  assert.equal(row.release.delayedUntilDate, '2026-07-02');
  assert.equal(row.autoLatenessDeductions, 50);
  assert.equal(row.manualDeductions, 300);
  assert.equal(row.netSalary, 6150);

  const exportRows = buildPayrollExportRecords(
    [row],
    new Map([['comp-yaldi', 'Yaldi Car Rental']]),
    new Map([['sec-drivers', 'Drivers']])
  );
  assert.equal(exportRows[0]['Net Salary (AED)'], 6150);
  assert.equal(exportRows[0]['Release Status'], 'Delayed');
  assert.equal(exportRows[0]['IBAN'], 'AE070260001015555550101');
});

test('Model document compliance and preview URL synthesis work accurately', () => {
  const docs: EmployeeDocument[] = [
    {
      id: 'd1',
      employeeId: 'emp-1',
      type: BuiltInDocumentType.Passport,
      documentNumber: 'P-123456',
      issueDate: '2022-01-01',
      expiryDate: '2027-01-01',
      fileName: 'passport.pdf',
      fileType: 'application/pdf',
      uploadedAt: '2024-01-01T00:00:00Z',
    },
  ];
  const missing = getMissingModelDocuments(docs, driversModel);
  assert.deepEqual(missing, [BuiltInDocumentType.EmiratesID, BuiltInDocumentType.DrivingLicense]);

  const preview = getDocumentPreviewSource(docs[0]);
  assert.ok(preview.url.startsWith('data:image/svg+xml'));
  assert.equal(preview.isImage, true);

  const exp = getDocumentExpiryStatus('2020-01-01', new Date('2026-06-01'));
  assert.equal(exp.status, 'expired');
});
