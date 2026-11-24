import test from 'node:test';
import assert from 'node:assert/strict';
import { Company, Employee, Section, UserRole } from '../types/hr';
import {
  BULK_IMPORT_TEMPLATE_COLUMNS,
  buildBulkImportTemplateRows,
  evaluateBulkImportRows,
  parseBulkImportResponse,
  parseSpreadsheetDate,
} from './bulkImportLogic';

const COMPANIES: Company[] = [
  { id: 'comp-yaldi', code: 'YLD', name: 'Yaldi Car Rental', industry: 'Mobility', city: 'Dubai', active: true },
  { id: 'comp-urban', code: 'URB', name: 'Urban Wheels', industry: 'Mobility', city: 'Dubai', active: true },
];

const SECTIONS: Section[] = [
  { id: 'sec-drivers', code: 'DRV', name: 'Drivers' },
  { id: 'sec-ops', code: 'OPS', name: 'Operations' },
];

function makeExisting(overrides: Partial<Employee>): Employee {
  return {
    id: 'emp-104',
    employeeCode: 'YLD-104',
    fullName: 'Omar Khalid',
    email: 'omar.khalid@yaldi.ae',
    phone: '+971 55 000 0000',
    mustChangePassword: false,
    role: UserRole.Employee,
    employeeType: 'driver',
    primaryCompanyId: 'comp-yaldi',
    sharedCompanyIds: [],
    sectionId: 'sec-drivers',
    managedSectionIds: [],
    labelIds: [],
    modelId: 'model-drivers',
    jobTitle: 'Senior Fleet Driver',
    joinDate: '2023-04-12',
    active: true,
    assignedZoneIds: [],
    salary: { baseSalary: 4800, housingAllowance: 1500, transportAllowance: 500, otherAllowance: 400 },
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

test('Template generator includes all 19 exact columns and 1 valid sample row', () => {
  assert.equal(BULK_IMPORT_TEMPLATE_COLUMNS.length, 19);
  const sampleRows = buildBulkImportTemplateRows(COMPANIES, SECTIONS);
  assert.equal(sampleRows.length, 1);
  for (const col of BULK_IMPORT_TEMPLATE_COLUMNS) {
    assert.ok(col in sampleRows[0], `Missing template column ${col}`);
  }
});

test('Upsert classification strictly matches by employeeCode or id (never by email alone)', () => {
  const existing = [
    makeExisting({ id: 'emp-104', employeeCode: 'YLD-104', fullName: 'Omar Khalid', email: 'omar.khalid@yaldi.ae' }),
    makeExisting({ id: 'emp-105', employeeCode: 'YLD-105', fullName: 'Tariq Said', email: 'tariq.said@yaldi.ae' }),
  ];

  const result = evaluateBulkImportRows({
    existingEmployees: existing,
    companies: COMPANIES,
    sections: SECTIONS,
    defaultPassword: '',
    rawRows: [
      // Row 2: Matches YLD-104 by employeeCode -> UPDATE; blank password keeps existing!
      {
        employeeCode: 'yld-104',
        fullName: 'Omar Khalid Updated',
        email: 'omar.khalid@yaldi.ae',
        initialPassword: '',
        company: 'YLD',
        section: 'Drivers',
        baseSalary: 5200,
      },
      // Row 3: Matches emp-105 by id -> UPDATE with blank email/password
      {
        id: 'emp-105',
        jobTitle: 'Lead Operations',
        housingAllowance: 1800,
      },
      // Row 4: New employee with row password -> NEW
      {
        employeeCode: 'YLD-301',
        fullName: 'Salma Hassan',
        email: 'salma.hassan@yaldi.ae',
        initialPassword: 'Welcome123!',
        role: 'employee',
        company: 'Urban Wheels',
        section: 'OPS',
        employeeType: 'office_employee',
        joinDate: '2026-03-01',
        baseSalary: 6000,
      },
      // Row 5: Unmatched employeeCode BUT email belongs to Omar -> INVALID (must NOT silently update by email!)
      {
        employeeCode: 'YLD-999',
        fullName: 'Duplicate Email User',
        email: 'omar.khalid@yaldi.ae',
        initialPassword: 'Password123!',
      },
      // Row 6: Update matched by code YLD-104 trying to steal Tariq's email -> INVALID
      {
        employeeCode: 'YLD-104',
        email: 'tariq.said@yaldi.ae',
      },
      // Row 7: New employee missing password (no defaultPassword) -> INVALID
      {
        employeeCode: 'YLD-302',
        fullName: 'No Password User',
        email: 'nopwd@yaldi.ae',
      },
    ],
  });

  assert.equal(result.updateCount, 2);
  assert.equal(result.newCount, 1);
  assert.equal(result.invalidCount, 3);
  assert.equal(result.validPayloadRows.length, 3);

  assert.equal(result.rows[0].classification, 'update');
  assert.equal(result.rows[0].matchedBy, 'employeeCode');
  assert.equal(result.rows[0].passwordSource, 'keep_existing');
  assert.equal(result.rows[0].payload.initialPassword, undefined);
  assert.equal(result.rows[0].payload.primaryCompanyId, 'comp-yaldi');

  assert.equal(result.rows[1].classification, 'update');
  assert.equal(result.rows[1].matchedBy, 'id');

  assert.equal(result.rows[2].classification, 'new');
  assert.equal(result.rows[2].passwordSource, 'row');
  assert.equal(result.rows[2].payload.primaryCompanyId, 'comp-urban');
  assert.equal(result.rows[2].payload.sectionId, 'sec-ops');

  assert.equal(result.rows[3].classification, 'invalid');
  assert.match(result.rows[3].errors[0], /already belongs/i);

  assert.equal(result.rows[4].classification, 'invalid');
  assert.match(result.rows[4].errors[0], /already belongs/i);

  assert.equal(result.rows[5].classification, 'invalid');
  assert.match(result.rows[5].errors[0], /Password is required/i);
});

test('Default Temporary Password unlocks new rows with blank initialPassword and ignores updates', () => {
  const existing = [makeExisting({ id: 'emp-104', employeeCode: 'YLD-104', email: 'omar@yaldi.ae' })];

  const result = evaluateBulkImportRows({
    existingEmployees: existing,
    companies: COMPANIES,
    sections: SECTIONS,
    defaultPassword: 'SharedTemp99!',
    rawRows: [
      {
        employeeCode: 'YLD-501',
        fullName: 'Nour Ali',
        email: 'nour.ali@yaldi.ae',
        initialPassword: '',
      },
      {
        employeeCode: 'YLD-104',
        jobTitle: 'Fleet Lead',
      },
    ],
  });

  assert.equal(result.newCount, 1);
  assert.equal(result.updateCount, 1);
  assert.equal(result.invalidCount, 0);
  assert.equal(result.rows[0].passwordSource, 'default');
  assert.equal(result.rows[1].passwordSource, 'keep_existing');
});

test('Excel serial dates and POST /users/bulk snake_case/camelCase responses parse accurately', () => {
  // 46037 in Excel serial days = 2026-01-15
  assert.equal(parseSpreadsheetDate(46037), '2026-01-15');
  assert.equal(parseSpreadsheetDate('2026-05-20'), '2026-05-20');

  const snakeParsed = parseBulkImportResponse({
    created_count: 3,
    updated_count: 2,
    failed_count: 1,
    errors: [{ row: 7, employee_code: 'YLD-900', email: 'bad@yaldi.ae', message: 'Duplicate email' }],
  });
  assert.equal(snakeParsed.createdCount, 3);
  assert.equal(snakeParsed.updatedCount, 2);
  assert.equal(snakeParsed.failedCount, 1);
  assert.equal(snakeParsed.errors[0].employeeCode, 'YLD-900');
  assert.equal(snakeParsed.errors[0].error, 'Duplicate email');
});
