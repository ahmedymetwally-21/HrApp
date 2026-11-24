import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../core/workspace_provider.dart';
import '../auth/auth_provider.dart';
import '../profile/profile_screen.dart';
import 'attendance_provider.dart';

class AttendanceScreen extends ConsumerStatefulWidget {
  const AttendanceScreen({super.key});

  @override
  ConsumerState<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends ConsumerState<AttendanceScreen> {
  final Set<String> _expandedDateKeys = {};

  @override
  void initState() {
    super.initState();
    _expandedDateKeys.add(DateFormat('yyyy-MM-dd').format(DateTime.now()));
    // Run GPS verification only once on initialization, and skip completely when role == 'main_manager'
    Future.microtask(() {
      final workspace = ref.read(workspaceProvider);
      if (!workspace.isExecutiveExempt) {
        ref.read(attendanceProvider.notifier).checkLocationAndGeofence();
      }
    });
  }

  Future<void> _handleRefresh() async {
    await ref.read(workspaceProvider.notifier).syncWorkspace(background: true);
    final workspace = ref.read(workspaceProvider);
    if (!workspace.isExecutiveExempt) {
      await ref.read(attendanceProvider.notifier).checkLocationAndGeofence();
    }
    await ref
        .read(attendanceProvider.notifier)
        .loadAttendanceLogs(background: true);
  }

  @override
  Widget build(BuildContext context) {
    // Declarative observation: No API calls, no ref.invalidate(), no GPS checks in build()
    final workspace = ref.watch(workspaceProvider);
    final attendanceState = ref.watch(attendanceProvider);
    final attendanceNotifier = ref.read(attendanceProvider.notifier);
    final authState = ref.watch(authProvider);

    final currentUser = workspace.currentUser ?? authState.user;
    String resolvedFullName = (currentUser?['fullName'] ??
            currentUser?['full_name'] ??
            currentUser?['name'] ??
            currentUser?['displayName'] ??
            currentUser?['employeeName'] ??
            '')
        .toString()
        .trim();

    if (resolvedFullName.isEmpty || resolvedFullName == 'null') {
      final email = (currentUser?['email'] ?? currentUser?['username'] ?? '')
          .toString()
          .trim();
      if (email.contains('@')) {
        final prefix = email.split('@').first;
        if (prefix.isNotEmpty) {
          resolvedFullName = prefix[0].toUpperCase() + prefix.substring(1);
        }
      } else if (email.isNotEmpty) {
        resolvedFullName = email;
      } else {
        resolvedFullName = 'Employee';
      }
    }

    final userRole =
        currentUser?['role']?.toString().replaceAll('_', ' ').toUpperCase() ??
            'STAFF';

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: _handleRefresh,
          color: AppTheme.primaryBlue,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 16.0),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // 1. Top Header Row (Pressable avatar to ProfileScreen, full name greeting, refresh button)
                _buildTopHeaderRow(context, resolvedFullName, userRole),
                const SizedBox(height: 20),

                // Feedback banners (Success / Error)
                if (attendanceState.errorMessage != null) ...[
                  _buildFeedbackBanner(
                    context,
                    isError: true,
                    message: attendanceState.errorMessage!,
                    onClose: attendanceNotifier.clearMessages,
                  ),
                  const SizedBox(height: 14),
                ],

                if (attendanceState.successMessage != null) ...[
                  _buildFeedbackBanner(
                    context,
                    isError: false,
                    message: attendanceState.successMessage!,
                    onClose: attendanceNotifier.clearMessages,
                  ),
                  const SizedBox(height: 14),
                ],

                // Amber Leave Banner if scheduled on Leave
                if (workspace.isScheduledOnLeaveToday) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                    margin: const EdgeInsets.only(bottom: 16),
                    decoration: BoxDecoration(
                      color: AppTheme.warningPill(context).$2,
                      borderRadius: BorderRadius.circular(18),
                      border: Border.all(
                        color: AppTheme.warningPill(context).$1.withValues(alpha: 0.25),
                        width: 1,
                      ),
                    ),
                    child: Row(
                      children: [
                        Icon(
                          Icons.beach_access_rounded,
                          color: AppTheme.warningPill(context).$1,
                          size: 24,
                        ),
                        const SizedBox(width: 12),
                        Expanded(
                          child: Text(
                            'You are scheduled on Leave today — Clock-In and Clock-Out are disabled.',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w700,
                              color: AppTheme.warningPill(context).$1,
                              height: 1.35,
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                ],

                // 2. Hero Status Card (Figma Styled)
                _buildHeroStatusCard(context, workspace, attendanceState),
                const SizedBox(height: 24),

                // 3. Recent Attendance Logs (Grouped White Card)
                if (!workspace.isAttendanceLogsHidden) ...[
                  _buildAttendanceLogsSection(context, attendanceState),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }

  Widget _buildTopHeaderRow(
    BuildContext context,
    String userName,
    String userRole,
  ) {
    final isDark = AppTheme.isDark(context);

    return Row(
      children: [
        // Circular 44x44 logo badge pressable to ProfileScreen
        GestureDetector(
          onTap: () {
            Navigator.of(context).push(
              MaterialPageRoute(builder: (_) => const ProfileScreen()),
            );
          },
          child: Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppTheme.surface(context),
              shape: BoxShape.circle,
              border: Border.all(color: AppTheme.border(context), width: 1),
              boxShadow: [
                BoxShadow(
                  color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.04),
                  blurRadius: 8,
                  offset: const Offset(0, 2),
                ),
              ],
            ),
            padding: const EdgeInsets.all(7),
            child: ClipOval(
              child: Image.asset(
                'assets/images/yaldi_logo.png',
                fit: BoxFit.contain,
              ),
            ),
          ),
        ),
        const SizedBox(width: 12),

        // Two-line greeting with user's full name
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                'Welcome back,',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12.5,
                  fontWeight: FontWeight.w500,
                  color: AppTheme.textMut(context),
                ),
              ),
              const SizedBox(height: 1),
              Row(
                children: [
                  Flexible(
                    child: Text(
                      userName,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 16,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textPri(context),
                        letterSpacing: -0.3,
                      ),
                      overflow: TextOverflow.ellipsis,
                    ),
                  ),
                  const SizedBox(width: 6),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 2),
                    decoration: BoxDecoration(
                      color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                      borderRadius: BorderRadius.circular(10),
                      border: Border.all(color: AppTheme.border(context)),
                    ),
                    child: Text(
                      userRole,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 10,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSec(context),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
        ),

        // Circular 42x42 icon button for Sync refresh
        Container(
          width: 42,
          height: 42,
          decoration: BoxDecoration(
            color: AppTheme.surface(context),
            shape: BoxShape.circle,
            border: Border.all(color: AppTheme.border(context), width: 1),
          ),
          child: IconButton(
            icon: Icon(Icons.refresh_rounded, size: 20, color: AppTheme.textSec(context)),
            tooltip: 'Sync Rules',
            padding: EdgeInsets.zero,
            onPressed: _handleRefresh,
          ),
        ),
      ],
    );
  }

  Widget _buildFeedbackBanner(
    BuildContext context, {
    required bool isError,
    required String message,
    required VoidCallback onClose,
  }) {
    final (textCol, bg) = isError
        ? AppTheme.errorPill(context)
        : AppTheme.successPill(context);
    final icon = isError ? Icons.error_outline_rounded : Icons.check_circle_outline_rounded;

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: textCol.withValues(alpha: 0.25)),
      ),
      child: Row(
        children: [
          Icon(icon, color: textCol, size: 20),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              message,
              style: GoogleFonts.plusJakartaSans(
                color: textCol,
                fontSize: 12.5,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          IconButton(
            icon: Icon(Icons.close_rounded, size: 18, color: textCol),
            onPressed: onClose,
            padding: EdgeInsets.zero,
            constraints: const BoxConstraints(),
          ),
        ],
      ),
    );
  }

  Widget _buildHeroStatusCard(
    BuildContext context,
    WorkspaceState workspace,
    AttendanceState attendanceState,
  ) {
    final isDark = AppTheme.isDark(context);
    final geo = attendanceState.geofenceResult;
    final isClockedIn = attendanceState.isClockedIn;
    final isExempt = workspace.isExecutiveExempt;
    final isLeave = workspace.isScheduledOnLeaveToday;

    // Shift window
    final roster = workspace.todayRoster;
    final shiftStart = roster?['shiftStart'] ?? roster?['start_time'] ?? '09:00';
    final shiftEnd = roster?['shiftEnd'] ?? roster?['end_time'] ?? '18:00';

    // Status pill content
    String statusPillText;
    Color statusPillTextCol;
    Color statusPillBgCol;

    if (isLeave) {
      statusPillText = 'ON LEAVE';
      final (t, b) = AppTheme.warningPill(context);
      statusPillTextCol = t;
      statusPillBgCol = b;
    } else if (isExempt) {
      statusPillText = 'EXEMPT';
      final (t, b) = AppTheme.successPill(context);
      statusPillTextCol = t;
      statusPillBgCol = b;
    } else if (isClockedIn) {
      statusPillText = 'CLOCKED IN';
      final (t, b) = AppTheme.successPill(context);
      statusPillTextCol = t;
      statusPillBgCol = b;
    } else {
      statusPillText = 'CLOCKED OUT';
      final (t, b) = AppTheme.errorPill(context);
      statusPillTextCol = t;
      statusPillBgCol = b;
    }

    // Headline readout
    String readoutTitle;
    String readoutSubtitle;

    if (isLeave) {
      readoutTitle = 'Scheduled On Leave';
      readoutSubtitle = 'Shift duties paused for today';
    } else if (isExempt) {
      readoutTitle = 'Executive Exemption';
      readoutSubtitle = 'Geofence tracking waived for Main Manager';
    } else if (isClockedIn) {
      final inTime = attendanceState.activeLog?['clockInAt'] ??
          attendanceState.activeLog?['clock_in_at'] ??
          attendanceState.activeLog?['clockIn'] ??
          attendanceState.activeLog?['clock_in'] ??
          '';
      readoutTitle = 'Active Work Session';
      readoutSubtitle = inTime.isNotEmpty
          ? 'Clocked in at ${_formatSimpleTime(inTime)}'
          : 'Attendance recording in progress';
    } else {
      final todayKey = DateFormat('yyyy-MM-dd').format(DateTime.now());
      final groups = _groupLogsByDay(attendanceState.logs);
      final todayGroup =
          groups.where((g) => g.dateKey == todayKey).firstOrNull;

      if (todayGroup != null && todayGroup.sessions.isNotEmpty) {
        readoutTitle = 'Ready for Next Session';
        readoutSubtitle =
            'Worked today: ${_formatDuration(todayGroup.totalWorked)} (${todayGroup.sessions.length} session${todayGroup.sessions.length > 1 ? 's' : ''})';
      } else {
        readoutTitle = 'Ready for Shift';
        readoutSubtitle = 'Today: $shiftStart – $shiftEnd window';
      }
    }

    return Container(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: isDark
              ? const [AppTheme.darkHeroBlueStart, AppTheme.darkHeroBlueEnd]
              : const [AppTheme.heroBlueStart, AppTheme.heroBlueEnd],
        ),
        borderRadius: BorderRadius.circular(24),
        border: Border.all(
          color: isDark ? AppTheme.darkHeroBlueBorder : AppTheme.heroBlueBorder,
          width: 1.0,
        ),
        boxShadow: [
          BoxShadow(
            color: AppTheme.primaryBlue.withValues(alpha: isDark ? 0.15 : 0.06),
            blurRadius: 18,
            offset: const Offset(0, 6),
          ),
        ],
      ),
      padding: const EdgeInsets.all(20.0),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Top Row: Live status pill on left + today's shift window on right
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: statusPillBgCol,
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: statusPillTextCol.withValues(alpha: 0.25),
                  ),
                ),
                child: Row(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    Container(
                      width: 6,
                      height: 6,
                      decoration: BoxDecoration(
                        color: statusPillTextCol,
                        shape: BoxShape.circle,
                      ),
                    ),
                    const SizedBox(width: 6),
                    Text(
                      statusPillText,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11,
                        fontWeight: FontWeight.w800,
                        color: statusPillTextCol,
                        letterSpacing: 0.3,
                      ),
                    ),
                  ],
                ),
              ),

              // Rostered shift window
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: isDark
                      ? AppTheme.darkCardSurface.withValues(alpha: 0.8)
                      : Colors.white.withValues(alpha: 0.7),
                  borderRadius: BorderRadius.circular(12),
                  border: Border.all(
                    color: isDark ? AppTheme.darkHeroBlueBorder : AppTheme.heroBlueBorder,
                  ),
                ),
                child: Row(
                  children: [
                    const Icon(
                      Icons.schedule_rounded,
                      size: 14,
                      color: AppTheme.primaryBlue,
                    ),
                    const SizedBox(width: 6),
                    Text(
                      '$shiftStart – $shiftEnd',
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textSec(context),
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 18),

          // Center Row: Bold status/shift readout on left + Action Button on right
          Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      readoutTitle,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 20,
                        fontWeight: FontWeight.w800,
                        color: AppTheme.textPri(context),
                        letterSpacing: -0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      readoutSubtitle,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 13,
                        fontWeight: FontWeight.w500,
                        color: AppTheme.textSec(context),
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),

              // Action button or Exemption/Leave badge
              if (isLeave)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppTheme.warningPill(context).$2,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.warningPill(context).$1.withValues(alpha: 0.3)),
                  ),
                  child: Text(
                    'Leave Day',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12.5,
                      fontWeight: FontWeight.w700,
                      color: AppTheme.warningPill(context).$1,
                    ),
                  ),
                )
              else if (isExempt)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                  decoration: BoxDecoration(
                    color: AppTheme.successPill(context).$2,
                    borderRadius: BorderRadius.circular(20),
                    border: Border.all(color: AppTheme.successPill(context).$1.withValues(alpha: 0.3)),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(Icons.verified_user_rounded,
                          size: 16, color: AppTheme.successPill(context).$1),
                      const SizedBox(width: 6),
                      Text(
                        'Waived',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 12.5,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.successPill(context).$1,
                        ),
                      ),
                    ],
                  ),
                )
              else if (!isClockedIn)
                ElevatedButton(
                  onPressed: (attendanceState.isClockingIn || geo?.canClockIn != true)
                      ? null
                      : () => ref.read(attendanceProvider.notifier).clockIn(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: AppTheme.primaryBlue,
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(23),
                    ),
                  ),
                  child: attendanceState.isClockingIn
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation(Colors.white),
                          ),
                        )
                      : Text(
                          'Clock in',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                )
              else
                ElevatedButton(
                  onPressed: attendanceState.isClockingOut
                      ? null
                      : () => ref.read(attendanceProvider.notifier).clockOut(),
                  style: ElevatedButton.styleFrom(
                    backgroundColor: isDark ? const Color(0xFFB80E2B) : const Color(0xFF111112),
                    foregroundColor: Colors.white,
                    elevation: 0,
                    padding: const EdgeInsets.symmetric(horizontal: 22, vertical: 12),
                    shape: RoundedRectangleBorder(
                      borderRadius: BorderRadius.circular(23),
                    ),
                  ),
                  child: attendanceState.isClockingOut
                      ? const SizedBox(
                          width: 18,
                          height: 18,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            valueColor: AlwaysStoppedAnimation(Colors.white),
                          ),
                        )
                      : Text(
                          'Clock out',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 14.5,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                ),
            ],
          ),
          const SizedBox(height: 16),

          // Divider
          Container(
            height: 1,
            color: (isDark ? AppTheme.darkHeroBlueBorder : AppTheme.heroBlueBorder).withValues(alpha: 0.6),
          ),
          const SizedBox(height: 12),

          // Bottom Strip: GPS Geofence distance, accuracy & active policy pill
          Row(
            children: [
              Icon(
                isExempt
                    ? Icons.verified_rounded
                    : (geo?.isInsideZone == true
                        ? Icons.location_on_rounded
                        : Icons.location_off_rounded),
                size: 16,
                color: isExempt || geo?.isInsideZone == true
                    ? (isDark ? AppTheme.darkSuccessText : AppTheme.successText)
                    : (isDark ? AppTheme.darkErrorText : AppTheme.errorText),
              ),
              const SizedBox(width: 6),
              Expanded(
                child: Text(
                  isExempt
                      ? 'Executive GPS exemption active'
                      : (geo?.statusMessage ?? 'Checking geofence coordinates...'),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 12,
                    fontWeight: FontWeight.w600,
                    color: AppTheme.textSec(context),
                  ),
                  overflow: TextOverflow.ellipsis,
                ),
              ),
              const SizedBox(width: 8),

              // Active policy pill
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
                decoration: BoxDecoration(
                  color: isDark
                      ? AppTheme.darkCardSurface.withValues(alpha: 0.8)
                      : Colors.white.withValues(alpha: 0.8),
                  borderRadius: BorderRadius.circular(10),
                  border: Border.all(
                    color: isDark ? AppTheme.darkHeroBlueBorder : AppTheme.heroBlueBorder,
                  ),
                ),
                child: Text(
                  _formatPolicyBadge(workspace.effectiveClockInPolicy),
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 10.5,
                    fontWeight: FontWeight.w700,
                    color: isDark ? AppTheme.primaryBlue : AppTheme.navActiveIcon,
                  ),
                ),
              ),

              if (!isExempt) ...[
                const SizedBox(width: 6),
                InkWell(
                  onTap: () => ref
                      .read(attendanceProvider.notifier)
                      .checkLocationAndGeofence(),
                  child: const Padding(
                    padding: EdgeInsets.all(2.0),
                    child: Icon(
                      Icons.my_location_rounded,
                      size: 16,
                      color: AppTheme.primaryBlue,
                    ),
                  ),
                ),
              ],
            ],
          ),
        ],
      ),
    );
  }

  Widget _buildAttendanceLogsSection(
    BuildContext context,
    AttendanceState state,
  ) {
    final dailyGroups = _groupLogsByDay(state.logs);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              'Recent Attendance',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 17,
                fontWeight: FontWeight.w800,
                color: AppTheme.textPri(context),
                letterSpacing: -0.3,
              ),
            ),
            Text(
              '${dailyGroups.length} days (${state.logs.length} sessions)',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 12,
                fontWeight: FontWeight.w600,
                color: AppTheme.textMut(context),
              ),
            ),
          ],
        ),
        const SizedBox(height: 12),

        if (state.isLoadingLogs)
          Container(
            padding: const EdgeInsets.all(32.0),
            decoration: BoxDecoration(
              color: AppTheme.surface(context),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppTheme.border(context)),
            ),
            child: const Center(
              child: CircularProgressIndicator(color: AppTheme.primaryBlue),
            ),
          )
        else if (dailyGroups.isEmpty)
          Container(
            padding: const EdgeInsets.all(32.0),
            decoration: BoxDecoration(
              color: AppTheme.surface(context),
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppTheme.border(context)),
            ),
            child: Center(
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.history_rounded,
                    size: 36,
                    color: AppTheme.textMuted,
                  ),
                  const SizedBox(height: 10),
                  Text(
                    'No attendance sessions recorded yet.',
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                      color: AppTheme.textMut(context),
                    ),
                  ),
                ],
              ),
            ),
          )
        else
          ListView.separated(
            shrinkWrap: true,
            physics: const NeverScrollableScrollPhysics(),
            itemCount: dailyGroups.length > 10 ? 10 : dailyGroups.length,
            separatorBuilder: (context, index) => const SizedBox(height: 12),
            itemBuilder: (context, index) {
              final group = dailyGroups[index];
              return _buildDailyAttendanceCard(context, group);
            },
          ),
      ],
    );
  }

  Widget _buildDailyAttendanceCard(BuildContext context, _DailyAttendanceGroup group) {
    final isDark = AppTheme.isDark(context);
    final isExpanded = _expandedDateKeys.contains(group.dateKey);

    final dayNumber = DateFormat('dd').format(group.date);
    final weekdayMonth = DateFormat('EEE, MMM').format(group.date);

    // Status pill coloring
    Color statusBgCol;
    Color statusTextCol;
    switch (group.status) {
      case 'Ongoing':
        final (t, b) = AppTheme.successPill(context);
        statusBgCol = b;
        statusTextCol = t;
        break;
      case 'OT':
      case 'Short':
        final (t, b) = AppTheme.warningPill(context);
        statusBgCol = b;
        statusTextCol = t;
        break;
      case 'Late':
        final (t, b) = AppTheme.errorPill(context);
        statusBgCol = b;
        statusTextCol = t;
        break;
      case 'Full':
      default:
        statusBgCol = isDark ? const Color(0xFF1A4579) : AppTheme.navPillBg;
        statusTextCol = isDark ? AppTheme.primaryBlue : AppTheme.navActiveIcon;
        break;
    }

    final spanText = group.firstIn != null
        ? '${_formatSimpleTime(group.firstIn)} – ${group.hasOngoing ? 'Ongoing' : _formatSimpleTime(group.lastOut)}'
        : '--:--';

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        borderRadius: BorderRadius.circular(22),
        border: Border.all(color: AppTheme.border(context), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
            blurRadius: 10,
            offset: const Offset(0, 4),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(22),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            // Daily Summary Header (tappable to expand / collapse)
            InkWell(
              onTap: () {
                setState(() {
                  if (isExpanded) {
                    _expandedDateKeys.remove(group.dateKey);
                  } else {
                    _expandedDateKeys.add(group.dateKey);
                  }
                });
              },
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 14.0),
                child: Row(
                  children: [
                    // Date badge (e.g. 24 Tue, Nov)
                    Container(
                      width: 58,
                      padding: const EdgeInsets.symmetric(vertical: 6, horizontal: 4),
                      decoration: BoxDecoration(
                        color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                        borderRadius: BorderRadius.circular(14),
                        border: Border.all(color: AppTheme.border(context)),
                      ),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Text(
                            dayNumber,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 17,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.textPri(context),
                              height: 1.1,
                            ),
                          ),
                          Text(
                            weekdayMonth,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textMut(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),

                    // Middle Summary: Worked Hours, Break, First-In -> Last-Out span
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            children: [
                              Text(
                                _formatDuration(group.totalWorked),
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 15,
                                  fontWeight: FontWeight.w800,
                                  color: AppTheme.textPri(context),
                                ),
                              ),
                              if (group.totalBreak.inMinutes > 0) ...[
                                const SizedBox(width: 6),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                      horizontal: 6, vertical: 1.5),
                                  decoration: BoxDecoration(
                                    color: isDark ? AppTheme.darkWarningFill : AppTheme.goldTint,
                                    borderRadius: BorderRadius.circular(6),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      Icon(
                                        Icons.coffee_rounded,
                                        size: 11,
                                        color: isDark ? AppTheme.darkWarningText : AppTheme.warningText,
                                      ),
                                      const SizedBox(width: 3),
                                      Text(
                                        '${_formatDuration(group.totalBreak)} break',
                                        style: GoogleFonts.plusJakartaSans(
                                          fontSize: 10.5,
                                          fontWeight: FontWeight.w700,
                                          color: isDark ? AppTheme.darkWarningText : AppTheme.warningText,
                                        ),
                                      ),
                                    ],
                                  ),
                                ),
                              ],
                            ],
                          ),
                          const SizedBox(height: 3),
                          Text(
                            spanText,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textSec(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 8),

                    // Right Side: Daily status pill + Expand chevron
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.end,
                      children: [
                        Container(
                          padding: const EdgeInsets.symmetric(
                              horizontal: 8, vertical: 3),
                          decoration: BoxDecoration(
                            color: statusBgCol,
                            borderRadius: BorderRadius.circular(8),
                          ),
                          child: Text(
                            group.status,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10.5,
                              fontWeight: FontWeight.w800,
                              color: statusTextCol,
                            ),
                          ),
                        ),
                        const SizedBox(height: 4),
                        Row(
                          mainAxisSize: MainAxisSize.min,
                          children: [
                            Text(
                              '${group.sessions.length} session${group.sessions.length > 1 ? 's' : ''}',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11,
                                color: AppTheme.textMut(context),
                                fontWeight: FontWeight.w500,
                              ),
                            ),
                            const SizedBox(width: 2),
                            Icon(
                              isExpanded
                                  ? Icons.keyboard_arrow_up_rounded
                                  : Icons.keyboard_arrow_down_rounded,
                              size: 18,
                              color: AppTheme.textMut(context),
                            ),
                          ],
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ),

            // Expandable Session Breakdown
            if (isExpanded) ...[
              Divider(
                height: 1,
                thickness: 1,
                color: AppTheme.divider(context),
              ),
              Container(
                color: isDark
                    ? AppTheme.darkCanvasBackground.withValues(alpha: 0.6)
                    : AppTheme.canvasBackground.withValues(alpha: 0.5),
                padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: List.generate(group.sessions.length, (sIndex) {
                    final session = group.sessions[sIndex];
                    final sIn = _parseDateTime(
                      session['clockInTime'] ??
                          session['clockInAt'] ??
                          session['clock_in_at'] ??
                          session['clockIn'] ??
                          session['clock_in'],
                      group.date,
                    );
                    final sOut = _parseDateTime(
                      session['clockOutTime'] ??
                          session['clockOutAt'] ??
                          session['clock_out_at'] ??
                          session['clockOut'] ??
                          session['clock_out'],
                      group.date,
                    );
                    final isOngoing = sOut == null;

                    Duration sessionDuration = Duration.zero;
                    if (sIn != null) {
                      final end = sOut ?? DateTime.now();
                      if (end.isAfter(sIn)) {
                        sessionDuration = end.difference(sIn);
                      }
                    }

                    final zoneName = session['zoneName'] ??
                        session['zone_name'] ??
                        session['locationName'] ??
                        session['location_name'] ??
                        'Authorized Zone';

                    final inFormatted = _formatSimpleTime(sIn, group.date);
                    final outFormatted =
                        isOngoing ? 'Active' : _formatSimpleTime(sOut, group.date);

                    return Padding(
                      padding: EdgeInsets.only(
                        top: sIndex == 0 ? 0 : 8.0,
                        bottom: sIndex == group.sessions.length - 1 ? 0 : 4.0,
                      ),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Container(
                            margin: const EdgeInsets.only(top: 3),
                            width: 8,
                            height: 8,
                            decoration: BoxDecoration(
                              color: isOngoing
                                  ? (isDark ? AppTheme.darkSuccessText : AppTheme.successText)
                                  : AppTheme.primaryBlue,
                              shape: BoxShape.circle,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: RichText(
                              text: TextSpan(
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12.5,
                                  color: AppTheme.textPri(context),
                                ),
                                children: [
                                  TextSpan(
                                    text: 'Session ${sIndex + 1} · ',
                                    style: const TextStyle(
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                  TextSpan(
                                    text: '$inFormatted – $outFormatted',
                                    style: TextStyle(
                                      fontWeight: FontWeight.w700,
                                      color: isOngoing
                                          ? (isDark ? AppTheme.darkSuccessText : AppTheme.successText)
                                          : AppTheme.textPri(context),
                                    ),
                                  ),
                                  TextSpan(
                                    text:
                                        ' · ${_formatDuration(sessionDuration)}',
                                    style: TextStyle(
                                      color: AppTheme.textSec(context),
                                      fontWeight: FontWeight.w600,
                                    ),
                                  ),
                                  TextSpan(
                                    text: ' · Inside zone: $zoneName',
                                    style: TextStyle(
                                      color: AppTheme.textMut(context),
                                      fontSize: 11.5,
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                        ],
                      ),
                    );
                  }),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }

  List<_DailyAttendanceGroup> _groupLogsByDay(List<Map<String, dynamic>> logs) {
    final Map<String, List<Map<String, dynamic>>> grouped = {};

    for (final log in logs) {
      final rawDate = log['date'] ??
          log['workDate'] ??
          log['work_date'] ??
          log['clockInTime'] ??
          log['clockInAt'] ??
          log['clock_in_at'] ??
          log['clockIn'] ??
          log['clock_in'];
      DateTime dt = DateTime.now();
      if (rawDate != null) {
        final parsed = _parseDateTime(rawDate);
        if (parsed != null) dt = parsed;
      }
      final key = DateFormat('yyyy-MM-dd').format(dt);
      grouped.putIfAbsent(key, () => []).add(log);
    }

    final List<_DailyAttendanceGroup> groups = [];

    grouped.forEach((key, dayLogs) {
      DateTime dayDate = DateTime.tryParse(key) ?? DateTime.now();

      // Sort sessions chronologically (earliest clock-in first)
      dayLogs.sort((a, b) {
        final aIn = _parseDateTime(
                a['clockInTime'] ??
                    a['clockInAt'] ??
                    a['clock_in_at'] ??
                    a['clockIn'] ??
                    a['clock_in'],
                dayDate) ??
            DateTime(2000);
        final bIn = _parseDateTime(
                b['clockInTime'] ??
                    b['clockInAt'] ??
                    b['clock_in_at'] ??
                    b['clockIn'] ??
                    b['clock_in'],
                dayDate) ??
            DateTime(2000);
        return aIn.compareTo(bIn);
      });

      Duration totalWorked = Duration.zero;
      Duration totalBreak = Duration.zero;
      bool hasOngoing = false;
      DateTime? firstIn;
      DateTime? lastOut;

      for (int i = 0; i < dayLogs.length; i++) {
        final session = dayLogs[i];
        final inDt = _parseDateTime(
          session['clockInTime'] ??
              session['clockInAt'] ??
              session['clock_in_at'] ??
              session['clockIn'] ??
              session['clock_in'],
          dayDate,
        );
        final outDt = _parseDateTime(
          session['clockOutTime'] ??
              session['clockOutAt'] ??
              session['clock_out_at'] ??
              session['clockOut'] ??
              session['clock_out'],
          dayDate,
        );

        if (inDt != null) {
          if (firstIn == null || inDt.isBefore(firstIn)) {
            firstIn = inDt;
          }
        }

        if (outDt != null) {
          if (lastOut == null || outDt.isAfter(lastOut)) {
            lastOut = outDt;
          }
        } else {
          hasOngoing = true;
        }

        // Session worked duration
        if (inDt != null) {
          if (outDt != null) {
            if (outDt.isAfter(inDt)) {
              totalWorked += outDt.difference(inDt);
            }
          } else {
            // Ongoing session
            final now = DateTime.now();
            if (now.isAfter(inDt)) {
              totalWorked += now.difference(inDt);
            }
          }
        }

        // Break gap between consecutive sessions
        if (i > 0) {
          final prevSession = dayLogs[i - 1];
          final prevOut = _parseDateTime(
            prevSession['clockOutTime'] ??
                prevSession['clockOutAt'] ??
                prevSession['clock_out_at'] ??
                prevSession['clockOut'] ??
                prevSession['clock_out'],
            dayDate,
          );
          if (prevOut != null && inDt != null && inDt.isAfter(prevOut)) {
            totalBreak += inDt.difference(prevOut);
          }
        }
      }

      // Determine status
      String status = 'Full';
      if (hasOngoing) {
        status = 'Ongoing';
      } else {
        final hours = totalWorked.inMinutes / 60.0;
        if (hours >= 9.0) {
          status = 'OT';
        } else if (hours >= 7.75) {
          status = 'Full';
        } else if (firstIn != null &&
            (firstIn.hour > 9 || (firstIn.hour == 9 && firstIn.minute > 15))) {
          status = 'Late';
        } else {
          status = 'Short';
        }
      }

      groups.add(
        _DailyAttendanceGroup(
          dateKey: key,
          date: dayDate,
          sessions: dayLogs,
          totalWorked: totalWorked,
          totalBreak: totalBreak,
          firstIn: firstIn,
          lastOut: lastOut,
          hasOngoing: hasOngoing,
          status: status,
        ),
      );
    });

    // Sort days descending (most recent date first)
    groups.sort((a, b) => b.dateKey.compareTo(a.dateKey));
    return groups;
  }

  DateTime? _parseDateTime(dynamic val, [DateTime? referenceDate]) {
    return parseAttendanceDateTime(val, referenceDate);
  }

  String _formatSimpleTime(dynamic val, [DateTime? referenceDate]) {
    return formatAttendanceTime(val, referenceDate);
  }

  String _formatDuration(Duration d) {
    final hours = d.inHours;
    final mins = d.inMinutes.remainder(60);
    if (hours > 0 && mins > 0) {
      return '${hours}h ${mins}m';
    } else if (hours > 0) {
      return '${hours}h';
    } else {
      return '${mins}m';
    }
  }

  String _formatPolicyBadge(String policy) {
    switch (policy) {
      case AppConstants.policyStrictMobileGps:
        return 'Strict GPS';
      case AppConstants.policyMobileOrOffice:
        return 'Mobile/Office';
      case AppConstants.policyGeofenceExempt:
        return 'Exempt';
      default:
        return 'Standard';
    }
  }
}

class _DailyAttendanceGroup {
  final String dateKey;
  final DateTime date;
  final List<Map<String, dynamic>> sessions;
  final Duration totalWorked;
  final Duration totalBreak;
  final DateTime? firstIn;
  final DateTime? lastOut;
  final bool hasOngoing;
  final String status;

  _DailyAttendanceGroup({
    required this.dateKey,
    required this.date,
    required this.sessions,
    required this.totalWorked,
    required this.totalBreak,
    this.firstIn,
    this.lastOut,
    required this.hasOngoing,
    required this.status,
  });
}
