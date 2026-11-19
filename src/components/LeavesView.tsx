import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  Clock,
  Paperclip,
  Plus,
  ShieldCheck,
  X,
  XCircle,
} from 'lucide-react';
import { Employee, LeaveRequest, LeaveStatus, LeaveType, UserRole } from '../types/hr';
import {
  calculateInclusiveDays,
  formatShortDate,
  validateLeaveSubmission,
} from '../utils/hrLogic';
import { Avatar } from './Avatar';

interface LeavesViewProps {
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  leaves: LeaveRequest[];
  onSubmitLeave: (
    input: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt'>
  ) => Promise<void>;
  onDecideLeave: (params: {
    leaveId: string;
    status: LeaveStatus.Approved | LeaveStatus.Rejected;
    comment: string;
  }) => Promise<void>;
}

const LEAVE_TYPES: LeaveType[] = [
  LeaveType.Annual,
  LeaveType.Sick,
  LeaveType.Emergency,
  LeaveType.Unpaid,
];

export const LeavesView: React.FC<LeavesViewProps> = ({
  currentUser,
  activeRole,
  employees,
  leaves,
  onSubmitLeave,
  onDecideLeave,
}) => {
  const canReview = activeRole === UserRole.Admin || activeRole === UserRole.Management;
  const isManagement = activeRole === UserRole.Management;

  const [statusFilter, setStatusFilter] = useState<'all' | LeaveStatus>('all');
  const [showRequestModal, setShowRequestModal] = useState(false);
  const [decisionTarget, setDecisionTarget] = useState<{
    leave: LeaveRequest;
    decision: LeaveStatus.Approved | LeaveStatus.Rejected;
  } | null>(null);
  const [decisionComment, setDecisionComment] = useState('');

  // New leave request form
  const todayIso = new Date().toISOString().slice(0, 10);
  const [formType, setFormType] = useState<LeaveType>(LeaveType.Annual);
  const [formStart, setFormStart] = useState(todayIso);
  const [formEnd, setFormEnd] = useState(todayIso);
  const [formReason, setFormReason] = useState('');
  const [formFileName, setFormFileName] = useState('');
  const [formFileDataUrl, setFormFileDataUrl] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const previewDays = calculateInclusiveDays(formStart, formEnd);

  const visibleLeaves = useMemo(() => {
    const base =
      activeRole === UserRole.Employee
        ? leaves.filter((l) => l.employeeId === currentUser.id)
        : leaves;
    if (statusFilter === 'all') return base;
    return base.filter((l) => l.status === statusFilter);
  }, [leaves, activeRole, currentUser.id, statusFilter]);

  const handleAttachment = (file: File | null) => {
    if (!file) return;
    if (file.size > 3 * 1024 * 1024) {
      setFormError('Attachment must be smaller than 3 MB.');
      return;
    }
    setFormError(null);
    const reader = new FileReader();
    reader.onload = () => {
      setFormFileName(file.name);
      setFormFileDataUrl(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.readAsDataURL(file);
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
      employeeId: currentUser.id,
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

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionTarget) return;
    await onDecideLeave({
      leaveId: decisionTarget.leave.id,
      status: decisionTarget.decision,
      comment: decisionComment,
    });
    setDecisionTarget(null);
    setDecisionComment('');
  };

  const lb = currentUser.leaveBalance;
  const balanceCards = [
    {
      label: 'Annual Leave',
      remaining: Math.max(0, lb.annualTotal - lb.annualUsed),
      total: lb.annualTotal,
      used: lb.annualUsed,
      accent: 'text-indigo-700',
    },
    {
      label: 'Sick Leave',
      remaining: Math.max(0, lb.sickTotal - lb.sickUsed),
      total: lb.sickTotal,
      used: lb.sickUsed,
      accent: 'text-emerald-700',
    },
    {
      label: 'Emergency Leave',
      remaining: Math.max(0, lb.emergencyTotal - lb.emergencyUsed),
      total: lb.emergencyTotal,
      used: lb.emergencyUsed,
      accent: 'text-amber-700',
    },
    {
      label: 'Unpaid Leave Taken',
      remaining: lb.unpaidUsed,
      total: null,
      used: lb.unpaidUsed,
      accent: 'text-slate-700',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">Leave Management</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            {canReview
              ? isManagement
                ? 'Review team leave balances, approve requests, or issue executive overrides.'
                : 'Review employee leave requests, add HR comments, and update balances automatically.'
              : 'Track your UAE leave balances and submit new leave applications.'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setFormError(null);
            setShowRequestModal(true);
          }}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          Request Leave
        </button>
      </div>

      {/* Personal Leave Balances */}
      <section aria-label="My Leave Balances" className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {balanceCards.map((card) => (
          <div key={card.label} className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5">
            <p className="text-xs font-medium text-slate-500">{card.label}</p>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className={`text-2xl font-bold font-mono tabular-nums ${card.accent}`}>
                {card.remaining}
              </span>
              <span className="text-xs text-slate-500">
                {card.total !== null ? `/ ${card.total} days left` : 'days used'}
              </span>
            </div>
            {card.total !== null && (
              <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-indigo-600 transition-all"
                  style={{ width: `${Math.min(100, Math.round((card.used / card.total) * 100))}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </section>

      {/* Requests Table / Cards */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              {canReview ? 'All Leave Requests' : 'My Leave Applications'}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              {visibleLeaves.length} request{visibleLeaves.length === 1 ? '' : 's'}
            </p>
          </div>

          <div className="inline-flex rounded-lg bg-slate-100 p-0.5 self-start sm:self-auto">
            {(['all', LeaveStatus.Pending, LeaveStatus.Approved, LeaveStatus.Rejected] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                    statusFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab === 'all' ? 'All' : tab}
                </button>
              )
            )}
          </div>
        </div>

        {visibleLeaves.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">
            No leave requests found in this view.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {visibleLeaves.map((req) => {
              const emp = empMap.get(req.employeeId);
              const showActions =
                canReview && (req.status === LeaveStatus.Pending || isManagement);
              return (
                <div
                  key={req.id}
                  className="p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 hover:bg-slate-50/60 transition-colors"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <Avatar src={emp?.avatarUrl} name={emp?.fullName ?? 'Employee'} size="md" />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">
                          {emp?.fullName ?? 'Unknown Employee'}
                        </span>
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className="text-xs font-medium text-indigo-700">{req.type}</span>
                        <span className="text-xs text-slate-400">&middot;</span>
                        <span className="text-xs font-mono tabular-nums text-slate-600">
                          {formatShortDate(req.startDate)} &rarr; {formatShortDate(req.endDate)} (
                          {req.days} day{req.days === 1 ? '' : 's'})
                        </span>
                      </div>

                      <p className="mt-1.5 text-sm text-slate-700">{req.reason}</p>

                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
                        {req.attachmentName && (
                          <span className="inline-flex items-center gap-1 text-indigo-700 font-medium">
                            <Paperclip className="w-3.5 h-3.5" />
                            {req.attachmentName}
                          </span>
                        )}
                        {req.reviewedBy && (
                          <span>
                            Reviewed by <strong className="text-slate-700">{req.reviewedBy}</strong>
                            {req.overriddenByManagement ? ' (Executive Override)' : ''}
                            {req.managerComment ? ` — "${req.managerComment}"` : ''}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between lg:justify-end gap-3 shrink-0">
                    {req.status === LeaveStatus.Pending && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md">
                        <Clock className="w-3.5 h-3.5" />
                        Pending
                      </span>
                    )}
                    {req.status === LeaveStatus.Approved && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approved
                      </span>
                    )}
                    {req.status === LeaveStatus.Rejected && (
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-md">
                        <XCircle className="w-3.5 h-3.5" />
                        Rejected
                      </span>
                    )}

                    {showActions && (
                      <div className="flex items-center gap-1.5">
                        {req.status !== LeaveStatus.Approved && (
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionComment('');
                              setDecisionTarget({ leave: req, decision: LeaveStatus.Approved });
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-medium hover:bg-emerald-700 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {req.status !== LeaveStatus.Pending ? (
                              <>
                                <ShieldCheck className="w-3.5 h-3.5" />
                                Override: Approve
                              </>
                            ) : (
                              'Approve'
                            )}
                          </button>
                        )}
                        {req.status !== LeaveStatus.Rejected && (
                          <button
                            type="button"
                            onClick={() => {
                              setDecisionComment('');
                              setDecisionTarget({ leave: req, decision: LeaveStatus.Rejected });
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-rose-200 bg-white text-rose-700 text-xs font-medium hover:bg-rose-50 transition-colors cursor-pointer whitespace-nowrap"
                          >
                            {req.status !== LeaveStatus.Pending ? 'Override: Reject' : 'Reject'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* New Leave Request Modal */}
      {showRequestModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="leave-modal-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 pb-4">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-700" />
                <h3 id="leave-modal-title" className="text-base font-semibold text-slate-900">
                  Submit Leave Request
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRequestModal(false)}
                aria-label="Close leave modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRequest} className="mt-4 space-y-4">
              {formError && (
                <p role="alert" className="text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">
                  {formError}
                </p>
              )}

              <div>
                <label htmlFor="leave-type" className="block text-xs font-medium text-slate-700 mb-1">
                  Leave Type
                </label>
                <select
                  id="leave-type"
                  value={formType}
                  onChange={(e) => setFormType(e.target.value as LeaveType)}
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
                >
                  {LEAVE_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="leave-start" className="block text-xs font-medium text-slate-700 mb-1">
                    Start Date
                  </label>
                  <input
                    id="leave-start"
                    type="date"
                    required
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label htmlFor="leave-end" className="block text-xs font-medium text-slate-700 mb-1">
                    End Date
                  </label>
                  <input
                    id="leave-end"
                    type="date"
                    required
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 flex items-center justify-between text-xs">
                <span className="text-slate-600">Calculated Leave Duration</span>
                <span className="font-mono font-semibold text-slate-900 tabular-nums">
                  {previewDays > 0 ? `${previewDays} calendar day${previewDays === 1 ? '' : 's'}` : 'Invalid range'}
                </span>
              </div>

              <div>
                <label htmlFor="leave-reason" className="block text-xs font-medium text-slate-700 mb-1">
                  Reason & Handover Notes
                </label>
                <textarea
                  id="leave-reason"
                  rows={3}
                  required
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Provide reason for leave and coverage arrangements..."
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label htmlFor="leave-file" className="block text-xs font-medium text-slate-700 mb-1">
                  Optional Document Attachment (e.g. Medical Certificate)
                </label>
                <input
                  id="leave-file"
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => handleAttachment(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-slate-200 file:text-xs file:font-medium file:bg-white file:text-slate-700 hover:file:bg-slate-50"
                />
                {formFileName && (
                  <p className="mt-1 text-xs text-indigo-700">Attached: {formFileName}</p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRequestModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 cursor-pointer"
                >
                  Submit Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Approve / Reject Confirmation Modal */}
      {decisionTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="decision-modal-title"
        >
          <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 id="decision-modal-title" className="text-base font-semibold text-slate-900">
              {decisionTarget.decision === LeaveStatus.Approved
                ? 'Approve Leave Request'
                : 'Reject Leave Request'}
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              {empMap.get(decisionTarget.leave.employeeId)?.fullName} &middot;{' '}
              {decisionTarget.leave.type} ({decisionTarget.leave.days} days)
            </p>

            <form onSubmit={handleConfirmDecision} className="mt-4 space-y-4">
              <div>
                <label htmlFor="mgr-comment" className="block text-xs font-medium text-slate-700 mb-1">
                  Manager Comment
                </label>
                <textarea
                  id="mgr-comment"
                  rows={3}
                  value={decisionComment}
                  onChange={(e) => setDecisionComment(e.target.value)}
                  placeholder={
                    decisionTarget.decision === LeaveStatus.Approved
                      ? 'Optional approval note...'
                      : 'Explain reason for rejection...'
                  }
                  className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setDecisionTarget(null)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-lg text-white text-sm font-medium cursor-pointer ${
                    decisionTarget.decision === LeaveStatus.Approved
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-rose-600 hover:bg-rose-700'
                  }`}
                >
                  Confirm {decisionTarget.decision}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
