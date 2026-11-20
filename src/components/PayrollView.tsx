import React, { useMemo, useState } from 'react';
import {
  ChevronRight,
  Download,
  FileSpreadsheet,
  Plus,
  Printer,
  Trash2,
  X,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AdjustmentKind,
  AppSettings,
  AttendanceLog,
  Company,
  DeductionCategory,
  Employee,
  Language,
  MonthlyPayrollRow,
  PayrollAdjustment,
  Section,
  UserRole,
} from '../types/hr';
import {
  buildPayrollCSV,
  calculateEmployeePayroll,
  formatAED,
  formatShortDate,
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
  scopedEmployees: Employee[];
  attendance: AttendanceLog[];
  adjustments: PayrollAdjustment[];
  settings: AppSettings;
  onAddAdjustment: (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => Promise<void>;
  onRemoveAdjustment: (id: string) => Promise<void>;
}

const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  DeductionCategory.Lateness,
  DeductionCategory.UnpaidLeave,
  DeductionCategory.FinePenalty,
  DeductionCategory.SalaryAdvance,
  DeductionCategory.DamageOther,
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

export const PayrollView: React.FC<PayrollViewProps> = ({
  lang,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  scopedEmployees,
  attendance,
  adjustments,
  settings,
  onAddAdjustment,
  onRemoveAdjustment,
}) => {
  const canManagePayroll =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;

  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [sectionFilter, setSectionFilter] = useState('all');
  const [selectedPayslipEmpId, setSelectedPayslipEmpId] = useState<string | null>(null);

  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjForm, setAdjForm] = useState({
    employeeId: scopedEmployees[0]?.id ?? '',
    kind: 'deduction' as AdjustmentKind,
    category: DeductionCategory.Lateness as DeductionCategory | 'Performance Bonus' | 'Incentive',
    amountAED: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s.name])), [sections]);

  const targetEmployees = useMemo(() => {
    return scopedEmployees.filter((emp) => {
      if (!emp.active && activeRole !== UserRole.Employee) return false;
      if (sectionFilter !== 'all' && emp.sectionId !== sectionFilter) return false;
      // Consolidate core payroll under employee's Primary Company when isolated to a company
      if (
        selectedCompanyId !== 'all' &&
        activeRole !== UserRole.Employee &&
        emp.primaryCompanyId !== selectedCompanyId
      ) {
        return false;
      }
      return true;
    });
  }, [scopedEmployees, sectionFilter, selectedCompanyId, activeRole]);

  const payrollRows = useMemo(
    () =>
      targetEmployees.map((emp) =>
        calculateEmployeePayroll(emp, selectedMonth, adjustments, attendance)
      ),
    [targetEmployees, selectedMonth, adjustments, attendance]
  );

  const selectedPayslip: MonthlyPayrollRow | null =
    payrollRows.find((r) => r.employee.id === selectedPayslipEmpId) ?? null;

  const totals = useMemo(
    () =>
      payrollRows.reduce(
        (acc, r) => ({
          gross: acc.gross + r.grossSalary,
          deductions: acc.deductions + r.totalDeductions,
          bonuses: acc.bonuses + r.totalBonuses,
          net: acc.net + r.netSalary,
        }),
        { gross: 0, deductions: 0, bonuses: 0, net: 0 }
      ),
    [payrollRows]
  );

  const handleExportCSV = async () => {
    const csv = buildPayrollCSV(payrollRows, companyMap, sectionMap);
    await nativeBridge.saveTextFile(
      `yaldi-payroll-${selectedMonth}.csv`,
      csv,
      'text/csv;charset=utf-8'
    );
  };

  const handleDownloadPayslip = async (row: MonthlyPayrollRow) => {
    const lines = [
      `${settings.groupName} — ${companyMap.get(row.employee.primaryCompanyId) ?? ''}`,
      `MONTHLY PAYSLIP (${row.month})`,
      `Employee: ${row.employee.fullName} (${row.employee.employeeCode})`,
      `Section: ${sectionMap.get(row.employee.sectionId) ?? ''} | ${row.employee.jobTitle}`,
      '------------------------------------------------------------',
      `Base Salary:          ${formatAED(row.baseSalary)}`,
      `Housing Allowance:    ${formatAED(row.housingAllowance)}`,
      `Transport Allowance:  ${formatAED(row.transportAllowance)}`,
      `Other Allowance:      ${formatAED(row.otherAllowance)}`,
      `Gross Salary:         ${formatAED(row.grossSalary)}`,
      `Bonuses:              +${formatAED(row.totalBonuses)}`,
      `Total Deductions:     -${formatAED(row.totalDeductions)}`,
      '',
      'ITEMIZED ADJUSTMENTS:',
      ...row.bonuses.map((b) => `+ ${b.category} (${b.date}): ${formatAED(b.amountAED)} — ${b.reason}`),
      ...row.deductions.map((d) => `- ${d.category} (${d.date}): ${formatAED(d.amountAED)} — ${d.reason}`),
      '------------------------------------------------------------',
      `NET PAYABLE:          ${formatAED(row.netSalary)}`,
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
    const emp = scopedEmployees.find((x) => x.id === adjForm.employeeId);
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
      amountAED: amt,
      date: adjForm.date,
      reason: adjForm.reason.trim(),
      createdBy: currentUser.fullName,
      createdByRole: activeRole,
    });
    setShowAdjModal(false);
  };

  const monthLabel = monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;

  return (
    <div className="space-y-5">
      {/* Compact Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {t(lang, 'navPayroll')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            Net {formatAED(totals.net)} · Deductions -{formatAED(totals.deductions)} · Gross{' '}
            {formatAED(totals.gross)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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

          {activeRole !== UserRole.Employee && (
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
          )}

          {canManagePayroll && (
            <>
              <button
                type="button"
                onClick={() => {
                  setAdjError(null);
                  setAdjForm({
                    employeeId: targetEmployees[0]?.id ?? scopedEmployees[0]?.id ?? '',
                    kind: 'deduction',
                    category: DeductionCategory.Lateness,
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
              <button
                type="button"
                onClick={() => void handleExportCSV()}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <FileSpreadsheet className="w-3.5 h-3.5" />
                {t(lang, 'exportCsv')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Minimalist Payroll List (3–4 Visible Fields per Row) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {payrollRows.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {payrollRows.map((row) => (
              <button
                key={row.employee.id}
                type="button"
                onClick={() => setSelectedPayslipEmpId(row.employee.id)}
                className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <Avatar src={row.employee.avatarUrl} name={row.employee.fullName} size="sm" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                      {row.employee.fullName}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      {companyMap.get(row.employee.primaryCompanyId)} ·{' '}
                      {sectionMap.get(row.employee.sectionId)}
                    </p>
                  </div>
                </div>

                {row.totalDeductions > 0 && (
                  <span className="hidden sm:inline text-xs font-mono tabular-nums text-rose-700 dark:text-rose-400 shrink-0">
                    -{formatAED(row.totalDeductions)}
                  </span>
                )}

                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-sm font-bold font-mono tabular-nums text-indigo-900 dark:text-indigo-300">
                    {formatAED(row.netSalary)}
                  </span>
                  <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

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
            {/* Net Summary Banner */}
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

            {/* Earnings Breakdown */}
            <div className="space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white pb-1.5 border-b border-slate-200 dark:border-slate-800">
                Earnings (AED)
              </p>
              <div className="flex justify-between">
                <span className="text-slate-500">Base Salary</span>
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
              {selectedPayslip.bonuses.map((b) => (
                <div key={b.id} className="flex items-start justify-between gap-2 text-emerald-700 dark:text-emerald-400">
                  <div>
                    <span className="font-semibold block">{b.category}</span>
                    <span className="text-[11px] opacity-80">{b.reason}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="font-mono">+{formatAED(b.amountAED)}</span>
                    {canManagePayroll && (
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

            {/* Itemized Deductions (Auto Lateness + Manual) */}
            <div className="space-y-2.5 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white pb-1.5 border-b border-slate-200 dark:border-slate-800">
                Itemized Deductions (AED)
              </p>
              {selectedPayslip.deductions.length === 0 ? (
                <p className="text-slate-500">No deductions for this month.</p>
              ) : (
                selectedPayslip.deductions.map((d) => (
                  <div
                    key={d.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-start justify-between gap-3"
                  >
                    <div>
                      <p className="font-semibold text-rose-700 dark:text-rose-400">
                        {d.category} · {formatShortDate(d.date)}
                        {d.source === 'auto_lateness' ? ' (Auto Model Tier)' : ''}
                      </p>
                      <p className="text-slate-600 dark:text-slate-400 mt-0.5">{d.reason}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="font-mono font-semibold text-rose-700 dark:text-rose-400">
                        -{formatAED(d.amountAED)}
                      </span>
                      {canManagePayroll && d.source !== 'auto_lateness' && (
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
                ))
              )}
            </div>
          </div>
        )}
      </SlideOverDrawer>

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
                {scopedEmployees.map((emp) => (
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
    </div>
  );
};
