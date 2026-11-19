/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Receipt,
  Search,
  Settings2,
  Users,
  X,
} from 'lucide-react';
import {
  AppSettings,
  ClockInPolicyMode,
  Employee,
  EmployeeDocument,
  GeofenceZone,
  GPSReading,
  HRDatabase,
  LeaveRequest,
  LeaveStatus,
  PayrollAdjustment,
  UserRole,
} from './types/hr';
import { api } from './services/api';
import {
  evaluateClockInEligibility,
  getDocumentExpiryStatus,
  resolveClockInPolicy,
} from './utils/hrLogic';
import { Avatar } from './components/Avatar';
import { AttendanceView } from './components/AttendanceView';
import { DashboardView, NavSection } from './components/DashboardView';
import { EmployeesView } from './components/EmployeesView';
import { GeofencesSettingsView } from './components/GeofencesSettingsView';
import { LeavesView } from './components/LeavesView';
import { OfflineIndicator } from './components/OfflineIndicator';
import { PayrollView } from './components/PayrollView';
import { PWAInstallButton } from './components/PWAInstallButton';

type SimPreset = 'live' | 'inside_primary' | 'inside_secondary' | 'outside' | 'low_accuracy';

const ROLE_DEFAULT_EMPLOYEE: Record<UserRole, string> = {
  [UserRole.Employee]: 'emp-omar',
  [UserRole.Admin]: 'emp-layla',
  [UserRole.Management]: 'emp-tariq',
};

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.Employee]: 'Employee',
  [UserRole.Admin]: 'Admin (HR)',
  [UserRole.Management]: 'Management',
};

export default function App() {
  const [db, setDb] = useState<HRDatabase | null>(null);
  const [activeRole, setActiveRole] = useState<UserRole>(UserRole.Employee);
  const [activeSection, setActiveSection] = useState<NavSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Top bar search & notification dropdown
  const [globalQuery, setGlobalQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // GPS & Device Simulation State (supports real browser geolocation + desk simulator)
  const [simPreset, setSimPreset] = useState<SimPreset>('inside_primary');
  const [simulatedDevice, setSimulatedDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [liveGpsReading, setLiveGpsReading] = useState<GPSReading | null>(null);
  const [liveGpsMessage, setLiveGpsMessage] = useState<string>(
    'Simulator active: Inside DIFC Main Office (±12m)'
  );

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(t);
  }, [toast]);

  const reloadDb = useCallback(async () => {
    const data = await api.getDatabase();
    setDb(data);
  }, []);

  useEffect(() => {
    void reloadDb();
  }, [reloadDb]);

  // Switch active section cleanly if Employee switches away from Geofences admin view
  const handleRoleSwitch = (nextRole: UserRole) => {
    setActiveRole(nextRole);
    if (nextRole === UserRole.Employee && activeSection === 'geofences') {
      setActiveSection('dashboard');
    }
    setShowNotifications(false);
  };

  const currentUser: Employee | null = useMemo(() => {
    if (!db || db.employees.length === 0) return null;
    const preferredId = ROLE_DEFAULT_EMPLOYEE[activeRole];
    return (
      db.employees.find((e) => e.id === preferredId) ??
      db.employees.find((e) => e.role === activeRole) ??
      db.employees[0]
    );
  }, [db, activeRole]);

  // Compute active GPS reading based on selected simulator preset or live browser geolocation
  const gpsReading: GPSReading | null = useMemo(() => {
    if (!db || !currentUser) return null;
    const assignedZones = db.geofences.filter((z) => currentUser.assignedZoneIds.includes(z.id));
    const primary = assignedZones[0] ?? db.geofences[0];
    const secondary = db.geofences.find((z) => z.id === 'zone-jafza') ?? assignedZones[1] ?? primary;

    if (simPreset === 'live') {
      return liveGpsReading;
    }
    if (!primary) return null;

    if (simPreset === 'inside_primary') {
      return {
        latitude: Number((primary.latitude + 0.00018).toFixed(6)),
        longitude: Number((primary.longitude + 0.00014).toFixed(6)),
        accuracyMeters: 12,
        isSimulated: true,
        label: `Inside ${primary.name}`,
      };
    }
    if (simPreset === 'inside_secondary' && secondary) {
      return {
        latitude: Number((secondary.latitude + 0.00015).toFixed(6)),
        longitude: Number((secondary.longitude - 0.00012).toFixed(6)),
        accuracyMeters: 15,
        isSimulated: true,
        label: `Inside ${secondary.name}`,
      };
    }
    if (simPreset === 'low_accuracy') {
      return {
        latitude: Number((primary.latitude + 0.0001).toFixed(6)),
        longitude: Number((primary.longitude + 0.0001).toFixed(6)),
        accuracyMeters: 280,
        isSimulated: true,
        label: 'Low-Accuracy IP Geolocation (±280m)',
      };
    }
    // Outside zone (~420m north of primary zone)
    return {
      latitude: Number((primary.latitude + 0.0038).toFixed(6)),
      longitude: Number((primary.longitude + 0.0004).toFixed(6)),
      accuracyMeters: 14,
      isSimulated: true,
      label: 'Outside Assigned Zone (~420m)',
    };
  }, [db, currentUser, simPreset, liveGpsReading]);

  const gpsStatusMessage = useMemo(() => {
    if (simPreset === 'live') return liveGpsMessage;
    return gpsReading?.label
      ? `Simulated: ${gpsReading.label} (±${gpsReading.accuracyMeters}m)`
      : 'Simulator ready';
  }, [simPreset, liveGpsMessage, gpsReading]);

  const handleRequestLiveGPS = () => {
    setSimPreset('live');
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLiveGpsMessage('Browser Geolocation API unavailable on this device.');
      return;
    }
    setLiveGpsMessage('Requesting hardware GPS fix...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLiveGpsReading({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracyMeters: pos.coords.accuracy || 25,
          isSimulated: false,
          label: 'Live Device GPS',
        });
        setLiveGpsMessage(
          `Live GPS acquired (±${Math.round(pos.coords.accuracy || 25)}m)`
        );
      },
      (err) => {
        setLiveGpsReading(null);
        setLiveGpsMessage(`GPS permission error: ${err.message}. Use Simulator to test.`);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  // --- Data Mutations ---
  const handleClockIn = async () => {
    if (!db || !currentUser || !gpsReading) return;
    const assignedZones = db.geofences.filter((z) => currentUser.assignedZoneIds.includes(z.id));
    const effectivePolicy = resolveClockInPolicy(currentUser, db.settings.globalClockInPolicy);
    const evalRes = evaluateClockInEligibility({
      reading: gpsReading,
      assignedZones,
      effectivePolicy,
      isDesktopDevice: simulatedDevice === 'desktop',
      maxAccuracyMeters: db.settings.maxMobileAccuracyMeters,
    });
    if (!evalRes.allowed || !evalRes.nearestZone) return;

    await api.attendance.clockIn({
      employeeId: currentUser.id,
      zoneId: evalRes.nearestZone.id,
      zoneName: evalRes.nearestZone.name,
      latitude: gpsReading.latitude,
      longitude: gpsReading.longitude,
      accuracyMeters: gpsReading.accuracyMeters,
      punchSource: evalRes.punchSource,
    });
    await reloadDb();
    showToast(`Clocked in at ${evalRes.nearestZone.name} (${evalRes.punchSource})`);
  };

  const handleClockOut = async (logId: string) => {
    if (!gpsReading) return;
    await api.attendance.clockOut({
      logId,
      latitude: gpsReading.latitude,
      longitude: gpsReading.longitude,
    });
    await reloadDb();
    showToast('Clock-out recorded successfully.');
  };

  const handleCreateEmployee = async (emp: Omit<Employee, 'id'>) => {
    await api.employees.create(emp);
    await reloadDb();
    showToast(`Added ${emp.fullName} to employee directory.`);
  };

  const handleUpdateEmployee = async (id: string, patch: Partial<Employee>) => {
    await api.employees.update(id, patch);
    await reloadDb();
    showToast('Employee profile updated.');
  };

  const handleUploadDocument = async (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => {
    await api.documents.upload(doc);
    await reloadDb();
    showToast(`${doc.type} uploaded to document vault.`);
  };

  const handleDeleteDocument = async (id: string) => {
    await api.documents.remove(id);
    await reloadDb();
    showToast('Document removed from vault.');
  };

  const handleSubmitLeave = async (
    input: Omit<LeaveRequest, 'id' | 'status' | 'submittedAt'>
  ) => {
    await api.leaves.submit(input);
    await reloadDb();
    showToast('Leave request submitted for approval.');
  };

  const handleDecideLeave = async (params: {
    leaveId: string;
    status: LeaveStatus.Approved | LeaveStatus.Rejected;
    comment: string;
  }) => {
    if (!currentUser) return;
    await api.leaves.decide({
      leaveId: params.leaveId,
      status: params.status,
      reviewerName: currentUser.fullName,
      reviewerRole: activeRole,
      comment: params.comment,
    });
    await reloadDb();
    showToast(`Leave request marked as ${params.status}.`);
  };

  const handleAddAdjustment = async (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => {
    await api.payroll.addAdjustment(input);
    await reloadDb();
    showToast(
      input.kind === 'deduction'
        ? 'Salary deduction logged and reflected in monthly payroll.'
        : 'Bonus added to monthly payroll.'
    );
  };

  const handleRemoveAdjustment = async (id: string) => {
    await api.payroll.removeAdjustment(id);
    await reloadDb();
    showToast('Payroll adjustment removed.');
  };

  const handleCreateZone = async (zone: Omit<GeofenceZone, 'id'>) => {
    await api.geofences.create(zone);
    await reloadDb();
    showToast(`Geofence "${zone.name}" saved.`);
  };

  const handleUpdateZone = async (id: string, patch: Partial<GeofenceZone>) => {
    await api.geofences.update(id, patch);
    await reloadDb();
    showToast('Geofence updated.');
  };

  const handleDeleteZone = async (id: string) => {
    await api.geofences.remove(id);
    await reloadDb();
    showToast('Geofence removed.');
  };

  const handleUpdateSettings = async (patch: Partial<AppSettings>) => {
    await api.settings.update(patch);
    await reloadDb();
    showToast('Clock-in policy settings updated.');
  };

  const handleResetDemoData = async () => {
    const fresh = await api.resetDemoData();
    setDb(fresh);
    showToast('Workspace reset to default sample dataset.');
  };

  // --- Notifications (Expiring Docs + Pending Leaves) ---
  const notifications = useMemo(() => {
    if (!db || !currentUser) return [];
    const items: { id: string; title: string; detail: string; target: NavSection; tone: 'rose' | 'amber' }[] = [];

    const scopeDocs =
      activeRole === UserRole.Employee
        ? db.documents.filter((d) => d.employeeId === currentUser.id)
        : db.documents;

    scopeDocs.forEach((doc) => {
      const { status, daysRemaining } = getDocumentExpiryStatus(doc.expiryDate);
      if (status === 'expired' || status === 'expiring_soon') {
        const emp = db.employees.find((e) => e.id === doc.employeeId);
        items.push({
          id: `notif-doc-${doc.id}`,
          title: `${doc.type} ${status === 'expired' ? 'Expired' : 'Expiring Soon'}`,
          detail: `${emp?.fullName ?? 'Employee'} · ${
            status === 'expired'
              ? `${Math.abs(daysRemaining)}d overdue`
              : `${daysRemaining}d remaining`
          }`,
          target: 'employees',
          tone: status === 'expired' ? 'rose' : 'amber',
        });
      }
    });

    if (activeRole !== UserRole.Employee) {
      db.leaves
        .filter((l) => l.status === LeaveStatus.Pending)
        .forEach((lv) => {
          const emp = db.employees.find((e) => e.id === lv.employeeId);
          items.push({
            id: `notif-lv-${lv.id}`,
            title: `Pending ${lv.type}`,
            detail: `${emp?.fullName ?? 'Employee'} · ${lv.days} day${lv.days === 1 ? '' : 's'}`,
            target: 'leaves',
            tone: 'amber',
          });
        });
    }

    return items;
  }, [db, currentUser, activeRole]);

  // Global quick-search results
  const quickSearchResults = useMemo(() => {
    if (!db || !globalQuery.trim()) return [];
    const q = globalQuery.trim().toLowerCase();
    const results: { id: string; label: string; sub: string; target: NavSection }[] = [];

    if (activeRole !== UserRole.Employee) {
      db.employees
        .filter(
          (e) =>
            e.fullName.toLowerCase().includes(q) ||
            e.employeeCode.toLowerCase().includes(q) ||
            e.department.toLowerCase().includes(q)
        )
        .slice(0, 4)
        .forEach((e) =>
          results.push({
            id: `sr-emp-${e.id}`,
            label: e.fullName,
            sub: `${e.employeeCode} · ${e.jobTitle}`,
            target: 'employees',
          })
        );
    }

    db.geofences
      .filter((z) => z.name.toLowerCase().includes(q) || z.address.toLowerCase().includes(q))
      .slice(0, 3)
      .forEach((z) =>
        results.push({
          id: `sr-zone-${z.id}`,
          label: z.name,
          sub: `Geofence · ${z.radiusMeters}m radius`,
          target: activeRole === UserRole.Employee ? 'attendance' : 'geofences',
        })
      );

    return results;
  }, [db, globalQuery, activeRole]);

  const navItems = useMemo(() => {
    const base: { id: NavSection; label: string; mobileLabel: string; icon: React.ComponentType<{ className?: string }> }[] = [
      { id: 'dashboard', label: 'Dashboard', mobileLabel: 'Home', icon: LayoutDashboard },
      { id: 'attendance', label: 'Clock-In & Logs', mobileLabel: 'Clock-In', icon: Clock },
      {
        id: 'employees',
        label: activeRole === UserRole.Employee ? 'My Documents' : 'Employees & Vault',
        mobileLabel: activeRole === UserRole.Employee ? 'Vault' : 'Team',
        icon: activeRole === UserRole.Employee ? FolderOpen : Users,
      },
      { id: 'leaves', label: 'Leave Requests', mobileLabel: 'Leaves', icon: CalendarDays },
      {
        id: 'payroll',
        label: activeRole === UserRole.Employee ? 'My Payslips' : 'Payroll & Deductions',
        mobileLabel: 'Payroll',
        icon: Receipt,
      },
    ];

    if (activeRole !== UserRole.Employee) {
      base.push({
        id: 'geofences',
        label: 'Geofences & Policy',
        mobileLabel: 'Zones',
        icon: Settings2,
      });
    }
    return base;
  }, [activeRole]);

  const mobileNavItems = useMemo(() => {
    // Keep thumb-friendly bottom nav to 5 crisp items max
    return navItems.slice(0, 5);
  }, [navItems]);

  if (!db || !currentUser) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        Loading Masar HR workspace...
      </div>
    );
  }

  const activeNavTitle = navItems.find((n) => n.id === activeSection)?.label ?? 'Dashboard';

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col lg:flex-row">
      {/* DESKTOP PERSISTENT COLLAPSIBLE SIDEBAR (1024px+) */}
      <aside
        aria-label="Primary navigation"
        className={`hidden lg:flex lg:flex-col shrink-0 bg-white border-r border-slate-200 transition-[width] duration-200 sticky top-0 h-screen ${
          sidebarCollapsed ? 'w-[76px]' : 'w-[252px]'
        }`}
      >
        {/* Brand Row */}
        <div className="h-16 px-4 border-b border-slate-200 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-700 text-white flex items-center justify-center shrink-0">
              <MapPin className="w-4 h-4" />
            </div>
            {!sidebarCollapsed && (
              <span className="font-display text-base font-bold tracking-tight text-slate-900 whitespace-nowrap truncate">
                Masar HR
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
          >
            {sidebarCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveSection(item.id)}
                title={sidebarCollapsed ? item.label : undefined}
                aria-current={active ? 'page' : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-indigo-50 text-indigo-800'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-indigo-700' : 'text-slate-400'}`} />
                {!sidebarCollapsed && <span className="truncate">{item.label}</span>}
              </button>
            );
          })}
        </nav>

        {/* Active Signed-In Profile Footer */}
        <div className="p-3 border-t border-slate-200">
          <div className="flex items-center gap-2.5 p-2 rounded-lg bg-slate-50 border border-slate-200/70">
            <Avatar src={currentUser.avatarUrl} name={currentUser.fullName} size="sm" />
            {!sidebarCollapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-slate-900 truncate">
                  {currentUser.fullName}
                </p>
                <p className="text-[11px] text-slate-500 truncate">{ROLE_LABELS[activeRole]}</p>
              </div>
            )}
          </div>
        </div>
      </aside>

      {/* MAIN VIEWPORT */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* DESKTOP TOP HEADER BAR (1024px+) */}
        <header className="hidden lg:flex h-16 bg-white border-b border-slate-200 px-6 items-center justify-between gap-6 sticky top-0 z-30">
          <div className="flex items-center gap-4 min-w-0 flex-1">
            <h1 className="text-base font-semibold text-slate-900 whitespace-nowrap shrink-0">
              {activeNavTitle}
            </h1>

            {/* Working Global Quick Search */}
            <div className="relative max-w-xs w-full">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="search"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
                placeholder="Jump to staff or geofence..."
                aria-label="Global workspace search"
                className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50/70 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
              {quickSearchResults.length > 0 && (
                <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-lg py-1 z-40">
                  {quickSearchResults.map((res) => (
                    <button
                      key={res.id}
                      type="button"
                      onClick={() => {
                        setActiveSection(res.target);
                        setGlobalQuery('');
                      }}
                      className="w-full px-3 py-2 text-left hover:bg-slate-50 flex flex-col cursor-pointer"
                    >
                      <span className="text-xs font-semibold text-slate-900">{res.label}</span>
                      <span className="text-[11px] text-slate-500">{res.sub}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Right Controls: Role Switcher + Notifications + PWA Install */}
          <div className="flex items-center gap-3 shrink-0">
            <div
              role="group"
              aria-label="Switch demo role"
              className="inline-flex items-center rounded-lg bg-slate-100 p-0.5 border border-slate-200/80"
            >
              {(Object.values(UserRole) as UserRole[]).map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleSwitch(role)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    activeRole === role
                      ? 'bg-white text-indigo-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {ROLE_LABELS[role]}
                </button>
              ))}
            </div>

            <div className="relative">
              <button
                type="button"
                onClick={() => setShowNotifications((s) => !s)}
                aria-label={`Notifications (${notifications.length} ${
                  notifications.length === 1 ? 'alert' : 'alerts'
                })`}
                className="relative p-2 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {notifications.length > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center font-mono">
                    {notifications.length}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-xl z-40 overflow-hidden">
                  <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-900">
                      Workspace Alerts ({notifications.length})
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowNotifications(false)}
                      aria-label="Close notifications"
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {notifications.length === 0 ? (
                    <p className="p-4 text-xs text-slate-500">All clear — no pending alerts.</p>
                  ) : (
                    <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
                      {notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => {
                            setActiveSection(n.target);
                            setShowNotifications(false);
                          }}
                          className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                        >
                          <p
                            className={`text-xs font-semibold ${
                              n.tone === 'rose' ? 'text-rose-700' : 'text-amber-800'
                            }`}
                          >
                            {n.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">{n.detail}</p>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <PWAInstallButton />
          </div>
        </header>

        {/* MOBILE COMPACT TOP BAR (< 1024px) — 52px tall (combined with 60px bottom nav = 112px < 15% of 844px) */}
        <header className="lg:hidden sticky top-0 z-30 h-[52px] bg-white/95 backdrop-blur-md border-b border-slate-200 px-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-indigo-700 text-white flex items-center justify-center shrink-0">
              <MapPin className="w-3.5 h-3.5" />
            </div>
            <span className="font-display text-sm font-bold text-slate-900 truncate">
              Masar HR
            </span>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <select
              aria-label="Switch user role"
              value={activeRole}
              onChange={(e) => handleRoleSwitch(e.target.value as UserRole)}
              className="h-9 px-2 text-xs font-medium border border-slate-200 rounded-lg bg-slate-50 text-slate-800"
            >
              <option value={UserRole.Employee}>Employee</option>
              <option value={UserRole.Admin}>Admin (HR)</option>
              <option value={UserRole.Management}>Management</option>
            </select>

            {activeRole !== UserRole.Employee && (
              <button
                type="button"
                onClick={() => setActiveSection('geofences')}
                aria-label="Geofences and Policy Settings"
                className={`min-h-[40px] min-w-[40px] rounded-lg border flex items-center justify-center cursor-pointer ${
                  activeSection === 'geofences'
                    ? 'border-indigo-300 bg-indigo-50 text-indigo-700'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <Settings2 className="w-4 h-4" />
              </button>
            )}

            <PWAInstallButton compact />
          </div>
        </header>

        {/* PAGE CONTENT */}
        <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-5 sm:py-6 pb-24 lg:pb-8">
          {activeSection === 'dashboard' && (
            <DashboardView
              currentUser={currentUser}
              activeRole={activeRole}
              employees={db.employees}
              geofences={db.geofences}
              documents={db.documents}
              attendance={db.attendance}
              leaves={db.leaves}
              payrollAdjustments={db.payrollAdjustments}
              settings={db.settings}
              gpsReading={gpsReading}
              simulatedDevice={simulatedDevice}
              onNavigate={setActiveSection}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
              onQuickLeaveDecision={(leaveId, status) =>
                handleDecideLeave({
                  leaveId,
                  status,
                  comment:
                    status === LeaveStatus.Approved
                      ? 'Approved via dashboard queue.'
                      : 'Declined via dashboard queue.',
                })
              }
            />
          )}

          {activeSection === 'attendance' && (
            <AttendanceView
              currentUser={currentUser}
              activeRole={activeRole}
              employees={db.employees}
              geofences={db.geofences}
              attendance={db.attendance}
              settings={db.settings}
              gpsReading={gpsReading}
              gpsStatusMessage={gpsStatusMessage}
              simPreset={simPreset}
              simulatedDevice={simulatedDevice}
              onChangeSimPreset={setSimPreset}
              onChangeSimulatedDevice={setSimulatedDevice}
              onRequestLiveGPS={handleRequestLiveGPS}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
            />
          )}

          {activeSection === 'employees' && (
            <EmployeesView
              currentUser={currentUser}
              activeRole={activeRole}
              employees={db.employees}
              geofences={db.geofences}
              documents={db.documents}
              onCreateEmployee={handleCreateEmployee}
              onUpdateEmployee={handleUpdateEmployee}
              onUploadDocument={handleUploadDocument}
              onDeleteDocument={handleDeleteDocument}
            />
          )}

          {activeSection === 'leaves' && (
            <LeavesView
              currentUser={currentUser}
              activeRole={activeRole}
              employees={db.employees}
              leaves={db.leaves}
              onSubmitLeave={handleSubmitLeave}
              onDecideLeave={handleDecideLeave}
            />
          )}

          {activeSection === 'payroll' && (
            <PayrollView
              currentUser={currentUser}
              activeRole={activeRole}
              employees={db.employees}
              adjustments={db.payrollAdjustments}
              settings={db.settings}
              onAddAdjustment={handleAddAdjustment}
              onRemoveAdjustment={handleRemoveAdjustment}
            />
          )}

          {activeSection === 'geofences' && activeRole !== UserRole.Employee && (
            <GeofencesSettingsView
              activeRole={activeRole}
              geofences={db.geofences}
              employees={db.employees}
              settings={db.settings}
              onCreateZone={handleCreateZone}
              onUpdateZone={handleUpdateZone}
              onDeleteZone={handleDeleteZone}
              onUpdateSettings={handleUpdateSettings}
              onUpdateEmployeePolicy={(empId, policy: ClockInPolicyMode | 'inherit') =>
                handleUpdateEmployee(empId, { clockInPolicyOverride: policy })
              }
              onResetDemoData={handleResetDemoData}
            />
          )}
        </main>
      </div>

      {/* MOBILE THUMB-FRIENDLY BOTTOM NAVIGATION BAR (< 1024px) — 60px tall */}
      <nav
        aria-label="Mobile navigation"
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 h-[60px] bg-white/95 backdrop-blur-md border-t border-slate-200 grid grid-cols-5 items-center pb-safe"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeSection === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 transition-colors cursor-pointer ${
                active ? 'text-indigo-700' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-medium leading-none">{item.mobileLabel}</span>
            </button>
          );
        })}
      </nav>

      {/* Action Feedback Toast */}
      {toast && (
        <div
          role="status"
          className="fixed top-16 inset-x-4 lg:top-auto lg:left-auto lg:bottom-6 lg:right-6 z-50 rounded-xl bg-slate-900 text-white px-4 py-2.5 text-xs font-medium shadow-lg flex items-center justify-between gap-3"
        >
          <span>{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="text-slate-400 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <OfflineIndicator />
    </div>
  );
}
