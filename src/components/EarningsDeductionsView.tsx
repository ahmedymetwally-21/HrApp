import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  CalendarRange,
  CheckCircle2,
  Clock,
  Edit3,
  EyeOff,
  Infinity as InfinityIcon,
  Layers,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  StopCircle,
  Trash2,
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
  HiddenSectionKey,
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
  inferDefaultEmployeeType,
  isAdminOrHRRole,
  isPayrollEligible,
  isPayrollEntryActiveInMonth,
  isSectionHidden,
  PendingReviewerRole,
  resolveEmployeeDeductionWorkflow,
} from '../utils/hrLogic';
import { useIsCompactOverlay } from '../hooks/useIsCompactOverlay';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface EarningsDeductionsViewProps {
  lang: Language;
  mode?: 'entries' | 'approvals';
  currentUser: Employee;
  activeRole: UserRole;
  companies: Company[];
  scopedEmployees: Employee[];
  categories: PayrollCategoryItem[];
  entries: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  deductionWorkflowConfig?: DeductionWorkflowConfig;
  hiddenSections?: HiddenSectionKey[];
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
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getApprovalStatusDotColor(status: DeductionApprovalStatus): string {
  if (status === 'approved') return 'bg-emerald-500';
  if (status === 'waived') return 'bg-slate-400';
  if (status === 'escalated_to_hr') return 'bg-rose-500';
  if (status === 'pending_hr_approval' || status === 'pending_main_manager') return 'bg-teal-500';
  return 'bg-amber-500';
}

function getApprovalStatusTextColor(status: DeductionApprovalStatus): string {
  if (status === 'approved') return 'text-emerald-700 dark:text-emerald-400';
  if (status === 'waived') return 'text-slate-500 dark:text-slate-400';
  if (status === 'escalated_to_hr') return 'text-rose-700 dark:text-rose-400';
  if (status === 'pending_hr_approval' || status === 'pending_main_manager') {
    return 'text-teal-700 dark:text-teal-300';
  }
  return 'text-amber-700 dark:text-amber-400';
}

function getPendingReviewerBadgeLabel(
  lang: Language,
  reviewer: PendingReviewerRole | null
): string {
  if (reviewer === 'main_manager') return t(lang, 'pendingReviewerMainManager');
  if (reviewer === 'hr_admin') return t(lang, 'pendingReviewerHr');
  if (reviewer === 'section_manager') return t(lang, 'pendingReviewerManager');
  return t(lang, 'pendingReviewer');
}

export const EarningsDeductionsView: React.FC<EarningsDeductionsViewProps> = ({
  lang,
  mode,
  currentUser,
  activeRole,
  companies,
  scopedEmployees,
  categories,
  entries,
  deductionApprovals = [],
  deductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  hiddenSections = [],
  onCreateEntry,
  onEditPermanentEntry,
  onStopPermanentEntry,
  onDeleteEntry,
  onCreateDeductionApproval,
  onManagerDecideDeduction,
  onHrDecideDeduction,
}) => {
  const isCompactOverlay = useIsCompactOverlay();
  const hideDeductions = isSectionHidden(hiddenSections, 'deductions');
  const canAccessLedger = isAdminOrHRRole(activeRole) || activeRole === UserRole.Accounting;
  const isSectionManager = activeRole === UserRole.SectionManager;
  const isAuthorized = canAccessLedger || isSectionManager;
  const canLogWorkflowDeduction = isAdminOrHRRole(activeRole);

  const currentMonth = useMemo(() => getCurrentMonthKey(), []);
  const nextMonth = useMemo(() => addMonthsToYYYYMM(currentMonth, 1), [currentMonth]);

  const activeTab: 'entries' | 'approvals' =
    !canAccessLedger ? 'approvals' : mode ?? 'entries';

  // Full-page sub-views (never popups on desktop browser!)
  const [subPage, setSubPage] = useState<
    'list' | 'create_entry' | 'log_approval' | 'edit_permanent' | 'stop_permanent'
  >('list');

  useEffect(() => {
    setSubPage('list');
  }, [mode]);

  const [approvalStatusFilter, setApprovalStatusFilter] = useState<
    'all' | 'action_needed' | 'pending' | 'approved' | 'waived'
  >('all');
  const [decisionNotes, setDecisionNotes] = useState<Record<string, string>>({});
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);

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

  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<PayrollEntry | null>(null);

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

  const [editPermTarget, setEditPermTarget] = useState<PayrollEntry | null>(null);
  const [editPermEffectiveFrom, setEditPermEffectiveFrom] = useState(nextMonth);
  const [editPermCategoryId, setEditPermCategoryId] = useState('');
  const [editPermAmount, setEditPermAmount] = useState('');
  const [editPermReason, setEditPermReason] = useState('');
  const [editPermError, setEditPermError] = useState<string | null>(null);

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

  const filteredEntries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((entry) => {
      if (
        hideDeductions &&
        (entry.type === 'deduction_in_payroll' || entry.type === 'deduction_off_cycle')
      ) {
        return false;
      }
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
  }, [entries, hideDeductions, showAllMonths, monthFilter, typeFilter, durationFilter, search, employeeMap]);

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

  const scopedApprovalsAll = useMemo(() => {
    return deductionApprovals
      .filter((req) => employeeMap.has(req.employeeId))
      .map((req) => {
        const emp = employeeMap.get(req.employeeId)!;
        const perm = canActOnDeductionApproval({
          request: req,
          actorUserId: currentUser.id,
          actorRole: activeRole,
          actorManagedSectionIds: currentUser.managedSectionIds,
          targetRole: emp.role,
        });
        const actorStage: 'manager' | 'hr_final' | null = perm.isSelf
          ? null
          : perm.canManagerAct
            ? 'manager'
            : perm.canHrAct
              ? 'hr_final'
              : null;
        return {
          req,
          emp,
          effectiveStatus: perm.effectiveStatus,
          isSelf: perm.isSelf,
          pendingReviewerRole: perm.pendingReviewerRole,
          actorStage,
        };
      })
      .sort((a, b) => b.req.createdAt.localeCompare(a.req.createdAt));
  }, [deductionApprovals, employeeMap, currentUser.id, currentUser.managedSectionIds, activeRole]);

  const approvalKpis = useMemo(() => {
    const actionNeeded = scopedApprovalsAll.filter((x) => x.actorStage !== null).length;
    const escalated = scopedApprovalsAll.filter((x) => x.effectiveStatus === 'escalated_to_hr').length;
    const approvedSum = scopedApprovalsAll
      .filter((x) => x.effectiveStatus === 'approved')
      .reduce((s, x) => s + x.req.amountAED, 0);
    return { actionNeeded, escalated, approvedSum };
  }, [scopedApprovalsAll]);

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
        <Lock className="w-8 h-8 text-slate-400 mx-auto" />
        <h2 className="text-base font-bold text-slate-900 dark:text-white">Access Restricted</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Earnings &amp; Deductions management is restricted to Main Manager, HR Manager, HR Admin,
          Accounting, and Section Managers (for deduction approvals).
        </p>
      </div>
    );
  }

  const openCreatePage = (presetType: PayrollEntryType = 'earning_in_payroll') => {
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
    setSubPage('create_entry');
  };

  const openLogApprovalPage = () => {
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
    setSubPage('log_approval');
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
        durationMonths:
          isEarning && createForm.isPermanent ? null : Math.max(1, createForm.durationMonths),
        targetBucket: isEarning ? null : createForm.targetBucket,
        reason: createForm.reason.trim() || cat.name,
        createdBy: currentUser.fullName,
        createdByRole: activeRole,
      });
      setSubPage('list');
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
    setSubPage('edit_permanent');
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
      setSubPage('list');
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
      setSubPage('list');
    } finally {
      setSaving(false);
    }
  };

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
  // FULL-PAGE VIEW: ADD EARNING / DEDUCTION ENTRY
  // =========================================================================
  if (subPage === 'create_entry' && canAccessLedger) {
    const isCreateEarning =
      createForm.type === 'earning_in_payroll' || createForm.type === 'earning_off_cycle';
    const computedEndMonth = computeTemporaryEndMonth(
      createForm.effectiveFrom || currentMonth,
      createForm.durationMonths
    );

    return wrapFullPage(
      <div className="max-w-3xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navEarningsDeductions'), onClick: () => setSubPage('list') },
            { label: t(lang, 'addEntry') },
          ]}
          title={t(lang, 'addEntry')}
          subtitle="Record permanent or temporary earnings and bucket-targeted deductions."
          onBack={() => setSubPage('list')}
        />

        <form
          onSubmit={handleSubmitCreate}
          noValidate
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              {formError}
            </p>
          )}

          {/* 4-Type Selector */}
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
              Entry Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ENTRY_TYPES.map((tp) => {
                const selected = createForm.type === tp;
                return (
                  <button
                    key={tp}
                    type="button"
                    onClick={() => handleTypeChange(tp)}
                    className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold text-start cursor-pointer transition-colors ${
                      selected
                        ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200'
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label
                htmlFor="ed-employee"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Employee *
              </label>
              <select
                id="ed-employee"
                value={createForm.employeeId}
                onChange={(e) => setCreateForm((p) => ({ ...p, employeeId: e.target.value }))}
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
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Category *
              </label>
              <select
                id="ed-category"
                value={createForm.categoryId}
                onChange={(e) => setCreateForm((p) => ({ ...p, categoryId: e.target.value }))}
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

          {/* Required Deduction Target Bucket */}
          {!isCreateEarning && (
            <div className="rounded-lg border border-rose-200/80 dark:border-rose-900 bg-rose-50/40 dark:bg-rose-950/25 p-4 space-y-2">
              <label
                htmlFor="ed-target-bucket"
                className="block text-xs font-semibold text-rose-900 dark:text-rose-200"
              >
                {t(lang, 'deductFromBucket')} *
              </label>
              <select
                id="ed-target-bucket"
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
            <div className="grid grid-cols-2 rounded-lg bg-slate-100 dark:bg-slate-800 p-1">
              <button
                type="button"
                onClick={() => setCreateForm((p) => ({ ...p, isPermanent: false }))}
                className={`py-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  !createForm.isPermanent
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'temporaryDuration')}
              </button>
              <button
                type="button"
                onClick={() => setCreateForm((p) => ({ ...p, isPermanent: true }))}
                className={`py-2 text-xs font-semibold rounded-md cursor-pointer transition-colors ${
                  createForm.isPermanent
                    ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {t(lang, 'permanentDuration')}
              </button>
            </div>
          )}

          {/* Amount + Effective Month + Duration */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label
                htmlFor="ed-amount"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                Amount (AED) *
              </label>
              <input
                id="ed-amount"
                type="number"
                min={1}
                step="0.01"
                placeholder="500"
                value={createForm.amountAED}
                onChange={(e) => setCreateForm((p) => ({ ...p, amountAED: e.target.value }))}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>

            <div>
              <label
                htmlFor="ed-start-month"
                className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
              >
                {createForm.isPermanent ? t(lang, 'effectiveFromMonth') : t(lang, 'startingMonth')}
              </label>
              <input
                id="ed-start-month"
                type="month"
                value={createForm.effectiveFrom}
                onChange={(e) => setCreateForm((p) => ({ ...p, effectiveFrom: e.target.value }))}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>

            {!createForm.isPermanent && (
              <div>
                <label
                  htmlFor="ed-months"
                  className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
                >
                  {t(lang, 'numberOfMonths')}
                </label>
                <input
                  id="ed-months"
                  type="number"
                  min={1}
                  max={36}
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
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Applies monthly from <strong className="font-mono">{createForm.effectiveFrom}</strong>{' '}
              through <strong className="font-mono">{computedEndMonth}</strong> (
              {createForm.durationMonths} month{createForm.durationMonths === 1 ? '' : 's'}).
            </p>
          ) : (
            <p className="text-xs text-teal-800 dark:text-teal-200 bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900 rounded-lg px-3.5 py-2.5">
              Saved permanently on the employee profile starting{' '}
              <strong className="font-mono">{createForm.effectiveFrom}</strong>.{' '}
              {t(lang, 'historicalPreservationNote')}
            </p>
          )}

          <div>
            <label
              htmlFor="ed-reason"
              className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5"
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

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPage('list')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // FULL-PAGE VIEW: LOG OFF-DAY / LATENCY WORKFLOW DEDUCTION
  // =========================================================================
  if (subPage === 'log_approval' && canLogWorkflowDeduction && onCreateDeductionApproval) {
    const chosen = employeeMap.get(logApprovalForm.employeeId);
    const chosenChain = chosen
      ? resolveEmployeeDeductionWorkflow(chosen, deductionWorkflowConfig)
      : null;

    return wrapFullPage(
      <div className="max-w-2xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navDeductionApprovals'), onClick: () => setSubPage('list') },
            { label: t(lang, 'logWorkflowDeduction') },
          ]}
          title={t(lang, 'logWorkflowDeduction')}
          subtitle="Submit an off-day or latency deduction into the configured Manager → HR approval chain."
          onBack={() => setSubPage('list')}
        />

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
              setSubPage('list');
            } finally {
              setSaving(false);
            }
          }}
          noValidate
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          {logApprovalError && (
            <p
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              {logApprovalError}
            </p>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Employee *
            </label>
            <select
              value={logApprovalForm.employeeId}
              onChange={(e) => setLogApprovalForm((p) => ({ ...p, employeeId: e.target.value }))}
              className={INPUT_CLASS}
            >
              {eligibleEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName} ({emp.employeeCode})
                </option>
              ))}
            </select>
            {chosenChain && (
              <p className="text-xs text-teal-700 dark:text-teal-300 mt-1.5">
                Approval chain: <strong>{getDeductionWorkflowChainLabel(lang, chosenChain)}</strong>{' '}
                (auto-escalates after {deductionWorkflowConfig.autoEscalationHours}h)
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Amount (AED) *
              </label>
              <input
                type="number"
                min={1}
                step="0.01"
                value={logApprovalForm.amountAED}
                onChange={(e) => setLogApprovalForm((p) => ({ ...p, amountAED: e.target.value }))}
                placeholder="e.g., 150"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Payroll Month
              </label>
              <input
                type="month"
                value={logApprovalForm.month}
                onChange={(e) => setLogApprovalForm((p) => ({ ...p, month: e.target.value }))}
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Incident Date
              </label>
              <input
                type="date"
                value={logApprovalForm.incidentDate}
                onChange={(e) =>
                  setLogApprovalForm((p) => ({ ...p, incidentDate: e.target.value }))
                }
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Reason *
            </label>
            <textarea
              rows={3}
              value={logApprovalForm.reason}
              onChange={(e) => setLogApprovalForm((p) => ({ ...p, reason: e.target.value }))}
              placeholder="Describe the off-day absence or latency incident..."
              className={INPUT_CLASS}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPage('list')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
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
  // FULL-PAGE VIEW: EDIT PERMANENT EARNING (PRESERVES HISTORICAL MONTHS)
  // =========================================================================
  if (subPage === 'edit_permanent' && editPermTarget) {
    return wrapFullPage(
      <div className="max-w-2xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navEarningsDeductions'), onClick: () => setSubPage('list') },
            { label: t(lang, 'editPermanent') },
          ]}
          title={`${t(lang, 'editPermanent')} — ${editPermTarget.categoryName}`}
          subtitle={t(lang, 'historicalPreservationNote')}
          onBack={() => {
            setEditPermTarget(null);
            setSubPage('list');
          }}
        />

        <form
          onSubmit={handleSubmitEditPermanent}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          {editPermError && (
            <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
              {editPermError}
            </p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
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
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Category
            </label>
            <select
              value={editPermCategoryId}
              onChange={(e) => setEditPermCategoryId(e.target.value)}
              className={INPUT_CLASS}
            >
              {categories
                .filter(
                  (c) =>
                    c.type === editPermTarget.type &&
                    (c.active || c.id === editPermTarget.categoryId)
                )
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Reason
            </label>
            <input
              type="text"
              value={editPermReason}
              onChange={(e) => setEditPermReason(e.target.value)}
              className={INPUT_CLASS}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setEditPermTarget(null);
                setSubPage('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'save')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // FULL-PAGE VIEW: STOP PERMANENT EARNING (PRESERVES HISTORICAL MONTHS)
  // =========================================================================
  if (subPage === 'stop_permanent' && stopPermTarget) {
    return wrapFullPage(
      <div className="max-w-xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPayroll') },
            { label: t(lang, 'navEarningsDeductions'), onClick: () => setSubPage('list') },
            { label: t(lang, 'stopPermanent') },
          ]}
          title={`${t(lang, 'stopPermanent')} — ${stopPermTarget.categoryName}`}
          subtitle={t(lang, 'historicalPreservationNote')}
          onBack={() => {
            setStopPermTarget(null);
            setSubPage('list');
          }}
        />

        <form
          onSubmit={handleSubmitStopPermanent}
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              {t(lang, 'stopFromMonth')}
            </label>
            <input
              type="month"
              required
              value={stopPermFromMonth}
              onChange={(e) => setStopPermFromMonth(e.target.value)}
              className={`${INPUT_CLASS} font-mono`}
            />
            <p className="text-xs text-slate-500 mt-1.5">
              Last paid month will be{' '}
              <strong className="font-mono">{addMonthsToYYYYMM(stopPermFromMonth, -1)}</strong>.
            </p>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStopPermTarget(null);
                setSubPage('list');
              }}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer"
            >
              {t(lang, 'stopPermanent')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW: DEDUCTION APPROVALS QUEUE
  // =========================================================================
  if (activeTab === 'approvals') {
    if (hideDeductions) {
      return (
        <div className="max-w-lg mx-auto rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center space-y-2">
          <EyeOff className="w-7 h-7 text-slate-400 mx-auto" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(lang, 'restrictedByPolicyTitle')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t(lang, 'restrictedByPolicyDesc')}
          </p>
        </div>
      );
    }

    const filteredApprovals = scopedApprovalsAll.filter((item) => {
      if (approvalStatusFilter === 'action_needed') return item.actorStage !== null;
      if (approvalStatusFilter === 'pending') {
        return item.effectiveStatus !== 'approved' && item.effectiveStatus !== 'waived';
      }
      if (approvalStatusFilter === 'approved') return item.effectiveStatus === 'approved';
      if (approvalStatusFilter === 'waived') return item.effectiveStatus === 'waived';
      return true;
    });

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {t(lang, 'navDeductionApprovals')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Off-day &amp; latency deductions require final HR approval before applying to payroll.
              Auto-escalation: {deductionWorkflowConfig.autoEscalationHours}h.
            </p>
          </div>

          {canLogWorkflowDeduction && onCreateDeductionApproval && (
            <button
              type="button"
              onClick={openLogApprovalPage}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'logWorkflowDeduction')}
            </button>
          )}
        </div>

        {/* 3 Focused KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Action Needed</span>
              <Clock className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {approvalKpis.actionNeeded}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Auto-Escalated to HR</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
              {approvalKpis.escalated}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Finalized Deductions</span>
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {formatAED(approvalKpis.approvedSum)}
            </p>
          </div>
        </section>

        {/* Clean Status Filter Strip */}
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
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                approvalStatusFilter === tab.id
                  ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {filteredApprovals.length === 0 ? (
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noPendingApprovals')}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredApprovals.map(
              ({ req, emp, effectiveStatus, isSelf, pendingReviewerRole, actorStage }) => {
                const comp = companyMap.get(req.companyId);
                const isFinalized = effectiveStatus === 'approved' || effectiveStatus === 'waived';
                const noteVal = decisionNotes[req.id] ?? '';

                return (
                  <div
                    key={req.id}
                    data-testid={`deduction-approval-card-${req.id}`}
                    className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
                  >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar src={emp.avatarUrl} name={emp.fullName} size="sm" />
                      <div className="min-w-0 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <span className="text-sm font-semibold text-slate-900 dark:text-white">
                            {emp.fullName}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            {emp.employeeCode} · {comp?.code ?? ''}
                          </span>
                          <span className="text-xs text-slate-500">
                            {getEmployeeTypeLabel(
                              lang,
                              emp.employeeType ?? inferDefaultEmployeeType(emp)
                            )}{' '}
                            · {getDeductionTriggerLabel(lang, req.triggerType)}
                          </span>
                          <span
                            className={`inline-flex items-center gap-1.5 text-xs font-semibold ${getApprovalStatusTextColor(
                              effectiveStatus
                            )}`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${getApprovalStatusDotColor(
                                effectiveStatus
                              )}`}
                            />
                            {getDeductionApprovalStatusLabel(lang, effectiveStatus)}
                          </span>
                        </div>

                        <p className="text-xs text-slate-700 dark:text-slate-300">{req.reason}</p>

                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          Month <strong className="font-mono">{req.month}</strong> · Incident{' '}
                          {formatShortDate(req.date)} · Target{' '}
                          <strong>{getDeductionBucketLabel(lang, req.targetBucket)}</strong> · Chain{' '}
                          <strong>{getDeductionWorkflowChainLabel(lang, req.workflowChain)}</strong>
                        </p>

                        {!isFinalized && (
                          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 shrink-0" />
                            <span>
                              {t(lang, 'notAppliedUntilHr')}
                              {effectiveStatus === 'escalated_to_hr' &&
                                ` · Auto-escalated past ${formatShortDate(
                                  req.escalationDeadline.slice(0, 10)
                                )}`}
                            </span>
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="text-start lg:text-end shrink-0">
                      <p className="text-base font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                        -{formatAED(req.amountAED)}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Logged by {req.createdBy}
                      </p>
                    </div>
                  </div>

                  {/* Audit Trail Notes */}
                  {(req.managerDecision || req.hrDecision) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                      {req.managerDecision && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-700 dark:text-slate-200">
                            Section Manager ({req.managerActorName ?? 'Manager'}):{' '}
                            <span
                              className={
                                req.managerDecision === 'approved'
                                  ? 'text-teal-700 dark:text-teal-300'
                                  : 'text-amber-700 dark:text-amber-300'
                              }
                            >
                              {req.managerDecision === 'approved'
                                ? 'Approved → Sent to HR'
                                : 'Recommended Waive → Sent to HR'}
                            </span>
                          </p>
                          {req.managerNote && (
                            <p className="text-[11px] text-slate-500">
                              &ldquo;{req.managerNote}&rdquo;
                            </p>
                          )}
                        </div>
                      )}
                      {req.hrDecision && (
                        <div className="space-y-0.5">
                          <p className="font-medium text-slate-700 dark:text-slate-200">
                            Final Decision ({req.hrActorName ?? 'HR'}):{' '}
                            <span
                              className={
                                req.hrDecision === 'approved'
                                  ? 'text-emerald-700 dark:text-emerald-400'
                                  : 'text-slate-500 dark:text-slate-400'
                              }
                            >
                              {req.hrDecision === 'approved'
                                ? 'Approved (Applied to Payroll)'
                                : 'Waived (No Deduction)'}
                            </span>
                          </p>
                          {req.hrNote && (
                            <p className="text-[11px] text-slate-500">
                              &ldquo;{req.hrNote}&rdquo;
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Reviewer Actions — STRICTLY HIDDEN when isSelf or not authorized stage */}
                  {!isSelf && actorStage ? (
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 hover:bg-amber-50 dark:hover:bg-amber-950/40 text-xs font-semibold cursor-pointer disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
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
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer disabled:opacity-50"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              {t(lang, 'hrFinalWaive')}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ) : !isFinalized ? (
                    <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-2">
                      <span
                        data-testid={`deduction-pending-reviewer-${req.id}`}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-xs font-medium text-slate-600 dark:text-slate-300"
                      >
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        {getPendingReviewerBadgeLabel(lang, pendingReviewerRole)}
                      </span>
                      {isSelf && (
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          {t(lang, 'selfApprovalBlockedNote')}
                        </span>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // MAIN VIEW: EARNINGS & DEDUCTIONS LEDGER
  // =========================================================================
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t(lang, 'earningsDeductionsTitle')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'earningsDeductionsSubtitle')}
          </p>
        </div>

        <button
          type="button"
          onClick={() => openCreatePage('earning_in_payroll')}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          {t(lang, 'addEntry')}
        </button>
      </div>

      {/* 4 Focused KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeEarningInPayroll')}
            </span>
            <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
            +{formatAED(kpis.earningInPayroll)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">WPS Variable · {monthFilter}</p>
        </div>

        <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              {t(lang, 'typeEarningOffCycle')}
            </span>
            <Layers className="w-4 h-4 text-teal-600" />
          </div>
          <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-400">
            +{formatAED(kpis.earningOffCycle)}
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Outside WPS · {monthFilter}</p>
        </div>

        {!hideDeductions && (
          <>
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t(lang, 'typeDeductionInPayroll')}
                </span>
                <ArrowDownCircle className="w-4 h-4 text-rose-600" />
              </div>
              <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
                -{formatAED(kpis.deductionInPayroll)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Basic stays intact · {monthFilter}</p>
            </div>

            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {t(lang, 'typeDeductionOffCycle')}
                </span>
                <ArrowDownCircle className="w-4 h-4 text-amber-600" />
              </div>
              <p className="mt-2.5 text-xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                -{formatAED(kpis.deductionOffCycle)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Off-Cycle bucket · {monthFilter}</p>
            </div>
          </>
        )}
      </section>

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
            className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
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
          className="px-3 py-2 text-xs font-mono rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
        />

        <label className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={showAllMonths}
            onChange={(e) => setShowAllMonths(e.target.checked)}
            className="accent-teal-600"
          />
          All History
        </label>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as 'all' | PayrollEntryType)}
          aria-label="Filter by entry type"
          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
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
          className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
        >
          <option value="all">All Durations</option>
          <option value="permanent">{t(lang, 'permanentDuration')}</option>
          <option value="temporary">{t(lang, 'temporaryDuration')}</option>
        </select>
      </div>

      {/* Scannable Entries Table */}
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {filteredEntries.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 text-start">Employee</th>
                  <th className="py-3 px-4 text-start">Category &amp; Type</th>
                  <th className="py-3 px-4 text-start">Schedule</th>
                  <th className="py-3 px-4 text-end">Amount</th>
                  <th className="py-3 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredEntries.map((entry) => {
                  const emp = employeeMap.get(entry.employeeId);
                  const comp = companyMap.get(entry.companyId);
                  const isEarning =
                    entry.type === 'earning_in_payroll' || entry.type === 'earning_off_cycle';
                  const isStoppedPermanent = entry.isPermanent && Boolean(entry.effectiveTo);

                  return (
                    <tr
                      key={entry.id}
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
                              {emp?.fullName ?? entry.employeeId}
                            </p>
                            <p className="text-[11px] font-mono text-slate-400">
                              {emp?.employeeCode} · {comp?.code ?? ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-semibold text-slate-800 dark:text-slate-100">
                          {entry.categoryName}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {getPayrollEntryTypeLabel(lang, entry.type)}
                          {entry.targetBucket
                            ? ` · ${getDeductionBucketLabel(lang, entry.targetBucket)}`
                            : ''}
                          {entry.reason && entry.reason !== entry.categoryName
                            ? ` — ${entry.reason}`
                            : ''}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        {entry.isPermanent ? (
                          <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
                            <InfinityIcon className="w-3.5 h-3.5 text-teal-600" />
                            {isStoppedPermanent
                              ? `${entry.effectiveFrom} → ${entry.effectiveTo}`
                              : `${t(lang, 'permanentDuration')} (${entry.effectiveFrom}+)`}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-400 font-mono">
                            <CalendarRange className="w-3.5 h-3.5 text-slate-400" />
                            {entry.effectiveFrom} → {entry.effectiveTo}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-end">
                        <span
                          className={`font-bold font-mono tabular-nums ${
                            isEarning
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {isEarning ? '+' : '-'}
                          {formatAED(entry.amountAED)}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-end">
                        <div className="inline-flex items-center gap-1">
                          {entry.isPermanent && !isStoppedPermanent && (
                            <>
                              <button
                                type="button"
                                onClick={() => openEditPermanent(entry)}
                                title={t(lang, 'editPermanent')}
                                aria-label={`Edit permanent ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setStopPermTarget(entry);
                                  setStopPermFromMonth(
                                    nextMonth > entry.effectiveFrom ? nextMonth : currentMonth
                                  );
                                  setSubPage('stop_permanent');
                                }}
                                title={t(lang, 'stopPermanent')}
                                aria-label={`Stop permanent ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-amber-700 hover:bg-amber-50 dark:hover:bg-amber-950/40 cursor-pointer"
                              >
                                <StopCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {!entry.isPermanent && (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteEntry(entry)}
                              title={t(lang, 'delete')}
                              aria-label={`Delete ${entry.categoryName} for ${emp?.fullName ?? 'employee'}`}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </div>
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
        open={Boolean(confirmDeleteEntry)}
        lang={lang}
        title={t(lang, 'confirmDeleteTitle')}
        message={t(lang, 'confirmDeleteMessage')}
        confirmLabel={t(lang, 'delete')}
        destructive
        onCancel={() => setConfirmDeleteEntry(null)}
        onConfirm={async () => {
          if (confirmDeleteEntry) {
            await onDeleteEntry(confirmDeleteEntry.id);
          }
          setConfirmDeleteEntry(null);
        }}
      />
    </div>
  );
};
