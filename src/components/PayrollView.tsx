import React, { useMemo, useState } from 'react';
import {
  Download,
  FileSpreadsheet,
  MinusCircle,
  Plus,
  Printer,
  Receipt,
  Trash2,
  X,
} from 'lucide-react';
import {
  AdjustmentKind,
  AppSettings,
  DeductionCategory,
  Employee,
  MonthlyPayrollRow,
  PayrollAdjustment,
  UserRole,
} from '../types/hr';
import {
  buildPayrollCSV,
  calculateEmployeePayroll,
  formatAED,
  formatShortDate,
  triggerCSVDownload,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';

interface PayrollViewProps {
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  adjustments: PayrollAdjustment[];
  settings: AppSettings;
  onAddAdjustment: (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => Promise<void>;
  onRemoveAdjustment: (id: string) => Promise<void>;
}

const DEDUCTION_CATEGORIES: DeductionCategory[] = [
  DeductionCategory.LateArrival,
  DeductionCategory.UnpaidLeave,
  DeductionCategory.FinePenalty,
  DeductionCategory.SalaryAdvance,
  DeductionCategory.Other,
];

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
  currentUser,
  activeRole,
  employees,
  adjustments,
  settings,
  onAddAdjustment,
  onRemoveAdjustment,
}) => {
  const canManagePayroll = activeRole === UserRole.Admin || activeRole === UserRole.Management;
  const monthOptions = useMemo(() => getMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0].value);
  const [selectedPayslip, setSelectedPayslip] = useState<MonthlyPayrollRow | null>(null);

  // Add Deduction / Bonus Modal
  const [showAdjModal, setShowAdjModal] = useState(false);
  const [adjError, setAdjError] = useState<string | null>(null);
  const [adjForm, setAdjForm] = useState({
    employeeId: employees[0]?.id ?? '',
    kind: 'deduction' as AdjustmentKind,
    category: DeductionCategory.LateArrival as
      | DeductionCategory
      | 'Performance Bonus'
      | 'Overtime Allowance',
    amountAED: '',
    date: new Date().toISOString().slice(0, 10),
    reason: '',
  });

  const targetEmployees = useMemo(
    () =>
      activeRole === UserRole.Employee
        ? employees.filter((e) => e.id === currentUser.id)
        : employees.filter((e) => e.active),
    [employees, activeRole, currentUser.id]
  );

  const payrollRows = useMemo(
    () => targetEmployees.map((emp) => calculateEmployeePayroll(emp, selectedMonth, adjustments)),
    [targetEmployees, selectedMonth, adjustments]
  );

  const totals = useMemo(() => {
    return payrollRows.reduce(
      (acc, row) => ({
        gross: acc.gross + row.grossSalary,
        bonuses: acc.bonuses + row.totalBonuses,
        deductions: acc.deductions + row.totalDeductions,
        net: acc.net + row.netSalary,
      }),
      { gross: 0, bonuses: 0, deductions: 0, net: 0 }
    );
  }, [payrollRows]);

  const monthAdjustments = useMemo(() => {
    const base = adjustments.filter((a) => a.month === selectedMonth);
    if (activeRole === UserRole.Employee) {
      return base.filter((a) => a.employeeId === currentUser.id);
    }
    return base;
  }, [adjustments, selectedMonth, activeRole, currentUser.id]);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const handleExportCSV = () => {
    const csv = buildPayrollCSV(payrollRows);
    triggerCSVDownload(`masar-payroll-${selectedMonth}.csv`, csv);
  };

  const openAdjustmentModal = (defaultKind: AdjustmentKind, employeeId?: string) => {
    setAdjError(null);
    setAdjForm({
      employeeId: employeeId ?? targetEmployees[0]?.id ?? '',
      kind: defaultKind,
      category:
        defaultKind === 'deduction' ? DeductionCategory.LateArrival : 'Performance Bonus',
      amountAED: '',
      date: new Date().toISOString().slice(0, 10),
      reason: '',
    });
    setShowAdjModal(true);
  };

  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(adjForm.amountAED);
    if (!adjForm.employeeId) {
      setAdjError('Select an employee.');
      return;
    }
    if (Number.isNaN(numericAmount) || numericAmount <= 0) {
      setAdjError('Amount must be a positive number in AED.');
      return;
    }
    if (!adjForm.reason.trim() || adjForm.reason.trim().length < 5) {
      setAdjError('A mandatory reason (at least 5 characters) is required for audit compliance.');
      return;
    }

    await onAddAdjustment({
      employeeId: adjForm.employeeId,
      month: selectedMonth,
      kind: adjForm.kind,
      category: adjForm.category,
      amountAED: numericAmount,
      date: adjForm.date,
      reason: adjForm.reason.trim(),
      createdBy: currentUser.fullName,
      createdByRole: activeRole,
    });
    setShowAdjModal(false);
  };

  const handleDownloadPayslipText = (row: MonthlyPayrollRow) => {
    const lines = [
      `${settings.companyName} — MONTHLY PAYSLIP (${row.month})`,
      `Employee: ${row.employee.fullName} (${row.employee.employeeCode})`,
      `Department: ${row.employee.department} | Title: ${row.employee.jobTitle}`,
      '------------------------------------------------------------',
      `Base Salary:          ${formatAED(row.baseSalary)}`,
      `Housing Allowance:    ${formatAED(row.housingAllowance)}`,
      `Transport Allowance:  ${formatAED(row.transportAllowance)}`,
      `Other Allowance:      ${formatAED(row.otherAllowance)}`,
      `Gross Salary:         ${formatAED(row.grossSalary)}`,
      `Bonuses:              +${formatAED(row.totalBonuses)}`,
      `Total Deductions:     -${formatAED(row.totalDeductions)}`,
      '',
      'ITEMIZED DEDUCTIONS & BONUSES:',
      ...(row.bonuses.length === 0 && row.deductions.length === 0
        ? ['None for this pay period.']
        : [
            ...row.bonuses.map(
              (b) => `+ ${b.category} (${b.date}): ${formatAED(b.amountAED)} — ${b.reason}`
            ),
            ...row.deductions.map(
              (d) => `- ${d.category} (${d.date}): ${formatAED(d.amountAED)} — ${d.reason}`
            ),
          ]),
      '------------------------------------------------------------',
      `NET PAYABLE:          ${formatAED(row.netSalary)}`,
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Payslip_${row.employee.employeeCode}_${row.month}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const monthLabel =
    monthOptions.find((m) => m.value === selectedMonth)?.label ?? selectedMonth;

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            {canManagePayroll ? 'Monthly Payroll & Deductions' : 'My Payslips & Deductions'}
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {canManagePayroll
              ? 'UAE AED payroll register, itemized deductions engine, and WPS-ready CSV export.'
              : 'Review your monthly earnings breakdown, allowances, deductions, and printable payslips.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            aria-label="Select payroll month"
            className="px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg bg-white text-slate-800"
          >
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          {canManagePayroll && (
            <>
              <button
                type="button"
                onClick={() => openAdjustmentModal('deduction')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-4 h-4" />
                Log Deduction / Bonus
              </button>
              <button
                type="button"
                onClick={handleExportCSV}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4" />
                Export CSV
              </button>
            </>
          )}
        </div>
      </div>

      {/* Summary KPI Row */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Gross Salaries</p>
          <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-slate-900">
            {formatAED(totals.gross)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Bonuses & Additions</p>
          <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-emerald-700">
            +{formatAED(totals.bonuses)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Total Deductions</p>
          <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-rose-700">
            -{formatAED(totals.deductions)}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
          <p className="text-xs font-medium text-slate-500">Net Payable ({monthLabel})</p>
          <p className="mt-2 text-xl sm:text-2xl font-bold font-mono tabular-nums text-indigo-800">
            {formatAED(totals.net)}
          </p>
        </div>
      </section>

      {/* Monthly Payroll Register Table (Desktop) & Cards (Mobile) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Payroll Register — {monthLabel}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Gross Salary + Bonuses &minus; Total Deductions = Net Payable (AED)
            </p>
          </div>
        </div>

        {/* Desktop Table */}
        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-medium text-slate-500">
                <th className="py-3 px-4">Employee</th>
                <th className="py-3 px-4 text-right">Base Salary</th>
                <th className="py-3 px-4 text-right">Allowances</th>
                <th className="py-3 px-4 text-right">Gross</th>
                <th className="py-3 px-4 text-right">Bonuses</th>
                <th className="py-3 px-4 text-right">Deductions</th>
                <th className="py-3 px-4 text-right">Net Pay</th>
                <th className="py-3 px-4 text-right">Payslip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {payrollRows.map((row) => (
                <tr key={row.employee.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={row.employee.avatarUrl} name={row.employee.fullName} size="sm" />
                      <div>
                        <div className="font-medium text-slate-900">{row.employee.fullName}</div>
                        <div className="text-xs text-slate-500">
                          {row.employee.employeeCode} &middot; {row.employee.department}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-700">
                    {formatAED(row.baseSalary)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-slate-600">
                    {formatAED(row.totalAllowances)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs font-medium tabular-nums text-slate-900">
                    {formatAED(row.grossSalary)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-emerald-700">
                    {row.totalBonuses > 0 ? `+${formatAED(row.totalBonuses)}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-xs tabular-nums text-rose-700">
                    {row.totalDeductions > 0 ? `-${formatAED(row.totalDeductions)}` : '—'}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono text-sm font-semibold tabular-nums text-indigo-900">
                    {formatAED(row.netSalary)}
                  </td>
                  <td className="py-3.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedPayslip(row)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-indigo-700 cursor-pointer"
                      >
                        <Receipt className="w-3.5 h-3.5" />
                        Payslip
                      </button>
                      {canManagePayroll && (
                        <button
                          type="button"
                          onClick={() => openAdjustmentModal('deduction', row.employee.id)}
                          aria-label={`Add deduction for ${row.employee.fullName}`}
                          className="p-1.5 rounded-lg border border-slate-200 text-rose-600 hover:bg-rose-50 cursor-pointer"
                        >
                          <MinusCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Mobile Cards */}
        <div className="lg:hidden divide-y divide-slate-100">
          {payrollRows.map((row) => (
            <div key={row.employee.id} className="p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar src={row.employee.avatarUrl} name={row.employee.fullName} size="md" />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {row.employee.fullName}
                    </p>
                    <p className="text-xs text-slate-500 truncate">{row.employee.jobTitle}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold font-mono tabular-nums text-indigo-900">
                    {formatAED(row.netSalary)}
                  </p>
                  <p className="text-[11px] text-slate-500">Net Pay</p>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs bg-slate-50 rounded-lg p-2.5 border border-slate-200/70">
                <div>
                  <span className="text-slate-500 block">Gross</span>
                  <span className="font-mono font-medium text-slate-800">
                    {row.grossSalary.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Bonuses</span>
                  <span className="font-mono font-medium text-emerald-700">
                    +{row.totalBonuses.toLocaleString()}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">Deductions</span>
                  <span className="font-mono font-medium text-rose-700">
                    -{row.totalDeductions.toLocaleString()}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedPayslip(row)}
                className="w-full min-h-[40px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-800 hover:bg-slate-50 cursor-pointer"
              >
                <Receipt className="w-3.5 h-3.5" />
                View Itemized Payslip
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Itemized Deductions & Bonuses Audit Log */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200">
          <h3 className="text-base font-semibold text-slate-900">
            Itemized Deductions & Bonuses — {monthLabel}
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Every deduction requires an explicit reason visible on the employee&apos;s payslip.
          </p>
        </div>

        {monthAdjustments.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No deductions or bonuses logged for {monthLabel}.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {monthAdjustments.map((adj) => {
              const emp = empMap.get(adj.employeeId);
              const isDeduction = adj.kind === 'deduction';
              return (
                <div
                  key={adj.id}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <span className="font-semibold text-slate-900">
                        {emp?.fullName ?? 'Employee'}
                      </span>
                      <span className="text-slate-300">&middot;</span>
                      <span
                        className={`text-xs font-semibold ${
                          isDeduction ? 'text-rose-700' : 'text-emerald-700'
                        }`}
                      >
                        {adj.category}
                      </span>
                      <span className="text-slate-300">&middot;</span>
                      <span className="text-xs font-mono text-slate-500">
                        {formatShortDate(adj.date)}
                      </span>
                    </div>
                    <p className="text-sm text-slate-700">{adj.reason}</p>
                    <p className="text-xs text-slate-500">Logged by {adj.createdBy}</p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                    <span
                      className={`font-mono text-sm font-semibold tabular-nums ${
                        isDeduction ? 'text-rose-700' : 'text-emerald-700'
                      }`}
                    >
                      {isDeduction ? '-' : '+'}
                      {formatAED(adj.amountAED)}
                    </span>
                    {canManagePayroll && (
                      <button
                        type="button"
                        onClick={() => onRemoveAdjustment(adj.id)}
                        aria-label={`Remove ${adj.category} for ${emp?.fullName ?? 'employee'}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
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

      {/* Log Deduction / Bonus Modal */}
      {showAdjModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adj-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <h3 id="adj-modal-title" className="text-base font-semibold text-slate-900">
                Log Payroll Deduction or Bonus ({monthLabel})
              </h3>
              <button
                type="button"
                onClick={() => setShowAdjModal(false)}
                aria-label="Close adjustment modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment} className="mt-4 space-y-4">
              {adjError && (
                <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {adjError}
                </p>
              )}

              <div className="inline-flex rounded-lg bg-slate-100 p-0.5 w-full">
                <button
                  type="button"
                  onClick={() =>
                    setAdjForm((p) => ({
                      ...p,
                      kind: 'deduction',
                      category: DeductionCategory.LateArrival,
                    }))
                  }
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    adjForm.kind === 'deduction'
                      ? 'bg-white text-rose-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Salary Deduction
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
                  className={`flex-1 py-2 text-xs font-semibold rounded-md transition-colors cursor-pointer ${
                    adjForm.kind === 'bonus'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Bonus / Addition
                </button>
              </div>

              <div>
                <label htmlFor="adj-emp" className="block text-xs font-medium text-slate-700 mb-1">
                  Employee
                </label>
                <select
                  id="adj-emp"
                  value={adjForm.employeeId}
                  onChange={(e) => setAdjForm((p) => ({ ...p, employeeId: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {targetEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor="adj-cat" className="block text-xs font-medium text-slate-700 mb-1">
                    Category
                  </label>
                  <select
                    id="adj-cat"
                    value={adjForm.category}
                    onChange={(e) =>
                      setAdjForm((p) => ({
                        ...p,
                        category: e.target.value as
                          | DeductionCategory
                          | 'Performance Bonus'
                          | 'Overtime Allowance',
                      }))
                    }
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
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
                        <option value="Overtime Allowance">Overtime Allowance</option>
                      </>
                    )}
                  </select>
                </div>

                <div>
                  <label htmlFor="adj-amt" className="block text-xs font-medium text-slate-700 mb-1">
                    Amount (AED)
                  </label>
                  <input
                    id="adj-amt"
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={adjForm.amountAED}
                    onChange={(e) => setAdjForm((p) => ({ ...p, amountAED: e.target.value }))}
                    placeholder="e.g. 250"
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-200 rounded-lg"
                  />
                </div>

                <div>
                  <label htmlFor="adj-date" className="block text-xs font-medium text-slate-700 mb-1">
                    Effective Date
                  </label>
                  <input
                    id="adj-date"
                    type="date"
                    required
                    value={adjForm.date}
                    onChange={(e) => setAdjForm((p) => ({ ...p, date: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="adj-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Mandatory Reason / Notes (shown on payslip)
                </label>
                <textarea
                  id="adj-reason"
                  rows={3}
                  required
                  value={adjForm.reason}
                  onChange={(e) => setAdjForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Describe the exact reason, date, or reference number..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAdjModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium cursor-pointer ${
                    adjForm.kind === 'deduction'
                      ? 'bg-rose-600 hover:bg-rose-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  Save {adjForm.kind === 'deduction' ? 'Deduction' : 'Bonus'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable / Downloadable Monthly Payslip Modal */}
      {selectedPayslip && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="payslip-title"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 bg-white shadow-xl my-8 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 id="payslip-title" className="text-sm font-semibold text-slate-900">
                Monthly Payslip — {monthLabel}
              </h3>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleDownloadPayslipText(selectedPayslip)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800 cursor-pointer"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Print PDF
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedPayslip(null)}
                  aria-label="Close payslip modal"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div id="printable-payslip" className="p-6 space-y-6">
              {/* Company & Employee Header */}
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
                <div>
                  <p className="text-lg font-bold text-indigo-950 font-display">
                    {settings.companyName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Salary Statement &middot; Pay Period: {monthLabel}
                  </p>
                </div>
                <div className="text-left sm:text-right text-xs text-slate-600 space-y-0.5">
                  <p className="text-sm font-semibold text-slate-900">
                    {selectedPayslip.employee.fullName}
                  </p>
                  <p>
                    {selectedPayslip.employee.employeeCode} &middot;{' '}
                    {selectedPayslip.employee.jobTitle}
                  </p>
                  <p>{selectedPayslip.employee.department}</p>
                </div>
              </div>

              {/* Earnings vs Deductions */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
                    Earnings (AED)
                  </h4>
                  <dl className="mt-2.5 space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Base Salary</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {formatAED(selectedPayslip.baseSalary)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Housing Allowance</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {formatAED(selectedPayslip.housingAllowance)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Transport Allowance</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {formatAED(selectedPayslip.transportAllowance)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-slate-600">Other Allowance</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {formatAED(selectedPayslip.otherAllowance)}
                      </dd>
                    </div>
                    {selectedPayslip.bonuses.map((b) => (
                      <div key={b.id} className="flex justify-between text-emerald-700">
                        <dt className="pr-2">
                          <span className="font-medium block">{b.category}</span>
                          <span className="text-[11px] text-emerald-600">{b.reason}</span>
                        </dt>
                        <dd className="font-mono tabular-nums whitespace-nowrap">
                          +{formatAED(b.amountAED)}
                        </dd>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-semibold">
                      <dt className="text-slate-900">Total Earnings</dt>
                      <dd className="font-mono tabular-nums text-slate-900">
                        {formatAED(selectedPayslip.grossSalary + selectedPayslip.totalBonuses)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200">
                    Deductions (AED)
                  </h4>
                  {selectedPayslip.deductions.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500">
                      No deductions applied for this month.
                    </p>
                  ) : (
                    <dl className="mt-2.5 space-y-2.5 text-sm">
                      {selectedPayslip.deductions.map((d) => (
                        <div key={d.id} className="flex justify-between gap-3">
                          <dt>
                            <span className="font-medium text-rose-800 block">
                              {d.category} ({formatShortDate(d.date)})
                            </span>
                            <span className="text-xs text-slate-600">{d.reason}</span>
                          </dt>
                          <dd className="font-mono tabular-nums text-rose-700 whitespace-nowrap">
                            -{formatAED(d.amountAED)}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="mt-4 pt-2 border-t border-slate-200 flex justify-between text-sm font-semibold">
                    <span className="text-slate-900">Total Deductions</span>
                    <span className="font-mono tabular-nums text-rose-700">
                      -{formatAED(selectedPayslip.totalDeductions)}
                    </span>
                  </div>
                </div>
              </div>

              {/* Net Payable Banner */}
              <div className="rounded-xl bg-indigo-50/70 border border-indigo-200 p-4 flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-indigo-800">Net Salary Payable (WPS Transfer)</p>
                  <p className="text-xs text-indigo-700/80 mt-0.5">
                    Gross {formatAED(selectedPayslip.grossSalary)} + Bonuses{' '}
                    {formatAED(selectedPayslip.totalBonuses)} &minus; Deductions{' '}
                    {formatAED(selectedPayslip.totalDeductions)}
                  </p>
                </div>
                <p className="text-xl sm:text-2xl font-bold font-mono tabular-nums text-indigo-950">
                  {formatAED(selectedPayslip.netSalary)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
