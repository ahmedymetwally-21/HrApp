import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  FileText,
  Infinity as InfinityIcon,
  Landmark,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  getDeductionBucketLabel,
  getDeductionWorkflowChainLabel,
  getEmployeeTypeLabel,
  getLeaveStatusLabel,
  getPatchBucketLabel,
  getPaymentMethodLabel,
  getPayrollEntryTypeLabel,
  getRoleLabel,
  getSalaryStatusLabel,
  t,
} from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AttendanceLog,
  BuiltInDocumentType,
  Company,
  DeductionApprovalRequest,
  DeductionWorkflowConfig,
  DocumentTypeValue,
  Employee,
  EmployeeDocument,
  EmployeeLabel,
  EmployeeModel,
  GeofenceZone,
  Language,
  LeaveRequest,
  PatchMoneyRelease,
  PayrollAdjustment,
  PayrollEntry,
  ProAssignment,
  SalaryReleaseSchedule,
  Section,
  ShiftSchedule,
  UserRole,
  Weekday,
} from '../types/hr';
import {
  calculateEmployeePayroll,
  calculateEmployeePendingBalances,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  formatAED,
  formatShortDate,
  formatTime,
  getDocumentExpiryStatus,
  getDocumentPreviewSource,
  getEffectiveShiftEnd,
  getEffectiveShiftStart,
  getMissingModelDocuments,
  inferDefaultEmployeeType,
  isAttendanceTracked,
  isPayrollEligible,
  isPayrollEntryActiveInMonth,
  resolveEmployeeDeductionWorkflow,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface EmployeeProfilePageProps {
  lang: Language;
  employee: Employee;
  activeRole: UserRole;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  models: EmployeeModel[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  payrollAdjustments: PayrollAdjustment[];
  payrollEntries: PayrollEntry[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
  deductionWorkflowConfig?: DeductionWorkflowConfig;
  salaryReleases: SalaryReleaseSchedule[];
  customDocumentTypes: string[];
  activeProAssignment?: ProAssignment;
  initialTab?: 'profile' | 'salary' | 'documents' | 'attendance';
  onBack: () => void;
  onEdit: (emp: Employee) => void;
  onProposeShift: (employeeId: string, schedule: ShiftSchedule) => Promise<void>;
  onDecideShiftProposal: (employeeId: string, approve: boolean) => Promise<void>;
  onUploadDocument: (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
}

const ALL_WEEKDAYS: Weekday[] = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600';

export const EmployeeProfilePage: React.FC<EmployeeProfilePageProps> = ({
  lang,
  employee,
  activeRole,
  companies,
  sections,
  labels,
  models,
  geofences,
  documents,
  attendance,
  leaves,
  payrollAdjustments,
  payrollEntries,
  deductionApprovals = [],
  patchReleases = [],
  deductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  salaryReleases,
  customDocumentTypes,
  activeProAssignment,
  initialTab = 'profile',
  onBack,
  onEdit,
  onProposeShift,
  onDecideShiftProposal,
  onUploadDocument,
  onDeleteDocument,
}) => {
  const canManageStaff =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;
  const canApproveShift =
    activeRole === UserRole.MainManager || activeRole === UserRole.SectionManager;
  const isPro = activeRole === UserRole.PRO;

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const geofenceMap = useMemo(() => new Map(geofences.map((z) => [z.id, z])), [geofences]);

  const model = modelMap.get(employee.modelId) ?? models[0];
  const currentMonth = new Date().toISOString().slice(0, 7);

  const empDocs = useMemo(
    () => documents.filter((d) => d.employeeId === employee.id),
    [documents, employee.id]
  );
  const missingDocs = useMemo(
    () => getMissingModelDocuments(empDocs, model),
    [empDocs, model]
  );
  const empAttendance = useMemo(
    () =>
      isAttendanceTracked(employee)
        ? attendance.filter((a) => a.employeeId === employee.id).slice(0, 15)
        : [],
    [attendance, employee]
  );
  const empLeaves = useMemo(
    () => leaves.filter((l) => l.employeeId === employee.id).slice(0, 10),
    [leaves, employee.id]
  );

  const payrollRow = useMemo(
    () =>
      !isPro && isPayrollEligible(employee)
        ? calculateEmployeePayroll(
            employee,
            currentMonth,
            payrollAdjustments,
            attendance,
            salaryReleases,
            payrollEntries,
            leaves,
            deductionApprovals,
            patchReleases
          )
        : null,
    [
      employee,
      isPro,
      currentMonth,
      payrollAdjustments,
      attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases,
    ]
  );

  const pendingBalances = useMemo(() => {
    if (isPro || !isPayrollEligible(employee)) return [];
    return calculateEmployeePendingBalances({
      employee,
      currentMonth,
      adjustments: payrollAdjustments,
      attendanceLogs: attendance,
      salaryReleases,
      payrollEntries,
      leaves,
      deductionApprovals,
      patchReleases,
    });
  }, [
    employee,
    isPro,
    currentMonth,
    payrollAdjustments,
    attendance,
    salaryReleases,
    payrollEntries,
    leaves,
    deductionApprovals,
    patchReleases,
  ]);

  const empPatchReleases = useMemo(() => {
    if (isPro) return [];
    return patchReleases
      .filter((r) => r.employeeId === employee.id)
      .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  }, [patchReleases, employee.id, isPro]);

  const permanentEarnings = useMemo(() => {
    if (isPro) return [];
    return payrollEntries.filter(
      (e) =>
        e.employeeId === employee.id &&
        e.isPermanent &&
        (e.type === 'earning_in_payroll' || e.type === 'earning_off_cycle') &&
        isPayrollEntryActiveInMonth(e, currentMonth)
    );
  }, [payrollEntries, employee.id, isPro, currentMonth]);

  const temporaryEntries = useMemo(() => {
    if (isPro) return [];
    return payrollEntries
      .filter((e) => e.employeeId === employee.id && !e.isPermanent)
      .sort((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom));
  }, [payrollEntries, employee.id, isPro]);

  const availableTabs = useMemo(() => {
    const tabs: { id: 'profile' | 'salary' | 'documents' | 'attendance'; label: string }[] = [
      { id: 'profile', label: t(lang, 'profileTab') },
    ];
    if (!isPro && isPayrollEligible(employee)) {
      tabs.push({ id: 'salary', label: t(lang, 'salaryPackageTab') });
    }
    tabs.push({ id: 'documents', label: t(lang, 'documentsTab') });
    if (!isPro && isAttendanceTracked(employee)) {
      tabs.push({ id: 'attendance', label: t(lang, 'attendanceLeavesTab') });
    }
    return tabs;
  }, [employee, isPro, lang]);

  const [tab, setTab] = useState<'profile' | 'salary' | 'documents' | 'attendance'>(
    initialTab
  );
  const effectiveTab = availableTabs.some((tb) => tb.id === tab)
    ? tab
    : availableTabs[0]?.id ?? 'profile';

  // Shift proposal form
  const [showShiftForm, setShowShiftForm] = useState(false);
  const [shiftStartDraft, setShiftStartDraft] = useState('08:00');
  const [shiftEndDraft, setShiftEndDraft] = useState('17:00');
  const [shiftDaysDraft, setShiftDaysDraft] = useState<Weekday[]>([
    'Sat',
    'Sun',
    'Mon',
    'Tue',
    'Wed',
    'Thu',
  ]);

  // Document Upload & Preview & Delete confirm
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [deleteDocTarget, setDeleteDocTarget] = useState<EmployeeDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docForm, setDocForm] = useState({
    type: BuiltInDocumentType.Passport as DocumentTypeValue,
    documentNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    fileName: '',
    fileType: '',
    fileDataUrl: '',
    notes: '',
  });

  const allDocTypes: DocumentTypeValue[] = useMemo(
    () => [
      BuiltInDocumentType.Passport,
      BuiltInDocumentType.EmiratesID,
      BuiltInDocumentType.Visa,
      BuiltInDocumentType.LaborCard,
      BuiltInDocumentType.EmploymentContract,
      BuiltInDocumentType.DrivingLicense,
      ...customDocumentTypes,
    ],
    [customDocumentTypes]
  );

  const handleFilePicked = async (file: File | null) => {
    if (!file) return;
    setDocError(null);
    try {
      const res = await nativeBridge.readFileAsDocument(file);
      setDocForm((p) => ({
        ...p,
        fileName: res.fileName,
        fileType: res.mimeType,
        fileDataUrl: res.dataUrl,
      }));
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Unable to read file.');
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!docForm.documentNumber.trim() || !docForm.expiryDate || !docForm.fileName) {
      setDocError('Document number, expiry date, and attached file are required.');
      return;
    }
    await onUploadDocument({
      employeeId: employee.id,
      type: docForm.type,
      documentNumber: docForm.documentNumber.trim(),
      issueDate: docForm.issueDate,
      expiryDate: docForm.expiryDate,
      fileName: docForm.fileName,
      fileType: docForm.fileType || 'application/pdf',
      fileDataUrl: docForm.fileDataUrl || undefined,
      notes: docForm.notes.trim() || undefined,
    });
    setDocForm({
      type: BuiltInDocumentType.Passport,
      documentNumber: '',
      issueDate: new Date().toISOString().slice(0, 10),
      expiryDate: '',
      fileName: '',
      fileType: '',
      fileDataUrl: '',
      notes: '',
    });
    setDocError(null);
  };

  const handleSubmitShiftProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (shiftDaysDraft.length === 0) return;
    await onProposeShift(employee.id, {
      shiftStart: shiftStartDraft,
      shiftEnd: shiftEndDraft,
      workingDays: shiftDaysDraft,
    });
    setShowShiftForm(false);
  };

  const previewSource = previewDoc ? getDocumentPreviewSource(previewDoc) : null;
  const primaryCompany = companyMap.get(employee.primaryCompanyId);
  const empSection = sectionMap.get(employee.sectionId);

  return (
    <div className="space-y-6">
      <PageBreadcrumbHeader
        lang={lang}
        onBack={onBack}
        breadcrumbs={[
          { label: t(lang, 'navGroupPeople') },
          { label: t(lang, 'navDirectory'), onClick: onBack },
          { label: employee.fullName },
        ]}
        title={employee.fullName}
        subtitle={`${employee.jobTitle || getRoleLabel(lang, employee.role)} · ${employee.employeeCode}`}
        actions={
          canManageStaff ? (
            <button
              type="button"
              onClick={() => onEdit(employee)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>{t(lang, 'editEmployee')}</span>
            </button>
          ) : undefined
        }
      />

      {/* Clean Profile Header Card + Horizontal Tabs */}
      <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar src={employee.avatarUrl} name={employee.fullName} size="lg" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white truncate">
                  {employee.fullName}
                </h2>
                <span
                  className={`text-xs font-semibold ${
                    employee.active
                      ? 'text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-500'
                  }`}
                >
                  {employee.active ? t(lang, 'activeStatus') : t(lang, 'disabledStatus')}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-mono text-slate-700 dark:text-slate-300">
                  {employee.employeeCode}
                </span>
                <span aria-hidden="true">·</span>
                <span>{employee.jobTitle || getRoleLabel(lang, employee.role)}</span>
                <span aria-hidden="true">·</span>
                <span>{primaryCompany?.name ?? '—'}</span>
                <span aria-hidden="true">·</span>
                <span>{empSection?.name ?? '—'}</span>
              </p>
              <p className="text-xs text-slate-400 mt-0.5">
                {employee.email}
                {employee.phone ? ` · ${employee.phone}` : ''}
              </p>
            </div>
          </div>

          {employee.labelIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 shrink-0">
              {employee.labelIds
                .map((id) => labelMap.get(id))
                .filter((l): l is EmployeeLabel => Boolean(l))
                .map((lbl) => (
                  <span
                    key={lbl.id}
                    style={{ color: lbl.color }}
                    className="font-semibold text-xs"
                  >
                    #{lbl.name}
                  </span>
                ))}
            </div>
          )}
        </div>

        {/* Clean Horizontal Underline Tabs */}
        <div
          role="tablist"
          className="px-6 border-t border-slate-100 dark:border-slate-800 flex items-center gap-6 overflow-x-auto"
        >
          {availableTabs.map((item) => {
            const active = effectiveTab === item.id;
            return (
              <button
                key={item.id}
                role="tab"
                aria-selected={active}
                type="button"
                onClick={() => setTab(item.id)}
                className={`py-3.5 text-xs sm:text-sm font-semibold border-b-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'border-teal-600 text-teal-700 dark:text-teal-300'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ====================================================================
          TAB 1: PROFILE
         ==================================================================== */}
      {effectiveTab === 'profile' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              Employment Details
            </h3>
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 text-xs">
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">Primary Company</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {primaryCompany?.name ?? '—'}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">Shared Companies</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {employee.sharedCompanyIds.length > 0
                    ? employee.sharedCompanyIds
                        .map((id) => companyMap.get(id)?.name)
                        .filter(Boolean)
                        .join(', ')
                    : 'None'}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">Section &amp; System Role</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {empSection?.name ?? '—'} · {getRoleLabel(lang, employee.role)}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">{t(lang, 'employeeType')}</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {getEmployeeTypeLabel(
                    lang,
                    employee.employeeType ?? inferDefaultEmployeeType(employee)
                  )}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">Employee Model</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {model?.name ?? 'Default'}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">Join Date</dt>
                <dd className="mt-1 font-semibold font-mono text-slate-900 dark:text-white">
                  {formatShortDate(employee.joinDate)}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">{t(lang, 'mohrePersonId')}</dt>
                <dd className="mt-1 font-semibold font-mono text-slate-900 dark:text-white">
                  {employee.mohrePersonId || '—'}
                </dd>
              </div>
              <div className="pb-3 border-b border-slate-100 dark:border-slate-800">
                <dt className="text-slate-500">{t(lang, 'deductionWorkflowOverride')}</dt>
                <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {getDeductionWorkflowChainLabel(
                    lang,
                    resolveEmployeeDeductionWorkflow(employee, deductionWorkflowConfig)
                  )}
                  {employee.deductionWorkflowOverride &&
                    employee.deductionWorkflowOverride !== 'inherit' && (
                      <span className="ms-1.5 text-[11px] font-medium text-teal-700 dark:text-teal-400">
                        (Override)
                      </span>
                    )}
                </dd>
              </div>
            </dl>

            {(employee.role === UserRole.SectionManager ||
              employee.role === UserRole.SectionCoManager) && (
              <div className="pt-2 text-xs">
                <p className="text-slate-500">{t(lang, 'managedSections')}</p>
                <p className="mt-1 font-semibold text-slate-900 dark:text-white">
                  {employee.managedSectionIds
                    .map((id) => sectionMap.get(id)?.name)
                    .filter(Boolean)
                    .join(' · ') || empSection?.name}
                </p>
              </div>
            )}

            {isPro && activeProAssignment && (
              <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 p-4 text-xs">
                <p className="font-semibold text-teal-900 dark:text-teal-200">
                  PRO Document Access Window
                </p>
                <p className="mt-1 text-slate-600 dark:text-slate-300">
                  {t(lang, 'accessExpires')}:{' '}
                  <strong>{formatShortDate(activeProAssignment.accessExpiresAt)}</strong>
                  {activeProAssignment.notes ? ` — ${activeProAssignment.notes}` : ''}
                </p>
              </div>
            )}
          </section>

          {/* Right column: Shift & Geofences */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            {employee.role === UserRole.MainManager ? (
              <div className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                <p className="font-semibold text-slate-900 dark:text-white mb-1">
                  Executive Exemption
                </p>
                Main Manager accounts are exempt from attendance tracking, geofence restrictions,
                and monthly payroll calculations.
              </div>
            ) : (
              <>
                {!isPro && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        Fixed Shift Schedule
                      </h3>
                      {canManageStaff && (
                        <button
                          type="button"
                          onClick={() => {
                            setShiftStartDraft(
                              model ? getEffectiveShiftStart(employee, model) : '08:00'
                            );
                            setShiftEndDraft(
                              model ? getEffectiveShiftEnd(employee, model) : '17:00'
                            );
                            setShiftDaysDraft(
                              employee.customShift?.workingDays ??
                                model?.workingDays ?? [
                                  'Sat',
                                  'Sun',
                                  'Mon',
                                  'Tue',
                                  'Wed',
                                  'Thu',
                                ]
                            );
                            setShowShiftForm((s) => !s);
                          }}
                          className="text-xs font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
                        >
                          Propose Shift
                        </button>
                      )}
                    </div>
                    <p className="text-sm font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
                      {model ? getEffectiveShiftStart(employee, model) : '08:00'} –{' '}
                      {model ? getEffectiveShiftEnd(employee, model) : '17:00'}
                    </p>
                    <p className="text-xs text-slate-500">
                      {(employee.customShift?.workingDays ?? model?.workingDays ?? []).join(' · ')}
                    </p>

                    {employee.pendingShiftProposal && (
                      <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-3.5 space-y-2 text-xs">
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                          {t(lang, 'pendingManagerApproval')}
                        </p>
                        <p className="font-mono text-amber-800 dark:text-amber-300">
                          {employee.pendingShiftProposal.shiftStart} –{' '}
                          {employee.pendingShiftProposal.shiftEnd} ·{' '}
                          {employee.pendingShiftProposal.workingDays.join(', ')}
                        </p>
                        {canApproveShift && (
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => void onDecideShiftProposal(employee.id, true)}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                            >
                              {t(lang, 'approve')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void onDecideShiftProposal(employee.id, false)}
                              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 text-xs font-medium cursor-pointer"
                            >
                              {t(lang, 'reject')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {showShiftForm && (
                      <form
                        onSubmit={handleSubmitShiftProposal}
                        className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3"
                      >
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">Start</label>
                            <input
                              type="time"
                              value={shiftStartDraft}
                              onChange={(e) => setShiftStartDraft(e.target.value)}
                              className={INPUT_CLASS}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-500 mb-1">End</label>
                            <input
                              type="time"
                              value={shiftEndDraft}
                              onChange={(e) => setShiftEndDraft(e.target.value)}
                              className={INPUT_CLASS}
                            />
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {ALL_WEEKDAYS.map((day) => {
                            const active = shiftDaysDraft.includes(day);
                            return (
                              <button
                                key={day}
                                type="button"
                                onClick={() =>
                                  setShiftDaysDraft((prev) =>
                                    active ? prev.filter((d) => d !== day) : [...prev, day]
                                  )
                                }
                                className={`px-2 py-1 rounded-md text-[11px] font-medium border cursor-pointer ${
                                  active
                                    ? 'border-teal-600 bg-teal-600 text-white'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {day}
                              </button>
                            );
                          })}
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setShowShiftForm(false)}
                            className="px-3 py-1.5 rounded-lg text-xs text-slate-600 cursor-pointer"
                          >
                            {t(lang, 'cancel')}
                          </button>
                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                          >
                            {t(lang, 'submit')}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}

                <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 text-xs">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                    Geofence Zones
                  </h3>
                  {employee.assignedZoneIds.length === 0 ? (
                    <p className="text-emerald-700 dark:text-emerald-400 font-medium">
                      {t(lang, 'geofenceExempt')}
                    </p>
                  ) : (
                    <ul className="space-y-1.5 text-slate-600 dark:text-slate-300">
                      {employee.assignedZoneIds.map((id) => (
                        <li key={id} className="font-medium">
                          {geofenceMap.get(id)?.name ?? id}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          TAB 2: SALARY & PACKAGE
         ==================================================================== */}
      {effectiveTab === 'salary' && payrollRow && (
        <div className="space-y-6">
          {/* 4 Summary KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500">{t(lang, 'mainSalary')}</p>
              <p className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatAED(payrollRow.grossSalary)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Basic {formatAED(payrollRow.baseSalary)} + Allow {formatAED(payrollRow.totalAllowances)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500">{t(lang, 'wpsPayout')}</p>
              <p className="mt-2 text-xl font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                {formatAED(payrollRow.wpsTotalPayout)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                Fixed {formatAED(payrollRow.wpsFixedIncome)} · Var {formatAED(payrollRow.wpsVariableIncome)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500">{t(lang, 'offCyclePayout')}</p>
              <p className="mt-2 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {formatAED(payrollRow.offCycleNetPayout)}
              </p>
              <p className="mt-1 text-xs text-slate-500">Excluded from WPS</p>
            </div>
            <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
              <p className="text-xs text-slate-500">{t(lang, 'remainingNetPayable')}</p>
              <p className="mt-2 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                {formatAED(payrollRow.remainingNetPayable)}
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {getSalaryStatusLabel(lang, payrollRow.release.status)} · {currentMonth}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Active Permanent Additional Earnings & Temporary Schedule */}
            <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'permanentEarnings')}
                </h3>
                {permanentEarnings.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No active permanent additional earnings.</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {permanentEarnings.map((entry) => (
                      <div key={entry.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white truncate">
                            {entry.categoryName}
                          </p>
                          <p className="text-slate-500 mt-0.5 flex items-center gap-1.5">
                            <span>{getPayrollEntryTypeLabel(lang, entry.type)}</span>
                            <span>·</span>
                            <span className="inline-flex items-center gap-1 font-mono">
                              <InfinityIcon className="w-3 h-3" />
                              From {entry.effectiveFrom}
                            </span>
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-semibold text-emerald-700 dark:text-emerald-400 shrink-0">
                          +{formatAED(entry.amountAED)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'scheduledTemporaryEntries')}
                </h3>
                {temporaryEntries.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">No scheduled temporary entries.</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {temporaryEntries.slice(0, 8).map((entry) => {
                      const isDed = entry.type.startsWith('deduction');
                      return (
                        <div key={entry.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 dark:text-white truncate">
                              {entry.categoryName}
                            </p>
                            <p className="text-slate-500 mt-0.5 font-mono">
                              {entry.effectiveFrom}
                              {entry.effectiveTo && entry.effectiveTo !== entry.effectiveFrom
                                ? ` → ${entry.effectiveTo}`
                                : ''}
                              {entry.targetBucket
                                ? ` · ${getDeductionBucketLabel(lang, entry.targetBucket)}`
                                : ''}
                            </p>
                          </div>
                          <span
                            className={`font-mono tabular-nums font-semibold shrink-0 ${
                              isDed
                                ? 'text-rose-700 dark:text-rose-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {isDed ? '-' : '+'}
                            {formatAED(entry.amountAED)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Bank & WPS Info */}
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                  <Landmark className="w-4 h-4 text-teal-600" />
                  {t(lang, 'bankDetails')}
                </h3>
                {employee.bankDetails ? (
                  <dl className="mt-3 grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <dt className="text-slate-500">Bank</dt>
                      <dd className="font-semibold text-slate-900 dark:text-white mt-0.5">
                        {employee.bankDetails.bankName || '—'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">{t(lang, 'bankRoutingCode')}</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                        {employee.bankDetails.bankRoutingCode || '—'}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-slate-500">IBAN</dt>
                      <dd className="font-mono font-semibold text-slate-900 dark:text-white mt-0.5">
                        {employee.bankDetails.iban || '—'}
                      </dd>
                    </div>
                  </dl>
                ) : (
                  <p className="mt-2 text-xs text-slate-500">No bank details on file.</p>
                )}
              </div>
            </section>

            {/* Pending Unpaid Balances & Patch Release History */}
            <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'pendingBalances')}
                </h3>
                {pendingBalances.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">{t(lang, 'noPendingBalances')}</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {pendingBalances.map((bal) => (
                      <div key={bal.key} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-900 dark:text-white">
                            {bal.month} · {getPatchBucketLabel(lang, bal.bucket)}
                          </p>
                          <p className="text-slate-500 font-mono tabular-nums mt-0.5">
                            Scheduled {formatAED(bal.earnedOrScheduledAED)} · Paid{' '}
                            {formatAED(bal.alreadyReleasedAED)}
                          </p>
                        </div>
                        <span className="font-mono tabular-nums font-bold text-teal-700 dark:text-teal-300 shrink-0">
                          {formatAED(bal.availableAED)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'patchReleaseHistory')}
                </h3>
                {empPatchReleases.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">{t(lang, 'noPatchReleases')}</p>
                ) : (
                  <div className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
                    {empPatchReleases.map((rel) => (
                      <div key={rel.id} className="py-3 space-y-1 text-xs">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {formatShortDate(rel.releaseDate)} ·{' '}
                            {getPaymentMethodLabel(lang, rel.paymentMethod)}
                          </span>
                          <span className="font-mono tabular-nums font-bold text-emerald-700 dark:text-emerald-400">
                            {formatAED(rel.totalAmountAED)}
                          </span>
                        </div>
                        <p className="text-slate-500 font-mono">
                          {rel.allocations
                            .map(
                              (a) =>
                                `${a.month} ${getPatchBucketLabel(lang, a.bucket)}: ${formatAED(a.amountAED)}`
                            )
                            .join(' · ')}
                        </p>
                        {rel.referenceNote && (
                          <p className="text-slate-400">{rel.referenceNote}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 3: DOCUMENTS
         ==================================================================== */}
      {effectiveTab === 'documents' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <section className="lg:col-span-2 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                Employee Document Vault ({empDocs.length})
              </h3>
              {missingDocs.length > 0 && (
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  Missing: {missingDocs.join(', ')}
                </span>
              )}
            </div>

            {empDocs.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500">
                No documents uploaded for this employee yet.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500">
                      <th className="py-3 px-5 font-medium text-start">Document</th>
                      <th className="py-3 px-4 font-medium text-start">Number</th>
                      <th className="py-3 px-4 font-medium text-start">Expiry</th>
                      <th className="py-3 px-5 font-medium text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {empDocs.map((doc) => {
                      const expiry = getDocumentExpiryStatus(doc.expiryDate);
                      const src = getDocumentPreviewSource(doc);
                      return (
                        <tr key={doc.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                          <td className="py-3 px-5">
                            <p className="font-semibold text-slate-900 dark:text-white">
                              {doc.type}
                            </p>
                            <p className="text-slate-500 truncate max-w-[220px]">{doc.fileName}</p>
                          </td>
                          <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-300">
                            {doc.documentNumber}
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-mono text-slate-800 dark:text-slate-200">
                              {formatShortDate(doc.expiryDate)}
                            </p>
                            <p
                              className={`text-[11px] font-medium ${
                                expiry.status === 'expired'
                                  ? 'text-rose-600 dark:text-rose-400'
                                  : expiry.status === 'expiring_soon'
                                    ? 'text-amber-600 dark:text-amber-400'
                                    : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {expiry.status === 'expired'
                                ? `Expired ${Math.abs(expiry.daysRemaining)}d ago`
                                : expiry.status === 'expiring_soon'
                                  ? `Expires in ${expiry.daysRemaining}d`
                                  : 'Valid'}
                            </p>
                          </td>
                          <td className="py-3 px-5 text-end">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setPreviewDoc(doc)}
                                aria-label={`View ${doc.type}`}
                                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-700 cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                              <a
                                href={src.url}
                                download={doc.fileName}
                                aria-label={`Download ${doc.type}`}
                                className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-teal-700 cursor-pointer"
                              >
                                <Download className="w-4 h-4" />
                              </a>
                              {canManageStaff && (
                                <button
                                  type="button"
                                  onClick={() => setDeleteDocTarget(doc)}
                                  aria-label={`Delete ${doc.type}`}
                                  className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 cursor-pointer"
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

          {/* Upload Document Panel */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-teal-600" />
              Upload Document
            </h3>
            {docError && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                {docError}
              </p>
            )}
            <form onSubmit={handleUploadDoc} className="space-y-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Document Type</label>
                <select
                  value={docForm.type}
                  onChange={(e) =>
                    setDocForm((p) => ({ ...p, type: e.target.value as DocumentTypeValue }))
                  }
                  className={INPUT_CLASS}
                >
                  {allDocTypes.map((dt) => (
                    <option key={dt} value={dt}>
                      {dt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Document Number</label>
                <input
                  type="text"
                  value={docForm.documentNumber}
                  onChange={(e) =>
                    setDocForm((p) => ({ ...p, documentNumber: e.target.value }))
                  }
                  placeholder="e.g., 784-1990-..."
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Issue Date</label>
                  <input
                    type="date"
                    value={docForm.issueDate}
                    onChange={(e) =>
                      setDocForm((p) => ({ ...p, issueDate: e.target.value }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Expiry Date</label>
                  <input
                    type="date"
                    value={docForm.expiryDate}
                    onChange={(e) =>
                      setDocForm((p) => ({ ...p, expiryDate: e.target.value }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">File (PDF / Image)</label>
                <label className="block w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-700 p-3 text-center text-xs text-slate-600 dark:text-slate-400 hover:border-teal-500 cursor-pointer">
                  {docForm.fileName || 'Click to choose file'}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    className="sr-only"
                    onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
              >
                Upload to Vault
              </button>
            </form>
          </section>
        </div>
      )}

      {/* ====================================================================
          TAB 4: ATTENDANCE & LEAVES
         ==================================================================== */}
      {effectiveTab === 'attendance' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Recent Attendance Logs */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <Clock className="w-4 h-4 text-teal-600" />
                Recent Attendance Logs
              </h3>
              <span className="text-xs font-mono text-slate-500">{empAttendance.length} logs</span>
            </div>
            {empAttendance.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">No attendance logs yet.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {empAttendance.map((log) => (
                  <div key={log.id} className="px-6 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white font-mono">
                        {formatShortDate(log.date)} · {formatTime(log.clockInTime)} –{' '}
                        {log.clockOutTime ? formatTime(log.clockOutTime) : 'Active'}
                      </p>
                      <p className="text-slate-500 mt-0.5">
                        {log.zoneName} · {log.punchSource}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        log.latenessExcused
                          ? 'text-teal-700 dark:text-teal-400'
                          : log.isLate
                            ? 'text-amber-700 dark:text-amber-400'
                            : 'text-emerald-700 dark:text-emerald-400'
                      }`}
                    >
                      {log.latenessExcused
                        ? t(lang, 'excused')
                        : log.isLate
                          ? `${log.lateMinutes}m late (-${formatAED(log.latenessPenaltyAED)})`
                          : t(lang, 'onTime')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Leave Balances & History */}
          <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-teal-600" />
                Leave Balance &amp; Requests
              </h3>
              <span className="text-xs font-mono text-teal-700 dark:text-teal-300 font-semibold">
                Annual: {Math.max(0, employee.leaveBalance.annualTotal - employee.leaveBalance.annualUsed)}/
                {employee.leaveBalance.annualTotal}d
              </span>
            </div>
            {empLeaves.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">No leave requests on record.</p>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {empLeaves.map((lv) => (
                  <div key={lv.id} className="px-6 py-3 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {lv.type} · {lv.days}d
                      </p>
                      <p className="text-slate-500 font-mono mt-0.5">
                        {formatShortDate(lv.startDate)} → {formatShortDate(lv.endDate)}
                      </p>
                    </div>
                    <span
                      className={`font-semibold ${
                        lv.status === 'Approved'
                          ? 'text-emerald-700 dark:text-emerald-400'
                          : lv.status === 'Rejected'
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-amber-700 dark:text-amber-400'
                      }`}
                    >
                      {getLeaveStatusLabel(lang, lv.status)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Document Preview Lightbox */}
      {previewDoc && previewSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label={`Preview ${previewDoc.type}`}
        >
          <div className="w-full max-w-3xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div className="min-w-0">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {previewDoc.type} — {previewDoc.fileName}
                </h4>
                <p className="text-xs text-slate-500 font-mono">
                  {previewDoc.documentNumber} · Expires {formatShortDate(previewDoc.expiryDate)}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <a
                  href={previewSource.url}
                  download={previewDoc.fileName}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  {t(lang, 'downloadDocument')}
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDoc(null)}
                  aria-label="Close preview"
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="rounded-xl bg-slate-100 dark:bg-slate-950 p-3 flex items-center justify-center min-h-[260px] max-h-[70vh] overflow-auto">
              {previewSource.isImage ? (
                <img
                  src={previewSource.url}
                  alt={previewDoc.fileName}
                  className="max-h-[64vh] max-w-full rounded-lg object-contain"
                />
              ) : previewSource.isPdf ? (
                <iframe
                  src={previewSource.url}
                  title={previewDoc.fileName}
                  className="w-full h-[64vh] rounded-lg border border-slate-200 dark:border-slate-800 bg-white"
                />
              ) : (
                <div className="text-center space-y-2 py-8">
                  <FileText className="w-10 h-10 text-teal-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {previewDoc.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Use the Download button above to open this document locally.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightweight Delete Confirmation Modal */}
      <ConfirmDialog
        open={Boolean(deleteDocTarget)}
        lang={lang}
        message={`Delete ${deleteDocTarget?.type ?? 'document'} (${deleteDocTarget?.documentNumber ?? ''})?`}
        onCancel={() => setDeleteDocTarget(null)}
        onConfirm={async () => {
          if (!deleteDocTarget) return;
          await onDeleteDocument(deleteDocTarget.id);
          setDeleteDocTarget(null);
        }}
      />
    </div>
  );
};
