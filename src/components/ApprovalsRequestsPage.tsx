import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  DollarSign,
  FileText,
  Paperclip,
  Plus,
  Search,
  ShieldAlert,
  ShieldCheck,
  Upload,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import {
  getRequestCategoryLabel,
  getRequestStatusLabel,
  getRoleLabel,
  getTimeOffSubTypeLabel,
  getWorkflowStepRoleLabel,
  t,
} from '../i18n/translations';
import {
  CreateUnifiedRequestInput,
  Employee,
  Language,
  Project,
  RequestCategory,
  RequestStatus,
  RequestUploadResult,
  ResolvedWorkflowStep,
  TimeOffSubType,
  UnifiedRequest,
  UserRole,
  WorkflowModuleAssignments,
  WorkflowModuleKey,
  WorkflowTemplate,
} from '../types/hr';
import {
  addMonthsToYYYYMM,
  ALL_REQUEST_CATEGORIES,
  calculateInclusiveDays,
  calculateLoanMonthlyDeduction,
  canActOnUnifiedRequest,
  getPendingRequestsForApprover,
  isAdminOrHRRole,
  resolveSalaryAdjustmentSteps,
  resolveWorkflowStepsForEmployee,
} from '../utils/hrLogic';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface ApprovalsRequestsPageProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  projects: Project[];
  workflowTemplates: WorkflowTemplate[];
  workflowAssignments: WorkflowModuleAssignments;
  requests: UnifiedRequest[];
  onCreateRequest: (input: CreateUnifiedRequestInput) => Promise<void>;
  onActionRequest: (params: {
    id: string;
    action: 'approve' | 'reject' | 'bypass';
    comment?: string;
  }) => Promise<void>;
  onUploadAttachment: (file: File) => Promise<RequestUploadResult>;
  onResolveTemplate: (templateId: string, employeeId: string) => Promise<ResolvedWorkflowStep[]>;
}

const TIME_OFF_SUBTYPES: TimeOffSubType[] = ['annual', 'sick', 'emergency', 'unpaid'];
const STATUS_FILTER_OPTIONS: RequestStatus[] = ['pending', 'approved', 'bypassed', 'rejected'];

function formatDateTimeShort(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 16);
  return `${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}:${String(
    d.getMinutes()
  ).padStart(2, '0')}`;
}

function getCategoryIcon(category: RequestCategory) {
  switch (category) {
    case 'custom_clock':
      return Clock;
    case 'time_off':
      return CalendarClock;
    case 'advance_loan':
      return Banknote;
    case 'salary_adjustment':
      return DollarSign;
    case 'general':
      return FileText;
  }
}

function getStatusColorClass(status: RequestStatus | 'skipped'): string {
  switch (status) {
    case 'approved':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'bypassed':
      return 'text-teal-700 dark:text-teal-400';
    case 'rejected':
      return 'text-rose-700 dark:text-rose-400';
    case 'skipped':
      return 'text-slate-400 dark:text-slate-500';
    case 'pending':
    default:
      return 'text-amber-700 dark:text-amber-400';
  }
}

export const ApprovalsRequestsPage: React.FC<ApprovalsRequestsPageProps> = ({
  lang,
  currentUser,
  activeRole,
  employees,
  projects,
  workflowTemplates,
  workflowAssignments,
  requests,
  onCreateRequest,
  onActionRequest,
  onUploadAttachment,
  onResolveTemplate,
}) => {
  const [subPage, setSubPage] = useState<'list' | 'new' | 'detail'>('list');
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);

  // List tabs & filters
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [onlyMine, setOnlyMine] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New Request form state
  const canCreateSalaryAdjustment = isAdminOrHRRole(activeRole);
  const availableCategories = useMemo(
    () =>
      ALL_REQUEST_CATEGORIES.filter(
        (cat) => cat !== 'salary_adjustment' || canCreateSalaryAdjustment
      ),
    [canCreateSalaryAdjustment]
  );

  const todayIso = new Date().toISOString().slice(0, 10);
  const currentMonthIso = todayIso.slice(0, 7);

  const [reqCategory, setReqCategory] = useState<RequestCategory>('custom_clock');
  const [clockDate, setClockDate] = useState(todayIso);
  const [clockInTime, setClockInTime] = useState('08:30');
  const [clockOutTime, setClockOutTime] = useState('17:30');

  const [leaveSubType, setLeaveSubType] = useState<TimeOffSubType>('annual');
  const [startDate, setStartDate] = useState(todayIso);
  const [endDate, setEndDate] = useState(todayIso);

  const [loanAmount, setLoanAmount] = useState('2000');
  const [repaymentMonths, setRepaymentMonths] = useState('4');
  const [startMonth, setStartMonth] = useState(currentMonthIso);

  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.active)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees]
  );

  const [targetSalaryEmpId, setTargetSalaryEmpId] = useState<string>('');
  const [newBaseSalary, setNewBaseSalary] = useState<string>('');

  const [generalSubject, setGeneralSubject] = useState('');
  const [generalMessage, setGeneralMessage] = useState('');
  const [attachment, setAttachment] = useState<RequestUploadResult | null>(null);
  const [uploading, setUploading] = useState(false);

  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Live Workflow Preview state in New Request form
  const [previewSteps, setPreviewSteps] = useState<ResolvedWorkflowStep[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  // Detail action state
  const [actionComment, setActionComment] = useState('');
  const [bypassReason, setBypassReason] = useState('');
  const [acting, setActing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const templateById = useMemo(
    () => new Map(workflowTemplates.map((tpl) => [tpl.id, tpl])),
    [workflowTemplates]
  );

  const pendingMyApproval = useMemo(
    () =>
      getPendingRequestsForApprover({
        requests,
        currentUser,
        activeRole,
        projects,
      }),
    [requests, currentUser, activeRole, projects]
  );

  // If user has no pending approvals on initial mount, default cleanly to My / All Requests
  const [hasInitializedTab, setHasInitializedTab] = useState(false);
  useEffect(() => {
    if (!hasInitializedTab) {
      if (pendingMyApproval.length === 0) {
        setActiveTab('all');
      }
      setHasInitializedTab(true);
    }
  }, [hasInitializedTab, pendingMyApproval.length]);

  const filteredAllRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return requests
      .filter((r) => {
        // Regular employees & non-managers see their own requests (plus any where they are an approver)
        const isMgmt =
          isAdminOrHRRole(activeRole) ||
          activeRole === UserRole.SectionManager ||
          activeRole === UserRole.SectionCoManager;
        if (!isMgmt) {
          const involvesMe =
            r.employeeId === currentUser.id ||
            r.createdById === currentUser.id ||
            r.steps.some((s) => s.approverId === currentUser.id);
          if (!involvesMe) return false;
        }
        if (onlyMine && r.employeeId !== currentUser.id && r.createdById !== currentUser.id) {
          return false;
        }
        if (categoryFilter !== 'all' && r.category !== categoryFilter) return false;
        if (statusFilter !== 'all' && r.status !== statusFilter) return false;
        if (q) {
          const empName = (r.employeeName || empById.get(r.employeeId)?.fullName || '').toLowerCase();
          const subj = (r.payload.subject || '').toLowerCase();
          const rsn = (r.reason || '').toLowerCase();
          const catLabel = getRequestCategoryLabel(lang, r.category).toLowerCase();
          if (
            !empName.includes(q) &&
            !subj.includes(q) &&
            !rsn.includes(q) &&
            !catLabel.includes(q)
          ) {
            return false;
          }
        }
        return true;
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [
    requests,
    activeRole,
    currentUser.id,
    onlyMine,
    categoryFilter,
    statusFilter,
    searchQuery,
    empById,
    lang,
  ]);

  const selectedRequest = useMemo(
    () => (selectedRequestId ? requests.find((r) => r.id === selectedRequestId) ?? null : null),
    [requests, selectedRequestId]
  );

  // Target employee for salary adjustment defaults to first eligible non-self employee
  useEffect(() => {
    if (reqCategory === 'salary_adjustment' && !targetSalaryEmpId) {
      const candidate =
        activeEmployees.find((e) => e.id !== currentUser.id && e.role !== UserRole.MainManager) ??
        activeEmployees[0];
      if (candidate) {
        setTargetSalaryEmpId(candidate.id);
        setNewBaseSalary(String(candidate.salary.baseSalary || ''));
      }
    }
  }, [reqCategory, targetSalaryEmpId, activeEmployees, currentUser.id]);

  // Live workflow chain preview inside New Request Form
  useEffect(() => {
    if (subPage !== 'new') return;
    let cancelled = false;

    if (reqCategory === 'salary_adjustment') {
      const targetEmp = targetSalaryEmpId ? empById.get(targetSalaryEmpId) : undefined;
      setPreviewSteps(
        resolveSalaryAdjustmentSteps({
          employees,
          targetEmployee: targetEmp,
        })
      );
      setLoadingPreview(false);
      return;
    }

    const assignedTemplateId = workflowAssignments[reqCategory as WorkflowModuleKey] ?? null;
    const assignedTemplate = assignedTemplateId ? templateById.get(assignedTemplateId) : undefined;
    const localFallbackSteps = resolveWorkflowStepsForEmployee({
      steps: assignedTemplate?.steps ?? [
        { stepOrder: 1, type: 'role', role: 'section_manager' },
        { stepOrder: 2, type: 'role', role: 'hr_admin' },
        { stepOrder: 3, type: 'role', role: 'main_manager' },
      ],
      employee: currentUser,
      employees,
      projects,
    });

    if (assignedTemplateId) {
      setLoadingPreview(true);
      onResolveTemplate(assignedTemplateId, currentUser.id)
        .then((resolved) => {
          if (!cancelled) {
            setPreviewSteps(resolved.length > 0 ? resolved : localFallbackSteps);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setPreviewSteps(localFallbackSteps);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false);
        });
    } else {
      setPreviewSteps(localFallbackSteps);
      setLoadingPreview(false);
    }

    return () => {
      cancelled = true;
    };
  }, [
    subPage,
    reqCategory,
    targetSalaryEmpId,
    workflowAssignments,
    templateById,
    currentUser,
    employees,
    projects,
    empById,
    onResolveTemplate,
  ]);

  const openNewRequest = () => {
    setReqCategory('custom_clock');
    setClockDate(todayIso);
    setClockInTime('08:30');
    setClockOutTime('17:30');
    setLeaveSubType('annual');
    setStartDate(todayIso);
    setEndDate(todayIso);
    setLoanAmount('2000');
    setRepaymentMonths('4');
    setStartMonth(currentMonthIso);
    setTargetSalaryEmpId('');
    setNewBaseSalary('');
    setGeneralSubject('');
    setGeneralMessage('');
    setAttachment(null);
    setReason('');
    setFormError(null);
    setSubPage('new');
  };

  const openDetail = (req: UnifiedRequest) => {
    setSelectedRequestId(req.id);
    setActionComment('');
    setBypassReason('');
    setActionError(null);
    setSubPage('detail');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setFormError(null);
    try {
      const uploaded = await onUploadAttachment(file);
      setAttachment(uploaded);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to upload file.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleSubmitNewRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (reqCategory === 'custom_clock') {
      if (!clockDate || !clockInTime || !clockOutTime) {
        setFormError('Date, Clock-In time, and Clock-Out time are required.');
        return;
      }
      if (!reason.trim()) {
        setFormError('Please provide a reason for this clock-in/out adjustment.');
        return;
      }
    } else if (reqCategory === 'time_off') {
      const days = calculateInclusiveDays(startDate, endDate);
      if (days <= 0) {
        setFormError('End date must be on or after the start date.');
        return;
      }
      if (!reason.trim()) {
        setFormError('Please provide a reason for your time-off request.');
        return;
      }
    } else if (reqCategory === 'advance_loan') {
      const amt = Number(loanAmount);
      const mos = Number(repaymentMonths);
      if (!Number.isFinite(amt) || amt <= 0) {
        setFormError('Enter a valid loan/advance amount greater than 0 AED.');
        return;
      }
      if (!Number.isFinite(mos) || mos < 1 || mos > 48) {
        setFormError('Repayment months must be between 1 and 48.');
        return;
      }
      if (!startMonth) {
        setFormError('Select a repayment start month.');
        return;
      }
      if (!reason.trim()) {
        setFormError('Please provide a reason for the advance/loan.');
        return;
      }
    } else if (reqCategory === 'salary_adjustment') {
      if (!targetSalaryEmpId) {
        setFormError('Select an employee.');
        return;
      }
      const nextSal = Number(newBaseSalary);
      if (!Number.isFinite(nextSal) || nextSal <= 0) {
        setFormError('Enter a valid new base salary greater than 0 AED.');
        return;
      }
      if (!reason.trim()) {
        setFormError('Please provide a reason for the salary adjustment.');
        return;
      }
    } else if (reqCategory === 'general') {
      if (!generalSubject.trim() || !generalMessage.trim()) {
        setFormError('Subject and message are required.');
        return;
      }
    }

    setSubmitting(true);
    try {
      const targetEmp =
        reqCategory === 'salary_adjustment' && targetSalaryEmpId
          ? empById.get(targetSalaryEmpId) ?? currentUser
          : currentUser;

      let payload: CreateUnifiedRequestInput['payload'] = {};
      let finalReason = reason.trim();

      if (reqCategory === 'custom_clock') {
        payload = { date: clockDate, clockInTime, clockOutTime };
      } else if (reqCategory === 'time_off') {
        payload = {
          leaveSubType,
          startDate,
          endDate,
          days: calculateInclusiveDays(startDate, endDate),
        };
      } else if (reqCategory === 'advance_loan') {
        const amt = Number(loanAmount);
        const mos = Math.max(1, Math.floor(Number(repaymentMonths)));
        payload = {
          amountAED: amt,
          repaymentMonths: mos,
          startMonth,
          monthlyDeductionAED: calculateLoanMonthlyDeduction(amt, mos),
        };
      } else if (reqCategory === 'salary_adjustment') {
        payload = {
          targetEmployeeId: targetEmp.id,
          targetEmployeeName: targetEmp.fullName,
          currentBaseSalaryAED: targetEmp.salary.baseSalary,
          newBaseSalaryAED: Number(newBaseSalary),
        };
      } else {
        payload = {
          subject: generalSubject.trim(),
          message: generalMessage.trim(),
          attachmentUrl: attachment?.url,
          attachmentName: attachment?.fileName,
        };
        finalReason = generalMessage.trim();
      }

      await onCreateRequest({
        category: reqCategory,
        employeeId: targetEmp.id,
        companyId: targetEmp.primaryCompanyId,
        sectionId: targetEmp.sectionId,
        reason: finalReason,
        payload,
        createdById: currentUser.id,
        createdByName: currentUser.fullName,
        createdByRole: activeRole,
      });

      setSubPage('list');
      setActiveTab('all');
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestAction = async (
    reqId: string,
    action: 'approve' | 'reject' | 'bypass',
    comment?: string
  ) => {
    setActing(true);
    setActionError(null);
    try {
      await onActionRequest({ id: reqId, action, comment });
      setActionComment('');
      setBypassReason('');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Action failed.');
    } finally {
      setActing(false);
    }
  };

  const renderRequestHeadlineSummary = (req: UnifiedRequest): string => {
    const p = req.payload;
    if (req.category === 'custom_clock') {
      return `${p.date ?? '—'} · ${p.clockInTime ?? '—'} – ${p.clockOutTime ?? '—'}`;
    }
    if (req.category === 'time_off') {
      const sub = p.leaveSubType ? getTimeOffSubTypeLabel(lang, p.leaveSubType) : t(lang, 'reqCatTimeOff');
      const days = p.days ?? (p.startDate && p.endDate ? calculateInclusiveDays(p.startDate, p.endDate) : 0);
      return `${sub} · ${p.startDate ?? '—'} → ${p.endDate ?? '—'} (${days}d)`;
    }
    if (req.category === 'advance_loan') {
      const monthly =
        p.monthlyDeductionAED ??
        calculateLoanMonthlyDeduction(p.amountAED ?? 0, p.repaymentMonths ?? 1);
      return `AED ${(p.amountAED ?? 0).toLocaleString()} · ${p.repaymentMonths ?? 1} mo (AED ${monthly.toLocaleString()}/mo from ${p.startMonth ?? '—'})`;
    }
    if (req.category === 'salary_adjustment') {
      return `AED ${(p.currentBaseSalaryAED ?? 0).toLocaleString()} → AED ${(p.newBaseSalaryAED ?? 0).toLocaleString()}`;
    }
    return p.subject || req.reason;
  };

  // ============================================================================
  // SUB-PAGE 1: NEW REQUEST FULL-PAGE FORM
  // ============================================================================
  if (subPage === 'new') {
    const timeOffDays = calculateInclusiveDays(startDate, endDate);
    const loanAmtNum = Number(loanAmount) || 0;
    const loanMosNum = Math.max(1, Math.floor(Number(repaymentMonths) || 1));
    const monthlyDeduction = calculateLoanMonthlyDeduction(loanAmtNum, loanMosNum);
    const endMonthPreview = startMonth ? addMonthsToYYYYMM(startMonth, loanMosNum - 1) : '';
    const selectedSalaryEmp = targetSalaryEmpId ? empById.get(targetSalaryEmpId) : undefined;
    const salaryDelta =
      selectedSalaryEmp && Number(newBaseSalary) > 0
        ? Number(newBaseSalary) - selectedSalaryEmp.salary.baseSalary
        : null;

    return (
      <div className="space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          breadcrumbs={[
            { label: t(lang, 'approvalsRequestsTitle'), onClick: () => setSubPage('list') },
            { label: t(lang, 'newRequestBtn') },
          ]}
          title={t(lang, 'newRequestBtn')}
          subtitle={t(lang, 'approvalsRequestsSubtitle')}
          onBack={() => setSubPage('list')}
        />

        <form onSubmit={(e) => void handleSubmitNewRequest(e)} className="max-w-4xl space-y-6">
          {formError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}

          {/* Category Selection Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            {availableCategories.map((cat) => {
              const Icon = getCategoryIcon(cat);
              const selected = reqCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => {
                    setReqCategory(cat);
                    setFormError(null);
                  }}
                  className={`flex flex-col items-start gap-2 p-3.5 rounded-xl border text-start transition-colors cursor-pointer ${
                    selected
                      ? 'border-teal-600 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                      : 'border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/70'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 ${
                      selected ? 'text-teal-600 dark:text-teal-400' : 'text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-semibold leading-snug">
                    {getRequestCategoryLabel(lang, cat)}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Live Workflow Preview Before Submitting */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                <span>{t(lang, 'approvalChainPreview')}</span>
              </p>
              {reqCategory === 'salary_adjustment' && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {t(lang, 'salaryAdjustmentPolicyNote')}
                </span>
              )}
            </div>
            {loadingPreview ? (
              <p className="text-xs text-slate-500">Resolving approvers...</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs">
                {previewSteps.map((step, idx) => {
                  const roleDisp =
                    step.type === 'role' && step.role
                      ? getWorkflowStepRoleLabel(lang, step.role)
                      : step.roleLabel;
                  return (
                    <React.Fragment key={`${step.stepOrder}-${idx}`}>
                      <span className={step.skipped ? 'text-slate-400 line-through' : ''}>
                        <span className="text-slate-500 dark:text-slate-400">{roleDisp}</span>{' '}
                        <span className="font-semibold text-teal-700 dark:text-teal-300">
                          ({step.approverName || t(lang, 'unassignedRole')})
                        </span>
                      </span>
                      {idx < previewSteps.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 rtl:rotate-180" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>

          {/* Dynamic Form Fields Card */}
          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            {reqCategory === 'custom_clock' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'clockDate')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={clockDate}
                      onChange={(e) => setClockDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'exactClockIn')} *
                    </label>
                    <input
                      type="time"
                      required
                      value={clockInTime}
                      onChange={(e) => setClockInTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'exactClockOut')} *
                    </label>
                    <input
                      type="time"
                      required
                      value={clockOutTime}
                      onChange={(e) => setClockOutTime(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
              </>
            )}

            {reqCategory === 'time_off' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'leaveSubType')} *
                    </label>
                    <select
                      value={leaveSubType}
                      onChange={(e) => setLeaveSubType(e.target.value as TimeOffSubType)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      {TIME_OFF_SUBTYPES.map((st) => (
                        <option key={st} value={st}>
                          {getTimeOffSubTypeLabel(lang, st)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'startDate')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'endDate')} *
                    </label>
                    <input
                      type="date"
                      required
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                </div>
                {timeOffDays > 0 && (
                  <p className="text-xs font-medium text-teal-700 dark:text-teal-400 font-mono tabular-nums">
                    Total duration: {timeOffDays} day{timeOffDays === 1 ? '' : 's'}
                  </p>
                )}
              </>
            )}

            {reqCategory === 'advance_loan' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'loanAmountAed')} *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={loanAmount}
                      onChange={(e) => setLoanAmount(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'repaymentMonths')} *
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="48"
                      required
                      value={repaymentMonths}
                      onChange={(e) => setRepaymentMonths(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'repaymentStartMonth')} *
                    </label>
                    <input
                      type="month"
                      required
                      value={startMonth}
                      onChange={(e) => setStartMonth(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {monthlyDeduction > 0 && (
                  <div className="rounded-lg bg-teal-50/70 dark:bg-teal-950/30 border border-teal-200/70 dark:border-teal-900/60 px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-teal-800 dark:text-teal-200">
                      {t(lang, 'loanDeductionPreviewPrefix')}{' '}
                      <span className="font-mono tabular-nums text-sm">
                        {monthlyDeduction.toLocaleString()}
                      </span>{' '}
                      {t(lang, 'loanDeductionPreviewSuffix')}
                    </span>
                    {startMonth && endMonthPreview && (
                      <span className="font-mono tabular-nums text-teal-700 dark:text-teal-300">
                        {startMonth} → {endMonthPreview} ({loanMosNum} mo)
                      </span>
                    )}
                  </div>
                )}
              </>
            )}

            {reqCategory === 'salary_adjustment' && canCreateSalaryAdjustment && (
              <>
                <div className="rounded-lg bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/70 dark:border-amber-900/60 px-4 py-3 text-xs font-medium text-amber-800 dark:text-amber-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0" />
                  <span>{t(lang, 'salaryAdjustmentPolicyNote')}</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'selectEmployee')} *
                    </label>
                    <select
                      required
                      value={targetSalaryEmpId}
                      onChange={(e) => {
                        const nextId = e.target.value;
                        setTargetSalaryEmpId(nextId);
                        const emp = empById.get(nextId);
                        if (emp) setNewBaseSalary(String(emp.salary.baseSalary || ''));
                      }}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="">{t(lang, 'selectEmployee')}</option>
                      {activeEmployees
                        .filter((e) => e.role !== UserRole.MainManager)
                        .map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} ({emp.employeeCode}) — Current: AED{' '}
                            {emp.salary.baseSalary.toLocaleString()}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      {t(lang, 'newBaseSalaryAed')} *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      required
                      value={newBaseSalary}
                      onChange={(e) => setNewBaseSalary(e.target.value)}
                      className="w-full px-3 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono tabular-nums text-slate-900 dark:text-white"
                    />
                  </div>
                </div>

                {selectedSalaryEmp && (
                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
                    <span>
                      {t(lang, 'currentBaseSalary')}:{' '}
                      <strong className="font-mono tabular-nums text-slate-900 dark:text-white">
                        AED {selectedSalaryEmp.salary.baseSalary.toLocaleString()}
                      </strong>
                    </span>
                    {salaryDelta !== null && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span
                          className={`font-mono tabular-nums font-semibold ${
                            salaryDelta >= 0
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : 'text-rose-700 dark:text-rose-400'
                          }`}
                        >
                          {salaryDelta >= 0 ? '+' : ''}
                          AED {salaryDelta.toLocaleString()}
                        </span>
                      </>
                    )}
                  </div>
                )}
              </>
            )}

            {reqCategory === 'general' && (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'requestSubject')} *
                  </label>
                  <input
                    type="text"
                    required
                    value={generalSubject}
                    onChange={(e) => setGeneralSubject(e.target.value)}
                    placeholder="e.g. Official Salary Certificate / NOC Request"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    {t(lang, 'requestMessage')} *
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={generalMessage}
                    onChange={(e) => setGeneralMessage(e.target.value)}
                    placeholder="Provide details for HR or Management..."
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                  />
                </div>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                    {t(lang, 'fileAttachment')}
                  </label>
                  {attachment ? (
                    <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 text-xs">
                      <span className="flex items-center gap-2 font-medium text-teal-800 dark:text-teal-200 truncate">
                        <Paperclip className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{attachment.fileName}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => setAttachment(null)}
                        className="inline-flex items-center gap-1 text-rose-600 hover:text-rose-700 font-semibold cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>{t(lang, 'removeAttachment')}</span>
                      </button>
                    </div>
                  ) : (
                    <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/40 text-xs font-medium text-slate-700 dark:text-slate-300 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 cursor-pointer transition-colors">
                      <Upload className="w-4 h-4" />
                      <span>{uploading ? t(lang, 'uploadingFile') : t(lang, 'uploadAttachment')}</span>
                      <input
                        type="file"
                        disabled={uploading}
                        onChange={(e) => void handleFileChange(e)}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </>
            )}

            {/* Reason field for non-general categories */}
            {reqCategory !== 'general' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  {t(lang, 'reason')} *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter reason or supporting notes..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white"
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSubPage('list')}
                disabled={submitting}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                disabled={submitting || uploading}
                className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? '...' : t(lang, 'submitRequest')}
              </button>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // ============================================================================
  // SUB-PAGE 2: FULL-PAGE REQUEST DETAIL & APPROVAL TIMELINE / AUDIT LOG
  // ============================================================================
  if (subPage === 'detail' && selectedRequest) {
    const emp = empById.get(selectedRequest.employeeId);
    const perm = canActOnUnifiedRequest({
      request: selectedRequest,
      currentUser,
      activeRole,
      projects,
    });
    const CatIcon = getCategoryIcon(selectedRequest.category);

    return (
      <div className="space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          breadcrumbs={[
            { label: t(lang, 'approvalsRequestsTitle'), onClick: () => setSubPage('list') },
            { label: getRequestCategoryLabel(lang, selectedRequest.category) },
          ]}
          title={
            selectedRequest.category === 'general' && selectedRequest.payload.subject
              ? selectedRequest.payload.subject
              : getRequestCategoryLabel(lang, selectedRequest.category)
          }
          subtitle={`${selectedRequest.employeeName || emp?.fullName || 'Employee'} · ${formatDateTimeShort(selectedRequest.createdAt)}`}
          onBack={() => setSubPage('list')}
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Left 2 Columns: Request Details + Approval Actions + Audit Log */}
          <div className="lg:col-span-2 space-y-6">
            {/* Request Summary Card */}
            <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2.5 text-sm font-semibold text-slate-900 dark:text-white">
                  <CatIcon className="w-4 h-4 text-teal-600" />
                  <span>{getRequestCategoryLabel(lang, selectedRequest.category)}</span>
                </div>
                <div
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold ${getStatusColorClass(
                    selectedRequest.status
                  )}`}
                >
                  {selectedRequest.status === 'approved' && <CheckCircle2 className="w-4 h-4" />}
                  {selectedRequest.status === 'bypassed' && <Zap className="w-4 h-4" />}
                  {selectedRequest.status === 'rejected' && <XCircle className="w-4 h-4" />}
                  {selectedRequest.status === 'pending' && <Clock className="w-4 h-4" />}
                  <span>{getRequestStatusLabel(lang, selectedRequest.status)}</span>
                </div>
              </div>

              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t(lang, 'employee')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedRequest.employeeName || emp?.fullName || selectedRequest.employeeId}
                  </dd>
                </div>
                <div>
                  <dt className="text-slate-500 dark:text-slate-400">{t(lang, 'submittedBy')}</dt>
                  <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                    {selectedRequest.createdByName || '—'} ·{' '}
                    <span className="font-mono tabular-nums font-normal text-slate-500">
                      {formatDateTimeShort(selectedRequest.createdAt)}
                    </span>
                  </dd>
                </div>

                {selectedRequest.category === 'custom_clock' && (
                  <>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">{t(lang, 'clockDate')}</dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedRequest.payload.date ?? '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t(lang, 'exactClockIn')} / {t(lang, 'exactClockOut')}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedRequest.payload.clockInTime ?? '—'} →{' '}
                        {selectedRequest.payload.clockOutTime ?? '—'}
                      </dd>
                    </div>
                  </>
                )}

                {selectedRequest.category === 'time_off' && (
                  <>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">{t(lang, 'leaveSubType')}</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedRequest.payload.leaveSubType
                          ? getTimeOffSubTypeLabel(lang, selectedRequest.payload.leaveSubType)
                          : '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Dates</dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                        {selectedRequest.payload.startDate ?? '—'} →{' '}
                        {selectedRequest.payload.endDate ?? '—'} (
                        {selectedRequest.payload.days ?? 0}d)
                      </dd>
                    </div>
                  </>
                )}

                {selectedRequest.category === 'advance_loan' && (
                  <>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t(lang, 'loanAmountAed')}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                        AED {(selectedRequest.payload.amountAED ?? 0).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">Repayment Plan</dt>
                      <dd className="font-mono tabular-nums font-semibold text-teal-700 dark:text-teal-300 mt-0.5">
                        AED{' '}
                        {(
                          selectedRequest.payload.monthlyDeductionAED ??
                          calculateLoanMonthlyDeduction(
                            selectedRequest.payload.amountAED ?? 0,
                            selectedRequest.payload.repaymentMonths ?? 1
                          )
                        ).toLocaleString()}
                        /mo × {selectedRequest.payload.repaymentMonths ?? 1} mo (from{' '}
                        {selectedRequest.payload.startMonth ?? '—'})
                      </dd>
                    </div>
                  </>
                )}

                {selectedRequest.category === 'salary_adjustment' && (
                  <>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t(lang, 'currentBaseSalary')}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold text-slate-900 dark:text-white mt-0.5">
                        AED {(selectedRequest.payload.currentBaseSalaryAED ?? 0).toLocaleString()}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500 dark:text-slate-400">
                        {t(lang, 'newBaseSalaryAed')}
                      </dt>
                      <dd className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 mt-0.5">
                        AED {(selectedRequest.payload.newBaseSalaryAED ?? 0).toLocaleString()}
                      </dd>
                    </div>
                  </>
                )}
              </dl>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {selectedRequest.category === 'general'
                    ? t(lang, 'requestMessage')
                    : t(lang, 'reason')}
                </p>
                <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selectedRequest.payload.message || selectedRequest.reason || '—'}
                </p>
                {selectedRequest.payload.attachmentName && (
                  <div className="pt-2">
                    {selectedRequest.payload.attachmentUrl ? (
                      <a
                        href={selectedRequest.payload.attachmentUrl}
                        download={selectedRequest.payload.attachmentName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-teal-700 dark:text-teal-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{selectedRequest.payload.attachmentName}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Paperclip className="w-3.5 h-3.5" />
                        <span>{selectedRequest.payload.attachmentName}</span>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </section>

            {/* Approval Actions Panel */}
            {selectedRequest.status === 'pending' && (
              <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
                {actionError && (
                  <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
                    {actionError}
                  </div>
                )}

                {perm.isSelf ? (
                  <div className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-400">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <div>
                      <span className="font-semibold text-slate-800 dark:text-slate-200">
                        {t(lang, 'pendingReviewerBadge')}
                      </span>
                      <span className="mx-1.5 text-slate-300">·</span>
                      <span>{t(lang, 'selfApprovalBlockedNote')}</span>
                    </div>
                  </div>
                ) : !perm.canApproveReject && !perm.canBypass ? (
                  <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>
                      {t(lang, 'pendingReviewerBadge')}:{' '}
                      <strong className="text-slate-800 dark:text-slate-200">
                        {perm.activeStep?.approverName ||
                          (perm.activeStep?.role
                            ? getWorkflowStepRoleLabel(lang, perm.activeStep.role)
                            : 'Approver')}
                      </strong>
                    </span>
                  </div>
                ) : (
                  <div className="space-y-5">
                    {perm.canApproveReject && (
                      <div className="space-y-3">
                        <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {t(lang, 'stepLabel')} {perm.activeStep?.stepOrder}:{' '}
                          {perm.activeStep?.role
                            ? getWorkflowStepRoleLabel(lang, perm.activeStep.role)
                            : perm.activeStep?.approverName}
                        </label>
                        <textarea
                          rows={2}
                          value={actionComment}
                          onChange={(e) => setActionComment(e.target.value)}
                          placeholder={t(lang, 'optionalCommentPlaceholder')}
                          className="w-full px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                        />
                        <div className="flex flex-wrap items-center gap-2.5">
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() =>
                              void handleRequestAction(selectedRequest.id, 'approve', actionComment)
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>{t(lang, 'approveRequest')}</span>
                          </button>
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() =>
                              void handleRequestAction(selectedRequest.id, 'reject', actionComment)
                            }
                            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>{t(lang, 'rejectRequest')}</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Exclusive HR Manager / Main Manager Bypass & Approve */}
                    {perm.canBypass && (
                      <div
                        className={`space-y-3 ${
                          perm.canApproveReject
                            ? 'pt-4 border-t border-slate-100 dark:border-slate-800'
                            : ''
                        }`}
                      >
                        <div className="flex items-center gap-2 text-xs font-semibold text-teal-700 dark:text-teal-300">
                          <Zap className="w-4 h-4" />
                          <span>{t(lang, 'bypassAndApprove')}</span>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2.5">
                          <input
                            type="text"
                            value={bypassReason}
                            onChange={(e) => setBypassReason(e.target.value)}
                            placeholder={t(lang, 'bypassReasonPlaceholder')}
                            className="flex-1 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                          />
                          <button
                            type="button"
                            disabled={acting}
                            onClick={() =>
                              void handleRequestAction(selectedRequest.id, 'bypass', bypassReason)
                            }
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-50 whitespace-nowrap shrink-0"
                          >
                            <Zap className="w-3.5 h-3.5" />
                            <span>{t(lang, 'bypassAndApprove')}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>
            )}

            {/* Audit Log */}
            <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'auditLogTitle')}
                </h2>
              </div>
              {selectedRequest.auditLog.length === 0 ? (
                <p className="p-6 text-xs text-slate-500">No audit entries recorded yet.</p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {selectedRequest.auditLog.map((entry) => {
                    const actionLabel =
                      entry.action === 'approved'
                        ? t(lang, 'actionApproved')
                        : entry.action === 'rejected'
                          ? t(lang, 'actionRejected')
                          : entry.action === 'bypassed'
                            ? t(lang, 'actionBypassed')
                            : t(lang, 'actionSubmitted');
                    return (
                      <div
                        key={entry.id}
                        className="px-6 py-3.5 flex flex-col sm:flex-row sm:items-start justify-between gap-2 text-xs"
                      >
                        <div className="space-y-0.5 min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {actionLabel}
                            {entry.stepOrder ? ` (${t(lang, 'stepLabel')} ${entry.stepOrder})` : ''}
                          </p>
                          <p className="text-slate-500 dark:text-slate-400">
                            {entry.actorName}
                            {entry.actorRole ? ` · ${getRoleLabel(lang, entry.actorRole)}` : ''}
                          </p>
                          {entry.comment && (
                            <p className="text-slate-700 dark:text-slate-300 pt-1">
                              “{entry.comment}”
                            </p>
                          )}
                        </div>
                        <span className="font-mono tabular-nums text-[11px] text-slate-400 shrink-0">
                          {formatDateTimeShort(entry.timestamp)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>

          {/* Right Column: Visual Approval Timeline */}
          <aside className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(lang, 'approvalTimelineTitle')}
              </h2>
              {selectedRequest.workflowTemplateName && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {selectedRequest.workflowTemplateName}
                </p>
              )}
            </div>

            <ol className="space-y-4">
              {selectedRequest.steps.map((step, idx) => {
                const isActive =
                  selectedRequest.status === 'pending' && idx === selectedRequest.currentStepIndex;
                const roleDisplay =
                  step.type === 'role' && step.role
                    ? getWorkflowStepRoleLabel(lang, step.role)
                    : step.roleLabel || t(lang, 'stepTypeEmployee');
                return (
                  <li key={`${step.stepOrder}-${idx}`} className="flex items-start gap-3">
                    <div className="flex flex-col items-center shrink-0">
                      <span
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono tabular-nums font-semibold border ${
                          step.status === 'approved'
                            ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-700 dark:text-emerald-300'
                            : step.status === 'bypassed'
                              ? 'bg-teal-50 dark:bg-teal-950/50 border-teal-500 text-teal-700 dark:text-teal-300'
                              : step.status === 'rejected'
                                ? 'bg-rose-50 dark:bg-rose-950/50 border-rose-500 text-rose-700 dark:text-rose-300'
                                : isActive
                                  ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-500 text-amber-700 dark:text-amber-300'
                                  : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        {step.stepOrder}
                      </span>
                      {idx < selectedRequest.steps.length - 1 && (
                        <span className="w-px h-8 bg-slate-200 dark:bg-slate-800 my-1" />
                      )}
                    </div>

                    <div className="min-w-0 flex-1 pt-0.5 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {roleDisplay}
                        </p>
                        <span
                          className={`text-[11px] font-semibold shrink-0 ${getStatusColorClass(
                            step.status
                          )}`}
                        >
                          {getRequestStatusLabel(lang, step.status)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-600 dark:text-slate-300">
                        {step.actorName || step.approverName || t(lang, 'unassignedRole')}
                      </p>
                      {step.comment && (
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          “{step.comment}”
                        </p>
                      )}
                      {step.decidedAt && (
                        <p className="text-[11px] font-mono tabular-nums text-slate-400">
                          {formatDateTimeShort(step.decidedAt)}
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </aside>
        </div>
      </div>
    );
  }

  // ============================================================================
  // MAIN PAGE: APPROVALS & REQUESTS (2 CLEAN TABS)
  // ============================================================================
  const displayedRequests = activeTab === 'pending' ? pendingMyApproval : filteredAllRequests;
  const hasActiveFilters =
    categoryFilter !== 'all' || statusFilter !== 'all' || onlyMine || searchQuery.trim().length > 0;
  const isManagerOrHR =
    isAdminOrHRRole(activeRole) ||
    activeRole === UserRole.SectionManager ||
    activeRole === UserRole.SectionCoManager;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <ClipboardCheck className="w-5 h-5 text-teal-600" />
            <span>{t(lang, 'approvalsRequestsTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'approvalsRequestsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openNewRequest}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'newRequestBtn')}</span>
        </button>
      </div>

      {/* Two Clean Tabs + Filters */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-800/90 self-start">
          <button
            type="button"
            onClick={() => setActiveTab('pending')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'pending'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{t(lang, 'tabPendingMyApproval')}</span>
            <span className="font-mono tabular-nums text-[11px] font-bold text-teal-700 dark:text-teal-400">
              {pendingMyApproval.length}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              activeTab === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>{isManagerOrHR ? t(lang, 'tabMyAllRequests') : t(lang, 'tabMyRequestsOnly')}</span>
            <span className="font-mono tabular-nums text-[11px] text-slate-400">
              {filteredAllRequests.length}
            </span>
          </button>
        </div>

        {/* Filters on Tab 2 */}
        {activeTab === 'all' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t(lang, 'search')}
                className="ps-8 pe-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-100 w-44"
              />
            </div>

            <select
              aria-label={t(lang, 'filterAllCategories')}
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'filterAllCategories')}</option>
              {ALL_REQUEST_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {getRequestCategoryLabel(lang, cat)}
                </option>
              ))}
            </select>

            <select
              aria-label={t(lang, 'filterAllStatuses')}
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'filterAllStatuses')}</option>
              {STATUS_FILTER_OPTIONS.map((st) => (
                <option key={st} value={st}>
                  {getRequestStatusLabel(lang, st)}
                </option>
              ))}
            </select>

            {isManagerOrHR && (
              <button
                type="button"
                onClick={() => setOnlyMine((v) => !v)}
                className={`px-3 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  onlyMine
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                }`}
              >
                {t(lang, 'tabMyRequestsOnly')}
              </button>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('all');
                  setStatusFilter('all');
                  setOnlyMine(false);
                  setSearchQuery('');
                }}
                className="px-2.5 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 cursor-pointer whitespace-nowrap"
              >
                {t(lang, 'clearFilters')}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Requests List */}
      {displayedRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <ClipboardCheck className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {activeTab === 'pending' ? t(lang, 'noPendingApprovals') : t(lang, 'noRequestsFound')}
          </p>
          <button
            type="button"
            onClick={openNewRequest}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t(lang, 'newRequestBtn')}</span>
          </button>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {displayedRequests.map((req) => {
            const emp = empById.get(req.employeeId);
            const CatIcon = getCategoryIcon(req.category);
            const perm = canActOnUnifiedRequest({
              request: req,
              currentUser,
              activeRole,
              projects,
            });
            const activeStep = perm.activeStep;

            return (
              <div
                key={req.id}
                className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="space-y-1.5 min-w-0 flex-1">
                  {/* Primary Title + Quiet Unboxed Metadata */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <CatIcon className="w-4 h-4 text-teal-600 shrink-0" />
                    <button
                      type="button"
                      onClick={() => openDetail(req)}
                      className="text-sm font-semibold text-slate-900 dark:text-white hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer text-start"
                    >
                      {req.employeeName || emp?.fullName || 'Employee'} —{' '}
                      {getRequestCategoryLabel(lang, req.category)}
                    </button>
                    <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                      ·
                    </span>
                    <span className="text-xs font-mono tabular-nums text-slate-500">
                      {formatDateTimeShort(req.createdAt)}
                    </span>
                  </div>

                  {/* Category Key Data Summary */}
                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 font-mono tabular-nums">
                    {renderRequestHeadlineSummary(req)}
                  </p>

                  {/* Reason & Active Step Chain Summary */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                    <span className="truncate max-w-xl">{req.reason}</span>
                    {req.status === 'pending' && activeStep && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="text-slate-600 dark:text-slate-300">
                          {t(lang, 'stepLabel')} {activeStep.stepOrder}/{req.steps.length}:{' '}
                          <strong>
                            {activeStep.approverName ||
                              (activeStep.role
                                ? getWorkflowStepRoleLabel(lang, activeStep.role)
                                : 'Approver')}
                          </strong>
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Right Status & Action Controls */}
                <div className="flex flex-wrap items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold ${getStatusColorClass(
                      req.status
                    )}`}
                  >
                    {req.status === 'approved' && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {req.status === 'bypassed' && <Zap className="w-3.5 h-3.5" />}
                    {req.status === 'rejected' && <XCircle className="w-3.5 h-3.5" />}
                    {req.status === 'pending' && <Clock className="w-3.5 h-3.5" />}
                    <span>
                      {req.status === 'pending' && perm.isSelf
                        ? t(lang, 'pendingReviewerBadge')
                        : getRequestStatusLabel(lang, req.status)}
                    </span>
                  </span>

                  <button
                    type="button"
                    onClick={() => openDetail(req)}
                    className="px-3.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:border-teal-500 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {t(lang, 'viewDetails')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
