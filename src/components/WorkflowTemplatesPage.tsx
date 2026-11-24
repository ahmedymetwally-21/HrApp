import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  GitBranch,
  Layers,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import {
  getWorkflowModuleLabel,
  getWorkflowStepRoleLabel,
  t,
} from '../i18n/translations';
import {
  Employee,
  Language,
  Project,
  ResolvedWorkflowStep,
  UserRole,
  WorkflowModuleAssignments,
  WorkflowModuleKey,
  WorkflowStepRoleKey,
  WorkflowTemplate,
  WorkflowTemplateStep,
} from '../types/hr';
import {
  ALL_WORKFLOW_MODULES,
  ALL_WORKFLOW_STEP_ROLES,
  resolveWorkflowStepsForEmployee,
} from '../utils/hrLogic';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface WorkflowTemplatesPageProps {
  lang: Language;
  templates: WorkflowTemplate[];
  assignments: WorkflowModuleAssignments;
  employees: Employee[];
  projects: Project[];
  onCreateTemplate: (
    input: Omit<WorkflowTemplate, 'id' | 'createdAt' | 'updatedAt'>
  ) => Promise<void>;
  onUpdateTemplate: (
    id: string,
    patch: Partial<Omit<WorkflowTemplate, 'id'>>
  ) => Promise<void>;
  onDeleteTemplate: (id: string) => Promise<void>;
  onResolveTemplate: (id: string, employeeId: string) => Promise<ResolvedWorkflowStep[]>;
  onUpdateAssignments: (assignments: WorkflowModuleAssignments) => Promise<void>;
}

function createEmptyStep(stepOrder: number): WorkflowTemplateStep {
  return {
    stepOrder,
    type: 'role',
    role: 'section_manager',
  };
}

export const WorkflowTemplatesPage: React.FC<WorkflowTemplatesPageProps> = ({
  lang,
  templates,
  assignments,
  employees,
  projects,
  onCreateTemplate,
  onUpdateTemplate,
  onDeleteTemplate,
  onResolveTemplate,
  onUpdateAssignments,
}) => {
  const [subPage, setSubPage] = useState<'list' | 'form'>('list');
  const [editingTemplate, setEditingTemplate] = useState<WorkflowTemplate | null>(null);

  // Module assignments state
  const [draftAssignments, setDraftAssignments] = useState<WorkflowModuleAssignments>(assignments);
  const [savingAssignments, setSavingAssignments] = useState(false);

  useEffect(() => {
    setDraftAssignments(assignments);
  }, [assignments]);

  // Editor form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [steps, setSteps] = useState<WorkflowTemplateStep[]>([
    { stepOrder: 1, type: 'role', role: 'section_manager' },
    { stepOrder: 2, type: 'role', role: 'hr_admin' },
  ]);
  const [stepsDirty, setStepsDirty] = useState(false);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Live Example Preview state
  const activeEmployees = useMemo(
    () =>
      employees
        .filter((e) => e.active)
        .sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees]
  );

  const defaultPreviewEmpId = useMemo(() => {
    const regular = activeEmployees.find((e) => e.role === UserRole.Employee);
    return regular?.id ?? activeEmployees[0]?.id ?? '';
  }, [activeEmployees]);

  const [previewEmployeeId, setPreviewEmployeeId] = useState<string>(defaultPreviewEmpId);
  const [resolvedPreview, setResolvedPreview] = useState<ResolvedWorkflowStep[]>([]);
  const [loadingPreview, setLoadingPreview] = useState(false);

  useEffect(() => {
    if (!previewEmployeeId && defaultPreviewEmpId) {
      setPreviewEmployeeId(defaultPreviewEmpId);
    }
  }, [previewEmployeeId, defaultPreviewEmpId]);

  // Delete confirmation dialog
  const [deleteTarget, setDeleteTarget] = useState<WorkflowTemplate | null>(null);
  const [deleting, setDeleting] = useState(false);

  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);
  const templateById = useMemo(() => new Map(templates.map((tpl) => [tpl.id, tpl])), [templates]);

  const assignmentsDirty = useMemo(
    () => ALL_WORKFLOW_MODULES.some((mod) => (draftAssignments[mod] ?? null) !== (assignments[mod] ?? null)),
    [draftAssignments, assignments]
  );

  // Live resolve preview whenever in editor and previewEmployeeId / steps / editingTemplate changes
  useEffect(() => {
    if (subPage !== 'form' || !previewEmployeeId) return;
    let cancelled = false;

    const previewEmp = empById.get(previewEmployeeId);
    const localResolved = resolveWorkflowStepsForEmployee({
      steps,
      employee: previewEmp,
      employees,
      projects,
    });

    if (editingTemplate && !stepsDirty) {
      setLoadingPreview(true);
      onResolveTemplate(editingTemplate.id, previewEmployeeId)
        .then((serverSteps) => {
          if (!cancelled) {
            setResolvedPreview(serverSteps.length > 0 ? serverSteps : localResolved);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setResolvedPreview(localResolved);
          }
        })
        .finally(() => {
          if (!cancelled) setLoadingPreview(false);
        });
    } else {
      setResolvedPreview(localResolved);
      setLoadingPreview(false);
    }

    return () => {
      cancelled = true;
    };
  }, [
    subPage,
    previewEmployeeId,
    steps,
    stepsDirty,
    editingTemplate,
    empById,
    employees,
    projects,
    onResolveTemplate,
  ]);

  const openCreate = () => {
    setEditingTemplate(null);
    setName('');
    setDescription('');
    setSteps([
      { stepOrder: 1, type: 'role', role: 'section_manager' },
      { stepOrder: 2, type: 'role', role: 'hr_admin' },
      { stepOrder: 3, type: 'role', role: 'main_manager' },
    ]);
    setStepsDirty(true);
    setFormError(null);
    setPreviewEmployeeId(defaultPreviewEmpId);
    setSubPage('form');
  };

  const openEdit = (tpl: WorkflowTemplate) => {
    setEditingTemplate(tpl);
    setName(tpl.name);
    setDescription(tpl.description ?? '');
    setSteps(
      tpl.steps.length > 0
        ? tpl.steps.map((s, idx) => ({ ...s, stepOrder: idx + 1 }))
        : [createEmptyStep(1)]
    );
    setStepsDirty(false);
    setFormError(null);
    if (!previewEmployeeId && defaultPreviewEmpId) {
      setPreviewEmployeeId(defaultPreviewEmpId);
    }
    setSubPage('form');
  };

  const handleAddStep = () => {
    setSteps((prev) => [...prev, createEmptyStep(prev.length + 1)]);
    setStepsDirty(true);
  };

  const handleRemoveStep = (index: number) => {
    setSteps((prev) =>
      prev
        .filter((_, idx) => idx !== index)
        .map((s, idx) => ({ ...s, stepOrder: idx + 1 }))
    );
    setStepsDirty(true);
  };

  const handleMoveStep = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next.map((s, idx) => ({ ...s, stepOrder: idx + 1 }));
    });
    setStepsDirty(true);
  };

  const handleStepTypeChange = (index: number, nextType: 'role' | 'employee') => {
    setSteps((prev) =>
      prev.map((s, idx) => {
        if (idx !== index) return s;
        if (nextType === 'employee') {
          return {
            stepOrder: idx + 1,
            type: 'employee',
            employeeId: activeEmployees[0]?.id ?? '',
          };
        }
        return {
          stepOrder: idx + 1,
          type: 'role',
          role: 'section_manager',
        };
      })
    );
    setStepsDirty(true);
  };

  const handleStepRoleChange = (index: number, role: WorkflowStepRoleKey) => {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === index ? { ...s, type: 'role', role, employeeId: undefined } : s))
    );
    setStepsDirty(true);
  };

  const handleStepEmployeeChange = (index: number, employeeId: string) => {
    setSteps((prev) =>
      prev.map((s, idx) =>
        idx === index ? { ...s, type: 'employee', employeeId, role: undefined } : s
      )
    );
    setStepsDirty(true);
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(`${t(lang, 'workflowName')} is required.`);
      return;
    }
    if (steps.length === 0) {
      setFormError('Add at least one approval step.');
      return;
    }
    const invalidEmployeeStep = steps.find((s) => s.type === 'employee' && !s.employeeId);
    if (invalidEmployeeStep) {
      setFormError('Select a specific employee for every employee-based step.');
      return;
    }

    setSavingForm(true);
    setFormError(null);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || undefined,
        steps: steps.map((s, idx) => ({
          stepOrder: idx + 1,
          type: s.type,
          role: s.type === 'role' ? s.role : undefined,
          employeeId: s.type === 'employee' ? s.employeeId : undefined,
        })),
      };
      if (editingTemplate) {
        await onUpdateTemplate(editingTemplate.id, payload);
      } else {
        await onCreateTemplate(payload);
      }
      setSubPage('list');
      setEditingTemplate(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save workflow.');
    } finally {
      setSavingForm(false);
    }
  };

  const handleSaveAssignments = async () => {
    setSavingAssignments(true);
    try {
      await onUpdateAssignments(draftAssignments);
    } finally {
      setSavingAssignments(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteTemplate(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const formatStepDisplay = (step: WorkflowTemplateStep): string => {
    if (step.type === 'employee') {
      const emp = step.employeeId ? empById.get(step.employeeId) : undefined;
      return emp ? emp.fullName : t(lang, 'unassignedRole');
    }
    return getWorkflowStepRoleLabel(lang, step.role ?? 'section_manager');
  };

  const getAssignedModulesForTemplate = (templateId: string): WorkflowModuleKey[] => {
    return ALL_WORKFLOW_MODULES.filter((mod) => assignments[mod] === templateId);
  };

  // --- Full-Page Create / Edit Editor ---
  if (subPage === 'form') {
    const previewEmp = previewEmployeeId ? empById.get(previewEmployeeId) : undefined;

    return (
      <div className="space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          breadcrumbs={[
            { label: t(lang, 'navGroupOrganizationSettings') },
            { label: t(lang, 'namedWorkflowsTitle'), onClick: () => setSubPage('list') },
            {
              label: editingTemplate
                ? t(lang, 'editWorkflowTemplate')
                : t(lang, 'addWorkflowTemplate'),
            },
          ]}
          title={
            editingTemplate ? t(lang, 'editWorkflowTemplate') : t(lang, 'addWorkflowTemplate')
          }
          subtitle={t(lang, 'namedWorkflowsSubtitle')}
          onBack={() => setSubPage('list')}
        />

        {/* Live Example Preview by Name (Top of Workflow Editor) */}
        <section className="max-w-4xl rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                <UserCheck className="w-4 h-4 text-teal-600" />
                <span>{t(lang, 'livePreviewTitle')}</span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                {t(lang, 'livePreviewSubtitle')}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <select
                aria-label={t(lang, 'selectEmployee')}
                value={previewEmployeeId}
                onChange={(e) => setPreviewEmployeeId(e.target.value)}
                className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              >
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode})
                  </option>
                ))}
              </select>
              {editingTemplate && !stepsDirty && (
                <button
                  type="button"
                  onClick={() => {
                    if (!previewEmployeeId) return;
                    setLoadingPreview(true);
                    void onResolveTemplate(editingTemplate.id, previewEmployeeId)
                      .then((res) => setResolvedPreview(res))
                      .finally(() => setLoadingPreview(false));
                  }}
                  aria-label="Refresh preview"
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-teal-600 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingPreview ? 'animate-spin' : ''}`} />
                </button>
              )}
            </div>
          </div>

          <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-700/70 px-4 py-3.5">
            {loadingPreview ? (
              <p className="text-xs text-slate-500">Resolving approval chain...</p>
            ) : resolvedPreview.length === 0 ? (
              <p className="text-xs text-slate-500">Add steps below to preview the resolved chain.</p>
            ) : (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs leading-relaxed">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  {t(lang, 'previewForEmployee')} {previewEmp?.fullName ?? 'Employee'}:
                </span>
                {resolvedPreview.map((step, idx) => {
                  const roleDisplay =
                    step.type === 'role' && step.role
                      ? getWorkflowStepRoleLabel(lang, step.role)
                      : step.roleLabel;
                  return (
                    <React.Fragment key={`${step.stepOrder}-${idx}`}>
                      <span
                        className={
                          step.skipped
                            ? 'text-slate-400 line-through'
                            : 'text-slate-900 dark:text-white font-medium'
                        }
                      >
                        <span className="text-slate-500 dark:text-slate-400">{roleDisplay}</span>{' '}
                        <span className="font-semibold text-teal-700 dark:text-teal-300">
                          ({step.approverName || t(lang, 'unassignedRole')})
                        </span>
                      </span>
                      {idx < resolvedPreview.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 rtl:rotate-180" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Workflow Form */}
        <form
          onSubmit={(e) => void handleSaveTemplate(e)}
          className="max-w-4xl rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
        >
          {formError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'workflowName')} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Standard Office Leave"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'workflowDescription')}
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional note about when to use this chain..."
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>
          </div>

          {/* Ordered Steps List */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t(lang, 'workflowSteps')} ({steps.length})
              </label>
              <button
                type="button"
                onClick={handleAddStep}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 text-xs font-semibold hover:bg-teal-100/80 dark:hover:bg-teal-950/70 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>{t(lang, 'addWorkflowStep')}</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 overflow-hidden">
              {steps.map((step, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-white dark:bg-slate-900 flex flex-col lg:flex-row lg:items-center gap-3"
                >
                  {/* Step Order Indicator */}
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-mono tabular-nums font-semibold flex items-center justify-center">
                      {idx + 1}
                    </span>

                    {/* Type Toggle: Role vs Specific Employee */}
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
                      <button
                        type="button"
                        onClick={() => handleStepTypeChange(idx, 'role')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          step.type === 'role'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {t(lang, 'stepTypeRole')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStepTypeChange(idx, 'employee')}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          step.type === 'employee'
                            ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                        }`}
                      >
                        {t(lang, 'stepTypeEmployee')}
                      </button>
                    </div>
                  </div>

                  {/* Role or Specific Employee Dropdown */}
                  <div className="flex-1 min-w-0">
                    {step.type === 'role' ? (
                      <select
                        value={step.role ?? 'section_manager'}
                        onChange={(e) =>
                          handleStepRoleChange(idx, e.target.value as WorkflowStepRoleKey)
                        }
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                      >
                        {ALL_WORKFLOW_STEP_ROLES.map((rk) => (
                          <option key={rk} value={rk}>
                            {getWorkflowStepRoleLabel(lang, rk)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <select
                        value={step.employeeId ?? ''}
                        onChange={(e) => handleStepEmployeeChange(idx, e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                      >
                        <option value="">{t(lang, 'selectEmployee')}</option>
                        {activeEmployees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.fullName} — {emp.jobTitle || emp.employeeCode}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Reorder & Remove Actions */}
                  <div className="flex items-center gap-1 shrink-0 justify-end">
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, -1)}
                      disabled={idx === 0}
                      aria-label="Move step up"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleMoveStep(idx, 1)}
                      disabled={idx === steps.length - 1}
                      aria-label="Move step down"
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(idx)}
                      disabled={steps.length <= 1}
                      aria-label={t(lang, 'delete')}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 disabled:opacity-30 cursor-pointer disabled:cursor-not-allowed"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSubPage('list')}
              disabled={savingForm}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={savingForm}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{savingForm ? '...' : t(lang, 'save')}</span>
            </button>
          </div>
        </form>
      </div>
    );
  }

  // --- Main List & Module Assignments Page ---
  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <GitBranch className="w-5 h-5 text-teal-600" />
            <span>{t(lang, 'namedWorkflowsTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'namedWorkflowsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0 whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'addWorkflowTemplate')}</span>
        </button>
      </div>

      {/* Module Workflow Assignments Card */}
      <section className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal-600" />
              <span>{t(lang, 'moduleAssignmentsTitle')}</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t(lang, 'moduleAssignmentsSubtitle')}
            </p>
          </div>
          <button
            type="button"
            disabled={savingAssignments || !assignmentsDirty}
            onClick={() => void handleSaveAssignments()}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap shrink-0"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savingAssignments ? '...' : t(lang, 'saveAssignments')}</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {ALL_WORKFLOW_MODULES.map((mod) => {
            const selectedId = draftAssignments[mod] ?? '';
            const selectedTpl = selectedId ? templateById.get(selectedId) : undefined;
            return (
              <div
                key={mod}
                className="px-6 py-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 dark:text-white">
                    {getWorkflowModuleLabel(lang, mod)}
                  </p>
                  {selectedTpl && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                      {selectedTpl.steps.map((s) => formatStepDisplay(s)).join(' → ')}
                    </p>
                  )}
                </div>
                <div className="w-full md:w-72 shrink-0">
                  <select
                    aria-label={getWorkflowModuleLabel(lang, mod)}
                    value={selectedId}
                    onChange={(e) =>
                      setDraftAssignments((prev) => ({
                        ...prev,
                        [mod]: e.target.value || null,
                      }))
                    }
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
                  >
                    <option value="">{t(lang, 'selectWorkflowPlaceholder')}</option>
                    {templates.map((tpl) => (
                      <option key={tpl.id} value={tpl.id}>
                        {tpl.name} ({tpl.steps.length} {t(lang, 'stepLabel')})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Saved Named Workflows List */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
            {t(lang, 'namedWorkflowsTitle')} ({templates.length})
          </h2>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
            <Users className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t(lang, 'noWorkflowTemplatesYet')}
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{t(lang, 'addWorkflowTemplate')}</span>
            </button>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {templates.map((tpl) => {
              const assignedMods = getAssignedModulesForTemplate(tpl.id);
              return (
                <div
                  key={tpl.id}
                  className="p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/40 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="space-y-2 min-w-0">
                    <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {tpl.name}
                      </h3>
                      <span className="text-xs font-mono tabular-nums text-slate-400">
                        {tpl.steps.length} {t(lang, 'stepLabel')}
                      </span>
                      {assignedMods.length > 0 && (
                        <>
                          <span aria-hidden="true" className="text-slate-300 dark:text-slate-700">
                            ·
                          </span>
                          <span className="text-xs text-teal-700 dark:text-teal-400 font-medium">
                            {assignedMods.map((m) => getWorkflowModuleLabel(lang, m)).join(' / ')}
                          </span>
                        </>
                      )}
                    </div>

                    {tpl.description && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {tpl.description}
                      </p>
                    )}

                    {/* Clean ordered chain flow */}
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pt-0.5 text-xs text-slate-700 dark:text-slate-300">
                      {tpl.steps.map((step, idx) => (
                        <React.Fragment key={`${tpl.id}-step-${idx}`}>
                          <span className="font-medium">
                            <span className="font-mono tabular-nums text-slate-400 me-1">
                              {idx + 1}.
                            </span>
                            {formatStepDisplay(step)}
                          </span>
                          {idx < tpl.steps.length - 1 && (
                            <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0 rtl:rotate-180" />
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                    <button
                      type="button"
                      onClick={() => openEdit(tpl)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:border-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      <span>{t(lang, 'edit')}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(tpl)}
                      aria-label={t(lang, 'delete')}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        lang={lang}
        title={t(lang, 'confirmDeleteTitle')}
        message={
          deleteTarget
            ? `Delete workflow "${deleteTarget.name}"? Any module currently assigned to it will be unassigned.`
            : ''
        }
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
