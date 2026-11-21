import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Banknote,
  Building2,
  CalendarClock,
  ChevronRight,
  Clock,
  Download,
  FileSpreadsheet,
  Landmark,
  Lock,
  Plus,
  Printer,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
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
  AdjustmentKind,
  AppSettings,
  AttendanceLog,
  Company,
  DeductionApprovalRequest,
  DeductionCategory,
  DeductionTargetBucket,
  Employee,
  EmployeeLabel,
  Language,
  LeaveRequest,
  MonthlyPayrollRow,
  PatchMoneyRelease,
  PatchPaymentMethod,
  PatchReleaseAllocation,
  PayrollAdjustment,
  PayrollEntry,
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
  isPayrollEligible,
  validatePatchReleaseAllocations,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { SlideOverDrawer } from './SlideOverDrawer';

interface PayrollViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  scopedEmployees: Employee[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  adjustments: PayrollAdjustment[];
  payrollEntries: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
  salaryReleases: SalaryReleaseSchedule[];
  settings: AppSettings;
  onAddAdjustment: (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => Promise<void>;
  onRemoveAdjustment: (id: string) => Promise<void>;
  onUpsertReleaseSchedule: (input: {
    month: string;
    payPeriod: string;
    scopeType: 'section' | 'employee';
    scopeId: string;
    companyId: string | 'all';
    releaseDate: string;
    status: SalaryReleaseStatus;
    delayedUntilDate?: string | null;
    delayReason?: string | null;
    updatedBy: string;
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

const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  DeductionCategory.Lateness,
  DeductionCategory.UnpaidLeave,
  DeductionCategory.FinePenalty,
  DeductionCategory.SalaryAdvance,
  DeductionCategory.DamageOther,
];

const RELEASE_STATUSES: SalaryReleaseStatus[] = [
  'Scheduled',
  'Processing',
  'Delayed',
  'Released',
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

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

function getStatusBadgeClass(status: SalaryReleaseStatus): string {
  if (status === 'Released') {
    return 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  if (status === 'Processing') {
    return 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  }
  if (status === 'Delayed') {
    return 'bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  return 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700';
}

export const PayrollView: React.FC<PayrollViewProps> = ({
  lang,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  labels,
  scopedEmployees,
  attendance,
  leaves,
  adjustments,
  payrollEntries,
  deductionApprovals = [],
  patchReleases = [],
  salaryReleases,
  settings,
  onAddAdjustment,
  onRemoveAdjustment,
  onUpsertReleaseSchedule,
  onCreatePatchRelease,
  onDeletePatchRelease,
}) => {
  if (activeRole === UserRole.PRO) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          PRO accounts are strictly restricted from viewing salaries, payroll, or bank details.
        </p>
      </div>
    );
  }

  const canManageAdjustments =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;
  const canControlRelease = canControlSalaryRelease(activeRole);
  const canReleasePatch =
    activeRole === UserRole.MainManager ||
    activeRole === UserRole.HRAdmin ||
    activeRole === UserRole.Accounting;
  const canExportExcel =
    activeRole === UserRole.HRAdmin ||
    activeRole === UserRole.MainManager ||
    activeRole === UserRole.Accounting ||
    activeRole === UserRole.SectionManager ||
    activeRole === UserRole.SectionCoManager;
  const isEmployeeOnly = activeRole === UserRole.Employee;
  const isAccounting = activeRole === UserRole.Accounting;
  const canSeeMySalary = activeRole !== UserRole.MainManager && isPayrollEligible(currentUser);

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [viewMode, setViewMode] = useState<'team' | 'patch_releases' | 'my_salary'>(
    isEmployeeOnly ? 'my_salary' : 'team'
  );
  const [sectionFilter, setSectionFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | SalaryReleaseStatus>('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [patchSearch, setPatchSearch] = useState('');
  const [selectedPayslipEmpId, setSelectedPayslipEmpId] = useState<string | null>(null);

  // Release Money / Patch Modal state
  const [showPatchModal, setShowPatchModal] = useState(false);
  const [patchError, setPatchError] = useState<string | null>(null);
  const [patchSaving, setPatchSaving] = useState(false);
  const [patchEmpId, setPatchEmpId] = useState('');
  const [patchAmountStr, setPatchAmountStr] = useState('');
  const [patchMethod, setPatchMethod] = useState<PatchPaymentMethod>('Cash');
  const [patchDate, setPatchDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [patchReceiptNote, setPatchReceiptNote] = useState('');
  const [patchAllocInputs, setPatchAllocInputs] = useState<Record<string, string>>({});

  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjForm, setAdjForm] = useState({
    employeeId: '',
    kind: 'deduction' as AdjustmentKind,
    category: DeductionCategory.Lateness as DeductionCategory | 'Performance Bonus' | 'Incentive',
    targetBucket: 'additional_in_payroll' as DeductionTargetBucket,
    amountAED: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  // ADCB WPS Export Modal state
  const [showWpsModal, setShowWpsModal] = useState(false);
  const [wpsCompanyId, setWpsCompanyId] = useState<string>('');
  const [wpsMonth, setWpsMonth] = useState<string>(monthOptions[0].value);

  const [releaseModal, setReleaseModal] = useState<{
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

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const labelNameMap = useMemo(() => new Map(labels.map((l) => [l.id, l.name])), [labels]);
  const employeeMap = useMemo(
    () => new Map(scopedEmployees.map((e) => [e.id, e])),
    [scopedEmployees]
  );

  const eligibleScopedEmployees = useMemo(
    () => scopedEmployees.filter((emp) => isPayrollEligible(emp)),
    [scopedEmployees]
  );

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
    filteredRows.forEach((row) => {
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
  }, [filteredRows, sectionMap]);

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

  // Scoped patch releases for the Patch Releases tab
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

  // Pending unpaid balances for the currently selected employee inside the Release Money / Patch modal
  const patchModalEmployee = useMemo(
    () => eligibleScopedEmployees.find((e) => e.id === patchEmpId) ?? null,
    [eligibleScopedEmployees, patchEmpId]
  );

  const patchPendingBalances = useMemo(() => {
    if (!showPatchModal || !patchModalEmployee) return [];
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
    showPatchModal,
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

  const openPatchReleaseModal = (preselectedEmpId?: string) => {
    const initialEmpId =
      preselectedEmpId ?? targetEmployees[0]?.id ?? eligibleScopedEmployees[0]?.id ?? '';
    setPatchEmpId(initialEmpId);
    setPatchAmountStr('');
    setPatchMethod('Cash');
    setPatchDate(new Date().toISOString().slice(0, 10));
    setPatchReceiptNote('');
    setPatchAllocInputs({});
    setPatchError(null);
    setShowPatchModal(true);
  };

  const handleAutoAllocatePatch = () => {
    const targetAmt = Number(patchAmountStr);
    if (!Number.isFinite(targetAmt) || targetAmt <= 0) {
      setPatchError('Enter the release amount first, then click Auto-Allocate.');
      return;
    }
    let remaining = Math.round(targetAmt * 100) / 100;
    const nextInputs: Record<string, string> = {};
    // Balances are already sorted oldest-off-cycle first, then current off-cycle, then upcoming WPS buckets
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
      setShowPatchModal(false);
    } finally {
      setPatchSaving(false);
    }
  };

  const selectedPayslip: MonthlyPayrollRow | null =
    allPayrollRows.find((r) => r.employee.id === selectedPayslipEmpId) ??
    (selectedPayslipEmpId === currentUser.id ? mySalaryRow : null);

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

  // Active companies available for ADCB WPS export
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
    if (!showWpsModal || !selectedWpsCompany) return null;
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
    showWpsModal,
    selectedWpsCompany,
    eligibleScopedEmployees,
    wpsMonth,
    adjustments,
    attendance,
    salaryReleases,
    payrollEntries,
    leaves,
  ]);

  const handleOpenWpsModal = () => {
    const initialComp =
      selectedCompanyId !== 'all'
        ? selectedCompanyId
        : wpsExportCompanies[0]?.id ?? '';
    setWpsCompanyId(initialComp);
    setWpsMonth(selectedMonth);
    setShowWpsModal(true);
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
    setShowWpsModal(false);
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
      '',
      'ITEMIZED EARNINGS & DEDUCTIONS:',
      ...row.inPayrollEarningEntries.map(
        (e) => `+ [In-Payroll] ${e.categoryName}: ${formatAED(e.amountAED)} — ${e.reason}`
      ),
      ...row.offCycleEarningEntries.map(
        (e) => `+ [Off-Cycle] ${e.categoryName}: ${formatAED(e.amountAED)} — ${e.reason}`
      ),
      ...row.bonuses.map(
        (b) => `+ ${b.category} (${b.date}): ${formatAED(b.amountAED)} — ${b.reason}`
      ),
      ...row.inPayrollDeductionEntries.map(
        (d) => `- [In-Payroll → ${d.targetBucket ?? 'main_salary'}] ${d.categoryName}: ${formatAED(d.amountAED)} — ${d.reason}`
      ),
      ...row.offCycleDeductionEntries.map(
        (d) => `- [Off-Cycle → ${d.targetBucket ?? 'additional_off_cycle'}] ${d.categoryName}: ${formatAED(d.amountAED)} — ${d.reason}`
      ),
      ...row.deductions.map(
        (d) => `- ${d.category} (${d.date}): ${formatAED(d.amountAED)} — ${d.reason}`
      ),
      '------------------------------------------------------------',
      `TOTAL NET PAYABLE:       ${formatAED(row.netSalary)}`,
    ];
    await nativeBridge.saveTextFile(
      `Payslip_${row.employee.employeeCode}_${row.month}.txt`,
      lines.join('\n'),
      'text/plain;charset=utf-8'
    );
  };

  const handleSaveAdj = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(adjForm.amountAED);
    const emp = eligibleScopedEmployees.find((x) => x.id === adjForm.employeeId);
    if (!emp) {
      setAdjError('Select an employee.');
      return;
    }
    if (Number.isNaN(amt) || amt <= 0) {
      setAdjError('Enter a valid positive amount in AED.');
      return;
    }
    if (adjForm.reason.trim().length < 4) {
      setAdjError('Provide a clear reason (visible on the payslip).');
      return;
    }
    await onAddAdjustment({
      employeeId: emp.id,
      companyId: emp.primaryCompanyId,
      month: selectedMonth,
      kind: adjForm.kind,
      category: adjForm.category,
      targetBucket: adjForm.kind === 'deduction' ? adjForm.targetBucket : undefined,
      amountAED: amt,
      date: adjForm.date,
      reason: adjForm.reason.trim(),
      createdBy: currentUser.fullName,
      createdByRole: activeRole,
    });
    setShowAdjModal(false);
  };

  const handleSaveRelease = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!releaseModal || !canControlRelease) return;
    if (releaseModal.status === 'Delayed' && !releaseModal.delayedUntilDate) {
      setReleaseError('Select the new delayed release date.');
      return;
    }
    await onUpsertReleaseSchedule({
      month: selectedMonth,
      payPeriod: selectedMonth,
      scopeType: releaseModal.scopeType,
      scopeId: releaseModal.scopeId,
      companyId: releaseModal.companyId,
      releaseDate: releaseModal.releaseDate,
      status: releaseModal.status,
      delayedUntilDate:
        releaseModal.status === 'Delayed' ? releaseModal.delayedUntilDate : null,
      delayReason:
        releaseModal.status === 'Delayed' ? releaseModal.delayReason.trim() || null : null,
      updatedBy: currentUser.fullName,
    });
    setReleaseModal(null);
    setReleaseError(null);
  };

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;
  const effectiveMode = isEmployeeOnly ? 'my_salary' : viewMode;

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {effectiveMode === 'my_salary'
              ? t(lang, 'navMySalary')
              : effectiveMode === 'patch_releases'
                ? t(lang, 'patchReleasesTab')
                : t(lang, 'navPayroll')}
          </h2>
          {effectiveMode === 'team' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {filteredRows.length} staff · Net {formatAED(totals.net)} · WPS{' '}
              {formatAED(totals.wpsPayout)}
              {totals.offCycleNet > 0 ? ` · Off-Cycle ${formatAED(totals.offCycleNet)}` : ''} ·
              Deductions -{formatAED(totals.deductions)}
            </p>
          ) : effectiveMode === 'patch_releases' ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
              {scopedPatchReleases.length} patch releases · Total{' '}
              {formatAED(scopedPatchReleases.reduce((s, r) => s + r.totalAmountAED, 0))}
            </p>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {monthLabel} · {companyMap.get(currentUser.primaryCompanyId)}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {!isEmployeeOnly && (canSeeMySalary || canReleasePatch) && (
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('team')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  effectiveMode === 'team'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'navPayroll')}
              </button>
              {canReleasePatch && (
                <button
                  type="button"
                  onClick={() => setViewMode('patch_releases')}
                  className={`inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                    effectiveMode === 'patch_releases'
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t(lang, 'patchReleasesTab')}
                  {scopedPatchReleases.length > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 text-[10px] font-mono leading-none">
                      {scopedPatchReleases.length}
                    </span>
                  )}
                </button>
              )}
              {canSeeMySalary && (
                <button
                  type="button"
                  onClick={() => setViewMode('my_salary')}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                    effectiveMode === 'my_salary'
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {t(lang, 'navMySalary')}
                </button>
              )}
            </div>
          )}

          {effectiveMode !== 'patch_releases' && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              aria-label="Payroll month"
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              {monthOptions.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          )}

          {canReleasePatch &&
            onCreatePatchRelease &&
            (effectiveMode === 'team' || effectiveMode === 'patch_releases') && (
              <button
                type="button"
                onClick={() => openPatchReleaseModal()}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
              >
                <Banknote className="w-4 h-4" />
                {t(lang, 'releaseMoneyPatch')}
              </button>
            )}

          {effectiveMode === 'team' && canManageAdjustments && (
            <button
              type="button"
              onClick={() => {
                setAdjError(null);
                setAdjForm({
                  employeeId: targetEmployees[0]?.id ?? eligibleScopedEmployees[0]?.id ?? '',
                  kind: 'deduction',
                  category: DeductionCategory.Lateness,
                  targetBucket: 'additional_in_payroll',
                  amountAED: '',
                  date: new Date().toISOString().slice(0, 10),
                  reason: '',
                });
                setShowAdjModal(true);
              }}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'logAdjustment')}
            </button>
          )}

          {effectiveMode === 'team' && canExportExcel && (
            <>
              <button
                type="button"
                onClick={handleOpenWpsModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-indigo-600 dark:hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Landmark className="w-3.5 h-3.5" />
                {t(lang, 'exportAdcbWps')}
              </button>
              <button
                type="button"
                onClick={handleExportExcel}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {t(lang, 'exportExcel')}
              </button>
              <button
                type="button"
                onClick={() => void handleExportCSV()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Accounting Scope Banner */}
      {isAccounting && effectiveMode === 'team' && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 px-4 py-3 text-xs text-indigo-900 dark:text-indigo-200 flex items-center gap-2.5">
          <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
          <span>
            Accounting Access: viewing salaries and bank account details exclusively for your
            attached companies.
          </span>
        </div>
      )}

      {/* PATCH RELEASES TAB (Partial / Split-Bucket Early Releases History) */}
      {effectiveMode === 'patch_releases' && canReleasePatch && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={patchSearch}
                onChange={(e) => setPatchSearch(e.target.value)}
                placeholder={t(lang, 'search')}
                aria-label="Search patch releases"
                className="w-full ps-9 pe-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Early releases from upcoming Main Salary or In-Payroll buckets automatically offset
              month-end WPS Variable Income.
            </p>
          </div>

          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {scopedPatchReleases.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {t(lang, 'noPatchReleases')}
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
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
                    <div
                      key={rel.id}
                      className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Avatar
                          src={emp?.avatarUrl}
                          name={emp?.fullName ?? 'Employee'}
                          size="sm"
                        />
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="text-sm font-semibold text-slate-900 dark:text-white">
                              {emp?.fullName ?? rel.employeeId}
                            </span>
                            <span className="text-[11px] font-mono text-slate-400">
                              {emp?.employeeCode} · {compName}
                            </span>
                            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                              {getPaymentMethodLabel(lang, rel.paymentMethod)}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">
                              {formatShortDate(rel.releaseDate)}
                            </span>
                            {wpsOffset > 0 && (
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-mono">
                                WPS Offset -{formatAED(wpsOffset)}
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-1.5">
                            {rel.allocations.map((al, idx) => (
                              <span
                                key={`${rel.id}-${al.month}-${al.bucket}-${idx}`}
                                className="text-[11px] px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono"
                              >
                                {al.month} · {getPatchBucketLabel(lang, al.bucket)}:{' '}
                                <strong>{formatAED(al.amountAED)}</strong>
                              </span>
                            ))}
                          </div>

                          <p className="text-[11px] text-slate-500 dark:text-slate-400">
                            Released by <strong>{rel.releasedBy}</strong>
                            {rel.referenceNote ? ` · ${rel.referenceNote}` : ''}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                        <span className="text-base font-bold font-mono text-emerald-700 dark:text-emerald-400">
                          {formatAED(rel.totalAmountAED)}
                        </span>
                        {onDeletePatchRelease && (
                          <button
                            type="button"
                            onClick={() => void onDeletePatchRelease(rel.id)}
                            aria-label="Delete patch release"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* MY SALARY VIEW (Every Employee except Main Manager) */}
      {effectiveMode === 'my_salary' && mySalaryRow && (
        <div className="max-w-2xl mx-auto space-y-4">
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <span
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${getStatusBadgeClass(
                    mySalaryRow.release.status
                  )}`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {getSalaryStatusLabel(lang, mySalaryRow.release.status)}
                </span>
                <p className="mt-3 text-3xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {formatAED(mySalaryRow.netSalary)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Net Payable · {monthLabel} · {sectionMap.get(currentUser.sectionId)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadPayslip(mySalaryRow)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Payslip
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPayslipEmpId(currentUser.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print / PDF
                </button>
              </div>
            </div>

            {mySalaryRow.release.status === 'Delayed' ? (
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-4 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs space-y-1">
                  <p className="font-semibold text-amber-900 dark:text-amber-200">
                    Salary Release Delayed until{' '}
                    {formatShortDate(
                      mySalaryRow.release.delayedUntilDate || mySalaryRow.release.releaseDate
                    )}
                  </p>
                  {mySalaryRow.release.delayReason && (
                    <p className="text-amber-800/90 dark:text-amber-300/90">
                      Reason: {mySalaryRow.release.delayReason}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 flex items-center justify-between text-xs">
                <span className="text-slate-600 dark:text-slate-400 inline-flex items-center gap-1.5">
                  <CalendarClock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  {t(lang, 'releaseDate')}
                </span>
                <span className="font-semibold text-slate-900 dark:text-white">
                  {formatShortDate(mySalaryRow.release.releaseDate)}
                </span>
              </div>
            )}

            <dl className="space-y-2 text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex justify-between">
                <dt className="text-slate-500">Basic Salary (WPS Fixed)</dt>
                <dd className="font-mono text-slate-900 dark:text-white">
                  {formatAED(mySalaryRow.baseSalary)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Allowances (Housing + Transport + Other)</dt>
                <dd className="font-mono text-slate-900 dark:text-white">
                  {formatAED(mySalaryRow.totalAllowances)}
                </dd>
              </div>
              {mySalaryRow.inPayrollEarnings > 0 && (
                <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                  <dt>{t(lang, 'typeEarningInPayroll')}</dt>
                  <dd className="font-mono">+{formatAED(mySalaryRow.inPayrollEarnings)}</dd>
                </div>
              )}
              {mySalaryRow.offCycleEarnings > 0 && (
                <div className="flex justify-between text-teal-700 dark:text-teal-400">
                  <dt>{t(lang, 'typeEarningOffCycle')}</dt>
                  <dd className="font-mono">+{formatAED(mySalaryRow.offCycleEarnings)}</dd>
                </div>
              )}
              {mySalaryRow.totalDeductions > 0 && (
                <div className="flex justify-between text-rose-700 dark:text-rose-400">
                  <dt>Total Deductions</dt>
                  <dd className="font-mono">-{formatAED(mySalaryRow.totalDeductions)}</dd>
                </div>
              )}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex justify-between font-semibold text-indigo-700 dark:text-indigo-300">
                <dt>{t(lang, 'wpsPayout')}</dt>
                <dd className="font-mono">{formatAED(mySalaryRow.wpsTotalPayout)}</dd>
              </div>
              {mySalaryRow.offCycleNetPayout > 0 && (
                <div className="flex justify-between font-semibold text-teal-700 dark:text-teal-300">
                  <dt>{t(lang, 'offCyclePayout')}</dt>
                  <dd className="font-mono">{formatAED(mySalaryRow.offCycleNetPayout)}</dd>
                </div>
              )}
            </dl>

            {currentUser.bankDetails && (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 text-xs flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {currentUser.bankDetails.bankName}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 truncate">
                      {currentUser.bankDetails.iban}
                    </p>
                  </div>
                </div>
                <span className="font-mono text-[11px] text-slate-500 shrink-0">
                  {currentUser.bankDetails.accountNumber}
                </span>
              </div>
            )}
          </section>
        </div>
      )}

      {/* TEAM PAYROLL VIEW — GROUPED BY SECTIONS */}
      {effectiveMode === 'team' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={sectionFilter}
              onChange={(e) => setSectionFilter(e.target.value)}
              aria-label="Filter payroll by section"
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
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
              onChange={(e) =>
                setStatusFilter(e.target.value as 'all' | SalaryReleaseStatus)
              }
              aria-label="Filter payroll by release status"
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{t(lang, 'allStatuses')}</option>
              {RELEASE_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {getSalaryStatusLabel(lang, st)}
                </option>
              ))}
            </select>

            <select
              value={labelFilter}
              onChange={(e) => setLabelFilter(e.target.value)}
              aria-label="Filter payroll by employee label"
              className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
            >
              <option value="all">{t(lang, 'allLabels')}</option>
              {labels.map((lbl) => (
                <option key={lbl.id} value={lbl.id}>
                  {lbl.name}
                </option>
              ))}
            </select>
          </div>

          {sectionGroups.length === 0 ? (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'noRecords')}
            </section>
          ) : (
            <div className="space-y-4">
              {sectionGroups.map((group) => (
                <section
                  key={group.sectionId}
                  className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden"
                >
                  <div className="px-4 sm:px-5 py-3.5 bg-slate-50/80 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                        {group.sectionName}
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {group.rows.length} staff ·{' '}
                        <span className="font-mono font-semibold text-indigo-800 dark:text-indigo-300">
                          {formatAED(group.netSubtotal)}
                        </span>
                      </span>
                      {group.primaryRelease && (
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getStatusBadgeClass(
                            group.primaryRelease.status
                          )}`}
                        >
                          {getSalaryStatusLabel(lang, group.primaryRelease.status)} ·{' '}
                          {formatShortDate(
                            group.primaryRelease.status === 'Delayed' &&
                              group.primaryRelease.delayedUntilDate
                              ? group.primaryRelease.delayedUntilDate
                              : group.primaryRelease.releaseDate
                          )}
                        </span>
                      )}
                    </div>

                    {canControlRelease && (
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setReleaseError(null);
                            setReleaseModal({
                              scopeType: 'section',
                              scopeId: group.sectionId,
                              title: `${group.sectionName} Section`,
                              companyId: selectedCompanyId === 'all' ? 'all' : selectedCompanyId,
                              releaseDate:
                                group.primaryRelease?.releaseDate ?? `${selectedMonth}-28`,
                              status: group.primaryRelease?.status ?? 'Scheduled',
                              delayedUntilDate:
                                group.primaryRelease?.delayedUntilDate ?? `${selectedMonth}-30`,
                              delayReason: group.primaryRelease?.delayReason ?? '',
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                        >
                          <CalendarClock className="w-3.5 h-3.5 text-indigo-600" />
                          {t(lang, 'scheduleRelease')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setReleaseError(null);
                            setReleaseModal({
                              scopeType: 'section',
                              scopeId: group.sectionId,
                              title: `${group.sectionName} Section`,
                              companyId: selectedCompanyId === 'all' ? 'all' : selectedCompanyId,
                              releaseDate:
                                group.primaryRelease?.releaseDate ?? `${selectedMonth}-28`,
                              status: 'Delayed',
                              delayedUntilDate:
                                group.primaryRelease?.delayedUntilDate ?? `${selectedMonth}-30`,
                              delayReason: group.primaryRelease?.delayReason ?? '',
                            });
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 text-xs font-semibold text-amber-800 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          {t(lang, 'delaySalary')}
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {group.rows.map((row) => {
                      const empLabels = row.employee.labelIds
                        .map((id) => labelMap.get(id))
                        .filter((l): l is EmployeeLabel => Boolean(l));

                      return (
                        <div
                          key={row.employee.id}
                          className="px-4 sm:px-5 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                        >
                          <button
                            type="button"
                            onClick={() => setSelectedPayslipEmpId(row.employee.id)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-start cursor-pointer"
                          >
                            <Avatar
                              src={row.employee.avatarUrl}
                              name={row.employee.fullName}
                              size="sm"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                  {row.employee.fullName}
                                </span>
                                {empLabels.slice(0, 2).map((lbl) => (
                                  <span
                                    key={lbl.id}
                                    style={{
                                      backgroundColor: `${lbl.color}18`,
                                      color: lbl.color,
                                      borderColor: `${lbl.color}44`,
                                    }}
                                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded border whitespace-nowrap"
                                  >
                                    {lbl.name}
                                  </span>
                                ))}
                              </div>
                              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                                {companyMap.get(row.employee.primaryCompanyId)}
                                {row.employee.bankDetails && (
                                  <span className="ms-2 font-mono text-[11px] text-slate-600 dark:text-slate-300">
                                    · {row.employee.bankDetails.bankName} (
                                    {row.employee.bankDetails.iban})
                                  </span>
                                )}
                              </p>
                            </div>
                          </button>

                          <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                            <span
                              className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border whitespace-nowrap ${getStatusBadgeClass(
                                row.release.status
                              )}`}
                            >
                              {getSalaryStatusLabel(lang, row.release.status)}
                              {row.release.status === 'Delayed' && row.release.delayedUntilDate
                                ? ` → ${formatShortDate(row.release.delayedUntilDate)}`
                                : ` · ${formatShortDate(row.release.releaseDate)}`}
                            </span>

                            {row.offCycleNetPayout > 0 && (
                              <span className="hidden xl:inline text-[11px] font-mono tabular-nums px-1.5 py-0.5 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300">
                                Off-Cycle {formatAED(row.offCycleNetPayout)}
                              </span>
                            )}

                            {row.totalDeductions > 0 && (
                              <span className="hidden lg:inline text-xs font-mono tabular-nums text-rose-700 dark:text-rose-400">
                                -{formatAED(row.totalDeductions)}
                              </span>
                            )}

                            <div className="text-end">
                              <span className="text-sm font-bold font-mono tabular-nums text-indigo-900 dark:text-indigo-300 block">
                                {formatAED(row.netSalary)}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 block">
                                WPS {formatAED(row.wpsTotalPayout)}
                              </span>
                            </div>

                            {canControlRelease && (
                              <button
                                type="button"
                                onClick={() => {
                                  setReleaseError(null);
                                  setReleaseModal({
                                    scopeType: 'employee',
                                    scopeId: row.employee.id,
                                    title: row.employee.fullName,
                                    companyId: row.employee.primaryCompanyId,
                                    releaseDate: row.release.releaseDate,
                                    status: row.release.status,
                                    delayedUntilDate:
                                      row.release.delayedUntilDate ?? `${selectedMonth}-30`,
                                    delayReason: row.release.delayReason ?? '',
                                  });
                                }}
                                aria-label={`Update salary release for ${row.employee.fullName}`}
                                title="Update Release / Delay"
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                              >
                                <CalendarClock className="w-3.5 h-3.5" />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => setSelectedPayslipEmpId(row.employee.id)}
                              aria-label={`Open payslip for ${row.employee.fullName}`}
                              className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                            >
                              <ChevronRight className="w-4 h-4 rtl:rotate-180" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {/* Slide-Over Printable Payslip Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedPayslip)}
        onClose={() => setSelectedPayslipEmpId(null)}
        title={selectedPayslip ? `Payslip — ${selectedPayslip.employee.fullName}` : 'Payslip'}
        subtitle={`${monthLabel} · ${
          selectedPayslip ? companyMap.get(selectedPayslip.employee.primaryCompanyId) ?? '' : ''
        }`}
        maxWidthClass="max-w-xl"
        headerExtra={
          selectedPayslip ? (
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => void handleDownloadPayslip(selectedPayslip)}
                aria-label="Download payslip"
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                aria-label="Print payslip"
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>
          ) : undefined
        }
      >
        {selectedPayslip && (
          <div id="printable-payslip" className="space-y-5 text-sm">
            <div className="rounded-xl bg-indigo-50/70 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-900 p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-indigo-800 dark:text-indigo-200">
                  Net Payable ({monthLabel})
                </p>
                <p className="text-xs text-indigo-700/80 dark:text-indigo-300/80 mt-0.5">
                  {companyMap.get(selectedPayslip.employee.primaryCompanyId)} ·{' '}
                  {selectedPayslip.employee.employeeCode}
                </p>
              </div>
              <p className="text-xl font-bold font-mono tabular-nums text-indigo-950 dark:text-white">
                {formatAED(selectedPayslip.netSalary)}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                <p className="text-slate-500">{t(lang, 'releaseDate')}</p>
                <p className="font-semibold text-slate-900 dark:text-white">
                  {getSalaryStatusLabel(lang, selectedPayslip.release.status)} ·{' '}
                  {formatShortDate(
                    selectedPayslip.release.status === 'Delayed' &&
                      selectedPayslip.release.delayedUntilDate
                      ? selectedPayslip.release.delayedUntilDate
                      : selectedPayslip.release.releaseDate
                  )}
                </p>
                {selectedPayslip.release.delayReason && (
                  <p className="text-amber-700 dark:text-amber-400">
                    {selectedPayslip.release.delayReason}
                  </p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 space-y-1">
                <p className="text-slate-500">{t(lang, 'bankDetails')}</p>
                {selectedPayslip.employee.bankDetails ? (
                  <>
                    <p className="font-semibold text-slate-900 dark:text-white">
                      {selectedPayslip.employee.bankDetails.bankName} ·{' '}
                      {selectedPayslip.employee.bankDetails.accountNumber}
                    </p>
                    <p className="font-mono text-[11px] text-slate-500 break-all">
                      {selectedPayslip.employee.bankDetails.iban}
                    </p>
                  </>
                ) : (
                  <p className="text-slate-400">Not configured</p>
                )}
              </div>
            </div>

            {/* 3-Bucket Payout Summary inside Payslip */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                <p className="text-[11px] text-slate-500">{t(lang, 'wpsFixedIncome')}</p>
                <p className="font-mono font-bold text-slate-900 dark:text-white mt-0.5">
                  {formatAED(selectedPayslip.wpsFixedIncome)}
                </p>
              </div>
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30 p-3">
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                  {t(lang, 'wpsPayout')}
                </p>
                <p className="font-mono font-bold text-indigo-900 dark:text-indigo-200 mt-0.5">
                  {formatAED(selectedPayslip.wpsTotalPayout)}
                </p>
              </div>
              <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/40 dark:bg-teal-950/30 p-3">
                <p className="text-[11px] text-teal-700 dark:text-teal-300">
                  {t(lang, 'offCyclePayout')}
                </p>
                <p className="font-mono font-bold text-teal-900 dark:text-teal-200 mt-0.5">
                  {formatAED(selectedPayslip.offCycleNetPayout)}
                </p>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white pb-1.5 border-b border-slate-200 dark:border-slate-800">
                Earnings (AED)
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">Basic Salary (WPS Fixed)</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.baseSalary)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Housing Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.housingAllowance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Transport Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.transportAllowance)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Other Allowance</span>
                <span className="font-mono text-slate-900 dark:text-white">
                  {formatAED(selectedPayslip.otherAllowance)}
                </span>
              </div>
              {selectedPayslip.inPayrollEarningEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400"
                >
                  <div>
                    <span className="font-semibold block">
                      {entry.categoryName} · {t(lang, 'typeEarningInPayroll')}
                    </span>
                    <span className="text-[11px] opacity-80">{entry.reason}</span>
                  </div>
                  <span className="font-mono shrink-0">+{formatAED(entry.amountAED)}</span>
                </div>
              ))}
              {selectedPayslip.offCycleEarningEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-start justify-between gap-2 text-teal-700 dark:text-teal-400"
                >
                  <div>
                    <span className="font-semibold block">
                      {entry.categoryName} · {t(lang, 'typeEarningOffCycle')}
                    </span>
                    <span className="text-[11px] opacity-80">{entry.reason}</span>
                  </div>
                  <span className="font-mono shrink-0">+{formatAED(entry.amountAED)}</span>
                </div>
              ))}
              {selectedPayslip.bonuses.map((b) => (
                <div
                  key={b.id}
                  className="flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400"
                >
                  <div>
                    <span className="font-semibold block">{b.category}</span>
                    <span className="text-[11px] opacity-80">{b.reason}</span>
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

            <div className="space-y-2.5 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white pb-1.5 border-b border-slate-200 dark:border-slate-800">
                Itemized Deductions (AED)
              </p>
              {selectedPayslip.deductions.length === 0 &&
              selectedPayslip.inPayrollDeductionEntries.length === 0 &&
              selectedPayslip.offCycleDeductionEntries.length === 0 &&
              selectedPayslip.approvedDeductionRequests.length === 0 ? (
                <p className="text-slate-500">No deductions for this month.</p>
              ) : (
                <>
                  {selectedPayslip.approvedDeductionRequests.map((wf) => (
                    <div
                      key={wf.id}
                      className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/30 dark:bg-rose-950/20 p-3 flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-rose-700 dark:text-rose-400">
                          {getDeductionTriggerLabel(lang, wf.triggerType)} · HR Approved
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {t(lang, 'deductFromBucket')}:{' '}
                          {getDeductionBucketLabel(lang, wf.targetBucket)}
                        </p>
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">{wf.reason}</p>
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
                    <div
                      key={d.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-rose-700 dark:text-rose-400">
                          {d.categoryName} ·{' '}
                          {d.type === 'deduction_off_cycle' ? 'Off Cycle' : 'In Payroll'}
                        </p>
                        {d.targetBucket && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {t(lang, 'deductFromBucket')}:{' '}
                            {getDeductionBucketLabel(lang, d.targetBucket)}
                          </p>
                        )}
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">{d.reason}</p>
                      </div>
                      <span className="font-mono font-semibold text-rose-700 dark:text-rose-400 shrink-0">
                        -{formatAED(d.amountAED)}
                      </span>
                    </div>
                  ))}
                  {selectedPayslip.deductions.map((d) => (
                    <div
                      key={d.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3"
                    >
                      <div>
                        <p className="font-semibold text-rose-700 dark:text-rose-400">
                          {d.category} · {formatShortDate(d.date)}
                          {d.source === 'auto_lateness' ? ' (Auto Model Tier)' : ''}
                        </p>
                        {d.targetBucket && (
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {t(lang, 'deductFromBucket')}:{' '}
                            {getDeductionBucketLabel(lang, d.targetBucket)}
                          </p>
                        )}
                        <p className="text-slate-600 dark:text-slate-400 mt-0.5">{d.reason}</p>
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
                </>
              )}
            </div>

            {/* Phase 1B: Early Patch Releases applied to this month */}
            {selectedPayslip.earlyWpsReleasedAED + selectedPayslip.earlyOffCycleReleasedAED > 0 && (
              <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/40 dark:bg-indigo-950/30 p-3.5 space-y-1.5 text-xs">
                <div className="flex justify-between font-semibold text-indigo-900 dark:text-indigo-200">
                  <span>{t(lang, 'earlyPatchReleases')}</span>
                  <span className="font-mono">
                    -
                    {formatAED(
                      selectedPayslip.earlyWpsReleasedAED + selectedPayslip.earlyOffCycleReleasedAED
                    )}
                  </span>
                </div>
                {selectedPayslip.earlyWpsReleasedAED > 0 && (
                  <p className="text-[11px] text-indigo-700 dark:text-indigo-300">
                    Automatic WPS Offset: -{formatAED(selectedPayslip.earlyWpsReleasedAED)} from
                    Variable Income (Basic Salary intact).
                  </p>
                )}
                <div className="pt-1.5 border-t border-indigo-200/70 dark:border-indigo-800 flex justify-between font-bold text-slate-900 dark:text-white">
                  <span>{t(lang, 'remainingNetPayable')}</span>
                  <span className="font-mono">
                    {formatAED(selectedPayslip.remainingNetPayable)}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>

      {/* Schedule / Delay Salary Modal */}
      {releaseModal && canControlRelease && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Salary Release Schedule"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'scheduleRelease')} — {releaseModal.title}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{monthLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setReleaseModal(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveRelease} className="mt-4 space-y-3.5">
              {releaseError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {releaseError}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Release Status
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {RELEASE_STATUSES.map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setReleaseModal((p) => (p ? { ...p, status: st } : null))}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold cursor-pointer ${
                        releaseModal.status === st
                          ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {getSalaryStatusLabel(lang, st)}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Scheduled Release Date
                </label>
                <input
                  type="date"
                  required
                  value={releaseModal.releaseDate}
                  onChange={(e) =>
                    setReleaseModal((p) => (p ? { ...p, releaseDate: e.target.value } : null))
                  }
                  className={INPUT_CLASS}
                />
              </div>

              {releaseModal.status === 'Delayed' && (
                <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3.5 space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-amber-900 dark:text-amber-200 mb-1">
                      Delayed Until Date *
                    </label>
                    <input
                      type="date"
                      required
                      value={releaseModal.delayedUntilDate}
                      onChange={(e) =>
                        setReleaseModal((p) =>
                          p ? { ...p, delayedUntilDate: e.target.value } : null
                        )
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-amber-900 dark:text-amber-200 mb-1">
                      Delay Reason (Optional — visible to employee)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., Bank WPS batch verification pending"
                      value={releaseModal.delayReason}
                      onChange={(e) =>
                        setReleaseModal((p) => (p ? { ...p, delayReason: e.target.value } : null))
                      }
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
              )}

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReleaseModal(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Log Deduction / Bonus Modal */}
      {showAdjModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'logAdjustment')}
              </h3>
              <button
                type="button"
                onClick={() => setShowAdjModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdj} className="mt-4 space-y-3.5">
              {adjError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {adjError}
                </p>
              )}

              <div className="grid grid-cols-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                <button
                  type="button"
                  onClick={() =>
                    setAdjForm((p) => ({
                      ...p,
                      kind: 'deduction',
                      category: DeductionCategory.Lateness,
                    }))
                  }
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    adjForm.kind === 'deduction'
                      ? 'bg-white dark:bg-slate-900 text-rose-700 dark:text-rose-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Deduction
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setAdjForm((p) => ({
                      ...p,
                      kind: 'bonus',
                      category: 'Performance Bonus',
                    }))
                  }
                  className={`py-1.5 text-xs font-semibold rounded-md cursor-pointer ${
                    adjForm.kind === 'bonus'
                      ? 'bg-white dark:bg-slate-900 text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  Bonus
                </button>
              </div>

              <select
                value={adjForm.employeeId}
                onChange={(e) => setAdjForm((p) => ({ ...p, employeeId: e.target.value }))}
                aria-label="Select employee"
                className={INPUT_CLASS}
              >
                {eligibleScopedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </select>

              <div className="grid grid-cols-2 gap-2.5">
                <select
                  value={adjForm.category}
                  onChange={(e) =>
                    setAdjForm((p) => ({
                      ...p,
                      category: e.target.value as
                        | DeductionCategory
                        | 'Performance Bonus'
                        | 'Incentive',
                    }))
                  }
                  aria-label="Category"
                  className={INPUT_CLASS}
                >
                  {adjForm.kind === 'deduction' ? (
                    DEDUCTION_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))
                  ) : (
                    <>
                      <option value="Performance Bonus">Performance Bonus</option>
                      <option value="Incentive">Incentive</option>
                    </>
                  )}
                </select>

                <input
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={adjForm.amountAED}
                  onChange={(e) => setAdjForm((p) => ({ ...p, amountAED: e.target.value }))}
                  placeholder="Amount (AED)"
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              {adjForm.kind === 'deduction' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t(lang, 'deductFromBucket')} *
                  </label>
                  <select
                    required
                    value={adjForm.targetBucket}
                    onChange={(e) =>
                      setAdjForm((p) => ({
                        ...p,
                        targetBucket: e.target.value as DeductionTargetBucket,
                      }))
                    }
                    aria-label={t(lang, 'deductFromBucket')}
                    className={INPUT_CLASS}
                  >
                    <option value="additional_in_payroll">
                      {t(lang, 'bucketInPayroll')}
                    </option>
                    <option value="additional_off_cycle">
                      {t(lang, 'bucketOffCycle')}
                    </option>
                    <option value="main_salary">{t(lang, 'bucketMainSalary')}</option>
                  </select>
                </div>
              )}

              <textarea
                rows={3}
                required
                value={adjForm.reason}
                onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))}
                placeholder="Mandatory reason shown on employee payslip..."
                className={INPUT_CLASS}
              />

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Multi-Company ADCB WPS (.xlsx) Export Modal */}
      {showWpsModal && canExportExcel && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'adcbWpsTitle')}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-indigo-600" />
                  {t(lang, 'adcbWpsTitle')}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">{t(lang, 'adcbWpsSubtitle')}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowWpsModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                      {selectedWpsCompany.name}
                    </span>
                    <span className="font-mono font-semibold text-indigo-700 dark:text-indigo-300">
                      SCR · {wpsPreview.exportData.salaryMonthCode}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-[11px] text-slate-500 block">EDR Employee Rows</span>
                      <span className="text-sm font-bold font-mono text-slate-900 dark:text-white">
                        {wpsPreview.exportData.scrRow.totalEdrCount}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Total WPS Payout (AED)
                      </span>
                      <span className="text-sm font-bold font-mono text-indigo-700 dark:text-indigo-300">
                        {formatAED(wpsPreview.exportData.scrRow.totalPayoutAed)}
                      </span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 space-y-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                    <p>MOL ID: {selectedWpsCompany.molEstablishmentId || 'MISSING'}</p>
                    <p>Routing: {selectedWpsCompany.wpsRoutingCode || 'MISSING'}</p>
                    <p className="break-all">IBAN: {selectedWpsCompany.companyIban || 'MISSING'}</p>
                  </div>
                </div>

                {wpsPreview.exportData.totalEarlyWpsOffsetAed > 0 && (
                  <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/40 p-3 text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
                    <Banknote className="w-4 h-4 shrink-0 mt-0.5 text-indigo-600 dark:text-indigo-400" />
                    <span>
                      <strong>{t(lang, 'automaticWpsOffset')}:</strong>{' '}
                      <span className="font-mono font-bold">
                        -{formatAED(wpsPreview.exportData.totalEarlyWpsOffsetAed)}
                      </span>{' '}
                      from early patch releases has been automatically subtracted from Variable
                      Income (Fixed / Basic Salary stays intact).
                    </span>
                  </div>
                )}

                {wpsPreview.warnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/40 p-3 space-y-1 text-amber-900 dark:text-amber-200">
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
                  <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 p-3 text-emerald-800 dark:text-emerald-200 flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 shrink-0" />
                    <span>
                      All ADCB WPS fields verified (EDR rows + SCR footer, Off-Cycle excluded,
                      Basic Salary kept intact as Fixed Income).
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowWpsModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="button"
                disabled={!selectedWpsCompany || !wpsPreview || wpsPreview.exportData.edrRows.length === 0}
                onClick={handleDownloadAdcbWps}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                <Download className="w-3.5 h-3.5" />
                {t(lang, 'exportAdcbWps')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Phase 1B: Release Money / Patch Modal (Split-Bucket Allocation + Auto WPS Offset) */}
      {showPatchModal && canReleasePatch && onCreatePatchRelease && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'releaseMoneyPatch')}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl my-8">
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                  <Banknote className="w-4 h-4 text-teal-600" />
                  {t(lang, 'releaseMoneyPatch')}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Release a partial or batch payment today and split it across pending unpaid
                  balances.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowPatchModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitPatchRelease} className="mt-4 space-y-4">
              {patchError && (
                <p
                  role="alert"
                  className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300"
                >
                  {patchError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Employee
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t(lang, 'releaseAmountToday')}
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      min={1}
                      step="0.01"
                      required
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
                      className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 text-xs font-semibold hover:bg-indigo-100 dark:hover:bg-indigo-900/50 cursor-pointer shrink-0"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      {t(lang, 'autoAllocate')}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t(lang, 'releaseDate')}
                  </label>
                  <input
                    type="date"
                    required
                    value={patchDate}
                    onChange={(e) => setPatchDate(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {/* Pending Unpaid Balances & Split-Bucket Allocation */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">
                    {t(lang, 'pendingBalances')} — {t(lang, 'splitAllocation')}
                  </p>
                  <div className="text-[11px] font-mono flex items-center gap-2">
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
                  <p className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 text-xs text-slate-500 text-center">
                    No pending unpaid balances found for this employee.
                  </p>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 max-h-60 overflow-y-auto">
                    {patchPendingBalances.map((bal) => {
                      const key = `${bal.month}__${bal.bucket}`;
                      return (
                        <div
                          key={key}
                          className="px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-950/60"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                              <span className="font-mono font-semibold text-slate-900 dark:text-white">
                                {bal.month}
                              </span>
                              <span className="text-slate-700 dark:text-slate-300 font-medium">
                                {getPatchBucketLabel(lang, bal.bucket)}
                              </span>
                              {bal.impactsWps && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300">
                                  Impacts WPS
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
                              className="w-28 px-2.5 py-1.5 text-xs font-mono border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setPatchAllocInputs((prev) => ({
                                  ...prev,
                                  [key]: String(bal.availableAED),
                                }))
                              }
                              className="px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
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
                <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/40 px-3.5 py-2.5 text-xs text-indigo-900 dark:text-indigo-200 flex items-start gap-2">
                  <Landmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                  <span>
                    <strong>{t(lang, 'automaticWpsOffset')}:</strong>{' '}
                    <span className="font-mono font-bold">-{formatAED(patchDraftWpsOffset)}</span>{' '}
                    will be automatically deducted from month-end WPS Variable Income (Basic Salary
                    stays intact).
                  </span>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
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

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowPatchModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={patchSaving || patchTotalInputNum <= 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  <Banknote className="w-3.5 h-3.5" />
                  {t(lang, 'confirmRelease')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
