import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Edit3,
  Eye,
  FileText,
  FolderOpen,
  Mail,
  MapPin,
  Phone,
  Plus,
  Search,
  Trash2,
  UploadCloud,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import {
  ClockInPolicyMode,
  DocumentType,
  Employee,
  EmployeeDocument,
  GeofenceZone,
  UserRole,
} from '../types/hr';
import { nativeBridge } from '../services/nativeBridge';
import { formatAED, formatShortDate, getDocumentExpiryStatus } from '../utils/hrLogic';
import { Avatar } from './Avatar';

interface EmployeesViewProps {
  currentUser: Employee;
  activeRole: UserRole;
  employees: Employee[];
  geofences: GeofenceZone[];
  documents: EmployeeDocument[];
  onCreateEmployee: (emp: Omit<Employee, 'id'>) => Promise<void>;
  onUpdateEmployee: (id: string, patch: Partial<Employee>) => Promise<void>;
  onUploadDocument: (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => Promise<void>;
  onDeleteDocument: (id: string) => Promise<void>;
}

const DOC_TYPES: DocumentType[] = [
  DocumentType.Passport,
  DocumentType.EmiratesID,
  DocumentType.Visa,
  DocumentType.LaborCard,
  DocumentType.EmploymentContract,
];

const INPUT_CLASS =
  'w-full px-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500';

export const EmployeesView: React.FC<EmployeesViewProps> = ({
  currentUser,
  activeRole,
  employees,
  geofences,
  documents,
  onCreateEmployee,
  onUpdateEmployee,
  onUploadDocument,
  onDeleteDocument,
}) => {
  const isAdmin = activeRole === UserRole.Admin;
  const isEmployeeOnly = activeRole === UserRole.Employee;

  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('all');
  const [docAlertFilter, setDocAlertFilter] = useState<'all' | 'alerts'>('all');

  // Employee Create/Edit Modal
  const [editingEmp, setEditingEmp] = useState<Employee | null>(null);
  const [showEmpModal, setShowEmpModal] = useState(false);
  const [empFormError, setEmpFormError] = useState<string | null>(null);
  const [empForm, setEmpForm] = useState({
    employeeCode: '',
    fullName: '',
    email: '',
    phone: '',
    role: UserRole.Employee,
    department: '',
    jobTitle: '',
    joinDate: new Date().toISOString().slice(0, 10),
    assignedZoneIds: [] as string[],
    clockInPolicyOverride: 'inherit' as ClockInPolicyMode | 'inherit',
    baseSalary: 10000,
    housingAllowance: 3000,
    transportAllowance: 1200,
    otherAllowance: 500,
  });

  // Document Vault Drawer
  const [vaultEmployeeId, setVaultEmployeeId] = useState<string | null>(
    isEmployeeOnly ? currentUser.id : null
  );
  const [dragActive, setDragActive] = useState(false);
  const [docFormError, setDocFormError] = useState<string | null>(null);
  const [docForm, setDocForm] = useState({
    type: DocumentType.Passport,
    documentNumber: '',
    issueDate: new Date().toISOString().slice(0, 10),
    expiryDate: '',
    fileName: '',
    fileType: '',
    fileDataUrl: '',
    notes: '',
  });
  const [previewDoc, setPreviewDoc] = useState<EmployeeDocument | null>(null);

  const departments = useMemo(
    () => Array.from(new Set(employees.map((e) => e.department))).sort(),
    [employees]
  );

  const zoneMap = useMemo(() => new Map(geofences.map((z) => [z.id, z])), [geofences]);

  const docsByEmployee = useMemo(() => {
    const map = new Map<string, EmployeeDocument[]>();
    documents.forEach((doc) => {
      const list = map.get(doc.employeeId) ?? [];
      list.push(doc);
      map.set(doc.employeeId, list);
    });
    return map;
  }, [documents]);

  const getEmployeeDocStats = (empId: string) => {
    const empDocs = docsByEmployee.get(empId) ?? [];
    let expired = 0;
    let expiringSoon = 0;
    empDocs.forEach((d) => {
      const { status } = getDocumentExpiryStatus(d.expiryDate);
      if (status === 'expired') expired += 1;
      if (status === 'expiring_soon') expiringSoon += 1;
    });
    return { total: empDocs.length, expired, expiringSoon };
  };

  const visibleEmployees = useMemo(() => {
    const source = isEmployeeOnly
      ? employees.filter((e) => e.id === currentUser.id)
      : employees;

    return source.filter((e) => {
      if (deptFilter !== 'all' && e.department !== deptFilter) return false;
      if (docAlertFilter === 'alerts') {
        const stats = getEmployeeDocStats(e.id);
        if (stats.expired === 0 && stats.expiringSoon === 0) return false;
      }
      const q = search.trim().toLowerCase();
      if (q) {
        const hay = `${e.fullName} ${e.employeeCode} ${e.department} ${e.jobTitle} ${e.email}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [employees, isEmployeeOnly, currentUser.id, deptFilter, docAlertFilter, search, docsByEmployee]);

  const openAddEmployee = () => {
    setEditingEmp(null);
    setEmpFormError(null);
    const nextNum = 101 + employees.length;
    setEmpForm({
      employeeCode: `MSR-${nextNum}`,
      fullName: '',
      email: '',
      phone: '+971 50 ',
      role: UserRole.Employee,
      department: 'Operations',
      jobTitle: '',
      joinDate: new Date().toISOString().slice(0, 10),
      assignedZoneIds: geofences[0] ? [geofences[0].id] : [],
      clockInPolicyOverride: 'inherit',
      baseSalary: 10000,
      housingAllowance: 3000,
      transportAllowance: 1200,
      otherAllowance: 500,
    });
    setShowEmpModal(true);
  };

  const openEditEmployee = (emp: Employee) => {
    setEditingEmp(emp);
    setEmpFormError(null);
    setEmpForm({
      employeeCode: emp.employeeCode,
      fullName: emp.fullName,
      email: emp.email,
      phone: emp.phone,
      role: emp.role,
      department: emp.department,
      jobTitle: emp.jobTitle,
      joinDate: emp.joinDate,
      assignedZoneIds: [...emp.assignedZoneIds],
      clockInPolicyOverride: emp.clockInPolicyOverride ?? 'inherit',
      baseSalary: emp.salary.baseSalary,
      housingAllowance: emp.salary.housingAllowance,
      transportAllowance: emp.salary.transportAllowance,
      otherAllowance: emp.salary.otherAllowance,
    });
    setShowEmpModal(true);
  };

  const handleSaveEmployee = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!empForm.fullName.trim() || !empForm.email.trim() || !empForm.jobTitle.trim()) {
      setEmpFormError('Full name, email, and job title are required.');
      return;
    }
    if (empForm.baseSalary <= 0) {
      setEmpFormError('Base salary must be greater than 0 AED.');
      return;
    }

    const salary = {
      baseSalary: Number(empForm.baseSalary),
      housingAllowance: Number(empForm.housingAllowance) || 0,
      transportAllowance: Number(empForm.transportAllowance) || 0,
      otherAllowance: Number(empForm.otherAllowance) || 0,
    };

    if (editingEmp) {
      await onUpdateEmployee(editingEmp.id, {
        employeeCode: empForm.employeeCode.trim(),
        fullName: empForm.fullName.trim(),
        email: empForm.email.trim(),
        phone: empForm.phone.trim(),
        role: empForm.role,
        department: empForm.department.trim(),
        jobTitle: empForm.jobTitle.trim(),
        joinDate: empForm.joinDate,
        assignedZoneIds: empForm.assignedZoneIds,
        clockInPolicyOverride: empForm.clockInPolicyOverride,
        salary,
      });
    } else {
      await onCreateEmployee({
        employeeCode: empForm.employeeCode.trim(),
        fullName: empForm.fullName.trim(),
        email: empForm.email.trim(),
        phone: empForm.phone.trim(),
        avatarUrl: '',
        role: empForm.role,
        department: empForm.department.trim(),
        jobTitle: empForm.jobTitle.trim(),
        joinDate: empForm.joinDate,
        active: true,
        assignedZoneIds: empForm.assignedZoneIds,
        clockInPolicyOverride: empForm.clockInPolicyOverride,
        salary,
        leaveBalance: {
          annualTotal: 30,
          annualUsed: 0,
          sickTotal: 15,
          sickUsed: 0,
          emergencyTotal: 5,
          emergencyUsed: 0,
          unpaidUsed: 0,
        },
      });
    }
    setShowEmpModal(false);
  };

  const toggleZoneAssignment = (zoneId: string) => {
    setEmpForm((prev) => ({
      ...prev,
      assignedZoneIds: prev.assignedZoneIds.includes(zoneId)
        ? prev.assignedZoneIds.filter((id) => id !== zoneId)
        : [...prev.assignedZoneIds, zoneId],
    }));
  };

  const handleFilePicked = async (file: File | null) => {
    if (!file) return;
    setDocFormError(null);
    try {
      const captured = await nativeBridge.readFileAsDocument(file);
      setDocForm((prev) => ({
        ...prev,
        fileName: captured.fileName,
        fileType: captured.mimeType,
        fileDataUrl: captured.dataUrl,
      }));
    } catch (err) {
      setDocFormError(err instanceof Error ? err.message : 'Unable to read file.');
    }
  };

  const handleUploadDoc = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!vaultEmployeeId) return;
    if (!docForm.documentNumber.trim() || !docForm.expiryDate) {
      setDocFormError('Document number and expiry date are required.');
      return;
    }
    if (!docForm.fileName) {
      setDocFormError('Please attach a PDF, JPG, or PNG document file.');
      return;
    }
    await onUploadDocument({
      employeeId: vaultEmployeeId,
      type: docForm.type,
      documentNumber: docForm.documentNumber.trim(),
      issueDate: docForm.issueDate,
      expiryDate: docForm.expiryDate,
      fileName: docForm.fileName,
      fileType: docForm.fileType || 'application/pdf',
      fileDataUrl: docForm.fileDataUrl || undefined,
      notes: docForm.notes.trim() || undefined,
    });
    setDocForm({
      type: DocumentType.Passport,
      documentNumber: '',
      issueDate: new Date().toISOString().slice(0, 10),
      expiryDate: '',
      fileName: '',
      fileType: '',
      fileDataUrl: '',
      notes: '',
    });
    setDocFormError(null);
  };

  const vaultEmployee = employees.find((e) => e.id === vaultEmployeeId) ?? null;
  const vaultDocs = vaultEmployeeId ? docsByEmployee.get(vaultEmployeeId) ?? [] : [];

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold text-slate-900 dark:text-white">
            {isEmployeeOnly ? 'My Profile & Document Vault' : 'Employee Directory & Document Vault'}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
            {isEmployeeOnly
              ? 'View assigned work zones, employment details, and compliance document expiry dates.'
              : 'Manage workforce profiles, geofence assignments, salaries, and UAE compliance documents.'}
          </p>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={openAddEmployee}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            Add Employee
          </button>
        )}
      </div>

      {/* Filters (Admin / Management) */}
      {!isEmployeeOnly && (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, title, or email..."
              aria-label="Search employees"
              className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              aria-label="Filter by department"
              className="px-3 py-2 text-xs font-medium border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-200"
            >
              <option value="all">All Departments</option>
              {departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
              <button
                type="button"
                onClick={() => setDocAlertFilter('all')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  docAlertFilter === 'all'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                All Staff ({employees.length})
              </button>
              <button
                type="button"
                onClick={() => setDocAlertFilter('alerts')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  docAlertFilter === 'alerts'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Expiring Docs
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Employee Directory Table (Desktop) */}
      <section className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        {visibleEmployees.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500 dark:text-slate-400">
            No employees match your filter criteria.
          </div>
        ) : (
          <>
            <div className="hidden lg:block overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/60 text-xs font-medium text-slate-500 dark:text-slate-400">
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Department & Role</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Assigned Geofences</th>
                    <th className="py-3 px-4">Document Compliance</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-sm">
                  {visibleEmployees.map((emp) => {
                    const docStats = getEmployeeDocStats(emp.id);
                    const zones = emp.assignedZoneIds
                      .map((id) => zoneMap.get(id)?.name)
                      .filter(Boolean);
                    return (
                      <tr
                        key={emp.id}
                        className={`hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors ${!emp.active ? 'opacity-60' : ''}`}
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <Avatar src={emp.avatarUrl} name={emp.fullName} size="md" />
                            <div>
                              <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                                <span>{emp.fullName}</span>
                                {!emp.active && (
                                  <span className="text-[11px] font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-1.5 py-0.5 rounded">
                                    Inactive
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                                {emp.employeeCode} &middot; Joined {formatShortDate(emp.joinDate)}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800 dark:text-slate-200">{emp.jobTitle}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 capitalize">
                            {emp.department} &middot; {emp.role === UserRole.Admin ? 'HR Admin' : emp.role}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                          <div>{emp.email}</div>
                          <div className="font-mono text-slate-500 dark:text-slate-400">{emp.phone}</div>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-700 dark:text-slate-300 max-w-[200px]">
                          {zones.length > 0 ? zones.join(' · ') : 'Unassigned'}
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {docStats.expired > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-2.5 py-1 rounded-md">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {docStats.expired} Expired
                            </span>
                          ) : docStats.expiringSoon > 0 ? (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-2.5 py-1 rounded-md">
                              <AlertTriangle className="w-3.5 h-3.5" />
                              {docStats.expiringSoon} Expiring &le; 30d
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              {docStats.total} Compliant
                            </span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setVaultEmployeeId(emp.id)}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                            >
                              <FolderOpen className="w-3.5 h-3.5" />
                              Docs ({docStats.total})
                            </button>
                            {isAdmin && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => openEditEmployee(emp)}
                                  aria-label={`Edit ${emp.fullName}`}
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-indigo-700 dark:hover:text-indigo-300 cursor-pointer"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => onUpdateEmployee(emp.id, { active: !emp.active })}
                                  aria-label={
                                    emp.active ? `Deactivate ${emp.fullName}` : `Activate ${emp.fullName}`
                                  }
                                  className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-rose-700 dark:hover:text-rose-400 cursor-pointer"
                                >
                                  {emp.active ? (
                                    <UserX className="w-3.5 h-3.5" />
                                  ) : (
                                    <UserCheck className="w-3.5 h-3.5" />
                                  )}
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & Tablet Profile Cards */}
            <div className="lg:hidden divide-y divide-slate-100 dark:divide-slate-800">
              {visibleEmployees.map((emp) => {
                const docStats = getEmployeeDocStats(emp.id);
                const zones = emp.assignedZoneIds
                  .map((id) => zoneMap.get(id)?.name)
                  .filter(Boolean);
                return (
                  <div key={emp.id} className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar src={emp.avatarUrl} name={emp.fullName} size="lg" />
                        <div className="min-w-0">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {emp.fullName}
                          </h3>
                          <p className="text-xs text-slate-600 dark:text-slate-300 truncate">
                            {emp.jobTitle} &middot; {emp.department}
                          </p>
                          <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                            {emp.employeeCode} &middot; Joined {formatShortDate(emp.joinDate)}
                          </p>
                        </div>
                      </div>
                      {docStats.expired > 0 ? (
                        <span className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-2 py-0.5 rounded shrink-0">
                          {docStats.expired} Expired
                        </span>
                      ) : docStats.expiringSoon > 0 ? (
                        <span className="text-xs font-medium text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded shrink-0">
                          {docStats.expiringSoon} Expiring
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400 shrink-0">
                          Compliant
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 dark:text-slate-300">
                      <div className="flex items-center gap-1.5 truncate">
                        <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{emp.email}</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="font-mono">{emp.phone}</span>
                      </div>
                      <div className="flex items-center gap-1.5 sm:col-span-2">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">
                          {zones.length > 0 ? zones.join(' · ') : 'No assigned geofences'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setVaultEmployeeId(emp.id)}
                        className="flex-1 min-h-[40px] inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        Open Document Vault ({docStats.total})
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => openEditEmployee(emp)}
                          className="min-h-[40px] px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
                        >
                          Edit
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </section>

      {/* Inline Document Vault Section for Employee Role (or Selected Employee Drawer) */}
      {vaultEmployee && (
        <section
          aria-label="Employee Document Vault"
          className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-5 sm:p-6 space-y-5"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <Avatar src={vaultEmployee.avatarUrl} name={vaultEmployee.fullName} size="md" />
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  Document Vault — {vaultEmployee.fullName}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {vaultEmployee.employeeCode} &middot; {vaultEmployee.jobTitle} &middot; Gross{' '}
                  <span className="font-mono tabular-nums">
                    {formatAED(
                      vaultEmployee.salary.baseSalary +
                        vaultEmployee.salary.housingAllowance +
                        vaultEmployee.salary.transportAllowance +
                        vaultEmployee.salary.otherAllowance
                    )}
                  </span>
                </p>
              </div>
            </div>
            {!isEmployeeOnly && (
              <button
                type="button"
                onClick={() => setVaultEmployeeId(null)}
                aria-label="Close document vault"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Document Cards */}
          {vaultDocs.length === 0 ? (
            <div className="rounded-lg border border-dashed border-slate-200 dark:border-slate-700 p-8 text-center text-sm text-slate-500 dark:text-slate-400">
              No compliance documents uploaded yet for {vaultEmployee.fullName}.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {vaultDocs.map((doc) => {
                const { status, daysRemaining } = getDocumentExpiryStatus(doc.expiryDate);
                return (
                  <div
                    key={doc.id}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col justify-between gap-3 bg-slate-50/40 dark:bg-slate-950/60"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                            {doc.type}
                          </span>
                        </div>
                        {status === 'expired' ? (
                          <span className="text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                            Expired ({Math.abs(daysRemaining)}d ago)
                          </span>
                        ) : status === 'expiring_soon' ? (
                          <span className="text-[11px] font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-900 px-2 py-0.5 rounded whitespace-nowrap shrink-0">
                            Expires in {daysRemaining}d
                          </span>
                        ) : (
                          <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 whitespace-nowrap shrink-0">
                            Valid
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-xs font-mono text-slate-700 dark:text-slate-300">
                        No: {doc.documentNumber}
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                        Issued {formatShortDate(doc.issueDate)} &middot; Expires{' '}
                        <strong className="text-slate-700 dark:text-slate-200">
                          {formatShortDate(doc.expiryDate)}
                        </strong>
                      </p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                        {doc.fileName}
                      </p>
                      {doc.notes && (
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 italic">
                          {doc.notes}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-200/70 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPreviewDoc(doc)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-indigo-700 dark:text-indigo-400 hover:text-indigo-900 dark:hover:text-indigo-300 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Preview
                      </button>
                      {isAdmin && (
                        <button
                          type="button"
                          onClick={() => onDeleteDocument(doc.id)}
                          aria-label={`Delete ${doc.type} document`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 dark:text-rose-400 hover:text-rose-800 dark:hover:text-rose-300 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Drag-and-Drop Document Uploader (Admin Only) */}
          {isAdmin && (
            <form onSubmit={handleUploadDoc} className="pt-4 border-t border-slate-200 dark:border-slate-800 space-y-4">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                Upload New Employee Document
              </h4>
              {docFormError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2"
                >
                  {docFormError}
                </p>
              )}

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div>
                  <label htmlFor="doc-type" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Document Type
                  </label>
                  <select
                    id="doc-type"
                    value={docForm.type}
                    onChange={(e) => setDocForm((p) => ({ ...p, type: e.target.value as DocumentType }))}
                    className={INPUT_CLASS}
                  >
                    {DOC_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label htmlFor="doc-num" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Document Number
                  </label>
                  <input
                    id="doc-num"
                    type="text"
                    value={docForm.documentNumber}
                    onChange={(e) => setDocForm((p) => ({ ...p, documentNumber: e.target.value }))}
                    placeholder="e.g. 784-1994-..."
                    className={INPUT_CLASS}
                  />
                </div>

                <div>
                  <label htmlFor="doc-issue" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Issue Date
                  </label>
                  <input
                    id="doc-issue"
                    type="date"
                    value={docForm.issueDate}
                    onChange={(e) => setDocForm((p) => ({ ...p, issueDate: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>

                <div>
                  <label htmlFor="doc-expiry" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Expiry Date
                  </label>
                  <input
                    id="doc-expiry"
                    type="date"
                    value={docForm.expiryDate}
                    onChange={(e) => setDocForm((p) => ({ ...p, expiryDate: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
              </div>

              {/* Drag and drop zone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragActive(true);
                }}
                onDragLeave={() => setDragActive(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setDragActive(false);
                  void handleFilePicked(e.dataTransfer.files?.[0] ?? null);
                }}
                className={`rounded-xl border-2 border-dashed p-5 text-center transition-colors ${
                  dragActive
                    ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-950/60 hover:border-slate-300 dark:hover:border-slate-600'
                }`}
              >
                <UploadCloud className="w-6 h-6 text-indigo-600 dark:text-indigo-400 mx-auto" />
                <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
                  {docForm.fileName
                    ? `Selected: ${docForm.fileName}`
                    : 'Drag and drop PDF, JPG, or PNG here'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  or tap below to browse or capture from device camera
                </p>
                <label className="mt-3 inline-flex items-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer">
                  Choose File
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    className="sr-only"
                    onChange={(e) => void handleFilePicked(e.target.files?.[0] ?? null)}
                  />
                </label>
              </div>

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <input
                  type="text"
                  value={docForm.notes}
                  onChange={(e) => setDocForm((p) => ({ ...p, notes: e.target.value }))}
                  placeholder="Optional compliance notes (e.g. renewal tracking number)..."
                  aria-label="Document compliance notes"
                  className={`flex-1 ${INPUT_CLASS}`}
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  Save to Vault
                </button>
              </div>
            </form>
          )}
        </section>
      )}

      {/* Document Preview Modal */}
      {previewDoc && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="preview-doc-title"
        >
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 id="preview-doc-title" className="text-base font-semibold text-slate-900 dark:text-white">
                  {previewDoc.type}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {previewDoc.fileName} &middot; No. {previewDoc.documentNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                aria-label="Close document preview"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-4">
              {previewDoc.fileDataUrl && previewDoc.fileType.startsWith('image/') ? (
                <img
                  src={previewDoc.fileDataUrl}
                  alt={previewDoc.fileName}
                  className="max-h-72 mx-auto rounded object-contain"
                />
              ) : (
                <div className="py-8 text-center space-y-2">
                  <FileText className="w-10 h-10 text-indigo-600 dark:text-indigo-400 mx-auto" />
                  <p className="text-sm font-medium text-slate-900 dark:text-white">{previewDoc.fileName}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Issue Date: {formatShortDate(previewDoc.issueDate)} &middot; Expiry Date:{' '}
                    {formatShortDate(previewDoc.expiryDate)}
                  </p>
                  {previewDoc.fileDataUrl && (
                    <a
                      href={previewDoc.fileDataUrl}
                      download={previewDoc.fileName}
                      className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-lg bg-indigo-700 text-white text-xs font-medium hover:bg-indigo-800"
                    >
                      Download Original File
                    </a>
                  )}
                </div>
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewDoc(null)}
                className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Employee Modal (Admin) */}
      {showEmpModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
          role="dialog"
          aria-modal="true"
          aria-labelledby="emp-modal-title"
        >
          <div className="w-full max-w-2xl rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl my-8">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <h3 id="emp-modal-title" className="text-lg font-semibold text-slate-900 dark:text-white">
                {editingEmp ? `Edit Employee — ${editingEmp.fullName}` : 'Add New Employee'}
              </h3>
              <button
                type="button"
                onClick={() => setShowEmpModal(false)}
                aria-label="Close employee modal"
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveEmployee} className="mt-4 space-y-4">
              {empFormError && (
                <p
                  role="alert"
                  className="text-xs font-medium text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 rounded-lg px-3 py-2"
                >
                  {empFormError}
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label htmlFor="emp-name" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Full Name
                  </label>
                  <input
                    id="emp-name"
                    type="text"
                    required
                    value={empForm.fullName}
                    onChange={(e) => setEmpForm((p) => ({ ...p, fullName: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="emp-code" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Employee ID
                  </label>
                  <input
                    id="emp-code"
                    type="text"
                    required
                    value={empForm.employeeCode}
                    onChange={(e) => setEmpForm((p) => ({ ...p, employeeCode: e.target.value }))}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="emp-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Work Email
                  </label>
                  <input
                    id="emp-email"
                    type="email"
                    required
                    value={empForm.email}
                    onChange={(e) => setEmpForm((p) => ({ ...p, email: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="emp-phone" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <input
                    id="emp-phone"
                    type="text"
                    value={empForm.phone}
                    onChange={(e) => setEmpForm((p) => ({ ...p, phone: e.target.value }))}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
                <div>
                  <label htmlFor="emp-dept" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Department
                  </label>
                  <input
                    id="emp-dept"
                    type="text"
                    required
                    value={empForm.department}
                    onChange={(e) => setEmpForm((p) => ({ ...p, department: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="emp-title" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Job Title
                  </label>
                  <input
                    id="emp-title"
                    type="text"
                    required
                    value={empForm.jobTitle}
                    onChange={(e) => setEmpForm((p) => ({ ...p, jobTitle: e.target.value }))}
                    className={INPUT_CLASS}
                  />
                </div>
                <div>
                  <label htmlFor="emp-role" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    System Role
                  </label>
                  <select
                    id="emp-role"
                    value={empForm.role}
                    onChange={(e) => setEmpForm((p) => ({ ...p, role: e.target.value as UserRole }))}
                    className={INPUT_CLASS}
                  >
                    <option value={UserRole.Employee}>Employee</option>
                    <option value={UserRole.Admin}>Admin (HR)</option>
                    <option value={UserRole.Management}>Management</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="emp-policy" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    PC vs Mobile Clock-In Policy
                  </label>
                  <select
                    id="emp-policy"
                    value={empForm.clockInPolicyOverride}
                    onChange={(e) =>
                      setEmpForm((p) => ({
                        ...p,
                        clockInPolicyOverride: e.target.value as ClockInPolicyMode | 'inherit',
                      }))
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="inherit">Use Global Company Policy</option>
                    <option value={ClockInPolicyMode.StrictMobileGPS}>Strict Mobile GPS Only</option>
                    <option value={ClockInPolicyMode.AllowOfficePC}>Allow Office Network / PC</option>
                  </select>
                </div>
              </div>

              {/* Salary Structure (AED) */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2.5">
                  Monthly Compensation Structure (AED)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label htmlFor="sal-base" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Base Salary
                    </label>
                    <input
                      id="sal-base"
                      type="number"
                      min={0}
                      value={empForm.baseSalary}
                      onChange={(e) => setEmpForm((p) => ({ ...p, baseSalary: Number(e.target.value) }))}
                      className={`${INPUT_CLASS} font-mono py-1.5`}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-housing" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Housing
                    </label>
                    <input
                      id="sal-housing"
                      type="number"
                      min={0}
                      value={empForm.housingAllowance}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, housingAllowance: Number(e.target.value) }))
                      }
                      className={`${INPUT_CLASS} font-mono py-1.5`}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-transport" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Transport
                    </label>
                    <input
                      id="sal-transport"
                      type="number"
                      min={0}
                      value={empForm.transportAllowance}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, transportAllowance: Number(e.target.value) }))
                      }
                      className={`${INPUT_CLASS} font-mono py-1.5`}
                    />
                  </div>
                  <div>
                    <label htmlFor="sal-other" className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Other
                    </label>
                    <input
                      id="sal-other"
                      type="number"
                      min={0}
                      value={empForm.otherAllowance}
                      onChange={(e) =>
                        setEmpForm((p) => ({ ...p, otherAllowance: Number(e.target.value) }))
                      }
                      className={`${INPUT_CLASS} font-mono py-1.5`}
                    />
                  </div>
                </div>
              </div>

              {/* Assigned Geofence Locations */}
              <div className="pt-3 border-t border-slate-200 dark:border-slate-800">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 mb-2">
                  Assigned Geofence Locations
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {geofences.map((zone) => {
                    const checked = empForm.assignedZoneIds.includes(zone.id);
                    return (
                      <label
                        key={zone.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                          checked
                            ? 'border-indigo-300 dark:border-indigo-700 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-200'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleZoneAssignment(zone.id)}
                          className="rounded border-slate-300 dark:border-slate-600 text-indigo-700 focus:ring-indigo-500"
                        />
                        <span className="font-medium truncate">{zone.name}</span>
                        <span className="ml-auto font-mono text-slate-500 dark:text-slate-400">
                          {zone.radiusMeters}m
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowEmpModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-indigo-700 text-white text-sm font-medium hover:bg-indigo-800 cursor-pointer"
                >
                  {editingEmp ? 'Save Changes' : 'Create Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
