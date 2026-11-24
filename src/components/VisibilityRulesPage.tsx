import React, { useMemo, useState } from 'react';
import { Check, EyeOff, Pencil, Plus, Search, ShieldAlert, Trash2 } from 'lucide-react';
import {
  getEmployeeTypeLabel,
  getHiddenSectionLabel,
  getVisibilityTargetTypeLabel,
  t,
} from '../i18n/translations';
import {
  Employee,
  EmployeeGroup,
  EmployeeType,
  HiddenSectionKey,
  Language,
  VisibilityRule,
  VisibilityRuleTargetType,
} from '../types/hr';
import { ALL_HIDDEN_SECTION_KEYS } from '../utils/hrLogic';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface VisibilityRulesPageProps {
  lang: Language;
  rules: VisibilityRule[];
  groups: EmployeeGroup[];
  employees: Employee[];
  onCreateRule: (input: Omit<VisibilityRule, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateRule: (id: string, patch: Partial<Omit<VisibilityRule, 'id'>>) => Promise<void>;
  onDeleteRule: (id: string) => Promise<void>;
}

const TARGET_TYPES: VisibilityRuleTargetType[] = [
  'group',
  'employee_type',
  'employees',
  'all',
];

const EMPLOYEE_TYPES: EmployeeType[] = ['office_employee', 'driver', 'management'];

export const VisibilityRulesPage: React.FC<VisibilityRulesPageProps> = ({
  lang,
  rules,
  groups,
  employees,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}) => {
  const [subPage, setSubPage] = useState<'list' | 'form'>('list');
  const [editingRule, setEditingRule] = useState<VisibilityRule | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [targetType, setTargetType] = useState<VisibilityRuleTargetType>('group');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [hiddenSections, setHiddenSections] = useState<HiddenSectionKey[]>([]);
  const [active, setActive] = useState(true);
  const [empSearch, setEmpSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<VisibilityRule | null>(null);
  const [deleting, setDeleting] = useState(false);

  const groupById = useMemo(() => new Map(groups.map((g) => [g.id, g])), [groups]);
  const empById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const filteredEmployees = useMemo(() => {
    const q = empSearch.trim().toLowerCase();
    return employees
      .filter((e) => e.active)
      .filter((e) => {
        if (!q) return true;
        return (
          e.fullName.toLowerCase().includes(q) ||
          e.employeeCode.toLowerCase().includes(q) ||
          e.jobTitle.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [employees, empSearch]);

  const openCreate = () => {
    setEditingRule(null);
    setName('');
    setTargetType('group');
    setTargetIds([]);
    setHiddenSections([]);
    setActive(true);
    setEmpSearch('');
    setFormError(null);
    setSubPage('form');
  };

  const openEdit = (rule: VisibilityRule) => {
    setEditingRule(rule);
    setName(rule.name);
    setTargetType(rule.targetType);
    setTargetIds(rule.targetIds ?? []);
    setHiddenSections(rule.hiddenSections ?? []);
    setActive(rule.active);
    setEmpSearch('');
    setFormError(null);
    setSubPage('form');
  };

  const handleTargetTypeChange = (next: VisibilityRuleTargetType) => {
    setTargetType(next);
    setTargetIds([]);
  };

  const toggleTargetId = (id: string) => {
    setTargetIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const toggleHiddenSection = (key: HiddenSectionKey) => {
    setHiddenSections((prev) =>
      prev.includes(key) ? prev.filter((item) => item !== key) : [...prev, key]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setFormError(`${t(lang, 'ruleName')} is required.`);
      return;
    }
    if (targetType !== 'all' && targetIds.length === 0) {
      setFormError('Select at least one target for this visibility rule.');
      return;
    }
    if (hiddenSections.length === 0) {
      setFormError('Select at least one section to hide.');
      return;
    }

    setSaving(true);
    setFormError(null);
    try {
      const payload: Omit<VisibilityRule, 'id' | 'createdAt'> = {
        name: name.trim(),
        targetType,
        targetIds: targetType === 'all' ? [] : targetIds,
        hiddenSections,
        active,
      };
      if (editingRule) {
        await onUpdateRule(editingRule.id, payload);
      } else {
        await onCreateRule(payload);
      }
      setSubPage('list');
      setEditingRule(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save visibility rule.');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleRuleActive = async (rule: VisibilityRule) => {
    await onUpdateRule(rule.id, { active: !rule.active });
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteRule(deleteTarget.id);
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  const formatTargetSummary = (rule: VisibilityRule): string => {
    if (rule.targetType === 'all') return t(lang, 'targetAll');
    if (rule.targetType === 'group') {
      const names = (rule.targetIds ?? [])
        .map((id) => groupById.get(id)?.name ?? id);
      return names.length > 0 ? names.join(', ') : '—';
    }
    if (rule.targetType === 'employee_type') {
      const names = (rule.targetIds ?? []).map((id) =>
        getEmployeeTypeLabel(lang, id as EmployeeType)
      );
      return names.length > 0 ? names.join(', ') : '—';
    }
    const names = (rule.targetIds ?? []).map((id) => empById.get(id)?.fullName ?? id);
    return names.length > 0 ? names.join(', ') : '—';
  };

  if (subPage === 'form') {
    return (
      <div className="space-y-6">
        <PageBreadcrumbHeader
          lang={lang}
          breadcrumbs={[
            { label: t(lang, 'navGroupOrganizationSettings') },
            { label: t(lang, 'visibilityRulesTitle'), onClick: () => setSubPage('list') },
            { label: editingRule ? t(lang, 'editVisibilityRule') : t(lang, 'addVisibilityRule') },
          ]}
          title={editingRule ? t(lang, 'editVisibilityRule') : t(lang, 'addVisibilityRule')}
          subtitle={t(lang, 'visibilityRulesSubtitle')}
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

          {/* Rule Name */}
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'ruleName')} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Hide Salary Breakdown for Field Drivers"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>

          {/* Applies To */}
          <div className="space-y-3">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t(lang, 'appliesTo')} *
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {TARGET_TYPES.map((type) => {
                const selected = targetType === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => handleTargetTypeChange(type)}
                    className={`px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                      selected
                        ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    {getVisibilityTargetTypeLabel(lang, type)}
                  </button>
                );
              })}
            </div>

            {/* Dynamic target selector */}
            {targetType === 'group' && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 space-y-2 bg-slate-50/40 dark:bg-slate-800/30">
                {groups.length === 0 ? (
                  <p className="text-xs text-slate-500">{t(lang, 'noGroupsYet')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {groups.map((g) => {
                      const checked = targetIds.includes(g.id);
                      return (
                        <button
                          key={g.id}
                          type="button"
                          onClick={() => toggleTargetId(g.id)}
                          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                            checked
                              ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                              : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: g.color || '#0D9488' }}
                          />
                          <span>{g.name}</span>
                          {checked && <Check className="w-3.5 h-3.5" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {targetType === 'employee_type' && (
              <div className="flex flex-wrap gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3.5 bg-slate-50/40 dark:bg-slate-800/30">
                {EMPLOYEE_TYPES.map((et) => {
                  const checked = targetIds.includes(et);
                  return (
                    <button
                      key={et}
                      type="button"
                      onClick={() => toggleTargetId(et)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer ${
                        checked
                          ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-700 dark:text-teal-300'
                          : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span>{getEmployeeTypeLabel(lang, et)}</span>
                      {checked && <Check className="w-3.5 h-3.5" />}
                    </button>
                  );
                })}
              </div>
            )}

            {targetType === 'employees' && (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={empSearch}
                    onChange={(e) => setEmpSearch(e.target.value)}
                    placeholder={t(lang, 'search')}
                    className="w-full ps-8 pe-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/40 dark:bg-slate-800/30">
                  {filteredEmployees.map((emp) => {
                    const checked = targetIds.includes(emp.id);
                    return (
                      <button
                        key={emp.id}
                        type="button"
                        onClick={() => toggleTargetId(emp.id)}
                        className={`w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-start cursor-pointer transition-colors ${
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
            )}
          </div>

          {/* Hidden Sections Checkboxes */}
          <div className="space-y-2.5">
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
              {t(lang, 'hiddenSectionsLabel')} *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {ALL_HIDDEN_SECTION_KEYS.map((secKey) => {
                const checked = hiddenSections.includes(secKey);
                return (
                  <button
                    key={secKey}
                    type="button"
                    onClick={() => toggleHiddenSection(secKey)}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border text-start transition-colors cursor-pointer ${
                      checked
                        ? 'border-amber-500/70 bg-amber-50/60 dark:bg-amber-950/30 text-slate-900 dark:text-white'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <EyeOff
                        className={`w-4 h-4 shrink-0 ${
                          checked ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'
                        }`}
                      />
                      <span className="text-xs font-medium truncate">
                        {getHiddenSectionLabel(lang, secKey)}
                      </span>
                    </div>
                    <span
                      className={`w-4 h-4 rounded flex items-center justify-center border shrink-0 ${
                        checked
                          ? 'bg-amber-600 border-amber-600 text-white'
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

          {/* Active Toggle */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200/80 dark:border-slate-800 px-4 py-3">
            <div>
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                {t(lang, 'active')}
              </p>
              <p className="text-[11px] text-slate-500">
                When active, targeted employees will immediately have the selected sections hidden.
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
            <EyeOff className="w-5 h-5 text-teal-600" />
            <span>{t(lang, 'visibilityRulesTitle')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'visibilityRulesSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'addVisibilityRule')}</span>
        </button>
      </div>

      {rules.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <ShieldAlert className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noVisibilityRulesYet')}
          </p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t(lang, 'addVisibilityRule')}</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {rules.map((rule) => (
            <div
              key={rule.id}
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
            >
              <div className="space-y-2.5 min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                    {rule.name}
                  </h2>
                  <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    {getVisibilityTargetTypeLabel(lang, rule.targetType)}
                  </span>
                </div>

                <p className="text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-medium text-slate-700 dark:text-slate-300">
                    {t(lang, 'appliesTo')}:
                  </span>{' '}
                  {formatTargetSummary(rule)}
                </p>

                <div className="flex flex-wrap items-center gap-1.5">
                  {rule.hiddenSections.map((sec) => (
                    <span
                      key={sec}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-950/40 border border-amber-200/70 dark:border-amber-900/60 text-[11px] font-medium text-amber-800 dark:text-amber-300"
                    >
                      <EyeOff className="w-3 h-3" />
                      <span>{getHiddenSectionLabel(lang, sec)}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  role="switch"
                  aria-checked={rule.active}
                  onClick={() => void handleToggleRuleActive(rule)}
                  className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                    rule.active
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-900'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      rule.active ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}
                  />
                  {rule.active ? t(lang, 'active') : t(lang, 'inactive')}
                </button>

                <button
                  type="button"
                  onClick={() => openEdit(rule)}
                  aria-label={t(lang, 'editVisibilityRule')}
                  className="p-2 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors cursor-pointer"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(rule)}
                  aria-label={t(lang, 'delete')}
                  className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        lang={lang}
        title={t(lang, 'confirmDeleteTitle')}
        message={
          deleteTarget
            ? `Delete visibility rule "${deleteTarget.name}"? Targeted employees will regain access to those sections.`
            : ''
        }
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
