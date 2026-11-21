import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Camera,
  Check,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Plus,
  Tag,
  Trash2,
  Wallet,
} from 'lucide-react';
import {
  getDeductionWorkflowChainLabel,
  getEmployeeTypeLabel,
  getRoleLabel,
  t,
} from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  ClockInPolicyMode,
  Company,
  CreateEmployeePayload,
  DeductionWorkflowChain,
  DeductionWorkflowConfig,
  Employee,
  EmployeeLabel,
  EmployeeModel,
  EmployeeType,
  GeofenceZone,
  Language,
  PayrollCategoryItem,
  Section,
  UserRole,
} from '../types/hr';
import {
  canResetEmployeePassword,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  formatAED,
  inferDefaultEmployeeType,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';
import { ResetPasswordPanel } from './ResetPasswordPanel';

export interface AdditionalIncomeDraftRow {
  tempId: string;
  categoryId: string;
  amountAED: string;
  effectiveFrom: string;
  isPermanent: boolean;
  durationMonths: number;
  reason: string;
}

interface EmployeeFormPageProps {
  lang: Language;
  activeRole: UserRole;
  mode: 'create' | 'edit';
  editingEmployee: Employee | null;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  models: EmployeeModel[];
  geofences: GeofenceZone[];
  payrollCategories: PayrollCategoryItem[];
  deductionWorkflowConfig?: DeductionWorkflowConfig;
  existingEmployeeCount: number;
  onBack: () => void;
  onCreateEmployee: (
    payload: CreateEmployeePayload,
    additionalIncomes: {
      categoryId: string;
      categoryName: string;
      amountAED: number;
      effectiveFrom: string;
      isPermanent: boolean;
      durationMonths: number | null;
      reason: string;
    }[]
  ) => Promise<void>;
  onUpdateEmployee: (id: string, patch: Partial<Employee>) => Promise<void>;
  onResetPassword?: (employeeId: string, newPassword: string) => Promise<void>;
}

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

const LABEL_CLASS =
  'block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5';

function getCurrentMonthKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export const EmployeeFormPage: React.FC<EmployeeFormPageProps> = ({
  lang,
  activeRole,
  mode,
  editingEmployee,
  selectedCompanyId,
  companies,
  sections,
  labels,
  models,
  geofences,
  payrollCategories,
  deductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  existingEmployeeCount,
  onBack,
  onCreateEmployee,
  onUpdateEmployee,
  onResetPassword,
}) => {
  const isEdit = mode === 'edit' && Boolean(editingEmployee);
  const canResetPassword = Boolean(
    isEdit &&
      editingEmployee &&
      onResetPassword &&
      canResetEmployeePassword(activeRole, editingEmployee.role)
  );
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);
  const currentMonth = useMemo(() => getCurrentMonthKey(), []);

  const inPayrollEarningCategories = useMemo(
    () =>
      payrollCategories.filter(
        (c) => c.type === 'earning_in_payroll' && c.active
      ),
    [payrollCategories]
  );

  const modelMap = useMemo(
    () => new Map(models.map((m) => [m.id, m])),
    [models]
  );

  const defaultComp =
    selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id ?? '';

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const [form, setForm] = useState(() => {
    if (isEdit && editingEmployee) {
      return {
        // Step 1: User Info
        fullName: editingEmployee.fullName ?? '',
        email: editingEmployee.email ?? '',
        initialPassword: '',
        role: editingEmployee.role,
        active: editingEmployee.active,
        avatarUrl: editingEmployee.avatarUrl ?? '',
        // Step 2: Personal Info
        employeeCode: editingEmployee.employeeCode ?? '',
        phone: editingEmployee.phone ?? '',
        mohrePersonId: editingEmployee.mohrePersonId ?? '',
        // Step 3: Professional Info
        primaryCompanyId: editingEmployee.primaryCompanyId || defaultComp,
        sharedCompanyIds: [...(editingEmployee.sharedCompanyIds ?? [])],
        sectionId: editingEmployee.sectionId || sections[0]?.id || '',
        managedSectionIds: [...(editingEmployee.managedSectionIds ?? [])],
        employeeType:
          editingEmployee.employeeType ?? inferDefaultEmployeeType(editingEmployee),
        jobTitle: editingEmployee.jobTitle ?? '',
        joinDate: editingEmployee.joinDate || new Date().toISOString().slice(0, 10),
        modelId: editingEmployee.modelId || models[0]?.id || '',
        assignedZoneIds: [...(editingEmployee.assignedZoneIds ?? [])],
        labelIds: [...(editingEmployee.labelIds ?? [])],
        clockInPolicyOverride: (editingEmployee.clockInPolicyOverride ?? 'inherit') as
          | ClockInPolicyMode
          | 'inherit',
        deductionWorkflowOverride: (editingEmployee.deductionWorkflowOverride ?? 'inherit') as
          | DeductionWorkflowChain
          | 'inherit',
        // Step 4: Salary Package
        baseSalary: editingEmployee.salary?.baseSalary ?? 0,
        housingAllowance: editingEmployee.salary?.housingAllowance ?? 0,
        transportAllowance: editingEmployee.salary?.transportAllowance ?? 0,
        otherAllowance: editingEmployee.salary?.otherAllowance ?? 0,
        bankName: editingEmployee.bankDetails?.bankName ?? '',
        accountNumber: editingEmployee.bankDetails?.accountNumber ?? '',
        iban: editingEmployee.bankDetails?.iban ?? '',
        bankRoutingCode: editingEmployee.bankDetails?.bankRoutingCode ?? '',
      };
    }

    return {
      // Step 1: User Info
      fullName: '',
      email: '',
      initialPassword: '',
      role: UserRole.Employee,
      active: true,
      avatarUrl: '',
      // Step 2: Personal Info
      employeeCode: `YLD-${110 + existingEmployeeCount}`,
      phone: '',
      mohrePersonId: '',
      // Step 3: Professional Info
      primaryCompanyId: defaultComp,
      sharedCompanyIds: [] as string[],
      sectionId: sections[1]?.id ?? sections[0]?.id ?? '',
      managedSectionIds: [] as string[],
      employeeType: 'office_employee' as EmployeeType,
      jobTitle: '',
      joinDate: new Date().toISOString().slice(0, 10),
      modelId: models[0]?.id ?? '',
      assignedZoneIds: geofences
        .filter((z) => z.companyId === defaultComp)
        .slice(0, 1)
        .map((z) => z.id),
      labelIds: labels.some((l) => l.id === 'lbl-active') ? ['lbl-active'] : [],
      clockInPolicyOverride: 'inherit' as ClockInPolicyMode | 'inherit',
      deductionWorkflowOverride: 'inherit' as DeductionWorkflowChain | 'inherit',
      // Step 4: Salary Package
      baseSalary: 6000,
      housingAllowance: 1800,
      transportAllowance: 600,
      otherAllowance: 300,
      bankName: '',
      accountNumber: '',
      iban: '',
      bankRoutingCode: '',
    };
  });

  // Step 4 Inline Additional Income (In Payroll) rows (Create mode)
  const [additionalRows, setAdditionalRows] = useState<AdditionalIncomeDraftRow[]>([]);

  const isMainMgr = form.role === UserRole.MainManager;
  const isSecMgrRole =
    form.role === UserRole.SectionManager || form.role === UserRole.SectionCoManager;

  const grossMainSalary =
    (Number(form.baseSalary) || 0) +
    (Number(form.housingAllowance) || 0) +
    (Number(form.transportAllowance) || 0) +
    (Number(form.otherAllowance) || 0);

  const steps: { id: 1 | 2 | 3 | 4; label: string }[] = [
    { id: 1, label: t(lang, 'wizardStepUser') },
    { id: 2, label: t(lang, 'wizardStepPersonal') },
    { id: 3, label: t(lang, 'wizardStepProfessional') },
    { id: 4, label: t(lang, 'wizardStepSalary') },
  ];

  const handleAvatarPicked = async (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setValidationError('Please select a JPG, PNG, or WebP image for the profile picture.');
      return;
    }
    try {
      const res = await nativeBridge.readFileAsDocument(file);
      setForm((p) => ({ ...p, avatarUrl: res.dataUrl }));
      setValidationError(null);
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : 'Unable to read profile image.');
    }
  };

  const addAdditionalIncomeRow = () => {
    const firstCat = inPayrollEarningCategories[0];
    setAdditionalRows((prev) => [
      ...prev,
      {
        tempId: `inc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        categoryId: firstCat?.id ?? '',
        amountAED: '',
        effectiveFrom: currentMonth,
        isPermanent: true,
        durationMonths: 1,
        reason: '',
      },
    ]);
  };

  const updateAdditionalRow = (
    tempId: string,
    patch: Partial<AdditionalIncomeDraftRow>
  ) => {
    setAdditionalRows((prev) =>
      prev.map((row) => (row.tempId === tempId ? { ...row, ...patch } : row))
    );
  };

  const removeAdditionalRow = (tempId: string) => {
    setAdditionalRows((prev) => prev.filter((row) => row.tempId !== tempId));
  };

  const validateStep1 = (): string | null => {
    const missing: string[] = [];
    if (!form.fullName.trim()) missing.push('Full Name');
    if (!form.email.trim()) missing.push('Email');
    if (!isEdit && form.initialPassword.trim().length < 6) {
      missing.push('Initial Password (minimum 6 characters)');
    }
    if (missing.length > 0) {
      return `Please complete required field(s): ${missing.join(', ')}.`;
    }
    return null;
  };

  const validateAdditionalRows = (): string | null => {
    if (isEdit || isMainMgr) return null;
    for (let i = 0; i < additionalRows.length; i++) {
      const row = additionalRows[i];
      if (!row.categoryId) {
        return `Additional Income row #${i + 1}: please select a category.`;
      }
      const amt = Number(row.amountAED);
      if (!Number.isFinite(amt) || amt <= 0) {
        return `Additional Income row #${i + 1}: enter a valid positive amount in AED.`;
      }
      if (!row.effectiveFrom) {
        return `Additional Income row #${i + 1}: select an Effective From month.`;
      }
    }
    return null;
  };

  const handleNextStep = () => {
    if (step === 1) {
      const err = validateStep1();
      if (err) {
        setValidationError(err);
        return;
      }
    }
    setValidationError(null);
    setStep((s) => (s < 4 ? ((s + 1) as 1 | 2 | 3 | 4) : s));
  };

  const handleBackStep = () => {
    setValidationError(null);
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s));
  };

  const handleStepClick = (target: 1 | 2 | 3 | 4) => {
    if (isEdit || target <= step) {
      setValidationError(null);
      setStep(target);
      return;
    }
    // In Create mode, allow advancing forward if Step 1 is valid
    if (step === 1) {
      const err = validateStep1();
      if (err) {
        setValidationError(err);
        return;
      }
    }
    setValidationError(null);
    setStep(target);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const step1Err = validateStep1();
    if (step1Err) {
      setValidationError(step1Err);
      setStep(1);
      return;
    }
    const rowsErr = validateAdditionalRows();
    if (rowsErr) {
      setValidationError(rowsErr);
      setStep(4);
      return;
    }

    setValidationError(null);
    setSaving(true);
    try {
      const chosenModel = modelMap.get(form.modelId) ?? models[0];
      const sharedClean = form.sharedCompanyIds.filter(
        (id) => id !== form.primaryCompanyId
      );
      const managedSections = isSecMgrRole
        ? form.managedSectionIds.length > 0
          ? form.managedSectionIds
          : form.sectionId
            ? [form.sectionId]
            : []
        : [];

      const salary = isMainMgr
        ? { baseSalary: 0, housingAllowance: 0, transportAllowance: 0, otherAllowance: 0 }
        : {
            baseSalary: Number(form.baseSalary) || 0,
            housingAllowance: Number(form.housingAllowance) || 0,
            transportAllowance: Number(form.transportAllowance) || 0,
            otherAllowance: Number(form.otherAllowance) || 0,
          };

      const bankDetails =
        !isMainMgr &&
        (form.bankName.trim() ||
          form.accountNumber.trim() ||
          form.bankRoutingCode.trim() ||
          form.iban.trim())
          ? {
              bankName: form.bankName.trim(),
              accountNumber: form.accountNumber.trim(),
              bankRoutingCode: form.bankRoutingCode.trim() || undefined,
              iban: form.iban.trim(),
            }
          : undefined;

      const mohrePersonId =
        !isMainMgr && form.mohrePersonId.trim()
          ? form.mohrePersonId.trim()
          : undefined;

      if (isEdit && editingEmployee) {
        await onUpdateEmployee(editingEmployee.id, {
          employeeCode: form.employeeCode.trim(),
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          avatarUrl: form.avatarUrl || undefined,
          role: form.role,
          active: form.active,
          employeeType: form.employeeType,
          deductionWorkflowOverride: form.deductionWorkflowOverride,
          primaryCompanyId: form.primaryCompanyId,
          sharedCompanyIds: sharedClean,
          sectionId: form.sectionId,
          managedSectionIds: managedSections,
          labelIds: form.labelIds,
          modelId: form.modelId,
          jobTitle: form.jobTitle.trim(),
          joinDate: form.joinDate || editingEmployee.joinDate,
          assignedZoneIds: isMainMgr ? [] : form.assignedZoneIds,
          clockInPolicyOverride: form.clockInPolicyOverride,
          salary,
          mohrePersonId,
          bankDetails,
        });
      } else {
        const preparedIncomes = isMainMgr
          ? []
          : additionalRows.map((row) => {
              const cat = inPayrollEarningCategories.find(
                (c) => c.id === row.categoryId
              );
              return {
                categoryId: row.categoryId,
                categoryName: cat?.name ?? 'Additional Earning',
                amountAED: Number(row.amountAED),
                effectiveFrom: row.effectiveFrom || currentMonth,
                isPermanent: row.isPermanent,
                durationMonths: row.isPermanent
                  ? null
                  : Math.max(1, Math.floor(Number(row.durationMonths) || 1)),
                reason: row.reason.trim() || cat?.name || 'Initial salary package',
              };
            });

        await onCreateEmployee(
          {
            employeeCode: form.employeeCode.trim() || `YLD-${110 + existingEmployeeCount}`,
            fullName: form.fullName.trim(),
            email: form.email.trim(),
            phone: form.phone.trim(),
            avatarUrl: form.avatarUrl || undefined,
            initialPassword: form.initialPassword.trim(),
            role: form.role,
            employeeType: form.employeeType,
            deductionWorkflowOverride: form.deductionWorkflowOverride,
            primaryCompanyId: form.primaryCompanyId,
            sharedCompanyIds: sharedClean,
            sectionId: form.sectionId,
            managedSectionIds: managedSections,
            labelIds: form.labelIds,
            modelId: form.modelId,
            jobTitle: form.jobTitle.trim(),
            joinDate: form.joinDate || new Date().toISOString().slice(0, 10),
            active: form.active,
            assignedZoneIds: isMainMgr ? [] : form.assignedZoneIds,
            clockInPolicyOverride: form.clockInPolicyOverride,
            salary,
            mohrePersonId,
            bankDetails,
            leaveBalance: {
              annualTotal: chosenModel?.leaveQuotas.annualTotal ?? 30,
              annualUsed: 0,
              sickTotal: chosenModel?.leaveQuotas.sickTotal ?? 15,
              sickUsed: 0,
              emergencyTotal: chosenModel?.leaveQuotas.emergencyTotal ?? 5,
              emergencyUsed: 0,
              unpaidUsed: 0,
            },
          },
          preparedIncomes
        );
      }
    } catch (err) {
      setValidationError(
        err instanceof Error ? err.message : 'Unable to save employee record.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <PageBreadcrumbHeader
        lang={lang}
        onBack={onBack}
        breadcrumbs={[
          { label: t(lang, 'navGroupPeople') },
          { label: t(lang, 'navDirectory'), onClick: onBack },
          {
            label: isEdit
              ? `${t(lang, 'editEmployee')}: ${editingEmployee?.fullName ?? ''}`
              : t(lang, 'addEmployee'),
          },
        ]}
        title={
          isEdit
            ? `${t(lang, 'editEmployee')} — ${editingEmployee?.fullName ?? ''}`
            : t(lang, 'addEmployee')
        }
        subtitle={
          isEdit
            ? 'Update account, personal, professional, or salary package details. Optional fields may remain blank.'
            : 'Complete the 4 steps below to onboard a new employee with their full salary package.'
        }
        actions={
          canResetPassword ? (
            <button
              type="button"
              onClick={() => setResetPasswordOpen((prev) => !prev)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
            >
              <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
              <span>{t(lang, 'resetPassword')}</span>
            </button>
          ) : undefined
        }
      />

      {canResetPassword && editingEmployee && onResetPassword && (
        <ResetPasswordPanel
          lang={lang}
          employeeId={editingEmployee.id}
          employeeName={editingEmployee.fullName}
          employeeEmail={editingEmployee.email}
          open={resetPasswordOpen}
          onClose={() => setResetPasswordOpen(false)}
          onResetPassword={onResetPassword}
        />
      )}

      {/* ZenHR-Style Horizontal Chevron Progress Stepper */}
      <nav aria-label="Employee onboarding steps" className="w-full overflow-x-auto pb-1">
        <ol className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {steps.map((item, idx) => {
            const isCurrent = step === item.id;
            const isCompleted = !isEdit && item.id < step;
            return (
              <li key={item.id} className="min-w-0">
                <button
                  type="button"
                  onClick={() => handleStepClick(item.id)}
                  className={`relative w-full flex items-center justify-between gap-2 px-4 py-3 rounded-xl border text-start transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                      : isCompleted
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200 hover:bg-emerald-100/70 dark:hover:bg-emerald-950/60'
                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-teal-300 dark:hover:border-teal-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-mono font-semibold shrink-0 ${
                        isCurrent
                          ? 'bg-white/20 text-white'
                          : isCompleted
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      {isCompleted ? <Check className="w-3.5 h-3.5" /> : item.id}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold truncate">
                      {item.label}
                    </span>
                  </div>
                  {idx < steps.length - 1 && (
                    <ChevronRight
                      className={`w-4 h-4 shrink-0 rtl:rotate-180 ${
                        isCurrent
                          ? 'text-white/80'
                          : isCompleted
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-300 dark:text-slate-700'
                      }`}
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ol>
      </nav>

      {/* Inline Validation Alert (Never silently disable Save!) */}
      {validationError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 flex items-start gap-2.5 text-xs text-rose-700 dark:text-rose-300"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Main Form Card (noValidate so our custom inline validation explains exact missing fields cleanly) */}
      <form
        noValidate
        onSubmit={handleSubmit}
        className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 space-y-6"
      >
        {/* ================================================================
            STEP 1: USER INFO
           ================================================================ */}
        {step === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'wizardStepUser')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Login credentials, system role, and account status.
              </p>
            </div>

            {/* Profile Picture Upload */}
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 pb-6 border-b border-slate-100 dark:border-slate-800">
              <Avatar
                src={form.avatarUrl || undefined}
                name={form.fullName || 'New Employee'}
                size="lg"
              />
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t(lang, 'profilePicture')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Optional photo displayed in the directory, header, and profile view.
                </p>
                <div className="flex items-center gap-3 pt-1">
                  <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                    <Camera className="w-3.5 h-3.5 text-teal-600" />
                    <span>Upload Photo</span>
                    <input
                      type="file"
                      accept="image/*"
                      className="sr-only"
                      onChange={(e) => void handleAvatarPicked(e.target.files?.[0] ?? null)}
                    />
                  </label>
                  {form.avatarUrl && (
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, avatarUrl: '' }))}
                      className="text-xs font-medium text-rose-600 hover:underline cursor-pointer"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="emp-fullname" className={LABEL_CLASS}>
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="emp-fullname"
                  type="text"
                  placeholder="e.g., Rami Al-Mansoor"
                  value={form.fullName}
                  onChange={(e) => setForm((p) => ({ ...p, fullName: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="emp-email" className={LABEL_CLASS}>
                  {t(lang, 'workEmail')} <span className="text-rose-500">*</span>
                </label>
                <input
                  id="emp-email"
                  type="email"
                  placeholder="name@company.ae"
                  value={form.email}
                  onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>

              {!isEdit && (
                <div>
                  <label htmlFor="emp-initial-password" className={LABEL_CLASS}>
                    <span className="inline-flex items-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-teal-600" />
                      {t(lang, 'initialPassword')} <span className="text-rose-500">*</span>
                    </span>
                  </label>
                  <input
                    id="emp-initial-password"
                    type="text"
                    placeholder="Minimum 6 characters (e.g., Welcome2026!)"
                    value={form.initialPassword}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, initialPassword: e.target.value }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                    User will be prompted to set a personal password on first sign-in.
                  </p>
                </div>
              )}

              <div>
                <label htmlFor="emp-role" className={LABEL_CLASS}>
                  System Role
                </label>
                <select
                  id="emp-role"
                  value={form.role}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, role: e.target.value as UserRole }))
                  }
                  className={INPUT_CLASS}
                >
                  {(Object.values(UserRole) as UserRole[]).map((r) => (
                    <option key={r} value={r}>
                      {getRoleLabel(lang, r)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Account Active Toggle */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {t(lang, 'accountActive')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Inactive accounts cannot sign in or appear in active monthly payroll runs.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={form.active}
                onClick={() => setForm((p) => ({ ...p, active: !p.active }))}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                  form.active ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    form.active
                      ? 'translate-x-6 rtl:-translate-x-6'
                      : 'translate-x-1 rtl:-translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        )}

        {/* ================================================================
            STEP 2: PERSONAL INFO
           ================================================================ */}
        {step === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'wizardStepPersonal')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Employment number, contact phone, and UAE MOHRE labor card identifier.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div>
                <label htmlFor="emp-code" className={LABEL_CLASS}>
                  Employee Code / Employment Number
                </label>
                <input
                  id="emp-code"
                  type="text"
                  placeholder="e.g., YLD-120"
                  value={form.employeeCode}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, employeeCode: e.target.value }))
                  }
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              <div>
                <label htmlFor="emp-phone" className={LABEL_CLASS}>
                  Phone Number
                </label>
                <input
                  id="emp-phone"
                  type="tel"
                  placeholder="+971 50 000 0000"
                  value={form.phone}
                  onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>

              {!isMainMgr && (
                <div>
                  <label htmlFor="emp-mohre" className={LABEL_CLASS}>
                    {t(lang, 'mohrePersonId')}
                  </label>
                  <input
                    id="emp-mohre"
                    type="text"
                    placeholder="14-digit MOHRE Person ID"
                    value={form.mohrePersonId}
                    onChange={(e) =>
                      setForm((p) => ({ ...p, mohrePersonId: e.target.value }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================================================================
            STEP 3: PROFESSIONAL INFO
           ================================================================ */}
        {step === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'wizardStepProfessional')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Company assignment, section, shift model, geofence zones, and approval workflow.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div>
                <label htmlFor="emp-primary-company" className={LABEL_CLASS}>
                  Primary Company
                </label>
                <select
                  id="emp-primary-company"
                  value={form.primaryCompanyId}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, primaryCompanyId: e.target.value }))
                  }
                  className={INPUT_CLASS}
                >
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="emp-section" className={LABEL_CLASS}>
                  Section
                </label>
                <select
                  id="emp-section"
                  value={form.sectionId}
                  onChange={(e) => setForm((p) => ({ ...p, sectionId: e.target.value }))}
                  className={INPUT_CLASS}
                >
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="emp-job-title" className={LABEL_CLASS}>
                  Job Title
                </label>
                <input
                  id="emp-job-title"
                  type="text"
                  placeholder="e.g., Fleet Operations Coordinator"
                  value={form.jobTitle}
                  onChange={(e) => setForm((p) => ({ ...p, jobTitle: e.target.value }))}
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <label htmlFor="emp-join-date" className={LABEL_CLASS}>
                  Join Date
                </label>
                <input
                  id="emp-join-date"
                  type="date"
                  value={form.joinDate}
                  onChange={(e) => setForm((p) => ({ ...p, joinDate: e.target.value }))}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              <div>
                <label htmlFor="emp-type" className={LABEL_CLASS}>
                  {t(lang, 'employeeType')}
                </label>
                <select
                  id="emp-type"
                  value={form.employeeType}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      employeeType: e.target.value as EmployeeType,
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  {(['office_employee', 'driver', 'management'] as EmployeeType[]).map(
                    (et) => (
                      <option key={et} value={et}>
                        {getEmployeeTypeLabel(lang, et)}
                      </option>
                    )
                  )}
                </select>
              </div>

              <div>
                <label htmlFor="emp-model" className={LABEL_CLASS}>
                  Employee Model (Shift / Policy)
                </label>
                <select
                  id="emp-model"
                  value={form.modelId}
                  onChange={(e) => setForm((p) => ({ ...p, modelId: e.target.value }))}
                  className={INPUT_CLASS}
                >
                  {models.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2">
                <label htmlFor="emp-deduction-wf" className={LABEL_CLASS}>
                  {t(lang, 'deductionWorkflowOverride')}
                </label>
                <select
                  id="emp-deduction-wf"
                  value={form.deductionWorkflowOverride}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      deductionWorkflowOverride: e.target.value as
                        | DeductionWorkflowChain
                        | 'inherit',
                    }))
                  }
                  className={INPUT_CLASS}
                >
                  <option value="inherit">
                    {t(lang, 'inheritWorkflow')} (
                    {getDeductionWorkflowChainLabel(
                      lang,
                      deductionWorkflowConfig[form.employeeType]
                    )}
                    )
                  </option>
                  {(
                    ['manager_then_hr', 'hr_only', 'main_manager_only'] as DeductionWorkflowChain[]
                  ).map((ch) => (
                    <option key={ch} value={ch}>
                      {getDeductionWorkflowChainLabel(lang, ch)}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Managed Sections for Section Manager / Co-Manager */}
            {isSecMgrRole && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {t(lang, 'managedSections')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {sections.map((s) => {
                    const checked = form.managedSectionIds.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            managedSectionIds: checked
                              ? p.managedSectionIds.filter((id) => id !== s.id)
                              : [...p.managedSectionIds, s.id],
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-teal-400'
                        }`}
                      >
                        {s.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Shared Companies */}
            <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                {form.role === UserRole.Accounting
                  ? 'Attached Companies for Accounting Scope (Primary + Selected)'
                  : 'Shared / Secondary Companies (Optional)'}
              </p>
              <div className="flex flex-wrap gap-2">
                {companies
                  .filter((c) => c.id !== form.primaryCompanyId)
                  .map((c) => {
                    const checked = form.sharedCompanyIds.includes(c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            sharedCompanyIds: checked
                              ? p.sharedCompanyIds.filter((id) => id !== c.id)
                              : [...p.sharedCompanyIds, c.id],
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          checked
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300'
                        }`}
                      >
                        {c.name}
                      </button>
                    );
                  })}
              </div>
            </div>

            {/* Assigned Geofence Zones (Hidden for Main Manager) */}
            {!isMainMgr && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    Assigned Geofence Zones
                  </p>
                  <button
                    type="button"
                    onClick={() => setForm((p) => ({ ...p, assignedZoneIds: [] }))}
                    className={`text-xs font-medium px-2.5 py-1 rounded-lg border cursor-pointer transition-colors ${
                      form.assignedZoneIds.length === 0
                        ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t(lang, 'geofenceExempt')}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {geofences.map((z) => {
                    const active = form.assignedZoneIds.includes(z.id);
                    return (
                      <button
                        key={z.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            assignedZoneIds: active
                              ? p.assignedZoneIds.filter((id) => id !== z.id)
                              : [...p.assignedZoneIds, z.id],
                          }))
                        }
                        className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                          active
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-teal-300'
                        }`}
                      >
                        {z.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Employee Status Labels */}
            {labels.length > 0 && (
              <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-teal-600" />
                  {t(lang, 'labelsManager')}
                </p>
                <div className="flex flex-wrap gap-2">
                  {labels.map((lbl) => {
                    const active = form.labelIds.includes(lbl.id);
                    return (
                      <button
                        key={lbl.id}
                        type="button"
                        onClick={() =>
                          setForm((p) => ({
                            ...p,
                            labelIds: active
                              ? p.labelIds.filter((id) => id !== lbl.id)
                              : [...p.labelIds, lbl.id],
                          }))
                        }
                        style={
                          active
                            ? {
                                backgroundColor: lbl.color,
                                color: '#ffffff',
                                borderColor: lbl.color,
                              }
                            : {
                                backgroundColor: `${lbl.color}12`,
                                color: lbl.color,
                                borderColor: `${lbl.color}40`,
                              }
                        }
                        className="px-3 py-1 rounded-lg border text-xs font-semibold cursor-pointer transition-all"
                      >
                        {lbl.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================
            STEP 4: SALARY PACKAGE (Main Salary + Bank/WPS + Inline Additional Income)
           ================================================================ */}
        {step === 4 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'wizardStepSalary')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {isMainMgr
                  ? 'Main Manager executive accounts are exempt from monthly payroll and WPS.'
                  : 'Configure Main Salary, Bank & WPS details, and optional recurring or temporary in-payroll additional income.'}
              </p>
            </div>

            {isMainMgr ? (
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-5 text-xs text-slate-600 dark:text-slate-400">
                Executive role selected ({getRoleLabel(lang, form.role)}). Salary, WPS, and
                additional income fields are not applicable.
              </div>
            ) : (
              <>
                {/* Main Salary Split + Live Gross Total */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                      <Wallet className="w-4 h-4 text-teal-600" />
                      {t(lang, 'mainSalary')} (AED)
                    </h3>
                    <div className="text-sm font-semibold text-teal-700 dark:text-teal-300 font-mono tabular-nums">
                      {t(lang, 'grossMainSalary')}: {formatAED(grossMainSalary)}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="emp-base-salary" className={LABEL_CLASS}>
                        Basic Salary (AED)
                      </label>
                      <input
                        id="emp-base-salary"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.baseSalary}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, baseSalary: Number(e.target.value) }))
                        }
                        className={`${INPUT_CLASS} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-housing" className={LABEL_CLASS}>
                        Housing Allowance
                      </label>
                      <input
                        id="emp-housing"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.housingAllowance}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            housingAllowance: Number(e.target.value),
                          }))
                        }
                        className={`${INPUT_CLASS} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-transport" className={LABEL_CLASS}>
                        Transport Allowance
                      </label>
                      <input
                        id="emp-transport"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.transportAllowance}
                        onChange={(e) =>
                          setForm((p) => ({
                            ...p,
                            transportAllowance: Number(e.target.value),
                          }))
                        }
                        className={`${INPUT_CLASS} font-mono tabular-nums`}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-other" className={LABEL_CLASS}>
                        Other Allowance
                      </label>
                      <input
                        id="emp-other"
                        type="number"
                        min={0}
                        step="0.01"
                        value={form.otherAllowance}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, otherAllowance: Number(e.target.value) }))
                        }
                        className={`${INPUT_CLASS} font-mono tabular-nums`}
                      />
                    </div>
                  </div>
                </div>

                {/* Bank & WPS Details */}
                <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
                  <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    {t(lang, 'bankDetails')} &amp; WPS
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="emp-bank-name" className={LABEL_CLASS}>
                        Bank Name
                      </label>
                      <input
                        id="emp-bank-name"
                        type="text"
                        placeholder="e.g., ADCB / Emirates NBD"
                        value={form.bankName}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, bankName: e.target.value }))
                        }
                        className={INPUT_CLASS}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-account-number" className={LABEL_CLASS}>
                        Account Number
                      </label>
                      <input
                        id="emp-account-number"
                        type="text"
                        placeholder="Optional"
                        value={form.accountNumber}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, accountNumber: e.target.value }))
                        }
                        className={`${INPUT_CLASS} font-mono`}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-iban" className={LABEL_CLASS}>
                        IBAN
                      </label>
                      <input
                        id="emp-iban"
                        type="text"
                        placeholder="AE..."
                        value={form.iban}
                        onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))}
                        className={`${INPUT_CLASS} font-mono`}
                      />
                    </div>
                    <div>
                      <label htmlFor="emp-bank-routing" className={LABEL_CLASS}>
                        {t(lang, 'bankRoutingCode')}
                      </label>
                      <input
                        id="emp-bank-routing"
                        type="text"
                        placeholder="9-digit routing code"
                        value={form.bankRoutingCode}
                        onChange={(e) =>
                          setForm((p) => ({ ...p, bankRoutingCode: e.target.value }))
                        }
                        className={`${INPUT_CLASS} font-mono`}
                      />
                    </div>
                  </div>
                </div>

                {/* Inline Additional Income (In Payroll) Builder — Create Mode */}
                {!isEdit && (
                  <div className="pt-5 border-t border-slate-100 dark:border-slate-800 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {t(lang, 'additionalIncomeInPayroll')} (Optional)
                        </h3>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          Automatically logged into monthly payroll (WPS Variable Income) once the
                          employee is created.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={addAdditionalIncomeRow}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 hover:bg-teal-100/70 dark:hover:bg-teal-950/60 text-xs font-semibold cursor-pointer whitespace-nowrap"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{t(lang, 'addAdditionalIncome')}</span>
                      </button>
                    </div>

                    {additionalRows.length > 0 && (
                      <div className="space-y-3">
                        {additionalRows.map((row, idx) => (
                          <div
                            key={row.tempId}
                            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/60 p-4 space-y-3"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                                Additional Income #{idx + 1}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeAdditionalRow(row.tempId)}
                                aria-label={`Remove additional income row ${idx + 1}`}
                                className="inline-flex items-center gap-1 text-xs text-rose-600 hover:text-rose-700 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>{t(lang, 'delete')}</span>
                              </button>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              <div>
                                <label className={LABEL_CLASS}>Category</label>
                                <select
                                  value={row.categoryId}
                                  onChange={(e) =>
                                    updateAdditionalRow(row.tempId, {
                                      categoryId: e.target.value,
                                    })
                                  }
                                  className={INPUT_CLASS}
                                >
                                  <option value="">Select category...</option>
                                  {inPayrollEarningCategories.map((cat) => (
                                    <option key={cat.id} value={cat.id}>
                                      {cat.name}
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <div>
                                <label className={LABEL_CLASS}>Amount (AED)</label>
                                <input
                                  type="number"
                                  min={1}
                                  step="0.01"
                                  placeholder="e.g., 500"
                                  value={row.amountAED}
                                  onChange={(e) =>
                                    updateAdditionalRow(row.tempId, {
                                      amountAED: e.target.value,
                                    })
                                  }
                                  className={`${INPUT_CLASS} font-mono tabular-nums`}
                                />
                              </div>

                              <div>
                                <label className={LABEL_CLASS}>
                                  {t(lang, 'effectiveFromMonth')}
                                </label>
                                <input
                                  type="month"
                                  value={row.effectiveFrom}
                                  onChange={(e) =>
                                    updateAdditionalRow(row.tempId, {
                                      effectiveFrom: e.target.value,
                                    })
                                  }
                                  className={`${INPUT_CLASS} font-mono`}
                                />
                              </div>

                              <div>
                                <label className={LABEL_CLASS}>
                                  {t(lang, 'durationMode')}
                                </label>
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateAdditionalRow(row.tempId, { isPermanent: true })
                                    }
                                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                                      row.isPermanent
                                        ? 'border-teal-600 bg-teal-600 text-white'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {t(lang, 'permanentDuration')}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      updateAdditionalRow(row.tempId, { isPermanent: false })
                                    }
                                    className={`flex-1 py-2 px-2 rounded-lg border text-xs font-semibold cursor-pointer ${
                                      !row.isPermanent
                                        ? 'border-teal-600 bg-teal-600 text-white'
                                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                                    }`}
                                  >
                                    {t(lang, 'temporaryDuration')}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {!row.isPermanent && (
                                <div>
                                  <label className={LABEL_CLASS}>
                                    {t(lang, 'numberOfMonths')}
                                  </label>
                                  <input
                                    type="number"
                                    min={1}
                                    max={36}
                                    value={row.durationMonths}
                                    onChange={(e) =>
                                      updateAdditionalRow(row.tempId, {
                                        durationMonths: Math.max(
                                          1,
                                          Number(e.target.value) || 1
                                        ),
                                      })
                                    }
                                    className={`${INPUT_CLASS} font-mono tabular-nums`}
                                  />
                                </div>
                              )}
                              <div className={row.isPermanent ? 'sm:col-span-3' : 'sm:col-span-2'}>
                                <label className={LABEL_CLASS}>Reason (Optional)</label>
                                <input
                                  type="text"
                                  placeholder="e.g., Onboarding KPI allowance"
                                  value={row.reason}
                                  onChange={(e) =>
                                    updateAdditionalRow(row.tempId, {
                                      reason: e.target.value,
                                    })
                                  }
                                  className={INPUT_CLASS}
                                />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Footer Controls */}
        <div className="pt-6 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBackStep}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 rtl:rotate-180" />
                <span>{t(lang, 'back')}</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={onBack}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {isEdit && step < 4 && (
              <button
                type="button"
                onClick={handleNextStep}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                <span>{t(lang, 'next')}</span>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            )}

            {!isEdit && step < 4 ? (
              <button
                key="wizard-next-btn"
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  handleNextStep();
                }}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <span>{t(lang, 'next')}</span>
                <ChevronRight className="w-4 h-4 rtl:rotate-180" />
              </button>
            ) : (
              <button
                key="wizard-submit-btn"
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60"
              >
                <Check className="w-4 h-4" />
                <span>
                  {saving
                    ? 'Saving...'
                    : isEdit
                      ? t(lang, 'saveChanges')
                      : t(lang, 'createEmployee')}
                </span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
};
