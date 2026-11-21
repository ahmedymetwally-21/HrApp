import React, { useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  FileSpreadsheet,
  KeyRound,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import { getRoleLabel, t } from '../i18n/translations';
import {
  BulkImportResult,
  BulkImportUserRow,
  Company,
  Employee,
  Language,
  Section,
} from '../types/hr';
import {
  BULK_IMPORT_TEMPLATE_COLUMNS,
  BulkImportRowClassification,
  buildBulkImportTemplateRows,
  evaluateBulkImportRows,
} from '../utils/bulkImportLogic';
import { formatAED, generateTemporaryPassword } from '../utils/hrLogic';
import { PageBreadcrumbHeader } from './PageBreadcrumbHeader';

interface BulkImportEmployeesPageProps {
  lang: Language;
  existingEmployees: Employee[];
  companies: Company[];
  sections: Section[];
  onBack: () => void;
  onBulkImport: (payload: {
    users: BulkImportUserRow[];
    defaultPassword?: string;
  }) => Promise<BulkImportResult>;
}

const INPUT_CLASS =
  'w-full px-3.5 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600 transition-colors';

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export const BulkImportEmployeesPage: React.FC<BulkImportEmployeesPageProps> = ({
  lang,
  existingEmployees,
  companies,
  sections,
  onBack,
  onBulkImport,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [rawRows, setRawRows] = useState<Record<string, unknown>[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [defaultPassword, setDefaultPassword] = useState('');
  const [showDefaultPassword, setShowDefaultPassword] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | BulkImportRowClassification>('all');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<BulkImportResult | null>(null);

  const evaluation = useMemo(
    () =>
      evaluateBulkImportRows({
        rawRows,
        existingEmployees,
        companies,
        sections,
        defaultPassword,
      }),
    [rawRows, existingEmployees, companies, sections, defaultPassword]
  );

  const filteredRows = useMemo(() => {
    if (statusFilter === 'all') return evaluation.rows;
    return evaluation.rows.filter((r) => r.classification === statusFilter);
  }, [evaluation.rows, statusFilter]);

  const handleDownloadTemplate = () => {
    const sampleRows = buildBulkImportTemplateRows(companies, sections);
    const worksheet = XLSX.utils.json_to_sheet(sampleRows, {
      header: [...BULK_IMPORT_TEMPLATE_COLUMNS],
    });
    worksheet['!cols'] = BULK_IMPORT_TEMPLATE_COLUMNS.map((col) => ({
      wch: Math.max(col.length + 4, 18),
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
    XLSX.writeFile(workbook, 'yaldi-hr-employees-template.xlsx');
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setParseError(null);
    setSubmitError(null);
    setImportResult(null);

    if (file.size > MAX_FILE_BYTES) {
      setParseError('File exceeds 5 MB size limit.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: false });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setParseError(t(lang, 'noRowsInFile'));
        setRawRows([]);
        setFileName(null);
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const parsed = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
        defval: '',
        raw: true,
      });

      setFileName(file.name);
      setRawRows(parsed);
      setStatusFilter('all');

      if (parsed.length === 0) {
        setParseError(t(lang, 'noRowsInFile'));
      }
    } catch {
      setParseError(t(lang, 'fileParseError'));
      setRawRows([]);
      setFileName(null);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClearFile = () => {
    setFileName(null);
    setRawRows([]);
    setParseError(null);
    setSubmitError(null);
    setImportResult(null);
    setStatusFilter('all');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleGenerateDefaultPassword = () => {
    setDefaultPassword(generateTemporaryPassword(10));
    setShowDefaultPassword(true);
  };

  const handleSubmitImport = async () => {
    if (evaluation.validPayloadRows.length === 0) {
      setSubmitError(t(lang, 'noValidRowsToImport'));
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await onBulkImport({
        users: evaluation.validPayloadRows,
        defaultPassword: defaultPassword.trim() || undefined,
      });
      setImportResult(res);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Bulk import request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const renderClassificationBadge = (classification: BulkImportRowClassification) => {
    if (classification === 'new') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 text-[11px] font-semibold">
          {t(lang, 'statusNew')}
        </span>
      );
    }
    if (classification === 'update') {
      return (
        <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-sky-700 dark:text-sky-300 text-[11px] font-semibold">
          {t(lang, 'statusUpdate')}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] font-semibold">
        {t(lang, 'statusInvalid')}
      </span>
    );
  };

  const renderPasswordStatus = (source: 'row' | 'default' | 'keep_existing' | 'missing') => {
    if (source === 'row') {
      return (
        <span className="text-xs text-emerald-700 dark:text-emerald-400 font-medium">
          {t(lang, 'passwordRowProvided')}
        </span>
      );
    }
    if (source === 'default') {
      return (
        <span className="text-xs text-teal-700 dark:text-teal-400 font-medium">
          {t(lang, 'passwordDefaultUsed')}
        </span>
      );
    }
    if (source === 'keep_existing') {
      return (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t(lang, 'passwordKeepExisting')}
        </span>
      );
    }
    return (
      <span className="text-xs text-rose-600 dark:text-rose-400 font-medium">
        {t(lang, 'passwordMissing')}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <PageBreadcrumbHeader
        lang={lang}
        onBack={onBack}
        backLabel={t(lang, 'backToEmployees')}
        breadcrumbs={[
          { label: t(lang, 'navGroupPeople') },
          { label: t(lang, 'navDirectory'), onClick: onBack },
          { label: t(lang, 'bulkImport') },
        ]}
        title={t(lang, 'bulkImportTitle')}
        subtitle={t(lang, 'bulkImportSubtitle')}
        actions={
          <button
            type="button"
            onClick={handleDownloadTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
            <span>{t(lang, 'downloadExcelTemplate')}</span>
          </button>
        }
      />

      {/* Results Summary Banner (Shown after POST /users/bulk finishes) */}
      {importResult && (
        <section
          role="status"
          className={`rounded-2xl border p-5 space-y-4 ${
            importResult.failedCount > 0
              ? 'border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/25'
              : 'border-emerald-200 dark:border-emerald-900 bg-emerald-50/80 dark:bg-emerald-950/25'
          }`}
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              {importResult.failedCount > 0 ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              )}
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'bulkImportResultTitle')}
                </h2>
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-emerald-200 dark:border-emerald-800 font-semibold text-emerald-700 dark:text-emerald-300">
                    <span>{t(lang, 'createdCountLabel')}:</span>
                    <span className="font-mono">{importResult.createdCount}</span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border border-sky-200 dark:border-sky-800 font-semibold text-sky-700 dark:text-sky-300">
                    <span>{t(lang, 'updatedCountLabel')}:</span>
                    <span className="font-mono">{importResult.updatedCount}</span>
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-900 border font-semibold ${
                      importResult.failedCount > 0
                        ? 'border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    <span>{t(lang, 'failedCountLabel')}:</span>
                    <span className="font-mono">{importResult.failedCount}</span>
                  </span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleClearFile}
                className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors cursor-pointer"
              >
                {t(lang, 'importAnotherFile')}
              </button>
              <button
                type="button"
                onClick={onBack}
                className="px-4 py-2 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                {t(lang, 'backToEmployees')}
              </button>
            </div>
          </div>

          {importResult.errors.length > 0 && (
            <div className="rounded-xl border border-rose-200 dark:border-rose-900 bg-white dark:bg-slate-900 overflow-hidden">
              <div className="px-4 py-2.5 bg-rose-50/70 dark:bg-rose-950/40 border-b border-rose-200/80 dark:border-rose-900 text-xs font-semibold text-rose-800 dark:text-rose-300">
                {t(lang, 'backendRowErrorsTitle')} ({importResult.errors.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-start text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                      <th className="py-2 px-4 text-start font-medium">{t(lang, 'rowColumnLabel')}</th>
                      <th className="py-2 px-4 text-start font-medium">Employee Code</th>
                      <th className="py-2 px-4 text-start font-medium">Email</th>
                      <th className="py-2 px-4 text-start font-medium">Error</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {importResult.errors.map((err, i) => (
                      <tr key={`${err.rowNumber ?? i}-${err.email ?? err.employeeCode ?? i}`}>
                        <td className="py-2 px-4 font-mono text-slate-600 dark:text-slate-300">
                          {err.rowNumber ?? '—'}
                        </td>
                        <td className="py-2 px-4 font-mono text-slate-700 dark:text-slate-200">
                          {err.employeeCode || '—'}
                        </td>
                        <td className="py-2 px-4 text-slate-700 dark:text-slate-200">
                          {err.email || err.fullName || '—'}
                        </td>
                        <td className="py-2 px-4 text-rose-700 dark:text-rose-300">{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Step 1 & Step 2 Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Step 1: Download Template */}
        <section className="lg:col-span-5 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between gap-4">
          <div className="space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(lang, 'templateStepTitle')}
              </h2>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              {t(lang, 'templateStepDesc')}
            </p>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 p-3.5 space-y-1.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Supported Columns ({BULK_IMPORT_TEMPLATE_COLUMNS.length})
              </p>
              <p className="font-mono text-[11px] text-slate-700 dark:text-slate-300 leading-relaxed break-words">
                {BULK_IMPORT_TEMPLATE_COLUMNS.join(', ')}
              </p>
            </div>
          </div>

          <div>
            <button
              type="button"
              onClick={handleDownloadTemplate}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-teal-200 dark:border-teal-800 bg-teal-50/70 dark:bg-teal-950/40 hover:bg-teal-100/70 dark:hover:bg-teal-950/70 text-teal-800 dark:text-teal-300 text-xs font-semibold transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>{t(lang, 'downloadExcelTemplate')}</span>
            </button>
          </div>
        </section>

        {/* Step 2: Upload Spreadsheet + Default Temporary Password */}
        <section className="lg:col-span-7 rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-teal-50 dark:bg-teal-950/50 border border-teal-100 dark:border-teal-900 flex items-center justify-center shrink-0">
                <UploadCloud className="w-4 h-4 text-teal-600 dark:text-teal-400" />
              </div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                {t(lang, 'uploadStepTitle')}
              </h2>
            </div>
            {fileName && (
              <button
                type="button"
                onClick={handleClearFile}
                className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{t(lang, 'clearFile')}</span>
              </button>
            )}
          </div>

          <input
            ref={fileInputRef}
            id="bulk-import-file-input"
            type="file"
            accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={handleFileChange}
            className="hidden"
          />

          <label
            htmlFor="bulk-import-file-input"
            className="block rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-teal-400 dark:hover:border-teal-600 bg-slate-50/70 dark:bg-slate-950/40 px-5 py-6 text-center cursor-pointer transition-colors"
          >
            <UploadCloud className="w-7 h-7 text-teal-600 dark:text-teal-400 mx-auto" />
            {fileName ? (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">{fileName}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {evaluation.rows.length} row{evaluation.rows.length === 1 ? '' : 's'} detected ·{' '}
                  <span className="text-teal-700 dark:text-teal-400 font-medium">
                    {t(lang, 'changeFile')}
                  </span>
                </p>
              </div>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-sm font-medium text-slate-800 dark:text-slate-200">
                  {t(lang, 'uploadDropPrompt')}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t(lang, 'uploadDropHint')}
                </p>
              </div>
            )}
          </label>

          {parseError && (
            <div
              role="alert"
              className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
            >
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{parseError}</span>
            </div>
          )}

          {/* Optional Default Temporary Password */}
          <div className="pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <label
                htmlFor="bulk-default-password"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300"
              >
                <KeyRound className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400" />
                <span>{t(lang, 'defaultTemporaryPassword')}</span>
              </label>
              <button
                type="button"
                onClick={handleGenerateDefaultPassword}
                className="inline-flex items-center gap-1 text-xs font-medium text-teal-700 dark:text-teal-400 hover:text-teal-800 dark:hover:text-teal-300 transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3 h-3" />
                <span>{t(lang, 'generateRandom')}</span>
              </button>
            </div>
            <div className="relative">
              <input
                id="bulk-default-password"
                type={showDefaultPassword ? 'text' : 'password'}
                autoComplete="new-password"
                value={defaultPassword}
                onChange={(e) => setDefaultPassword(e.target.value)}
                placeholder={t(lang, 'passwordMinLengthPlaceholder')}
                className={`${INPUT_CLASS} pe-10 font-mono`}
              />
              <button
                type="button"
                onClick={() => setShowDefaultPassword((prev) => !prev)}
                aria-label={
                  showDefaultPassword ? t(lang, 'hidePassword') : t(lang, 'showPassword')
                }
                className="absolute inset-y-0 end-0 px-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                {showDefaultPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
              {t(lang, 'defaultTempPasswordHint')}
            </p>
          </div>
        </section>
      </div>

      {/* Step 3: Client-Side Validation Summary & Preview Table */}
      {evaluation.rows.length > 0 && (
        <section className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
          <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  {t(lang, 'previewTableTitle')}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {evaluation.validPayloadRows.length} valid row
                  {evaluation.validPayloadRows.length === 1 ? '' : 's'} ready to submit ·{' '}
                  {evaluation.invalidCount} invalid row{evaluation.invalidCount === 1 ? '' : 's'}{' '}
                  will be skipped.
                </p>
              </div>

              <button
                type="button"
                onClick={handleSubmitImport}
                disabled={submitting || evaluation.validPayloadRows.length === 0}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-teal-600 hover:bg-teal-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
              >
                <UploadCloud className="w-4 h-4" />
                <span>
                  {submitting
                    ? t(lang, 'importingEmployees')
                    : `${t(lang, 'importUpdateEmployees')} (${evaluation.validPayloadRows.length})`}
                </span>
              </button>
            </div>

            {submitError && (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/40 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300"
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{submitError}</span>
              </div>
            )}

            {/* 4-Metric Filterable Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                  statusFilter === 'all'
                    ? 'border-teal-500 bg-teal-50/50 dark:bg-teal-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                  {t(lang, 'totalRows')}
                </p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                  {evaluation.rows.length}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('new')}
                className={`rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                  statusFilter === 'new'
                    ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                  {t(lang, 'statusNew')}
                </p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums text-emerald-700 dark:text-emerald-300">
                  {evaluation.newCount}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('update')}
                className={`rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                  statusFilter === 'update'
                    ? 'border-sky-500 bg-sky-50/60 dark:bg-sky-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400">
                  {t(lang, 'statusUpdate')}
                </p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums text-sky-700 dark:text-sky-300">
                  {evaluation.updateCount}
                </p>
              </button>

              <button
                type="button"
                onClick={() => setStatusFilter('invalid')}
                className={`rounded-xl border p-3.5 text-start transition-colors cursor-pointer ${
                  statusFilter === 'invalid'
                    ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/30'
                    : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                }`}
              >
                <p className="text-[11px] font-medium text-rose-700 dark:text-rose-400">
                  {t(lang, 'statusInvalid')}
                </p>
                <p className="mt-1 text-xl font-bold font-mono tabular-nums text-rose-700 dark:text-rose-300">
                  {evaluation.invalidCount}
                </p>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-start text-xs">
              <thead>
                <tr className="bg-slate-50/80 dark:bg-slate-800/60 border-b border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4 text-start font-medium">{t(lang, 'rowColumnLabel')}</th>
                  <th className="py-3 px-4 text-start font-medium">Status</th>
                  <th className="py-3 px-4 text-start font-medium">Code / ID</th>
                  <th className="py-3 px-4 text-start font-medium">Employee</th>
                  <th className="py-3 px-4 text-start font-medium">Role & Dept</th>
                  <th className="py-3 px-4 text-start font-medium">Main Salary</th>
                  <th className="py-3 px-4 text-start font-medium">{t(lang, 'password')}</th>
                  <th className="py-3 px-4 text-start font-medium">
                    {t(lang, 'validationNotesLabel')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredRows.map((row) => {
                  const hasSalary =
                    row.normalized.baseSalary !== undefined ||
                    row.normalized.housingAllowance !== undefined ||
                    row.normalized.transportAllowance !== undefined ||
                    row.normalized.otherAllowance !== undefined;
                  const grossPreview =
                    (row.normalized.baseSalary ?? 0) +
                    (row.normalized.housingAllowance ?? 0) +
                    (row.normalized.transportAllowance ?? 0) +
                    (row.normalized.otherAllowance ?? 0);

                  return (
                    <tr
                      key={row.rowNumber}
                      className={
                        row.classification === 'invalid'
                          ? 'bg-rose-50/35 dark:bg-rose-950/15'
                          : 'hover:bg-slate-50/70 dark:hover:bg-slate-800/40'
                      }
                    >
                      <td className="py-3 px-4 font-mono text-slate-500 dark:text-slate-400">
                        {row.rowNumber}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderClassificationBadge(row.classification)}
                      </td>
                      <td className="py-3 px-4 font-mono text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {row.normalized.employeeCode || row.normalized.id || '—'}
                      </td>
                      <td className="py-3 px-4 min-w-[180px]">
                        <p className="font-medium text-slate-900 dark:text-white">
                          {row.normalized.fullName || row.matchedEmployeeName || '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[220px]">
                          {row.normalized.email || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 min-w-[160px]">
                        <p className="text-slate-800 dark:text-slate-200">
                          {row.payload.role ? getRoleLabel(lang, row.payload.role) : '—'}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {[row.resolvedCompanyName, row.resolvedSectionName]
                            .filter(Boolean)
                            .join(' · ') || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 font-mono tabular-nums text-slate-700 dark:text-slate-200 whitespace-nowrap">
                        {hasSalary ? formatAED(grossPreview) : '—'}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderPasswordStatus(row.passwordSource)}
                      </td>
                      <td className="py-3 px-4 min-w-[220px]">
                        {row.errors.length > 0 ? (
                          <ul className="space-y-0.5 text-rose-700 dark:text-rose-300">
                            {row.errors.map((err, i) => (
                              <li key={i}>{err}</li>
                            ))}
                          </ul>
                        ) : row.classification === 'update' && row.matchedEmployeeName ? (
                          <div className="space-y-0.5">
                            <p className="text-sky-700 dark:text-sky-300">
                              {t(lang, 'matchedExisting')}: {row.matchedEmployeeName} (
                              {row.matchedBy})
                            </p>
                            {row.warnings.map((w, i) => (
                              <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">
                                {w}
                              </p>
                            ))}
                          </div>
                        ) : row.warnings.length > 0 ? (
                          <ul className="space-y-0.5 text-amber-700 dark:text-amber-400">
                            {row.warnings.map((w, i) => (
                              <li key={i}>{w}</li>
                            ))}
                          </ul>
                        ) : (
                          <span className="text-emerald-700 dark:text-emerald-400">Ready</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
};
