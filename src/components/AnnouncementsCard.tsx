import React, { useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Megaphone,
  Paperclip,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  Announcement,
  Company,
  Employee,
  EmployeeGroup,
  Project,
  UserRole,
} from '../types/hr';
import { formatShortDate, isAdminOrHRRole } from '../utils/hrLogic';

interface AnnouncementsCardProps {
  currentUser: Employee;
  activeRole: UserRole;
  announcements: Announcement[];
  companies: Company[];
  projects: Project[];
  groups: EmployeeGroup[];
  onCreateAnnouncement: (input: Omit<Announcement, 'id' | 'createdAt'>) => Promise<void>;
  onDeleteAnnouncement: (id: string) => Promise<void>;
  onUploadAttachment: (file: File) => Promise<{ url: string; fileName: string; fileType?: string }>;
}

const INPUT_CLASS =
  'w-full px-3 py-2 text-xs border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

function getPriorityBadge(priority: Announcement['priority']): {
  label: string;
  className: string;
} {
  if (priority === 'urgent') {
    return {
      label: 'Urgent',
      className:
        'bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300',
    };
  }
  if (priority === 'important') {
    return {
      label: 'Important',
      className:
        'bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300',
    };
  }
  return {
    label: 'Normal',
    className:
      'bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300',
  };
}

export const AnnouncementsCard: React.FC<AnnouncementsCardProps> = ({
  currentUser,
  activeRole,
  announcements,
  companies,
  projects,
  groups,
  onCreateAnnouncement,
  onDeleteAnnouncement,
  onUploadAttachment,
}) => {
  const canManage = isAdminOrHRRole(activeRole);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [composerOpen, setComposerOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<Announcement['priority']>('normal');
  const [targetType, setTargetType] = useState<Announcement['targetType']>('all');
  const [targetIds, setTargetIds] = useState<string[]>([]);
  const [attachment, setAttachment] = useState<{
    url: string;
    fileName: string;
    fileType?: string;
  } | null>(null);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const companyMap = useMemo(() => new Map(companies.map((c) => [c.id, c.name])), [companies]);
  const projectMap = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const groupMap = useMemo(() => new Map(groups.map((g) => [g.id, g.name])), [groups]);

  const visibleAnnouncements = useMemo(() => {
    const userCompanies = new Set(
      [currentUser.primaryCompanyId, ...(currentUser.sharedCompanyIds ?? [])].filter(Boolean)
    );
    const userProjects = new Set(currentUser.projectIds ?? []);
    const userGroups = new Set(currentUser.groupIds ?? []);

    return announcements
      .filter((ann) => {
        if (canManage) return true;
        if (ann.targetType === 'all') return true;
        if (ann.targetType === 'company') {
          return ann.targetIds.some((id) => userCompanies.has(id));
        }
        if (ann.targetType === 'project') {
          return ann.targetIds.some((id) => userProjects.has(id));
        }
        if (ann.targetType === 'group') {
          return ann.targetIds.some((id) => userGroups.has(id));
        }
        return false;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [announcements, canManage, currentUser]);

  const audienceOptions = useMemo(() => {
    if (targetType === 'company') {
      return companies.filter((c) => c.active).map((c) => ({ id: c.id, label: c.name }));
    }
    if (targetType === 'project') {
      return projects.filter((p) => p.active).map((p) => ({ id: p.id, label: `${p.name} (${p.code})` }));
    }
    if (targetType === 'group') {
      return groups.map((g) => ({ id: g.id, label: g.name }));
    }
    return [];
  }, [targetType, companies, projects, groups]);

  const getAudienceSummary = (ann: Announcement): string => {
    if (ann.targetType === 'all') return 'All Staff';
    if (ann.targetType === 'company') {
      const names = ann.targetIds.map((id) => companyMap.get(id)).filter(Boolean);
      return names.length > 0 ? `Companies: ${names.join(', ')}` : 'Selected Companies';
    }
    if (ann.targetType === 'project') {
      const names = ann.targetIds.map((id) => projectMap.get(id)).filter(Boolean);
      return names.length > 0 ? `Projects: ${names.join(', ')}` : 'Selected Projects';
    }
    const names = ann.targetIds.map((id) => groupMap.get(id)).filter(Boolean);
    return names.length > 0 ? `Groups: ${names.join(', ')}` : 'Selected Groups';
  };

  const toggleTargetId = (id: string) => {
    setTargetIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFormError(null);
    setUploadingFile(true);
    try {
      const uploaded = await onUploadAttachment(file);
      setAttachment(uploaded);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to upload attachment.');
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const resetComposer = () => {
    setTitle('');
    setBody('');
    setPriority('normal');
    setTargetType('all');
    setTargetIds([]);
    setAttachment(null);
    setFormError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) {
      setFormError('Title and message are required.');
      return;
    }
    if (targetType !== 'all' && targetIds.length === 0) {
      setFormError(`Select at least one ${targetType} audience target.`);
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await onCreateAnnouncement({
        title: title.trim(),
        body: body.trim(),
        priority,
        targetType,
        targetIds: targetType === 'all' ? [] : targetIds,
        attachmentUrl: attachment?.url,
        attachmentName: attachment?.fileName,
        attachmentType: attachment?.fileType,
        createdById: currentUser.id,
        createdByName: currentUser.fullName,
      });
      resetComposer();
      setComposerOpen(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to post announcement.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await onDeleteAnnouncement(id);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-teal-600 dark:text-teal-400 shrink-0" />
          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
            Company Announcements
          </h3>
          {visibleAnnouncements.length > 0 && (
            <span className="text-[11px] font-mono text-slate-400">
              ({visibleAnnouncements.length})
            </span>
          )}
        </div>

        {canManage && (
          <button
            type="button"
            onClick={() => {
              setComposerOpen((prev) => !prev);
              setFormError(null);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer transition-colors"
          >
            {composerOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
            <span>{composerOpen ? 'Close Composer' : '+ Post Announcement'}</span>
          </button>
        )}
      </div>

      {/* Inline Announcement Composer for HR / Main Manager */}
      {canManage && composerOpen && (
        <form
          onSubmit={handleSubmit}
          className="p-5 bg-slate-50/70 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 space-y-4"
        >
          {formError && (
            <div
              role="alert"
              className="rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Title *
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., UAE Public Holiday Notice or Policy Update"
                className={INPUT_CLASS}
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as Announcement['priority'])}
                className={INPUT_CLASS}
              >
                <option value="normal">Normal</option>
                <option value="important">Important</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">
              Audience Target
            </label>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { id: 'all', label: 'All Staff' },
                  { id: 'company', label: 'Companies' },
                  { id: 'project', label: 'Projects' },
                  { id: 'group', label: 'Groups' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setTargetType(opt.id);
                    setTargetIds([]);
                  }}
                  className={`px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                    targetType === opt.id
                      ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200'
                      : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {targetType !== 'all' && (
              <div className="pt-1 flex flex-wrap gap-2">
                {audienceOptions.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No {targetType} items available.</p>
                ) : (
                  audienceOptions.map((opt) => {
                    const checked = targetIds.includes(opt.id);
                    return (
                      <label
                        key={opt.id}
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs cursor-pointer ${
                          checked
                            ? 'border-teal-600 bg-teal-50 dark:bg-teal-950/50 text-teal-800 dark:text-teal-200 font-medium'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleTargetId(opt.id)}
                          className="rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                        />
                        <span>{opt.label}</span>
                      </label>
                    );
                  })
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1">
              Message *
            </label>
            <textarea
              rows={3}
              required
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write the announcement details for employees..."
              className={INPUT_CLASS}
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer">
                <Upload className="w-3.5 h-3.5 text-teal-600" />
                <span>{uploadingFile ? 'Uploading...' : 'Attach File'}</span>
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => void handleFilePick(e)}
                  className="sr-only"
                />
              </label>
              {attachment && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-800 text-xs text-teal-800 dark:text-teal-200">
                  <Paperclip className="w-3 h-3" />
                  <span className="max-w-[180px] truncate">{attachment.fileName}</span>
                  <button
                    type="button"
                    onClick={() => setAttachment(null)}
                    aria-label="Remove attachment"
                    className="hover:text-rose-600 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  resetComposer();
                  setComposerOpen(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingFile}
                className="px-4 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Posting...' : 'Publish Announcement'}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Announcements Feed */}
      {visibleAnnouncements.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
          No company announcements posted at the moment.
        </div>
      ) : (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {visibleAnnouncements.map((ann) => {
            const badge = getPriorityBadge(ann.priority);
            return (
              <div key={ann.id} className="px-5 py-4 space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold ${badge.className}`}
                      >
                        {badge.label}
                      </span>
                      <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                        {ann.title}
                      </h4>
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Posted by <strong className="font-medium text-slate-700 dark:text-slate-300">{ann.createdByName}</strong> ·{' '}
                      {formatShortDate(ann.createdAt)} · {getAudienceSummary(ann)}
                    </p>
                  </div>

                  {canManage && (
                    <button
                      type="button"
                      disabled={deletingId === ann.id}
                      onClick={() => void handleDelete(ann.id)}
                      aria-label={`Delete announcement ${ann.title}`}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer shrink-0 disabled:opacity-40"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <p className="text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                  {ann.body}
                </p>

                {ann.attachmentUrl && (
                  <div className="pt-1">
                    <a
                      href={ann.attachmentUrl}
                      download={ann.attachmentName || 'attachment'}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 text-xs font-medium text-teal-800 dark:text-teal-200 hover:bg-teal-100 dark:hover:bg-teal-950/70 transition-colors"
                    >
                      <Paperclip className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate max-w-[260px]">
                        {ann.attachmentName || 'Download Attachment'}
                      </span>
                    </a>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
