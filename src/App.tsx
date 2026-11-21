import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Building2,
  CalendarClock,
  CheckCircle2,
  Clock,
  FolderOpen,
  LayoutDashboard,
  MapPin,
  Settings,
  SlidersHorizontal,
  Users,
  Wallet,
  X,
} from 'lucide-react';
import { AttendanceView } from './components/AttendanceView';
import { Avatar } from './components/Avatar';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { DashboardView } from './components/DashboardView';
import { EarningsDeductionsView } from './components/EarningsDeductionsView';
import { EmployeesView } from './components/EmployeesView';
import { ForcePasswordChangeScreen } from './components/ForcePasswordChangeScreen';
import { LeavesView } from './components/LeavesView';
import { LoginView } from './components/LoginView';
import { OfflineScreen } from './components/OfflineScreen';
import { PayrollView } from './components/PayrollView';
import { ProfileSettingsMenu, SimPreset } from './components/ProfileSettingsMenu';
import { SettingsHubView, SettingsRouteSection } from './components/SettingsHubView';
import { SidebarNav } from './components/SidebarNav';
import { StartupErrorScreen } from './components/StartupErrorScreen';
import { getDirection, t } from './i18n/translations';
import { getAllowedNavRoutesForRole, isSettingsRoute, NavSection } from './types/nav';
import {
  api,
  ApiHttpError,
  DEFAULT_REQUEST_TIMEOUT_MS,
  ServerConfig,
  ServerUnreachableError,
  StartupLoadError,
} from './services/api';
import { nativeBridge } from './services/nativeBridge';
import {
  AppSettings,
  ApprovalWorkflow,
  AuthSession,
  Company,
  CreateEmployeePayload,
  Employee,
  EmployeeDocument,
  EmployeeLabel,
  EmployeeModel,
  EndpointFailure,
  GeofenceZone,
  GPSReading,
  HRDatabase,
  Language,
  LeaveStatus,
  LeaveType,
  PayrollAdjustment,
  PayrollCategoryItem,
  ProAssignment,
  SalaryReleaseStatus,
  Section,
  ShiftSchedule,
  UserRole,
} from './types/hr';
import {
  canActOnDeductionApproval,
  canRoleActOnLeaveStep,
  DEFAULT_DEDUCTION_WORKFLOW_CONFIG,
  evaluateClockInEligibility,
  getDocumentExpiryStatus,
  getScopedEmployees,
  getUserAttachedCompanyIds,
  inferDefaultEmployeeType,
  normalizeUserRole,
  resolveClockInPolicy,
} from './utils/hrLogic';

const LANG_KEY = 'yaldi_hr_lang_v1';
const THEME_KEY = 'yaldi_hr_theme_v1';

function getInitialLang(): Language {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ar' || saved === 'ur') return saved;
  } catch {
    // Ignore
  }
  return 'en';
}

function getInitialTheme(): 'light' | 'dark' {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
  } catch {
    // Ignore
  }
  return 'light';
}

function buildSessionFallbackEmployee(
  session: AuthSession,
  db?: HRDatabase | null
): Employee {
  const role = normalizeUserRole(session.role);
  return {
    id: session.userId || 'current-user',
    employeeCode: session.employeeCode || 'USER',
    fullName: session.fullName || session.email || 'Yaldi HR User',
    email: session.email || '',
    phone: '',
    avatarUrl: session.avatarUrl,
    mustChangePassword: Boolean(session.mustChangePassword),
    role,
    employeeType: inferDefaultEmployeeType({ role }),
    primaryCompanyId: session.primaryCompanyId || db?.companies[0]?.id || '',
    sharedCompanyIds: [],
    sectionId: session.sectionId || db?.sections[0]?.id || '',
    managedSectionIds: session.sectionId ? [session.sectionId] : [],
    labelIds: [],
    modelId: db?.employeeModels[0]?.id || '',
    jobTitle: '',
    joinDate: new Date().toISOString().slice(0, 10),
    active: true,
    assignedZoneIds: [],
    salary: {
      baseSalary: 0,
      housingAllowance: 0,
      transportAllowance: 0,
      otherAllowance: 0,
    },
    leaveBalance: {
      annualTotal: 30,
      annualUsed: 0,
      sickTotal: 15,
      sickUsed: 0,
      emergencyTotal: 5,
      emergencyUsed: 0,
      unpaidUsed: 0,
    },
  };
}

export function App() {
  const [lang, setLang] = useState<Language>(getInitialLang);
  const [theme, setTheme] = useState<'light' | 'dark'>(getInitialTheme);
  const [serverConfig, setServerConfig] = useState<ServerConfig>(() => api.getServerConfig());
  const [session, setSession] = useState<AuthSession | null>(() => api.auth.getSession());
  const [db, setDb] = useState<HRDatabase | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineReason, setOfflineReason] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<{
    failures: EndpointFailure[];
    isTimeout: boolean;
  } | null>(null);

  const [selectedCompanyId, setSelectedCompanyId] = useState<string>('all');
  const [activeNav, setActiveNav] = useState<NavSection>('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; message: string } | null>(null);

  const [simPreset, setSimPreset] = useState<SimPreset>('inside_primary');
  const [simulatedDevice, setSimulatedDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [liveGps, setLiveGps] = useState<GPSReading | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error' = 'success') => {
    setToast({ message, kind });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Apply RTL/LTR and lang attribute automatically
  useEffect(() => {
    const dir = getDirection(lang);
    document.documentElement.dir = dir;
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_KEY, lang);
    } catch {
      // Ignore
    }
  }, [lang]);

  // Apply light/dark theme class
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // Ignore
    }
  }, [theme]);

  // Network offline listener (Capacitor-ready bridge)
  useEffect(() => {
    return nativeBridge.onNetworkChange((online) => {
      if (!online && !serverConfig.useMockApi) {
        setOfflineReason('Device lost internet connectivity.');
      }
    });
  }, [serverConfig.useMockApi]);

  const loadDatabase = useCallback(
    async (sessionOverride?: AuthSession | null, showFullScreenLoader = false) => {
      const targetSession = sessionOverride !== undefined ? sessionOverride : session;
      if (targetSession?.mustChangePassword) {
        // Never fetch dashboard endpoints while a forced password change is pending
        setLoading(false);
        setStartupError(null);
        return;
      }

      if (showFullScreenLoader) {
        setLoading(true);
      }
      setStartupError(null);

      let timeoutTimer: number | undefined;
      try {
        const timeoutPromise = new Promise<never>((_, reject) => {
          timeoutTimer = window.setTimeout(() => {
            reject(
              new StartupLoadError(
                [
                  {
                    endpoint: '/api/v1/*',
                    status: 408,
                    statusText: 'Request Timeout',
                    message:
                      'Initial workspace loading timed out after 10 seconds. Verify your server is running and reachable.',
                    isTimeout: true,
                  },
                ],
                'Initial workspace loading timed out after 10 seconds.'
              )
            );
          }, DEFAULT_REQUEST_TIMEOUT_MS);
        });

        const data = await Promise.race([
          api.getDatabase(targetSession ? normalizeUserRole(targetSession.role) : undefined),
          timeoutPromise,
        ]);
        if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);

        setDb(data);
        setOfflineReason(null);
        setStartupError(null);
        setToast((prev) => (prev?.kind === 'error' ? null : prev));
      } catch (err) {
        if (timeoutTimer !== undefined) window.clearTimeout(timeoutTimer);
        if (err instanceof StartupLoadError) {
          setStartupError({ failures: err.failures, isTimeout: err.isTimeout });
          if (db) showToast(err.message, 'error');
        } else if (err instanceof ApiHttpError) {
          setStartupError({ failures: [err.toEndpointFailure()], isTimeout: err.isTimeout });
          if (db) showToast(err.message, 'error');
        } else if (err instanceof ServerUnreachableError) {
          setStartupError({
            failures: [
              {
                endpoint: err.endpoint || '/health',
                status: null,
                statusText: 'Network Error',
                message: err.message,
              },
            ],
            isTimeout: false,
          });
        } else {
          const msg = err instanceof Error ? err.message : 'Unable to load HR data.';
          setStartupError({
            failures: [
              {
                endpoint: '/api',
                status: null,
                statusText: 'Error',
                message: msg,
              },
            ],
            isTimeout: false,
          });
          if (db) showToast(msg, 'error');
        }
      } finally {
        setLoading(false);
      }
    },
    [db, session, showToast]
  );

  // Support ?autostart=1 for automated walkthroughs & quick preview
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !session) {
      void api.auth.demoLogin(UserRole.MainManager).then((s) => {
        setSession(s);
      });
      return;
    }
    if (!session) {
      setLoading(false);
      setStartupError(null);
      return;
    }
    if (session.mustChangePassword) {
      // Immediately render ForcePasswordChangeScreen WITHOUT calling dashboard endpoints
      setLoading(false);
      setStartupError(null);
      return;
    }
    void loadDatabase(session, true);
  }, [session?.token, session?.mustChangePassword]);

  const currentUser = useMemo<Employee | null>(() => {
    if (!session) return null;
    if (!db) return null;
    const byId = db.employees.find((e) => String(e.id) === String(session.userId));
    if (byId) return byId;
    if (session.email) {
      const byEmail = db.employees.find(
        (e) => e.email.toLowerCase() === session.email!.toLowerCase()
      );
      if (byEmail) return byEmail;
    }
    // Always fall back to a safe session-derived user so Live Mode never gets stuck on Loading
    return buildSessionFallbackEmployee(session, db);
  }, [db, session]);

  const activeRole: UserRole = normalizeUserRole(session?.role ?? currentUser?.role);

  // Companies accessible to the current user
  const accessibleCompanies = useMemo<Company[]>(() => {
    if (!db || !currentUser) return [];
    const activeOnes = db.companies.filter((c) => c.active);
    if (
      activeRole === UserRole.MainManager ||
      activeRole === UserRole.HRAdmin ||
      activeRole === UserRole.PRO
    ) {
      return activeOnes;
    }
    // Accounting & other roles strictly limited to explicitly attached companies
    const allowedIds = new Set(getUserAttachedCompanyIds(currentUser));
    return activeOnes.filter((c) => allowedIds.has(c.id));
  }, [db, currentUser, activeRole]);

  // Keep selectedCompanyId valid when switching roles
  useEffect(() => {
    if (!currentUser) return;
    if (activeRole === UserRole.MainManager || activeRole === UserRole.PRO) {
      if (
        selectedCompanyId !== 'all' &&
        !accessibleCompanies.some((c) => c.id === selectedCompanyId)
      ) {
        setSelectedCompanyId('all');
      }
    } else if (activeRole === UserRole.Accounting) {
      // Accounting strictly scoped to attached companies (allows 'all' across attached or single attached company)
      if (
        selectedCompanyId !== 'all' &&
        !accessibleCompanies.some((c) => c.id === selectedCompanyId)
      ) {
        setSelectedCompanyId(currentUser.primaryCompanyId);
      }
    } else {
      if (
        selectedCompanyId === 'all' ||
        !accessibleCompanies.some((c) => c.id === selectedCompanyId)
      ) {
        setSelectedCompanyId(currentUser.primaryCompanyId);
      }
    }
  }, [activeRole, currentUser, accessibleCompanies, selectedCompanyId]);

  const allowedNavIds = useMemo<NavSection[]>(
    () => getAllowedNavRoutesForRole(activeRole),
    [activeRole]
  );

  // Redirect away from unauthorized views when switching roles
  useEffect(() => {
    if (!allowedNavIds.includes(activeNav)) {
      setActiveNav(allowedNavIds[0]);
    }
  }, [activeNav, allowedNavIds]);

  // Strictly scoped employees (Company + RBAC Section/PRO Time-Limited/Accounting Attached Companies/Self)
  const scopedEmployees = useMemo<Employee[]>(() => {
    if (!db || !currentUser) return [];
    return getScopedEmployees({
      employees: db.employees,
      viewer: currentUser,
      activeRole,
      selectedCompanyId,
      proAssignments: db.proAssignments,
    });
  }, [db, currentUser, activeRole, selectedCompanyId]);

  const scopedEmployeeIds = useMemo(
    () => new Set(scopedEmployees.map((e) => e.id)),
    [scopedEmployees]
  );

  const scopedAttendance = useMemo(() => {
    if (!db) return [];
    return db.attendance.filter((a) => scopedEmployeeIds.has(a.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedLeaves = useMemo(() => {
    if (!db) return [];
    return db.leaves.filter((l) => scopedEmployeeIds.has(l.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedDocuments = useMemo(() => {
    if (!db) return [];
    return db.documents.filter((d) => scopedEmployeeIds.has(d.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedAdjustments = useMemo(() => {
    if (!db) return [];
    return db.payrollAdjustments.filter((p) => scopedEmployeeIds.has(p.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedPayrollEntries = useMemo(() => {
    if (!db) return [];
    return db.payrollEntries.filter((p) => scopedEmployeeIds.has(p.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedDeductionApprovals = useMemo(() => {
    if (!db) return [];
    return (db.deductionApprovals ?? []).filter((d) => scopedEmployeeIds.has(d.employeeId));
  }, [db, scopedEmployeeIds]);

  const scopedPatchReleases = useMemo(() => {
    if (!db) return [];
    return (db.patchReleases ?? []).filter((r) => scopedEmployeeIds.has(r.employeeId));
  }, [db, scopedEmployeeIds]);

  const pendingDeductionCount = useMemo(() => {
    if (!db || !currentUser) return 0;
    return scopedDeductionApprovals.filter((req) => {
      const perm = canActOnDeductionApproval({
        request: req,
        actorRole: activeRole,
        actorManagedSectionIds: currentUser.managedSectionIds,
      });
      return perm.canManagerAct || perm.canHrAct;
    }).length;
  }, [db, currentUser, activeRole, scopedDeductionApprovals]);

  // Compute simulated or live GPS reading for current user
  const gpsReading = useMemo<GPSReading | null>(() => {
    if (simPreset === 'live') return liveGps;
    if (!db || !currentUser) return null;

    const assignedZone =
      db.geofences.find((z) => currentUser.assignedZoneIds.includes(z.id) && z.active) ??
      db.geofences.find((z) => z.companyId === currentUser.primaryCompanyId && z.active) ??
      db.geofences[0];

    if (!assignedZone) return null;

    if (simPreset === 'inside_primary' || simPreset === 'late_25m') {
      return {
        latitude: assignedZone.latitude + 0.00018,
        longitude: assignedZone.longitude + 0.00012,
        accuracyMeters: 14,
        isSimulated: true,
        label: simPreset === 'late_25m' ? 'Inside Zone (+25m late)' : 'Inside Zone',
      };
    }
    if (simPreset === 'outside') {
      return {
        latitude: assignedZone.latitude + 0.0038,
        longitude: assignedZone.longitude + 0.0012,
        accuracyMeters: 18,
        isSimulated: true,
        label: 'Outside Zone (420m)',
      };
    }
    return {
      latitude: assignedZone.latitude + 0.0002,
      longitude: assignedZone.longitude + 0.0001,
      accuracyMeters: 280,
      isSimulated: true,
      label: 'Low Accuracy GPS (280m)',
    };
  }, [simPreset, liveGps, db, currentUser]);

  // Notifications for the minimalist header bell
  const notifications = useMemo(() => {
    if (!db || !currentUser) return [];
    if (activeRole === UserRole.Accounting) return [];
    const items: { id: string; title: string; detail: string; target: NavSection }[] = [];

    if (activeRole !== UserRole.PRO) {
      scopedLeaves.forEach((lv) => {
        if (
          lv.status === LeaveStatus.Pending &&
          canRoleActOnLeaveStep({ leave: lv, actorRole: activeRole, actorEmployee: currentUser })
        ) {
          const emp = db.employees.find((e) => e.id === lv.employeeId);
          items.push({
            id: `lv-${lv.id}`,
            title: `Leave Approval: ${emp?.fullName ?? 'Employee'}`,
            detail: `${lv.type} · ${lv.days} day${lv.days === 1 ? '' : 's'}`,
            target: 'leaves',
          });
        }
      });

      if (activeRole === UserRole.MainManager || activeRole === UserRole.SectionManager) {
        scopedEmployees
          .filter((e) => e.pendingShiftProposal)
          .forEach((emp) => {
            items.push({
              id: `shift-${emp.id}`,
              title: `Shift Proposal: ${emp.fullName}`,
              detail: `${emp.pendingShiftProposal?.shiftStart}–${emp.pendingShiftProposal?.shiftEnd}`,
              target: 'employees',
            });
          });
      }

      scopedDeductionApprovals.forEach((req) => {
        const emp = db.employees.find((e) => e.id === req.employeeId);
        if (!emp) return;
        const perm = canActOnDeductionApproval({
          request: req,
          actorRole: activeRole,
          actorManagedSectionIds: currentUser.managedSectionIds,
        });
        if (perm.canManagerAct || perm.canHrAct) {
          items.push({
            id: `da-${req.id}`,
            title: `Deduction Approval: ${emp.fullName}`,
            detail: `AED ${req.amountAED} · ${req.triggerType === 'off_day' ? 'Off-Day' : 'Latency'}`,
            target: 'deduction_approvals',
          });
        }
      });
    }

    scopedDocuments.forEach((doc) => {
      const expiry = getDocumentExpiryStatus(doc.expiryDate);
      if (expiry.status === 'expired' || expiry.status === 'expiring_soon') {
        const emp = db.employees.find((e) => e.id === doc.employeeId);
        const label =
          expiry.status === 'expired'
            ? `Expired ${Math.abs(expiry.daysRemaining)}d ago`
            : `Expires in ${expiry.daysRemaining}d`;
        items.push({
          id: `doc-${doc.id}`,
          title: `${doc.type} ${expiry.status === 'expired' ? 'Expired' : 'Expiring'}`,
          detail: `${emp?.fullName ?? 'Employee'} · ${label}`,
          target: 'documents',
        });
      }
    });

    return items.slice(0, 8);
  }, [
    db,
    currentUser,
    activeRole,
    scopedLeaves,
    scopedEmployees,
    scopedDocuments,
    scopedDeductionApprovals,
  ]);

  // --- Handlers ---
  const handleUpdateServerConfig = (next: ServerConfig) => {
    const saved = api.saveServerConfig(next);
    setServerConfig(saved);
    if (session && !session.mustChangePassword) {
      void loadDatabase(session);
    }
  };

  const handleEmailLogin = async (email: string, password: string) => {
    const nextSession = await api.auth.login(email, password);
    setDb(null);
    setStartupError(null);
    setOfflineReason(null);
    setSelectedCompanyId(
      normalizeUserRole(nextSession.role) === UserRole.MainManager ? 'all' : 'all'
    );
    if (nextSession.mustChangePassword) {
      // Do NOT trigger dashboard fetch when must_change_password is true
      setLoading(false);
    } else {
      setLoading(true);
    }
    setSession(nextSession);
  };

  const handleDemoRoleLogin = async (role: UserRole) => {
    const normalized = normalizeUserRole(role);
    const nextSession = await api.auth.demoLogin(normalized);
    setStartupError(null);
    setOfflineReason(null);
    setSession(nextSession);
    if (normalized === UserRole.Accounting) {
      setActiveNav('payroll');
    } else if (normalized === UserRole.PRO) {
      setSelectedCompanyId('all');
      setActiveNav('documents');
    } else {
      setActiveNav('dashboard');
    }
  };

  const handleSignOut = async () => {
    await api.auth.logout();
    setSession(null);
    setDb(null);
    setStartupError(null);
    setOfflineReason(null);
    setLoading(false);
    setActiveNav('dashboard');
  };

  const handleRequestLiveGPS = async () => {
    try {
      const pos = await nativeBridge.getCurrentPosition();
      setLiveGps({
        latitude: pos.latitude,
        longitude: pos.longitude,
        accuracyMeters: pos.accuracyMeters,
        isSimulated: false,
        label: 'Live GPS',
      });
      setSimPreset('live');
      showToast('Live GPS coordinates updated.');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Unable to read GPS.', 'error');
    }
  };

  const handleClockIn = async () => {
    if (!db || !currentUser) return;
    if (activeRole === UserRole.MainManager) {
      showToast('Main Manager accounts are exempt from attendance tracking.', 'error');
      return;
    }
    const assignedZones = db.geofences.filter((z) => currentUser.assignedZoneIds.includes(z.id));
    const evaluation = evaluateClockInEligibility({
      reading: gpsReading,
      assignedZones,
      effectivePolicy: resolveClockInPolicy(currentUser, db.settings.globalClockInPolicy),
      isDesktopDevice: simulatedDevice === 'desktop',
      maxAccuracyMeters: db.settings.maxMobileAccuracyMeters,
      hasNoAssignedZones: currentUser.assignedZoneIds.length === 0,
    });
    if (!evaluation.allowed) {
      showToast(evaluation.reason, 'error');
      return;
    }
    if (!evaluation.isGeofenceExempt && (!evaluation.nearestZone || !gpsReading)) {
      showToast(evaluation.reason, 'error');
      return;
    }

    const activeCompanyId =
      selectedCompanyId !== 'all' ? selectedCompanyId : currentUser.primaryCompanyId;
    const zoneId = evaluation.isGeofenceExempt ? 'exempt' : evaluation.nearestZone!.id;
    const zoneName = evaluation.isGeofenceExempt
      ? 'Geofence Exempt'
      : evaluation.nearestZone!.name;

    await api.attendance.clockIn({
      employeeId: currentUser.id,
      companyId: activeCompanyId,
      zoneId,
      zoneName,
      latitude: gpsReading?.latitude ?? 0,
      longitude: gpsReading?.longitude ?? 0,
      accuracyMeters: gpsReading?.accuracyMeters ?? 0,
      punchSource: evaluation.punchSource,
      simulateLateMinutes: simPreset === 'late_25m' ? 25 : undefined,
    });
    await loadDatabase();
    showToast(`Clocked in (${zoneName}).`);
  };

  const handleClockOut = async (logId: string) => {
    await api.attendance.clockOut({
      logId,
      latitude: gpsReading?.latitude ?? 0,
      longitude: gpsReading?.longitude ?? 0,
    });
    await loadDatabase();
    showToast('Clocked out successfully.');
  };

  // --- Render Offline Screen ---
  if (offlineReason) {
    return (
      <OfflineScreen
        lang={lang}
        serverUrl={serverConfig.apiBaseUrl}
        reason={offlineReason}
        onRetry={async () => {
          const ok = await api.pingServer();
          if (ok) {
            setOfflineReason(null);
            await loadDatabase();
          } else {
            setOfflineReason(`Still unable to reach ${serverConfig.apiBaseUrl}.`);
          }
        }}
        onSwitchToDemoMode={() => {
          const saved = api.saveServerConfig({ ...serverConfig, useMockApi: true });
          setServerConfig(saved);
          setOfflineReason(null);
          void loadDatabase();
        }}
      />
    );
  }

  // --- Render Login Screen ---
  if (!session) {
    return (
      <LoginView
        lang={lang}
        onChangeLang={setLang}
        serverConfig={serverConfig}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onUpdateServerConfig={handleUpdateServerConfig}
        onEmailLogin={handleEmailLogin}
        onDemoRoleLogin={handleDemoRoleLogin}
      />
    );
  }

  // --- MANDATORY FIRST-LOGIN PASSWORD CHANGE BLOCKER (BEFORE DASHBOARD FETCH!) ---
  if (session.mustChangePassword || currentUser?.mustChangePassword) {
    const forceUser = currentUser ?? buildSessionFallbackEmployee(session, db);
    return (
      <ForcePasswordChangeScreen
        lang={lang}
        currentUser={forceUser}
        activeRole={activeRole}
        onChangePassword={async (newPassword: string) => {
          const updatedSession = await api.auth.changePassword({
            userId: session.userId || forceUser.id,
            newPassword,
            isForcedFirstLogin: true,
          });
          const nextSession: AuthSession = updatedSession
            ? { ...updatedSession, mustChangePassword: false }
            : { ...session, mustChangePassword: false };
          setStartupError(null);
          setLoading(true);
          setSession(nextSession);
          showToast('Password updated. Welcome to Yaldi HR!');
        }}
        onSignOut={() => handleSignOut()}
      />
    );
  }

  // --- Startup Loading Error / Timeout Card (No Infinite White Screen) ---
  if (startupError && !db) {
    return (
      <StartupErrorScreen
        lang={lang}
        apiBaseUrl={serverConfig.apiBaseUrl}
        failures={startupError.failures}
        isTimeout={startupError.isTimeout}
        onRetry={async () => {
          await loadDatabase(session);
        }}
        onSignOut={() => handleSignOut()}
        onSwitchToDemoMode={
          !serverConfig.useMockApi
            ? () => {
                const saved = api.saveServerConfig({ ...serverConfig, useMockApi: true });
                setServerConfig(saved);
                setStartupError(null);
                void api.auth.demoLogin(activeRole).then((s) => setSession(s));
              }
            : undefined
        }
      />
    );
  }

  // --- Loading State (Protected by 10-Second Timeout) ---
  if (loading || !db || !currentUser) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center px-5">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xs text-center space-y-4">
          <div className="w-9 h-9 mx-auto rounded-full border-2 border-teal-200 dark:border-teal-900 border-t-teal-600 dark:border-t-teal-400 animate-spin" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">
              {t(lang, 'loadingWorkspace')}
            </p>
            {!serverConfig.useMockApi && (
              <p className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                {serverConfig.apiBaseUrl}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="text-xs font-medium text-slate-500 hover:text-rose-600 dark:text-slate-400 dark:hover:text-rose-400 cursor-pointer"
          >
            {t(lang, 'signOut')}
          </button>
        </div>
      </div>
    );
  }

  const canAccessSettings =
    activeRole === UserRole.MainManager || activeRole === UserRole.HRAdmin;
  const canAccessEarningsDeductions =
    activeRole === UserRole.MainManager ||
    activeRole === UserRole.HRAdmin ||
    activeRole === UserRole.Accounting ||
    activeRole === UserRole.SectionManager;

  const mobileCandidateNavs: {
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { id: 'dashboard', label: t(lang, 'navDashboard'), icon: LayoutDashboard },
    { id: 'attendance', label: t(lang, 'navAttendance'), icon: Clock },
    activeRole === UserRole.PRO || activeRole === UserRole.Employee
      ? {
          id: 'documents',
          label: activeRole === UserRole.PRO ? t(lang, 'navProDocs') : t(lang, 'navMyDocs'),
          icon: FolderOpen,
        }
      : { id: 'employees', label: t(lang, 'navEmployees'), icon: Users },
    { id: 'leaves', label: t(lang, 'navLeaves'), icon: CalendarClock },
    {
      id: 'payroll',
      label: activeRole === UserRole.Employee ? t(lang, 'navMySalary') : t(lang, 'navPayroll'),
      icon: Wallet,
    },
    {
      id: 'earnings_deductions',
      label: t(lang, 'navEarningsDeductions'),
      icon: SlidersHorizontal,
    },
  ];

  // Mobile bottom nav keeps max 5 clean thumb targets
  const mobileNavItems = mobileCandidateNavs
    .filter((item) => allowedNavIds.includes(item.id))
    .slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50/70 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col">
      {/* ====================================================================
          MINIMALIST TOP HEADER — STRICTLY 4 ELEMENTS:
          1. Yaldi HR Logo
          2. Company Switcher
          3. Notification Bell (with red dot)
          4. User Profile Icon (tucks Language, Theme, Role, GPS, Server)
         ==================================================================== */}
      <header className="sticky top-0 z-30 h-[52px] lg:h-[60px] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 px-3 sm:px-5 pt-safe flex items-center justify-between gap-2 sm:gap-4 print:hidden">
        {/* 1. Yaldi HR Logo */}
        <button
          type="button"
          onClick={() => setActiveNav(allowedNavIds[0] ?? 'dashboard')}
          className="flex items-center gap-2.5 shrink-0 cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
            <MapPin className="w-4 h-4" />
          </div>
          <span className="font-display text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-white whitespace-nowrap">
            {t(lang, 'brand')}
          </span>
        </button>

        {/* 2. Company Switcher */}
        <div className="flex-1 max-w-xs min-w-0 flex justify-center">
          <div className="relative w-full max-w-[240px]">
            <Building2 className="w-3.5 h-3.5 text-teal-600 dark:text-teal-400 absolute start-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              aria-label="Company Switcher"
              value={selectedCompanyId}
              onChange={(e) => setSelectedCompanyId(e.target.value)}
              className="w-full ps-8 pe-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 truncate cursor-pointer focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-600"
            >
              {(activeRole === UserRole.MainManager ||
                activeRole === UserRole.PRO ||
                (activeRole === UserRole.Accounting && accessibleCompanies.length > 1)) && (
                <option value="all">
                  {activeRole === UserRole.Accounting
                    ? 'All Attached Companies'
                    : t(lang, 'allCompanies')}
                </option>
              )}
              {accessibleCompanies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 3. Notification Bell & 4. User Profile Icon */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 3. Notification Bell */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setNotificationsOpen((prev) => !prev)}
              aria-label={t(lang, 'notifications')}
              className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notifications.length > 0 && (
                <span className="absolute top-1.5 end-1.5 w-2 h-2 rounded-full bg-rose-600 ring-2 ring-white dark:ring-slate-900" />
              )}
            </button>

            {notificationsOpen && (
              <div
                role="dialog"
                aria-label={t(lang, 'notifications')}
                className="absolute end-0 mt-2 w-80 max-w-[calc(100vw-24px)] rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-40 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {t(lang, 'notifications')} ({notifications.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="p-4 text-xs text-slate-500 text-center">{t(lang, 'allClear')}</p>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-72 overflow-y-auto">
                    {notifications.map((n) => (
                      <button
                        key={n.id}
                        type="button"
                        onClick={() => {
                          setNotificationsOpen(false);
                          setActiveNav(n.target);
                        }}
                        className="w-full px-4 py-3 text-start hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                      >
                        <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                          {n.title}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                          {n.detail}
                        </p>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4. User Profile Icon */}
          <button
            type="button"
            onClick={() => {
              setNotificationsOpen(false);
              setProfileMenuOpen(true);
            }}
            aria-label="Open profile and quick settings"
            className="rounded-full p-0.5 border border-slate-200 dark:border-slate-700 hover:border-teal-400 transition-colors cursor-pointer"
          >
            <Avatar src={currentUser.avatarUrl} name={currentUser.fullName} size="sm" />
          </button>
        </div>
      </header>

      {/* Main Body: Desktop Grouped Collapsible Left Sidebar + Content */}
      <div className="flex-1 flex min-h-0">
        <SidebarNav
          lang={lang}
          activeRole={activeRole}
          activeNav={activeNav}
          allowedNavIds={allowedNavIds}
          collapsed={sidebarCollapsed}
          pendingDeductionCount={pendingDeductionCount}
          onSelectNav={setActiveNav}
          onToggleCollapse={() => setSidebarCollapsed((c) => !c)}
        />

        {/* Active View Content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-6 pb-[80px] lg:pb-10 max-w-7xl mx-auto w-full">
          {/* Mobile shortcuts for routes beyond the 5-tab bottom bar */}
          {(canAccessSettings || canAccessEarningsDeductions) && (
            <div className="lg:hidden mb-4 flex flex-wrap justify-end gap-2">
              {canAccessEarningsDeductions &&
                !mobileNavItems.some((m) => m.id === 'earnings_deductions') &&
                activeNav !== 'earnings_deductions' && (
                  <button
                    type="button"
                    onClick={() => setActiveNav('earnings_deductions')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                  >
                    <SlidersHorizontal className="w-3.5 h-3.5 text-teal-600" />
                    {t(lang, 'navEarningsDeductions')}
                  </button>
                )}
              {canAccessSettings && !isSettingsRoute(activeNav) && (
                <button
                  type="button"
                  onClick={() => setActiveNav('settings_companies')}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
                >
                  <Settings className="w-3.5 h-3.5 text-teal-600" />
                  {t(lang, 'navSettings')}
                </button>
              )}
            </div>
          )}

          {activeNav === 'dashboard' && (
            <DashboardView
              lang={lang}
              currentUser={currentUser}
              activeRole={activeRole}
              selectedCompanyId={selectedCompanyId}
              companies={db.companies}
              sections={db.sections}
              models={db.employeeModels}
              scopedEmployees={scopedEmployees}
              geofences={db.geofences}
              documents={scopedDocuments}
              attendance={scopedAttendance}
              leaves={scopedLeaves}
              payrollAdjustments={scopedAdjustments}
              payrollEntries={scopedPayrollEntries}
              deductionApprovals={scopedDeductionApprovals}
              patchReleases={scopedPatchReleases}
              salaryReleases={db.salaryReleases}
              proAssignments={db.proAssignments}
              settings={db.settings}
              gpsReading={gpsReading}
              simulatedDevice={simulatedDevice}
              onNavigate={setActiveNav}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
              onDecideShiftProposal={async (employeeId, approve) => {
                await api.employees.decideShiftProposal(employeeId, approve);
                await loadDatabase();
                showToast(approve ? 'Shift proposal approved.' : 'Shift proposal rejected.');
              }}
              onRefresh={loadDatabase}
            />
          )}

          {activeNav === 'attendance' && (
            <AttendanceView
              lang={lang}
              currentUser={currentUser}
              activeRole={activeRole}
              selectedCompanyId={selectedCompanyId}
              companies={db.companies}
              models={db.employeeModels}
              scopedEmployees={scopedEmployees}
              geofences={db.geofences}
              attendance={scopedAttendance}
              attendanceAudit={db.attendanceAudit}
              settings={db.settings}
              gpsReading={gpsReading}
              simulatedDevice={simulatedDevice}
              onClockIn={handleClockIn}
              onClockOut={handleClockOut}
              onAcceptExcuse={async ({ logId, excuseNote }) => {
                await api.attendance.acceptLatenessExcuse({
                  logId,
                  actorName: currentUser.fullName,
                  actorRole: activeRole,
                  excuseNote,
                });
                await loadDatabase();
                showToast('Lateness excuse accepted & logged in audit trail.');
              }}
              onModifyRecord={async ({ logId, clockInHHmm, clockOutHHmm, reason }) => {
                await api.attendance.modifyRecord({
                  logId,
                  clockInHHmm,
                  clockOutHHmm,
                  reason,
                  actorName: currentUser.fullName,
                  actorRole: activeRole,
                });
                await loadDatabase();
                showToast('Attendance record updated & logged in audit trail.');
              }}
            />
          )}

          {(activeNav === 'employees' ||
            activeNav === 'documents' ||
            activeNav === 'pro_assignments') &&
            activeRole !== UserRole.Accounting && (
              <EmployeesView
                lang={lang}
                mode={
                  activeNav === 'documents'
                    ? 'documents'
                    : activeNav === 'pro_assignments'
                      ? 'pro_assignments'
                      : 'directory'
                }
                currentUser={currentUser}
                activeRole={activeRole}
                selectedCompanyId={selectedCompanyId}
                companies={db.companies}
                sections={db.sections}
                labels={db.labels}
                proAssignments={db.proAssignments}
                models={db.employeeModels}
                scopedEmployees={scopedEmployees}
                allEmployees={db.employees}
                geofences={db.geofences}
                documents={scopedDocuments}
                attendance={scopedAttendance}
                leaves={scopedLeaves}
                payrollAdjustments={scopedAdjustments}
                payrollEntries={scopedPayrollEntries}
                payrollCategories={db.payrollCategories}
                deductionApprovals={scopedDeductionApprovals}
                patchReleases={scopedPatchReleases}
                deductionWorkflowConfig={
                  db.settings.deductionWorkflowConfig ?? DEFAULT_DEDUCTION_WORKFLOW_CONFIG
                }
                salaryReleases={db.salaryReleases}
                customDocumentTypes={db.settings.customDocumentTypes}
                onCreateEmployee={async (emp: CreateEmployeePayload, additionalIncomes) => {
                  const created = await api.employees.create(emp);
                  for (const inc of additionalIncomes) {
                    await api.payrollEntries.create({
                      employeeId: created.id,
                      companyId: created.primaryCompanyId,
                      type: 'earning_in_payroll',
                      categoryId: inc.categoryId,
                      categoryName: inc.categoryName,
                      amountAED: inc.amountAED,
                      isPermanent: inc.isPermanent,
                      effectiveFrom: inc.effectiveFrom,
                      durationMonths: inc.durationMonths,
                      targetBucket: null,
                      reason: inc.reason,
                      createdBy: currentUser.fullName,
                      createdByRole: activeRole,
                    });
                  }
                  await loadDatabase();
                  showToast(
                    additionalIncomes.length > 0
                      ? `${emp.fullName} added with ${additionalIncomes.length} additional income item${additionalIncomes.length === 1 ? '' : 's'}.`
                      : `${emp.fullName} added (password change required on first login).`
                  );
                }}
                onUpdateEmployee={async (id, patch) => {
                  await api.employees.update(id, patch);
                  await loadDatabase();
                  showToast('Employee profile updated.');
                }}
                onProposeShift={async (employeeId: string, schedule: ShiftSchedule) => {
                  await api.employees.proposeShift(employeeId, schedule, currentUser.fullName);
                  await loadDatabase();
                  showToast('Shift proposed — pending Manager approval.');
                }}
                onDecideShiftProposal={async (employeeId, approve) => {
                  await api.employees.decideShiftProposal(employeeId, approve);
                  await loadDatabase();
                  showToast(approve ? 'Shift schedule approved.' : 'Shift proposal declined.');
                }}
                onUploadDocument={async (doc: Omit<EmployeeDocument, 'id' | 'uploadedAt'>) => {
                  await api.documents.upload(doc);
                  await loadDatabase();
                  showToast(`${doc.type} uploaded to vault.`);
                }}
                onDeleteDocument={async (id) => {
                  await api.documents.remove(id);
                  await loadDatabase();
                  showToast('Document removed.');
                }}
                onCreateProAssignment={async (input: Omit<ProAssignment, 'id' | 'createdAt'>) => {
                  await api.proAssignments.create(input);
                  await loadDatabase();
                  showToast('PRO time-limited document access granted.');
                }}
                onDeleteProAssignment={async (id) => {
                  await api.proAssignments.remove(id);
                  await loadDatabase();
                  showToast('PRO document access revoked.');
                }}
              />
            )}

          {activeNav === 'leaves' && (
            <LeavesView
              lang={lang}
              currentUser={currentUser}
              activeRole={activeRole}
              scopedEmployees={scopedEmployees}
              leaves={scopedLeaves}
              onSubmitLeave={async (input: {
                type: LeaveType;
                startDate: string;
                endDate: string;
                days: number;
                reason: string;
                attachmentName?: string;
                attachmentDataUrl?: string;
              }) => {
                await api.leaves.submit({
                  employeeId: currentUser.id,
                  companyId: currentUser.primaryCompanyId,
                  sectionId: currentUser.sectionId,
                  applicantRole: activeRole,
                  ...input,
                });
                await loadDatabase();
                showToast('Leave request submitted.');
              }}
              onDecideLeaveStep={async ({ leaveId, decision, remark }) => {
                await api.leaves.decideStep({
                  leaveId,
                  decision,
                  actorName: currentUser.fullName,
                  remark,
                });
                await loadDatabase();
                showToast(
                  decision === 'approved' ? 'Leave step approved.' : 'Leave request rejected.'
                );
              }}
              onAddCoManagerNote={async ({ leaveId, note }) => {
                await api.leaves.addCoManagerNote({
                  leaveId,
                  authorName: currentUser.fullName,
                  note,
                });
                await loadDatabase();
                showToast('Recommendation note saved.');
              }}
            />
          )}

          {(activeNav === 'payroll' ||
            activeNav === 'patch_releases' ||
            activeNav === 'release_schedules') &&
            activeRole !== UserRole.PRO && (
              <PayrollView
                lang={lang}
                section={
                  activeNav === 'patch_releases'
                    ? 'patch_releases'
                    : activeNav === 'release_schedules'
                      ? 'release_schedules'
                      : 'overview'
                }
                currentUser={currentUser}
              activeRole={activeRole}
              selectedCompanyId={selectedCompanyId}
              companies={db.companies}
              sections={db.sections}
              labels={db.labels}
              scopedEmployees={scopedEmployees}
              attendance={scopedAttendance}
              leaves={scopedLeaves}
              adjustments={scopedAdjustments}
              payrollEntries={scopedPayrollEntries}
              deductionApprovals={scopedDeductionApprovals}
              patchReleases={scopedPatchReleases}
              salaryReleases={db.salaryReleases}
              settings={db.settings}
              onAddAdjustment={async (input: Omit<PayrollAdjustment, 'id' | 'createdAt'>) => {
                await api.payroll.addAdjustment(input);
                await loadDatabase();
                showToast('Payroll adjustment logged.');
              }}
              onRemoveAdjustment={async (id) => {
                await api.payroll.removeAdjustment(id);
                await loadDatabase();
                showToast('Adjustment removed.');
              }}
              onUpsertReleaseSchedule={async (input: {
                month: string;
                payPeriod: string;
                scopeType: 'section' | 'employee';
                scopeId: string;
                companyId: string | 'all';
                releaseDate: string;
                status: SalaryReleaseStatus;
                delayedUntilDate?: string | null;
                delayReason?: string | null;
                updatedBy: string;
              }) => {
                await api.payroll.upsertReleaseSchedule(input);
                await loadDatabase();
                showToast(
                  input.status === 'Delayed'
                    ? 'Salary release delayed and employees notified.'
                    : 'Salary release schedule saved.'
                );
              }}
              onCreatePatchRelease={async (input) => {
                await api.patchReleases.create(input);
                await loadDatabase();
                showToast('Patch money release recorded & WPS offsets updated.');
              }}
              onDeletePatchRelease={async (id) => {
                await api.patchReleases.remove(id);
                await loadDatabase();
                showToast('Patch release removed.');
              }}
            />
          )}

          {(activeNav === 'earnings_deductions' || activeNav === 'deduction_approvals') &&
            canAccessEarningsDeductions && (
              <EarningsDeductionsView
                lang={lang}
                mode={activeNav === 'deduction_approvals' ? 'approvals' : 'entries'}
                currentUser={currentUser}
              activeRole={activeRole}
              companies={db.companies}
              scopedEmployees={scopedEmployees}
              categories={db.payrollCategories}
              entries={scopedPayrollEntries}
              deductionApprovals={scopedDeductionApprovals}
              deductionWorkflowConfig={
                db.settings.deductionWorkflowConfig ?? DEFAULT_DEDUCTION_WORKFLOW_CONFIG
              }
              onCreateEntry={async (input) => {
                await api.payrollEntries.create(input);
                await loadDatabase();
                showToast('Payroll entry saved.');
              }}
              onEditPermanentEntry={async (params) => {
                await api.payrollEntries.editPermanent(params);
                await loadDatabase();
                showToast('Permanent earning updated — historical months preserved.');
              }}
              onStopPermanentEntry={async (params) => {
                await api.payrollEntries.stopPermanent(params);
                await loadDatabase();
                showToast('Permanent earning stopped — historical months preserved.');
              }}
              onDeleteEntry={async (id) => {
                await api.payrollEntries.remove(id);
                await loadDatabase();
                showToast('Entry removed.');
              }}
              onCreateDeductionApproval={async (input) => {
                await api.deductionApprovals.create({
                  ...input,
                  createdBy: currentUser.fullName,
                  createdByRole: activeRole,
                });
                await loadDatabase();
                showToast('Deduction request submitted into approval workflow.');
              }}
              onManagerDecideDeduction={async (id, decision, note) => {
                await api.deductionApprovals.managerDecide({
                  id,
                  decision,
                  actorName: currentUser.fullName,
                  note,
                });
                await loadDatabase();
                showToast(
                  decision === 'approved'
                    ? 'Manager approved — routed to HR for final approval.'
                    : 'Manager recommended waive — routed to HR for final decision.'
                );
              }}
              onHrDecideDeduction={async (id, decision, note) => {
                await api.deductionApprovals.hrDecide({
                  id,
                  decision,
                  actorName: currentUser.fullName,
                  note,
                });
                await loadDatabase();
                showToast(
                  decision === 'approved'
                    ? 'Deduction finalized and applied to payroll.'
                    : 'Deduction waived — will not reduce payroll.'
                );
              }}
            />
          )}

          {isSettingsRoute(activeNav) && canAccessSettings && (
            <SettingsHubView
              lang={lang}
              activeSection={activeNav.replace('settings_', '') as SettingsRouteSection}
              currentUser={currentUser}
              activeRole={activeRole}
              companies={db.companies}
              sections={db.sections}
              labels={db.labels}
              proAssignments={db.proAssignments}
              models={db.employeeModels}
              employees={db.employees}
              geofences={db.geofences}
              workflows={db.workflows}
              payrollCategories={db.payrollCategories}
              settings={db.settings}
              onCreateCompany={async (input: Omit<Company, 'id'>) => {
                await api.companies.create(input);
                await loadDatabase();
                showToast(`${input.name} added to group.`);
              }}
              onUpdateCompany={async (id, patch) => {
                await api.companies.update(id, patch);
                await loadDatabase();
                showToast('Company details & WPS configuration saved.');
              }}
              onToggleCompanyActive={async (id) => {
                await api.companies.toggleActive(id);
                await loadDatabase();
              }}
              onCreatePayrollCategory={async (input: Omit<PayrollCategoryItem, 'id'>) => {
                await api.payrollCategories.create(input);
                await loadDatabase();
                showToast(`Category "${input.name}" created.`);
              }}
              onUpdatePayrollCategory={async (id, patch) => {
                await api.payrollCategories.update(id, patch);
                await loadDatabase();
                showToast('Category updated.');
              }}
              onCreateSection={async (input: Omit<Section, 'id'>) => {
                await api.sections.create(input);
                await loadDatabase();
                showToast(`Section "${input.name}" added.`);
              }}
              onCreateLabel={async (input: Omit<EmployeeLabel, 'id'>) => {
                await api.labels.create(input);
                await loadDatabase();
                showToast(`Status label "${input.name}" created.`);
              }}
              onUpdateLabel={async (id, patch) => {
                await api.labels.update(id, patch);
                await loadDatabase();
                showToast('Status label updated.');
              }}
              onDeleteLabel={async (id) => {
                await api.labels.remove(id);
                await loadDatabase();
                showToast('Status label deleted.');
              }}
              onCreateProAssignment={async (input: Omit<ProAssignment, 'id' | 'createdAt'>) => {
                await api.proAssignments.create(input);
                await loadDatabase();
                showToast('PRO time-limited document access granted.');
              }}
              onDeleteProAssignment={async (id) => {
                await api.proAssignments.remove(id);
                await loadDatabase();
                showToast('PRO document access revoked.');
              }}
              onBulkAssignZones={async (params) => {
                const count = await api.employees.bulkAssignZones(params);
                await loadDatabase();
                showToast(`Updated geofence zones for ${count} employee${count === 1 ? '' : 's'}.`);
                return count;
              }}
              onUpdateEmployee={async (id, patch) => {
                await api.employees.update(id, patch);
                await loadDatabase();
                showToast('Manager section assignments updated.');
              }}
              onCreateModel={async (input: Omit<EmployeeModel, 'id'>) => {
                await api.models.create(input);
                await loadDatabase();
                showToast(`Model "${input.name}" created.`);
              }}
              onUpdateModel={async (id, patch) => {
                await api.models.update(id, patch);
                await loadDatabase();
                showToast('Employee model updated.');
              }}
              onSaveWorkflow={async (wf: Omit<ApprovalWorkflow, 'id'> & { id?: string }) => {
                await api.workflows.save(wf);
                await loadDatabase();
                showToast(`Workflow "${wf.name}" saved.`);
              }}
              onDeleteWorkflow={async (id) => {
                await api.workflows.remove(id);
                await loadDatabase();
                showToast('Workflow deleted.');
              }}
              onCreateGeofence={async (zone: Omit<GeofenceZone, 'id'>) => {
                await api.geofences.create(zone);
                await loadDatabase();
                showToast(`Geofence "${zone.name}" saved.`);
              }}
              onUpdateGeofence={async (id, patch) => {
                await api.geofences.update(id, patch);
                await loadDatabase();
              }}
              onDeleteGeofence={async (id) => {
                await api.geofences.remove(id);
                await loadDatabase();
                showToast('Geofence deleted.');
              }}
              onUpdateSettings={async (patch: Partial<AppSettings>) => {
                await api.settings.update(patch);
                await loadDatabase();
                showToast('Settings updated.');
              }}
              onPreviewOfflineScreen={() =>
                setOfflineReason(
                  'Offline preview active. Tap Retry Connection or switch back to Demo Mode.'
                )
              }
              onResetDemoData={async () => {
                await api.resetDemoData();
                await loadDatabase();
                showToast('Demo dataset restored.');
              }}
            />
          )}
        </main>
      </div>

      {/* Mobile Fixed Bottom Navigation Bar (<1024px) */}
      <nav
        aria-label="Mobile Navigation"
        style={{
          gridTemplateColumns: `repeat(${Math.max(1, mobileNavItems.length)}, minmax(0, 1fr))`,
        }}
        className="lg:hidden fixed bottom-0 inset-x-0 z-30 h-[60px] pb-safe bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200 dark:border-slate-800 grid px-1 print:hidden"
      >
        {mobileNavItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveNav(item.id)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium cursor-pointer ${
                active
                  ? 'text-teal-700 dark:text-teal-300 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="truncate max-w-full px-1">{item.label}</span>
            </button>
          );
        })}
      </nav>

      {/* User Profile & Quick Settings Menu */}
      <ProfileSettingsMenu
        open={profileMenuOpen}
        onClose={() => setProfileMenuOpen(false)}
        currentUser={currentUser}
        activeRole={activeRole}
        lang={lang}
        theme={theme}
        serverConfig={serverConfig}
        simPreset={simPreset}
        simulatedDevice={simulatedDevice}
        onChangeLang={setLang}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        onSwitchDemoRole={(role) => void handleDemoRoleLogin(role)}
        onChangeSimPreset={setSimPreset}
        onChangeSimulatedDevice={setSimulatedDevice}
        onRequestLiveGPS={() => void handleRequestLiveGPS()}
        onUpdateServerConfig={handleUpdateServerConfig}
        onOpenChangePassword={() => setChangePasswordOpen(true)}
        onSignOut={() => void handleSignOut()}
      />

      {/* Self-Service Change Password Modal */}
      <ChangePasswordModal
        open={changePasswordOpen}
        lang={lang}
        onClose={() => setChangePasswordOpen(false)}
        onSubmit={async (currentPassword, newPassword) => {
          await api.auth.changePassword({
            userId: currentUser.id,
            currentPassword,
            newPassword,
            isForcedFirstLogin: false,
          });
          await loadDatabase();
          showToast('Password updated successfully.');
        }}
      />

      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          className={`fixed bottom-20 lg:bottom-6 end-4 z-50 px-4 py-2.5 rounded-xl shadow-lg text-xs font-semibold flex items-center gap-2 print:hidden ${
            toast.kind === 'error'
              ? 'bg-rose-600 text-white'
              : 'bg-slate-900 dark:bg-teal-600 text-white'
          }`}
        >
          {toast.kind === 'error' ? (
            <AlertTriangle className="w-4 h-4 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}

export default App;
