import React, { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Clock,
  MessageSquarePlus,
  Paperclip,
  Plus,
  SkipForward,
  X,
  XCircle,
} from 'lucide-react';
import { getLeaveStatusLabel, getStepRoleLabel, t } from '../i18n/translations';
import { nativeBridge } from '../services/nativeBridge';
import {
  Employee,
  Language,
  LeaveRequest,
  LeaveStatus,
  LeaveType,
  UserRole,
} from '../types/hr';
import {
  calculateInclusiveDays,
  canRoleActOnLeaveStep,
  formatShortDate,
  validateLeaveSubmission,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';
import { SlideOverDrawer } from './SlideOverDrawer';

interface LeavesViewProps {
  lang: Language;
  currentUser: Employee;
  activeRole: UserRole;
  scopedEmployees: Employee[];
  leaves: LeaveRequest[];
  onSubmitLeave: (input: {
    type: LeaveType;
    startDate: string;
    endDate: string;
    days: number;
    reason: string;
    attachmentName?: string;
    attachmentDataUrl?: string;
  }) => Promise<void>;
  onDecideLeaveStep: (params: {
    leaveId: string;
    decision: 'approved' | 'rejected';
    remark: string;
  }) => Promise<void>;
  onAddCoManagerNote: (params: { leaveId: string; note: string }) => Promise<void>;
}

const LEAVE_TYPES: LeaveType[] = [
  LeaveType.Annual,
  LeaveType.Sick,
  LeaveType.Emergency,
  LeaveType.Unpaid,
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500';

export const LeavesView: React.FC<LeavesViewProps> = ({
  lang,
  currentUser,
  activeRole,
  scopedEmployees,
  leaves,
  onSubmitLeave,
  onDecideLeaveStep,
  onAddCoManagerNote,
}) => {
  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [selectedLeaveId, setSelectedLeaveId] = useState<string | null>(null);
  const [remark, setRemark] = useState('');
  const [coNote, setCoNote] = useState('');

  // Request Leave Modal
  const todayIso = new Date().toISOString().slice(0, 10);
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [formType, setFormType] = useState<LeaveType>(LeaveType.Annual);
  const [formStart, setFormStart] = useState(todayIso);
  const [formEnd, setFormEnd] = useState(todayIso);
  const [formReason, setFormReason] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileDataUrl, setFormFileDataUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const empMap = useMemo(() => new Map(scopedEmployees.map((e) => [e.id, e])), [scopedEmployees]);

  const visibleLeaves = useMemo(() => {
    return leaves.filter((l) => {
      if (!empMap.has(l.employeeId)) return false;
      if (statusFilter !== 'all' && l.status !== statusFilter) return false;
      return true;
    });
  }, [leaves, empMap, statusFilter]);

  const selectedLeave = leaves.find((l) => l.id === selectedLeaveId) ?? null;
  const selectedApplicant = selectedLeave ? empMap.get(selectedLeave.employeeId) ?? null : null;
  const canActSelected = selectedLeave
    ? canRoleActOnLeaveStep({
        leave: selectedLeave,
        actorRole: activeRole,
        actorEmployee: currentUser,
      })
    : false;
  const isCoManager = activeRole === UserRole.SectionCoManager;

  const previewDays = calculateInclusiveDays(formStart, formEnd);

  const handleAttachment = async (file: File | null) => {
    if (!file) return;
    setFormError(null);
    try {
      const res = await nativeBridge.readFileAsDocument(file);
      setFormFileName(res.fileName);
      setFormFileDataUrl(res.dataUrl);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to attach file.');
    }
  };

  const handleSubmitRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateLeaveSubmission({
      type: formType,
      startDate: formStart,
      endDate: formEnd,
      reason: formReason,
      balance: currentUser.leaveBalance,
    });
    if (!check.valid) {
      setFormError(check.error);
      return;
    }
    await onSubmitLeave({
      type: formType,
      startDate: formStart,
      endDate: formEnd,
      days: check.days,
      reason: formReason.trim(),
      attachmentName: formFileName || undefined,
      attachmentDataUrl: formFileDataUrl || undefined,
    });
    setFormReason('');
    setFormFileName('');
    setFormFileDataUrl('');
    setFormError(null);
    setShowRequestModal(false);
  };

  const handleDecision = async (decision: 'approved' | 'rejected') => {
    if (!selectedLeave) return;
    await onDecideLeaveStep({ leaveId: selectedLeave.id, decision, remark });
    setRemark('');
  };

  const handleCoNoteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLeave || !coNote.trim()) return;
    await onAddCoManagerNote({ leaveId: selectedLeave.id, note: coNote.trim() });
    setCoNote('');
  };

  const lb = currentUser.leaveBalance;

  return (
    <div className="space-y-5">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {t(lang, 'navLeaves')}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 font-mono tabular-nums">
            Annual {Math.max(0, lb.annualTotal - lb.annualUsed)}/{lb.annualTotal}d · Sick{' '}
            {Math.max(0, lb.sickTotal - lb.sickUsed)}/{lb.sickTotal}d · Emergency{' '}
            {Math.max(0, lb.emergencyTotal - lb.emergencyUsed)}/{lb.emergencyTotal}d
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowRequestModal(true);
          }}
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold transition-colors cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          {t(lang, 'requestLeave')}
        </button>
      </div>

      {/* Minimalist Leave List with Visual Step Tracker */}
      <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
            {visibleLeaves.length} request{visibleLeaves.length === 1 ? '' : 's'}
          </span>
          <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
            {(['all', LeaveStatus.Pending, LeaveStatus.Approved, LeaveStatus.Rejected] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md cursor-pointer ${
                    statusFilter === tab
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  {tab === 'all' ? 'All' : getLeaveStatusLabel(lang, tab)}
                </button>
              )
            )}
          </div>
        </div>

        {visibleLeaves.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            {t(lang, 'noRecords')}
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {visibleLeaves.map((req) => {
              const emp = empMap.get(req.employeeId);
              const dotClass =
                req.status === LeaveStatus.Approved
                  ? 'bg-emerald-500'
                  : req.status === LeaveStatus.Rejected
                    ? 'bg-rose-500'
                    : 'bg-amber-500';
              return (
                <button
                  key={req.id}
                  type="button"
                  onClick={() => {
                    setSelectedLeaveId(req.id);
                    setRemark('');
                    setCoNote('');
                  }}
                  className="w-full px-4 sm:px-5 py-3.5 flex items-center justify-between gap-4 text-start hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Staff'} size="sm" />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {emp?.fullName} ·{' '}
                        <span className="font-normal text-slate-600 dark:text-slate-300">
                          {req.type} ({req.days}d)
                        </span>
                      </p>
                      {/* Compact Step Progress Chain */}
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        {req.approvalSteps.map((step, i) => (
                          <React.Fragment key={step.stepOrder}>
                            {i > 0 && <span aria-hidden="true">→</span>}
                            <span
                              className={
                                step.status === 'approved'
                                  ? 'text-emerald-700 dark:text-emerald-400 font-medium'
                                  : step.status === 'rejected'
                                    ? 'text-rose-700 dark:text-rose-400 font-medium'
                                    : step.status === 'skipped'
                                      ? 'line-through text-slate-400'
                                      : i === req.currentStepIndex
                                        ? 'text-amber-700 dark:text-amber-400 font-semibold'
                                        : ''
                              }
                            >
                              {getStepRoleLabel(lang, step.role)}
                              {step.status === 'approved'
                                ? ' ✓'
                                : step.status === 'skipped'
                                  ? ' ↷'
                                  : i === req.currentStepIndex && req.status === LeaveStatus.Pending
                                    ? ' ⏳'
                                    : ''}
                            </span>
                          </React.Fragment>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap">
                      <span className={`w-2 h-2 rounded-full ${dotClass}`} />
                      {getLeaveStatusLabel(lang, req.status)}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400 rtl:rotate-180" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* Slide-Over Leave Detail & Approval Chain Drawer */}
      <SlideOverDrawer
        open={Boolean(selectedLeave)}
        onClose={() => setSelectedLeaveId(null)}
        title={selectedApplicant?.fullName ?? 'Leave Request'}
        subtitle={
          selectedLeave
            ? `${selectedLeave.type} · ${formatShortDate(selectedLeave.startDate)} → ${formatShortDate(
                selectedLeave.endDate
              )} (${selectedLeave.days}d)`
            : undefined
        }
      >
        {selectedLeave && (
          <div className="space-y-5">
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-4 space-y-2 text-xs">
              <p className="font-semibold text-slate-900 dark:text-white">Reason</p>
              <p className="text-slate-700 dark:text-slate-300">{selectedLeave.reason}</p>
              {selectedLeave.attachmentName && (
                <p className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-400 font-medium pt-1">
                  <Paperclip className="w-3.5 h-3.5" />
                  {selectedLeave.attachmentName}
                </p>
              )}
            </div>

            {/* Visual Step-by-Step Approval Progress Tracker */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                Approval Progress Chain
              </p>
              <div className="space-y-2">
                {selectedLeave.approvalSteps.map((step, idx) => {
                  const isCurrent =
                    selectedLeave.status === LeaveStatus.Pending &&
                    idx === selectedLeave.currentStepIndex;
                  return (
                    <div
                      key={step.stepOrder}
                      className={`rounded-xl border p-3.5 flex items-start justify-between gap-3 text-xs ${
                        isCurrent
                          ? 'border-amber-300 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                      }`}
                    >
                      <div className="flex items-start gap-2.5">
                        {step.status === 'approved' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 mt-0.5 shrink-0" />
                        ) : step.status === 'rejected' ? (
                          <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 mt-0.5 shrink-0" />
                        ) : step.status === 'skipped' ? (
                          <SkipForward className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                        )}
                        <div>
                          <p className="font-semibold text-slate-900 dark:text-white">
                            Step {step.stepOrder}: {getStepRoleLabel(lang, step.role)}
                          </p>
                          {step.actorName && (
                            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
                              {step.actorName}
                              {step.remark ? ` — "${step.remark}"` : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <span className="text-[11px] font-medium capitalize text-slate-500 dark:text-slate-400 shrink-0">
                        {step.status === 'skipped' ? t(lang, 'autoSkipped') : step.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Co-Manager Notes & Recommendations */}
            {(selectedLeave.coManagerNotes.length > 0 || isCoManager) && (
              <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-900 dark:text-white inline-flex items-center gap-1.5">
                  <MessageSquarePlus className="w-3.5 h-3.5 text-sky-600 dark:text-sky-400" />
                  Co-Manager Notes & Recommendations
                </p>
                {selectedLeave.coManagerNotes.map((n) => (
                  <div
                    key={n.id}
                    className="rounded-xl bg-sky-50/60 dark:bg-sky-950/30 border border-sky-200 dark:border-sky-900 p-3 text-xs"
                  >
                    <p className="font-semibold text-sky-900 dark:text-sky-200">{n.authorName}</p>
                    <p className="text-sky-800 dark:text-sky-300 mt-0.5">{n.note}</p>
                  </div>
                ))}
                {isCoManager && (
                  <form onSubmit={handleCoNoteSubmit} className="space-y-2">
                    <textarea
                      rows={2}
                      value={coNote}
                      onChange={(e) => setCoNote(e.target.value)}
                      placeholder="Add shift coverage note or recommendation for the Section Manager..."
                      className={INPUT_CLASS}
                    />
                    <button
                      type="submit"
                      className="px-3.5 py-2 rounded-xl bg-sky-700 hover:bg-sky-800 text-white text-xs font-semibold cursor-pointer"
                    >
                      {t(lang, 'addNote')}
                    </button>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Formal leave approvals are restricted to the Section Manager, HR, and Main Manager.
                    </p>
                  </form>
                )}
              </div>
            )}

            {/* Formal Step Approval Actions (Role-Gated) */}
            {canActSelected && (
              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
                <textarea
                  rows={2}
                  value={remark}
                  onChange={(e) => setRemark(e.target.value)}
                  placeholder="Optional approval / rejection remark..."
                  className={INPUT_CLASS}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => void handleDecision('approved')}
                    className="py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    {t(lang, 'approve')} Step
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDecision('rejected')}
                    className="py-2.5 rounded-xl border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-950/40 text-xs font-semibold cursor-pointer"
                  >
                    {t(lang, 'reject')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </SlideOverDrawer>

      {/* Request Leave Modal */}
      {showRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Submit Leave Request"
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                {t(lang, 'requestLeave')}
              </h3>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                aria-label="Close"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="mt-4 space-y-3.5">
              {activeRole === UserRole.SectionManager && (
                <div className="rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-200 dark:border-teal-900 px-3 py-2 text-xs text-teal-800 dark:text-teal-200">
                  Smart Auto-Skip active: Step 1 (Section Manager) will be skipped automatically and routed straight to HR → Main Manager.
                </div>
              )}

              {formError && (
                <p role="alert" className="text-xs text-rose-600 dark:text-rose-400">
                  {formError}
                </p>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Leave Type
                </label>
                <select
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as LeaveType)}
                  className={INPUT_CLASS}
                >
                  {LEAVE_TYPES.map((lt) => (
                    <option key={lt} value={lt}>
                      {lt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 flex justify-between text-xs">
                <span className="text-slate-500">Duration</span>
                <span className="font-mono font-semibold text-slate-900 dark:text-white">
                  {previewDays > 0 ? `${previewDays} days` : 'Invalid'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Reason
                </label>
                <textarea
                  rows={3}
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Briefly describe your leave reason..."
                  className={INPUT_CLASS}
                />
              </div>

              <div>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => void handleAttachment(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-500 file:me-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 dark:file:border-slate-700 file:bg-white dark:file:bg-slate-800 file:text-xs"
                />
                {formFileName && (
                  <p className="mt-1 text-xs text-teal-700 dark:text-teal-400">
                    Attached: {formFileName}
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium cursor-pointer"
                >
                  {t(lang, 'cancel')}
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold cursor-pointer"
                >
                  {t(lang, 'submit')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
