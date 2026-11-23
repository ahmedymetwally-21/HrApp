import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  FolderKanban,
  Landmark,
  Lock,
  Printer,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import {
  getDeductionBucketLabel,
  getDeductionTriggerLabel,
  getPatchBucketLabel,
  getPaymentMethodLabel,
  getSalaryStatusLabel,
  t,
} from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AppSettings,
  AttendanceLog,
  Company,
  DeductionApprovalRequest,
  Employee,
  EmployeeLabel,
  HiddenSectionKey,
  Language,
  LeaveRequest,
  MonthlyPayrollRow,
  PatchMoneyRelease,
  PatchPaymentMethod,
  PatchReleaseAllocation,
  PayrollAdjustment,
  PayrollApprovalRun,
  PayrollEntry,
  PayrollReleaseScopeType,
  Project,
  SalaryReleaseSchedule,
  SalaryReleaseStatus,
  Section,
  UserRole,
} from '../types/hr';
import {
  buildAdcbWpsExport,
  buildPayrollCSV,
  buildPayrollExportRecords,
  calculateEmployeePayroll,
  calculateEmployeePendingBalances,
  canControlSalaryRelease,
  formatAED,
  formatShortDate,
  isAdminOrHRRole,
  isPayrollEligible,
  isSectionHidden,
  validatePatchReleaseAllocations,
} from '../utils/hrLogic';
import { useIsCompactOverlay } from '../hooks/useIsCompactOverlay';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface PayrollViewProps {
  lang: Language;
  section?: 'overview' | 'patch_releases' | 'release_schedules';
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  projects?: Project[];
  scopedEmployees: Employee[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  adjustments: PayrollAdjustment[];
  payrollEntries: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
  salaryReleases: SalaryReleaseSchedule[];
  payrollApprovalRuns?: PayrollApprovalRun[];
  settings: AppSettings;
  hiddenSections?: HiddenSectionKey[];
  onAddAdjustment: (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => Promise<void>;
  onRemoveAdjustment: (id: string) => Promise<void>;
  onUpsertReleaseSchedule: (input: {
    month: string;
    payPeriod: string;
    scopeType: 'section' | 'employee';
    scopeId: string;
    companyId: string | 'all';
    projectId?: string;
    employeeIds?: string[];
    approvalRunId?: string;
    releaseDate: string;
    status: SalaryReleaseStatus;
    delayedUntilDate?: string | null;
    delayReason?: string | null;
    updatedBy: string;
  }) => Promise<void>;
  onCreateApprovalRun?: (input: {
    month: string;
    scopeType: PayrollReleaseScopeType;
    scopeId?: string | null;
    scopeLabel: string;
    employeeIds: string[];
    employeeCount: number;
    totalNetAED: number;
    notes?: string;
  }) => Promise<void>;
  onActionApprovalRun?: (input: {
    id: string;
    action: 'approve' | 'reject' | 'bypass';
    comment?: string;
  }) => Promise<void>;
  onCreatePatchRelease?: (input: {
    employeeId: string;
    companyId: string;
    releaseDate: string;
    paymentMethod: PatchPaymentMethod;
    totalAmountAED: number;
    allocations: PatchReleaseAllocation[];
    referenceNote?: string;
    releasedBy: string;
    releasedByRole: UserRole;
  }) => Promise<void>;
  onDeletePatchRelease?: (id: string) => Promise<void>;
}

const RELEASE_STATUSES: SalaryReleaseStatus[] = [
  'Scheduled',
  'Processing',
  'Delayed',
  'Released',
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

function getMonthOptions(): { value: string; label: string }[] {
  const now = new Date();
  const list: { value: string; label: string }[] = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    list.push({ value: val, label });
  }
  return list;
}

function getStatusDotClass(status: SalaryReleaseStatus): string {
  if (status === 'Released') return 'bg-emerald-500';
  if (status === 'Processing') return 'bg-teal-500';
  if (status === 'Delayed') return 'bg-amber-500';
  return 'bg-slate-400';
}

function getStatusTextClass(status: SalaryReleaseStatus): string {
  if (status === 'Released') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'Processing') return 'text-teal-700 dark:text-teal-300';
  if (status === 'Delayed') return 'text-amber-700 dark:text-amber-400';
  return 'text-slate-600 dark:text-slate-400';
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  lang,
  section = 'overview',
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  labels,
  projects = [],
  scopedEmployees,
  attendance,
  leaves,
  adjustments,
  payrollEntries,
  deductionApprovals = [],
  patchReleases = [],
  salaryReleases,
  payrollApprovalRuns = [],
  settings,
  hiddenSections = [],
  onRemoveAdjustment,
  onUpsertReleaseSchedule,
  onCreateApprovalRun,
  onActionApprovalRun,
  onCreatePatchRelease,
  onDeletePatchRelease,
}) => {
  const isCompactOverlay = useIsCompactOverlay();

  const hideSalaryBreakdown = isSectionHidden(hiddenSections, 'salary_breakdown');
  const hideDeductions = isSectionHidden(hiddenSections, 'deductions');
  const hidePayslips = isSectionHidden(hiddenSections, 'payslips');

  const canManageAdjustments = isAdminOrHRRole(activeRole);
  const canControlRelease = canControlSalaryRelease(activeRole);
  const canSubmitPayrollApproval =
    isAdminOrHRRole(activeRole) || activeRole === UserRole.Accounting;
  const canBypassApprovalRun =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRManager;
  const canReleasePatch = isAdminOrHRRole(activeRole) || activeRole === UserRole.Accounting;
  const canExportExcel =
    isAdminOrHRRole(activeRole) ||
    activeRole === UserRole.Accounting ||
    activeRole === UserRole.SectionManager ||
    activeRole === UserRole.SectionCoManager;
  const isEmployeeOnly = activeRole === UserRole.Employee;
  const isAccounting = activeRole === UserRole.Accounting;
  const canSeeMySalary = activeRole !== UserRole.MainManager && isPayrollEligible(currentUser);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [showMySalaryOnly, setShowMySalaryOnly] = useState(false);

  // Full-page sub-views (no popups on desktop browser)
  const [subPage, setSubPage] = useState<
    'main' | 'create_patch' | 'wps_export' | 'payslip' | 'edit_release'
  >('main');

  useEffect(() => {
    setSubPage('main');
  }, [section]);

  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SalaryReleaseStatus>('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [patchSearch, setPatchSearch] = useState('');
  const [selectedPayslipEmpId, setSelectedPayslipEmpId] = useState<string | null>(null);
  const [confirmDeletePatch, setConfirmDeletePatch] = useState<PatchMoneyRelease | null>(null);

  // Release Money / Patch form state
  const [patchError, setPatchError] = useState<string | null>(null);
  const [patchSaving, setPatchSaving] = useState(false);
  const [patchEmpId, setPatchEmpId] = useState('');
  const [patchAmountStr, setPatchAmountStr] = useState('');
  const [patchMethod, setPatchMethod] = useState<PatchPaymentMethod>('Cash');
  const [patchDate, setPatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patchReceiptNote, setPatchReceiptNote] = useState('');
  const [patchAllocInputs, setPatchAllocInputs] = useState<Record<string, string>>({});

  // ADCB WPS Export state
  const [wpsCompanyId, setWpsCompanyId] = useState<string>('');
  const [wpsMonth, setWpsMonth] = useState<string>(monthOptions[0].value);

  // Release Schedule editor state
  const [releaseDraft, setReleaseDraft] = useState<{
    scopeType: 'section' | 'employee';
    scopeId: string;
    title: string;
    companyId: string | 'all';
    releaseDate: string;
    status: SalaryReleaseStatus;
    delayedUntilDate: string;
    delayReason: string;
  } | null>(null);
  const [releaseError, setReleaseError] = useState<string | null>(null);
  const [releaseSaving, setReleaseSaving] = useState(false);

  // Payroll Approval Gate state
  const [approvalScopeType, setApprovalScopeType] = useState<PayrollReleaseScopeType>('all');
  const [approvalCompanyId, setApprovalCompanyId] = useState<string>(companies[0]?.id ?? '');
  const [approvalProjectId, setApprovalProjectId] = useState<string>(projects[0]?.id ?? '');
  const [approvalEmployeeIds, setApprovalEmployeeIds] = useState<string[]>([]);
  const [approvalEmpSearch, setApprovalEmpSearch] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');
  const [approvalSubmitting, setApprovalSubmitting] = useState(false);
  const [approvalActionBusyId, setApprovalActionBusyId] = useState<string | null>(null);
  const [approvalComments, setApprovalComments] = useState<Record<string, string>>({});
  const [approvalError, setApprovalError] = useState<string | null>(null);

  // Scoped Salary Release panel state
  const [scopedReleaseMode, setScopedReleaseMode] = useState<'company' | 'project' | 'employees'>(
    'company'
  );
  const [scopedReleaseCompanyId, setScopedReleaseCompanyId] = useState<string>(
    companies[0]?.id ?? ''
  );
  const [scopedReleaseProjectId, setScopedReleaseProjectId] = useState<string>(
    projects[0]?.id ?? ''
  );
  const [scopedReleaseEmployeeIds, setScopedReleaseEmployeeIds] = useState<string[]>([]);
  const [scopedReleaseEmpSearch, setScopedReleaseEmpSearch] = useState('');
  const [scopedReleaseDate, setScopedReleaseDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [scopedReleaseStatus, setScopedReleaseStatus] = useState<SalaryReleaseStatus>('Released');
  const [scopedReleaseSaving, setScopedReleaseSaving] = useState(false);
  const [scopedReleaseError, setScopedReleaseError] = useState<string | null>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);
  const labelNameMap = useMemo(() => new Map(labels.map((l) => [l.id, l.name])), [labels]);
  const employeeMap = useMemo(
    () => new Map(scopedEmployees.map((e) => [e.id, e])),
    [scopedEmployees]
  );

  const eligibleScopedEmployees = useMemo(
    () => scopedEmployees.filter((emp) => isPayrollEligible(emp)),
    [scopedEmployees]
  );

  const activeEligibleEmployees = useMemo(
    () => eligibleScopedEmployees.filter((emp) => emp.active),
    [eligibleScopedEmployees]
  );

  const fullMonthPayrollByEmpId = useMemo(() => {
    const map = new Map<string, MonthlyPayrollRow>();
    activeEligibleEmployees.forEach((emp) => {
      map.set(
        emp.id,
        calculateEmployeePayroll(
          emp,
          selectedMonth,
          adjustments,
          attendance,
          salaryReleases,
          payrollEntries,
          leaves,
          deductionApprovals,
          patchReleases
        )
      );
    });
    return map;
  }, [
    activeEligibleEmployees,
    selectedMonth,
    adjustments,
    attendance,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases,
  ]);

  const monthApprovalRuns = useMemo(
    () =>
      payrollApprovalRuns
        .filter((run) => run.month === selectedMonth)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [payrollApprovalRuns, selectedMonth]
  );

  const approvalScopeSelection = useMemo(() => {
    let matched: Employee[] = [];
    let scopeId: string | null = null;
    let scopeLabel = 'All Eligible Employees';

    if (approvalScopeType === 'all') {
      matched = activeEligibleEmployees;
      scopeId = null;
      scopeLabel = 'All Eligible Employees';
    } else if (approvalScopeType === 'company') {
      const targetCompId = approvalCompanyId || companies[0]?.id || '';
      matched = activeEligibleEmployees.filter((e) => e.primaryCompanyId === targetCompId);
      scopeId = targetCompId || null;
      scopeLabel = companyMap.get(targetCompId)
        ? `Company: ${companyMap.get(targetCompId)}`
        : 'Selected Company';
    } else if (approvalScopeType === 'project') {
      const targetProjId = approvalProjectId || projects[0]?.id || '';
      matched = activeEligibleEmployees.filter((e) => (e.projectIds ?? []).includes(targetProjId));
      scopeId = targetProjId || null;
      const proj = projectMap.get(targetProjId);
      scopeLabel = proj ? `Project: ${proj.name}` : 'Selected Project';
    } else {
      const idSet = new Set(approvalEmployeeIds);
      matched = activeEligibleEmployees.filter((e) => idSet.has(e.id));
      scopeId = null;
      scopeLabel =
        matched.length === 1
          ? `Employee: ${matched[0].fullName}`
          : `Specific Employees (${matched.length})`;
    }

    const totalNetAED = matched.reduce(
      (sum, emp) => sum + (fullMonthPayrollByEmpId.get(emp.id)?.netSalary ?? 0),
      0
    );

    return {
      employees: matched,
      employeeIds: matched.map((e) => e.id),
      scopeId,
      scopeLabel,
      totalNetAED: Math.round(totalNetAED * 100) / 100,
    };
  }, [
    approvalScopeType,
    approvalCompanyId,
    approvalProjectId,
    approvalEmployeeIds,
    activeEligibleEmployees,
    companies,
    projects,
    companyMap,
    projectMap,
    fullMonthPayrollByEmpId,
  ]);

  const findApprovedRunForTarget = (params: {
    targetEmployeeIds: string[];
    companyId?: string | 'all';
    projectId?: string;
  }): PayrollApprovalRun | null => {
    const approvedRuns = monthApprovalRuns.filter(
      (r) => r.status === 'approved' || r.status === 'bypassed'
    );
    for (const run of approvedRuns) {
      if (run.scopeType === 'all') return run;
      if (
        params.companyId &&
        params.companyId !== 'all' &&
        run.scopeType === 'company' &&
        run.scopeId === params.companyId
      ) {
        return run;
      }
      if (params.projectId && run.scopeType === 'project' && run.scopeId === params.projectId) {
        return run;
      }
      if (
        params.targetEmployeeIds.length > 0 &&
        params.targetEmployeeIds.every((id) => run.employeeIds.includes(id))
      ) {
        return run;
      }
    }
    return null;
  };

  const canActOnApprovalRun = (run: PayrollApprovalRun): boolean => {
    if (run.status !== 'pending') return false;
    if (canBypassApprovalRun) return true;
    const step = run.steps[run.currentStepIndex];
    if (!step) return isAdminOrHRRole(activeRole);
    if (step.approverId && String(step.approverId) === String(currentUser.id)) return true;
    const role = step.role;
    if (!role) return false;
    if (role === activeRole) return true;
    if (role === 'hr_admin' && activeRole === UserRole.HRAdmin) return true;
    if (role === 'section_manager' && activeRole === UserRole.SectionManager) return true;
    return false;
  };

  const targetEmployees = useMemo(() => {
    return eligibleScopedEmployees.filter((emp) => {
      if (!emp.active && !isEmployeeOnly) return false;
      if (sectionFilter !== 'all' && emp.sectionId !== sectionFilter) return false;
      if (labelFilter !== 'all' && !emp.labelIds.includes(labelFilter)) return false;
      if (
        selectedCompanyId !== 'all' &&
        !isEmployeeOnly &&
        emp.primaryCompanyId !== selectedCompanyId
      ) {
        return false;
      }
      return true;
    });
  }, [eligibleScopedEmployees, sectionFilter, labelFilter, selectedCompanyId, isEmployeeOnly]);

  const allPayrollRows = useMemo(
    () =>
      targetEmployees.map((emp) =>
        calculateEmployeePayroll(
          emp,
          selectedMonth,
          adjustments,
          attendance,
          salaryReleases,
          payrollEntries,
          leaves,
          deductionApprovals,
          patchReleases
        )
      ),
    [
      targetEmployees,
      selectedMonth,
      adjustments,
      attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases,
    ]
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return allPayrollRows;
    return allPayrollRows.filter((r) => r.release.status === statusFilter);
  }, [allPayrollRows, statusFilter]);

  const sectionGroups = useMemo(() => {
    const groups = new Map<string, MonthlyPayrollRow[]>();
    allPayrollRows.forEach((row) => {
      const secId = row.employee.sectionId;
      const list = groups.get(secId) ?? [];
      list.push(row);
      groups.set(secId, list);
    });
    return Array.from(groups.entries()).map(([sectionId, rows]) => ({
      sectionId,
      sectionName: sectionMap.get(sectionId) ?? 'General',
      rows,
      netSubtotal: rows.reduce((s, r) => s + r.netSalary, 0),
      wpsSubtotal: rows.reduce((s, r) => s + r.wpsTotalPayout, 0),
      offCycleSubtotal: rows.reduce((s, r) => s + r.offCycleNetPayout, 0),
      primaryRelease: rows[0]?.release,
    }));
  }, [allPayrollRows, sectionMap]);

  const mySalaryRow = useMemo(
    () =>
      canSeeMySalary
        ? calculateEmployeePayroll(
            currentUser,
            selectedMonth,
            adjustments,
            attendance,
            salaryReleases,
            payrollEntries,
            leaves,
            deductionApprovals,
            patchReleases
          )
        : null,
    [
      canSeeMySalary,
      currentUser,
      selectedMonth,
      adjustments,
      attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases,
    ]
  );

  const scopedPatchReleases = useMemo(() => {
    const q = patchSearch.trim().toLowerCase();
    return patchReleases
      .filter((rel) => {
        const emp = employeeMap.get(rel.employeeId);
        if (!emp) return false;
        if (selectedCompanyId !== 'all' && emp.primaryCompanyId !== selectedCompanyId) {
          return false;
        }
        if (q) {
          const hay = `${emp.fullName} ${emp.employeeCode} ${rel.paymentMethod} ${rel.referenceNote ?? ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  }, [patchReleases, employeeMap, selectedCompanyId, patchSearch]);

  const patchModalEmployee = useMemo(
    () => eligibleScopedEmployees.find((e) => e.id === patchEmpId) ?? null,
    [eligibleScopedEmployees, patchEmpId]
  );

  const patchPendingBalances = useMemo(() => {
    if (subPage !== 'create_patch' || !patchModalEmployee) return [];
    return calculateEmployeePendingBalances({
      employee: patchModalEmployee,
      currentMonth: monthOptions[0].value,
      adjustments,
      attendanceLogs: attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases,
    });
  }, [
    subPage,
    patchModalEmployee,
    monthOptions,
    adjustments,
    attendance,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases,
  ]);

  const patchDraftAllocations: PatchReleaseAllocation[] = useMemo(() => {
    return patchPendingBalances
      .map((bal) => {
        const key = `${bal.month}__${bal.bucket}`;
        const val = Number(patchAllocInputs[key] || 0);
        return {
          month: bal.month,
          bucket: bal.bucket,
          amountAED: Number.isFinite(val) && val > 0 ? Math.round(val * 100) / 100 : 0,
        };
      })
      .filter((a) => a.amountAED > 0);
  }, [patchPendingBalances, patchAllocInputs]);

  const patchDraftWpsOffset = useMemo(() => {
    return patchDraftAllocations
      .filter(
        (a) =>
          a.bucket === 'upcoming_main_salary' || a.bucket === 'upcoming_additional_in_payroll'
      )
      .reduce((sum, a) => sum + a.amountAED, 0);
  }, [patchDraftAllocations]);

  const patchTotalInputNum = Number(patchAmountStr) || 0;
  const patchAllocatedSum = patchDraftAllocations.reduce((s, a) => s + a.amountAED, 0);
  const patchRemainingToAllocate = Math.round((patchTotalInputNum - patchAllocatedSum) * 100) / 100;

  const totals = useMemo(
    () =>
      filteredRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.grossSalary,
          deductions: acc.deductions + r.totalDeductions,
          bonuses: acc.bonuses + r.totalBonuses,
          wpsPayout: acc.wpsPayout + r.wpsTotalPayout,
          offCycleNet: acc.offCycleNet + r.offCycleNetPayout,
          net: acc.net + r.netSalary,
        }),
        { gross: 0, deductions: 0, bonuses: 0, wpsPayout: 0, offCycleNet: 0, net: 0 }
      ),
    [filteredRows]
  );

  const wpsExportCompanies = useMemo(() => {
    const activeCompanies = companies.filter((c) => c.active);
    if (selectedCompanyId !== 'all') {
      const match = activeCompanies.filter((c) => c.id === selectedCompanyId);
      if (match.length > 0) return match;
    }
    const scopedCompanyIds = new Set(eligibleScopedEmployees.map((e) => e.primaryCompanyId));
    const filtered = activeCompanies.filter((c) => scopedCompanyIds.has(c.id));
    return filtered.length > 0 ? filtered : activeCompanies;
  }, [companies, selectedCompanyId, eligibleScopedEmployees]);

  const selectedWpsCompany = useMemo(
    () => wpsExportCompanies.find((c) => c.id === wpsCompanyId) ?? wpsExportCompanies[0] ?? null,
    [wpsExportCompanies, wpsCompanyId]
  );

  const wpsPreview = useMemo(() => {
    if (subPage !== 'wps_export' || !selectedWpsCompany) return null;
    const companyEmps = eligibleScopedEmployees.filter(
      (e) => e.active && e.primaryCompanyId === selectedWpsCompany.id
    );
    const companyRows = companyEmps.map((emp) =>
      calculateEmployeePayroll(
        emp,
        wpsMonth,
        adjustments,
        attendance,
        salaryReleases,
        payrollEntries,
        leaves,
        deductionApprovals,
        patchReleases
      )
    );
    const exportData = buildAdcbWpsExport({
      company: selectedWpsCompany,
      month: wpsMonth,
      payrollRows: companyRows,
    });
    const warnings: string[] = [];
    if (!selectedWpsCompany.molEstablishmentId) {
      warnings.push('Company MOL Establishment ID is missing (Settings → Companies).');
    }
    if (!selectedWpsCompany.wpsRoutingCode) {
      warnings.push('Company WPS Routing Code is missing (Settings → Companies).');
    }
    if (!selectedWpsCompany.companyIban) {
      warnings.push('Company IBAN is missing (Settings → Companies).');
    }
    const missingEmpFields = companyEmps.filter(
      (e) => !e.mohrePersonId || !e.bankDetails?.bankRoutingCode || !e.bankDetails?.iban
    );
    if (missingEmpFields.length > 0) {
      warnings.push(
        `${missingEmpFields.length} employee(s) missing MOHRE Person ID, Bank Routing Code, or IBAN.`
      );
    }
    return { exportData, warnings };
  }, [
    subPage,
    selectedWpsCompany,
    eligibleScopedEmployees,
    wpsMonth,
    adjustments,
    attendance,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases,
  ]);

  if (activeRole === UserRole.PRO) {
    return (
      <div className="max-w-lg mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          PRO accounts are strictly restricted from viewing salaries, payroll, or bank details.
        </p>
      </div>
    );
  }

  const openPatchReleasePage = (preselectedEmpId?: string) => {
    const initialEmpId =
      preselectedEmpId ?? targetEmployees[0]?.id ?? eligibleScopedEmployees[0]?.id ?? '';
    setPatchEmpId(initialEmpId);
    setPatchAmountStr('');
    setPatchMethod('Cash');
    setPatchDate(new Date().toISOString().slice(0, 10));
    setPatchReceiptNote('');
    setPatchAllocInputs({});
    setPatchError(null);
    setSubPage('create_patch');
  };

  const handleAutoAllocatePatch = () => {
    const targetAmt = Number(patchAmountStr);
    if (!Number.isFinite(targetAmt) || targetAmt <= 0) {
      setPatchError('Enter the release amount first, then click Auto-Allocate.');
      return;
    }
    let remaining = Math.round(targetAmt * 100) / 100;
    const nextInputs: Record<string, string> = {};
    for (const bal of patchPendingBalances) {
      if (remaining <= 0) break;
      const take = Math.min(bal.availableAED, remaining);
      if (take > 0) {
        const roundedTake = Math.round(take * 100) / 100;
        nextInputs[`${bal.month}__${bal.bucket}`] = String(roundedTake);
        remaining = Math.round((remaining - roundedTake) * 100) / 100;
      }
    }
    setPatchAllocInputs(nextInputs);
    setPatchError(null);
  };

  const handleSubmitPatchRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreatePatchRelease || !patchModalEmployee) return;
    const totalAmt = Number(patchAmountStr);
    const validation = validatePatchReleaseAllocations(totalAmt, patchDraftAllocations);
    if (!validation.valid) {
      setPatchError(validation.error ?? 'Check your split-bucket allocations.');
      return;
    }
    for (const alloc of patchDraftAllocations) {
      const bal = patchPendingBalances.find(
        (b) => b.month === alloc.month && b.bucket === alloc.bucket
      );
      if (bal && alloc.amountAED > bal.availableAED + 0.01) {
        setPatchError(
          `Allocation for ${alloc.month} (${getPatchBucketLabel(lang, alloc.bucket)}) exceeds available ${formatAED(bal.availableAED)}.`
        );
        return;
      }
    }
    setPatchSaving(true);
    try {
      await onCreatePatchRelease({
        employeeId: patchModalEmployee.id,
        companyId: patchModalEmployee.primaryCompanyId,
        releaseDate: patchDate,
        paymentMethod: patchMethod,
        totalAmountAED: Math.round(totalAmt * 100) / 100,
        allocations: patchDraftAllocations,
        referenceNote: patchReceiptNote.trim() || undefined,
        releasedBy: currentUser.fullName,
        releasedByRole: activeRole,
      });
      setSubPage('main');
    } finally {
      setPatchSaving(false);
    }
  };

  const handleOpenWpsPage = () => {
    const initialComp =
      selectedCompanyId !== 'all' ? selectedCompanyId : wpsExportCompanies[0]?.id ?? '';
    setWpsCompanyId(initialComp);
    setWpsMonth(selectedMonth);
    setSubPage('wps_export');
  };

  const handleDownloadAdcbWps = () => {
    if (!selectedWpsCompany || !wpsPreview) return;
    const worksheet = XLSX.utils.aoa_to_sheet(wpsPreview.exportData.aoaRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      `WPS_${selectedWpsCompany.code}_${wpsPreview.exportData.salaryMonthCode}`
    );
    XLSX.writeFile(
      workbook,
      `ADCB_WPS_${selectedWpsCompany.code}_${wpsPreview.exportData.salaryMonthCode}.xlsx`
    );
    setSubPage('main');
  };

  const handleExportExcel = () => {
    const records = buildPayrollExportRecords(filteredRows, companyMap, sectionMap, labelNameMap);
    const worksheet = XLSX.utils.json_to_sheet(
      records.length > 0 ? records : [{ Message: 'No payroll records for current filter' }]
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Payroll_${selectedMonth}`);
    XLSX.writeFile(workbook, `yaldi-payroll-${selectedMonth}.xlsx`);
  };

  const handleExportCSV = async () => {
    const csv = buildPayrollCSV(filteredRows, companyMap, sectionMap, labelNameMap);
    await nativeBridge.saveTextFile(
      `yaldi-payroll-${selectedMonth}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleDownloadPayslip = async (row: MonthlyPayrollRow) => {
    const releaseLine =
      row.release.status === 'Delayed' && row.release.delayedUntilDate
        ? `Status: DELAYED until ${row.release.delayedUntilDate}${row.release.delayReason ? ` (${row.release.delayReason})` : ''}`
        : `Status: ${row.release.status} | Release Date: ${row.release.releaseDate}`;

    const lines = [
      `${settings.groupName} — ${companyMap.get(row.employee.primaryCompanyId) ?? ''}`,
      `MONTHLY PAYSLIP (${row.month})`,
      `Employee: ${row.employee.fullName} (${row.employee.employeeCode})`,
      `Section: ${sectionMap.get(row.employee.sectionId) ?? ''} | ${row.employee.jobTitle}`,
      releaseLine,
      row.employee.bankDetails
        ? `Bank: ${row.employee.bankDetails.bankName} | IBAN: ${row.employee.bankDetails.iban}`
        : 'Bank: Not on file',
      '------------------------------------------------------------',
      `Base Salary (WPS Fixed): ${formatAED(row.baseSalary)}`,
      `Housing Allowance:       ${formatAED(row.housingAllowance)}`,
      `Transport Allowance:     ${formatAED(row.transportAllowance)}`,
      `Other Allowance:         ${formatAED(row.otherAllowance)}`,
      `In-Payroll Earnings:     +${formatAED(row.inPayrollEarnings)}`,
      `Off-Cycle Earnings:      +${formatAED(row.offCycleEarnings)}`,
      `In-Payroll Deductions:   -${formatAED(row.inPayrollDeductions)}`,
      `Off-Cycle Deductions:    -${formatAED(row.offCycleDeductions)}`,
      `WPS Payout (Bank):       ${formatAED(row.wpsTotalPayout)}`,
      `Off-Cycle Net Payout:    ${formatAED(row.offCycleNetPayout)}`,
      '------------------------------------------------------------',
      `TOTAL NET PAYABLE:       ${formatAED(row.netSalary)}`,
    ];
    await nativeBridge.saveTextFile(
      `Payslip_${row.employee.employeeCode}_${row.month}.txt`,
      lines.join('\n'),
      'text/plain;charset=utf-8'
    );
  };

  const openReleaseEditor = (params: {
    scopeType: 'section' | 'employee';
    scopeId: string;
    title: string;
    companyId: string | 'all';
    currentRelease: MonthlyPayrollRow['release'];
  }) => {
    setReleaseError(null);
    setReleaseDraft({
      scopeType: params.scopeType,
      scopeId: params.scopeId,
      title: params.title,
      companyId: params.companyId,
      releaseDate: params.currentRelease.releaseDate,
      status: params.currentRelease.status,
      delayedUntilDate: params.currentRelease.delayedUntilDate ?? '',
      delayReason: params.currentRelease.delayReason ?? '',
    });
    setSubPage('edit_release');
  };

  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseDraft || !canControlRelease) return;
    if (releaseDraft.status === 'Delayed' && !releaseDraft.delayedUntilDate) {
      setReleaseError('Select the new delayed release date.');
      return;
    }

    const draftTargetEmployeeIds =
      releaseDraft.scopeType === 'employee'
        ? [releaseDraft.scopeId]
        : activeEligibleEmployees
            .filter(
              (emp) =>
                emp.sectionId === releaseDraft.scopeId &&
                (releaseDraft.companyId === 'all' || emp.primaryCompanyId === releaseDraft.companyId)
            )
            .map((emp) => emp.id);

    const matchedApprovedRun = findApprovedRunForTarget({
      targetEmployeeIds: draftTargetEmployeeIds,
      companyId: releaseDraft.companyId,
    });

    if (releaseDraft.status === 'Released' && !matchedApprovedRun) {
      setReleaseError('Payroll approval is required before releasing salaries for this month/scope.');
      return;
    }

    setReleaseSaving(true);
    try {
      await onUpsertReleaseSchedule({
        month: selectedMonth,
        payPeriod: selectedMonth,
        scopeType: releaseDraft.scopeType,
        scopeId: releaseDraft.scopeId,
        companyId: releaseDraft.companyId,
        employeeIds: draftTargetEmployeeIds.length > 0 ? draftTargetEmployeeIds : undefined,
        approvalRunId: releaseDraft.status === 'Released' ? matchedApprovedRun?.id : undefined,
        releaseDate: releaseDraft.releaseDate,
        status: releaseDraft.status,
        delayedUntilDate:
          releaseDraft.status === 'Delayed' ? releaseDraft.delayedUntilDate : null,
        delayReason:
          releaseDraft.status === 'Delayed' ? releaseDraft.delayReason.trim() || null : null,
        updatedBy: currentUser.fullName,
      });
      setReleaseDraft(null);
      setSubPage('main');
    } finally {
      setReleaseSaving(false);
    }
  };

  const handleSubmitApprovalRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateApprovalRun || !canSubmitPayrollApproval) return;
    if (approvalScopeSelection.employeeIds.length === 0) {
      setApprovalError('Select at least one eligible employee for this payroll approval run.');
      return;
    }
    setApprovalError(null);
    setApprovalSubmitting(true);
    try {
      await onCreateApprovalRun({
        month: selectedMonth,
        scopeType: approvalScopeType,
        scopeId: approvalScopeSelection.scopeId,
        scopeLabel: approvalScopeSelection.scopeLabel,
        employeeIds: approvalScopeSelection.employeeIds,
        employeeCount: approvalScopeSelection.employeeIds.length,
        totalNetAED: approvalScopeSelection.totalNetAED,
        notes: approvalNotes.trim() || undefined,
      });
      setApprovalNotes('');
      setApprovalEmployeeIds([]);
    } catch (err) {
      setApprovalError(err instanceof Error ? err.message : 'Unable to submit payroll approval run.');
    } finally {
      setApprovalSubmitting(false);
    }
  };

  const handleRunApprovalAction = async (
    runId: string,
    action: 'approve' | 'reject' | 'bypass'
  ) => {
    if (!onActionApprovalRun) return;
    setApprovalActionBusyId(runId);
    setApprovalError(null);
    try {
      await onActionApprovalRun({
        id: runId,
        action,
        comment: approvalComments[runId]?.trim() || undefined,
      });
      setApprovalComments((prev) => ({ ...prev, [runId]: '' }));
    } catch (err) {
      setApprovalError(err instanceof Error ? err.message : 'Unable to update approval run.');
    } finally {
      setApprovalActionBusyId(null);
    }
  };

  const renderPayrollApprovalGate = () => {
    const approvedCount = monthApprovalRuns.filter(
      (r) => r.status === 'approved' || r.status === 'bypassed'
    ).length;
    const pendingCount = monthApprovalRuns.filter((r) => r.status === 'pending').length;
    const empSearchTerm = approvalEmpSearch.trim().toLowerCase();
    const filteredApprovalCandidates = activeEligibleEmployees.filter((emp) => {
      if (!empSearchTerm) return true;
      return `${emp.fullName} ${emp.employeeCode} ${companyMap.get(emp.primaryCompanyId) ?? ''}`
        .toLowerCase()
        .includes(empSearchTerm);
    });

    return (
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              Payroll Release Approval Gate
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Submit {monthLabel} payroll for workflow approval before releasing salaries.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-semibold">
              {approvedCount} Approved
            </span>
            <span className="px-2.5 py-1 rounded-lg bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-semibold">
              {pendingCount} Pending
            </span>
          </div>
        </div>

        {approvalError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
          >
            {approvalError}
          </p>
        )}

        {canSubmitPayrollApproval && onCreateApprovalRun && (
          <form
            onSubmit={handleSubmitApprovalRun}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/50 p-4 space-y-4"
          >
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  { id: 'all', label: 'All Employees' },
                  { id: 'company', label: 'By Company' },
                  { id: 'project', label: 'By Project' },
                  { id: 'employees', label: 'Specific Employees' },
                ] as { id: PayrollReleaseScopeType; label: string }[]
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setApprovalScopeType(opt.id);
                    setApprovalError(null);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    approvalScopeType === opt.id
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {approvalScopeType === 'company' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Target Company
                </label>
                <select
                  value={approvalCompanyId || companies[0]?.id || ''}
                  onChange={(e) => setApprovalCompanyId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {approvalScopeType === 'project' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Target Project
                </label>
                {projects.length === 0 ? (
                  <p className="text-xs text-slate-500">
                    No projects configured yet. Add projects under Settings → Projects.
                  </p>
                ) : (
                  <select
                    value={approvalProjectId || projects[0]?.id || ''}
                    onChange={(e) => setApprovalProjectId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {approvalScopeType === 'employees' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="search"
                    value={approvalEmpSearch}
                    onChange={(e) => setApprovalEmpSearch(e.target.value)}
                    placeholder="Search employees by name or code..."
                    className="w-full ps-8 pe-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredApprovalCandidates.map((emp) => {
                    const checked = approvalEmployeeIds.includes(emp.id);
                    const net = fullMonthPayrollByEmpId.get(emp.id)?.netSalary ?? 0;
                    return (
                      <label
                        key={emp.id}
                        className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() =>
                              setApprovalEmployeeIds((prev) =>
                                prev.includes(emp.id)
                                  ? prev.filter((id) => id !== emp.id)
                                  : [...prev, emp.id]
                              )
                            }
                            className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          />
                          <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                            {emp.fullName}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            {emp.employeeCode}
                          </span>
                        </span>
                        <span className="font-mono text-[11px] text-slate-600 dark:text-slate-300 shrink-0">
                          {formatAED(net)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Approval Notes (Optional)
                </label>
                <input
                  type="text"
                  value={approvalNotes}
                  onChange={(e) => setApprovalNotes(e.target.value)}
                  placeholder="e.g., WPS batch verified and ready for management sign-off"
                  className={INPUT_CLASS}
                />
              </div>
              <div className="flex flex-col sm:flex-row md:flex-col items-stretch sm:items-center md:items-end justify-between gap-2">
                <div className="text-xs text-slate-600 dark:text-slate-300 md:text-end">
                  <span className="font-semibold text-slate-900 dark:text-white">
                    {approvalScopeSelection.employeeIds.length}
                  </span>{' '}
                  employee{approvalScopeSelection.employeeIds.length === 1 ? '' : 's'} ·{' '}
                  <span className="font-mono font-bold text-teal-700 dark:text-teal-300">
                    {formatAED(approvalScopeSelection.totalNetAED)}
                  </span>
                </div>
                <button
                  type="submit"
                  disabled={approvalSubmitting || approvalScopeSelection.employeeIds.length === 0}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  Submit Payroll for Approval
                </button>
              </div>
            </div>
          </form>
        )}

        {/* Active Approval Runs for Selected Month */}
        {monthApprovalRuns.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-800 p-5 text-center text-xs text-slate-500 dark:text-slate-400">
            No payroll approval runs submitted for {monthLabel} yet. Submit a run above to unlock
            salary release.
          </div>
        ) : (
          <div className="space-y-3">
            {monthApprovalRuns.map((run) => {
              const canAct = canActOnApprovalRun(run) && Boolean(onActionApprovalRun);
              const isBusy = approvalActionBusyId === run.id;
              const statusBadgeClass =
                run.status === 'approved' || run.status === 'bypassed'
                  ? 'bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                  : run.status === 'rejected'
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                    : 'bg-amber-50 dark:bg-amber-950/60 border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300';

              return (
                <div
                  key={run.id}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                          {run.scopeLabel}
                        </span>
                        <span
                          className={`px-2 py-0.5 rounded-md border text-[11px] font-semibold capitalize ${statusBadgeClass}`}
                        >
                          {run.status === 'bypassed' ? 'Bypassed & Approved' : run.status}
                        </span>
                        {run.workflowTemplateName && (
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            · {run.workflowTemplateName}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        Submitted by {run.createdByName} on {formatShortDate(run.createdAt)}
                        {run.notes ? ` · ${run.notes}` : ''}
                      </p>
                    </div>
                    <div className="text-end shrink-0">
                      <p className="text-sm font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                        {formatAED(run.totalNetAED)}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {run.employeeCount} employee{run.employeeCount === 1 ? '' : 's'}
                      </p>
                    </div>
                  </div>

                  {/* Step-by-step approval chain */}
                  {run.steps.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {run.steps.map((step, idx) => {
                        const isActive =
                          run.status === 'pending' && idx === run.currentStepIndex;
                        const stepClass =
                          step.status === 'approved' || step.status === 'bypassed'
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300'
                            : step.status === 'rejected'
                              ? 'border-rose-200 dark:border-rose-800 bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300'
                              : isActive
                                ? 'border-teal-400 dark:border-teal-600 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                                : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400';

                        return (
                          <span
                            key={`${run.id}-step-${idx}`}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-medium ${stepClass}`}
                          >
                            <span className="font-mono text-[10px] opacity-70">{idx + 1}.</span>
                            <span>
                              {step.approverName || step.roleLabel || step.role || `Step ${idx + 1}`}
                            </span>
                            <span className="capitalize opacity-80">({step.status})</span>
                          </span>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline approver actions */}
                  {canAct && (
                    <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2">
                      <input
                        type="text"
                        value={approvalComments[run.id] ?? ''}
                        onChange={(e) =>
                          setApprovalComments((prev) => ({ ...prev, [run.id]: e.target.value }))
                        }
                        placeholder="Optional comment for audit trail..."
                        className="flex-1 px-3 py-1.5 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                      />
                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRunApprovalAction(run.id, 'approve')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleRunApprovalAction(run.id, 'reject')}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                        {canBypassApprovalRun && (
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleRunApprovalAction(run.id, 'bypass')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            Bypass &amp; Approve
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    );
  };

  const selectedPayslip: MonthlyPayrollRow | null =
    allPayrollRows.find((r) => r.employee.id === selectedPayslipEmpId) ??
    (selectedPayslipEmpId === currentUser.id ? mySalaryRow : null);

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;

  const wrapFullPage = (content: React.ReactNode) => {
    if (isCompactOverlay) {
      return (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-24">
          {content}
        </div>
      );
    }
    return content;
  };

  // =========================================================================
  // FULL-PAGE VIEW: RELEASE MONEY / PATCH (No desktop popup!)
  // =========================================================================
  if (subPage === 'create_patch' && canReleasePatch && onCreatePatchRelease) {
    return wrapFullPage(
      <div className="max-w-3xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navPatchReleases'), onClick: () => setSubPage('main') },
            { label: t(lang, 'releaseMoneyPatch') },
          ]}
          title={t(lang, 'releaseMoneyPatch')}
          subtitle="Release a partial or batch payment today and allocate it across pending unpaid balances."
          onBack={() => setSubPage('main')}
        />

        <form
          onSubmit={handleSubmitPatchRelease}
          noValidate
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          {patchError && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              {patchError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Employee *
              </label>
              <select
                value={patchEmpId}
                onChange={(e) => {
                  setPatchEmpId(e.target.value);
                  setPatchAllocInputs({});
                  setPatchError(null);
                }}
                aria-label="Patch Employee"
                className={INPUT_CLASS}
              >
                {eligibleScopedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {t(lang, 'releaseAmountToday')} *
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  placeholder="e.g., 200"
                  value={patchAmountStr}
                  onChange={(e) => {
                    setPatchAmountStr(e.target.value);
                    setPatchError(null);
                  }}
                  aria-label={t(lang, 'releaseAmountToday')}
                  className={`${INPUT_CLASS} font-mono`}
                />
                <button
                  type="button"
                  onClick={handleAutoAllocatePatch}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 text-xs font-semibold hover:bg-teal-100 dark:hover:bg-teal-900/40 cursor-pointer shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  {t(lang, 'autoAllocate')}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {t(lang, 'paymentMethod')}
              </label>
              <select
                value={patchMethod}
                onChange={(e) => setPatchMethod(e.target.value as PatchPaymentMethod)}
                aria-label={t(lang, 'paymentMethod')}
                className={INPUT_CLASS}
              >
                {(['Cash', 'Bank Transfer', 'WPS'] as PatchPaymentMethod[]).map((m) => (
                  <option key={m} value={m}>
                    {getPaymentMethodLabel(lang, m)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                {t(lang, 'releaseDate')}
              </label>
              <input
                type="date"
                value={patchDate}
                onChange={(e) => setPatchDate(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          {/* Pending Unpaid Balances & Split-Bucket Allocation */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                {t(lang, 'pendingBalances')} — {t(lang, 'splitAllocation')}
              </p>
              <div className="text-xs font-mono tabular-nums flex items-center gap-2">
                <span className="text-slate-500">
                  {t(lang, 'allocatedTotal')}:{' '}
                  <strong className="text-slate-900 dark:text-white">
                    {formatAED(patchAllocatedSum)}
                  </strong>
                </span>
                <span
                  className={
                    Math.abs(patchRemainingToAllocate) < 0.01 && patchTotalInputNum > 0
                      ? 'text-emerald-700 dark:text-emerald-400 font-semibold'
                      : 'text-amber-700 dark:text-amber-400 font-semibold'
                  }
                >
                  ({t(lang, 'remainingToAllocate')}: {formatAED(patchRemainingToAllocate)})
                </span>
              </div>
            </div>

            {patchPendingBalances.length === 0 ? (
              <p className="rounded-lg border border-slate-200 dark:border-slate-800 p-5 text-xs text-slate-500 text-center">
                No pending unpaid balances found for this employee.
              </p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                {patchPendingBalances.map((bal) => {
                  const key = `${bal.month}__${bal.bucket}`;
                  return (
                    <div
                      key={key}
                      className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap text-xs">
                          <span className="font-mono font-semibold text-slate-900 dark:text-white">
                            {bal.month}
                          </span>
                          <span className="text-slate-700 dark:text-slate-300 font-medium">
                            {getPatchBucketLabel(lang, bal.bucket)}
                          </span>
                          {bal.impactsWps && (
                            <span className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                              · Impacts WPS
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono mt-0.5">
                          Available: {formatAED(bal.availableAED)}
                          {bal.alreadyReleasedAED > 0
                            ? ` (Already released: ${formatAED(bal.alreadyReleasedAED)})`
                            : ''}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number"
                          min={0}
                          max={bal.availableAED}
                          step="0.01"
                          placeholder="0"
                          aria-label={`Allocate ${bal.month} ${bal.bucket}`}
                          value={patchAllocInputs[key] ?? ''}
                          onChange={(e) => {
                            setPatchAllocInputs((prev) => ({
                              ...prev,
                              [key]: e.target.value,
                            }));
                            setPatchError(null);
                          }}
                          className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setPatchAllocInputs((prev) => ({
                              ...prev,
                              [key]: String(bal.availableAED),
                            }))
                          }
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          Max
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Automatic WPS Offset Live Preview */}
          {patchDraftWpsOffset > 0 && (
            <div className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/70 dark:bg-teal-950/40 px-4 py-3 text-xs text-teal-900 dark:text-teal-200 flex items-start gap-2.5">
              <Landmark className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0 mt-0.5" />
              <span>
                <strong>{t(lang, 'automaticWpsOffset')}:</strong>{' '}
                <span className="font-mono font-bold">-{formatAED(patchDraftWpsOffset)}</span> will
                be automatically subtracted from month-end WPS Variable Income (Fixed Basic Salary
                stays intact).
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {t(lang, 'receiptNote')}
            </label>
            <input
              type="text"
              value={patchReceiptNote}
              onChange={(e) => setPatchReceiptNote(e.target.value)}
              placeholder="e.g., Cash voucher #1042 or Bank Transfer Ref"
              className={INPUT_CLASS}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPage('main')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={patchSaving}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {t(lang, 'confirmPatchRelease')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // FULL-PAGE VIEW: MULTI-COMPANY ADCB WPS EXPORT
  // =========================================================================
  if (subPage === 'wps_export' && canExportExcel) {
    return wrapFullPage(
      <div className="max-w-2xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navPayrollOverview'), onClick: () => setSubPage('main') },
            { label: t(lang, 'exportAdcbWps') },
          ]}
          title={t(lang, 'adcbWpsTitle')}
          subtitle={t(lang, 'adcbWpsSubtitle')}
          onBack={() => setSubPage('main')}
        />

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Company (1 WPS file per entity)
              </label>
              <select
                value={selectedWpsCompany?.id ?? ''}
                onChange={(e) => setWpsCompanyId(e.target.value)}
                aria-label="WPS Company"
                className={INPUT_CLASS}
              >
                {wpsExportCompanies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Salary Month
              </label>
              <input
                type="month"
                value={wpsMonth}
                onChange={(e) => setWpsMonth(e.target.value)}
                aria-label="WPS Salary Month"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
          </div>

          {selectedWpsCompany && wpsPreview && (
            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 dark:text-slate-300 font-medium inline-flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-teal-600" />
                    {selectedWpsCompany.name}
                  </span>
                  <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">
                    SCR · {wpsPreview.exportData.salaryMonthCode}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2.5 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-[11px] text-slate-500 block">EDR Employee Rows</span>
                    <span className="text-base font-bold font-mono text-slate-900 dark:text-white">
                      {wpsPreview.exportData.scrRow.totalEdrCount}
                    </span>
                  </div>
                  <div>
                    <span className="text-[11px] text-slate-500 block">Total WPS Payout (AED)</span>
                    <span className="text-base font-bold font-mono text-teal-700 dark:text-teal-300">
                      {formatAED(wpsPreview.exportData.scrRow.totalPayoutAed)}
                    </span>
                  </div>
                </div>
                <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                  <p>MOL ID: {selectedWpsCompany.molEstablishmentId || 'MISSING'}</p>
                  <p>Routing: {selectedWpsCompany.wpsRoutingCode || 'MISSING'}</p>
                  <p className="break-all">IBAN: {selectedWpsCompany.companyIban || 'MISSING'}</p>
                </div>
              </div>

              {wpsPreview.exportData.totalEarlyWpsOffsetAed > 0 && (
                <div className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/60 dark:bg-teal-950/40 p-3 text-teal-900 dark:text-teal-200 flex items-start gap-2">
                  <Banknote className="w-4 h-4 shrink-0 mt-0.5 text-teal-600" />
                  <span>
                    <strong>{t(lang, 'automaticWpsOffset')}:</strong>{' '}
                    <span className="font-mono font-bold">
                      -{formatAED(wpsPreview.exportData.totalEarlyWpsOffsetAed)}
                    </span>{' '}
                    from early patch releases automatically subtracted from Variable Income (Fixed
                    Basic Salary stays intact).
                  </span>
                </div>
              )}

              {wpsPreview.warnings.length > 0 ? (
                <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 p-3 space-y-1 text-amber-900 dark:text-amber-200">
                  <p className="font-semibold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Pre-Flight Check Warnings
                  </p>
                  {wpsPreview.warnings.map((w) => (
                    <p key={w} className="text-[11px]">
                      • {w}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 shrink-0" />
                  <span>
                    All ADCB WPS fields verified (EDR rows + SCR footer, Off-Cycle excluded, Basic
                    Salary intact).
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPage('main')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="button"
              disabled={!selectedWpsCompany || !wpsPreview || wpsPreview.exportData.edrRows.length === 0}
              onClick={handleDownloadAdcbWps}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5" />
              {t(lang, 'exportAdcbWps')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // FULL-PAGE VIEW: EDIT RELEASE SCHEDULE
  // =========================================================================
  if (subPage === 'edit_release' && releaseDraft && canControlRelease) {
    const draftTargetEmployeeIds =
      releaseDraft.scopeType === 'employee'
        ? [releaseDraft.scopeId]
        : activeEligibleEmployees
            .filter(
              (emp) =>
                emp.sectionId === releaseDraft.scopeId &&
                (releaseDraft.companyId === 'all' || emp.primaryCompanyId === releaseDraft.companyId)
            )
            .map((emp) => emp.id);
    const matchedApprovedRun = findApprovedRunForTarget({
      targetEmployeeIds: draftTargetEmployeeIds,
      companyId: releaseDraft.companyId,
    });
    const isReleaseUnlocked = Boolean(matchedApprovedRun);

    return wrapFullPage(
      <div className="max-w-xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navReleaseSchedules'), onClick: () => setSubPage('main') },
            { label: releaseDraft.title },
          ]}
          title={`${t(lang, 'scheduleRelease')} — ${releaseDraft.title}`}
          subtitle={monthLabel}
          onBack={() => {
            setReleaseDraft(null);
            setSubPage('main');
          }}
        />

        <form
          onSubmit={handleSaveRelease}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          {releaseError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {releaseError}
            </p>
          )}

          {!isReleaseUnlocked && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
              <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <span>
                Payroll approval is required before releasing salaries for this month/scope.
              </span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Release Status
            </label>
            <div className="grid grid-cols-2 gap-2">
              {RELEASE_STATUSES.map((st) => {
                const blocked = st === 'Released' && !isReleaseUnlocked;
                return (
                  <button
                    key={st}
                    type="button"
                    disabled={blocked}
                    onClick={() => {
                      setReleaseError(null);
                      setReleaseDraft((p) => (p ? { ...p, status: st } : null));
                    }}
                    className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors inline-flex items-center justify-center gap-1.5 ${
                      blocked
                        ? 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-400 cursor-not-allowed opacity-60'
                        : releaseDraft.status === st
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 cursor-pointer'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 cursor-pointer'
                    }`}
                  >
                    {blocked && <Lock className="w-3 h-3" />}
                    {getSalaryStatusLabel(lang, st)}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Scheduled Release Date
            </label>
            <input
              type="date"
              required
              value={releaseDraft.releaseDate}
              onChange={(e) =>
                setReleaseDraft((p) => (p ? { ...p, releaseDate: e.target.value } : null))
              }
              className={INPUT_CLASS}
            />
          </div>

          {releaseDraft.status === 'Delayed' && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                  Delayed Until Date *
                </label>
                <input
                  type="date"
                  required
                  value={releaseDraft.delayedUntilDate}
                  onChange={(e) =>
                    setReleaseDraft((p) =>
                      p ? { ...p, delayedUntilDate: e.target.value } : null
                    )
                  }
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                  Delay Reason (visible to employee)
                </label>
                <input
                  type="text"
                  placeholder="e.g., Bank WPS batch verification pending"
                  value={releaseDraft.delayReason}
                  onChange={(e) =>
                    setReleaseDraft((p) => (p ? { ...p, delayReason: e.target.value } : null))
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>
          )}

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setReleaseDraft(null);
                setSubPage('main');
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={releaseSaving}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // FULL-PAGE VIEW: ITEMIZED PAYSLIP DETAIL
  // =========================================================================
  if (subPage === 'payslip' && selectedPayslip) {
    if (hidePayslips) {
      return (
        <div className="max-w-xl mx-auto space-y-5">
          <PageBreadcrumbHeader
            lang={lang}
            crumbs={[
              { label: t(lang, 'navGroupPayroll') },
              { label: t(lang, 'navPayrollOverview'), onClick: () => setSubPage('main') },
            ]}
            title={t(lang, 'restrictedByPolicyTitle')}
            onBack={() => setSubPage('main')}
          />
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
            <EyeOff className="w-7 h-7 text-slate-400 mx-auto" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(lang, 'restrictedByPolicyTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'restrictedByPolicyDesc')}
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navPayrollOverview'), onClick: () => setSubPage('main') },
            { label: selectedPayslip.employee.fullName },
          ]}
          title={`Payslip — ${selectedPayslip.employee.fullName}`}
          subtitle={`${monthLabel} · ${selectedPayslip.employee.employeeCode} · ${
            companyMap.get(selectedPayslip.employee.primaryCompanyId) ?? ''
          }`}
          onBack={() => setSubPage('main')}
          actions={
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleDownloadPayslip(selectedPayslip)}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                {t(lang, 'download')}
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Print
              </button>
            </div>
          }
        />

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
          {/* Top Net Summary */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
            <div>
              <p className="text-xs text-slate-500">Total Net Payable</p>
              <p className="mt-1 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatAED(selectedPayslip.netSalary)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">WPS Bank Payout</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                {formatAED(selectedPayslip.wpsTotalPayout)}
              </p>
            </div>
            <div>
              <p className="text-xs text-slate-500">Off-Cycle Net</p>
              <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                {formatAED(selectedPayslip.offCycleNetPayout)}
              </p>
            </div>
          </div>

          {/* Earnings Breakdown */}
          {!hideSalaryBreakdown && (
          <div className="space-y-2.5 text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-white">Earnings (AED)</h3>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Basic Salary (WPS Fixed)</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.baseSalary)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Housing Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.housingAllowance)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Transport Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.transportAllowance)}
                </span>
              </div>
              <div className="py-2 flex justify-between">
                <span className="text-slate-500">Other Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.otherAllowance)}
                </span>
              </div>
              {selectedPayslip.inPayrollEarningEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="py-2 flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400"
                >
                  <div>
                    <span className="font-semibold">
                      {entry.categoryName} · {t(lang, 'typeEarningInPayroll')}
                    </span>
                    {entry.reason && <p className="text-[11px] opacity-80">{entry.reason}</p>}
                  </div>
                  <span className="font-mono shrink-0">+{formatAED(entry.amountAED)}</span>
                </div>
              ))}
              {selectedPayslip.offCycleEarningEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="py-2 flex items-start justify-between gap-2 text-teal-700 dark:text-teal-400"
                >
                  <div>
                    <span className="font-semibold">
                      {entry.categoryName} · {t(lang, 'typeEarningOffCycle')}
                    </span>
                    {entry.reason && <p className="text-[11px] opacity-80">{entry.reason}</p>}
                  </div>
                  <span className="font-mono shrink-0">+{formatAED(entry.amountAED)}</span>
                </div>
              ))}
              {selectedPayslip.bonuses.map((b) => (
                <div
                  key={b.id}
                  className="py-2 flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400"
                >
                  <div>
                    <span className="font-semibold">{b.category}</span>
                    <p className="text-[11px] opacity-80">{b.reason}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono">+{formatAED(b.amountAED)}</span>
                    {canManageAdjustments && (
                      <button
                        type="button"
                        onClick={() => void onRemoveAdjustment(b.id)}
                        aria-label="Remove bonus"
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          )}

          {/* Deductions Breakdown */}
          {!hideDeductions && (
          <div className="space-y-2.5 text-xs">
            <h3 className="font-semibold text-slate-900 dark:text-white">Deductions (AED)</h3>
            {selectedPayslip.deductions.length === 0 &&
            selectedPayslip.inPayrollDeductionEntries.length === 0 &&
            selectedPayslip.offCycleDeductionEntries.length === 0 &&
            selectedPayslip.approvedDeductionRequests.length === 0 ? (
              <p className="text-slate-500">No deductions for this month.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {selectedPayslip.approvedDeductionRequests.map((wf) => (
                  <div key={wf.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-rose-700 dark:text-rose-400">
                        {getDeductionTriggerLabel(lang, wf.triggerType)} · HR Approved
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {t(lang, 'deductFromBucket')}: {getDeductionBucketLabel(lang, wf.targetBucket)}
                        {wf.reason ? ` · ${wf.reason}` : ''}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-rose-700 dark:text-rose-400 shrink-0">
                      -{formatAED(wf.amountAED)}
                    </span>
                  </div>
                ))}
                {[
                  ...selectedPayslip.inPayrollDeductionEntries,
                  ...selectedPayslip.offCycleDeductionEntries,
                ].map((d) => (
                  <div key={d.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-rose-700 dark:text-rose-400">
                        {d.categoryName} ·{' '}
                        {d.type === 'deduction_off_cycle' ? 'Off Cycle' : 'In Payroll'}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {d.targetBucket ? getDeductionBucketLabel(lang, d.targetBucket) : ''}
                        {d.reason ? ` · ${d.reason}` : ''}
                      </p>
                    </div>
                    <span className="font-mono font-semibold text-rose-700 dark:text-rose-400 shrink-0">
                      -{formatAED(d.amountAED)}
                    </span>
                  </div>
                ))}
                {selectedPayslip.deductions.map((d) => (
                  <div key={d.id} className="py-2.5 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-rose-700 dark:text-rose-400">
                        {d.category} · {formatShortDate(d.date)}
                      </p>
                      <p className="text-[11px] text-slate-500">{d.reason}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                        -{formatAED(d.amountAED)}
                      </span>
                      {canManageAdjustments && d.source !== 'auto_lateness' && (
                        <button
                          type="button"
                          onClick={() => void onRemoveAdjustment(d.id)}
                          aria-label="Remove deduction"
                          className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          )}

          {/* Early Patch Releases Applied */}
          {selectedPayslip.earlyWpsReleasedAED + selectedPayslip.earlyOffCycleReleasedAED > 0 && (
            <div className="rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/30 p-4 space-y-1.5 text-xs">
              <div className="flex justify-between font-semibold text-teal-900 dark:text-teal-200">
                <span>{t(lang, 'earlyPatchReleases')}</span>
                <span className="font-mono">
                  -
                  {formatAED(
                    selectedPayslip.earlyWpsReleasedAED + selectedPayslip.earlyOffCycleReleasedAED
                  )}
                </span>
              </div>
              {selectedPayslip.earlyWpsReleasedAED > 0 && (
                <p className="text-[11px] text-teal-700 dark:text-teal-300">
                  Automatic WPS Offset: -{formatAED(selectedPayslip.earlyWpsReleasedAED)} from
                  Variable Income (Basic Salary intact).
                </p>
              )}
              <div className="pt-2 border-t border-teal-200/70 dark:border-teal-800 flex justify-between font-bold text-slate-900 dark:text-white">
                <span>{t(lang, 'remainingNetPayable')}</span>
                <span className="font-mono">{formatAED(selectedPayslip.remainingNetPayable)}</span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // SECTION 2: PATCH MONEY RELEASES
  // =========================================================================
  if (section === 'patch_releases' && canReleasePatch) {
    const totalReleasedSum = scopedPatchReleases.reduce((s, r) => s + r.totalAmountAED, 0);
    const totalWpsOffsets = scopedPatchReleases.reduce(
      (s, r) =>
        s +
        r.allocations
          .filter(
            (a) =>
              a.bucket === 'upcoming_main_salary' || a.bucket === 'upcoming_additional_in_payroll'
          )
          .reduce((aSum, a) => aSum + a.amountAED, 0),
      0
    );

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t(lang, 'navPatchReleases')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Partial or batch payments allocated across unpaid balances with automatic WPS offset.
            </p>
          </div>
          {onCreatePatchRelease && (
            <button
              type="button"
              onClick={() => openPatchReleasePage()}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Banknote className="w-4 h-4" />
              {t(lang, 'releaseMoneyPatch')}
            </button>
          )}
        </div>

        {/* 3 Focused KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Patch Releases</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {scopedPatchReleases.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Total Disbursed
            </p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {formatAED(totalReleasedSum)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Auto WPS Offsets
            </p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
              -{formatAED(totalWpsOffsets)}
            </p>
          </div>
        </section>

        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={patchSearch}
            onChange={(e) => setPatchSearch(e.target.value)}
            placeholder={t(lang, 'search')}
            aria-label="Search patch releases"
            className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
          />
        </div>

        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {scopedPatchReleases.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'noPatchReleases')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">Employee</th>
                    <th className="py-3 px-4 text-start">Allocations</th>
                    <th className="py-3 px-4 text-start">Method &amp; Date</th>
                    <th className="py-3 px-4 text-end">Amount</th>
                    <th className="py-3 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {scopedPatchReleases.map((rel) => {
                    const emp = employeeMap.get(rel.employeeId);
                    const compName = companyMap.get(rel.companyId) ?? '';
                    const wpsOffset = rel.allocations
                      .filter(
                        (a) =>
                          a.bucket === 'upcoming_main_salary' ||
                          a.bucket === 'upcoming_additional_in_payroll'
                      )
                      .reduce((s, a) => s + a.amountAED, 0);

                    return (
                      <tr
                        key={rel.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar
                              src={emp?.avatarUrl}
                              name={emp?.fullName ?? 'Employee'}
                              size="sm"
                            />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {emp?.fullName ?? rel.employeeId}
                              </p>
                              <p className="text-[11px] text-slate-400">
                                {emp?.employeeCode} · {compName}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="space-y-0.5 text-slate-700 dark:text-slate-300">
                            {rel.allocations.map((al, idx) => (
                              <p key={`${rel.id}-${al.month}-${al.bucket}-${idx}`} className="font-mono text-[11px]">
                                {al.month} · {getPatchBucketLabel(lang, al.bucket)}:{' '}
                                <strong>{formatAED(al.amountAED)}</strong>
                              </p>
                            ))}
                            {wpsOffset > 0 && (
                              <p className="text-[11px] font-medium text-teal-700 dark:text-teal-300">
                                WPS Offset: -{formatAED(wpsOffset)}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-800 dark:text-slate-200">
                            {getPaymentMethodLabel(lang, rel.paymentMethod)}
                          </p>
                          <p className="text-[11px] font-mono text-slate-400 mt-0.5">
                            {formatShortDate(rel.releaseDate)}
                            {rel.referenceNote ? ` · ${rel.referenceNote}` : ''}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 text-end font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                          {formatAED(rel.totalAmountAED)}
                        </td>
                        <td className="py-3.5 px-4 text-end">
                          {onDeletePatchRelease && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePatch(rel)}
                              aria-label="Delete patch release"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <ConfirmDialog
          open={Boolean(confirmDeletePatch)}
          lang={lang}
          title={t(lang, 'confirmDeleteTitle')}
          message="Remove this patch money release? Any automatic WPS offset from this release will be reversed."
          confirmLabel={t(lang, 'delete')}
          destructive
          onCancel={() => setConfirmDeletePatch(null)}
          onConfirm={async () => {
            if (confirmDeletePatch && onDeletePatchRelease) {
              await onDeletePatchRelease(confirmDeletePatch.id);
            }
            setConfirmDeletePatch(null);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // SECTION 3: RELEASE SCHEDULES
  // =========================================================================
  if (section === 'release_schedules' && !isEmployeeOnly) {
    const releasedCount = allPayrollRows.filter((r) => r.release.status === 'Released').length;
    const delayedCount = allPayrollRows.filter((r) => r.release.status === 'Delayed').length;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t(lang, 'navReleaseSchedules')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Manage monthly salary release dates, processing status, and employee delay notices.
            </p>
          </div>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Payroll month"
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        {/* 3 Focused KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Sections</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {sectionGroups.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Released Staff</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
              {releasedCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Delayed Staff</p>
            <p className="mt-2 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {delayedCount}
            </p>
          </div>
        </section>

        {/* Payroll Approval Gate */}
        {renderPayrollApprovalGate()}

        {/* Scoped Salary Release (Company / Project / Specific Employees) */}
        {canControlRelease && (() => {
          const targetCompId = scopedReleaseCompanyId || companies[0]?.id || '';
          const targetProjId = scopedReleaseProjectId || projects[0]?.id || '';
          const targetEmps =
            scopedReleaseMode === 'company'
              ? activeEligibleEmployees.filter((e) => e.primaryCompanyId === targetCompId)
              : scopedReleaseMode === 'project'
                ? activeEligibleEmployees.filter((e) => (e.projectIds ?? []).includes(targetProjId))
                : activeEligibleEmployees.filter((e) => scopedReleaseEmployeeIds.includes(e.id));
          const targetEmpIds = targetEmps.map((e) => e.id);
          const matchedScopedRun = findApprovedRunForTarget({
            targetEmployeeIds: targetEmpIds,
            companyId: scopedReleaseMode === 'company' ? targetCompId : undefined,
            projectId: scopedReleaseMode === 'project' ? targetProjId : undefined,
          });
          const isScopedReleaseLocked = scopedReleaseStatus === 'Released' && !matchedScopedRun;
          const scopedEmpFilter = scopedReleaseEmpSearch.trim().toLowerCase();
          const scopedEmpCandidates = activeEligibleEmployees.filter((emp) => {
            if (!scopedEmpFilter) return true;
            return `${emp.fullName} ${emp.employeeCode}`.toLowerCase().includes(scopedEmpFilter);
          });

          const handleApplyScopedRelease = async (e: React.FormEvent) => {
            e.preventDefault();
            if (targetEmpIds.length === 0) {
              setScopedReleaseError('No eligible employees matched the selected scope.');
              return;
            }
            if (scopedReleaseStatus === 'Released' && !matchedScopedRun) {
              setScopedReleaseError(
                'Payroll approval is required before releasing salaries for this month/scope.'
              );
              return;
            }
            setScopedReleaseError(null);
            setScopedReleaseSaving(true);
            try {
              for (const emp of targetEmps) {
                await onUpsertReleaseSchedule({
                  month: selectedMonth,
                  payPeriod: selectedMonth,
                  scopeType: 'employee',
                  scopeId: emp.id,
                  companyId:
                    scopedReleaseMode === 'company' ? targetCompId : emp.primaryCompanyId,
                  projectId: scopedReleaseMode === 'project' ? targetProjId : undefined,
                  employeeIds: targetEmpIds,
                  approvalRunId:
                    scopedReleaseStatus === 'Released' ? matchedScopedRun?.id : undefined,
                  releaseDate: scopedReleaseDate,
                  status: scopedReleaseStatus,
                  delayedUntilDate: null,
                  delayReason: null,
                  updatedBy: currentUser.fullName,
                });
              }
              if (scopedReleaseMode === 'employees') {
                setScopedReleaseEmployeeIds([]);
              }
            } finally {
              setScopedReleaseSaving(false);
            }
          };

          return (
            <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <FolderKanban className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                  Scoped Salary Release
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Update salary release status in bulk by Company, Project, or Specific Employees.
                </p>
              </div>

              {scopedReleaseError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {scopedReleaseError}
                </p>
              )}

              {isScopedReleaseLocked && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-3.5 py-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2">
                  <Lock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                  <span>
                    Payroll approval is required before releasing salaries for this month/scope.
                  </span>
                </div>
              )}

              <form onSubmit={handleApplyScopedRelease} className="space-y-4">
                <div className="flex flex-wrap items-center gap-2">
                  {(
                    [
                      { id: 'company', label: 'By Company', icon: Building2 },
                      { id: 'project', label: 'By Project', icon: FolderKanban },
                      { id: 'employees', label: 'Specific Employees', icon: Users },
                    ] as const
                  ).map((modeOpt) => {
                    const ModeIcon = modeOpt.icon;
                    return (
                      <button
                        key={modeOpt.id}
                        type="button"
                        onClick={() => {
                          setScopedReleaseMode(modeOpt.id);
                          setScopedReleaseError(null);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                          scopedReleaseMode === modeOpt.id
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <ModeIcon className="w-3.5 h-3.5" />
                        {modeOpt.label}
                      </button>
                    );
                  })}
                </div>

                {scopedReleaseMode === 'company' && (
                  <select
                    value={targetCompId}
                    onChange={(e) => setScopedReleaseCompanyId(e.target.value)}
                    aria-label="Release Company"
                    className={INPUT_CLASS}
                  >
                    {companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} ({c.code})
                      </option>
                    ))}
                  </select>
                )}

                {scopedReleaseMode === 'project' &&
                  (projects.length === 0 ? (
                    <p className="text-xs text-slate-500">
                      No projects available. Create projects under Settings → Projects.
                    </p>
                  ) : (
                    <select
                      value={targetProjId}
                      onChange={(e) => setScopedReleaseProjectId(e.target.value)}
                      aria-label="Release Project"
                      className={INPUT_CLASS}
                    >
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  ))}

                {scopedReleaseMode === 'employees' && (
                  <div className="space-y-2">
                    <input
                      type="search"
                      value={scopedReleaseEmpSearch}
                      onChange={(e) => setScopedReleaseEmpSearch(e.target.value)}
                      placeholder="Filter employees by name or code..."
                      className={INPUT_CLASS}
                    />
                    <div className="max-h-36 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                      {scopedEmpCandidates.map((emp) => (
                        <label
                          key={emp.id}
                          className="flex items-center justify-between gap-2 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40"
                        >
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={scopedReleaseEmployeeIds.includes(emp.id)}
                              onChange={() =>
                                setScopedReleaseEmployeeIds((prev) =>
                                  prev.includes(emp.id)
                                    ? prev.filter((id) => id !== emp.id)
                                    : [...prev, emp.id]
                                )
                              }
                              className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                            />
                            <span className="font-medium text-slate-800 dark:text-slate-200">
                              {emp.fullName}
                            </span>
                            <span className="font-mono text-[11px] text-slate-400">
                              {emp.employeeCode}
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Release Status
                    </label>
                    <select
                      value={scopedReleaseStatus}
                      onChange={(e) => {
                        setScopedReleaseStatus(e.target.value as SalaryReleaseStatus);
                        setScopedReleaseError(null);
                      }}
                      className={INPUT_CLASS}
                    >
                      {RELEASE_STATUSES.map((st) => (
                        <option key={st} value={st}>
                          {getSalaryStatusLabel(lang, st)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Release Date
                    </label>
                    <input
                      type="date"
                      value={scopedReleaseDate}
                      onChange={(e) => setScopedReleaseDate(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      scopedReleaseSaving || targetEmpIds.length === 0 || isScopedReleaseLocked
                    }
                    className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isScopedReleaseLocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <CalendarClock className="w-3.5 h-3.5" />
                    )}
                    Apply to {targetEmpIds.length} Employee{targetEmpIds.length === 1 ? '' : 's'}
                  </button>
                </div>
              </form>
            </section>
          );
        })()}

        {/* Section-Level Release Schedules Table */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {sectionGroups.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500">{t(lang, 'noRecords')}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">Section</th>
                    <th className="py-3 px-4 text-start">Staff</th>
                    <th className="py-3 px-4 text-start">Release Date</th>
                    <th className="py-3 px-4 text-start">Status</th>
                    <th className="py-3 px-4 text-end">Net Subtotal</th>
                    {canControlRelease && <th className="py-3 px-4 text-end">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {sectionGroups.map((grp) => {
                    const rel = grp.primaryRelease;
                    return (
                      <tr
                        key={grp.sectionId}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-4 font-semibold text-slate-900 dark:text-white">
                          {grp.sectionName}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-600 dark:text-slate-400">
                          {grp.rows.length}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {rel
                            ? formatShortDate(
                                rel.status === 'Delayed' && rel.delayedUntilDate
                                  ? rel.delayedUntilDate
                                  : rel.releaseDate
                              )
                            : '—'}
                        </td>
                        <td className="py-3.5 px-4">
                          {rel && (
                            <span
                              className={`inline-flex items-center gap-1.5 font-medium ${getStatusTextClass(
                                rel.status
                              )}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${getStatusDotClass(rel.status)}`} />
                              {getSalaryStatusLabel(lang, rel.status)}
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-end font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                          {formatAED(grp.netSubtotal)}
                        </td>
                        {canControlRelease && (
                          <td className="py-3.5 px-4 text-end">
                            {rel && (
                              <button
                                type="button"
                                onClick={() =>
                                  openReleaseEditor({
                                    scopeType: 'section',
                                    scopeId: grp.sectionId,
                                    title: `${grp.sectionName} Section`,
                                    companyId: selectedCompanyId,
                                    currentRelease: rel,
                                  })
                                }
                                className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/40 cursor-pointer"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                                {t(lang, 'scheduleRelease')}
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    );
  }

  // =========================================================================
  // EMPLOYEE MY SALARY VIEW
  // =========================================================================
  if ((isEmployeeOnly || showMySalaryOnly) && mySalaryRow) {
    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t(lang, 'navMySalary')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {monthLabel} · {companyMap.get(currentUser.primaryCompanyId)}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {!isEmployeeOnly && (
              <button
                type="button"
                onClick={() => setShowMySalaryOnly(false)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                {t(lang, 'navPayrollOverview')}
              </button>
            )}
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Payroll month"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {hideSalaryBreakdown && hidePayslips ? (
          <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
            <EyeOff className="w-7 h-7 text-slate-400 mx-auto" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(lang, 'restrictedByPolicyTitle')}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(lang, 'restrictedByPolicyDesc')}
            </p>
          </section>
        ) : (
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <span
                className={`inline-flex items-center gap-1.5 text-xs font-semibold ${getStatusTextClass(
                  mySalaryRow.release.status
                )}`}
              >
                <span className={`w-2 h-2 rounded-full ${getStatusDotClass(mySalaryRow.release.status)}`} />
                {getSalaryStatusLabel(lang, mySalaryRow.release.status)}
              </span>
              {!hideSalaryBreakdown && (
                <p className="mt-2 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatAED(mySalaryRow.netSalary)}
                </p>
              )}
              <p className="text-xs text-slate-500 mt-1">
                Release Date:{' '}
                {formatShortDate(
                  mySalaryRow.release.status === 'Delayed' && mySalaryRow.release.delayedUntilDate
                    ? mySalaryRow.release.delayedUntilDate
                    : mySalaryRow.release.releaseDate
                )}
              </p>
            </div>
            {!hidePayslips && (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadPayslip(mySalaryRow)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t(lang, 'download')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPayslipEmpId(currentUser.id);
                    setSubPage('payslip');
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Full Payslip
                </button>
              </div>
            )}
          </div>

          {mySalaryRow.release.status === 'Delayed' && mySalaryRow.release.delayReason && (
            <div className="rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 text-xs text-amber-900 dark:text-amber-200">
              <strong>Delay Notice:</strong> {mySalaryRow.release.delayReason}
            </div>
          )}

          {!hideSalaryBreakdown && (
            <dl className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs">
              <div>
                <dt className="text-slate-500">Basic Salary</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white">
                  {formatAED(mySalaryRow.baseSalary)}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">Allowances</dt>
                <dd className="mt-1 font-mono font-semibold text-slate-900 dark:text-white">
                  {formatAED(
                    mySalaryRow.housingAllowance +
                      mySalaryRow.transportAllowance +
                      mySalaryRow.otherAllowance
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">WPS Bank Payout</dt>
                <dd className="mt-1 font-mono font-semibold text-teal-700 dark:text-teal-300">
                  {formatAED(mySalaryRow.wpsTotalPayout)}
                </dd>
              </div>
            </dl>
          )}
        </section>
        )}
      </div>
    );
  }

  // =========================================================================
  // SECTION 1: PAYROLL OVERVIEW & WPS EXPORT (Clean Modern Table + 4 KPIs)
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Strictly Payroll-Scoped Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t(lang, 'navPayrollOverview')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {monthLabel} · {filteredRows.length} eligible employee{filteredRows.length === 1 ? '' : 's'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canSeeMySalary && (
            <button
              type="button"
              onClick={() => setShowMySalaryOnly(true)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t(lang, 'navMySalary')}
            </button>
          )}
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Payroll month"
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {canExportExcel && (
            <>
              <button
                type="button"
                onClick={handleOpenWpsPage}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5" />
                {t(lang, 'exportAdcbWps')}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                {t(lang, 'exportExcel')}
              </button>
              <button
                type="button"
                onClick={() => void handleExportCSV()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      {isAccounting && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 px-4 py-3 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2.5">
          <Landmark className="w-4 h-4 text-teal-600 shrink-0" />
          <span>
            Accounting Access: viewing salaries and bank account details exclusively for your
            attached companies.
          </span>
        </div>
      )}

      {/* Focused Payroll KPI Cards */}
      {!hideSalaryBreakdown && (
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Total Net Payable</span>
            <Wallet className="w-4 h-4 text-teal-600" />
          </div>
          <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
            {formatAED(totals.net)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>WPS Bank Payout</span>
            <Landmark className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400 truncate">
            {formatAED(totals.wpsPayout)}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
            <span>Off-Cycle Payout</span>
            <Banknote className="w-4 h-4 text-slate-400" />
          </div>
          <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white truncate">
            {formatAED(totals.offCycleNet)}
          </p>
        </div>
        {!hideDeductions && (
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Total Deductions</span>
              <Clock className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400 truncate">
              -{formatAED(totals.deductions)}
            </p>
          </div>
        )}
      </section>
      )}

      {/* Payroll Release Approval Gate */}
      {renderPayrollApprovalGate()}

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          aria-label="Filter by section"
          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">All Sections</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | SalaryReleaseStatus)}
          aria-label="Filter by release status"
          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">All Release Statuses</option>
          {RELEASE_STATUSES.map((st) => (
            <option key={st} value={st}>
              {getSalaryStatusLabel(lang, st)}
            </option>
          ))}
        </select>

        <select
          value={labelFilter}
          onChange={(e) => setLabelFilter(e.target.value)}
          aria-label="Filter by status label"
          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">{t(lang, 'allLabels')}</option>
          {labels.map((lbl) => (
            <option key={lbl.id} value={lbl.id}>
              {lbl.name}
            </option>
          ))}
        </select>
      </div>

      {/* Scannable Payroll Table */}
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 text-start">Employee</th>
                  {!hideSalaryBreakdown && <th className="py-3 px-4 text-end">Main Salary</th>}
                  {!hideSalaryBreakdown && <th className="py-3 px-4 text-end">WPS Payout</th>}
                  {!hideSalaryBreakdown && <th className="py-3 px-4 text-end">Off-Cycle</th>}
                  {!hideSalaryBreakdown && <th className="py-3 px-4 text-end">Net Payable</th>}
                  <th className="py-3 px-4 text-start">Release</th>
                  <th className="py-3 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredRows.map((row) => (
                  <tr
                    key={row.employee.id}
                    onClick={() => {
                      if (hidePayslips) return;
                      setSelectedPayslipEmpId(row.employee.id);
                      setSubPage('payslip');
                    }}
                    className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors ${
                      hidePayslips ? '' : 'cursor-pointer'
                    }`}
                  >
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <Avatar
                          src={row.employee.avatarUrl}
                          name={row.employee.fullName}
                          size="sm"
                        />
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {row.employee.fullName}
                          </p>
                          <p className="text-[11px] text-slate-400 truncate">
                            <span className="font-mono">{row.employee.employeeCode}</span> ·{' '}
                            {sectionMap.get(row.employee.sectionId) ?? ''}
                          </p>
                        </div>
                      </div>
                    </td>

                    {!hideSalaryBreakdown && (
                      <td className="py-3.5 px-4 text-end font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        {formatAED(row.grossSalary)}
                      </td>
                    )}

                    {!hideSalaryBreakdown && (
                      <td className="py-3.5 px-4 text-end font-mono tabular-nums text-teal-700 dark:text-teal-300 font-medium">
                        {formatAED(row.wpsTotalPayout)}
                        {row.earlyWpsReleasedAED > 0 && (
                          <span className="block text-[10px] text-slate-400">
                            Offset -{formatAED(row.earlyWpsReleasedAED)}
                          </span>
                        )}
                      </td>
                    )}

                    {!hideSalaryBreakdown && (
                      <td className="py-3.5 px-4 text-end font-mono tabular-nums text-slate-600 dark:text-slate-400">
                        {row.offCycleNetPayout > 0 ? formatAED(row.offCycleNetPayout) : '—'}
                      </td>
                    )}

                    {!hideSalaryBreakdown && (
                      <td className="py-3.5 px-4 text-end font-mono tabular-nums font-bold text-slate-900 dark:text-white">
                        {formatAED(row.netSalary)}
                        {!hideDeductions && row.totalDeductions > 0 && (
                          <span className="block text-[10px] font-normal text-rose-600 dark:text-rose-400">
                            -{formatAED(row.totalDeductions)}
                          </span>
                        )}
                      </td>
                    )}

                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-flex items-center gap-1.5 font-medium ${getStatusTextClass(
                          row.release.status
                        )}`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${getStatusDotClass(
                            row.release.status
                          )}`}
                        />
                        {getSalaryStatusLabel(lang, row.release.status)}
                      </span>
                    </td>

                    <td className="py-3.5 px-4 text-end" onClick={(e) => e.stopPropagation()}>
                      <div className="inline-flex items-center gap-1">
                        {!hidePayslips && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPayslipEmpId(row.employee.id);
                              setSubPage('payslip');
                            }}
                            title="View Payslip"
                            aria-label={`View payslip for ${row.employee.fullName}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {canControlRelease && (
                          <button
                            type="button"
                            onClick={() =>
                              openReleaseEditor({
                                scopeType: 'employee',
                                scopeId: row.employee.id,
                                title: row.employee.fullName,
                                companyId: row.employee.primaryCompanyId,
                                currentRelease: row.release,
                              })
                            }
                            title={t(lang, 'scheduleRelease')}
                            aria-label={`Schedule release for ${row.employee.fullName}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                          >
                            <CalendarClock className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
