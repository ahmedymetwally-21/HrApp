# Yaldi HR Mobile — Scope & Architecture Rules

## Strict Feature Scope (DO NOT EXCEED)
This mobile app is ONLY for:
1. **Authentication** (Login & forced first-login password change)
2. **Clock-In & Clock-Out** (Native GPS geofence verification, roster Leave-day block, today scheduled shift display, and personal attendance history)
3. **Requests** (Submitting new requests with optional file attachments and tracking their step-by-step approval progress)
4. **Approvals** (Reviewing, approving, rejecting, or bypassing pending Unified Requests, Leave Requests, and Deduction Approvals assigned to the signed-in user)

**STRICTLY EXCLUDED:** Do NOT build Payroll/Salary views, Employee Directory management, Company/Project/Group settings, Monthly Roster upload, or Announcements admin screens.

## Live Synchronization with Web Dashboard Rules
- Backend base URL: https://yaldi.ddns.net/hr-api
- Attach Authorization: Bearer <token> (stored in flutter_secure_storage) on every request.
- On app startup and pull-to-refresh, fetch:
  - GET /visibility-rules/me (returns List<String> of hidden section IDs configured on the web dashboard)
  - GET /users (resolve current user role, assignedZoneIds, clockInPolicyOverride, primaryCompanyId, sectionId, managedSectionIds)
  - GET /locations & GET /settings (geofence circles + globalClockInPolicy + maxMobileAccuracyMeters)
  - GET /rosters/today (if status == "leave" or canClockIn == false, disable Clock-In and Clock-Out)
- **Dynamic Visibility Enforcement:** If visibility-rules/me hides a section (attendance_logs, requests, leaves, deduction_approvals), immediately hide that UI section or tab in Flutter so web dashboard rules take effect on mobile automatically.

## Riverpod 3 State Rule
- NEVER declare `late final` fields inside `Notifier` or `AsyncNotifier` subclasses because Riverpod 3 reuses notifier instances when `build()` re-runs. Use `ref.read(...)` getters or mutable `late` fields.

## Approvals Tab Visibility Rule
- The Approvals tab and screen MUST ONLY be visible to `main_manager`, `hr_manager`, and `hr_admin` (`hr`). Never show the Approvals tab to regular employees, direct managers, section managers, accounting, or PRO, even if pending items exist.

## Attendance Serialization & Multi-Session Rules
- `GET /attendance` returns records with keys: `id`, `userId`, `workDate` (`YYYY-MM-DD`), `clockInAt` (ISO-8601 timestamp), `clockOutAt` (ISO-8601 timestamp or `null`), `zoneName`, `punchSource`, `isLate`, `lateMinutes`.
- Always check `clockInAt ?? clockIn ?? clock_in` and `clockOutAt ?? clockOut ?? clock_out`.
- Employees may clock in and out multiple times per day; group `Recent Attendance` by `workDate` to show full daily worked duration, break/gap duration between sessions, and every individual session of the day.
- Include a `Profile` tab in `lib/features/shell/main_shell.dart` for all roles alongside `Clock-In`, `Requests`, and (for `main_manager` / `hr_manager` / `hr_admin` only) `Approvals`.

## Exact Backend Attendance Keys (`ser_att`)
- `GET /attendance`, `POST /attendance/clock-in`, and `PUT /attendance/{id}/clock-out` return:
  - `id`: String
  - `employeeId`: String
  - `date`: `"YYYY-MM-DD"`
  - `clockInTime`: ISO-8601 timestamp string
  - `clockOutTime`: ISO-8601 timestamp string or `null`
  - `zoneId`: String
  - `zoneName`: String
  - `punchSource`: `"Mobile App"` or `"PC Web"`
  - `isLate`: bool, `lateMinutes`: int
- `POST /attendance/clock-in` expects: `latitude`, `longitude`, `accuracyMeters`, `zoneId`, `zoneName`, `punchSource: "Mobile App"`.
