import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Edit3,
  Eye,
  FileBadge,
  FileText,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { getRoleLabel, getWorkTypeLabel, t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  AttendanceLog,
  BuiltInDocumentType,
  BulkImportResult,
  BulkImportUserRow,
  Company,
  CreateEmployeePayload,
  DeductionApprovalRequest,
  DeductionWorkflowConfig,
  DocumentTypeValue,
  Employee,
  EmployeeDocument,
  EmployeeGroup,
  EmployeeLabel,
  EmployeeModel,
  GeofenceZone,
  HiddenSectionKey,
  Language,
  LeaveRequest,
  PatchMoneyRelease,
  PayrollAdjustment,
  PayrollCategoryItem,
  PayrollEntry,
  ProAssignment,
  Project,
  SalaryReleaseSchedule,
  Section,
  ShiftSchedule,
  UpdateEmployeePayload,
  UserRole,
  WorkType,
} from '../types/hr';
import {
  ALL_WORK_TYPES,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  formatShortDate,
  getDocumentExpiryStatus,
  getDocumentPreviewSource,
  isAdminOrHRRole,
  isProAssignmentActive,
  isSharedEmployeeInCompany,
  normalizeWorkType,
} from '../utils/hrLogic';
import { useIsCompactOverlay } from '../hooks/useIsCompactOverlay';
import { Avatar } from './Avatar';
import { BulkImportEmployeesPage } from './BulkImportEmployeesPage';
import { ConfirmDialog } from './ConfirmDialog';
import { EmployeeFormPage } from './EmployeeFormPage';
import { EmployeeProfilePage } from './EmployeeProfilePage';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface EmployeesViewProps {
  lang: Language;
  mode: 'directory' | 'documents' | 'pro_assignments';
  currentUser: Employee;
  activeRole: UserRole;
  selectedCompanyId: string;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  groups?: EmployeeGroup[];
  projects?: Project[];
  hiddenSections?: HiddenSectionKey[];
  proAssignments: ProAssignment[];
  models: EmployeeModel[];
  scopedEmployees: Employee[];
  allEmployees?: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  attendance: AttendanceLog[];
  leaves: LeaveRequest[];
  payrollAdjustments: PayrollAdjustment[];
  payrollEntries: PayrollEntry[];
  payrollCategories: PayrollCategoryItem[];
  deductionApprovals?: DeductionApprovalRequest[];
  patchReleases?: PatchMoneyRelease[];
  deductionWorkflowConfig?: DeductionWorkflowConfig;
  salaryReleases: SalaryReleaseSchedule[];
  customDocumentTypes: string[];
  onCreateEmployee: (
    emp: CreateEmployeePayload,
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
  onUpdateEmployee: (id: string, patch: UpdateEmployeePayload) => Promise<void>;
  onResetPassword?: (employeeId: string, newPassword: string) => Promise<void>;
  onBulkImportEmployees?: (payload: {
    users: BulkImportUserRow[];
    defaultPassword?: string;
  }) => Promise<BulkImportResult>;
  onProposeShift: (employeeId: string, schedule: ShiftSchedule) => Promise<void>;
  onDecideShiftProposal: (employeeId: string, approve: boolean) => Promise<void>;
  onUploadDocument: (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
  onCreateProAssignment?: (input: Omit<ProAssignment, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteProAssignment?: (id: string) => Promise<void>;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  lang,
  mode,
  currentUser,
  activeRole,
  selectedCompanyId,
  companies,
  sections,
  labels,
  groups = [],
  projects = [],
  hiddenSections = [],
  proAssignments,
  models,
  scopedEmployees,
  allEmployees,
  geofences,
  documents,
  attendance,
  leaves,
  payrollAdjustments,
  payrollEntries,
  payrollCategories,
  deductionApprovals = [],
  patchReleases = [],
  deductionWorkflowConfig = DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  salaryReleases,
  customDocumentTypes,
  onCreateEmployee,
  onUpdateEmployee,
  onResetPassword,
  onBulkImportEmployees,
  onProposeShift,
  onDecideShiftProposal,
  onUploadDocument,
  onDeleteDocument,
  onCreateProAssignment,
  onDeleteProAssignment,
}) => {
  const isCompactOverlay = useIsCompactOverlay();
  const canManageStaff = isAdminOrHRRole(activeRole);
  const isEmployeeOnly = activeRole === UserRole.Employee;
  const isPro = activeRole === UserRole.PRO;

  // Sub-page navigation within EmployeesView
  const [subPage, setSubPage] = useState<
    'list' | 'profile' | 'create' | 'edit' | 'bulk_import' | 'upload_doc'
  >('list');
  const [selectedEmpId, setSelectedEmpId] = useState<string | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<'profile' | 'salary' | 'documents' | 'attendance'>('profile');
  const [editingEmpId, setEditingEmpId] = useState<string | null>(null);

  // Reset subPage when top-level sidebar mode changes
  useEffect(() => {
    setSubPage('list');
    setSelectedEmpId(null);
    setEditingEmpId(null);
  }, [mode]);

  // Directory filters
  const [search, setSearch] = useState('');
  const [sectionFilter, setSectionFilter] = useState('all');
  const [labelFilter, setLabelFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');
  const [projectFilter, setProjectFilter] = useState('all');
  const [workTypeFilter, setWorkTypeFilter] = useState<'all' | WorkType>('all');
  const [roleTitleFilter, setRoleTitleFilter] = useState('all');

  // Documents vault state
  const [docSearch, setDocSearch] = useState('');
  const [docStatusFilter, setDocStatusFilter] = useState<'all' | 'valid' | 'expiring_soon' | 'expired'>('all');
  const [docEmpFilter, setDocEmpFilter] = useState('all');
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);
  const [confirmDeleteDoc, setConfirmDeleteDoc] = useState<EmployeeDocument | null>(null);
  const [docError, setDocError] = useState<string | null>(null);
  const [docSaving, setDocSaving] = useState(false);
  const [docForm, setDocForm] = useState({
    employeeId: scopedEmployees[0]?.id ?? currentUser.id,
    type: BuiltInDocumentType.Passport as DocumentTypeValue,
    documentNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    fileName: '',
    fileType: '',
    fileDataUrl: '',
    notes: '',
  });

  // PRO Assignments state
  const poolEmployees = allEmployees ?? scopedEmployees;
  const proOfficers = useMemo(
    () => poolEmployees.filter((e) => e.role === UserRole.PRO && e.active),
    [poolEmployees]
  );
  const assignableEmployees = useMemo(
    () => poolEmployees.filter((e) => e.active && e.role !== UserRole.PRO),
    [poolEmployees]
  );
  const [proOfficerId, setProOfficerId] = useState('');
  const [proTargetEmpId, setProTargetEmpId] = useState('');
  const [proExpiresAt, setProExpiresAt] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [proNotes, setProNotes] = useState('');
  const [proSaving, setProSaving] = useState(false);
  const [proError, setProError] = useState<string | null>(null);
  const [confirmRevokePro, setConfirmRevokePro] = useState<ProAssignment | null>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const sectionMap = useMemo(() => new Map(sections.map((s) => [s.id, s])), [sections]);
  const labelMap = useMemo(() => new Map(labels.map((l) => [l.id, l])), [labels]);
  const empMap = useMemo(() => new Map(poolEmployees.map((e) => [e.id, e])), [poolEmployees]);

  const activeProAssignmentByEmp = useMemo(() => {
    const map = new Map<string, ProAssignment>();
    if (!isPro) return map;
    proAssignments.forEach((a) => {
      if (a.proUserId === currentUser.id && isProAssignmentActive(a)) {
        map.set(a.employeeId, a);
      }
    });
    return map;
  }, [proAssignments, isPro, currentUser.id]);

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

  const distinctJobTitles = useMemo(() => {
    const set = new Set<string>();
    scopedEmployees.forEach((e) => {
      if (e.jobTitle && e.jobTitle.trim()) set.add(e.jobTitle.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [scopedEmployees]);

  const hasActiveFilters =
    Boolean(search.trim()) ||
    sectionFilter !== 'all' ||
    labelFilter !== 'all' ||
    groupFilter !== 'all' ||
    projectFilter !== 'all' ||
    workTypeFilter !== 'all' ||
    roleTitleFilter !== 'all';

  const clearAllFilters = () => {
    setSearch('');
    setSectionFilter('all');
    setLabelFilter('all');
    setGroupFilter('all');
    setProjectFilter('all');
    setWorkTypeFilter('all');
    setRoleTitleFilter('all');
  };

  const visibleEmployees = useMemo(() => {
    return scopedEmployees.filter((emp) => {
      if (sectionFilter !== 'all' && emp.sectionId !== sectionFilter) return false;
      if (labelFilter !== 'all' && !emp.labelIds.includes(labelFilter)) return false;
      if (groupFilter !== 'all' && !(emp.groupIds ?? []).includes(groupFilter)) return false;
      if (projectFilter !== 'all' && !(emp.projectIds ?? []).includes(projectFilter)) return false;
      if (workTypeFilter !== 'all' && normalizeWorkType(emp.workType) !== workTypeFilter) {
        return false;
      }
      if (roleTitleFilter !== 'all') {
        if (roleTitleFilter.startsWith('role:')) {
          const targetRole = roleTitleFilter.slice(5);
          if (emp.role !== targetRole) return false;
        } else if (roleTitleFilter.startsWith('title:')) {
          const targetTitle = roleTitleFilter.slice(6);
          if ((emp.jobTitle ?? '').trim() !== targetTitle) return false;
        }
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${emp.fullName} ${emp.employeeCode} ${emp.jobTitle} ${emp.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [
    scopedEmployees,
    sectionFilter,
    labelFilter,
    groupFilter,
    projectFilter,
    workTypeFilter,
    roleTitleFilter,
    search,
  ]);

  const directoryKpis = useMemo(() => {
    const activeCount = scopedEmployees.filter((e) => e.active).length;
    const empWithAlerts = new Set<string>();
    documents.forEach((d) => {
      if (getDocumentExpiryStatus(d.expiryDate).status !== 'valid') {
        empWithAlerts.add(d.employeeId);
      }
    });
    return {
      total: scopedEmployees.length,
      active: activeCount,
      alerts: empWithAlerts.size,
    };
  }, [scopedEmployees, documents]);

  const visibleDocuments = useMemo(() => {
    const q = docSearch.trim().toLowerCase();
    return documents
      .filter((doc) => {
        if (docEmpFilter !== 'all' && doc.employeeId !== docEmpFilter) return false;
        const expiry = getDocumentExpiryStatus(doc.expiryDate);
        if (docStatusFilter !== 'all' && expiry.status !== docStatusFilter) return false;
        if (q) {
          const emp = empMap.get(doc.employeeId);
          const hay = `${emp?.fullName ?? ''} ${emp?.employeeCode ?? ''} ${doc.type} ${doc.documentNumber} ${doc.fileName}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  }, [documents, docEmpFilter, docStatusFilter, docSearch, empMap]);

  const docKpis = useMemo(() => {
    let expiring = 0;
    let expired = 0;
    documents.forEach((d) => {
      const st = getDocumentExpiryStatus(d.expiryDate).status;
      if (st === 'expiring_soon') expiring += 1;
      if (st === 'expired') expired += 1;
    });
    return { total: documents.length, expiring, expired };
  }, [documents]);

  const selectedEmp = scopedEmployees.find((e) => e.id === selectedEmpId) ?? null;
  const editingEmp = scopedEmployees.find((e) => e.id === editingEmpId) ?? null;

  const openProfile = (emp: Employee, tab: 'profile' | 'salary' | 'documents' | 'attendance' = 'profile') => {
    setSelectedEmpId(emp.id);
    setProfileInitialTab(isPro ? 'documents' : tab);
    setSubPage('profile');
  };

  const openCreateEmployee = () => {
    setEditingEmpId(null);
    setSubPage('create');
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmpId(emp.id);
    setSubPage('edit');
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

  const handleSubmitUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = isEmployeeOnly ? currentUser.id : docForm.employeeId;
    if (!targetEmpId) {
      setDocError('Select an employee.');
      return;
    }
    if (!docForm.documentNumber.trim() || !docForm.expiryDate || !docForm.fileName) {
      setDocError('Document number, expiry date, and attached file are required.');
      return;
    }
    setDocSaving(true);
    setDocError(null);
    try {
      await onUploadDocument({
        employeeId: targetEmpId,
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
        employeeId: scopedEmployees[0]?.id ?? currentUser.id,
        type: BuiltInDocumentType.Passport,
        documentNumber: '',
        issueDate: new Date().toISOString().slice(0, 10),
        expiryDate: '',
        fileName: '',
        fileType: '',
        fileDataUrl: '',
        notes: '',
      });
      setSubPage('list');
    } catch (err) {
      setDocError(err instanceof Error ? err.message : 'Unable to upload document.');
    } finally {
      setDocSaving(false);
    }
  };

  const handleGrantProAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCreateProAssignment) return;
    const chosenPro = proOfficerId || proOfficers[0]?.id;
    const chosenEmp = proTargetEmpId || assignableEmployees[0]?.id;
    if (!chosenPro || !chosenEmp || !proExpiresAt) {
      setProError('Select a PRO officer, an employee, and an expiry date.');
      return;
    }
    setProSaving(true);
    setProError(null);
    try {
      await onCreateProAssignment({
        proUserId: chosenPro,
        employeeId: chosenEmp,
        accessStart: new Date().toISOString(),
        accessExpiresAt: proExpiresAt,
        assignedBy: currentUser.fullName,
        notes: proNotes.trim() || undefined,
      });
      setProNotes('');
    } catch (err) {
      setProError(err instanceof Error ? err.message : 'Unable to grant PRO access.');
    } finally {
      setProSaving(false);
    }
  };

  // =========================================================================
  // FULL-PAGE SUB-VIEWS (No popups in desktop browser mode!)
  // =========================================================================
  if (subPage === 'create' && canManageStaff) {
    const formNode = (
      <EmployeeFormPage
        lang={lang}
        activeRole={activeRole}
        mode="create"
        editingEmployee={null}
        selectedCompanyId={selectedCompanyId}
        companies={companies}
        sections={sections}
        labels={labels}
        groups={groups}
        projects={projects}
        models={models}
        geofences={geofences}
        payrollCategories={payrollCategories}
        deductionWorkflowConfig={deductionWorkflowConfig}
        existingEmployeeCount={poolEmployees.length}
        onBack={() => setSubPage('list')}
        onCreateEmployee={async (payload, additionalIncomes) => {
          await onCreateEmployee(payload, additionalIncomes);
          setSubPage('list');
        }}
        onUpdateEmployee={onUpdateEmployee}
      />
    );
    if (isCompactOverlay) {
      return (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-24">
          {formNode}
        </div>
      );
    }
    return formNode;
  }

  if (subPage === 'edit' && canManageStaff && editingEmp) {
    const formNode = (
      <EmployeeFormPage
        lang={lang}
        activeRole={activeRole}
        mode="edit"
        editingEmployee={editingEmp}
        selectedCompanyId={selectedCompanyId}
        companies={companies}
        sections={sections}
        labels={labels}
        groups={groups}
        projects={projects}
        models={models}
        geofences={geofences}
        payrollCategories={payrollCategories}
        deductionWorkflowConfig={deductionWorkflowConfig}
        existingEmployeeCount={poolEmployees.length}
        onBack={() => {
          if (selectedEmpId === editingEmp.id) {
            setSubPage('profile');
          } else {
            setSubPage('list');
          }
        }}
        onCreateEmployee={onCreateEmployee}
        onUpdateEmployee={async (id, patch) => {
          await onUpdateEmployee(id, patch);
          if (selectedEmpId === id) {
            setSubPage('profile');
          } else {
            setSubPage('list');
          }
        }}
        onResetPassword={
          onResetPassword ??
          (async (employeeId, newPassword) => {
            await onUpdateEmployee(employeeId, { resetPassword: newPassword });
          })
        }
      />
    );
    if (isCompactOverlay) {
      return (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-24">
          {formNode}
        </div>
      );
    }
    return formNode;
  }

  if (subPage === 'bulk_import' && canManageStaff && onBulkImportEmployees) {
    return (
      <BulkImportEmployeesPage
        lang={lang}
        existingEmployees={poolEmployees}
        companies={companies}
        sections={sections}
        onBack={() => setSubPage('list')}
        onBulkImport={onBulkImportEmployees}
      />
    );
  }

  if (subPage === 'profile' && selectedEmp) {
    return (
      <EmployeeProfilePage
        lang={lang}
        employee={selectedEmp}
        activeRole={activeRole}
        companies={companies}
        sections={sections}
        labels={labels}
        groups={groups}
        projects={projects}
        hiddenSections={hiddenSections}
        models={models}
        geofences={geofences}
        documents={documents.filter((d) => d.employeeId === selectedEmp.id)}
        attendance={attendance}
        leaves={leaves}
        payrollAdjustments={payrollAdjustments}
        payrollEntries={payrollEntries}
        deductionApprovals={deductionApprovals}
        patchReleases={patchReleases}
        deductionWorkflowConfig={deductionWorkflowConfig}
        salaryReleases={salaryReleases}
        customDocumentTypes={customDocumentTypes}
        activeProAssignment={activeProAssignmentByEmp.get(selectedEmp.id)}
        initialTab={profileInitialTab}
        onBack={() => setSubPage('list')}
        onEdit={(emp) => openEditEmployee(emp)}
        onResetPassword={
          onResetPassword ??
          (async (employeeId, newPassword) => {
            await onUpdateEmployee(employeeId, { resetPassword: newPassword });
          })
        }
        onProposeShift={onProposeShift}
        onDecideShiftProposal={onDecideShiftProposal}
        onUploadDocument={onUploadDocument}
        onDeleteDocument={onDeleteDocument}
      />
    );
  }

  if (subPage === 'upload_doc' && mode === 'documents') {
    const uploadNode = (
      <div className="max-w-2xl mx-auto space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          crumbs={[
            { label: t(lang, 'navGroupPeople') },
            { label: t(lang, 'navDocuments'), onClick: () => setSubPage('list') },
            { label: t(lang, 'uploadDocument') },
          ]}
          title={t(lang, 'uploadDocument')}
          subtitle="Attach passports, visas, Emirates IDs, or labor cards to the compliance vault."
          onBack={() => setSubPage('list')}
        />

        <form
          onSubmit={handleSubmitUploadDoc}
          noValidate
          className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          {docError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              {docError}
            </div>
          )}

          {!isEmployeeOnly && (
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Employee *
              </label>
              <select
                value={docForm.employeeId}
                onChange={(e) => setDocForm((p) => ({ ...p, employeeId: e.target.value }))}
                className={INPUT_CLASS}
              >
                {scopedEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Document Type *
              </label>
              <select
                value={docForm.type}
                onChange={(e) => setDocForm((p) => ({ ...p, type: e.target.value as DocumentTypeValue }))}
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
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Document Number *
              </label>
              <input
                type="text"
                value={docForm.documentNumber}
                onChange={(e) => setDocForm((p) => ({ ...p, documentNumber: e.target.value }))}
                placeholder="e.g., 784-1990-1234567-1"
                className={`${INPUT_CLASS} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Issue Date
              </label>
              <input
                type="date"
                value={docForm.issueDate}
                onChange={(e) => setDocForm((p) => ({ ...p, issueDate: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Expiry Date *
              </label>
              <input
                type="date"
                value={docForm.expiryDate}
                onChange={(e) => setDocForm((p) => ({ ...p, expiryDate: e.target.value }))}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              File Attachment (PDF / Image) *
            </label>
            <label className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 p-5 text-center cursor-pointer hover:border-teal-500 transition-colors">
              <UploadCloud className="w-6 h-6 text-teal-600 dark:text-teal-400 mb-1.5" />
              <span className="text-xs font-medium text-slate-700 dark:text-slate-200">
                {docForm.fileName || 'Click to choose PDF, JPG, or PNG file'}
              </span>
              <input
                type="file"
                accept=".pdf,image/*"
                onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                className="hidden"
              />
            </label>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Notes (Optional)
            </label>
            <input
              type="text"
              value={docForm.notes}
              onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Renewal details or issuing authority"
              className={INPUT_CLASS}
            />
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setSubPage('list')}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={docSaving}
              className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {t(lang, 'uploadDocument')}
            </button>
          </div>
        </form>
      </div>
    );
    if (isCompactOverlay) {
      return (
        <div className="fixed inset-0 z-40 bg-slate-50 dark:bg-slate-950 overflow-y-auto p-4 pb-24">
          {uploadNode}
        </div>
      );
    }
    return uploadNode;
  }

  // =========================================================================
  // MODE 3: PRO ASSIGNMENTS (Time-Limited Document Access)
  // =========================================================================
  if (mode === 'pro_assignments') {
    const visibleGrants = isPro
      ? proAssignments.filter((a) => a.proUserId === currentUser.id)
      : proAssignments;
    const activeGrantsCount = visibleGrants.filter((a) => isProAssignmentActive(a)).length;
    const expiredGrantsCount = visibleGrants.length - activeGrantsCount;

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {t(lang, 'navProAssignments')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {isPro
              ? 'Your time-limited employee document access windows.'
              : 'Grant or revoke time-limited document access for PRO officers.'}
          </p>
        </div>

        {/* 3 Focused KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Active Access Windows</span>
              <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {activeGrantsCount}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>PRO Officers</span>
              <FileBadge className="w-4 h-4 text-slate-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {proOfficers.length}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Expired Grants</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {expiredGrantsCount}
            </p>
          </div>
        </section>

        {/* Grant Form for HR / Main Manager */}
        {canManageStaff && onCreateProAssignment && (
          <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
              Grant Time-Limited PRO Access
            </h2>
            {proError && (
              <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                {proError}
              </p>
            )}
            <form onSubmit={handleGrantProAccess} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 items-end">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  PRO Officer
                </label>
                <select
                  value={proOfficerId || proOfficers[0]?.id || ''}
                  onChange={(e) => setProOfficerId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {proOfficers.length === 0 ? (
                    <option value="">No PRO accounts found</option>
                  ) : (
                    proOfficers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName}
                      </option>
                    ))
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Employee
                </label>
                <select
                  value={proTargetEmpId || assignableEmployees[0]?.id || ''}
                  onChange={(e) => setProTargetEmpId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  {assignableEmployees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.fullName} ({emp.employeeCode})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(lang, 'accessExpires')}
                </label>
                <input
                  type="date"
                  value={proExpiresAt}
                  onChange={(e) => setProExpiresAt(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Purpose / Notes
                </label>
                <input
                  type="text"
                  value={proNotes}
                  onChange={(e) => setProNotes(e.target.value)}
                  placeholder="Visa renewal / Emirates ID"
                  className={INPUT_CLASS}
                />
              </div>
              <button
                type="submit"
                disabled={proSaving || proOfficers.length === 0}
                className="h-[38px] px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                Grant Access
              </button>
            </form>
          </section>
        )}

        {/* Assignments Table */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {visibleGrants.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'noRecords')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">Employee</th>
                    {!isPro && <th className="py-3 px-4 text-start">PRO Officer</th>}
                    <th className="py-3 px-4 text-start">Purpose</th>
                    <th className="py-3 px-4 text-start">{t(lang, 'accessExpires')}</th>
                    <th className="py-3 px-4 text-start">Status</th>
                    <th className="py-3 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {visibleGrants.map((grant) => {
                    const emp = empMap.get(grant.employeeId);
                    const pro = empMap.get(grant.proUserId);
                    const active = isProAssignmentActive(grant);
                    return (
                      <tr
                        key={grant.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {emp?.fullName ?? grant.employeeId}
                              </p>
                              <p className="text-[11px] font-mono text-slate-400">
                                {emp?.employeeCode}
                              </p>
                            </div>
                          </div>
                        </td>
                        {!isPro && (
                          <td className="py-3.5 px-4 text-slate-700 dark:text-slate-300 font-medium">
                            {pro?.fullName ?? grant.proUserId}
                          </td>
                        )}
                        <td className="py-3.5 px-4 text-slate-600 dark:text-slate-400">
                          {grant.notes || 'Government & visa documents'}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatShortDate(grant.accessExpiresAt)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              active
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-slate-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                active ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                              }`}
                            />
                            {active ? 'Active' : 'Expired'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1">
                            {emp && active && (
                              <button
                                type="button"
                                onClick={() => openProfile(emp, 'documents')}
                                title="View Documents"
                                aria-label={`View documents for ${emp.fullName}`}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            )}
                            {canManageStaff && onDeleteProAssignment && (
                              <button
                                type="button"
                                onClick={() => setConfirmRevokePro(grant)}
                                title="Revoke access"
                                aria-label="Revoke PRO access"
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
          open={Boolean(confirmRevokePro)}
          lang={lang}
          title="Revoke PRO Access"
          message="This PRO officer will immediately lose access to this employee's documents."
          confirmLabel="Revoke"
          destructive
          onCancel={() => setConfirmRevokePro(null)}
          onConfirm={async () => {
            if (confirmRevokePro && onDeleteProAssignment) {
              await onDeleteProAssignment(confirmRevokePro.id);
            }
            setConfirmRevokePro(null);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // MODE 2: DOCUMENTS VAULT
  // =========================================================================
  if (mode === 'documents') {
    const previewSource = previewDoc ? getDocumentPreviewSource(previewDoc) : null;

    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
              {isPro ? t(lang, 'navProDocs') : isEmployeeOnly ? t(lang, 'navMyDocs') : t(lang, 'navDocuments')}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {visibleDocuments.length} document{visibleDocuments.length === 1 ? '' : 's'}
              {isPro ? ' · Active time-limited assignments only' : ''}
            </p>
          </div>

          {!isPro && (
            <button
              type="button"
              onClick={() => {
                setDocError(null);
                setDocForm((p) => ({
                  ...p,
                  employeeId: isEmployeeOnly ? currentUser.id : scopedEmployees[0]?.id ?? currentUser.id,
                }));
                setSubPage('upload_doc');
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'uploadDocument')}
            </button>
          )}
        </div>

        {/* 3 Focused Compliance KPI Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Total Documents</span>
              <FileText className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {docKpis.total}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Expiring Soon (≤ 30d)</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {docKpis.expiring}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Expired</span>
              <AlertTriangle className="w-4 h-4 text-rose-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-400">
              {docKpis.expired}
            </p>
          </div>
        </section>

        {/* Clean Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={docSearch}
              onChange={(e) => setDocSearch(e.target.value)}
              placeholder={t(lang, 'search')}
              aria-label="Search documents"
              className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            />
          </div>
          {!isEmployeeOnly && (
            <select
              value={docEmpFilter}
              onChange={(e) => setDocEmpFilter(e.target.value)}
              aria-label="Filter by employee"
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Employees</option>
              {scopedEmployees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.fullName}
                </option>
              ))}
            </select>
          )}
          <select
            value={docStatusFilter}
            onChange={(e) =>
              setDocStatusFilter(e.target.value as 'all' | 'valid' | 'expiring_soon' | 'expired')
            }
            aria-label="Filter by expiry status"
            className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
          >
            <option value="all">All Statuses</option>
            <option value="valid">Valid</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
          </select>
        </div>

        {/* Scannable Documents Table */}
        <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          {visibleDocuments.length === 0 ? (
            <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'noRecords')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-start border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                    <th className="py-3 px-4 text-start">Employee</th>
                    <th className="py-3 px-4 text-start">Document</th>
                    <th className="py-3 px-4 text-start">Document No.</th>
                    <th className="py-3 px-4 text-start">Expiry</th>
                    <th className="py-3 px-4 text-start">Status</th>
                    <th className="py-3 px-4 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {visibleDocuments.map((doc) => {
                    const emp = empMap.get(doc.employeeId);
                    const expiry = getDocumentExpiryStatus(doc.expiryDate);
                    const src = getDocumentPreviewSource(doc);
                    return (
                      <tr
                        key={doc.id}
                        className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-2.5">
                            <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 dark:text-white truncate">
                                {emp?.fullName ?? doc.employeeId}
                              </p>
                              <p className="text-[11px] font-mono text-slate-400">
                                {emp?.employeeCode}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <p className="font-medium text-slate-800 dark:text-slate-100">{doc.type}</p>
                          <p className="text-[11px] text-slate-400 truncate max-w-[180px]">
                            {doc.fileName}
                          </p>
                        </td>
                        <td className="py-3.5 px-4 font-mono text-slate-700 dark:text-slate-300">
                          {doc.documentNumber}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-300">
                          {formatShortDate(doc.expiryDate)}
                        </td>
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center gap-1.5 font-medium ${
                              expiry.status === 'expired'
                                ? 'text-rose-700 dark:text-rose-400'
                                : expiry.status === 'expiring_soon'
                                  ? 'text-amber-700 dark:text-amber-400'
                                  : 'text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            <span
                              className={`w-1.5 h-1.5 rounded-full ${
                                expiry.status === 'expired'
                                  ? 'bg-rose-500'
                                  : expiry.status === 'expiring_soon'
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                              }`}
                            />
                            {expiry.status === 'expired'
                              ? `Expired (${Math.abs(expiry.daysRemaining)}d)`
                              : expiry.status === 'expiring_soon'
                                ? `${expiry.daysRemaining}d left`
                                : 'Valid'}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-end">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setPreviewDoc(doc)}
                              title={t(lang, 'view')}
                              aria-label={`View ${doc.type}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <a
                              href={src.url}
                              download={doc.fileName}
                              title={t(lang, 'download')}
                              aria-label={`Download ${doc.type}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            {canManageStaff && (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteDoc(doc)}
                                title={t(lang, 'delete')}
                                aria-label={`Delete ${doc.type}`}
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

        {/* Document Preview Lightbox */}
        {previewDoc && previewSource && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-4"
            role="dialog"
            aria-modal="true"
            aria-label={`Preview ${previewDoc.type}`}
          >
            <div className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                    {previewDoc.type} · {previewDoc.documentNumber}
                  </h3>
                  <p className="text-[11px] text-slate-500 truncate">{previewDoc.fileName}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={previewSource.url}
                    download={previewDoc.fileName}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {t(lang, 'download')}
                  </a>
                  <button
                    type="button"
                    onClick={() => setPreviewDoc(null)}
                    aria-label="Close preview"
                    className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-4 flex items-center justify-center min-h-[360px]">
                {previewSource.isImage ? (
                  <img
                    src={previewSource.url}
                    alt={previewDoc.fileName}
                    className="max-w-full max-h-[70vh] rounded-lg object-contain shadow-sm"
                  />
                ) : previewSource.isPdf ? (
                  <iframe
                    src={previewSource.url}
                    title={previewDoc.fileName}
                    className="w-full h-[70vh] rounded-lg bg-white border border-slate-200"
                  />
                ) : (
                  <div className="text-center space-y-2 p-6">
                    <FileText className="w-10 h-10 text-slate-400 mx-auto" />
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {previewDoc.fileName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Inline preview unavailable for this format. Use Download above.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <ConfirmDialog
          open={Boolean(confirmDeleteDoc)}
          lang={lang}
          title={t(lang, 'confirmDeleteTitle')}
          message={t(lang, 'confirmDeleteMessage')}
          confirmLabel={t(lang, 'delete')}
          destructive
          onCancel={() => setConfirmDeleteDoc(null)}
          onConfirm={async () => {
            if (confirmDeleteDoc) {
              await onDeleteDocument(confirmDeleteDoc.id);
            }
            setConfirmDeleteDoc(null);
          }}
        />
      </div>
    );
  }

  // =========================================================================
  // MODE 1: EMPLOYEES DIRECTORY (Clean Modern HR Table + 3 KPI Cards)
  // =========================================================================
  return (
    <div className="space-y-6">
      {/* Page Header — Strictly Scoped to Employees Directory */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white tracking-tight">
            {isPro
              ? t(lang, 'navProDocs')
              : isEmployeeOnly
                ? t(lang, 'myProfile')
                : t(lang, 'navEmployeesDirectory')}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {visibleEmployees.length} profile{visibleEmployees.length === 1 ? '' : 's'}
            {isPro ? ' · Active time-limited assignments only' : ''}
          </p>
        </div>

        {canManageStaff && (
          <div className="flex flex-wrap items-center gap-2">
            {onBulkImportEmployees && (
              <button
                type="button"
                onClick={() => setSubPage('bulk_import')}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                <UploadCloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                <span>{t(lang, 'bulkImport')}</span>
              </button>
            )}
            <button
              type="button"
              onClick={openCreateEmployee}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t(lang, 'addEmployee')}
            </button>
          </div>
        )}
      </div>

      {/* PRO Compliance Notice */}
      {isPro && (
        <div className="rounded-xl border border-teal-200 dark:border-teal-900 bg-teal-50/50 dark:bg-teal-950/30 px-4 py-3 text-xs text-teal-900 dark:text-teal-200 flex items-center gap-2.5">
          <ShieldCheck className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <span>
            Showing only employees with active HR-assigned document access. Salary and bank details
            are restricted.
          </span>
        </div>
      )}

      {/* 3 Focused KPI Cards */}
      {!isEmployeeOnly && (
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{t(lang, 'totalEmployees')}</span>
              <Users className="w-4 h-4 text-teal-600 dark:text-teal-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {directoryKpis.total}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>Active Staff</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {directoryKpis.active}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
            <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400">
              <span>{t(lang, 'expiringDocs')}</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <p className="mt-2.5 text-2xl font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
              {directoryKpis.alerts}
            </p>
          </div>
        </section>
      )}

      {/* Upgraded Directory Filter Bar */}
      {!isEmployeeOnly && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px] max-w-sm">
              <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(lang, 'search')}
                aria-label="Search employees"
                className="w-full ps-9 pe-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
              />
            </div>

            <select
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              aria-label={t(lang, 'employeeGroups')}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'allGroups')}</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>

            <select
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
              aria-label={t(lang, 'projectsTitle')}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'allProjects')}</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.code} — {p.name}
                </option>
              ))}
            </select>

            <select
              value={workTypeFilter}
              onChange={(e) => setWorkTypeFilter(e.target.value as 'all' | WorkType)}
              aria-label={t(lang, 'workType')}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'allWorkTypes')}</option>
              {ALL_WORK_TYPES.map((wt) => (
                <option key={wt} value={wt}>
                  {getWorkTypeLabel(lang, wt)}
                </option>
              ))}
            </select>

            <select
              value={roleTitleFilter}
              onChange={(e) => setRoleTitleFilter(e.target.value)}
              aria-label={t(lang, 'allRolesTitles')}
              className="px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200"
            >
              <option value="all">{t(lang, 'allRolesTitles')}</option>
              <optgroup label="System Roles">
                {(Object.values(UserRole) as UserRole[]).map((r) => (
                  <option key={`role:${r}`} value={`role:${r}`}>
                    {getRoleLabel(lang, r)}
                  </option>
                ))}
              </optgroup>
              {distinctJobTitles.length > 0 && (
                <optgroup label="Job Titles">
                  {distinctJobTitles.map((title) => (
                    <option key={`title:${title}`} value={`title:${title}`}>
                      {title}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

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

            {hasActiveFilters && (
              <button
                type="button"
                onClick={clearAllFilters}
                className="inline-flex items-center gap-1 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t(lang, 'clearFilters')}</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* Clean Scannable Employee Table */}
      <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        {visibleEmployees.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {isPro
              ? 'No active employee document assignments. Ask HR to assign access.'
              : t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 text-[11px] font-medium uppercase tracking-wider text-slate-400">
                  <th className="py-3 px-4 text-start">Employee</th>
                  <th className="py-3 px-4 text-start">Role & Section</th>
                  <th className="py-3 px-4 text-start">Company</th>
                  <th className="py-3 px-4 text-start">Status</th>
                  <th className="py-3 px-4 text-end">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {visibleEmployees.map((emp) => {
                  const primaryComp = companyMap.get(emp.primaryCompanyId);
                  const sec = sectionMap.get(emp.sectionId);
                  const isShared = isSharedEmployeeInCompany(emp, selectedCompanyId);
                  const empDocs = documents.filter((d) => d.employeeId === emp.id);
                  const hasAlert = empDocs.some(
                    (d) => getDocumentExpiryStatus(d.expiryDate).status !== 'valid'
                  );
                  const primaryLabel = emp.labelIds
                    .map((id) => labelMap.get(id))
                    .find((l): l is EmployeeLabel => Boolean(l));
                  const proAssignment = activeProAssignmentByEmp.get(emp.id);

                  return (
                    <tr
                      key={emp.id}
                      onClick={() => openProfile(emp, isPro ? 'documents' : 'profile')}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar src={emp.avatarUrl} name={emp.fullName} size="md" />
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                              {emp.fullName}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              <span className="font-mono">{emp.employeeCode || '—'}</span>
                              {emp.jobTitle ? ` · ${emp.jobTitle}` : ''}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="font-medium text-slate-800 dark:text-slate-200">
                          {getRoleLabel(lang, emp.role)}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                          {sec?.name ?? '—'} · {getWorkTypeLabel(lang, normalizeWorkType(emp.workType))}
                          {emp.pendingShiftProposal && !isPro ? ' · Shift Pending' : ''}
                        </p>
                      </td>

                      <td className="py-3.5 px-4">
                        <p className="text-slate-700 dark:text-slate-300 font-medium">
                          {primaryComp?.name ?? '—'}
                        </p>
                        {isShared && (
                          <p className="text-[11px] text-teal-700 dark:text-teal-400 mt-0.5">
                            {t(lang, 'sharedEmployee')} · {primaryComp?.code}
                          </p>
                        )}
                        {proAssignment && (
                          <p className="text-[11px] text-teal-700 dark:text-teal-400 mt-0.5">
                            {t(lang, 'accessExpires')}: {formatShortDate(proAssignment.accessExpiresAt)}
                          </p>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 font-medium text-slate-700 dark:text-slate-300">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              !emp.active
                                ? 'bg-slate-400'
                                : hasAlert
                                  ? 'bg-amber-500'
                                  : 'bg-emerald-500'
                            }`}
                          />
                          <span>
                            {!emp.active
                              ? 'Inactive'
                              : isPro
                                ? `${empDocs.length} docs`
                                : hasAlert
                                  ? 'Doc Alert'
                                  : primaryLabel?.name ?? 'Active'}
                          </span>
                        </div>
                      </td>

                      <td
                        className="py-3.5 px-4 text-end"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openProfile(emp, isPro ? 'documents' : 'profile')}
                            title={t(lang, 'viewProfile')}
                            aria-label={`${t(lang, 'viewProfile')} ${emp.fullName}`}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors cursor-pointer"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {canManageStaff && (
                            <button
                              type="button"
                              onClick={() => openEditEmployee(emp)}
                              title={t(lang, 'edit')}
                              aria-label={`${t(lang, 'edit')} ${emp.fullName}`}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-teal-700 hover:bg-teal-50 dark:hover:bg-teal-950/50 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
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
    </div>
  );
};
