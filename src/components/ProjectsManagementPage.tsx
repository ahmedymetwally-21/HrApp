import React, { useMemo, useState } from 'react';
import {
  Building2,
  Check,
  FolderKanban,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { t } from '../i18n/translations';
import { Company, Employee, Language, Project } from '../types/hr';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface ProjectsManagementPageProps {
  lang: Language;
  projects: Project[];
  companies: Company[];
  employees: Employee[];
  onCreateProject: (input: Omit<Project, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateProject: (id: string, patch: Partial<Omit<Project, 'id'>>) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export const ProjectsManagementPage: React.FC<ProjectsManagementPageProps> = ({
  lang,
  projects,
  companies,
  employees,
  onCreateProject,
  onUpdateProject,
  onDeleteProject,
}) => {
  const [subPage, setSubPage] = useState<'list' | 'form'>('list');
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [companyFilter, setCompanyFilter] = useState('all');

  // Form state
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [companyId, setCompanyId] = useState(companies[0]?.id ?? '');
  const [managerId, setManagerId] = useState<string>('');
  const [supervisorIds, setSupervisorIds] = useState<string[]>([]);
  const [supervisorSearch, setSupervisorSearch] = useState('');
  const [description, setDescription] = useState('');
  const [active, setActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const employeeById = useMemo(
    () => new Map(employees.map((e) => [e.id, e])),
    [employees]
  );
  const companyById = useMemo(
    () => new Map(companies.map((c) => [c.id, c])),
    [companies]
  );

  const memberCountByProject = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of employees) {
      for (const pid of emp.projectIds ?? []) {
        map.set(pid, (map.get(pid) ?? 0) + 1);
      }
    }
    return map;
  }, [employees]);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return projects.filter((p) => {
      if (companyFilter !== 'all' && p.companyId !== companyFilter) return false;
      if (!q) return true;
      const mgr = p.managerId ? employeeById.get(p.managerId)?.fullName ?? '' : '';
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        mgr.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q)
      );
    });
  }, [projects, searchQuery, companyFilter, employeeById]);

  const activeEmployees = useMemo(
    () => employees.filter((e) => e.active).sort((a, b) => a.fullName.localeCompare(b.fullName)),
    [employees]
  );

  const supervisorCandidates = useMemo(() => {
    const q = supervisorSearch.trim().toLowerCase();
    return activeEmployees.filter((e) => {
      if (e.id === managerId) return false;
      if (!q) return true;
      return (
        e.fullName.toLowerCase().includes(q) ||
        e.employeeCode.toLowerCase().includes(q) ||
        e.jobTitle.toLowerCase().includes(q)
      );
    });
  }, [activeEmployees, managerId, supervisorSearch]);

  const openCreate = () => {
    setEditingProject(null);
    setCode('');
    setName('');
    setCompanyId(companies[0]?.id ?? '');
    setManagerId('');
    setSupervisorIds([]);
    setSupervisorSearch('');
    setDescription('');
    setActive(true);
    setFormError(null);
    setSubPage('form');
  };

  const openEdit = (project: Project) => {
    setEditingProject(project);
    setCode(project.code);
    setName(project.name);
    setCompanyId(project.companyId || companies[0]?.id || '');
    setManagerId(project.managerId ?? '');
    setSupervisorIds(project.supervisorIds ?? []);
    setSupervisorSearch('');
    setDescription(project.description ?? '');
    setActive(project.active);
    setFormError(null);
    setSubPage('form');
  };

  const toggleSupervisor = (empId: string) => {
    setSupervisorIds((prev) =>
      prev.includes(empId) ? prev.filter((id) => id !== empId) : [...prev, empId]
    );
  };

  const handleManagerChange = (nextManagerId: string) => {
    setManagerId(nextManagerId);
    if (nextManagerId) {
      setSupervisorIds((prev) => prev.filter((id) => id !== nextManagerId));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim() || !name.trim() || !companyId) {
      setFormError('Project code, name, and company are required.');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        code: code.trim().toUpperCase(),
        name: name.trim(),
        companyId,
        managerId: managerId || null,
        supervisorIds: supervisorIds.filter((id) => id !== managerId),
        description: description.trim() || undefined,
        active,
      };
      if (editingProject) {
        await onUpdateProject(editingProject.id, payload);
      } else {
        await onCreateProject(payload);
      }
      setSubPage('list');
      setEditingProject(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save project.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActiveQuick = async (project: Project) => {
    await onUpdateProject(project.id, { active: !project.active });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteProject(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (subPage === 'form') {
    return (
      <div className="space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          breadcrumbs={[
            { label: t(lang, 'navGroupOrganizationSettings') },
            { label: t(lang, 'projectsTitle'), onClick: () => setSubPage('list') },
            { label: editingProject ? t(lang, 'editProject') : t(lang, 'addProject') },
          ]}
          title={editingProject ? t(lang, 'editProject') : t(lang, 'addProject')}
          subtitle={t(lang, 'projectsSubtitle')}
          onBack={() => setSubPage('list')}
        />

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="max-w-3xl rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6"
        >
          {formError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'projectCode')} *
              </label>
              <input
                type="text"
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. DXB-01"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm font-mono uppercase text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'projectName')} *
              </label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Dubai Airport Transfers"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'company')} *
              </label>
              <select
                required
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                {t(lang, 'projectManager')}
              </label>
              <select
                value={managerId}
                onChange={(e) => handleManagerChange(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              >
                <option value="">{t(lang, 'noProjectManager')}</option>
                {activeEmployees.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.fullName} ({emp.employeeCode}) — {emp.jobTitle}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Supervisors Multi-Selector */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {t(lang, 'projectSupervisors')}
              </label>
              <span className="text-xs text-slate-500 font-mono">
                {supervisorIds.length} selected
              </span>
            </div>

            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={supervisorSearch}
                onChange={(e) => setSupervisorSearch(e.target.value)}
                placeholder={t(lang, 'search')}
                className="w-full ps-8 pe-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/40 dark:bg-slate-800/30">
              {supervisorCandidates.map((emp) => {
                const checked = supervisorIds.includes(emp.id);
                return (
                  <button
                    key={emp.id}
                    type="button"
                    onClick={() => toggleSupervisor(emp.id)}
                    className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-start transition-colors cursor-pointer ${
                      checked
                        ? 'bg-teal-50/70 dark:bg-teal-950/40'
                        : 'hover:bg-slate-100/70 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-slate-900 dark:text-white truncate">
                        {emp.fullName}
                      </p>
                      <p className="text-[11px] text-slate-500 truncate">
                        {emp.employeeCode} · {emp.jobTitle}
                      </p>
                    </div>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                        checked
                          ? 'bg-teal-600 border-teal-600 text-white'
                          : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'groupDescription')}
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-slate-200/80 dark:border-slate-800 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t(lang, 'active')}
              </p>
              <p className="text-[11px] text-slate-500">
                Active projects appear in employee assignment selectors and directory filters.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={active}
              onClick={() => setActive((v) => !v)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer ${
                active ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-700'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  active ? 'translate-x-6 rtl:-translate-x-6' : 'translate-x-1 rtl:-translate-x-1'
                }`}
              />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSubPage('list')}
              disabled={saving}
              className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
            >
              {t(lang, 'cancel')}
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
            >
              {saving ? '...' : t(lang, 'save')}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <FolderKanban className="w-5 h-5 text-teal-600" />
            <span>{t(lang, 'projectsTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'projectsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'addProject')}</span>
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(lang, 'search')}
            className="w-full ps-9 pe-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
        </div>
        <select
          value={companyFilter}
          onChange={(e) => setCompanyFilter(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200"
        >
          <option value="all">{t(lang, 'allCompanies')}</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filteredProjects.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <FolderKanban className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t(lang, 'noProjectsYet')}</p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t(lang, 'addProject')}</span>
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-start border-collapse">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 text-start">{t(lang, 'projectCode')} / {t(lang, 'projectName')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'company')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'projectManager')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'projectSupervisors')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'membersCount')}</th>
                  <th className="py-3 px-4 text-start">{t(lang, 'status')}</th>
                  <th className="py-3 px-4 text-end">{t(lang, 'actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                {filteredProjects.map((project) => {
                  const company = companyById.get(project.companyId);
                  const manager = project.managerId ? employeeById.get(project.managerId) : null;
                  const supervisors = (project.supervisorIds ?? [])
                    .map((sid) => employeeById.get(sid))
                    .filter((e): e is Employee => Boolean(e));
                  const memberCount = memberCountByProject.get(project.id) ?? 0;

                  return (
                    <tr
                      key={project.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono font-semibold text-slate-700 dark:text-slate-300">
                            {project.code}
                          </span>
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {project.name}
                          </span>
                        </div>
                        {project.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">
                            {project.description}
                          </p>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{company?.name ?? project.companyId}</span>
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-xs">
                        {manager ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-slate-800 dark:text-slate-200">
                            <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                            <span>{manager.fullName}</span>
                          </span>
                        ) : (
                          <span className="text-slate-400">{t(lang, 'noProjectManager')}</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300">
                        {supervisors.length === 0 ? (
                          <span className="text-slate-400">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {supervisors.slice(0, 3).map((sup) => (
                              <span
                                key={sup.id}
                                className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-700 dark:text-slate-300"
                              >
                                {sup.fullName}
                              </span>
                            ))}
                            {supervisors.length > 3 && (
                              <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] text-slate-500">
                                +{supervisors.length - 3}
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 text-xs font-mono tabular-nums text-slate-700 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1">
                          <Users className="w-3.5 h-3.5 text-slate-400" />
                          {memberCount}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <button
                          type="button"
                          onClick={() => void handleToggleActiveQuick(project)}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold cursor-pointer transition-colors ${
                            project.active
                              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              project.active ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                          />
                          {project.active ? t(lang, 'active') : t(lang, 'inactive')}
                        </button>
                      </td>
                      <td className="py-3.5 px-4 text-end">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEdit(project)}
                            aria-label={t(lang, 'editProject')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(project)}
                            aria-label={t(lang, 'delete')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        lang={lang}
        title={t(lang, 'confirmDeleteTitle')}
        message={
          deleteTarget
            ? `Delete project "${deleteTarget.code} — ${deleteTarget.name}"? Assigned employees will be detached from this project.`
            : ''
        }
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
