import { UserRole } from '../types/hr';
import { normalizeUserRole } from '../utils/hrLogic';

export type NavSection =
  | 'dashboard'
  | 'requests'
  | 'employees'
  | 'documents'
  | 'pro_assignments'
  | 'attendance'
  | 'leaves'
  | 'payroll'
  | 'earnings_deductions'
  | 'deduction_approvals'
  | 'patch_releases'
  | 'release_schedules'
  | 'settings_companies'
  | 'settings_groups'
  | 'settings_projects'
  | 'settings_visibility_rules'
  | 'settings_workflow_templates'
  | 'settings_models'
  | 'settings_geofences'
  | 'settings_payroll_workflows'
  | 'settings_general';

export type SidebarGroupId = 'people' | 'time' | 'payroll' | 'settings';

export interface SidebarNavItem {
  id: NavSection;
  labelKey: string;
  groupId: SidebarGroupId | 'root';
}

export interface SidebarGroupSpec {
  id: SidebarGroupId;
  labelKey: string;
  items: SidebarNavItem[];
}

export const SIDEBAR_GROUPS: SidebarGroupSpec[] = [
  {
    id: 'people',
    labelKey: 'navGroupPeople',
    items: [
      { id: 'employees', labelKey: 'navDirectory', groupId: 'people' },
      { id: 'documents', labelKey: 'navDocuments', groupId: 'people' },
      { id: 'pro_assignments', labelKey: 'navProAssignments', groupId: 'people' },
    ],
  },
  {
    id: 'time',
    labelKey: 'navGroupTime',
    items: [
      { id: 'attendance', labelKey: 'navAttendanceLogs', groupId: 'time' },
      { id: 'leaves', labelKey: 'navLeaveRequests', groupId: 'time' },
    ],
  },
  {
    id: 'payroll',
    labelKey: 'navGroupPayroll',
    items: [
      { id: 'payroll', labelKey: 'navPayrollOverview', groupId: 'payroll' },
      { id: 'earnings_deductions', labelKey: 'navEarningsDeductions', groupId: 'payroll' },
      { id: 'deduction_approvals', labelKey: 'navDeductionApprovals', groupId: 'payroll' },
      { id: 'patch_releases', labelKey: 'navPatchReleases', groupId: 'payroll' },
      { id: 'release_schedules', labelKey: 'navReleaseSchedules', groupId: 'payroll' },
    ],
  },
  {
    id: 'settings',
    labelKey: 'navGroupOrganizationSettings',
    items: [
      { id: 'settings_companies', labelKey: 'navSettingsCompanies', groupId: 'settings' },
      { id: 'settings_groups', labelKey: 'navSettingsGroups', groupId: 'settings' },
      { id: 'settings_projects', labelKey: 'navSettingsProjects', groupId: 'settings' },
      { id: 'settings_visibility_rules', labelKey: 'navSettingsVisibilityRules', groupId: 'settings' },
      {
        id: 'settings_workflow_templates',
        labelKey: 'navSettingsWorkflowTemplates',
        groupId: 'settings',
      },
      { id: 'settings_models', labelKey: 'navSettingsModels', groupId: 'settings' },
      { id: 'settings_geofences', labelKey: 'navSettingsGeofences', groupId: 'settings' },
      {
        id: 'settings_payroll_workflows',
        labelKey: 'navSettingsPayrollWorkflows',
        groupId: 'settings',
      },
      { id: 'settings_general', labelKey: 'navSettingsGeneral', groupId: 'settings' },
    ],
  },
];

export function getAllowedNavRoutesForRole(role: UserRole | string): NavSection[] {
  const normalized = normalizeUserRole(role);

  if (
    normalized === UserRole.MainManager ||
    normalized === UserRole.HRManager ||
    normalized === UserRole.HRAdmin
  ) {
    return [
      'dashboard',
      'requests',
      'employees',
      'documents',
      'pro_assignments',
      'attendance',
      'leaves',
      'payroll',
      'earnings_deductions',
      'deduction_approvals',
      'patch_releases',
      'release_schedules',
      'settings_companies',
      'settings_groups',
      'settings_projects',
      'settings_visibility_rules',
      'settings_workflow_templates',
      'settings_models',
      'settings_geofences',
      'settings_payroll_workflows',
      'settings_general',
    ];
  }

  if (normalized === UserRole.Accounting) {
    return [
      'requests',
      'payroll',
      'earnings_deductions',
      'deduction_approvals',
      'patch_releases',
      'release_schedules',
    ];
  }

  if (normalized === UserRole.PRO) {
    return ['dashboard', 'requests', 'employees', 'documents', 'pro_assignments'];
  }

  if (normalized === UserRole.SectionManager) {
    return [
      'dashboard',
      'requests',
      'employees',
      'documents',
      'attendance',
      'leaves',
      'payroll',
      'deduction_approvals',
    ];
  }

  if (normalized === UserRole.SectionCoManager) {
    return ['dashboard', 'requests', 'employees', 'documents', 'attendance', 'leaves', 'payroll'];
  }

  // Employee
  return ['dashboard', 'requests', 'documents', 'attendance', 'leaves', 'payroll'];
}

export function getGroupForRoute(route: NavSection): SidebarGroupId | null {
  for (const group of SIDEBAR_GROUPS) {
    if (group.items.some((item) => item.id === route)) {
      return group.id;
    }
  }
  return null;
}

export function isSettingsRoute(route: NavSection): boolean {
  return route.startsWith('settings_');
}
