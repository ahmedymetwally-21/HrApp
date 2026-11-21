import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  CheckCircle2,
  Clock,
  Edit3,
  Infinity as InfinityIcon,
  Layers,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  StopCircle,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import {
  getDeductionApprovalStatusLabel,
  getDeductionBucketLabel,
  getDeductionTriggerLabel,
  getDeductionWorkflowChainLabel,
  getEmployeeTypeLabel,
  getPayrollEntryTypeLabel,
  t,
} from '../i18n/translations';
import {
  Company,
  DeductionApprovalRequest,
  DeductionApprovalStatus,
  DeductionApprovalTrigger,
  DeductionTargetBucket,
  DeductionWorkflowConfig,
  Employee,
  Language,
  PayrollCategoryItem,
  PayrollEntry,
  PayrollEntryType,
  UserRole,
} from '../types/hr';
import {
  addMonthsToYYYYMM,
  canActOnDeductionApproval,
  computeTemporaryEndMonth,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  formatAED,
  formatShortDate,
  getEffectiveDeductionStatus,
  inferDefaultEmployeeType,
  isPayrollEligible,
  isPayrollEntryActiveInMonth,
  resolveEmployeeDeductionWorkflow,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';

interface EarningsDeductionsViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  companies: Company[];
  scopedEmployees: Employee[];
  categories: PayrollCategoryItem[];
  entries: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  deductionWorkflowConfig?: DeductionWorkflowConfig;
  onCreateEntry: (input: {
    employeeId: string;
    companyId: string;
    type: PayrollEntryType;
    categoryId: string;
    categoryName: string;
    amountAED: number;
    isPermanent: boolean;
    effectiveFrom: string;
    durationMonths: number | null;
    targetBucket?: DeductionTargetBucket | null;
    reason: string;
    createdBy: string;
    createdByRole: UserRole;
  }) => Promise<void>;
  onEditPermanentEntry: (params: {
    id: string;
    effectiveFromMonth: string;
    patch: {
      categoryId?: string;
      categoryName?: string;
      amountAED?: number;
      reason?: string;
    };
  }) => Promise<void>;
  onStopPermanentEntry: (params: { id: string; stopFromMonth: string }) => Promise<void>;
  onDeleteEntry: (id: string) => Promise<void>;
  onCreateDeductionApproval?: (input: {
    employeeId: string;
    triggerType: DeductionApprovalTrigger;
    month: string;
    date: string;
    amountAED: number;
    targetBucket: DeductionTargetBucket;
    reason: string;
  }) => Promise<void>;
  onManagerDecideDeduction?: (
    id: string,
    decision: 'approved' | 'rejected',
    note: string
  ) => Promise<void>;
  onHrDecideDeduction?: (
    id: string,
    decision: 'approved' | 'waived',
    note: string
  ) => Promise<void>;
}

const ENTRY_TYPES: PayrollEntryType[] = [
  'earning_in_payroll',
  'earning_off_cycle',
  'deduction_in_payroll',
  'deduction_off_cycle',
];

const DEDUCTION_BUCKETS: DeductionTargetBucket[] = [
  'additional_in_payroll',
  'additional_off_cycle',
  'main_salary',
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getEntryTypeBadgeClass(type: PayrollEntryType): string {
  if (type === 'earning_in_payroll') {
    return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  if (type === 'earning_off_cycle') {
    return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  }
  if (type === 'deduction_in_payroll') {
    return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
  return 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
}

function getApprovalStatusBadgeClass(status: DeductionApprovalStatus): string {
  if (status === 'approved') {
    return 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800';
  }
  if (status === 'waived') {
    return 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700';
  }
  if (status === 'escalated_to_hr') {
    return 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800';
  }
  if (status === 'pending_hr_decision') {
    return 'bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800';
  }
  if (status === 'pending_hr_approval' || status === 'pending_main_manager') {
    return 'bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800';
  }
  return 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800';
}

export const EarningsDeductionsView: React.FC<EarningsDeductionsViewProps> = ({
  lang,
  currentUser,
  activeRole,
  companies,
  scopedEmployees,
  categories,
  entries,
  deductionApprovals = [],
  deductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  onCreateEntry,
  onEditPermanentEntry,
  onStopPermanentEntry,
  onDeleteEntry,
  onCreateDeductionApproval,
  onManagerDecideDeduction,
  onHrDecideDeduction,
}) => {
  const canAccessLedger =
    activeRole === UserRole.MainManager ||
    activeRole === UserRole.HRAdmin ||
    activeRole === UserRole.Accounting;
  const isSectionManager = activeRole === UserRole.SectionManager;
  const isAuthorized = canAccessLedger || isSectionManager;
  const canLogWorkflowDeduction =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Earnings &amp; Deductions management is restricted to Main Manager, HR Admin, Accounting,
          and Section Managers (for deduction approvals).
        </p>
      </div>
    );
  }

  const currentMonth = useMemo(() => getCurrentMonthKey(), []);
  const nextMonth = useMemo(() => addMonthsToYYYYMM(currentMonth, 1), [currentMonth]);

  const [activeTab, setActiveTab] = useState<'entries' | 'approvals'>(
    canAccessLedger ? 'entries' : 'approvals'
  );
  const [approvalStatusFilter, setApprovalStatusFilter] = useState<
    'all' | 'action_needed' | 'pending' | 'approved' | 'waived'
  >('all');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);

  // Log Off-Day / Latency Deduction Modal
  const [showLogApprovalModal, setShowLogApprovalModal] = useState(false);
  const [logApprovalError, setLogApprovalError] = useState<string | null>(null);
  const [logApprovalForm, setLogApprovalForm] = useState({
    employeeId: '',
    triggerType: 'off_day' as DeductionApprovalTrigger,
    month: currentMonth,
    incidentDate: new Date().toISOString().slice(0, 10),
    amountAED: '',
    targetBucket: 'additional_in_payroll' as DeductionTargetBucket,
    reason: '',
  });

  const [monthFilter, setMonthFilter] = useState<string>(currentMonth);
  const [showAllMonths, setShowAllMonths] = useState<boolean>(false);
  const [typeFilter, setTypeFilter] = useState<'all' | PayrollEntryType>('all');
  const [durationFilter, setDurationFilter] = useState<'all' | 'permanent' | 'temporary'>('all');
  const [search, setSearch] = useState('');

  // Create Entry Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const eligibleEmployees = useMemo(
    () => scopedEmployees.filter((e) => e.active && isPayrollEligible(e)),
    [scopedEmployees]
  );

  const [createForm, setCreateForm] = useState<{
    employeeId: string;
    type: PayrollEntryType;
    categoryId: string;
    amountAED: string;
    isPermanent: boolean;
    effectiveFrom: string;
    durationMonths: number;
    targetBucket: DeductionTargetBucket;
    reason: string;
  }>({
    employeeId: eligibleEmployees[0]?.id ?? '',
    type: 'earning_in_payroll',
    categoryId: '',
    amountAED: '',
    isPermanent: false,
    effectiveFrom: currentMonth,
    durationMonths: 1,
    targetBucket: 'additional_in_payroll',
    reason: '',
  });

  // Edit Permanent Modal (Historical Preservation)
  const [editPermTarget, setEditPermTarget] = useState<PayrollEntry | null>(null);
  const [editPermEffectiveFrom, setEditPermEffectiveFrom] = useState(nextMonth);
  const [editPermCategoryId, setEditPermCategoryId] = useState('');
  const [editPermAmount, setEditPermAmount] = useState('');
  const [editPermReason, setEditPermReason] = useState('');
  const [editPermError, setEditPermError] = useState<string | null>(null);

  // Stop Permanent Modal (Historical Preservation)
  const [stopPermTarget, setStopPermTarget] = useState<PayrollEntry | null>(null);
  const [stopPermFromMonth, setStopPermFromMonth] = useState(nextMonth);

  const employeeMap = useMemo(
    () => new Map(scopedEmployees.map((e) => [e.id, e])),
    [scopedEmployees]
  );
  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);

  const activeCategoriesForCreate = useMemo(
    () => categories.filter((c) => c.type === createForm.type && c.active),
    [categories, createForm.type]
  );

  const openCreateModal = (presetType: PayrollEntryType = 'earning_in_payroll') => {
    const firstCat = categories.find((c) => c.type === presetType && c.active);
    setFormError(null);
    setCreateForm({
      employeeId: eligibleEmployees[0]?.id ?? '',
      type: presetType,
      categoryId: firstCat?.id ?? '',
      amountAED: '',
      isPermanent: false,
      effectiveFrom: monthFilter || currentMonth,
      durationMonths: 1,
      targetBucket:
        presetType === 'deduction_off_cycle' ? 'additional_off_cycle' : 'additional_in_payroll',
      reason: '',
    });
    setShowCreateModal(true);
  };

  const handleTypeChange = (nextType: PayrollEntryType) => {
    const firstCat = categories.find((c) => c.type === nextType && c.active);
    const isEarning = nextType === 'earning_in_payroll' || nextType === 'earning_off_cycle';
    setCreateForm((prev) => ({
      ...prev,
      type: nextType,
      categoryId: firstCat?.id ?? '',
      isPermanent: isEarning ? prev.isPermanent : false,
      targetBucket:
        nextType === 'deduction_off_cycle'
          ? 'additional_off_cycle'
          : nextType === 'deduction_in_payroll'
            ? 'additional_in_payroll'
            : prev.targetBucket,
    }));
  };

  const handleSubmitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = eligibleEmployees.find((x) => x.id === createForm.employeeId);
    if (!emp) {
      setFormError('Select an eligible employee.');
      return;
    }
    const cat = categories.find((c) => c.id === createForm.categoryId);
    if (!cat) {
      setFormError('Select an active category (manage categories in Settings).');
      return;
    }
    const amt = Number(createForm.amountAED);
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError('Enter a valid positive amount in AED.');
      return;
    }
    if (!createForm.effectiveFrom) {
      setFormError('Select a starting effective month.');
      return;
    }
    const isEarning =
      createForm.type === 'earning_in_payroll' || createForm.type === 'earning_off_cycle';

    setSaving(true);
    try {
      await onCreateEntry({
        employeeId: emp.id,
        companyId: emp.primaryCompanyId,
        type: createForm.type,
        categoryId: cat.id,
        categoryName: cat.name,
        amountAED: amt,
        isPermanent: isEarning && createForm.isPermanent,
        effectiveFrom: createForm.effectiveFrom,
        durationMonths: isEarning && createForm.isPermanent ? null : Math.max(1, createForm.durationMonths),
        targetBucket: isEarning ? null : createForm.targetBucket,
        reason: createForm.reason.trim() || cat.name,
        createdBy: currentUser.fullName,
        createdByRole: activeRole,
      });
      setShowCreateModal(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const openEditPermanent = (entry: PayrollEntry) => {
    setEditPermTarget(entry);
    setEditPermEffectiveFrom(nextMonth > entry.effectiveFrom ? nextMonth : currentMonth);
    setEditPermCategoryId(entry.categoryId);
    setEditPermAmount(String(entry.amountAED));
    setEditPermReason(entry.reason);
    setEditPermError(null);
  };

  const handleSubmitEditPermanent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editPermTarget) return;
    const amt = Number(editPermAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      setEditPermError('Enter a valid positive amount in AED.');
      return;
    }
    const cat = categories.find((c) => c.id === editPermCategoryId);
    setSaving(true);
    try {
      await onEditPermanentEntry({
        id: editPermTarget.id,
        effectiveFromMonth: editPermEffectiveFrom,
        patch: {
          categoryId: cat?.id ?? editPermTarget.categoryId,
          categoryName: cat?.name ?? editPermTarget.categoryName,
          amountAED: amt,
          reason: editPermReason.trim() || editPermTarget.reason,
        },
      });
      setEditPermTarget(null);
    } catch (err) {
      setEditPermError(err instanceof Error ? err.message : 'Unable to update permanent earning.');
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitStopPermanent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stopPermTarget) return;
    setSaving(true);
    try {
      await onStopPermanentEntry({
        id: stopPermTarget.id,
        stopFromMonth: stopPermFromMonth,
      });
      setStopPermTarget(null);
    } finally {
      setSaving(false);
    }
  };

  // Filtered entries
  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (!showAllMonths && !isPayrollEntryActiveInMonth(entry, monthFilter)) return false;
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;
      if (durationFilter === 'permanent' && !entry.isPermanent) return false;
      if (durationFilter === 'temporary' && entry.isPermanent) return false;
      if (q) {
        const emp = employeeMap.get(entry.employeeId);
        const hay = `${emp?.fullName ?? ''} ${emp?.employeeCode ?? ''} ${entry.categoryName} ${entry.reason}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, showAllMonths, monthFilter, typeFilter, durationFilter, search, employeeMap]);

  // Monthly KPI totals across the 4 types (for selected month)
  const kpis = useMemo(() => {
    const activeForMonth = entries.filter((e) => isPayrollEntryActiveInMonth(e, monthFilter));
    return {
      earningInPayroll: activeForMonth
        .filter((e) => e.type === 'earning_in_payroll')
        .reduce((s, e) => s + e.amountAED, 0),
      earningOffCycle: activeForMonth
        .filter((e) => e.type === 'earning_off_cycle')
        .reduce((s, e) => s + e.amountAED, 0),
      deductionInPayroll: activeForMonth
        .filter((e) => e.type === 'deduction_in_payroll')
        .reduce((s, e) => s + e.amountAED, 0),
      deductionOffCycle: activeForMonth
        .filter((e) => e.type === 'deduction_off_cycle')
        .reduce((s, e) => s + e.amountAED, 0),
    };
  }, [entries, monthFilter]);

  const isCreateEarning =
    createForm.type === 'earning_in_payroll' || createForm.type === 'earning_off_cycle';
  const computedEndMonth = computeTemporaryEndMonth(
    createForm.effectiveFrom || currentMonth,
    createForm.durationMonths
  );

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">
            {t(lang, 'earningsDeductionsTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {t(lang, 'earningsDeductionsSubtitle')}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canAccessLedger && (
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab('entries')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  activeTab === 'entries'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'entriesLedgerTab')}
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('approvals')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                  activeTab === 'approvals'
                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'deductionApprovalsTab')}
                {(() => {
                  const actionableCount = deductionApprovals.filter((req) => {
                    if (!employeeMap.has(req.employeeId)) return false;
                    const perm = canActOnDeductionApproval({
                      request: req,
                      actorRole: activeRole,
                      actorManagedSectionIds: currentUser.managedSectionIds,
                    });
                    return perm.canManagerAct || perm.canHrAct;
                  }).length;
                  return actionableCount > 0 ? (
                    <span className="px-1.5 py-0.5 rounded-md bg-rose-600 text-white text-[10px] font-mono leading-none">
                      {actionableCount}
                    </span>
                  ) : null;
                })()}
              </button>
            </div>
          )}

          {activeTab === 'entries' && canAccessLedger && (
            <button
              type="button"
              onClick={() => openCreateModal('earning_in_payroll')}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'addEntry')}
            </button>
          )}

          {activeTab === 'approvals' && canLogWorkflowDeduction && onCreateDeductionApproval && (
            <button
              type="button"
              onClick={() => {
                setLogApprovalError(null);
                setLogApprovalForm({
                  employeeId: eligibleEmployees[0]?.id ?? '',
                  triggerType: 'off_day',
                  month: currentMonth,
                  incidentDate: new Date().toISOString().slice(0, 10),
                  amountAED: '',
                  targetBucket: 'additional_in_payroll',
                  reason: '',
                });
                setShowLogApprovalModal(true);
              }}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'logWorkflowDeduction')}
            </button>
          )}
        </div>
      </div>

      {/* =====================================================================
          TAB 2: DEDUCTION APPROVALS & ESCALATION QUEUE (OFF-DAYS & LATENCY)
         ===================================================================== */}
      {activeTab === 'approvals' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'all', label: 'All' },
                  { id: 'action_needed', label: 'Action Needed' },
                  { id: 'pending', label: 'In Progress' },
                  { id: 'approved', label: 'Approved' },
                  { id: 'waived', label: 'Waived' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setApprovalStatusFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    approvalStatusFilter === tab.id
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {t(lang, 'autoEscalationHours')}:{' '}
              <strong className="font-mono text-slate-700 dark:text-slate-200">
                {deductionWorkflowConfig.autoEscalationHours}h
              </strong>
            </p>
          </div>

          {(() => {
            const scopedApprovalList = deductionApprovals
              .filter((req) => employeeMap.has(req.employeeId))
              .map((req) => {
                const emp = employeeMap.get(req.employeeId)!;
                const effectiveStatus = getEffectiveDeductionStatus(req);
                const perm = canActOnDeductionApproval({
                  request: req,
                  actorRole: activeRole,
                  actorManagedSectionIds: currentUser.managedSectionIds,
                });
                const actorStage: 'manager' | 'hr_final' | null = perm.canManagerAct
                  ? 'manager'
                  : perm.canHrAct
                    ? 'hr_final'
                    : null;
                return { req, emp, effectiveStatus, actorStage };
              })
              .filter((item) => {
                if (approvalStatusFilter === 'action_needed') return item.actorStage !== null;
                if (approvalStatusFilter === 'pending') {
                  return item.effectiveStatus !== 'approved' && item.effectiveStatus !== 'waived';
                }
                if (approvalStatusFilter === 'approved') return item.effectiveStatus === 'approved';
                if (approvalStatusFilter === 'waived') return item.effectiveStatus === 'waived';
                return true;
              })
              .sort((a, b) => b.req.createdAt.localeCompare(a.req.createdAt));

            if (scopedApprovalList.length === 0) {
              return (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
                  {t(lang, 'noPendingApprovals')}
                </div>
              );
            }

            return (
              <div className="space-y-3">
                {scopedApprovalList.map(({ req, emp, effectiveStatus, actorStage }) => {
                  const comp = companyMap.get(req.companyId);
                  const isFinalized =
                    effectiveStatus === 'approved' || effectiveStatus === 'waived';
                  const noteVal = decisionNotes[req.id] ?? '';

                  return (
                    <div
                      key={req.id}
                      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-3"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <Avatar src={emp.avatarUrl} name={emp.fullName} size="sm" />
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">
                                {emp.fullName}
                              </span>
                              <span className="text-[11px] font-mono text-slate-400">
                                {emp.employeeCode} · {comp?.code ?? ''}
                              </span>
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                {getEmployeeTypeLabel(
                                  lang,
                                  emp.employeeType ?? inferDefaultEmployeeType(emp)
                                )}
                              </span>
                              <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">
                                {getDeductionTriggerLabel(lang, req.triggerType)}
                              </span>
                              <span
                                className={`text-[11px] font-semibold px-2 py-0.5 rounded-lg border ${getApprovalStatusBadgeClass(
                                  effectiveStatus
                                )}`}
                              >
                                {getDeductionApprovalStatusLabel(lang, effectiveStatus)}
                              </span>
                            </div>

                            <p className="text-xs text-slate-700 dark:text-slate-300">
                              {req.reason}
                            </p>

                            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
                              <span>
                                Month: <strong className="font-mono">{req.month}</strong>
                              </span>
                              <span>Incident: {formatShortDate(req.date)}</span>
                              <span>
                                Target: <strong>{getDeductionBucketLabel(lang, req.targetBucket)}</strong>
                              </span>
                              <span>
                                Chain:{' '}
                                <strong>{getDeductionWorkflowChainLabel(lang, req.workflowChain)}</strong>
                              </span>
                            </div>

                            {!isFinalized && (
                              <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5 shrink-0" />
                                {t(lang, 'notAppliedUntilHr')}
                                {effectiveStatus === 'escalated_to_hr' && (
                                  <span className="ms-1 text-rose-600 dark:text-rose-400 font-semibold">
                                    · Auto-escalated past deadline (
                                    {formatShortDate(req.escalationDeadline.slice(0, 10))})
                                  </span>
                                )}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="text-start lg:text-end shrink-0">
                          <p className="text-base font-bold font-mono text-rose-700 dark:text-rose-400">
                            -{formatAED(req.amountAED)}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            Logged by {req.createdBy}
                          </p>
                        </div>
                      </div>

                      {/* Manager / HR Audit Notes */}
                      {(req.managerDecision || req.hrDecision) && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
                          {req.managerDecision && (
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5">
                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                Section Manager ({req.managerActorName ?? 'Manager'}):{' '}
                                <span
                                  className={
                                    req.managerDecision === 'approved'
                                      ? 'text-indigo-700 dark:text-indigo-300'
                                      : 'text-amber-700 dark:text-amber-300'
                                  }
                                >
                                  {req.managerDecision === 'approved'
                                    ? 'Approved → Sent to HR'
                                    : 'Recommended Waive → Sent to HR'}
                                </span>
                              </p>
                              {req.managerNote && (
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  &ldquo;{req.managerNote}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                          {req.hrDecision && (
                            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5">
                              <p className="text-[11px] font-semibold text-slate-700 dark:text-slate-200">
                                Final Decision ({req.hrActorName ?? 'HR'}):{' '}
                                <span
                                  className={
                                    req.hrDecision === 'approved'
                                      ? 'text-emerald-700 dark:text-emerald-400'
                                      : 'text-slate-600 dark:text-slate-400'
                                  }
                                >
                                  {req.hrDecision === 'approved'
                                    ? 'Approved (Applied to Payroll)'
                                    : 'Waived (No Deduction)'}
                                </span>
                              </p>
                              {req.hrNote && (
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                  &ldquo;{req.hrNote}&rdquo;
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Action Controls for Authorized Reviewer */}
                      {actorStage && (
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center gap-2.5">
                          <input
                            type="text"
                            value={noteVal}
                            onChange={(e) =>
                              setDecisionNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            placeholder={t(lang, 'decisionNotePlaceholder')}
                            aria-label="Decision note"
                            className={`${INPUT_CLASS} flex-1 text-xs`}
                          />
                          <div className="flex items-center gap-2 shrink-0">
                            {actorStage === 'manager' && onManagerDecideDeduction && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyApprovalId === req.id}
                                  onClick={async () => {
                                    setBusyApprovalId(req.id);
                                    try {
                                      await onManagerDecideDeduction(req.id, 'approved', noteVal);
                                      setDecisionNotes((p) => ({ ...p, [req.id]: '' }));
                                    } finally {
                                      setBusyApprovalId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  {t(lang, 'managerApproveToHr')}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyApprovalId === req.id}
                                  onClick={async () => {
                                    setBusyApprovalId(req.id);
                                    try {
                                      await onManagerDecideDeduction(req.id, 'rejected', noteVal);
                                      setDecisionNotes((p) => ({ ...p, [req.id]: '' }));
                                    } finally {
                                      setBusyApprovalId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-300 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <AlertTriangle className="w-3.5 h-3.5" />
                                  {t(lang, 'managerRejectToHr')}
                                </button>
                              </>
                            )}
                            {actorStage === 'hr_final' && onHrDecideDeduction && (
                              <>
                                <button
                                  type="button"
                                  disabled={busyApprovalId === req.id}
                                  onClick={async () => {
                                    setBusyApprovalId(req.id);
                                    try {
                                      await onHrDecideDeduction(req.id, 'approved', noteVal);
                                      setDecisionNotes((p) => ({ ...p, [req.id]: '' }));
                                    } finally {
                                      setBusyApprovalId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  {t(lang, 'hrFinalApprove')}
                                </button>
                                <button
                                  type="button"
                                  disabled={busyApprovalId === req.id}
                                  onClick={async () => {
                                    setBusyApprovalId(req.id);
                                    try {
                                      await onHrDecideDeduction(req.id, 'waived', noteVal);
                                      setDecisionNotes((p) => ({ ...p, [req.id]: '' }));
                                    } finally {
                                      setBusyApprovalId(null);
                                    }
                                  }}
                                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 text-xs font-semibold cursor-pointer disabled:opacity-50"
                                >
                                  <XCircle className="w-3.5 h-3.5" />
                                  {t(lang, 'hrFinalWaive')}
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}

      {/* 4-Type Summary KPI Strip (Entries Ledger Tab Only) */}
      {activeTab === 'entries' && canAccessLedger && (
      <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeEarningInPayroll')}
            </span>
            <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2 text-lg font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatAED(kpis.earningInPayroll)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Included in WPS Variable · {monthFilter}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeEarningOffCycle')}
            </span>
            <Layers className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="mt-2 text-lg font-bold font-mono tabular-nums text-indigo-700 dark:text-indigo-400">
            +{formatAED(kpis.earningOffCycle)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Outside WPS exports · {monthFilter}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeDeductionInPayroll')}
            </span>
            <ArrowDownCircle className="w-4 h-4 text-rose-600" />
          </div>
          <p className="mt-2 text-lg font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
            -{formatAED(kpis.deductionInPayroll)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Basic stays intact in WPS · {monthFilter}</p>
        </div>

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeDeductionOffCycle')}
            </span>
            <ArrowDownCircle className="w-4 h-4 text-amber-600" />
          </div>
          <p className="mt-2 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
            -{formatAED(kpis.deductionOffCycle)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">Off-Cycle bucket target · {monthFilter}</p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(lang, 'search')}
            aria-label="Search earnings and deductions"
            className="w-full ps-9 pe-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
          />
        </div>

        <input
          type="month"
          value={monthFilter}
          onChange={(e) => {
            setMonthFilter(e.target.value);
            setShowAllMonths(false);
          }}
          aria-label="Filter by month"
          className="px-3 py-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        />

        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showAllMonths}
            onChange={(e) => setShowAllMonths(e.target.checked)}
            className="accent-indigo-600"
          />
          All History
        </label>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | PayrollEntryType)}
          aria-label="Filter by entry type"
          className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">{t(lang, 'allTypes')}</option>
          {ENTRY_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {getPayrollEntryTypeLabel(lang, tp)}
            </option>
          ))}
        </select>

        <select
          value={durationFilter}
          onChange={(e) =>
            setDurationFilter(e.target.value as 'all' | 'permanent' | 'temporary')
          }
          aria-label="Filter by duration"
          className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">{t(lang, 'allDurations')}</option>
          <option value="permanent">{t(lang, 'permanentDuration')}</option>
          <option value="temporary">{t(lang, 'temporaryDuration')}</option>
        </select>
      </div>

      {/* Entries List */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredEntries.map((entry) => {
              const emp = employeeMap.get(entry.employeeId);
              const comp = companyMap.get(entry.companyId);
              const isEarning =
                entry.type === 'earning_in_payroll' || entry.type === 'earning_off_cycle';
              const isStoppedPermanent = entry.isPermanent && Boolean(entry.effectiveTo);

              return (
                <div
                  key={entry.id}
                  className="px-4 sm:px-5 py-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar
                      src={emp?.avatarUrl}
                      name={emp?.fullName ?? 'Employee'}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {emp?.fullName ?? entry.employeeId}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {emp?.employeeCode} · {comp?.code ?? ''}
                        </span>
                        <span
                          className={`text-[11px] font-semibold px-2 py-0.5 rounded-md border ${getEntryTypeBadgeClass(
                            entry.type
                          )}`}
                        >
                          {getPayrollEntryTypeLabel(lang, entry.type)}
                        </span>
                        {entry.isPermanent ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            <InfinityIcon className="w-3 h-3 text-indigo-600" />
                            {isStoppedPermanent
                              ? `${entry.effectiveFrom} → ${entry.effectiveTo} (Historical)`
                              : `${t(lang, 'permanentDuration')} (${entry.effectiveFrom}+)`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            <CalendarRange className="w-3 h-3" />
                            {entry.effectiveFrom} → {entry.effectiveTo} ({entry.durationMonths ?? 1}{' '}
                            mo)
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                        <span className="font-semibold text-slate-800 dark:text-slate-100">
                          {entry.categoryName}
                        </span>
                        {entry.targetBucket && (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-rose-50/70 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200/70 dark:border-rose-900">
                            {t(lang, 'deductFromBucket')}:{' '}
                            {getDeductionBucketLabel(lang, entry.targetBucket)}
                          </span>
                        )}
                        {entry.reason && (
                          <span className="text-slate-500 dark:text-slate-400 truncate">
                            — {entry.reason}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-2.5 shrink-0">
                    <span
                      className={`text-sm font-bold font-mono tabular-nums ${
                        isEarning
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : 'text-rose-700 dark:text-rose-400'
                      }`}
                    >
                      {isEarning ? '+' : '-'}
                      {formatAED(entry.amountAED)}
                    </span>

                    {entry.isPermanent && !isStoppedPermanent && (
                      <>
                        <button
                          type="button"
                          onClick={() => openEditPermanent(entry)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label={`Edit permanent ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                        >
                          <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                          {t(lang, 'edit')}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setStopPermTarget(entry);
                            setStopPermFromMonth(
                              nextMonth > entry.effectiveFrom ? nextMonth : currentMonth
                            );
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-950/30 text-xs font-medium text-amber-800 dark:text-amber-300 hover:bg-amber-100 cursor-pointer"
                          aria-label={`Stop permanent ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                        >
                          <StopCircle className="w-3.5 h-3.5" />
                          {t(lang, 'stopPermanent')}
                        </button>
                      </>
                    )}

                    {!entry.isPermanent && (
                      <button
                        type="button"
                        onClick={() => void onDeleteEntry(entry.id)}
                        aria-label={`Delete ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
      </>
      )}

      {/* LOG OFF-DAY / LATENCY WORKFLOW DEDUCTION MODAL */}
      {showLogApprovalModal && canLogWorkflowDeduction && onCreateDeductionApproval && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'logWorkflowDeduction')}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'logWorkflowDeduction')}
              </h2>
              <button
                type="button"
                onClick={() => setShowLogApprovalModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const amt = Number(logApprovalForm.amountAED);
                if (!logApprovalForm.employeeId) {
                  setLogApprovalError('Select an employee.');
                  return;
                }
                if (Number.isNaN(amt) || amt <= 0) {
                  setLogApprovalError('Enter a valid positive amount in AED.');
                  return;
                }
                if (logApprovalForm.reason.trim().length < 4) {
                  setLogApprovalError('Provide a clear reason for the deduction request.');
                  return;
                }
                setSaving(true);
                try {
                  await onCreateDeductionApproval({
                    employeeId: logApprovalForm.employeeId,
                    triggerType: logApprovalForm.triggerType,
                    month: logApprovalForm.month,
                    date: logApprovalForm.incidentDate,
                    amountAED: amt,
                    targetBucket: logApprovalForm.targetBucket,
                    reason: logApprovalForm.reason.trim(),
                  });
                  setShowLogApprovalModal(false);
                } finally {
                  setSaving(false);
                }
              }}
              className="mt-4 space-y-3.5"
            >
              {logApprovalError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {logApprovalError}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Employee
                </label>
                <select
                  value={logApprovalForm.employeeId}
                  onChange={(e) =>
                    setLogApprovalForm((p) => ({ ...p, employeeId: e.target.value }))
                  }
                  className={INPUT_CLASS}
                >
                  {eligibleEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
                {(() => {
                  const chosen = employeeMap.get(logApprovalForm.employeeId);
                  if (!chosen) return null;
                  const chain = resolveEmployeeDeductionWorkflow(chosen, deductionWorkflowConfig);
                  return (
                    <p className="text-[11px] text-indigo-700 dark:text-indigo-300 mt-1">
                      Approval chain:{' '}
                      <strong>{getDeductionWorkflowChainLabel(lang, chain)}</strong> (auto-escalates
                      after {deductionWorkflowConfig.autoEscalationHours}h)
                    </p>
                  );
                })()}
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Trigger Type
                  </label>
                  <select
                    value={logApprovalForm.triggerType}
                    onChange={(e) =>
                      setLogApprovalForm((p) => ({
                        ...p,
                        triggerType: e.target.value as DeductionApprovalTrigger,
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="off_day">{getDeductionTriggerLabel(lang, 'off_day')}</option>
                    <option value="latency">{getDeductionTriggerLabel(lang, 'latency')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Amount (AED)
                  </label>
                  <input
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    value={logApprovalForm.amountAED}
                    onChange={(e) =>
                      setLogApprovalForm((p) => ({ ...p, amountAED: e.target.value }))
                    }
                    placeholder="e.g., 150"
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Payroll Month
                  </label>
                  <input
                    type="month"
                    required
                    value={logApprovalForm.month}
                    onChange={(e) => setLogApprovalForm((p) => ({ ...p, month: e.target.value }))}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Incident Date
                  </label>
                  <input
                    type="date"
                    required
                    value={logApprovalForm.incidentDate}
                    onChange={(e) =>
                      setLogApprovalForm((p) => ({ ...p, incidentDate: e.target.value }))
                    }
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(lang, 'targetBucket')}
                </label>
                <select
                  value={logApprovalForm.targetBucket}
                  onChange={(e) =>
                    setLogApprovalForm((p) => ({
                      ...p,
                      targetBucket: e.target.value as DeductionTargetBucket,
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  {DEDUCTION_BUCKETS.map((b) => (
                    <option key={b} value={b}>
                      {getDeductionBucketLabel(lang, b)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Reason
                </label>
                <textarea
                  rows={2}
                  required
                  value={logApprovalForm.reason}
                  onChange={(e) => setLogApprovalForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Describe the off-day absence or latency incident..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowLogApprovalModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CREATE ENTRY MODAL */}
      {showCreateModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'addEntry')}
        >
          <div className="w-full max-w-lg rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'addEntry')}
              </h2>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitCreate} className="mt-4 space-y-4">
              {formError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}

              {/* 4-Type Selector */}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Entry Type
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ENTRY_TYPES.map((tp) => {
                    const selected = createForm.type === tp;
                    return (
                      <button
                        key={tp}
                        type="button"
                        onClick={() => handleTypeChange(tp)}
                        className={`px-3 py-2 rounded-xl border text-xs font-semibold text-start cursor-pointer transition-colors ${
                          selected
                            ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {getPayrollEntryTypeLabel(lang, tp)}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Employee & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="ed-employee"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Employee
                  </label>
                  <select
                    id="ed-employee"
                    value={createForm.employeeId}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, employeeId: e.target.value }))
                    }
                    className={INPUT_CLASS}
                  >
                    {eligibleEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="ed-category"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Category
                  </label>
                  <select
                    id="ed-category"
                    value={createForm.categoryId}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, categoryId: e.target.value }))
                    }
                    className={INPUT_CLASS}
                  >
                    {activeCategoriesForCreate.length === 0 ? (
                      <option value="">No active categories — add in Settings</option>
                    ) : (
                      activeCategoriesForCreate.map((cat) => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              </div>

              {/* Required Deduction Target Bucket (Deductions Only) */}
              {!isCreateEarning && (
                <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/30 p-3.5 space-y-2">
                  <label
                    htmlFor="ed-target-bucket"
                    className="block text-xs font-semibold text-rose-900 dark:text-rose-200"
                  >
                    {t(lang, 'deductFromBucket')} *
                  </label>
                  <select
                    id="ed-target-bucket"
                    required
                    value={createForm.targetBucket}
                    onChange={(e) =>
                      setCreateForm((p) => ({
                        ...p,
                        targetBucket: e.target.value as DeductionTargetBucket,
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    {DEDUCTION_BUCKETS.map((b) => (
                      <option key={b} value={b}>
                        {getDeductionBucketLabel(lang, b)}
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-rose-800/80 dark:text-rose-300/80">
                    WPS Rule: Deductions reduce net payout while keeping Fixed Income (Basic Salary)
                    intact in the ADCB WPS report.
                  </p>
                </div>
              )}

              {/* Duration Mode: Permanent toggle ONLY for Additional Earnings */}
              {isCreateEarning && (
                <div className="grid grid-cols-2 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
                  <button
                    type="button"
                    onClick={() => setCreateForm((p) => ({ ...p, isPermanent: false }))}
                    className={`py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      !createForm.isPermanent
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t(lang, 'temporaryDuration')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreateForm((p) => ({ ...p, isPermanent: true }))}
                    className={`py-1.5 text-xs font-semibold rounded-lg cursor-pointer ${
                      createForm.isPermanent
                        ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400'
                    }`}
                  >
                    {t(lang, 'permanentDuration')}
                  </button>
                </div>
              )}

              {/* Amount + Effective Month + Number of Months (if temporary) */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label
                    htmlFor="ed-amount"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    Amount (AED) *
                  </label>
                  <input
                    id="ed-amount"
                    type="number"
                    min={1}
                    step="0.01"
                    required
                    placeholder="500"
                    value={createForm.amountAED}
                    onChange={(e) => setCreateForm((p) => ({ ...p, amountAED: e.target.value }))}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>

                <div>
                  <label
                    htmlFor="ed-start-month"
                    className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                  >
                    {createForm.isPermanent
                      ? t(lang, 'effectiveFromMonth')
                      : t(lang, 'startingMonth')}
                  </label>
                  <input
                    id="ed-start-month"
                    type="month"
                    required
                    value={createForm.effectiveFrom}
                    onChange={(e) =>
                      setCreateForm((p) => ({ ...p, effectiveFrom: e.target.value }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>

                {!createForm.isPermanent && (
                  <div>
                    <label
                      htmlFor="ed-months"
                      className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                    >
                      {t(lang, 'numberOfMonths')}
                    </label>
                    <input
                      id="ed-months"
                      type="number"
                      min={1}
                      max={36}
                      required
                      value={createForm.durationMonths}
                      onChange={(e) =>
                        setCreateForm((p) => ({
                          ...p,
                          durationMonths: Math.max(1, Number(e.target.value) || 1),
                        }))
                      }
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  </div>
                )}
              </div>

              {!createForm.isPermanent ? (
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  Applies monthly from <strong className="font-mono">{createForm.effectiveFrom}</strong>{' '}
                  through <strong className="font-mono">{computedEndMonth}</strong> (
                  {createForm.durationMonths} month{createForm.durationMonths === 1 ? '' : 's'}).
                </p>
              ) : (
                <p className="text-[11px] text-indigo-700 dark:text-indigo-300 bg-indigo-50/60 dark:bg-indigo-950/40 rounded-lg px-3 py-2">
                  Saved permanently on the employee profile starting{' '}
                  <strong className="font-mono">{createForm.effectiveFrom}</strong>.{' '}
                  {t(lang, 'historicalPreservationNote')}
                </p>
              )}

              <div>
                <label
                  htmlFor="ed-reason"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1"
                >
                  Notes / Reason
                </label>
                <textarea
                  id="ed-reason"
                  rows={2}
                  value={createForm.reason}
                  onChange={(e) => setCreateForm((p) => ({ ...p, reason: e.target.value }))}
                  placeholder="Optional reference visible on payslip..."
                  className={INPUT_CLASS}
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT PERMANENT EARNING MODAL (PRESERVES HISTORICAL MONTHS) */}
      {editPermTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'editPermanent')}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'editPermanent')}
              </h2>
              <button
                type="button"
                onClick={() => setEditPermTarget(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitEditPermanent} className="mt-4 space-y-3.5">
              {editPermError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {editPermError}
                </p>
              )}

              <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 p-3 text-xs text-indigo-900 dark:text-indigo-200">
                {t(lang, 'historicalPreservationNote')}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(lang, 'effectiveFromMonth')}
                </label>
                <input
                  type="month"
                  required
                  value={editPermEffectiveFrom}
                  onChange={(e) => setEditPermEffectiveFrom(e.target.value)}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Category
                </label>
                <select
                  value={editPermCategoryId}
                  onChange={(e) => setEditPermCategoryId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {categories
                    .filter((c) => c.type === editPermTarget.type && (c.active || c.id === editPermTarget.categoryId))
                    .map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  New Monthly Amount (AED)
                </label>
                <input
                  type="number"
                  min={1}
                  step="0.01"
                  required
                  value={editPermAmount}
                  onChange={(e) => setEditPermAmount(e.target.value)}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Reason
                </label>
                <input
                  type="text"
                  value={editPermReason}
                  onChange={(e) => setEditPermReason(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditPermTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* STOP PERMANENT EARNING MODAL (PRESERVES HISTORICAL MONTHS) */}
      {stopPermTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={t(lang, 'stopPermanent')}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'stopPermanent')} — {stopPermTarget.categoryName}
              </h2>
              <button
                type="button"
                onClick={() => setStopPermTarget(null)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitStopPermanent} className="mt-4 space-y-4">
              <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                {t(lang, 'historicalPreservationNote')}
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(lang, 'stopFromMonth')}
                </label>
                <input
                  type="month"
                  required
                  value={stopPermFromMonth}
                  onChange={(e) => setStopPermFromMonth(e.target.value)}
                  className={`${INPUT_CLASS} font-mono`}
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  Last paid month will be{' '}
                  <strong className="font-mono">{addMonthsToYYYYMM(stopPermFromMonth, -1)}</strong>.
                </p>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setStopPermTarget(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'stopPermanent')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
