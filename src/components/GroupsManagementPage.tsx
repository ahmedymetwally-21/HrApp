import React, { useMemo, useState } from 'react';
import { Layers, Pencil, Plus, Search, Trash2, Users } from 'lucide-react';
import { t } from '../i18n/translations';
import { Employee, EmployeeGroup, Language } from '../types/hr';
import { ConfirmDialog } from './ConfirmDialog';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface GroupsManagementPageProps {
  lang: Language;
  groups: EmployeeGroup[];
  employees: Employee[];
  onCreateGroup: (input: Omit<EmployeeGroup, 'id' | 'createdAt'>) => Promise<void>;
  onUpdateGroup: (id: string, patch: Partial<Omit<EmployeeGroup, 'id'>>) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
}

const PRESET_COLORS = [
  '#0D9488',
  '#2563EB',
  '#7C3AED',
  '#059669',
  '#D97706',
  '#DC2626',
  '#0891B2',
  '#4F46E5',
  '#DB2777',
  '#475569',
];

export const GroupsManagementPage: React.FC<GroupsManagementPageProps> = ({
  lang,
  groups,
  employees,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
}) => {
  const [subPage, setSubPage] = useState<'list' | 'form'>('list');
  const [editingGroup, setEditingGroup] = useState<EmployeeGroup | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#0D9488');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Delete confirmation state
  const [deleteTarget, setDeleteTarget] = useState<EmployeeGroup | null>(null);
  const [deleting, setDeleting] = useState(false);

  const memberCountByGroup = useMemo(() => {
    const map = new Map<string, number>();
    for (const emp of employees) {
      for (const gid of emp.groupIds ?? []) {
        map.set(gid, (map.get(gid) ?? 0) + 1);
      }
    }
    return map;
  }, [employees]);

  const filteredGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return groups;
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q)
    );
  }, [groups, searchQuery]);

  const openCreate = () => {
    setEditingGroup(null);
    setName('');
    setDescription('');
    setColor('#0D9488');
    setFormError(null);
    setSubPage('form');
  };

  const openEdit = (group: EmployeeGroup) => {
    setEditingGroup(group);
    setName(group.name);
    setDescription(group.description ?? '');
    setColor(group.color || '#0D9488');
    setFormError(null);
    setSubPage('form');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError(`${t(lang, 'groupName')} is required.`);
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      const payload = {
        name: trimmedName,
        description: description.trim() || undefined,
        color: color.trim() || '#0D9488',
      };
      if (editingGroup) {
        await onUpdateGroup(editingGroup.id, payload);
      } else {
        await onCreateGroup(payload);
      }
      setSubPage('list');
      setEditingGroup(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to save group.');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await onDeleteGroup(deleteTarget.id);
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
            { label: t(lang, 'employeeGroups'), onClick: () => setSubPage('list') },
            { label: editingGroup ? t(lang, 'editGroup') : t(lang, 'addGroup') },
          ]}
          title={editingGroup ? t(lang, 'editGroup') : t(lang, 'addGroup')}
          subtitle={t(lang, 'employeeGroupsSubtitle')}
          onBack={() => setSubPage('list')}
        />

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="max-w-2xl rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
        >
          {formError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-4 py-3 text-xs font-medium text-rose-700 dark:text-rose-300">
              {formError}
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'groupName')} *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Fleet Operations"
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              {t(lang, 'groupDescription')}
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional description of who belongs to this group..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500 resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              {t(lang, 'groupColor')}
            </label>
            <div className="flex flex-wrap items-center gap-2.5">
              {PRESET_COLORS.map((swatch) => {
                const selected = color.toLowerCase() === swatch.toLowerCase();
                return (
                  <button
                    key={swatch}
                    type="button"
                    onClick={() => setColor(swatch)}
                    aria-label={swatch}
                    className={`w-8 h-8 rounded-lg transition-transform cursor-pointer border-2 ${
                      selected
                        ? 'scale-110 border-slate-900 dark:border-white'
                        : 'border-transparent hover:scale-105'
                    }`}
                    style={{ backgroundColor: swatch }}
                  />
                );
              })}
              <div className="flex items-center gap-2 ms-2">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-8 h-8 rounded border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer"
                />
                <span className="text-xs font-mono text-slate-500 uppercase">{color}</span>
              </div>
            </div>
            {/* Live badge preview */}
            <div className="mt-3 flex items-center gap-2">
              <span
                className="inline-flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium border"
                style={{
                  borderColor: `${color}40`,
                  backgroundColor: `${color}15`,
                  color,
                }}
              >
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                {name.trim() || t(lang, 'groupName')}
              </span>
            </div>
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
            <Layers className="w-5 h-5 text-teal-600" />
            <span>{t(lang, 'employeeGroups')}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {t(lang, 'employeeGroupsSubtitle')}
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{t(lang, 'addGroup')}</span>
        </button>
      </div>

      {/* Search bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute start-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t(lang, 'search')}
            className="w-full ps-9 pe-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500/30 focus:border-teal-500"
          />
        </div>
      </div>

      {/* Groups Table / Cards */}
      {filteredGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center space-y-3">
          <Layers className="w-8 h-8 text-slate-300 dark:text-slate-600 mx-auto" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t(lang, 'noGroupsYet')}</p>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>{t(lang, 'addGroup')}</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredGroups.map((group) => {
            const count = memberCountByGroup.get(group.id) ?? 0;
            const badgeColor = group.color || '#0D9488';
            return (
              <div
                key={group.id}
                className="rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col justify-between gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 ring-4"
                        style={{
                          backgroundColor: badgeColor,
                          boxShadow: `0 0 0 3px ${badgeColor}20`,
                        }}
                      />
                      <h2 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {group.name}
                      </h2>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => openEdit(group)}
                        aria-label={t(lang, 'editGroup')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/40 transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteTarget(group)}
                        aria-label={t(lang, 'delete')}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed min-h-[32px]">
                    {group.description || '—'}
                  </p>
                </div>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                  <span className="inline-flex items-center gap-1.5 font-medium text-slate-600 dark:text-slate-300">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-mono tabular-nums">{count}</span>
                    <span className="text-slate-500">{t(lang, 'membersCount')}</span>
                  </span>
                  <span
                    className="px-2 py-0.5 rounded text-[11px] font-mono"
                    style={{
                      backgroundColor: `${badgeColor}15`,
                      color: badgeColor,
                    }}
                  >
                    {badgeColor}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        lang={lang}
        title={t(lang, 'confirmDeleteTitle')}
        message={
          deleteTarget
            ? `Delete employee group "${deleteTarget.name}"? Employees in this group will remain active.`
            : ''
        }
        busy={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
