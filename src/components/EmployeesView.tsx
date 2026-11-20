import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Edit3,
  Eye,
  FileText,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { getRoleLabel, t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AttendanceLog,
  BuiltInDocumentType,
  ClockInPolicyMode,
  Company,
  DocumentTypeValue,
  Employee,
  EmployeeDocument,
  EmployeeModel,
  GeofenceZone,
  Language,
  PayrollAdjustment,
  Section,
  ShiftSchedule,
  UserRole,
  Weekday,
} from '../types/hr';
import {
  calculateEmployeePayroll,
  formatAED,
  formatShortDate,
  formatTime,
  getDocumentExpiryStatus,
  getEffectiveShiftEnd,
  getEffectiveShiftStart,
  getMissingModelDocuments,
  isSharedEmployeeInCompany,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { SlideOverDrawer } from './SlideOverDrawer';

interface EmployeesViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  models: EmployeeModel[];
  scopedEmployees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  payrollAdjustments: PayrollAdjustment[];
  customDocumentTypes: string[];
  onCreateEmployee: (emp: Omit<Employee, 'id'>) => Promise<void>;
  onUpdateEmployee: (id: string, patch: Partial<Employee>) => Promise<void>;
  onProposeShift: (employeeId: string, schedule: ShiftSchedule) => Promise<void>;
  onDecideShiftProposal: (employeeId: string, approve: boolean) => Promise<void>;
  onUploadDocument: (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
}

const ALL_WEEKDAYS: Weekday[] = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  lang,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  models,
  scopedEmployees,
  geofences,
  documents,
  attendance,
  payrollAdjustments,
  customDocumentTypes,
  onCreateEmployee,
  onUpdateEmployee,
  onProposeShift,
  onDecideShiftProposal,
  onUploadDocument,
  onDeleteDocument,
}) => {
  const canManageStaff = activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;
  const canApproveShift =
    activeRole === UserRole.MainManager || activeRole === UserRole.SectionManager;
  const isEmployeeOnly = activeRole === UserRole.Employee;

  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');

  // Slide-over drawer state
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(
    isEmployeeOnly ? currentUser.id : null
  );
  const [drawerTab, setDrawerTab] = useState<'overview' | 'documents' | 'attendance' | 'salary'>(
    isEmployeeOnly ? 'documents' : 'overview'
  );

  // Shift proposal form (HR proposes -> requires Manager approval)
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

  // Document uploader & preview
  const [dragActive, setDragActive] = useState(false);
  const [docError, setDocError] = useState<string | null>(null);
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
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

  // Add / Edit Employee Modal
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [empError, setEmpError] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({
    employeeCode: '',
    fullName: '',
    email: '',
    phone: '',
    role: UserRole.Employee,
    primaryCompanyId: companies[0]?.id ?? '',
    sharedCompanyIds: [] as string[],
    sectionId: sections[0]?.id ?? '',
    modelId: models[0]?.id ?? '',
    jobTitle: '',
    joinDate: new Date().toISOString().slice(0, 10),
    assignedZoneIds: [] as string[],
    clockInPolicyOverride: 'inherit' as ClockInPolicyMode | 'inherit',
    baseSalary: 6000,
    housingAllowance: 1800,
    transportAllowance: 600,
    otherAllowance: 300,
  });

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const modelMap = useMemo(() => new Map(models.map((m) => [m.id, m])), [models]);

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

  const visibleEmployees = useMemo(() => {
    return scopedEmployees.filter((emp) => {
      if (sectionFilter !== 'all' && emp.sectionId !== sectionFilter) return false;
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${emp.fullName} ${emp.employeeCode} ${emp.jobTitle} ${emp.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [scopedEmployees, sectionFilter, search]);

  const selectedEmp = scopedEmployees.find((e) => e.id === selectedEmpId) ?? null;
  const selectedModel = selectedEmp ? modelMap.get(selectedEmp.modelId) ?? models[0] : undefined;
  const selectedDocs = useMemo(
    () => (selectedEmp ? documents.filter((d) => d.employeeId === selectedEmp.id) : []),
    [documents, selectedEmp]
  );
  const selectedMissingDocs = useMemo(
    () => getMissingModelDocuments(selectedDocs, selectedModel),
    [selectedDocs, selectedModel]
  );
  const selectedAttendance = useMemo(
    () => (selectedEmp ? attendance.filter((a) => a.employeeId === selectedEmp.id).slice(0, 10) : []),
    [attendance, selectedEmp]
  );
  const currentMonth = new Date().toISOString().slice(0, 7);
  const selectedPayroll = useMemo(
    () =>
      selectedEmp
        ? calculateEmployeePayroll(selectedEmp, currentMonth, payrollAdjustments, attendance)
        : null,
    [selectedEmp, currentMonth, payrollAdjustments, attendance]
  );

  const openAddEmployee = () => {
    setEditingEmp(null);
    setEmpError(null);
    const defaultComp =
      selectedCompanyId !== 'all' ? selectedCompanyId : companies[0]?.id ?? '';
    setEmpForm({
      employeeCode: `YLD-${110 + scopedEmployees.length}`,
      fullName: '',
      email: '',
      phone: '+971 50 ',
      role: UserRole.Employee,
      primaryCompanyId: defaultComp,
      sharedCompanyIds: [],
      sectionId: sections[1]?.id ?? sections[0]?.id ?? '',
      modelId: models[0]?.id ?? '',
      jobTitle: '',
      joinDate: new Date().toISOString().slice(0, 10),
      assignedZoneIds: geofences.filter((z) => z.companyId === defaultComp).slice(0, 1).map((z) => z.id),
      clockInPolicyOverride: 'inherit',
      baseSalary: 6000,
      housingAllowance: 1800,
      transportAllowance: 600,
      otherAllowance: 300,
    });
    setShowEmpModal(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpError(null);
    setEmpForm({
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      primaryCompanyId: emp.primaryCompanyId,
      sharedCompanyIds: [...emp.sharedCompanyIds],
      sectionId: emp.sectionId,
      modelId: emp.modelId,
      jobTitle: emp.jobTitle,
      joinDate: emp.joinDate,
      assignedZoneIds: [...emp.assignedZoneIds],
      clockInPolicyOverride: emp.clockInPolicyOverride ?? 'inherit',
      baseSalary: emp.salary.baseSalary,
      housingAllowance: emp.salary.housingAllowance,
      transportAllowance: emp.salary.transportAllowance,
      otherAllowance: emp.salary.otherAllowance,
    });
    setShowEmpModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.fullName.trim() || !empForm.email.trim() || !empForm.jobTitle.trim()) {
      setEmpError('Full name, email, and job title are required.');
      return;
    }
    const chosenModel = modelMap.get(empForm.modelId) ?? models[0];
    const sharedClean = empForm.sharedCompanyIds.filter((id) => id !== empForm.primaryCompanyId);
    const salary = {
      baseSalary: Number(empForm.baseSalary) || 0,
      housingAllowance: Number(empForm.housingAllowance) || 0,
      transportAllowance: Number(empForm.transportAllowance) || 0,
      otherAllowance: Number(empForm.otherAllowance) || 0,
    };

    if (editingEmp) {
      await onUpdateEmployee(editingEmp.id, {
        employeeCode: empForm.employeeCode.trim(),
        fullName: empForm.fullName.trim(),
        email: empForm.email.trim(),
        phone: empForm.phone.trim(),
        role: empForm.role,
        primaryCompanyId: empForm.primaryCompanyId,
        sharedCompanyIds: sharedClean,
        sectionId: empForm.sectionId,
        managedSectionIds:
          empForm.role === UserRole.SectionManager || empForm.role === UserRole.SectionCoManager
            ? [empForm.sectionId]
            : [],
        modelId: empForm.modelId,
        jobTitle: empForm.jobTitle.trim(),
        joinDate: empForm.joinDate,
        assignedZoneIds: empForm.assignedZoneIds,
        clockInPolicyOverride: empForm.clockInPolicyOverride,
        salary,
      });
    } else {
      await onCreateEmployee({
        employeeCode: empForm.employeeCode.trim(),
        fullName: empForm.fullName.trim(),
        email: empForm.email.trim(),
        phone: empForm.phone.trim(),
        role: empForm.role,
        primaryCompanyId: empForm.primaryCompanyId,
        sharedCompanyIds: sharedClean,
        sectionId: empForm.sectionId,
        managedSectionIds:
          empForm.role === UserRole.SectionManager || empForm.role === UserRole.SectionCoManager
            ? [empForm.sectionId]
            : [],
        modelId: empForm.modelId,
        jobTitle: empForm.jobTitle.trim(),
        joinDate: empForm.joinDate,
        active: true,
        assignedZoneIds: empForm.assignedZoneIds,
        clockInPolicyOverride: empForm.clockInPolicyOverride,
        salary,
        leaveBalance: {
          annualTotal: chosenModel?.leaveQuotas.annualTotal ?? 30,
          annualUsed: 0,
          sickTotal: chosenModel?.leaveQuotas.sickTotal ?? 15,
          sickUsed: 0,
          emergencyTotal: chosenModel?.leaveQuotas.emergencyTotal ?? 5,
          emergencyUsed: 0,
          unpaidUsed: 0,
        },
      });
    }
    setShowEmpModal(false);
  };

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
    if (!selectedEmp) return;
    if (!docForm.documentNumber.trim() || !docForm.expiryDate || !docForm.fileName) {
      setDocError('Document number, expiry date, and attached file are required.');
      return;
    }
    await onUploadDocument({
      employeeId: selectedEmp.id,
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
    if (!selectedEmp || shiftDaysDraft.length === 0) return;
    await onProposeShift(selectedEmp.id, {
      shiftStart: shiftStartDraft,
      shiftEnd: shiftEndDraft,
      workingDays: shiftDaysDraft,
    });
    setShowShiftForm(false);
  };

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {isEmployeeOnly ? t(lang, 'navMyDocs') : t(lang, 'navEmployees')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {visibleEmployees.length} profile{visibleEmployees.length === 1 ? '' : 's'}
          </p>
        </div>

        {canManageStaff && (
          <button
            type="button"
            onClick={openAddEmployee}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            {t(lang, 'addEmployee')}
          </button>
        )}
      </div>

      {/* Minimalist Filter Bar */}
      {!isEmployeeOnly && (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
          <div className="relative flex-1 max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t(lang, 'search')}
              aria-label="Search team"
              className="w-full ps-9 pe-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>
          <select
            value={sectionFilter}
            onChange={(e) => setSectionFilter(e.target.value)}
            aria-label="Filter by section"
            className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Sections</option>
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Minimalist Employee List (Max 3–4 Visible Fields per Row) */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {visibleEmployees.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleEmployees.map((emp) => {
              const primaryComp = companyMap.get(emp.primaryCompanyId);
              const sec = sectionMap.get(emp.sectionId);
              const isShared = isSharedEmployeeInCompany(emp, selectedCompanyId);
              const empDocs = documents.filter((d) => d.employeeId === emp.id);
              const hasAlert = empDocs.some(
                (d) => getDocumentExpiryStatus(d.expiryDate).status !== 'valid'
              );
              return (
                <button
                  key={emp.id}
                  type="button"
                  onClick={() => {
                    setSelectedEmpId(emp.id);
                    setDrawerTab(isEmployeeOnly ? 'documents' : 'overview');
                    setShowShiftForm(false);
                  }}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar src={emp.avatarUrl} name={emp.fullName} size="md" />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                          {emp.fullName}
                        </span>
                        {isShared && (
                          <span className="text-[11px] font-medium text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md whitespace-nowrap">
                            {t(lang, 'sharedEmployee')} · {primaryComp?.code}
                          </span>
                        )}
                        {emp.pendingShiftProposal && (
                          <span className="text-[11px] font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 px-2 py-0.5 rounded-md whitespace-nowrap">
                            Shift Pending
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                        {getRoleLabel(lang, emp.role)} · {sec?.name} · {primaryComp?.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 whitespace-nowrap">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          !emp.active
                            ? 'bg-slate-400'
                            : hasAlert
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        }`}
                      />
                      {!emp.active ? 'Inactive' : hasAlert ? 'Doc Alert' : 'Active'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Tabbed Slide-Over Drawer: Overview | Documents | Attendance | Salary */}
      <SlideOverDrawer
        open={Boolean(selectedEmp)}
        onClose={() => setSelectedEmpId(null)}
        title={selectedEmp?.fullName ?? ''}
        subtitle={
          selectedEmp
            ? `${selectedEmp.employeeCode} · ${selectedEmp.jobTitle} · ${companyMap.get(selectedEmp.primaryCompanyId)?.name ?? ''}`
            : undefined
        }
        maxWidthClass="max-w-2xl"
        headerExtra={
          selectedEmp && canManageStaff ? (
            <button
              type="button"
              onClick={() => openEditEmployee(selectedEmp)}
              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              {t(lang, 'edit')}
            </button>
          ) : undefined
        }
      >
        {selectedEmp && (
          <div className="space-y-5">
            {/* Drawer Tabs */}
            <div className="grid grid-cols-4 rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
              {(
                [
                  { id: 'overview', label: t(lang, 'overview') },
                  { id: 'documents', label: t(lang, 'documents') },
                  { id: 'attendance', label: t(lang, 'attendance') },
                  { id: 'salary', label: t(lang, 'salary') },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setDrawerTab(tab.id)}
                  className={`py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                    drawerTab === tab.id
                      ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* TAB 1: OVERVIEW */}
            {drawerTab === 'overview' && (
              <div className="space-y-4 text-xs">
                <dl className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500">Primary Company</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {companyMap.get(selectedEmp.primaryCompanyId)?.name}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500">Shared Companies</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {selectedEmp.sharedCompanyIds.length > 0
                        ? selectedEmp.sharedCompanyIds
                            .map((id) => companyMap.get(id)?.name)
                            .filter(Boolean)
                            .join(', ')
                        : 'None'}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500">Section & Role</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {sectionMap.get(selectedEmp.sectionId)?.name} ·{' '}
                      {getRoleLabel(lang, selectedEmp.role)}
                    </dd>
                  </div>
                  <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-3">
                    <dt className="text-slate-500">Employee Model</dt>
                    <dd className="mt-1 font-semibold text-slate-900 dark:text-white">
                      {selectedModel?.name ?? 'Default'}
                    </dd>
                  </div>
                </dl>

                {/* Fixed Shift & Pending Shift Approval Workflow */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                        Fixed Shift Schedule (No Overtime)
                      </p>
                      <p className="text-slate-500 dark:text-slate-400 mt-0.5 font-mono">
                        {selectedModel ? getEffectiveShiftStart(selectedEmp, selectedModel) : '08:00'} –{' '}
                        {selectedModel ? getEffectiveShiftEnd(selectedEmp, selectedModel) : '17:00'} ·{' '}
                        {(selectedEmp.customShift?.workingDays ?? selectedModel?.workingDays ?? []).join(', ')}
                      </p>
                    </div>
                    {canManageStaff && (
                      <button
                        type="button"
                        onClick={() => {
                          setShiftStartDraft(
                            selectedModel ? getEffectiveShiftStart(selectedEmp, selectedModel) : '08:00'
                          );
                          setShiftEndDraft(
                            selectedModel ? getEffectiveShiftEnd(selectedEmp, selectedModel) : '17:00'
                          );
                          setShiftDaysDraft(
                            selectedEmp.customShift?.workingDays ??
                              selectedModel?.workingDays ?? ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu']
                          );
                          setShowShiftForm((s) => !s);
                        }}
                        className="text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        Propose Shift
                      </button>
                    )}
                  </div>

                  {selectedEmp.pendingShiftProposal && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-amber-900 dark:text-amber-200">
                          {t(lang, 'pendingManagerApproval')}:{' '}
                          <span className="font-mono">
                            {selectedEmp.pendingShiftProposal.shiftStart}–
                            {selectedEmp.pendingShiftProposal.shiftEnd}
                          </span>
                        </p>
                        <p className="text-[11px] text-amber-800/80 dark:text-amber-300/80">
                          Proposed by {selectedEmp.pendingShiftProposal.proposedBy} ·{' '}
                          {selectedEmp.pendingShiftProposal.workingDays.join(', ')}
                        </p>
                      </div>
                      {canApproveShift && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => void onDecideShiftProposal(selectedEmp.id, true)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
                          >
                            {t(lang, 'approve')}
                          </button>
                          <button
                            type="button"
                            onClick={() => void onDecideShiftProposal(selectedEmp.id, false)}
                            className="px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs font-semibold cursor-pointer"
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
                      <div className="grid grid-cols-2 gap-3">
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
                                  prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
                                )
                              }
                              className={`px-2.5 py-1 rounded-lg text-[11px] font-medium border cursor-pointer ${
                                active
                                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-500'
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
                          className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer"
                        >
                          {t(lang, 'cancel')}
                        </button>
                        <button
                          type="submit"
                          className="px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
                        >
                          Submit for Manager Approval
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Assigned Geofences */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <p className="font-semibold text-slate-900 dark:text-white">Assigned Map Zones</p>
                  <p className="mt-1 text-slate-600 dark:text-slate-400">
                    {selectedEmp.assignedZoneIds
                      .map((id) => geofences.find((z) => z.id === id)?.name)
                      .filter(Boolean)
                      .join(' · ') || 'No assigned zones'}
                  </p>
                </div>
              </div>
            )}

            {/* TAB 2: DOCUMENTS */}
            {drawerTab === 'documents' && (
              <div className="space-y-4">
                {/* Model-specific Required Documents Compliance */}
                {selectedModel && (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-3.5 text-xs space-y-2">
                    <p className="font-semibold text-slate-800 dark:text-slate-200">
                      Required for {selectedModel.name}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {selectedModel.requiredDocuments.map((reqType) => {
                        const missing = selectedMissingDocs.includes(reqType);
                        return (
                          <span
                            key={reqType}
                            className={`inline-flex items-center gap-1 text-[11px] font-medium ${
                              missing
                                ? 'text-amber-700 dark:text-amber-400'
                                : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {missing ? (
                              <AlertTriangle className="w-3 h-3" />
                            ) : (
                              <CheckCircle2 className="w-3 h-3" />
                            )}
                            {reqType}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Uploaded Documents List */}
                <div className="space-y-2.5">
                  {selectedDocs.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-6">
                      No documents uploaded yet.
                    </p>
                  ) : (
                    selectedDocs.map((doc) => {
                      const exp = getDocumentExpiryStatus(doc.expiryDate);
                      return (
                        <div
                          key={doc.id}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {doc.type}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                              {doc.documentNumber} · Exp {formatShortDate(doc.expiryDate)}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <span
                              className={`text-xs font-semibold ${
                                exp.status === 'expired'
                                  ? 'text-rose-700 dark:text-rose-400'
                                  : exp.status === 'expiring_soon'
                                    ? 'text-amber-700 dark:text-amber-400'
                                    : 'text-emerald-700 dark:text-emerald-400'
                              }`}
                            >
                              {exp.status === 'expired'
                                ? 'Expired'
                                : exp.status === 'expiring_soon'
                                  ? `${exp.daysRemaining}d`
                                  : 'Valid'}
                            </span>
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              aria-label={`Preview ${doc.type}`}
                              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:text-indigo-700 cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                            {canManageStaff && (
                              <button
                                type="button"
                                onClick={() => void onDeleteDocument(doc.id)}
                                aria-label={`Delete ${doc.type}`}
                                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Drag-and-Drop Document Uploader (HR Admin / Main Manager) */}
                {canManageStaff && (
                  <form
                    onSubmit={handleUploadDoc}
                    className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3"
                  >
                    <p className="text-xs font-semibold text-slate-900 dark:text-white">
                      Upload Document
                    </p>
                    {docError && (
                      <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                        {docError}
                      </p>
                    )}
                    <div className="grid grid-cols-2 gap-2.5">
                      <select
                        value={docForm.type}
                        onChange={(e) => setDocForm((p) => ({ ...p, type: e.target.value }))}
                        aria-label="Document type"
                        className={INPUT_CLASS}
                      >
                        {allDocTypes.map((dt) => (
                          <option key={dt} value={dt}>
                            {dt}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={docForm.documentNumber}
                        onChange={(e) =>
                          setDocForm((p) => ({ ...p, documentNumber: e.target.value }))
                        }
                        placeholder="Document Number"
                        className={INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={docForm.issueDate}
                        onChange={(e) => setDocForm((p) => ({ ...p, issueDate: e.target.value }))}
                        aria-label="Issue date"
                        className={INPUT_CLASS}
                      />
                      <input
                        type="date"
                        value={docForm.expiryDate}
                        onChange={(e) => setDocForm((p) => ({ ...p, expiryDate: e.target.value }))}
                        aria-label="Expiry date"
                        className={INPUT_CLASS}
                      />
                    </div>

                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setDragActive(true);
                      }}
                      onDragLeave={() => setDragActive(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragActive(false);
                        void handleFilePicked(e.dataTransfer.files?.[0] ?? null);
                      }}
                      className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
                        dragActive
                          ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/30'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-950'
                      }`}
                    >
                      <UploadCloud className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mx-auto" />
                      <p className="mt-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                        {docForm.fileName || 'Drop PDF, JPG, or PNG here'}
                      </p>
                      <label className="mt-2 inline-flex items-center px-3 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium cursor-pointer">
                        Choose File
                        <input
                          type="file"
                          accept=".pdf,.jpg,.jpeg,.png"
                          className="sr-only"
                          onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>

                    <button
                      type="submit"
                      className="w-full py-2 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      Save Document
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* TAB 3: ATTENDANCE */}
            {drawerTab === 'attendance' && (
              <div className="space-y-2.5">
                {selectedAttendance.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">No recent logs.</p>
                ) : (
                  selectedAttendance.map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex items-center justify-between gap-3 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900 dark:text-white">
                          {formatShortDate(log.date)} · {log.zoneName}
                        </p>
                        <p className="font-mono text-slate-500 mt-0.5">
                          {formatTime(log.clockInTime)} → {formatTime(log.clockOutTime)}
                        </p>
                      </div>
                      <span
                        className={`font-semibold ${
                          !log.isLate
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : log.latenessExcused
                              ? 'text-amber-700 dark:text-amber-400'
                              : 'text-rose-700 dark:text-rose-400'
                        }`}
                      >
                        {!log.isLate
                          ? 'On Time'
                          : log.latenessExcused
                            ? 'Excused'
                            : `Late (-AED ${log.latenessPenaltyAED})`}
                      </span>
                    </div>
                  ))
                )}
              </div>
            )}

            {/* TAB 4: SALARY */}
            {drawerTab === 'salary' && selectedPayroll && (
              <div className="space-y-4 text-xs">
                <dl className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Base Salary</dt>
                    <dd className="font-mono font-medium text-slate-900 dark:text-white">
                      {formatAED(selectedPayroll.baseSalary)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-slate-500">Allowances (Housing + Transport + Other)</dt>
                    <dd className="font-mono font-medium text-slate-900 dark:text-white">
                      {formatAED(selectedPayroll.totalAllowances)}
                    </dd>
                  </div>
                  <div className="flex justify-between text-emerald-700 dark:text-emerald-400">
                    <dt>Bonuses ({currentMonth})</dt>
                    <dd className="font-mono">+{formatAED(selectedPayroll.totalBonuses)}</dd>
                  </div>
                  <div className="flex justify-between text-rose-700 dark:text-rose-400">
                    <dt>Total Deductions ({currentMonth})</dt>
                    <dd className="font-mono">-{formatAED(selectedPayroll.totalDeductions)}</dd>
                  </div>
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex justify-between text-sm font-bold">
                    <dt className="text-slate-900 dark:text-white">Net Payable</dt>
                    <dd className="font-mono text-indigo-800 dark:text-indigo-300">
                      {formatAED(selectedPayroll.netSalary)}
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>

      {/* Document Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-2 pb-3 border-b border-slate-200 dark:border-slate-800">
              <div>
                <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {previewDoc.type}
                </h4>
                <p className="text-xs text-slate-500 font-mono">{previewDoc.documentNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close preview"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950 p-6 text-center space-y-2">
              {previewDoc.fileDataUrl && previewDoc.fileType.startsWith('image/') ? (
                <img
                  src={previewDoc.fileDataUrl}
                  alt={previewDoc.fileName}
                  className="max-h-64 mx-auto rounded object-contain"
                />
              ) : (
                <>
                  <FileText className="w-8 h-8 text-indigo-600 mx-auto" />
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {previewDoc.fileName}
                  </p>
                  <p className="text-xs text-slate-500">
                    Expires {formatShortDate(previewDoc.expiryDate)}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal */}
      {showEmpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-label={editingEmp ? 'Edit Employee' : 'Add Employee'}
        >
          <div className="w-full max-w-2xl rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl my-8">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {editingEmp ? `Edit ${editingEmp.fullName}` : t(lang, 'addEmployee')}
              </h3>
              <button
                type="button"
                onClick={() => setShowEmpModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4">
              {empError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {empError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    value={empForm.fullName}
                    onChange={(e) => setEmpForm((p) => ({ ...p, fullName: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Employee ID
                  </label>
                  <input
                    type="text"
                    required
                    value={empForm.employeeCode}
                    onChange={(e) => setEmpForm((p) => ({ ...p, employeeCode: e.target.value }))}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    required
                    value={empForm.email}
                    onChange={(e) => setEmpForm((p) => ({ ...p, email: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Job Title
                  </label>
                  <input
                    type="text"
                    required
                    value={empForm.jobTitle}
                    onChange={(e) => setEmpForm((p) => ({ ...p, jobTitle: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Primary Company
                  </label>
                  <select
                    value={empForm.primaryCompanyId}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, primaryCompanyId: e.target.value }))
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Section
                  </label>
                  <select
                    value={empForm.sectionId}
                    onChange={(e) => setEmpForm((p) => ({ ...p, sectionId: e.target.value }))}
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
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Role
                  </label>
                  <select
                    value={empForm.role}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, role: e.target.value as UserRole }))
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
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Employee Model
                  </label>
                  <select
                    value={empForm.modelId}
                    onChange={(e) => setEmpForm((p) => ({ ...p, modelId: e.target.value }))}
                    className={INPUT_CLASS}
                  >
                    {models.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Shared / Secondary Companies */}
              <div>
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Shared / Secondary Companies (Optional)
                </p>
                <div className="flex flex-wrap gap-2">
                  {companies
                    .filter((c) => c.id !== empForm.primaryCompanyId)
                    .map((c) => {
                      const checked = empForm.sharedCompanyIds.includes(c.id);
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() =>
                            setEmpForm((p) => ({
                              ...p,
                              sharedCompanyIds: checked
                                ? p.sharedCompanyIds.filter((id) => id !== c.id)
                                : [...p.sharedCompanyIds, c.id],
                            }))
                          }
                          className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                            checked
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-200'
                              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {c.name}
                        </button>
                      );
                    })}
                </div>
              </div>

              {/* Salary AED */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Base (AED)</label>
                  <input
                    type="number"
                    min={0}
                    value={empForm.baseSalary}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, baseSalary: Number(e.target.value) }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Housing</label>
                  <input
                    type="number"
                    min={0}
                    value={empForm.housingAllowance}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, housingAllowance: Number(e.target.value) }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Transport</label>
                  <input
                    type="number"
                    min={0}
                    value={empForm.transportAllowance}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, transportAllowance: Number(e.target.value) }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-slate-500 mb-1">Other</label>
                  <input
                    type="number"
                    min={0}
                    value={empForm.otherAllowance}
                    onChange={(e) =>
                      setEmpForm((p) => ({ ...p, otherAllowance: Number(e.target.value) }))
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmpModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 cursor-pointer"
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
