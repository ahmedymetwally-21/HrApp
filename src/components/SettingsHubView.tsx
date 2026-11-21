import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Building2,
  ChevronRight,
  Edit3,
  FileBadge,
  FolderKanban,
  GitBranch,
  Laptop,
  Layers,
  Lock,
  MapPin,
  Plus,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  Smartphone,
  Tag,
  Trash2,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import {
  getDeductionWorkflowChainLabel,
  getEmployeeTypeLabel,
  getPayrollEntryTypeLabel,
  getRoleLabel,
  getStepRoleLabel,
  t,
} from '../i18n/translations';
import {
  AppSettings,
  ApprovalStepRole,
  ApprovalWorkflow,
  BuiltInDocumentType,
  ClockInPolicyMode,
  Company,
  DeductionWorkflowChain,
  DeductionWorkflowConfig,
  DocumentTypeValue,
  Employee,
  EmployeeLabel,
  EmployeeModel,
  EmployeeType,
  GeofenceZone,
  Language,
  LatenessPenaltyTier,
  PayrollCategoryItem,
  PayrollEntryType,
  ProAssignment,
  Section,
  UserRole,
  Weekday,
} from '../types/hr';
import {
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  formatShortDate,
  isProAssignmentActive,
} from '../utils/hrLogic';
import { GeofenceMap } from './GeofenceMap';

type SettingsSection =
  | 'hub'
  | 'companies'
  | 'payroll_categories'
  | 'models'
  | 'labels'
  | 'pro_access'
  | 'workflows'
  | 'geofences'
  | 'sections';

export type SettingsRouteSection =
  | 'companies'
  | 'models'
  | 'geofences'
  | 'payroll_workflows'
  | 'general';

interface SettingsHubViewProps {
  lang: Language;
  activeSection?: SettingsRouteSection;
  currentUser: Employee;
  activeRole: UserRole;
  companies: Company[];
  sections: Section[];
  labels: EmployeeLabel[];
  proAssignments: ProAssignment[];
  models: EmployeeModel[];
  employees: Employee[];
  geofences: GeofenceZone[];
  workflows: ApprovalWorkflow[];
  payrollCategories: PayrollCategoryItem[];
  settings: AppSettings;
  onCreateCompany: (input: Omit<Company, 'id'>) => Promise<void>;
  onUpdateCompany: (id: string, patch: Partial<Company>) => Promise<void>;
  onToggleCompanyActive: (id: string) => Promise<void>;
  onCreatePayrollCategory: (input: Omit<PayrollCategoryItem, 'id'>) => Promise<void>;
  onUpdatePayrollCategory: (id: string, patch: Partial<PayrollCategoryItem>) => Promise<void>;
  onCreateSection: (input: Omit<Section, 'id'>) => Promise<void>;
  onCreateLabel: (input: Omit<EmployeeLabel, 'id'>) => Promise<void>;
  onUpdateLabel: (id: string, patch: Partial<EmployeeLabel>) => Promise<void>;
  onDeleteLabel: (id: string) => Promise<void>;
  onCreateProAssignment: (input: Omit<ProAssignment, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteProAssignment: (id: string) => Promise<void>;
  onBulkAssignZones: (params: {
    companyId: string | 'all';
    sectionId: string | 'all';
    zoneIds: string[];
    replaceExisting: boolean;
  }) => Promise<number>;
  onUpdateEmployee: (id: string, patch: Partial<Employee>) => Promise<void>;
  onCreateModel: (input: Omit<EmployeeModel, 'id'>) => Promise<void>;
  onUpdateModel: (id: string, patch: Partial<EmployeeModel>) => Promise<void>;
  onSaveWorkflow: (wf: Omit<ApprovalWorkflow, 'id'> & { id?: string }) => Promise<void>;
  onDeleteWorkflow: (id: string) => Promise<void>;
  onCreateGeofence: (zone: Omit<GeofenceZone, 'id'>) => Promise<void>;
  onUpdateGeofence: (id: string, patch: Partial<GeofenceZone>) => Promise<void>;
  onDeleteGeofence: (id: string) => Promise<void>;
  onUpdateSettings: (patch: Partial<AppSettings>) => Promise<void>;
  onPreviewOfflineScreen: () => void;
  onResetDemoData: () => Promise<void>;
}

const PRESET_LABEL_COLORS = [
  '#D97706',
  '#2563EB',
  '#7C3AED',
  '#EA580C',
  '#0891B2',
  '#DC2626',
  '#64748B',
  '#16A34A',
  '#DB2777',
  '#4F46E5',
];

const ALL_WEEKDAYS: Weekday[] = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const BUILT_IN_DOCS: DocumentTypeValue[] = Object.values(BuiltInDocumentType);
const STEP_ROLES: ApprovalStepRole[] = ['section_manager', 'hr_admin', 'main_manager'];
const PAYROLL_ENTRY_TYPES: PayrollEntryType[] = [
  'earning_in_payroll',
  'earning_off_cycle',
  'deduction_in_payroll',
  'deduction_off_cycle',
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600';

export const SettingsHubView: React.FC<SettingsHubViewProps> = ({
  lang,
  activeSection,
  currentUser,
  activeRole,
  companies,
  sections,
  labels,
  proAssignments,
  models,
  employees,
  geofences,
  workflows,
  payrollCategories,
  settings,
  onCreateCompany,
  onUpdateCompany,
  onToggleCompanyActive,
  onCreatePayrollCategory,
  onUpdatePayrollCategory,
  onCreateSection,
  onCreateLabel,
  onUpdateLabel,
  onDeleteLabel,
  onCreateProAssignment,
  onDeleteProAssignment,
  onBulkAssignZones,
  onUpdateEmployee,
  onCreateModel,
  onUpdateModel,
  onSaveWorkflow,
  onDeleteWorkflow,
  onCreateGeofence,
  onUpdateGeofence,
  onDeleteGeofence,
  onUpdateSettings,
  onPreviewOfflineScreen,
  onResetDemoData,
}) => {
  const isMainManager = activeRole === UserRole.MainManager;
  const resolveSectionToSubView = (sec?: SettingsRouteSection): SettingsSection => {
    if (sec === 'companies') return 'companies';
    if (sec === 'models') return 'models';
    if (sec === 'geofences') return 'geofences';
    if (sec === 'payroll_workflows') return 'payroll_categories';
    if (sec === 'general') return 'sections';
    return 'hub';
  };
  const [subView, setSubView] = useState<SettingsSection>(() =>
    resolveSectionToSubView(activeSection)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (activeSection) {
      setSubView(resolveSectionToSubView(activeSection));
      setEditingModelId(null);
      setEditingWfId(null);
    }
  }, [activeSection]);

  // --- Companies form state (Create + Edit + WPS Identifiers) ---
  const [editingCompanyId, setEditingCompanyId] = useState<string | null>(null);
  const [compName, setCompName] = useState('');
  const [compCode, setCompCode] = useState('');
  const [compIndustry, setCompIndustry] = useState('Car Rental & Mobility');
  const [compCity, setCompCity] = useState('Dubai, UAE');
  const [compMolId, setCompMolId] = useState('');
  const [compWpsRouting, setCompWpsRouting] = useState('');
  const [compIban, setCompIban] = useState('');

  // --- Payroll Categories (Earnings & Deductions Options) state ---
  const [catFilterType, setCatFilterType] = useState<'all' | PayrollEntryType>('all');
  const [editingCatId, setEditingCatId] = useState<string | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<PayrollEntryType>('earning_in_payroll');
  const [catDescription, setCatDescription] = useState('');

  // --- Employee Models editor state ---
  const [editingModelId, setEditingModelId] = useState<string | 'new' | null>(null);
  const [modelForm, setModelForm] = useState<Omit<EmployeeModel, 'id'>>({
    name: '',
    description: '',
    shiftStart: '08:00',
    shiftEnd: '17:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    graceMinutes: 15,
    latenessTiers: [
      { id: 't1', minLateMinutes: 16, maxLateMinutes: 30, penaltyAED: 50 },
      { id: 't2', minLateMinutes: 31, maxLateMinutes: 60, penaltyAED: 100 },
      { id: 't3', minLateMinutes: 61, maxLateMinutes: null, penaltyAED: 150 },
    ],
    leaveQuotas: { annualTotal: 30, sickTotal: 15, emergencyTotal: 5, unpaidLimit: 30 },
    requiredDocuments: [
      BuiltInDocumentType.Passport,
      BuiltInDocumentType.EmiratesID,
      BuiltInDocumentType.Visa,
      BuiltInDocumentType.LaborCard,
    ],
  });

  // --- Approval Workflow Builder state (Main Manager Only) ---
  const [editingWfId, setEditingWfId] = useState<string | 'new' | null>(null);
  const [wfName, setWfName] = useState('');
  const [wfCompanyId, setWfCompanyId] = useState<string>('all');
  const [wfSectionId, setWfSectionId] = useState<string>('all');
  const [wfSteps, setWfSteps] = useState<ApprovalStepRole[]>([
    'section_manager',
    'hr_admin',
    'main_manager',
  ]);
  const [wfAutoDays, setWfAutoDays] = useState(0);

  // --- Deduction Approval & Escalation Workflow state (Phase 1B) ---
  const [deductionWfDraft, setDeductionWfDraft] = useState<DeductionWorkflowConfig>(
    () => settings.deductionWorkflowConfig ?? DEFAULT_DEDUCTION_WORKFLOW_CONFIG
  );
  const [deductionWfSaved, setDeductionWfSaved] = useState(false);

  const canManageDeductionWorkflow = isMainManager || activeRole === UserRole.HRAdmin;

  const handleSaveDeductionWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManageDeductionWorkflow) return;
    setSaving(true);
    try {
      await onUpdateSettings({
        deductionWorkflowConfig: {
          office_employee: deductionWfDraft.office_employee,
          driver: deductionWfDraft.driver,
          management: deductionWfDraft.management,
          autoEscalationHours: Math.max(
            1,
            Math.min(336, Number(deductionWfDraft.autoEscalationHours) || 48)
          ),
        },
      });
      setDeductionWfSaved(true);
      window.setTimeout(() => setDeductionWfSaved(false), 2500);
    } finally {
      setSaving(false);
    }
  };

  // --- Geofences editor state ---
  const [zoneName, setZoneName] = useState('');
  const [zoneAddress, setZoneAddress] = useState('');
  const [zoneCompanyId, setZoneCompanyId] = useState(companies[0]?.id ?? '');
  const [zoneLat, setZoneLat] = useState(25.2048);
  const [zoneLng, setZoneLng] = useState(55.2708);
  const [zoneRadius, setZoneRadius] = useState(150);

  // --- Sections & Custom Doc Types state ---
  const [secName, setSecName] = useState('');
  const [secCode, setSecCode] = useState('');
  const [customDocDraft, setCustomDocDraft] = useState('');

  // --- Custom Employee Status Labels state ---
  const [labelName, setLabelName] = useState('');
  const [labelColor, setLabelColor] = useState('#2563EB');
  const [editingLabelId, setEditingLabelId] = useState<string | null>(null);

  // --- PRO Time-Limited Document Access state ---
  const proUsers = useMemo(
    () => employees.filter((e) => e.role === UserRole.PRO && e.active),
    [employees]
  );
  const assignableProEmployees = useMemo(
    () => employees.filter((e) => e.role !== UserRole.PRO && e.active),
    [employees]
  );
  const [proUserId, setProUserId] = useState(proUsers[0]?.id ?? '');
  const [proEmpId, setProEmpId] = useState(assignableProEmployees[0]?.id ?? '');
  const [proStart, setProStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [proExpires, setProExpires] = useState(() =>
    new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16)
  );
  const [proNotes, setProNotes] = useState('');

  // --- Bulk Assign Geofence Zones state ---
  const [bulkCompanyId, setBulkCompanyId] = useState<string>('all');
  const [bulkSectionId, setBulkSectionId] = useState<string>('all');
  const [bulkZoneIds, setBulkZoneIds] = useState<string[]>([]);
  const [bulkReplace, setBulkReplace] = useState(true);
  const [bulkFeedback, setBulkFeedback] = useState<string | null>(null);

  const allDocTypes = useMemo(
    () => [...BUILT_IN_DOCS, ...settings.customDocumentTypes],
    [settings.customDocumentTypes]
  );

  const openEditModel = (model: EmployeeModel | null) => {
    if (!model) {
      setEditingModelId('new');
      setModelForm({
        name: '',
        description: '',
        shiftStart: '08:00',
        shiftEnd: '17:00',
        workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
        graceMinutes: 15,
        latenessTiers: [
          { id: 't1', minLateMinutes: 16, maxLateMinutes: 30, penaltyAED: 50 },
          { id: 't2', minLateMinutes: 31, maxLateMinutes: 60, penaltyAED: 100 },
          { id: 't3', minLateMinutes: 61, maxLateMinutes: null, penaltyAED: 150 },
        ],
        leaveQuotas: { annualTotal: 30, sickTotal: 15, emergencyTotal: 5, unpaidLimit: 30 },
        requiredDocuments: [
          BuiltInDocumentType.Passport,
          BuiltInDocumentType.EmiratesID,
          BuiltInDocumentType.Visa,
          BuiltInDocumentType.LaborCard,
        ],
      });
    } else {
      setEditingModelId(model.id);
      setModelForm({
        name: model.name,
        description: model.description,
        shiftStart: model.shiftStart,
        shiftEnd: model.shiftEnd,
        workingDays: [...model.workingDays],
        graceMinutes: model.graceMinutes,
        latenessTiers: model.latenessTiers.map((tier) => ({ ...tier })),
        leaveQuotas: { ...model.leaveQuotas },
        requiredDocuments: [...model.requiredDocuments],
      });
    }
  };

  const handleSaveModel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modelForm.name.trim()) return;
    setSaving(true);
    try {
      if (editingModelId === 'new') {
        await onCreateModel(modelForm);
      } else if (editingModelId) {
        await onUpdateModel(editingModelId, modelForm);
      }
      setEditingModelId(null);
    } finally {
      setSaving(false);
    }
  };

  const openEditWorkflow = (wf: ApprovalWorkflow | null) => {
    if (!wf) {
      setEditingWfId('new');
      setWfName('');
      setWfCompanyId('all');
      setWfSectionId('all');
      setWfSteps(['section_manager', 'hr_admin', 'main_manager']);
      setWfAutoDays(0);
    } else {
      setEditingWfId(wf.id);
      setWfName(wf.name);
      setWfCompanyId(wf.companyId);
      setWfSectionId(wf.sectionId);
      setWfSteps([...wf.steps]);
      setWfAutoDays(wf.autoApproveMaxDays);
    }
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= wfSteps.length) return;
    setWfSteps((prev) => {
      const next = [...prev];
      const [item] = next.splice(index, 1);
      next.splice(target, 0, item);
      return next;
    });
  };

  const handleSaveWorkflow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isMainManager || !wfName.trim() || wfSteps.length === 0) return;
    setSaving(true);
    try {
      await onSaveWorkflow({
        id: editingWfId && editingWfId !== 'new' ? editingWfId : undefined,
        name: wfName.trim(),
        companyId: wfCompanyId,
        sectionId: wfSectionId,
        steps: wfSteps,
        autoApproveMaxDays: Math.max(0, Number(wfAutoDays) || 0),
      });
      setEditingWfId(null);
    } finally {
      setSaving(false);
    }
  };

  const resetCompanyForm = () => {
    setEditingCompanyId(null);
    setCompName('');
    setCompCode('');
    setCompIndustry('Car Rental & Mobility');
    setCompCity('Dubai, UAE');
    setCompMolId('');
    setCompWpsRouting('');
    setCompIban('');
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!compName.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: compName.trim(),
        code: (compCode.trim() || compName.trim().slice(0, 3)).toUpperCase(),
        industry: compIndustry.trim() || 'Operations',
        city: compCity.trim() || 'Dubai, UAE',
        molEstablishmentId: compMolId.trim() || undefined,
        wpsRoutingCode: compWpsRouting.trim() || undefined,
        companyIban: compIban.trim() || undefined,
      };
      if (editingCompanyId) {
        await onUpdateCompany(editingCompanyId, payload);
      } else {
        await onCreateCompany({ ...payload, active: true });
      }
      resetCompanyForm();
    } finally {
      setSaving(false);
    }
  };

  const handleSavePayrollCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;
    setSaving(true);
    try {
      if (editingCatId) {
        await onUpdatePayrollCategory(editingCatId, {
          name: catName.trim(),
          type: catType,
          description: catDescription.trim() || undefined,
        });
        setEditingCatId(null);
      } else {
        await onCreatePayrollCategory({
          name: catName.trim(),
          type: catType,
          description: catDescription.trim() || undefined,
          active: true,
        });
      }
      setCatName('');
      setCatDescription('');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGeofence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!zoneName.trim()) return;
    setSaving(true);
    try {
      await onCreateGeofence({
        companyId: zoneCompanyId || companies[0]?.id || 'comp-yaldi',
        name: zoneName.trim(),
        address: zoneAddress.trim() || 'Dubai, UAE',
        latitude: zoneLat,
        longitude: zoneLng,
        radiusMeters: zoneRadius,
        active: true,
      });
      setZoneName('');
      setZoneAddress('');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateSection = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!secName.trim()) return;
    setSaving(true);
    try {
      await onCreateSection({
        name: secName.trim(),
        code: (secCode.trim() || secName.trim().slice(0, 3)).toUpperCase(),
      });
      setSecName('');
      setSecCode('');
    } finally {
      setSaving(false);
    }
  };

  const handleAddCustomDocType = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = customDocDraft.trim();
    if (!cleaned || settings.customDocumentTypes.includes(cleaned)) return;
    setSaving(true);
    try {
      await onUpdateSettings({
        customDocumentTypes: [...settings.customDocumentTypes, cleaned],
      });
      setCustomDocDraft('');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveCustomDocType = async (docType: string) => {
    await onUpdateSettings({
      customDocumentTypes: settings.customDocumentTypes.filter((d) => d !== docType),
    });
  };

  const hubCards: {
    id: SettingsSection;
    title: string;
    description: string;
    metric: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: string;
  }[] = [
    {
      id: 'companies',
      title: t(lang, 'companies'),
      description: 'Manage group entities and ADCB WPS identifiers (MOL Establishment ID, Routing Code, IBAN).',
      metric: `${companies.length} active entities`,
      icon: Building2,
    },
    {
      id: 'payroll_categories',
      title: t(lang, 'payrollCategoriesManager'),
      description: t(lang, 'payrollCategoriesDesc'),
      metric: `${payrollCategories.filter((c) => c.active).length} active / ${payrollCategories.length} total`,
      icon: SlidersHorizontal,
    },
    {
      id: 'models',
      title: t(lang, 'employeeModels'),
      description: 'Fixed shifts, grace period, tiered AED lateness penalties, and required docs.',
      metric: `${models.length} policy templates`,
      icon: Layers,
    },
    {
      id: 'labels',
      title: t(lang, 'labelsManager'),
      description: 'Create color-coded HR status tags (Visa, Emirates ID, Medical, Probation) and filter staff.',
      metric: `${labels.length} status labels`,
      icon: Tag,
    },
    {
      id: 'pro_access',
      title: t(lang, 'proAccessManager'),
      description: 'Grant PRO officers time-limited document viewing & download access per employee.',
      metric: `${proAssignments.filter((a) => isProAssignmentActive(a)).length} active grants`,
      icon: FileBadge,
    },
    {
      id: 'workflows',
      title: t(lang, 'workflowBuilder'),
      description: 'Customize multi-step leave chains per company or section with auto-approve rules.',
      metric: `${workflows.length} chains`,
      icon: GitBranch,
      badge: isMainManager ? t(lang, 'mainManagerOnly') : 'View Only',
    },
    {
      id: 'geofences',
      title: t(lang, 'geofencesPolicy'),
      description: 'OpenStreetMap pins, PC vs. Mobile policy, and bulk zone assignment / exemption.',
      metric: `${geofences.filter((z) => z.active).length} active zones`,
      icon: MapPin,
    },
    {
      id: 'sections',
      title: t(lang, 'sectionsDocs'),
      description: 'Manage sections, assign Section Managers & Co-Managers, and custom doc types.',
      metric: `${sections.length} sections · ${settings.customDocumentTypes.length} custom docs`,
      icon: FolderKanban,
    },
  ];

  // --- HUB MENU VIEW ---
  if (subView === 'hub') {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">
            {t(lang, 'navSettings')}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'settingsSubtitle')}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hubCards.map((card) => {
            const Icon = card.icon;
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSubView(card.id)}
                className="group text-start rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-teal-300 dark:hover:border-teal-700 transition-colors cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="w-10 h-10 rounded-xl bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    {card.badge && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                        {!isMainManager && card.id === 'workflows' && <Lock className="w-3 h-3" />}
                        {card.badge}
                      </span>
                    )}
                  </div>
                  <div>
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white group-hover:text-teal-700 dark:group-hover:text-teal-300 transition-colors">
                      {card.title}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                      {card.description}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400">
                  <span>{card.metric}</span>
                  <ChevronRight className="w-4 h-4 text-slate-400 group-hover:text-teal-600 rtl:rotate-180" />
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  const renderSubHeader = (title: string, subtitle: string) => {
    const companyGroupTabs: { id: SettingsSection; label: string }[] = [
      { id: 'companies', label: t(lang, 'companies') },
      { id: 'sections', label: t(lang, 'sectionsDocs') },
      { id: 'labels', label: t(lang, 'employeeLabels') },
    ];
    const payrollWorkflowTabs: { id: SettingsSection; label: string }[] = [
      { id: 'payroll_categories', label: t(lang, 'payrollCategories') },
      { id: 'workflows', label: t(lang, 'workflowBuilder') },
    ];
    const showTabs =
      activeSection === 'companies'
        ? companyGroupTabs
        : activeSection === 'payroll_workflows'
          ? payrollWorkflowTabs
          : null;

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {!activeSection && (
              <button
                type="button"
                onClick={() => {
                  setSubView('hub');
                  setEditingModelId(null);
                  setEditingWfId(null);
                }}
                className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer shrink-0"
                aria-label="Back to Settings Hub"
              >
                <ArrowLeft className="w-4 h-4 rtl:rotate-180" />
              </button>
            )}
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-slate-900 dark:text-white truncate tracking-tight">
                {title}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                {subtitle}
              </p>
            </div>
          </div>
        </div>

        {showTabs && (
          <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-5 overflow-x-auto">
            {showTabs.map((tab) => {
              const active = subView === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSubView(tab.id)}
                  className={`pb-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap cursor-pointer ${
                    active
                      ? 'border-teal-600 text-teal-700 dark:text-teal-300'
                      : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // --- 1. COMPANIES SUB-VIEW (with ADCB WPS Identifiers) ---
  if (subView === 'companies') {
    return (
      <div className="space-y-5">
        {renderSubHeader(
          t(lang, 'companies'),
          'Configure group entities, isolated payroll scope, and UAE ADCB WPS filing identifiers.'
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {companies.map((comp) => {
              const primaryCount = employees.filter((e) => e.primaryCompanyId === comp.id).length;
              const sharedCount = employees.filter((e) => e.sharedCompanyIds.includes(comp.id)).length;
              const wpsReady = Boolean(
                comp.molEstablishmentId && comp.wpsRoutingCode && comp.companyIban
              );
              return (
                <div key={comp.id} className="p-4 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                        {comp.code}
                      </span>
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {comp.name}
                      </p>
                      <span
                        className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                          wpsReady
                            ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                        }`}
                      >
                        {wpsReady ? 'WPS Ready' : 'WPS Incomplete'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {comp.industry} · {comp.city} · {primaryCount} primary
                      {sharedCount > 0 ? ` + ${sharedCount} shared` : ''}
                    </p>
                    <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 break-all">
                      MOL: {comp.molEstablishmentId || '—'} · Routing: {comp.wpsRoutingCode || '—'} ·
                      IBAN: {comp.companyIban || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingCompanyId(comp.id);
                        setCompName(comp.name);
                        setCompCode(comp.code);
                        setCompIndustry(comp.industry);
                        setCompCity(comp.city);
                        setCompMolId(comp.molEstablishmentId ?? '');
                        setCompWpsRouting(comp.wpsRoutingCode ?? '');
                        setCompIban(comp.companyIban ?? '');
                      }}
                      aria-label={`Edit ${comp.name}`}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onToggleCompanyActive(comp.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer shrink-0 ${
                        comp.active
                          ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                          : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {comp.active ? 'Active' : 'Paused'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleSaveCompany}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                {editingCompanyId ? (
                  <Edit3 className="w-4 h-4 text-teal-600" />
                ) : (
                  <Plus className="w-4 h-4 text-teal-600" />
                )}
                {editingCompanyId ? t(lang, 'editCompany') : t(lang, 'addCompany')}
              </h2>
              {editingCompanyId && (
                <button
                  type="button"
                  onClick={resetCompanyForm}
                  className="text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Company Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Horizon Fleet Leasing"
                value={compName}
                onChange={(e) => setCompName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Code
                </label>
                <input
                  type="text"
                  maxLength={6}
                  placeholder="HFL"
                  value={compCode}
                  onChange={(e) => setCompCode(e.target.value)}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  City
                </label>
                <input
                  type="text"
                  value={compCity}
                  onChange={(e) => setCompCity(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Industry
              </label>
              <input
                type="text"
                value={compIndustry}
                onChange={(e) => setCompIndustry(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            {/* UAE ADCB WPS Filing Identifiers */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-300">
                UAE ADCB WPS Configuration
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t(lang, 'molEstablishmentId')}
                  </label>
                  <input
                    type="text"
                    placeholder="13-digit MOL ID"
                    value={compMolId}
                    onChange={(e) => setCompMolId(e.target.value)}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    {t(lang, 'wpsRoutingCode')}
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., 300310101"
                    value={compWpsRouting}
                    onChange={(e) => setCompWpsRouting(e.target.value)}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  {t(lang, 'companyIban')}
                </label>
                <input
                  type="text"
                  placeholder="AE070030010..."
                  value={compIban}
                  onChange={(e) => setCompIban(e.target.value)}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {editingCompanyId ? t(lang, 'save') : t(lang, 'addCompany')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 1B. EARNINGS & DEDUCTIONS CATEGORIES SUB-VIEW ---
  if (subView === 'payroll_categories') {
    const filteredCategories =
      catFilterType === 'all'
        ? payrollCategories
        : payrollCategories.filter((c) => c.type === catFilterType);

    return (
      <div className="space-y-5">
        {renderSubHeader(
          t(lang, 'payrollCategoriesManager'),
          t(lang, 'payrollCategoriesDesc')
        )}

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setCatFilterType('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
              catFilterType === 'all'
                ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t(lang, 'allTypes')} ({payrollCategories.length})
          </button>
          {PAYROLL_ENTRY_TYPES.map((tp) => {
            const count = payrollCategories.filter((c) => c.type === tp).length;
            return (
              <button
                key={tp}
                type="button"
                onClick={() => setCatFilterType(tp)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                  catFilterType === tp
                    ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                }`}
              >
                {getPayrollEntryTypeLabel(lang, tp)} ({count})
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {filteredCategories.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">{t(lang, 'noRecords')}</p>
            ) : (
              filteredCategories.map((cat) => {
                const isEarning =
                  cat.type === 'earning_in_payroll' || cat.type === 'earning_off_cycle';
                return (
                  <div key={cat.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md border ${
                            isEarning
                              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                          }`}
                        >
                          {getPayrollEntryTypeLabel(lang, cat.type)}
                        </span>
                        <p
                          className={`text-sm font-semibold truncate ${
                            cat.active
                              ? 'text-slate-900 dark:text-white'
                              : 'text-slate-400 line-through'
                          }`}
                        >
                          {cat.name}
                        </p>
                      </div>
                      {cat.description && (
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                          {cat.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCatId(cat.id);
                          setCatName(cat.name);
                          setCatType(cat.type);
                          setCatDescription(cat.description ?? '');
                        }}
                        aria-label={`Edit ${cat.name}`}
                        className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          void onUpdatePayrollCategory(cat.id, { active: !cat.active })
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                          cat.active
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-500'
                        }`}
                      >
                        {cat.active ? t(lang, 'activeStatus') : t(lang, 'disabledStatus')}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleSavePayrollCategory}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-teal-600" />
                {editingCatId ? `${t(lang, 'edit')} Category` : `${t(lang, 'add')} Category / Reason`}
              </h2>
              {editingCatId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingCatId(null);
                    setCatName('');
                    setCatDescription('');
                  }}
                  className="text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Entry Type
              </label>
              <select
                value={catType}
                onChange={(e) => setCatType(e.target.value as PayrollEntryType)}
                aria-label="Category Entry Type"
                className={INPUT_CLASS}
              >
                {PAYROLL_ENTRY_TYPES.map((tp) => (
                  <option key={tp} value={tp}>
                    {getPayrollEntryTypeLabel(lang, tp)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Category / Reason Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Fleet KPI Bonus or RTA Traffic Fine"
                value={catName}
                onChange={(e) => setCatName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Description (Optional)
              </label>
              <input
                type="text"
                placeholder="Short policy note..."
                value={catDescription}
                onChange={(e) => setCatDescription(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {editingCatId ? t(lang, 'save') : t(lang, 'add')}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 2. EMPLOYEE MODELS SUB-VIEW ---
  if (subView === 'models') {
    const updateTier = (idx: number, patch: Partial<LatenessPenaltyTier>) => {
      setModelForm((prev) => ({
        ...prev,
        latenessTiers: prev.latenessTiers.map((tier, i) => (i === idx ? { ...tier, ...patch } : tier)),
      }));
    };

    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {renderSubHeader(
            t(lang, 'employeeModels'),
            'Fixed-shift policies (no overtime), tiered AED lateness rules, and required docs.'
          )}
          <button
            type="button"
            onClick={() => openEditModel(null)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            New Model
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {models.map((m) => {
            const assignedCount = employees.filter((e) => e.modelId === m.id).length;
            return (
              <div
                key={m.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h2 className="text-sm font-bold text-slate-900 dark:text-white">{m.name}</h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        {m.description}
                      </p>
                    </div>
                    <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                      {assignedCount} staff
                    </span>
                  </div>

                  <div className="text-xs text-slate-600 dark:text-slate-300 space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Fixed Shift</span>
                      <span className="font-mono font-medium">
                        {m.shiftStart} – {m.shiftEnd}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Grace Period</span>
                      <span className="font-medium">{m.graceMinutes} mins</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Lateness Tiers</span>
                      <span className="font-medium">
                        {m.latenessTiers.map((tier) => `AED ${tier.penaltyAED}`).join(' / ')}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-500 dark:text-slate-400">Annual / Sick</span>
                      <span className="font-medium">
                        {m.leaveQuotas.annualTotal}d / {m.leaveQuotas.sickTotal}d
                      </span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1.5">
                      Required Documents ({m.requiredDocuments.length})
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {m.requiredDocuments.map((doc) => (
                        <span
                          key={doc}
                          className="text-[11px] px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300"
                        >
                          {doc}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => openEditModel(m)}
                  className="w-full py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  {t(lang, 'edit')} Model
                </button>
              </div>
            );
          })}
        </div>

        {/* Model Editor Form */}
        {editingModelId && (
          <form
            onSubmit={handleSaveModel}
            className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                {editingModelId === 'new' ? 'Create Employee Model' : `Edit ${modelForm.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setEditingModelId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Model Name
                </label>
                <input
                  type="text"
                  required
                  value={modelForm.name}
                  onChange={(e) => setModelForm({ ...modelForm, name: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={modelForm.description}
                  onChange={(e) => setModelForm({ ...modelForm, description: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Shift Start
                </label>
                <input
                  type="time"
                  value={modelForm.shiftStart}
                  onChange={(e) => setModelForm({ ...modelForm, shiftStart: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Shift End (No Overtime)
                </label>
                <input
                  type="time"
                  value={modelForm.shiftEnd}
                  onChange={(e) => setModelForm({ ...modelForm, shiftEnd: e.target.value })}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Grace Period (mins)
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={modelForm.graceMinutes}
                  onChange={(e) =>
                    setModelForm({ ...modelForm, graceMinutes: Number(e.target.value) || 0 })
                  }
                  className={INPUT_CLASS}
                />
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Working Days
              </p>
              <div className="flex flex-wrap gap-1.5">
                {ALL_WEEKDAYS.map((day) => {
                  const active = modelForm.workingDays.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() =>
                        setModelForm((prev) => ({
                          ...prev,
                          workingDays: active
                            ? prev.workingDays.filter((d) => d !== day)
                            : [...prev.workingDays, day],
                        }))
                      }
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        active
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-500'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tiered Fixed AED Lateness Penalties */}
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">
                Tiered Fixed Lateness Deductions (AED)
              </p>
              <div className="space-y-2">
                {modelForm.latenessTiers.map((tier, idx) => (
                  <div key={tier.id} className="grid grid-cols-3 gap-2 items-center">
                    <input
                      type="number"
                      min={1}
                      value={tier.minLateMinutes}
                      onChange={(e) =>
                        updateTier(idx, { minLateMinutes: Number(e.target.value) || 1 })
                      }
                      placeholder="Min mins"
                      className={INPUT_CLASS}
                    />
                    <input
                      type="number"
                      min={1}
                      value={tier.maxLateMinutes ?? ''}
                      onChange={(e) =>
                        updateTier(idx, {
                          maxLateMinutes: e.target.value === '' ? null : Number(e.target.value),
                        })
                      }
                      placeholder="Max (blank = +)"
                      className={INPUT_CLASS}
                    />
                    <div className="relative">
                      <input
                        type="number"
                        min={0}
                        value={tier.penaltyAED}
                        onChange={(e) =>
                          updateTier(idx, { penaltyAED: Number(e.target.value) || 0 })
                        }
                        className={INPUT_CLASS}
                      />
                      <span className="absolute end-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-slate-400">
                        AED
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Required Document Checklist */}
            <div>
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                Required Documents for this Model
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {allDocTypes.map((doc) => {
                  const checked = modelForm.requiredDocuments.includes(doc);
                  return (
                    <label
                      key={doc}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer ${
                        checked
                          ? 'border-teal-400 bg-teal-50/70 dark:bg-teal-950/40 text-teal-800 dark:text-teal-200'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setModelForm((prev) => ({
                            ...prev,
                            requiredDocuments: checked
                              ? prev.requiredDocuments.filter((d) => d !== doc)
                              : [...prev.requiredDocuments, doc],
                          }))
                        }
                        className="accent-teal-600"
                      />
                      <span className="truncate">{doc}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingModelId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {t(lang, 'save')}
              </button>
            </div>
          </form>
        )}
      </div>
    );
  }

  // --- 2B. CUSTOM EMPLOYEE STATUS LABELS SUB-VIEW ---
  if (subView === 'labels') {
    const handleSaveLabel = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!labelName.trim()) return;
      setSaving(true);
      try {
        if (editingLabelId) {
          await onUpdateLabel(editingLabelId, { name: labelName.trim(), color: labelColor });
          setEditingLabelId(null);
        } else {
          await onCreateLabel({ name: labelName.trim(), color: labelColor });
        }
        setLabelName('');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="space-y-5">
        {renderSubHeader(
          t(lang, 'labelsManager'),
          'Create, rename, recolor, and manage multi-select status badges shown across Employee Directory and Payroll.'
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {labels.map((lbl) => {
              const count = employees.filter((e) => e.labelIds.includes(lbl.id)).length;
              return (
                <div key={lbl.id} className="p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      style={{
                        backgroundColor: `${lbl.color}1A`,
                        color: lbl.color,
                        borderColor: `${lbl.color}55`,
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold truncate"
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: lbl.color }}
                      />
                      {lbl.name}
                    </span>
                    <span className="text-xs text-slate-500 shrink-0">
                      {count} staff
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingLabelId(lbl.id);
                        setLabelName(lbl.name);
                        setLabelColor(lbl.color);
                      }}
                      aria-label={`Edit ${lbl.name}`}
                      className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void onDeleteLabel(lbl.id)}
                      aria-label={`Delete ${lbl.name}`}
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <form
            onSubmit={handleSaveLabel}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Tag className="w-4 h-4 text-teal-600" />
                {editingLabelId ? 'Edit Status Label' : 'Create Custom Label'}
              </h2>
              {editingLabelId && (
                <button
                  type="button"
                  onClick={() => {
                    setEditingLabelId(null);
                    setLabelName('');
                  }}
                  className="text-xs text-slate-500 hover:underline cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Label Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Golden Visa Pending"
                value={labelName}
                onChange={(e) => setLabelName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
                Badge Color
              </label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_LABEL_COLORS.map((hex) => (
                  <button
                    key={hex}
                    type="button"
                    onClick={() => setLabelColor(hex)}
                    style={{ backgroundColor: hex }}
                    aria-label={`Color ${hex}`}
                    className={`w-7 h-7 rounded-full cursor-pointer transition-transform ${
                      labelColor.toLowerCase() === hex.toLowerCase()
                        ? 'ring-2 ring-offset-2 ring-teal-600 scale-110'
                        : ''
                    }`}
                  />
                ))}
                <input
                  type="color"
                  value={labelColor}
                  onChange={(e) => setLabelColor(e.target.value)}
                  aria-label="Custom badge color picker"
                  className="w-8 h-8 rounded cursor-pointer border border-slate-200 dark:border-slate-700"
                />
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 p-3 flex items-center justify-between text-xs">
              <span className="text-slate-500">Live Preview</span>
              <span
                style={{
                  backgroundColor: `${labelColor}1A`,
                  color: labelColor,
                  borderColor: `${labelColor}55`,
                }}
                className="px-2.5 py-1 rounded-lg border font-semibold"
              >
                {labelName.trim() || 'Sample Label'}
              </span>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              {editingLabelId ? t(lang, 'save') : 'Create Label'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // --- 2C. PRO TIME-LIMITED DOCUMENT ACCESS SUB-VIEW ---
  if (subView === 'pro_access') {
    const handleAssignPro = async (e: React.FormEvent) => {
      e.preventDefault();
      const chosenPro = proUserId || proUsers[0]?.id;
      const chosenEmp = proEmpId || assignableProEmployees[0]?.id;
      if (!chosenPro || !chosenEmp || !proStart || !proExpires) return;
      setSaving(true);
      try {
        await onCreateProAssignment({
          proUserId: chosenPro,
          employeeId: chosenEmp,
          accessStart: new Date(proStart).toISOString(),
          accessExpiresAt: new Date(proExpires).toISOString(),
          assignedBy: currentUser.fullName,
          notes: proNotes.trim() || undefined,
        });
        setProNotes('');
      } finally {
        setSaving(false);
      }
    };

    return (
      <div className="space-y-5">
        {renderSubHeader(
          t(lang, 'proAccessManager'),
          'Assign specific employees to a PRO officer for a limited time window. Expired grants hide automatically.'
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          <div className="lg:col-span-7 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
            {proAssignments.length === 0 ? (
              <p className="p-8 text-center text-xs text-slate-500">
                No PRO document assignments configured yet.
              </p>
            ) : (
              proAssignments.map((grant) => {
                const proEmp = employees.find((e) => e.id === grant.proUserId);
                const targetEmp = employees.find((e) => e.id === grant.employeeId);
                const active = isProAssignmentActive(grant);
                return (
                  <div key={grant.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {targetEmp?.fullName ?? grant.employeeId}
                        </span>
                        <span
                          className={`text-[10px] font-semibold px-2 py-0.5 rounded-md ${
                            active
                              ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                          }`}
                        >
                          {active ? 'Active Access' : 'Expired'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        PRO: <strong>{proEmp?.fullName ?? grant.proUserId}</strong> ·{' '}
                        {formatShortDate(grant.accessStart)} →{' '}
                        {formatShortDate(grant.accessExpiresAt)}
                      </p>
                      {grant.notes && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{grant.notes}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => void onDeleteProAssignment(grant.id)}
                      aria-label="Revoke PRO access"
                      className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <form
            onSubmit={handleAssignPro}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileBadge className="w-4 h-4 text-teal-600" />
              Grant Time-Limited Access
            </h2>
            {proUsers.length === 0 ? (
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Create an employee with the PRO role first to assign document access.
              </p>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    PRO Officer
                  </label>
                  <select
                    value={proUserId || proUsers[0]?.id}
                    onChange={(e) => setProUserId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {proUsers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.fullName} ({p.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Target Employee (Documents Only)
                  </label>
                  <select
                    value={proEmpId || assignableProEmployees[0]?.id}
                    onChange={(e) => setProEmpId(e.target.value)}
                    className={INPUT_CLASS}
                  >
                    {assignableProEmployees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.fullName} ({emp.employeeCode})
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Access Start
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={proStart}
                      onChange={(e) => setProStart(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      Access Expires At
                    </label>
                    <input
                      type="datetime-local"
                      required
                      value={proExpires}
                      onChange={(e) => setProExpires(e.target.value)}
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Purpose / Notes (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., Emirates ID & Visa stamping"
                    value={proNotes}
                    onChange={(e) => setProNotes(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <button
                  type="submit"
                  disabled={saving}
                  className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
                >
                  Grant PRO Document Access
                </button>
              </>
            )}
          </form>
        </div>
      </div>
    );
  }

  // --- 3. APPROVAL WORKFLOW BUILDER SUB-VIEW (MAIN MANAGER ONLY) ---
  if (subView === 'workflows') {
    return (
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          {renderSubHeader(
            t(lang, 'workflowBuilder'),
            'Configure leave approval steps per company/section. Smart Auto-Skip applies automatically.'
          )}
          {isMainManager && (
            <button
              type="button"
              onClick={() => openEditWorkflow(null)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              New Workflow
            </button>
          )}
        </div>

        {!isMainManager && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
            <Lock className="w-4 h-4 shrink-0" />
            <span>
              Only the <strong>Main Manager</strong> can add, reorder, or modify approval workflow
              steps. You have read-only visibility.
            </span>
          </div>
        )}

        <div className="space-y-3">
          {workflows.map((wf) => {
            const compLabel =
              wf.companyId === 'all'
                ? t(lang, 'allCompanies')
                : companies.find((c) => c.id === wf.companyId)?.name ?? wf.companyId;
            const secLabel =
              wf.sectionId === 'all'
                ? 'All Sections'
                : sections.find((s) => s.id === wf.sectionId)?.name ?? wf.sectionId;

            return (
              <div
                key={wf.id}
                className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="space-y-2 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-sm font-bold text-slate-900 dark:text-white">{wf.name}</h2>
                    <span className="text-[11px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {compLabel} · {secLabel}
                    </span>
                    {wf.autoApproveMaxDays > 0 && (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                        Auto-approve ≤ {wf.autoApproveMaxDays}d
                      </span>
                    )}
                  </div>
                  <div className="flex items-center flex-wrap gap-1.5">
                    {wf.steps.map((step, i) => (
                      <React.Fragment key={`${wf.id}-${step}-${i}`}>
                        <span className="text-xs font-medium px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300">
                          {i + 1}. {getStepRoleLabel(lang, step)}
                        </span>
                        {i < wf.steps.length - 1 && (
                          <ChevronRight className="w-3.5 h-3.5 text-slate-400 rtl:rotate-180" />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {isMainManager && (
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditWorkflow(wf)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      {t(lang, 'edit')}
                    </button>
                    {wf.id !== 'wf-default' && (
                      <button
                        type="button"
                        onClick={() => void onDeleteWorkflow(wf.id)}
                        aria-label={`Delete ${wf.name}`}
                        className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-900 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Workflow Builder Editor (Main Manager Only) */}
        {isMainManager && editingWfId && (
          <form
            onSubmit={handleSaveWorkflow}
            className="rounded-2xl border border-teal-200 dark:border-teal-800 bg-white dark:bg-slate-900 p-5 space-y-4"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-teal-600" />
                {editingWfId === 'new' ? 'Create Approval Workflow' : 'Edit Approval Workflow'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingWfId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Workflow Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Drivers Express Chain"
                  value={wfName}
                  onChange={(e) => setWfName(e.target.value)}
                  className={INPUT_CLASS}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Company Scope
                </label>
                <select
                  value={wfCompanyId}
                  onChange={(e) => setWfCompanyId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="all">{t(lang, 'allCompanies')}</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Section Scope
                </label>
                <select
                  value={wfSectionId}
                  onChange={(e) => setWfSectionId(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="all">All Sections</option>
                  {sections.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Approval Steps (in execution order)
                </p>
                <div className="flex items-center gap-1.5">
                  {STEP_ROLES.filter((r) => !wfSteps.includes(r)).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setWfSteps((prev) => [...prev, r])}
                      className="text-[11px] font-medium px-2 py-1 rounded-lg border border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300 hover:bg-teal-50 dark:hover:bg-teal-950/50 cursor-pointer"
                    >
                      + {getStepRoleLabel(lang, r)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                {wfSteps.map((step, idx) => (
                  <div
                    key={step}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"
                  >
                    <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                      Step {idx + 1}: {getStepRoleLabel(lang, step)}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveStep(idx, -1)}
                        className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        aria-label="Move step up"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === wfSteps.length - 1}
                        onClick={() => moveStep(idx, 1)}
                        className="p-1 rounded text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer"
                        aria-label="Move step down"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      {wfSteps.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setWfSteps((prev) => prev.filter((s) => s !== step))}
                          className="p-1 rounded text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                          aria-label="Remove step"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Auto-Approve Leave Requests ≤ N Days (0 = disabled)
              </label>
              <input
                type="number"
                min={0}
                max={14}
                value={wfAutoDays}
                onChange={(e) => setWfAutoDays(Number(e.target.value) || 0)}
                className={INPUT_CLASS}
              />
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingWfId(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                {t(lang, 'cancel')}
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
              >
                {t(lang, 'save')}
              </button>
            </div>
          </form>
        )}

        {/* Phase 1B: Deduction Approval & Escalation Workflow Builder (Off-Days & Latency) */}
        <form
          onSubmit={handleSaveDeductionWorkflow}
          className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-teal-600 dark:text-teal-400" />
                {t(lang, 'deductionWorkflowTitle')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t(lang, 'deductionWorkflowDesc')}
              </p>
            </div>
            {deductionWfSaved && (
              <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300">
                Saved
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {(['office_employee', 'driver', 'management'] as EmployeeType[]).map((empType) => (
              <div
                key={empType}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 p-3.5 space-y-2"
              >
                <label
                  htmlFor={`deduction-wf-${empType}`}
                  className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  {getEmployeeTypeLabel(lang, empType)}
                </label>
                <select
                  id={`deduction-wf-${empType}`}
                  disabled={!canManageDeductionWorkflow}
                  value={deductionWfDraft[empType]}
                  onChange={(e) => {
                    const nextChain = e.target.value as DeductionWorkflowChain;
                    setDeductionWfDraft((prev) => ({
                      ...prev,
                      [empType]: nextChain,
                    }));
                  }}
                  className={`${INPUT_CLASS} disabled:opacity-60`}
                >
                  {(['manager_then_hr', 'hr_only', 'main_manager_only'] as DeductionWorkflowChain[]).map(
                    (chain) => (
                      <option key={chain} value={chain}>
                        {getDeductionWorkflowChainLabel(lang, chain)}
                      </option>
                    )
                  )}
                </select>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {deductionWfDraft[empType] === 'manager_then_hr'
                    ? 'Manager reviews first; HR gives final approval or binding decision.'
                    : deductionWfDraft[empType] === 'hr_only'
                      ? 'Routes directly to HR Admin for final payroll approval.'
                      : 'Routes directly to Main Manager for executive sign-off.'}
                </p>
              </div>
            ))}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950 p-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div className="space-y-1.5 max-w-sm w-full">
              <label
                htmlFor="deduction-auto-escalation-hours"
                className="block text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                {t(lang, 'autoEscalationHours')}
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="deduction-auto-escalation-hours"
                  type="number"
                  min={1}
                  max={336}
                  disabled={!canManageDeductionWorkflow}
                  value={deductionWfDraft.autoEscalationHours}
                  onChange={(e) =>
                    setDeductionWfDraft((prev) => ({
                      ...prev,
                      autoEscalationHours: Math.max(1, Number(e.target.value) || 48),
                    }))
                  }
                  className={`${INPUT_CLASS} font-mono max-w-[120px] disabled:opacity-60`}
                />
                <div className="flex items-center gap-1.5">
                  {[
                    { label: '24h', hours: 24 },
                    { label: '48h', hours: 48 },
                    { label: '72h (3d)', hours: 72 },
                  ].map((preset) => (
                    <button
                      key={preset.hours}
                      type="button"
                      disabled={!canManageDeductionWorkflow}
                      onClick={() =>
                        setDeductionWfDraft((prev) => ({
                          ...prev,
                          autoEscalationHours: preset.hours,
                        }))
                      }
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-medium cursor-pointer disabled:opacity-50 ${
                        deductionWfDraft.autoEscalationHours === preset.hours
                          ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Unanswered Section Manager requests automatically escalate to HR after this window.
              </p>
            </div>

            {canManageDeductionWorkflow && (
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60 shrink-0"
              >
                {t(lang, 'save')}
              </button>
            )}
          </div>
        </form>
      </div>
    );
  }

  // --- 4. GEOFENCES & PC CLOCK-IN POLICY SUB-VIEW ---
  if (subView === 'geofences') {
    return (
      <div className="space-y-5">
        {renderSubHeader(
          t(lang, 'geofencesPolicy'),
          'Drop OpenStreetMap geofence pins for every company branch and set Mobile vs. PC policy.'
        )}

        {/* Global PC vs Mobile Policy */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900 dark:text-white">
              Global Clock-In Device Policy
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Enforce mobile GPS hardware accuracy (≤ {settings.maxMobileAccuracyMeters}m) or allow
              verified office PC punches.
            </p>
          </div>
          <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 shrink-0">
            <button
              type="button"
              onClick={() =>
                void onUpdateSettings({ globalClockInPolicy: ClockInPolicyMode.StrictMobileGPS })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.globalClockInPolicy === ClockInPolicyMode.StrictMobileGPS
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              Strict Mobile GPS
            </button>
            <button
              type="button"
              onClick={() =>
                void onUpdateSettings({ globalClockInPolicy: ClockInPolicyMode.AllowOfficePC })
              }
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer ${
                settings.globalClockInPolicy === ClockInPolicyMode.AllowOfficePC
                  ? 'bg-white dark:bg-slate-900 text-teal-700 dark:text-teal-300 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              <Laptop className="w-3.5 h-3.5" />
              Allow Office PC
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Interactive Pin-Drop OpenStreetMap */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-3">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click anywhere on the map to position a new geofence pin.
              </p>
              <GeofenceMap
                zones={geofences}
                draftPin={{
                  latitude: zoneLat,
                  longitude: zoneLng,
                  radiusMeters: zoneRadius,
                  name: zoneName || 'New Zone',
                }}
                interactivePinDrop
                onMapClick={(lat, lng) => {
                  setZoneLat(Number(lat.toFixed(6)));
                  setZoneLng(Number(lng.toFixed(6)));
                }}
                heightClass="h-80"
              />
            </div>

            {/* Existing Zones */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
              {geofences.map((zone) => {
                const comp = companies.find((c) => c.id === zone.companyId);
                return (
                  <div key={zone.id} className="p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {zone.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {comp?.name ?? 'Group'} · {zone.radiusMeters}m radius · {zone.address}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void onUpdateGeofence(zone.id, { active: !zone.active })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                          zone.active
                            ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                            : 'border-slate-200 dark:border-slate-700 text-slate-500'
                        }`}
                      >
                        {zone.active ? 'Active' : 'Off'}
                      </button>
                      <button
                        type="button"
                        onClick={() => void onDeleteGeofence(zone.id)}
                        aria-label={`Delete ${zone.name}`}
                        className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add Zone Form */}
          <form
            onSubmit={handleCreateGeofence}
            className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3.5"
          >
            <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-teal-600" />
              Add Geofence Location
            </h2>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Company
              </label>
              <select
                value={zoneCompanyId}
                onChange={(e) => setZoneCompanyId(e.target.value)}
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
                Location Name
              </label>
              <input
                type="text"
                required
                placeholder="e.g., Sharjah Service Hub"
                value={zoneName}
                onChange={(e) => setZoneName(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Address
              </label>
              <input
                type="text"
                placeholder="Industrial Area 10, Sharjah"
                value={zoneAddress}
                onChange={(e) => setZoneAddress(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Latitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={zoneLat}
                  onChange={(e) => setZoneLat(Number(e.target.value))}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Longitude
                </label>
                <input
                  type="number"
                  step="0.000001"
                  value={zoneLng}
                  onChange={(e) => setZoneLng(Number(e.target.value))}
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                <span>Geofence Radius</span>
                <span className="font-mono font-semibold text-teal-700 dark:text-teal-300">
                  {zoneRadius}m
                </span>
              </div>
              <input
                type="range"
                min={50}
                max={500}
                step={25}
                value={zoneRadius}
                onChange={(e) => setZoneRadius(Number(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              Save Geofence Pin
            </button>
          </form>
        </div>

        {/* Bulk Assign Zones to Group (Company + Section) or Mark Geofence Exempt */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-teal-600" />
                {t(lang, 'bulkAssignZones')}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Assign multiple map zones to an entire company/section in one action, or clear all
                zones to mark staff Geofence Exempt.
              </p>
            </div>
            {bulkFeedback && (
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                {bulkFeedback}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Target Company
              </label>
              <select
                value={bulkCompanyId}
                onChange={(e) => setBulkCompanyId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="all">{t(lang, 'allCompanies')}</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Target Section
              </label>
              <select
                value={bulkSectionId}
                onChange={(e) => setBulkSectionId(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="all">All Sections</option>
                {sections.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Assignment Mode
              </label>
              <select
                value={bulkReplace ? 'replace' : 'append'}
                onChange={(e) => setBulkReplace(e.target.value === 'replace')}
                className={INPUT_CLASS}
              >
                <option value="replace">Replace existing zones</option>
                <option value="append">Add to existing zones</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Zones to Assign ({bulkZoneIds.length === 0 ? 'None — Geofence Exempt' : `${bulkZoneIds.length} selected`})
              </p>
              <button
                type="button"
                onClick={() => setBulkZoneIds([])}
                className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Clear (Mark Exempt)
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {geofences.map((z) => {
                const selected = bulkZoneIds.includes(z.id);
                return (
                  <button
                    key={z.id}
                    type="button"
                    onClick={() =>
                      setBulkZoneIds((prev) =>
                        selected ? prev.filter((id) => id !== z.id) : [...prev, z.id]
                      )
                    }
                    className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer ${
                      selected
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {z.name}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              disabled={saving}
              onClick={async () => {
                setSaving(true);
                try {
                  const count = await onBulkAssignZones({
                    companyId: bulkCompanyId,
                    sectionId: bulkSectionId,
                    zoneIds: bulkZoneIds,
                    replaceExisting: bulkReplace,
                  });
                  setBulkFeedback(
                    bulkZoneIds.length === 0
                      ? `Updated ${count} employee${count === 1 ? '' : 's'} to Geofence Exempt.`
                      : `Assigned ${bulkZoneIds.length} zone(s) to ${count} employee${count === 1 ? '' : 's'}.`
                  );
                } finally {
                  setSaving(false);
                }
              }}
              className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer disabled:opacity-60"
            >
              Apply Bulk Zone Assignment
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- 5. SECTIONS, CUSTOM DOC TYPES & SYSTEM TOOLS SUB-VIEW ---
  return (
    <div className="space-y-5">
      {renderSubHeader(
        t(lang, 'sectionsDocs'),
        'Configure organizational sections, custom document vault types, and offline resilience.'
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Organizational Sections */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Organizational Sections ({sections.length})
          </h2>
          <div className="flex flex-wrap gap-2">
            {sections.map((sec) => (
              <span
                key={sec.id}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-medium text-slate-700 dark:text-slate-200"
              >
                {sec.name}{' '}
                <span className="font-mono text-[10px] text-slate-400 ms-1">{sec.code}</span>
              </span>
            ))}
          </div>
          <form onSubmit={handleCreateSection} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              required
              placeholder="New section (e.g., Fleet Maintenance)"
              value={secName}
              onChange={(e) => setSecName(e.target.value)}
              className={INPUT_CLASS}
            />
            <input
              type="text"
              maxLength={4}
              placeholder="Code"
              value={secCode}
              onChange={(e) => setSecCode(e.target.value)}
              className="w-24 px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              {t(lang, 'add')}
            </button>
          </form>
        </div>

        {/* Custom Document Types */}
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            Document Vault Types
          </h2>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Built-In</p>
            <div className="flex flex-wrap gap-1.5">
              {BUILT_IN_DOCS.map((d) => (
                <span
                  key={d}
                  className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs text-slate-600 dark:text-slate-300"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Custom Types ({settings.customDocumentTypes.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {settings.customDocumentTypes.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/60 text-xs font-medium text-teal-700 dark:text-teal-300"
                >
                  {d}
                  <button
                    type="button"
                    onClick={() => void handleRemoveCustomDocType(d)}
                    aria-label={`Remove ${d}`}
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
          <form onSubmit={handleAddCustomDocType} className="flex gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
            <input
              type="text"
              required
              placeholder="e.g., RTA Permit or Medical Insurance"
              value={customDocDraft}
              onChange={(e) => setCustomDocDraft(e.target.value)}
              className={INPUT_CLASS}
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shrink-0 cursor-pointer"
            >
              {t(lang, 'add')}
            </button>
          </form>
        </div>
      </div>

      {/* Manager & Co-Manager Section Assignment Panel */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-teal-600" />
            Manager & Co-Manager Section Assignments
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Assign one or more sections directly to Section Managers and Section Co-Managers.
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {employees
            .filter(
              (e) =>
                e.role === UserRole.SectionManager || e.role === UserRole.SectionCoManager
            )
            .map((mgr) => (
              <div
                key={mgr.id}
                className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    {mgr.fullName}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {getRoleLabel(lang, mgr.role)} · {mgr.jobTitle}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {sections.map((sec) => {
                    const assigned = mgr.managedSectionIds.includes(sec.id);
                    return (
                      <button
                        key={sec.id}
                        type="button"
                        onClick={() => {
                          const next = assigned
                            ? mgr.managedSectionIds.filter((id) => id !== sec.id)
                            : [...mgr.managedSectionIds, sec.id];
                          void onUpdateEmployee(mgr.id, {
                            managedSectionIds: next.length > 0 ? next : [mgr.sectionId],
                          });
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-xs font-medium cursor-pointer ${
                          assigned
                            ? 'border-teal-600 bg-teal-600 text-white'
                            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        {sec.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
      </div>

      {/* App Resilience & Demo Data */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900 dark:text-white">
            App Resilience & Demo Dataset
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Preview the native Offline Mode screen or restore the initial 4-company seed dataset.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onPreviewOfflineScreen}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
          >
            <WifiOff className="w-3.5 h-3.5" />
            Test Offline Screen
          </button>
          <button
            type="button"
            onClick={() => void onResetDemoData()}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 text-xs font-semibold text-rose-700 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset Demo Data
          </button>
        </div>
      </div>
    </div>
  );
};
