import {
  BulkImportResult,
  BulkImportRowError,
  BulkImportUserRow,
  Company,
  Employee,
  EmployeeType,
  Section,
  UserRole,
} from '../types/hr';
import { inferDefaultEmployeeType, normalizeUserRole } from './hrLogic';

export const BULK_IMPORT_TEMPLATE_COLUMNS = [
  'employeeCode',
  'fullName',
  'email',
  'initialPassword',
  'role',
  'phone',
  'company',
  'section',
  'employeeType',
  'jobTitle',
  'joinDate',
  'baseSalary',
  'housingAllowance',
  'transportAllowance',
  'otherAllowance',
  'mohrePersonId',
  'bankName',
  'iban',
  'bankRoutingCode',
] as const;

export type BulkImportRowClassification = 'new' | 'update' | 'invalid';

export interface EvaluatedBulkImportRow {
  /** 1-based spreadsheet row number (row 2 = first data row under header). */
  rowNumber: number;
  classification: BulkImportRowClassification;
  matchedEmployeeId?: string;
  matchedEmployeeName?: string;
  matchedBy?: 'id' | 'employeeCode';
  passwordSource: 'row' | 'default' | 'keep_existing' | 'missing';
  resolvedCompanyName?: string;
  resolvedSectionName?: string;
  errors: string[];
  warnings: string[];
  normalized: BulkImportUserRow;
  /** Clean payload sent to POST /users/bulk when classification !== 'invalid'. */
  payload: BulkImportUserRow;
}

export interface EvaluatedBulkImportSummary {
  rows: EvaluatedBulkImportRow[];
  validPayloadRows: BulkImportUserRow[];
  newCount: number;
  updateCount: number;
  invalidCount: number;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function buildBulkImportTemplateRows(
  companies: Company[],
  sections: Section[]
): Record<string, string | number>[] {
  const sampleCompany = companies[0]?.code || companies[0]?.name || 'YLD';
  const sampleSection = sections[0]?.code || sections[0]?.name || 'DRV';

  return [
    {
      employeeCode: 'YLD-201',
      fullName: 'Ahmed Al-Mansoor',
      email: 'ahmed.mansoor@yaldi.ae',
      initialPassword: 'TempPass2026!',
      role: 'employee',
      phone: '+971 50 123 4567',
      company: sampleCompany,
      section: sampleSection,
      employeeType: 'driver',
      jobTitle: 'Fleet Driver',
      joinDate: '2026-01-15',
      baseSalary: 4500,
      housingAllowance: 1200,
      transportAllowance: 500,
      otherAllowance: 300,
      mohrePersonId: '10029481020999',
      bankName: 'ADCB',
      iban: 'AE190030010482910300099',
      bankRoutingCode: '300310101',
    },
  ];
}

function canonicalHeaderKey(key: string): string {
  return key.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function cleanString(val: unknown): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

function parseOptionalNumber(val: unknown): { value?: number; invalid?: boolean } {
  if (val === null || val === undefined) return {};
  const str = String(val).trim();
  if (!str) return {};
  const cleaned = str.replace(/,/g, '');
  const num = Number(cleaned);
  if (!Number.isFinite(num) || num < 0) {
    return { invalid: true };
  }
  return { value: Number(num.toFixed(2)) };
}

/**
 * Parses YYYY-MM-DD strings, Date objects, or Excel serial date numbers into YYYY-MM-DD.
 */
export function parseSpreadsheetDate(val: unknown): string {
  if (val === null || val === undefined || val === '') return '';
  if (val instanceof Date && !Number.isNaN(val.getTime())) {
    const y = val.getUTCFullYear();
    const m = String(val.getUTCMonth() + 1).padStart(2, '0');
    const d = String(val.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof val === 'number' && Number.isFinite(val) && val > 20000 && val < 90000) {
    // Excel serial date (days since 1899-12-30)
    const utcMs = Math.round((val - 25569) * 86400 * 1000);
    const dt = new Date(utcMs);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getUTCFullYear();
      const m = String(dt.getUTCMonth() + 1).padStart(2, '0');
      const d = String(dt.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
  const str = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    return str;
  }
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return str;
}

export function normalizeEmployeeTypeValue(raw: unknown): EmployeeType | undefined {
  const s = cleanString(raw).toLowerCase().replace(/[\s-]+/g, '_');
  if (!s) return undefined;
  if (s === 'office_employee' || s === 'office' || s === 'staff') return 'office_employee';
  if (s === 'driver' || s === 'drivers' || s === 'fleet_driver') return 'driver';
  if (s === 'management' || s === 'manager' || s === 'executive' || s === 'mgmt') {
    return 'management';
  }
  return undefined;
}

export function resolveCompanyMatch(input: string | undefined, companies: Company[]): Company | undefined {
  const query = cleanString(input).toLowerCase();
  if (!query) return undefined;
  return companies.find(
    (c) =>
      c.id.toLowerCase() === query ||
      c.code.toLowerCase() === query ||
      c.name.toLowerCase() === query
  );
}

export function resolveSectionMatch(input: string | undefined, sections: Section[]): Section | undefined {
  const query = cleanString(input).toLowerCase();
  if (!query) return undefined;
  return sections.find(
    (s) =>
      s.id.toLowerCase() === query ||
      s.code.toLowerCase() === query ||
      s.name.toLowerCase() === query
  );
}

const HEADER_ALIASES: Record<string, keyof BulkImportUserRow> = {
  id: 'id',
  userid: 'id',
  employeeid: 'id',
  employeecode: 'employeeCode',
  empcode: 'employeeCode',
  code: 'employeeCode',
  fullname: 'fullName',
  name: 'fullName',
  employeename: 'fullName',
  email: 'email',
  workemail: 'email',
  initialpassword: 'initialPassword',
  password: 'initialPassword',
  temppassword: 'initialPassword',
  temporarypassword: 'initialPassword',
  role: 'role',
  userrole: 'role',
  phone: 'phone',
  mobile: 'phone',
  phonenumber: 'phone',
  company: 'company',
  companyname: 'company',
  companycode: 'company',
  primarycompanyid: 'primaryCompanyId',
  companyid: 'primaryCompanyId',
  section: 'section',
  department: 'section',
  sectionname: 'section',
  sectioncode: 'section',
  sectionid: 'sectionId',
  employeetype: 'employeeType',
  type: 'employeeType',
  jobtitle: 'jobTitle',
  title: 'jobTitle',
  position: 'jobTitle',
  joindate: 'joinDate',
  hiredate: 'joinDate',
  basesalary: 'baseSalary',
  basicsalary: 'baseSalary',
  housingallowance: 'housingAllowance',
  housing: 'housingAllowance',
  transportallowance: 'transportAllowance',
  transport: 'transportAllowance',
  otherallowance: 'otherAllowance',
  otherallowances: 'otherAllowance',
  mohrepersonid: 'mohrePersonId',
  mohreid: 'mohrePersonId',
  labourcard: 'mohrePersonId',
  laborcard: 'mohrePersonId',
  bankname: 'bankName',
  bank: 'bankName',
  iban: 'iban',
  bankiban: 'iban',
  bankroutingcode: 'bankRoutingCode',
  routingcode: 'bankRoutingCode',
  wpsroutingcode: 'bankRoutingCode',
};

export function normalizeRawSpreadsheetRow(rawRow: Record<string, unknown>): {
  row: BulkImportUserRow;
  numericErrors: string[];
  isEmpty: boolean;
} {
  const mapped: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rawRow)) {
    const target = HEADER_ALIASES[canonicalHeaderKey(k)];
    if (target) {
      mapped[target] = v;
    }
  }

  const numericErrors: string[] = [];
  const parseNumField = (field: keyof BulkImportUserRow, label: string): number | undefined => {
    const parsed = parseOptionalNumber(mapped[field]);
    if (parsed.invalid) {
      numericErrors.push(`${label} must be a non-negative number.`);
      return undefined;
    }
    return parsed.value;
  };

  const row: BulkImportUserRow = {
    id: cleanString(mapped.id) || undefined,
    employeeCode: cleanString(mapped.employeeCode) || undefined,
    fullName: cleanString(mapped.fullName) || undefined,
    email: cleanString(mapped.email).toLowerCase() || undefined,
    initialPassword: cleanString(mapped.initialPassword) || undefined,
    role: cleanString(mapped.role) || undefined,
    phone: cleanString(mapped.phone) || undefined,
    company: cleanString(mapped.company) || undefined,
    primaryCompanyId: cleanString(mapped.primaryCompanyId) || undefined,
    section: cleanString(mapped.section) || undefined,
    sectionId: cleanString(mapped.sectionId) || undefined,
    employeeType: cleanString(mapped.employeeType) || undefined,
    jobTitle: cleanString(mapped.jobTitle) || undefined,
    joinDate: parseSpreadsheetDate(mapped.joinDate) || undefined,
    baseSalary: parseNumField('baseSalary', 'baseSalary'),
    housingAllowance: parseNumField('housingAllowance', 'housingAllowance'),
    transportAllowance: parseNumField('transportAllowance', 'transportAllowance'),
    otherAllowance: parseNumField('otherAllowance', 'otherAllowance'),
    mohrePersonId: cleanString(mapped.mohrePersonId) || undefined,
    bankName: cleanString(mapped.bankName) || undefined,
    iban: cleanString(mapped.iban) || undefined,
    bankRoutingCode: cleanString(mapped.bankRoutingCode) || undefined,
  };

  const isEmpty = Object.values(row).every((v) => v === undefined || v === '');
  return { row, numericErrors, isEmpty };
}

/**
 * Classifies uploaded spreadsheet rows for Bulk Import / Update:
 * - Upsert matching strictly by `id` or `employeeCode` (case-insensitive).
 * - Update: matched existing employee; password optional (blank keeps existing password);
 *   email must not collide with a different user.
 * - New: no id/employeeCode match; requires fullName, valid unique email, and password
 *   (row initialPassword or defaultPassword, min 6 chars).
 * - Invalid: missing required fields, duplicate/taken email, or password < 6 chars.
 */
export function evaluateBulkImportRows(params: {
  rawRows: Record<string, unknown>[];
  existingEmployees: Employee[];
  companies: Company[];
  sections: Section[];
  defaultPassword?: string;
}): EvaluatedBulkImportSummary {
  const { rawRows, existingEmployees, companies, sections } = params;
  const trimmedDefaultPwd = (params.defaultPassword ?? '').trim();

  const existingById = new Map<string, Employee>();
  const existingByCode = new Map<string, Employee>();
  const existingByEmail = new Map<string, Employee>();

  for (const emp of existingEmployees) {
    existingById.set(emp.id.trim().toLowerCase(), emp);
    if (emp.employeeCode) {
      existingByCode.set(emp.employeeCode.trim().toLowerCase(), emp);
    }
    if (emp.email) {
      existingByEmail.set(emp.email.trim().toLowerCase(), emp);
    }
  }

  // Track emails and employeeCodes claimed by earlier valid rows in the same batch
  const claimedEmailOwner = new Map<string, { rowNumber: number; employeeId?: string }>();
  const claimedNewCodes = new Map<string, number>();

  const evaluatedRows: EvaluatedBulkImportRow[] = [];
  const validPayloadRows: BulkImportUserRow[] = [];
  let newCount = 0;
  let updateCount = 0;
  let invalidCount = 0;

  rawRows.forEach((rawRow, idx) => {
    const rowNumber = idx + 2; // Spreadsheet row 1 is header
    const { row, numericErrors, isEmpty } = normalizeRawSpreadsheetRow(rawRow);
    if (isEmpty) return;

    const errors: string[] = [...numericErrors];
    const warnings: string[] = [];

    // Strict Upsert Match by id or employeeCode ONLY
    let matchedEmployee: Employee | undefined;
    let matchedBy: 'id' | 'employeeCode' | undefined;

    if (row.id) {
      const byId = existingById.get(row.id.toLowerCase());
      if (byId) {
        matchedEmployee = byId;
        matchedBy = 'id';
      }
    }
    if (!matchedEmployee && row.employeeCode) {
      const byCode = existingByCode.get(row.employeeCode.toLowerCase());
      if (byCode) {
        matchedEmployee = byCode;
        matchedBy = 'employeeCode';
      }
    }

    // Resolve Company & Section if provided
    const companyQuery = row.primaryCompanyId || row.company;
    const matchedCompany = resolveCompanyMatch(companyQuery, companies);
    if (companyQuery && !matchedCompany) {
      warnings.push(`Company "${companyQuery}" not matched locally; raw value will be sent.`);
    }

    const sectionQuery = row.sectionId || row.section;
    const matchedSection = resolveSectionMatch(sectionQuery, sections);
    if (sectionQuery && !matchedSection) {
      warnings.push(`Section "${sectionQuery}" not matched locally; raw value will be sent.`);
    }

    const normalizedRole = row.role ? normalizeUserRole(row.role) : undefined;
    const normalizedEmpType = row.employeeType
      ? normalizeEmployeeTypeValue(row.employeeType)
      : undefined;
    if (row.employeeType && !normalizedEmpType) {
      errors.push(
        `Invalid employeeType "${row.employeeType}". Use office_employee, driver, or management.`
      );
    }

    if (row.joinDate && !/^\d{4}-\d{2}-\d{2}$/.test(row.joinDate)) {
      errors.push(`Invalid joinDate "${row.joinDate}". Expected YYYY-MM-DD.`);
    }

    let passwordSource: EvaluatedBulkImportRow['passwordSource'] = 'missing';

    if (matchedEmployee) {
      // UPDATE path
      if (row.email) {
        if (!EMAIL_REGEX.test(row.email)) {
          errors.push(`Invalid email format "${row.email}".`);
        } else {
          const emailOwner = existingByEmail.get(row.email);
          if (emailOwner && emailOwner.id !== matchedEmployee.id) {
            errors.push(
              `Email "${row.email}" already belongs to ${emailOwner.fullName} (${emailOwner.employeeCode}).`
            );
          }
          const batchOwner = claimedEmailOwner.get(row.email);
          if (batchOwner && batchOwner.employeeId !== matchedEmployee.id) {
            errors.push(`Duplicate email "${row.email}" already used in row ${batchOwner.rowNumber}.`);
          }
        }
      }

      if (row.initialPassword) {
        if (row.initialPassword.length < 6) {
          errors.push('Password must be at least 6 characters.');
        } else {
          passwordSource = 'row';
        }
      } else {
        passwordSource = 'keep_existing';
      }

      const payload: BulkImportUserRow = {
        id: matchedEmployee.id,
        employeeCode: row.employeeCode || matchedEmployee.employeeCode,
        ...(row.fullName ? { fullName: row.fullName } : {}),
        ...(row.email ? { email: row.email } : {}),
        ...(row.initialPassword ? { initialPassword: row.initialPassword } : {}),
        ...(normalizedRole ? { role: normalizedRole } : {}),
        ...(row.phone ? { phone: row.phone } : {}),
        ...(matchedCompany
          ? { primaryCompanyId: matchedCompany.id, company: matchedCompany.name }
          : row.company
            ? { company: row.company }
            : {}),
        ...(matchedSection
          ? { sectionId: matchedSection.id, section: matchedSection.name }
          : row.section
            ? { section: row.section }
            : {}),
        ...(normalizedEmpType ? { employeeType: normalizedEmpType } : {}),
        ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
        ...(row.joinDate ? { joinDate: row.joinDate } : {}),
        ...(row.baseSalary !== undefined ? { baseSalary: row.baseSalary } : {}),
        ...(row.housingAllowance !== undefined ? { housingAllowance: row.housingAllowance } : {}),
        ...(row.transportAllowance !== undefined
          ? { transportAllowance: row.transportAllowance }
          : {}),
        ...(row.otherAllowance !== undefined ? { otherAllowance: row.otherAllowance } : {}),
        ...(row.mohrePersonId ? { mohrePersonId: row.mohrePersonId } : {}),
        ...(row.bankName ? { bankName: row.bankName } : {}),
        ...(row.iban ? { iban: row.iban } : {}),
        ...(row.bankRoutingCode ? { bankRoutingCode: row.bankRoutingCode } : {}),
      };

      const isValid = errors.length === 0;
      if (isValid) {
        updateCount += 1;
        validPayloadRows.push(payload);
        if (row.email) {
          claimedEmailOwner.set(row.email, { rowNumber, employeeId: matchedEmployee.id });
        }
      } else {
        invalidCount += 1;
      }

      evaluatedRows.push({
        rowNumber,
        classification: isValid ? 'update' : 'invalid',
        matchedEmployeeId: matchedEmployee.id,
        matchedEmployeeName: matchedEmployee.fullName,
        matchedBy,
        passwordSource,
        resolvedCompanyName: matchedCompany?.name ?? row.company,
        resolvedSectionName: matchedSection?.name ?? row.section,
        errors,
        warnings,
        normalized: row,
        payload,
      });
    } else {
      // NEW employee path
      if (!row.fullName) {
        errors.push('Full name is required for new employees.');
      }

      if (!row.email) {
        errors.push('Email is required for new employees.');
      } else if (!EMAIL_REGEX.test(row.email)) {
        errors.push(`Invalid email format "${row.email}".`);
      } else {
        const emailOwner = existingByEmail.get(row.email);
        if (emailOwner) {
          errors.push(
            `Email "${row.email}" already belongs to ${emailOwner.fullName} (${emailOwner.employeeCode}).`
          );
        }
        const batchOwner = claimedEmailOwner.get(row.email);
        if (batchOwner) {
          errors.push(`Duplicate email "${row.email}" already used in row ${batchOwner.rowNumber}.`);
        }
      }

      if (row.employeeCode) {
        const codeKey = row.employeeCode.toLowerCase();
        const prevCodeRow = claimedNewCodes.get(codeKey);
        if (prevCodeRow) {
          errors.push(
            `Duplicate employeeCode "${row.employeeCode}" already used in row ${prevCodeRow}.`
          );
        }
      }

      const effectivePwd = row.initialPassword || trimmedDefaultPwd;
      if (!effectivePwd) {
        errors.push('Password is required (provide initialPassword or a Default Temporary Password).');
        passwordSource = 'missing';
      } else if (effectivePwd.length < 6) {
        errors.push('Password must be at least 6 characters.');
        passwordSource = row.initialPassword ? 'row' : 'default';
      } else {
        passwordSource = row.initialPassword ? 'row' : 'default';
      }

      const resolvedRole = normalizedRole ?? UserRole.Employee;
      const resolvedEmpType =
        normalizedEmpType ??
        inferDefaultEmployeeType({
          role: resolvedRole,
          sectionId: matchedSection?.id,
        });

      const payload: BulkImportUserRow = {
        ...(row.employeeCode ? { employeeCode: row.employeeCode } : {}),
        fullName: row.fullName,
        email: row.email,
        ...(row.initialPassword ? { initialPassword: row.initialPassword } : {}),
        role: resolvedRole,
        ...(row.phone ? { phone: row.phone } : {}),
        ...(matchedCompany
          ? { primaryCompanyId: matchedCompany.id, company: matchedCompany.name }
          : row.company
            ? { company: row.company }
            : {}),
        ...(matchedSection
          ? { sectionId: matchedSection.id, section: matchedSection.name }
          : row.section
            ? { section: row.section }
            : {}),
        employeeType: resolvedEmpType,
        ...(row.jobTitle ? { jobTitle: row.jobTitle } : {}),
        ...(row.joinDate ? { joinDate: row.joinDate } : {}),
        ...(row.baseSalary !== undefined ? { baseSalary: row.baseSalary } : {}),
        ...(row.housingAllowance !== undefined ? { housingAllowance: row.housingAllowance } : {}),
        ...(row.transportAllowance !== undefined
          ? { transportAllowance: row.transportAllowance }
          : {}),
        ...(row.otherAllowance !== undefined ? { otherAllowance: row.otherAllowance } : {}),
        ...(row.mohrePersonId ? { mohrePersonId: row.mohrePersonId } : {}),
        ...(row.bankName ? { bankName: row.bankName } : {}),
        ...(row.iban ? { iban: row.iban } : {}),
        ...(row.bankRoutingCode ? { bankRoutingCode: row.bankRoutingCode } : {}),
      };

      const isValid = errors.length === 0;
      if (isValid) {
        newCount += 1;
        validPayloadRows.push(payload);
        if (row.email) {
          claimedEmailOwner.set(row.email, { rowNumber });
        }
        if (row.employeeCode) {
          claimedNewCodes.set(row.employeeCode.toLowerCase(), rowNumber);
        }
      } else {
        invalidCount += 1;
      }

      evaluatedRows.push({
        rowNumber,
        classification: isValid ? 'new' : 'invalid',
        passwordSource,
        resolvedCompanyName: matchedCompany?.name ?? row.company,
        resolvedSectionName: matchedSection?.name ?? row.section,
        errors,
        warnings,
        normalized: row,
        payload,
      });
    }
  });

  return {
    rows: evaluatedRows,
    validPayloadRows,
    newCount,
    updateCount,
    invalidCount,
  };
}

/**
 * Normalizes camelCase or snake_case JSON responses from POST /users/bulk.
 */
export function parseBulkImportResponse(raw: unknown): BulkImportResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const rawErrors = Array.isArray(obj.errors) ? obj.errors : [];
  const errors: BulkImportRowError[] = rawErrors.map((item) => {
    const rec = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
    return {
      rowNumber:
        typeof rec.rowNumber === 'number'
          ? rec.rowNumber
          : typeof rec.row === 'number'
            ? rec.row
            : typeof rec.index === 'number'
              ? rec.index + 1
              : undefined,
      employeeCode: cleanString(rec.employeeCode ?? rec.employee_code) || undefined,
      email: cleanString(rec.email) || undefined,
      fullName: cleanString(rec.fullName ?? rec.full_name) || undefined,
      error: cleanString(rec.error ?? rec.message ?? rec.detail) || 'Row failed on server.',
    };
  });

  const createdCount = Number(obj.createdCount ?? obj.created_count ?? obj.created ?? 0) || 0;
  const updatedCount = Number(obj.updatedCount ?? obj.updated_count ?? obj.updated ?? 0) || 0;
  const failedCount =
    Number(obj.failedCount ?? obj.failed_count ?? obj.failed ?? errors.length) || 0;

  return {
    createdCount,
    updatedCount,
    failedCount,
    errors,
  };
}
