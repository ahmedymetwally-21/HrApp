import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Download,
  FileSpreadsheet,
  History,
  Moon,
  RefreshCw,
  Search,
  UploadCloud,
  X,
} from 'lucide-react';
import { api } from '../services/api';
import {
  Employee,
  RosterBulkUploadResult,
  RosterEntry,
  RosterUploadBatch,
  UserRole,
} from '../types/hr';
import { isAdminOrHRRole } from '../utils/hrLogic';

interface MonthlyRosterPageProps {
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  onRosterUploaded?: () => Promise<void> | void;
}

type RosterTab = 'view' | 'upload' | 'history';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

function getCurrentYearMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function getMonthDates(yearMonth: string): { date: string; day: string; weekday: string }[] {
  const parts = yearMonth.split('-');
  if (parts.length !== 2) return [];
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) return [];

  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const result: { date: string; day: string; weekday: string }[] = [];

  for (let d = 1; d <= totalDays; d++) {
    const dayStr = String(d).padStart(2, '0');
    const dateStr = `${yearMonth}-${dayStr}`;
    const dt = new Date(Date.UTC(year, month - 1, d));
    result.push({
      date: dateStr,
      day: dayStr,
      weekday: weekdays[dt.getUTCDay()],
    });
  }
  return result;
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function downloadFailedRowsWorkbook(failedRows: Record<string, unknown>[], fileName: string) {
  if (failedRows.length === 0) return;
  const worksheet = XLSX.utils.json_to_sheet(failedRows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Failed Rows');
  XLSX.writeFile(workbook, fileName);
}

export const MonthlyRosterPage: React.FC<MonthlyRosterPageProps> = ({
  currentUser,
  activeRole,
  employees,
  onRosterUploaded,
}) => {
  const canManageRoster = isAdminOrHRRole(activeRole);
  const [activeTab, setActiveTab] = useState<RosterTab>('view');

  // Tab 1: Monthly Roster View state
  const [selectedMonth, setSelectedMonth] = useState<string>(getCurrentYearMonth);
  const [searchQuery, setSearchQuery] = useState('');
  const [entries, setEntries] = useState<RosterEntry[]>([]);
  const [loadingEntries, setLoadingEntries] = useState(false);
  const [entriesError, setEntriesError] = useState<string | null>(null);

  // Tab 2: Bulk Upload state
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploadMonth, setUploadMonth] = useState<string>(getCurrentYearMonth);
  const [detectedMonth, setDetectedMonth] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadResult, setUploadResult] = useState<RosterBulkUploadResult | null>(null);

  // Tab 3: Upload History state
  const [historyBatches, setHistoryBatches] = useState<RosterUploadBatch[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [expandedBatchIds, setExpandedBatchIds] = useState<Record<string, boolean>>({});

  // Keep non-HR/non-Main-Manager users on Tab 1
  useEffect(() => {
    if (!canManageRoster && activeTab !== 'view') {
      setActiveTab('view');
    }
  }, [canManageRoster, activeTab]);

  const loadRosterEntries = useCallback(async () => {
    setLoadingEntries(true);
    setEntriesError(null);
    try {
      const list = await api.rosters.list({
        month: selectedMonth,
        employeeId: canManageRoster ? undefined : currentUser.id,
      });
      setEntries(list);
    } catch (err) {
      setEntriesError(err instanceof Error ? err.message : 'Unable to load monthly roster.');
    } finally {
      setLoadingEntries(false);
    }
  }, [selectedMonth, canManageRoster, currentUser.id]);

  const loadHistory = useCallback(async () => {
    if (!canManageRoster) return;
    setLoadingHistory(true);
    setHistoryError(null);
    try {
      const list = await api.rosters.history();
      setHistoryBatches(list);
    } catch (err) {
      setHistoryError(err instanceof Error ? err.message : 'Unable to load upload history.');
    } finally {
      setLoadingHistory(false);
    }
  }, [canManageRoster]);

  useEffect(() => {
    if (activeTab === 'view') {
      void loadRosterEntries();
    } else if (activeTab === 'history' && canManageRoster) {
      void loadHistory();
    }
  }, [activeTab, loadRosterEntries, loadHistory, canManageRoster]);

  const monthDates = useMemo(() => getMonthDates(selectedMonth), [selectedMonth]);

  // Build row list & lookup map for the calendar grid
  const { visibleEmployees, entryLookup, summaryCounts } = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const lookup = new Map<string, RosterEntry>();
    const rosterEmployeeMap = new Map<string, { id: string; employeeCode: string; fullName: string }>();

    for (const entry of entries) {
      lookup.set(`${entry.userId}::${entry.date}`, entry);
      if (!rosterEmployeeMap.has(entry.userId)) {
        rosterEmployeeMap.set(entry.userId, {
          id: entry.userId,
          employeeCode: entry.employeeCode,
          fullName: entry.employeeName || entry.employeeCode || entry.userId,
        });
      }
    }

    let baseEmployees: { id: string; employeeCode: string; fullName: string }[];
    if (!canManageRoster) {
      baseEmployees = [
        {
          id: currentUser.id,
          employeeCode: currentUser.employeeCode,
          fullName: currentUser.fullName,
        },
      ];
    } else {
      const merged = new Map<string, { id: string; employeeCode: string; fullName: string }>();
      for (const emp of employees) {
        if (emp.active) {
          merged.set(emp.id, {
            id: emp.id,
            employeeCode: emp.employeeCode,
            fullName: emp.fullName,
          });
        }
      }
      for (const [uid, info] of rosterEmployeeMap.entries()) {
        if (!merged.has(uid)) {
          merged.set(uid, info);
        }
      }
      baseEmployees = Array.from(merged.values()).sort((a, b) =>
        a.fullName.localeCompare(b.fullName)
      );
    }

    const filteredEmployees =
      canManageRoster && q
        ? baseEmployees.filter(
            (emp) =>
              emp.fullName.toLowerCase().includes(q) ||
              emp.employeeCode.toLowerCase().includes(q)
          )
        : baseEmployees;

    const visibleIds = new Set(filteredEmployees.map((e) => e.id));
    let shifts = 0;
    let off = 0;
    let leave = 0;

    for (const entry of entries) {
      if (!visibleIds.has(entry.userId)) continue;
      if (entry.status === 'shift') shifts += 1;
      else if (entry.status === 'off') off += 1;
      else if (entry.status === 'leave') leave += 1;
    }

    return {
      visibleEmployees: filteredEmployees,
      entryLookup: lookup,
      summaryCounts: { shifts, off, leave },
    };
  }, [entries, employees, currentUser, canManageRoster, searchQuery]);

  // Tab 2: Download Template (.xlsx)
  const handleDownloadTemplate = () => {
    const templateDates = getMonthDates(uploadMonth);
    const headers = ['Employee ID', 'Employee Name', ...templateDates.map((d) => d.date)];
    const activeEmployees = employees
      .filter((e) => e.active)
      .sort((a, b) => a.employeeCode.localeCompare(b.employeeCode));

    const sampleRowValues = (idx: number, dateIdx: number): string => {
      if (idx !== 0) return '';
      if (dateIdx === 0) return '08:00,22:00';
      if (dateIdx === 1) return '22:00,06:00';
      if (dateIdx === 2) return 'OFF';
      if (dateIdx === 3) return 'Leave';
      return '';
    };

    const rows: Record<string, string>[] =
      activeEmployees.length > 0
        ? activeEmployees.map((emp, idx) => {
            const row: Record<string, string> = {
              'Employee ID': emp.employeeCode,
              'Employee Name': emp.fullName,
            };
            templateDates.forEach((d, dIdx) => {
              row[d.date] = sampleRowValues(idx, dIdx);
            });
            return row;
          })
        : [
            (() => {
              const row: Record<string, string> = {
                'Employee ID': 'EMP-001',
                'Employee Name': 'Sample Employee',
              };
              templateDates.forEach((d, dIdx) => {
                row[d.date] = sampleRowValues(0, dIdx);
              });
              return row;
            })(),
          ];

    const rosterSheet = XLSX.utils.json_to_sheet(rows, { header: headers });
    rosterSheet['!cols'] = headers.map((h, i) => ({
      wch: i === 0 ? 16 : i === 1 ? 26 : Math.max(h.length + 2, 13),
    }));

    const guideRows = [
      {
        Field: 'Employee ID',
        AcceptedFormat: 'Existing employee code (e.g. EMP-101)',
        Example: activeEmployees[0]?.employeeCode ?? 'EMP-101',
        Notes: 'Required. Must match an employee code in the system.',
      },
      {
        Field: 'Employee Name',
        AcceptedFormat: 'Text (Reference only)',
        Example: activeEmployees[0]?.fullName ?? 'Omar Al Mansoor',
        Notes: 'Helpful reference column when filling out shifts.',
      },
      {
        Field: 'YYYY-MM-DD (Regular Shift)',
        AcceptedFormat: 'HH:MM,HH:MM (24-hour format)',
        Example: '08:00,22:00',
        Notes: 'Standard day shift from 08:00 to 22:00.',
      },
      {
        Field: 'YYYY-MM-DD (Overnight Shift)',
        AcceptedFormat: 'HH:MM,HH:MM where End <= Start',
        Example: '22:00,06:00',
        Notes: 'Automatically marked as an Overnight shift.',
      },
      {
        Field: 'YYYY-MM-DD (Rest Day)',
        AcceptedFormat: 'OFF',
        Example: 'OFF',
        Notes: 'Marks the employee as scheduled OFF for that date.',
      },
      {
        Field: 'YYYY-MM-DD (Scheduled Leave)',
        AcceptedFormat: 'Leave',
        Example: 'Leave',
        Notes: 'Blocks Clock-In and Clock-Out on that date.',
      },
      {
        Field: 'YYYY-MM-DD (Blank Cell)',
        AcceptedFormat: 'Empty',
        Example: '',
        Notes: 'Skipped during import without modifying existing entries.',
      },
    ];
    const guideSheet = XLSX.utils.json_to_sheet(guideRows);
    guideSheet['!cols'] = [{ wch: 28 }, { wch: 30 }, { wch: 22 }, { wch: 52 }];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, rosterSheet, 'Monthly Roster');
    XLSX.utils.book_append_sheet(workbook, guideSheet, 'Format Guide');
    XLSX.writeFile(workbook, `yaldi-hr-roster-template-${uploadMonth}.xlsx`);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setUploadError(null);
    setUploadResult(null);

    if (file.size > MAX_FILE_BYTES) {
      setParseError('File exceeds the 5 MB upload limit.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setParseError('The uploaded file contains no worksheets.');
        setSelectedFileName(null);
        setParsedRows([]);
        setDetectedMonth(null);
        return;
      }

      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: false,
      });

      if (rows.length === 0) {
        setParseError('No employee rows found in the first sheet.');
        setSelectedFileName(file.name);
        setParsedRows([]);
        setDetectedMonth(null);
        return;
      }

      const headerKeys = Object.keys(rows[0] ?? {});
      const firstDateHeader = headerKeys.find((key) => /^\d{4}-\d{2}-\d{2}$/.test(key.trim()));
      if (firstDateHeader) {
        const autoMonth = firstDateHeader.trim().slice(0, 7);
        setDetectedMonth(autoMonth);
        setUploadMonth(autoMonth);
      } else {
        setDetectedMonth(null);
      }

      setSelectedFileName(file.name);
      setParsedRows(rows);
    } catch {
      setParseError('Unable to read this file. Please upload a valid .xlsx, .xls, or .csv file.');
      setSelectedFileName(null);
      setParsedRows([]);
      setDetectedMonth(null);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearUpload = () => {
    setSelectedFileName(null);
    setParsedRows([]);
    setDetectedMonth(null);
    setParseError(null);
    setUploadError(null);
    setUploadResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImportRoster = async () => {
    if (!selectedFileName || parsedRows.length === 0) return;
    setUploading(true);
    setUploadError(null);
    try {
      const result = await api.rosters.bulkUpload({
        fileName: selectedFileName,
        month: uploadMonth,
        rows: parsedRows,
      });
      setUploadResult(result);
      setSelectedMonth(result.month || uploadMonth);
      await onRosterUploaded?.();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Failed to import roster.');
    } finally {
      setUploading(false);
    }
  };

  const toggleBatchErrors = (batchId: string) => {
    setExpandedBatchIds((prev) => ({ ...prev, [batchId]: !prev[batchId] }));
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Page Header & Tab Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/80 dark:border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900 dark:text-white flex items-center gap-2.5">
            <CalendarDays className="w-6 h-6 text-teal-600 dark:text-teal-400 shrink-0" />
            <span>{canManageRoster ? 'Monthly Roster Management' : 'My Monthly Roster'}</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            {canManageRoster
              ? 'View monthly employee shift schedules, upload bulk Excel rosters, and audit import batches.'
              : 'Review your scheduled shifts, overnight duties, OFF days, and rostered leave days.'}
          </p>
        </div>

        {/* Navigation Tabs */}
        <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setActiveTab('view')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
              activeTab === 'view'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <CalendarDays className="w-3.5 h-3.5" />
            <span>{canManageRoster ? 'Monthly Roster View' : 'My Monthly Roster'}</span>
          </button>

          {canManageRoster && (
            <>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'upload'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <UploadCloud className="w-3.5 h-3.5" />
                <span>Bulk Upload</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  activeTab === 'history'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Upload History</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* ====================================================================
          TAB 1: MONTHLY ROSTER VIEW / MY MONTHLY ROSTER
         ==================================================================== */}
      {activeTab === 'view' && (
        <div className="space-y-5">
          {/* Filters & Summary Strip */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
            <div className="lg:col-span-6 flex flex-wrap items-center gap-3">
              <div>
                <label
                  htmlFor="roster-month-picker"
                  className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                >
                  Month
                </label>
                <input
                  id="roster-month-picker"
                  type="month"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value || getCurrentYearMonth())}
                  className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                />
              </div>

              {canManageRoster && (
                <div className="flex-1 min-w-[210px] max-w-xs">
                  <label
                    htmlFor="roster-employee-search"
                    className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Search Employee
                  </label>
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      id="roster-employee-search"
                      type="search"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Name or Employee ID..."
                      className="w-full pl-8 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
                    />
                  </div>
                </div>
              )}

              <div className="self-end">
                <button
                  type="button"
                  onClick={() => void loadRosterEntries()}
                  disabled={loadingEntries}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingEntries ? 'animate-spin' : ''}`} />
                  <span>Refresh</span>
                </button>
              </div>
            </div>

            {/* Summary Counters */}
            <div className="lg:col-span-6 grid grid-cols-3 gap-3">
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Shifts</p>
                <p className="mt-1 text-lg font-bold font-mono tabular-nums text-teal-700 dark:text-teal-300">
                  {summaryCounts.shifts}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">OFF</p>
                <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-700 dark:text-slate-200">
                  {summaryCounts.off}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Leave</p>
                <p className="mt-1 text-lg font-bold font-mono tabular-nums text-amber-700 dark:text-amber-400">
                  {summaryCounts.leave}
                </p>
              </div>
            </div>
          </div>

          {entriesError && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{entriesError}</span>
            </div>
          )}

          {/* Horizontal-Scrolling Calendar Grid with Sticky Employee Column */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {loadingEntries ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                Loading roster schedule for {selectedMonth}...
              </div>
            ) : visibleEmployees.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
                No employees match the current filter.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                      <th className="sticky left-0 z-20 bg-slate-50 dark:bg-slate-950 px-4 py-3 text-left font-semibold text-slate-700 dark:text-slate-200 min-w-[200px] border-r border-slate-200 dark:border-slate-800">
                        Employee
                      </th>
                      {monthDates.map((d) => (
                        <th
                          key={d.date}
                          className="px-2.5 py-2.5 text-center font-semibold text-slate-700 dark:text-slate-200 min-w-[104px] border-r border-slate-100 dark:border-slate-800/80 last:border-r-0"
                        >
                          <div className="font-mono tabular-nums text-xs">{d.day}</div>
                          <div className="text-[10px] font-normal text-slate-400">{d.weekday}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {visibleEmployees.map((emp) => (
                      <tr
                        key={emp.id}
                        className="hover:bg-slate-50/60 dark:hover:bg-slate-800/30 transition-colors"
                      >
                        <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 border-r border-slate-200 dark:border-slate-800">
                          <div className="font-semibold text-slate-900 dark:text-white truncate max-w-[180px]">
                            {emp.fullName}
                          </div>
                          <div className="text-[11px] font-mono text-slate-400">
                            {emp.employeeCode}
                          </div>
                        </td>
                        {monthDates.map((d) => {
                          const cell = entryLookup.get(`${emp.id}::${d.date}`);
                          if (!cell) {
                            return (
                              <td
                                key={d.date}
                                className="px-2 py-2.5 text-center text-slate-300 dark:text-slate-700 border-r border-slate-100 dark:border-slate-800/70 last:border-r-0"
                              >
                                —
                              </td>
                            );
                          }

                          if (cell.status === 'off') {
                            return (
                              <td
                                key={d.date}
                                className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800/70 last:border-r-0"
                              >
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-semibold">
                                  OFF
                                </span>
                              </td>
                            );
                          }

                          if (cell.status === 'leave') {
                            return (
                              <td
                                key={d.date}
                                className="px-2 py-2.5 text-center border-r border-slate-100 dark:border-slate-800/70 last:border-r-0"
                              >
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                                  Leave
                                </span>
                              </td>
                            );
                          }

                          return (
                            <td
                              key={d.date}
                              className="px-2 py-2 text-center border-r border-slate-100 dark:border-slate-800/70 last:border-r-0"
                            >
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className="font-mono tabular-nums text-[11px] font-semibold text-teal-800 dark:text-teal-300 whitespace-nowrap">
                                  {cell.shiftStart}–{cell.shiftEnd}
                                </span>
                                {cell.isOvernight && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                                    <Moon className="w-2.5 h-2.5" />
                                    Overnight
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* ====================================================================
          TAB 2: BULK UPLOAD (HR / MAIN MANAGER ONLY)
         ==================================================================== */}
      {activeTab === 'upload' && canManageRoster && (
        <div className="space-y-6">
          {/* Step 1: Download Template */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[11px] font-semibold">
                  Step 1
                </span>
                <h2 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white">
                  Choose Target Month &amp; Download Excel Template
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Generates columns for Employee ID, Employee Name, and every YYYY-MM-DD date in the
                  chosen month, plus a Format Guide sheet.
                </p>
              </div>

              <div className="flex flex-wrap items-end gap-3 shrink-0">
                <div>
                  <label
                    htmlFor="roster-upload-month"
                    className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1"
                  >
                    Target Month
                  </label>
                  <input
                    id="roster-upload-month"
                    type="month"
                    value={uploadMonth}
                    onChange={(e) => setUploadMonth(e.target.value || getCurrentYearMonth())}
                    className="px-3 py-2 text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleDownloadTemplate}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Template (.xlsx)</span>
                </button>
              </div>
            </div>
          </section>

          {/* Step 2: Upload & Import */}
          <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
            <div>
              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-teal-50 dark:bg-teal-950/60 text-teal-700 dark:text-teal-300 text-[11px] font-semibold">
                Step 2
              </span>
              <h2 className="mt-1.5 text-base font-semibold text-slate-900 dark:text-white">
                Upload Completed Roster File
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Supported formats: .xlsx, .xls, and .csv. Target month is auto-detected from
                YYYY-MM-DD date column headers.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <label
                htmlFor="roster-file-input"
                className="flex-1 flex items-center justify-between gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-teal-500 dark:hover:border-teal-600 bg-slate-50/60 dark:bg-slate-950/60 cursor-pointer transition-colors"
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <FileSpreadsheet className="w-5 h-5 text-teal-600 dark:text-teal-400 shrink-0" />
                  <span className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">
                    {selectedFileName ?? 'Click to select .xlsx, .xls, or .csv roster file'}
                  </span>
                </span>
                <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 shrink-0">
                  Browse
                </span>
                <input
                  ref={fileInputRef}
                  id="roster-file-input"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={(e) => void handleFileChange(e)}
                  className="sr-only"
                />
              </label>

              {selectedFileName && (
                <button
                  type="button"
                  onClick={handleClearUpload}
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                  <span>Clear</span>
                </button>
              )}

              <button
                type="button"
                disabled={uploading || parsedRows.length === 0}
                onClick={() => void handleImportRoster()}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <UploadCloud className="w-4 h-4" />
                <span>{uploading ? 'Importing...' : 'Import Roster'}</span>
              </button>
            </div>

            {selectedFileName && parsedRows.length > 0 && (
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-4 py-3 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-4">
                <span>
                  File: <strong className="text-slate-900 dark:text-white">{selectedFileName}</strong>
                </span>
                <span>
                  Rows detected:{' '}
                  <strong className="font-mono text-slate-900 dark:text-white">
                    {parsedRows.length}
                  </strong>
                </span>
                <span>
                  Target Month:{' '}
                  <strong className="font-mono text-teal-700 dark:text-teal-300">
                    {uploadMonth}
                  </strong>
                  {detectedMonth ? ' (auto-detected from date headers)' : ''}
                </span>
              </div>
            )}

            {parseError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{parseError}</span>
              </div>
            )}

            {uploadError && (
              <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{uploadError}</span>
              </div>
            )}
          </section>

          {/* Immediate Upload Summary Card & Inline Error Table */}
          {uploadResult && (
            <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sm:p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2
                    className={`w-5 h-5 ${
                      uploadResult.failedCount === 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  />
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Upload Summary ({uploadResult.month})
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      Batch ID: <span className="font-mono">{uploadResult.batchId}</span>
                    </p>
                  </div>
                </div>

                {uploadResult.failedRows.length > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      downloadFailedRowsWorkbook(
                        uploadResult.failedRows,
                        `failed-roster-rows-${uploadResult.month}.xlsx`
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-xs font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Failed Rows (.xlsx)</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-4 py-3">
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                    Total
                  </p>
                  <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                    {uploadResult.totalRows}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 px-4 py-3">
                  <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    Succeeded
                  </p>
                  <p className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                    {uploadResult.successCount}
                  </p>
                </div>
                <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 px-4 py-3">
                  <p className="text-[11px] font-medium text-rose-700 dark:text-rose-400">
                    Failed
                  </p>
                  <p className="mt-1 text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300">
                    {uploadResult.failedCount}
                  </p>
                </div>
              </div>

              {uploadResult.errors.length > 0 && (
                <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                      <tr>
                        <th className="px-3.5 py-2.5 font-semibold">Row</th>
                        <th className="px-3.5 py-2.5 font-semibold">Employee ID</th>
                        <th className="px-3.5 py-2.5 font-semibold">Employee Name</th>
                        <th className="px-3.5 py-2.5 font-semibold">Error</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {uploadResult.errors.map((err, idx) => (
                        <tr key={`${err.row}-${err.employeeCode}-${idx}`}>
                          <td className="px-3.5 py-2.5 font-mono text-slate-700 dark:text-slate-300">
                            {err.row}
                          </td>
                          <td className="px-3.5 py-2.5 font-mono text-slate-900 dark:text-white">
                            {err.employeeCode || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-slate-700 dark:text-slate-300">
                            {err.employeeName || '—'}
                          </td>
                          <td className="px-3.5 py-2.5 text-rose-700 dark:text-rose-300">
                            {err.error}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 3: UPLOAD HISTORY (HR / MAIN MANAGER ONLY)
         ==================================================================== */}
      {activeTab === 'history' && canManageRoster && (
        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                Roster Upload History
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Audit past bulk roster imports, inspect row-level errors, and download failed rows.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void loadHistory()}
              disabled={loadingHistory}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {historyError && (
            <div className="m-4 rounded-xl border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 p-3.5 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{historyError}</span>
            </div>
          )}

          {loadingHistory ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              Loading upload history...
            </div>
          ) : historyBatches.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-500 dark:text-slate-400">
              No roster uploads recorded yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3 font-semibold">Uploaded At</th>
                    <th className="px-4 py-3 font-semibold">Uploaded By</th>
                    <th className="px-4 py-3 font-semibold">File Name</th>
                    <th className="px-4 py-3 font-semibold">Month</th>
                    <th className="px-4 py-3 font-semibold text-right">Total</th>
                    <th className="px-4 py-3 font-semibold text-right">Succeeded</th>
                    <th className="px-4 py-3 font-semibold text-right">Failed</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {historyBatches.map((batch) => {
                    const isExpanded = Boolean(expandedBatchIds[batch.id]);
                    return (
                      <React.Fragment key={batch.id}>
                        <tr className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                          <td className="px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-300">
                            {formatDateTime(batch.createdAt)}
                          </td>
                          <td className="px-4 py-3 font-medium text-slate-900 dark:text-white">
                            {batch.uploadedByName}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                            {batch.fileName}
                          </td>
                          <td className="px-4 py-3 font-mono text-slate-700 dark:text-slate-300">
                            {batch.month}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-900 dark:text-white">
                            {batch.totalRows}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400 font-semibold">
                            {batch.successCount}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-rose-700 dark:text-rose-400 font-semibold">
                            {batch.failedCount}
                          </td>
                          <td className="px-4 py-3 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-2">
                              {batch.errors.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() => toggleBatchErrors(batch.id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-[11px] font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="w-3.5 h-3.5" />
                                  ) : (
                                    <ChevronRight className="w-3.5 h-3.5" />
                                  )}
                                  <span>Errors ({batch.errors.length})</span>
                                </button>
                              )}
                              {batch.failedRows.length > 0 && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    downloadFailedRowsWorkbook(
                                      batch.failedRows,
                                      `failed-roster-${batch.month || batch.id}.xlsx`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 text-[11px] font-semibold text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/70 cursor-pointer"
                                >
                                  <Download className="w-3 h-3" />
                                  <span>Failed (.xlsx)</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isExpanded && batch.errors.length > 0 && (
                          <tr className="bg-slate-50/70 dark:bg-slate-950/70">
                            <td colSpan={8} className="px-4 py-3">
                              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                                <table className="w-full text-left text-xs">
                                  <thead className="bg-slate-50 dark:bg-slate-950 border-b border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300">
                                    <tr>
                                      <th className="px-3 py-2 font-semibold">Row</th>
                                      <th className="px-3 py-2 font-semibold">Employee ID</th>
                                      <th className="px-3 py-2 font-semibold">Employee Name</th>
                                      <th className="px-3 py-2 font-semibold">Error</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {batch.errors.map((err, idx) => (
                                      <tr key={`${batch.id}-err-${idx}`}>
                                        <td className="px-3 py-2 font-mono">{err.row}</td>
                                        <td className="px-3 py-2 font-mono">
                                          {err.employeeCode || '—'}
                                        </td>
                                        <td className="px-3 py-2">{err.employeeName || '—'}</td>
                                        <td className="px-3 py-2 text-rose-700 dark:text-rose-300">
                                          {err.error}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
