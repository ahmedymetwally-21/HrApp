import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BuiltInDocumentType,
  ClockInPolicyMode,
  Company,
  DeductionApprovalRequest,
  DeductionCategory,
  DeductionWorkflowConfig,
  Employee,
  EmployeeDocument,
  EmployeeModel,
  GeofenceZone,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  PatchMoneyRelease,
  PayrollEntry,
  ProAssignment,
  SalaryReleaseSchedule,
  UserRole,
} from '../types/hr';
import {
  addMonthsToYYYYMM,
  advanceLeaveApproval,
  applyHrDeductionDecision,
  applyManagerDeductionDecision,
  buildAdcbWpsExport,
  buildLeaveApprovalChain,
  buildNewDeductionApprovalRequest,
  buildPayrollExportRecords,
  calculateEmployeePayroll,
  calculateEmployeePendingBalances,
  calculateHaversineDistanceMeters,
  canActOnDeductionApproval,
  canControlSalaryRelease,
  canRoleActOnLeaveStep,
  computeTemporaryEndMonth,
  countUnpaidLeaveDaysInMonth,
  editPermanentPayrollEntry,
  evaluateClockInEligibility,
  evaluateModelLateness,
  evaluateStartupEndpointResults,
  formatAdcbWpsAsSif,
  getDocumentExpiryStatus,
  getDocumentPreviewSource,
  getEffectiveDeductionStatus,
  getMissingModelDocuments,
  getScopedEmployees,
  getStartupEndpointsForRole,
  isAdminOrHRRole,
  isAttendanceTracked,
  isMainManagerRole,
  isPayrollEligible,
  isPayrollEntryActiveInMonth,
  normalizeUserRole,
  resolveApprovalWorkflow,
  resolveEmployeeDeductionWorkflow,
  stopPermanentPayrollEntry,
  validatePatchReleaseAllocations,
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
    employeeType: 'driver',
    deductionWorkflowOverride: 'inherit',
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

test('Case-insensitive Live PostgreSQL role normalization matches Demo Mode permissions', () => {
  assert.equal(normalizeUserRole('main_manager'), UserRole.MainManager);
  assert.equal(normalizeUserRole('MAIN_MANAGER'), UserRole.MainManager);
  assert.equal(normalizeUserRole('Main Manager'), UserRole.MainManager);
  assert.equal(normalizeUserRole('admin'), UserRole.MainManager);
  assert.equal(normalizeUserRole('ADMIN'), UserRole.MainManager);
  assert.equal(normalizeUserRole('super_admin'), UserRole.MainManager);

  assert.equal(normalizeUserRole('hr'), UserRole.HRAdmin);
  assert.equal(normalizeUserRole('HR'), UserRole.HRAdmin);
  assert.equal(normalizeUserRole('hr_admin'), UserRole.HRAdmin);
  assert.equal(normalizeUserRole('HR Admin'), UserRole.HRAdmin);

  assert.equal(normalizeUserRole('section_manager'), UserRole.SectionManager);
  assert.equal(normalizeUserRole('Section Manager'), UserRole.SectionManager);
  assert.equal(normalizeUserRole('section_co_manager'), UserRole.SectionCoManager);
  assert.equal(normalizeUserRole('Co-Manager'), UserRole.SectionCoManager);
  assert.equal(normalizeUserRole('PRO'), UserRole.PRO);
  assert.equal(normalizeUserRole('Accounting'), UserRole.Accounting);
  assert.equal(normalizeUserRole('employee'), UserRole.Employee);
  assert.equal(normalizeUserRole(undefined), UserRole.Employee);

  assert.equal(isMainManagerRole('MAIN_MANAGER'), true);
  assert.equal(isMainManagerRole('admin'), true);
  assert.equal(isAdminOrHRRole('hr'), true);
  assert.equal(isAdminOrHRRole('section_manager'), false);
  assert.equal(canControlSalaryRelease('ADMIN'), true);
  assert.equal(canControlSalaryRelease('hr'), true);
});

test('Role-based startup endpoints skip admin-only endpoints for non-admin users', () => {
  const mainMgrPaths = getStartupEndpointsForRole('main_manager').map((s) => s.path);
  assert.ok(mainMgrPaths.includes('/pro-assignments'));
  assert.ok(mainMgrPaths.includes('/approval-workflows'));
  assert.ok(mainMgrPaths.includes('/attendance/audit'));

  const empPaths = getStartupEndpointsForRole('employee').map((s) => s.path);
  assert.equal(empPaths.includes('/pro-assignments'), false);
  assert.equal(empPaths.includes('/approval-workflows'), false);
  assert.equal(empPaths.includes('/attendance/audit'), false);

  const accPaths = getStartupEndpointsForRole('Accounting').map((s) => s.path);
  assert.ok(accPaths.includes('/payroll/deductions'));
  assert.ok(accPaths.includes('/payroll/releases'));
  assert.equal(accPaths.includes('/documents'), false);
  assert.equal(accPaths.includes('/pro-assignments'), false);
});

test('Promise.allSettled startup evaluator defaults partial 403s to empty while surfacing 500/404/timeout failures', () => {
  const partial403 = evaluateStartupEndpointResults([
    { key: 'companies', path: '/companies', ok: true, value: [{ id: 'c1' }] },
    { key: 'employees', path: '/users', ok: true, value: [{ id: 'u1' }] },
    {
      key: 'attendanceAudit',
      path: '/attendance/audit',
      ok: false,
      failure: { endpoint: '/attendance/audit', status: 403, statusText: 'Forbidden', message: 'Admin only' },
    },
    {
      key: 'workflows',
      path: '/approval-workflows',
      ok: false,
      failure: { endpoint: '/approval-workflows', status: 403, statusText: 'Forbidden', message: 'Admin only' },
    },
  ]);
  assert.equal(partial403.fatalFailures.length, 0);
  assert.deepEqual(partial403.forbiddenEndpoints, ['/attendance/audit', '/approval-workflows']);
  assert.equal(partial403.values.attendanceAudit, undefined);

  const serverFail = evaluateStartupEndpointResults([
    { key: 'companies', path: '/companies', ok: true, value: [] },
    {
      key: 'employees',
      path: '/users',
      ok: false,
      failure: { endpoint: '/users', status: 500, statusText: 'Internal Server Error', message: 'DB error' },
    },
    {
      key: 'geofences',
      path: '/locations',
      ok: false,
      failure: { endpoint: '/locations', status: 404, statusText: 'Not Found', message: 'Not found' },
    },
  ]);
  assert.equal(serverFail.fatalFailures.length, 2);
  assert.equal(serverFail.fatalFailures[0].endpoint, '/users');
  assert.equal(serverFail.fatalFailures[0].status, 500);
  assert.equal(serverFail.fatalFailures[1].status, 404);

  const total403 = evaluateStartupEndpointResults([
    {
      key: 'companies',
      path: '/companies',
      ok: false,
      failure: { endpoint: '/companies', status: 403, statusText: 'Forbidden', message: 'Password change required' },
    },
    {
      key: 'employees',
      path: '/users',
      ok: false,
      failure: { endpoint: '/users', status: 403, statusText: 'Forbidden', message: 'Password change required' },
    },
  ]);
  assert.equal(total403.fatalFailures.length, 2);
  assert.equal(total403.fatalFailures[0].status, 403);
});

test('Phase 1A 3-bucket salary architecture keeps Basic intact in WPS and excludes Off-Cycle from WPS', () => {
  const emp = makeEmp({
    id: 'emp-3b',
    mohrePersonId: '10029481020999',
    salary: { baseSalary: 5000, housingAllowance: 1000, transportAllowance: 500, otherAllowance: 200 },
    bankDetails: {
      bankName: 'ADCB',
      bankRoutingCode: '300310101',
      accountNumber: '204-999-01',
      iban: 'AE440030002049990100001',
    },
  });

  const entries: PayrollEntry[] = [
    {
      id: 'pe-in-earn',
      employeeId: 'emp-3b',
      companyId: 'comp-yaldi',
      type: 'earning_in_payroll',
      categoryId: 'cat-1',
      categoryName: 'Field Allowance',
      amountAED: 600,
      isPermanent: true,
      effectiveFrom: '2026-01',
      effectiveTo: null,
      durationMonths: null,
      targetBucket: null,
      reason: 'Permanent field allowance',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'pe-off-earn',
      employeeId: 'emp-3b',
      companyId: 'comp-yaldi',
      type: 'earning_off_cycle',
      categoryId: 'cat-2',
      categoryName: 'Fuel Stipend',
      amountAED: 500,
      isPermanent: true,
      effectiveFrom: '2026-01',
      effectiveTo: null,
      durationMonths: null,
      targetBucket: null,
      reason: 'Cash fuel outside WPS',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-01-01T00:00:00Z',
    },
    {
      id: 'pe-in-ded',
      employeeId: 'emp-3b',
      companyId: 'comp-yaldi',
      type: 'deduction_in_payroll',
      categoryId: 'cat-3',
      categoryName: 'Salik Fine',
      amountAED: 300,
      isPermanent: false,
      effectiveFrom: '2026-06',
      effectiveTo: computeTemporaryEndMonth('2026-06', 2), // 2026-07
      durationMonths: 2,
      targetBucket: 'additional_in_payroll',
      reason: '2-month fine recovery',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-06-01T00:00:00Z',
    },
    {
      id: 'pe-off-ded',
      employeeId: 'emp-3b',
      companyId: 'comp-yaldi',
      type: 'deduction_off_cycle',
      categoryId: 'cat-4',
      categoryName: 'Cash Float',
      amountAED: 100,
      isPermanent: false,
      effectiveFrom: '2026-06',
      effectiveTo: computeTemporaryEndMonth('2026-06', 1), // 2026-06
      durationMonths: 1,
      targetBucket: 'additional_off_cycle',
      reason: '1-month cash float',
      createdBy: 'Accounting',
      createdByRole: UserRole.Accounting,
      createdAt: '2026-06-01T00:00:00Z',
    },
  ];

  const june = calculateEmployeePayroll(emp, '2026-06', [], [], [], entries, []);
  assert.equal(june.grossSalary, 6700); // Basic 5000 + Allowances 1700
  assert.equal(june.inPayrollEarnings, 600);
  assert.equal(june.offCycleEarnings, 500);
  assert.equal(june.inPayrollDeductions, 300);
  assert.equal(june.offCycleDeductions, 100);
  // WPS rule: Fixed Income stays 5000 (Basic), Variable Income = 1700 + 600 - 300 = 2000 (Off-Cycle 500 excluded!)
  assert.equal(june.wpsFixedIncome, 5000);
  assert.equal(june.wpsVariableIncome, 2000);
  assert.equal(june.wpsTotalPayout, 7000);
  assert.equal(june.offCycleNetPayout, 400);
  assert.equal(june.netSalary, 7400);

  // In August 2026, both temporary deductions have expired; only permanent earnings remain
  const august = calculateEmployeePayroll(emp, '2026-08', [], [], [], entries, []);
  assert.equal(august.inPayrollDeductions, 0);
  assert.equal(august.offCycleDeductions, 0);
  assert.equal(august.wpsVariableIncome, 2300);
  assert.equal(august.offCycleNetPayout, 500);
});

test('Phase 1A permanent earning edit & stop strictly preserve historical months', () => {
  assert.equal(addMonthsToYYYYMM('2026-01', -1), '2025-12');
  assert.equal(computeTemporaryEndMonth('2026-11', 3), '2027-01');

  const initial: PayrollEntry[] = [
    {
      id: 'perm-1',
      employeeId: 'emp-1',
      companyId: 'comp-yaldi',
      type: 'earning_in_payroll',
      categoryId: 'cat-1',
      categoryName: 'Field Allowance',
      amountAED: 600,
      isPermanent: true,
      effectiveFrom: '2026-01',
      effectiveTo: null,
      durationMonths: null,
      targetBucket: null,
      reason: 'Initial permanent allowance',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-01-01T00:00:00Z',
    },
  ];

  // Edit from 2026-05 -> 900 AED; Jan..Apr MUST remain 600 AED
  const afterEdit = editPermanentPayrollEntry({
    entries: initial,
    entryId: 'perm-1',
    effectiveFromMonth: '2026-05',
    patch: { amountAED: 900, reason: 'Promotion adjustment' },
    newEntryId: 'perm-2',
  });

  const activeApril = afterEdit.filter((e) => isPayrollEntryActiveInMonth(e, '2026-04'));
  const activeMay = afterEdit.filter((e) => isPayrollEntryActiveInMonth(e, '2026-05'));
  assert.equal(activeApril.length, 1);
  assert.equal(activeApril[0].amountAED, 600);
  assert.equal(activeMay.length, 1);
  assert.equal(activeMay[0].amountAED, 900);

  // Stop perm-2 starting 2026-08 -> May..Jul remain 900 AED, Aug onward = 0
  const afterStop = stopPermanentPayrollEntry({
    entries: afterEdit,
    entryId: 'perm-2',
    stopFromMonth: '2026-08',
  });
  assert.equal(afterStop.filter((e) => isPayrollEntryActiveInMonth(e, '2026-07'))[0].amountAED, 900);
  assert.equal(afterStop.filter((e) => isPayrollEntryActiveInMonth(e, '2026-08')).length, 0);
  assert.equal(afterStop.filter((e) => isPayrollEntryActiveInMonth(e, '2026-03'))[0].amountAED, 600);
});

test('Phase 1A Multi-Company ADCB WPS export produces exact EDR (11 cols) and SCR (10 cols) rows with unpaid leave days', () => {
  const company: Company = {
    id: 'comp-yaldi',
    code: 'YLD',
    name: 'Yaldi Car Rental',
    industry: 'Mobility',
    city: 'Dubai',
    active: true,
    molEstablishmentId: '0000104829103',
    wpsRoutingCode: '300310101',
    companyIban: 'AE190030010482910300001',
  };

  const emp1 = makeEmp({
    id: 'emp-a',
    fullName: 'Omar Khalid',
    primaryCompanyId: 'comp-yaldi',
    mohrePersonId: '10029481020104',
    salary: { baseSalary: 4800, housingAllowance: 1500, transportAllowance: 500, otherAllowance: 400 },
    bankDetails: {
      bankName: 'Emirates NBD',
      bankRoutingCode: '302620122',
      accountNumber: '101-7742108-03',
      iban: 'AE070260001017742108003',
    },
  });

  const empOtherComp = makeEmp({
    id: 'emp-b',
    fullName: 'Bilal Ahmed',
    primaryCompanyId: 'comp-wegdaniyah',
  });

  const leaves: LeaveRequest[] = [
    {
      id: 'lv-unpaid',
      employeeId: 'emp-a',
      companyId: 'comp-yaldi',
      sectionId: 'sec-drivers',
      type: LeaveType.Unpaid,
      startDate: '2026-02-27',
      endDate: '2026-03-02', // 2 days in Feb 2026 (27, 28) and 2 days in Mar 2026
      days: 4,
      reason: 'Unpaid personal travel',
      status: LeaveStatus.Approved,
      submittedAt: '2026-02-10T00:00:00Z',
      approvalSteps: [],
      currentStepIndex: -1,
      coManagerNotes: [],
    },
  ];

  assert.equal(countUnpaidLeaveDaysInMonth('emp-a', '2026-02', leaves), 2);
  assert.equal(countUnpaidLeaveDaysInMonth('emp-a', '2026-03', leaves), 2);

  const rowA = calculateEmployeePayroll(emp1, '2026-02', [], [], [], [], leaves);
  const rowB = calculateEmployeePayroll(empOtherComp, '2026-02', [], [], [], [], leaves);

  const wps = buildAdcbWpsExport({
    company,
    month: '2026-02',
    payrollRows: [rowA, rowB],
    fileDate: new Date(2026, 1, 28, 14, 35, 0),
  });

  assert.equal(wps.edrRows.length, 1); // Strictly isolated to comp-yaldi
  assert.equal(wps.warnings.length, 0);
  assert.deepEqual(wps.aoaRows[0], [
    'EDR',
    '10029481020104',
    '302620122',
    'AE070260001017742108003',
    '2026-02-01',
    '2026-02-28',
    28,
    4800,
    2400,
    2,
    'Omar Khalid',
  ]);
  assert.deepEqual(wps.aoaRows[1], [
    'SCR',
    '0000104829103',
    '300310101',
    '2026-02-28',
    '1435',
    '022026',
    1,
    7200,
    'AED',
    'AE190030010482910300001',
  ]);
  assert.ok(formatAdcbWpsAsSif(wps).includes('SCR,0000104829103,300310101,2026-02-28,1435,022026,1,7200,AED,AE190030010482910300001'));
});

test('Phase 1B deduction workflow resolves by employeeType + override and requires HR final approval before impacting payroll', () => {
  const wfConfig: DeductionWorkflowConfig = {
    office_employee: 'manager_then_hr',
    driver: 'manager_then_hr',
    management: 'main_manager_only',
    autoEscalationHours: 48,
  };

  const driver = makeEmp({ id: 'emp-drv', employeeType: 'driver', deductionWorkflowOverride: 'inherit' });
  const overriddenDriver = makeEmp({
    id: 'emp-drv-ovr',
    employeeType: 'driver',
    deductionWorkflowOverride: 'hr_only',
  });
  const exec = makeEmp({ id: 'emp-exec', employeeType: 'management' });

  assert.equal(resolveEmployeeDeductionWorkflow(driver, wfConfig), 'manager_then_hr');
  assert.equal(resolveEmployeeDeductionWorkflow(overriddenDriver, wfConfig), 'hr_only');
  assert.equal(resolveEmployeeDeductionWorkflow(exec, wfConfig), 'main_manager_only');

  const start = new Date('2026-11-01T08:00:00Z');
  const req = buildNewDeductionApprovalRequest({
    id: 'da-test-1',
    employee: driver,
    month: '2026-11',
    triggerType: 'latency',
    date: '2026-11-01',
    amountAED: 120,
    targetBucket: 'main_salary',
    reason: 'Late arrival',
    createdBy: 'HR',
    createdByRole: UserRole.HRAdmin,
    workflowConfig: wfConfig,
    now: start,
  });

  assert.equal(req.status, 'pending_manager');
  assert.equal(req.escalationDeadline, '2026-11-03T08:00:00.000Z');

  // Pending manager MUST NOT reduce payroll yet
  const beforeMgr = calculateEmployeePayroll(driver, '2026-11', [], [], [], [], [], [req], []);
  assert.equal(beforeMgr.approvedWorkflowDeductions, 0);
  assert.equal(beforeMgr.netSalary, 6500);

  // Manager approves -> moves to pending_hr_approval (STILL does not apply to payroll until HR finalizes!)
  const afterMgr = applyManagerDeductionDecision({
    request: req,
    decision: 'approved',
    actorName: 'Karim Haddad',
    note: 'Confirmed late punch',
    now: new Date('2026-11-01T12:00:00Z'),
  });
  assert.equal(afterMgr.status, 'pending_hr_approval');

  const beforeHr = calculateEmployeePayroll(driver, '2026-11', [], [], [], [], [], [afterMgr], []);
  assert.equal(beforeHr.approvedWorkflowDeductions, 0);
  assert.equal(beforeHr.netSalary, 6500);

  // HR gives final approval -> NOW applies to payroll (Basic stays intact; Variable Income reduced by 120)
  const afterHr = applyHrDeductionDecision({
    request: afterMgr,
    decision: 'approved',
    actorName: 'Layla Al-Mansoori',
    note: 'Final HR approval',
    now: new Date('2026-11-01T15:00:00Z'),
  });
  assert.equal(afterHr.status, 'approved');

  const afterFinal = calculateEmployeePayroll(driver, '2026-11', [], [], [], [], [], [afterHr], []);
  assert.equal(afterFinal.approvedWorkflowDeductions, 120);
  assert.equal(afterFinal.wpsFixedIncome, 5000);
  assert.equal(afterFinal.wpsVariableIncome, 1380);
  assert.equal(afterFinal.netSalary, 6380);
});

test('Phase 1B manager rejection/waiver routes to HR decision and timeout auto-escalates to HR', () => {
  const wfConfig: DeductionWorkflowConfig = {
    office_employee: 'manager_then_hr',
    driver: 'manager_then_hr',
    management: 'main_manager_only',
    autoEscalationHours: 24,
  };
  const driver = makeEmp({ id: 'emp-drv2', sectionId: 'sec-drivers', employeeType: 'driver' });
  const created = buildNewDeductionApprovalRequest({
    id: 'da-test-2',
    employee: driver,
    month: '2026-11',
    triggerType: 'off_day',
    date: '2026-11-02',
    amountAED: 200,
    targetBucket: 'main_salary',
    reason: 'Missed shift',
    createdBy: 'HR',
    createdByRole: UserRole.HRAdmin,
    workflowConfig: wfConfig,
    now: new Date('2026-11-02T09:00:00Z'),
  });

  // Before 24h timeout: Section Manager can act, HR cannot yet
  const permsBefore = canActOnDeductionApproval({
    request: created,
    actorRole: UserRole.SectionManager,
    actorManagedSectionIds: ['sec-drivers'],
    now: new Date('2026-11-02T15:00:00Z'),
  });
  assert.equal(permsBefore.effectiveStatus, 'pending_manager');
  assert.equal(permsBefore.canManagerAct, true);

  // After 24h timeout: auto-escalates to HR!
  const afterTimeout = new Date('2026-11-03T10:00:00Z');
  assert.equal(getEffectiveDeductionStatus(created, afterTimeout), 'escalated_to_hr');
  const hrPermsEscalated = canActOnDeductionApproval({
    request: created,
    actorRole: UserRole.HRAdmin,
    actorManagedSectionIds: [],
    now: afterTimeout,
  });
  assert.equal(hrPermsEscalated.effectiveStatus, 'escalated_to_hr');
  assert.equal(hrPermsEscalated.canHrAct, true);

  // Manager rejects/waives -> moves to pending_hr_decision with note -> HR waives -> 0 payroll impact
  const rejectedByMgr = applyManagerDeductionDecision({
    request: created,
    decision: 'rejected',
    actorName: 'Karim Haddad',
    note: 'Emergency medical excuse submitted',
    now: new Date('2026-11-02T14:00:00Z'),
  });
  assert.equal(rejectedByMgr.status, 'pending_hr_decision');
  assert.equal(rejectedByMgr.managerNote, 'Emergency medical excuse submitted');

  const waivedByHr = applyHrDeductionDecision({
    request: rejectedByMgr,
    decision: 'waived',
    actorName: 'Layla Al-Mansoori',
    note: 'Accepted medical slip; waived',
    now: new Date('2026-11-02T16:00:00Z'),
  });
  assert.equal(waivedByHr.status, 'waived');
  const rowWaived = calculateEmployeePayroll(driver, '2026-11', [], [], [], [], [], [waivedByHr], []);
  assert.equal(rowWaived.approvedWorkflowDeductions, 0);
  assert.equal(rowWaived.netSalary, 6500);
});

test('Phase 1B split-bucket Patch Money Release updates pending balances and automatically offsets month-end ADCB WPS Variable Income', () => {
  const company: Company = {
    id: 'comp-yaldi',
    code: 'YLD',
    name: 'Yaldi Car Rental',
    industry: 'Mobility',
    city: 'Dubai',
    active: true,
    molEstablishmentId: '0000104829103',
    wpsRoutingCode: '300310101',
    companyIban: 'AE190030010482910300001',
  };

  const emp = makeEmp({
    id: 'emp-patch',
    fullName: 'Omar Khalid',
    primaryCompanyId: 'comp-yaldi',
    mohrePersonId: '10029481020104',
    salary: { baseSalary: 4800, housingAllowance: 1500, transportAllowance: 500, otherAllowance: 400 }, // Basic 4800, Allowances 2400
    bankDetails: {
      bankName: 'Emirates NBD',
      bankRoutingCode: '302620122',
      accountNumber: '101-7742108-03',
      iban: 'AE070260001017742108003',
    },
  });

  const entries: PayrollEntry[] = [
    {
      id: 'pe-oc-oct',
      employeeId: 'emp-patch',
      companyId: 'comp-yaldi',
      type: 'earning_off_cycle',
      categoryId: 'cat-fuel',
      categoryName: 'Fuel Stipend',
      amountAED: 150,
      isPermanent: false,
      effectiveFrom: '2026-10',
      effectiveTo: '2026-10',
      durationMonths: 1,
      targetBucket: null,
      reason: 'Oct off-cycle fuel',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-10-01T00:00:00Z',
    },
    {
      id: 'pe-oc-nov',
      employeeId: 'emp-patch',
      companyId: 'comp-yaldi',
      type: 'earning_off_cycle',
      categoryId: 'cat-fuel',
      categoryName: 'Fuel Stipend',
      amountAED: 300,
      isPermanent: false,
      effectiveFrom: '2026-11',
      effectiveTo: '2026-11',
      durationMonths: 1,
      targetBucket: null,
      reason: 'Nov off-cycle fuel',
      createdBy: 'HR',
      createdByRole: UserRole.HRAdmin,
      createdAt: '2026-11-01T00:00:00Z',
    },
  ];

  // Before patch release: Oct Off-Cycle = 150, Nov Off-Cycle = 300, Nov Upcoming Main = 7200
  const balancesBefore = calculateEmployeePendingBalances({
    employee: emp,
    currentMonth: '2026-11',
    adjustments: [],
    payrollEntries: entries,
    patchReleases: [],
  });
  assert.equal(balancesBefore.find((b) => b.key === '2026-10:off_cycle')?.availableAED, 150);
  assert.equal(balancesBefore.find((b) => b.key === '2026-11:off_cycle')?.availableAED, 300);
  assert.equal(balancesBefore.find((b) => b.key === '2026-11:upcoming_main_salary')?.availableAED, 7200);

  // Validate mismatched split fails and exact 200 AED split passes
  assert.equal(
    validatePatchReleaseAllocations(200, [
      { month: '2026-10', bucket: 'off_cycle', amountAED: 150 },
    ]).valid,
    false
  );
  assert.equal(
    validatePatchReleaseAllocations(200, [
      { month: '2026-10', bucket: 'off_cycle', amountAED: 150 },
      { month: '2026-11', bucket: 'upcoming_main_salary', amountAED: 50 },
    ]).valid,
    true
  );

  // Release 200 AED today: 150 from Oct Off-Cycle + 50 from Nov Upcoming Main Salary
  const release: PatchMoneyRelease = {
    id: 'pr-split-1',
    employeeId: 'emp-patch',
    companyId: 'comp-yaldi',
    totalAmountAED: 200,
    allocations: [
      { month: '2026-10', bucket: 'off_cycle', amountAED: 150 },
      { month: '2026-11', bucket: 'upcoming_main_salary', amountAED: 50 },
    ],
    paymentMethod: 'Cash',
    releaseDate: '2026-11-12',
    releasedBy: 'Nadia Mansour',
    releasedByRole: UserRole.Accounting,
    referenceNote: 'Cash Voucher #901',
    createdAt: '2026-11-12T10:00:00Z',
  };

  // Pending balances after release: Oct Off-Cycle is settled (disappears), Nov Upcoming Main drops by 50
  const balancesAfter = calculateEmployeePendingBalances({
    employee: emp,
    currentMonth: '2026-11',
    adjustments: [],
    payrollEntries: entries,
    patchReleases: [release],
  });
  assert.equal(balancesAfter.find((b) => b.key === '2026-10:off_cycle'), undefined);
  assert.equal(balancesAfter.find((b) => b.key === '2026-11:upcoming_main_salary')?.availableAED, 7150);

  // Month-end Nov payroll & ADCB WPS export automatically deduct the 50 AED early WPS release from Variable Income
  const novRow = calculateEmployeePayroll(emp, '2026-11', [], [], [], entries, [], [], [release]);
  assert.equal(novRow.earlyWpsReleasedAED, 50);
  assert.equal(novRow.wpsFixedIncome, 4800); // Basic intact!
  assert.equal(novRow.wpsVariableIncome, 2350); // 2400 allowances - 50 early patch release!
  assert.equal(novRow.wpsTotalPayout, 7150);

  const wps = buildAdcbWpsExport({
    company,
    month: '2026-11',
    payrollRows: [novRow],
    fileDate: new Date(2026, 10, 28, 12, 0, 0),
  });
  assert.equal(wps.totalEarlyWpsOffsetAed, 50);
  assert.equal(wps.edrRows[0].fixedIncome, 4800);
  assert.equal(wps.edrRows[0].variableIncome, 2350);
  assert.equal(wps.scrRow.totalPayoutAed, 7150);
});



