import test from 'node:test';
import assert from 'node:assert/strict';
import {
  adjustLeaveBalance,
  buildPayrollCSV,
  calculateDistanceMeters,
  calculateEmployeePayroll,
  calculateInclusiveDays,
  evaluateClockInEligibility,
  getDocumentExpiryStatus,
  validateLeaveSubmission,
} from './hrLogic';
import {
  ClockInPolicyMode,
  DeductionCategory,
  Employee,
  GeofenceZone,
  LeaveType,
  PayrollAdjustment,
  UserRole,
} from '../types/hr';

const mainOffice: GeofenceZone = {
  id: 'zone-difc',
  name: 'Main Office — DIFC Gate',
  address: 'Gate Village, DIFC, Dubai',
  latitude: 25.2116,
  longitude: 55.2808,
  radiusMeters: 150,
  active: true,
};

const sampleEmployee: Employee = {
  id: 'emp-1',
  employeeCode: 'MSR-101',
  fullName: 'Omar Khalid',
  email: 'omar@masar.ae',
  phone: '+971 50 111 2233',
  avatarUrl: '',
  role: UserRole.Employee,
  department: 'Engineering',
  jobTitle: 'Field Engineer',
  joinDate: '2024-01-15',
  active: true,
  assignedZoneIds: ['zone-difc'],
  salary: {
    baseSalary: 12000,
    housingAllowance: 4000,
    transportAllowance: 1500,
    otherAllowance: 500,
  },
  leaveBalance: {
    annualTotal: 30,
    annualUsed: 10,
    sickTotal: 15,
    sickUsed: 2,
    emergencyTotal: 5,
    emergencyUsed: 1,
    unpaidUsed: 0,
  },
};

test('Haversine distance returns 0 for identical coordinates and accurate meter distance for offset', () => {
  assert.equal(calculateDistanceMeters(25.2116, 55.2808, 25.2116, 55.2808), 0);
  // ~0.004 deg north is roughly ~445 meters
  const dist = calculateDistanceMeters(25.2116, 55.2808, 25.2156, 55.2808);
  assert.ok(dist >= 435 && dist <= 455, `Expected ~445m, got ${dist}m`);
});

test('Geofence evaluation allows mobile GPS inside radius and blocks outside radius with distance warning', () => {
  const inside = evaluateClockInEligibility({
    reading: { latitude: 25.2119, longitude: 55.2808, accuracyMeters: 12, isSimulated: true },
    assignedZones: [mainOffice],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
  });
  assert.equal(inside.allowed, true);
  assert.equal(inside.insideZone, true);
  assert.equal(inside.punchSource, 'Mobile GPS');
  assert.equal(inside.blockReason, null);

  const outside = evaluateClockInEligibility({
    reading: { latitude: 25.2156, longitude: 55.2808, accuracyMeters: 15, isSimulated: true },
    assignedZones: [mainOffice],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
  });
  assert.equal(outside.allowed, false);
  assert.equal(outside.insideZone, false);
  assert.ok(outside.blockReason?.includes('Outside allowed zone'));
});

test('PC vs Mobile GPS policy blocks desktop and low-accuracy readings in Strict mode, allows Web/PC in Office mode', () => {
  const blockedDesktop = evaluateClockInEligibility({
    reading: { latitude: 25.2116, longitude: 55.2808, accuracyMeters: 20, isSimulated: true },
    assignedZones: [mainOffice],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: true,
  });
  assert.equal(blockedDesktop.allowed, false);
  assert.ok(blockedDesktop.blockReason?.includes('Strict Mobile GPS'));

  const blockedLowAccuracy = evaluateClockInEligibility({
    reading: { latitude: 25.2116, longitude: 55.2808, accuracyMeters: 280, isSimulated: true },
    assignedZones: [mainOffice],
    effectivePolicy: ClockInPolicyMode.StrictMobileGPS,
    isDesktopDevice: false,
  });
  assert.equal(blockedLowAccuracy.allowed, false);
  assert.ok(blockedLowAccuracy.blockReason?.includes('Low GPS accuracy'));

  const allowedDesktop = evaluateClockInEligibility({
    reading: { latitude: 25.2116, longitude: 55.2808, accuracyMeters: 200, isSimulated: true },
    assignedZones: [mainOffice],
    effectivePolicy: ClockInPolicyMode.AllowOfficePC,
    isDesktopDevice: true,
  });
  assert.equal(allowedDesktop.allowed, true);
  assert.equal(allowedDesktop.punchSource, 'Web/PC');
});

test('Document expiry classifies expired, expiring within 30 days, and valid correctly', () => {
  const ref = '2026-11-19';
  assert.equal(getDocumentExpiryStatus('2026-11-01', ref).status, 'expired');
  assert.equal(getDocumentExpiryStatus('2026-12-05', ref).status, 'expiring_soon');
  assert.equal(getDocumentExpiryStatus('2026-12-19', ref).status, 'expiring_soon');
  assert.equal(getDocumentExpiryStatus('2027-06-01', ref).status, 'valid');
});

test('Leave day calculation, validation, and balance deduction work accurately', () => {
  assert.equal(calculateInclusiveDays('2026-11-22', '2026-11-24'), 3);
  assert.equal(calculateInclusiveDays('2026-11-25', '2026-11-24'), 0);

  const valid = validateLeaveSubmission({
    type: LeaveType.Annual,
    startDate: '2026-12-01',
    endDate: '2026-12-05',
    reason: 'Family travel',
    balance: sampleEmployee.leaveBalance,
  });
  assert.equal(valid.valid, true);
  assert.equal(valid.days, 5);

  const overBalance = validateLeaveSubmission({
    type: LeaveType.Emergency,
    startDate: '2026-12-01',
    endDate: '2026-12-08',
    reason: 'Urgent travel',
    balance: sampleEmployee.leaveBalance,
  });
  assert.equal(overBalance.valid, false);
  assert.ok(overBalance.error?.includes('Insufficient'));

  const updated = adjustLeaveBalance(sampleEmployee.leaveBalance, LeaveType.Annual, 3);
  assert.equal(updated.annualUsed, 13);
});

test('Monthly payroll computes gross, bonuses, deductions, net salary, and CSV output', () => {
  const adjustments: PayrollAdjustment[] = [
    {
      id: 'adj-1',
      employeeId: 'emp-1',
      month: '2026-11',
      kind: 'deduction',
      category: DeductionCategory.LateArrival,
      amountAED: 350,
      date: '2026-11-12',
      reason: 'Late clock-in by 45 minutes',
      createdBy: 'Layla Al-Mansoori',
      createdByRole: UserRole.Admin,
      createdAt: '2026-11-12T10:00:00Z',
    },
    {
      id: 'adj-2',
      employeeId: 'emp-1',
      month: '2026-11',
      kind: 'bonus',
      category: 'Performance Bonus',
      amountAED: 1000,
      date: '2026-11-15',
      reason: 'Site commissioning milestone',
      createdBy: 'Tariq Al-Hashemi',
      createdByRole: UserRole.Management,
      createdAt: '2026-11-15T12:00:00Z',
    },
    {
      id: 'adj-other-month',
      employeeId: 'emp-1',
      month: '2026-10',
      kind: 'deduction',
      category: DeductionCategory.SalaryAdvance,
      amountAED: 2000,
      date: '2026-10-10',
      reason: 'October advance',
      createdBy: 'Layla Al-Mansoori',
      createdByRole: UserRole.Admin,
      createdAt: '2026-10-10T10:00:00Z',
    },
  ];

  const row = calculateEmployeePayroll(sampleEmployee, '2026-11', adjustments);
  assert.equal(row.grossSalary, 18000);
  assert.equal(row.totalBonuses, 1000);
  assert.equal(row.totalDeductions, 350);
  assert.equal(row.netSalary, 18650);

  const csv = buildPayrollCSV([row]);
  assert.ok(csv.includes('MSR-101'));
  assert.ok(csv.includes('18650.00'));
  assert.ok(csv.includes('Late clock-in by 45 minutes'));
});
