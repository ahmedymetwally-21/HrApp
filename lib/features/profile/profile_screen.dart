import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../core/workspace_provider.dart';
import '../auth/auth_provider.dart';
import '../auth/change_password_screen.dart';
import '../shell/main_shell.dart';

class ProfileScreen extends ConsumerWidget {
  const ProfileScreen({super.key});

  void _confirmSignOut(BuildContext context, WidgetRef ref) {
    final isDark = AppTheme.isDark(context);
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: AppTheme.surface(context),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(
          'Sign Out',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: AppTheme.textPri(context),
          ),
        ),
        content: Text(
          'Are you sure you want to end your current session?',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 14,
            color: AppTheme.textSec(context),
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(
                color: AppTheme.textMut(context),
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: isDark ? AppTheme.darkErrorText : AppTheme.errorText,
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            onPressed: () {
              Navigator.of(ctx).pop();
              ref.read(authProvider.notifier).logout();
            },
            child: Text(
              'Sign Out',
              style: GoogleFonts.plusJakartaSans(fontWeight: FontWeight.w700),
            ),
          ),
        ],
      ),
    );
  }

  String _getInitials(String name) {
    final trimmed = name.trim();
    if (trimmed.isEmpty) return 'EM';
    final parts = trimmed.split(RegExp(r'\s+'));
    if (parts.length >= 2) {
      return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    }
    return trimmed.substring(0, trimmed.length >= 2 ? 2 : 1).toUpperCase();
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final workspace = ref.watch(workspaceProvider);
    final authState = ref.watch(authProvider);
    final themeMode = ref.watch(themeModeProvider);
    final isDark = themeMode == ThemeMode.dark;

    final currentUser = workspace.currentUser ?? authState.user;
    final fullName = currentUser?['fullName'] ??
        currentUser?['name'] ??
        currentUser?['username'] ??
        currentUser?['email'] ??
        'Yaldi Employee';

    final jobTitle = currentUser?['jobTitle'] ??
        currentUser?['designation'] ??
        currentUser?['role']?.toString().replaceAll('_', ' ').toUpperCase() ??
        'Staff';

    final companyName = currentUser?['companyName'] ??
        currentUser?['company'] ??
        'Yaldi HR';

    final rawCode = currentUser?['employeeCode'] ??
        currentUser?['employee_code'] ??
        currentUser?['code'] ??
        currentUser?['id']?.toString().substring(0, 4) ??
        '0001';
    final employeeCode = rawCode.toString().toUpperCase().startsWith('EMP-')
        ? rawCode.toString().toUpperCase()
        : 'EMP-$rawCode';

    // Policy label
    String policyLabel;
    if (workspace.isExecutiveExempt) {
      policyLabel = 'Executive Exempt';
    } else {
      switch (workspace.effectiveClockInPolicy) {
        case AppConstants.policyStrictMobileGps:
          policyLabel = 'Strict GPS';
          break;
        case AppConstants.policyMobileOrOffice:
          policyLabel = 'Mobile or Office';
          break;
        case AppConstants.policyGeofenceExempt:
          policyLabel = 'Geofence Exempt';
          break;
        default:
          policyLabel = 'Standard GPS';
          break;
      }
    }

    final zoneCount = workspace.assignedZoneIds.length;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      appBar: AppBar(
        backgroundColor: Colors.transparent,
        elevation: 0,
        scrolledUnderElevation: 0,
        leading: IconButton(
          icon: Icon(
            Icons.arrow_back_ios_new_rounded,
            size: 19,
            color: AppTheme.textPri(context),
          ),
          onPressed: () => Navigator.of(context).pop(),
        ),
        title: Text(
          'Profile',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 20,
            fontWeight: FontWeight.w800,
            color: AppTheme.textPri(context),
            letterSpacing: -0.4,
          ),
        ),
        centerTitle: false,
      ),
      body: SafeArea(
        top: false,
        child: SingleChildScrollView(
          physics: const AlwaysScrollableScrollPhysics(),
          padding: const EdgeInsets.symmetric(horizontal: 20.0, vertical: 8.0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Top Identity Card
              Container(
                decoration: BoxDecoration(
                  color: AppTheme.surface(context),
                  borderRadius: BorderRadius.circular(22),
                  border: Border.all(color: AppTheme.border(context), width: 1),
                  boxShadow: [
                    BoxShadow(
                      color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.03),
                      blurRadius: 14,
                      offset: const Offset(0, 4),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(22),
                  child: Stack(
                    children: [
                      // Soft decorative corner accent
                      Positioned(
                        top: -30,
                        right: -30,
                        child: Container(
                          width: 130,
                          height: 130,
                          decoration: BoxDecoration(
                            color: (isDark ? const Color(0xFF1A4579) : AppTheme.heroBlueStart)
                                .withValues(alpha: isDark ? 0.25 : 0.6),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                      Positioned(
                        top: 20,
                        right: 20,
                        child: Container(
                          width: 60,
                          height: 60,
                          decoration: BoxDecoration(
                            color: (isDark ? const Color(0xFF2A67B1) : AppTheme.heroBlueEnd)
                                .withValues(alpha: isDark ? 0.2 : 0.4),
                            shape: BoxShape.circle,
                          ),
                        ),
                      ),
                      Padding(
                        padding: const EdgeInsets.all(22.0),
                        child: Row(
                          children: [
                            // Circular Avatar Badge with user initials
                            Container(
                              width: 68,
                              height: 68,
                              decoration: BoxDecoration(
                                gradient: const LinearGradient(
                                  begin: Alignment.topLeft,
                                  end: Alignment.bottomRight,
                                  colors: [
                                    Color(0xFF3B8BEC),
                                    Color(0xFF2A67B1),
                                  ],
                                ),
                                shape: BoxShape.circle,
                                boxShadow: [
                                  BoxShadow(
                                    color: AppTheme.primaryBlue
                                        .withValues(alpha: 0.25),
                                    blurRadius: 12,
                                    offset: const Offset(0, 4),
                                  ),
                                ],
                              ),
                              child: Center(
                                child: Text(
                                  _getInitials(fullName),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 22,
                                    fontWeight: FontWeight.w800,
                                    color: Colors.white,
                                    letterSpacing: 0.5,
                                  ),
                                ),
                              ),
                            ),
                            const SizedBox(width: 16),

                            // Identity text & EMP code pill
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    fullName,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 18,
                                      fontWeight: FontWeight.w800,
                                      color: AppTheme.textPri(context),
                                      letterSpacing: -0.3,
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 3),
                                  Text(
                                    '$jobTitle · $companyName',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 12.5,
                                      fontWeight: FontWeight.w500,
                                      color: AppTheme.textMut(context),
                                    ),
                                    maxLines: 1,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                  const SizedBox(height: 8),

                                  // #3B8BEC employeeCode pill (EMP-XXXX)
                                  Container(
                                    padding: const EdgeInsets.symmetric(
                                        horizontal: 10, vertical: 3.5),
                                    decoration: BoxDecoration(
                                      color: isDark ? const Color(0xFF102A4C) : AppTheme.heroBlueStart,
                                      borderRadius: BorderRadius.circular(12),
                                      border: Border.all(
                                          color: isDark ? const Color(0xFF1A4579) : AppTheme.heroBlueBorder),
                                    ),
                                    child: Row(
                                      mainAxisSize: MainAxisSize.min,
                                      children: [
                                        const Icon(
                                          Icons.badge_rounded,
                                          size: 13,
                                          color: AppTheme.primaryBlue,
                                        ),
                                        const SizedBox(width: 5),
                                        Text(
                                          employeeCode,
                                          style: GoogleFonts.plusJakartaSans(
                                            fontSize: 11.5,
                                            fontWeight: FontWeight.w800,
                                            color: AppTheme.primaryBlue,
                                            letterSpacing: 0.4,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // PREFERENCES Grouped Card
              Padding(
                padding: const EdgeInsets.only(left: 4.0, bottom: 8.0),
                child: Text(
                  'PREFERENCES',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textMut(context),
                    letterSpacing: 0.8,
                  ),
                ),
              ),
              Container(
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
                    children: [
                      // Dark appearance toggle switch
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18.0, vertical: 14.0),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: isDark ? const Color(0xFF102A4C) : AppTheme.heroBlueStart,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: const Icon(
                                Icons.dark_mode_outlined,
                                size: 20,
                                color: AppTheme.primaryBlue,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Dark appearance',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w700,
                                      color: AppTheme.textPri(context),
                                    ),
                                  ),
                                  Text(
                                    'Switch between light and dark mode',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11.5,
                                      color: AppTheme.textMut(context),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Switch.adaptive(
                              value: isDark,
                              activeTrackColor: AppTheme.primaryBlue,
                              activeThumbColor: Colors.white,
                              onChanged: (val) {
                                ref
                                    .read(themeModeProvider.notifier)
                                    .toggleDarkMode(val);
                              },
                            ),
                          ],
                        ),
                      ),

                      Divider(
                        height: 1,
                        thickness: 1,
                        color: AppTheme.divider(context),
                      ),

                      // Location & Geofence status row
                      Padding(
                        padding: const EdgeInsets.symmetric(
                            horizontal: 18.0, vertical: 14.0),
                        child: Row(
                          children: [
                            Container(
                              width: 38,
                              height: 38,
                              decoration: BoxDecoration(
                                color: isDark ? const Color(0xFF0F3A22) : AppTheme.successFill,
                                borderRadius: BorderRadius.circular(12),
                              ),
                              child: Icon(
                                Icons.location_on_outlined,
                                size: 20,
                                color: isDark ? AppTheme.darkSuccessText : AppTheme.successText,
                              ),
                            ),
                            const SizedBox(width: 14),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  Text(
                                    'Geofence & Clock-In Policy',
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 14.5,
                                      fontWeight: FontWeight.w700,
                                      color: AppTheme.textPri(context),
                                    ),
                                  ),
                                  Text(
                                    policyLabel,
                                    style: GoogleFonts.plusJakartaSans(
                                      fontSize: 11.5,
                                      color: AppTheme.textMut(context),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            Container(
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 10, vertical: 4),
                              decoration: BoxDecoration(
                                color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                                borderRadius: BorderRadius.circular(12),
                                border: Border.all(color: AppTheme.border(context)),
                              ),
                              child: Text(
                                workspace.isExecutiveExempt
                                    ? 'Exempt'
                                    : '$zoneCount zone${zoneCount == 1 ? '' : 's'}',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 11.5,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textSec(context),
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 24),

              // WORKSPACE Grouped Card
              Padding(
                padding: const EdgeInsets.only(left: 4.0, bottom: 8.0),
                child: Text(
                  'WORKSPACE',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w800,
                    color: AppTheme.textMut(context),
                    letterSpacing: 0.8,
                  ),
                ),
              ),
              Container(
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
                    children: [
                      // Attendance log (switches to Clock-In / Attendance tab)
                      _buildActionRow(
                        context,
                        icon: Icons.access_time_rounded,
                        iconColor: AppTheme.primaryBlue,
                        iconBg: isDark ? const Color(0xFF102A4C) : AppTheme.heroBlueStart,
                        title: 'Attendance log',
                        subtitle: 'View check-in history and daily hours',
                        onTap: () {
                          ref
                              .read(currentTabProvider.notifier)
                              .setTab('attendance');
                          Navigator.of(context).pop();
                        },
                      ),

                      Divider(
                        height: 1,
                        thickness: 1,
                        color: AppTheme.divider(context),
                      ),

                      // My requests (switches to Requests tab)
                      _buildActionRow(
                        context,
                        icon: Icons.assignment_outlined,
                        iconColor: AppTheme.warningPill(context).$1,
                        iconBg: AppTheme.warningPill(context).$2,
                        title: 'My requests',
                        subtitle: 'Submit & track approval requests',
                        onTap: () {
                          ref
                              .read(currentTabProvider.notifier)
                              .setTab('requests');
                          Navigator.of(context).pop();
                        },
                      ),

                      Divider(
                        height: 1,
                        thickness: 1,
                        color: AppTheme.divider(context),
                      ),

                      // Change password (opens ChangePasswordScreen)
                      _buildActionRow(
                        context,
                        icon: Icons.lock_outline_rounded,
                        iconColor: isDark ? AppTheme.primaryBlue : AppTheme.navActiveIcon,
                        iconBg: isDark ? const Color(0xFF1A4579) : AppTheme.navPillBg,
                        title: 'Change password',
                        subtitle: 'Update your account credentials',
                        onTap: () {
                          Navigator.of(context).push(
                            MaterialPageRoute(
                              builder: (_) => const ChangePasswordScreen(),
                            ),
                          );
                        },
                      ),

                      Divider(
                        height: 1,
                        thickness: 1,
                        color: AppTheme.divider(context),
                      ),

                      // Sign out (red-tinted icon badge)
                      _buildActionRow(
                        context,
                        icon: Icons.logout_rounded,
                        iconColor: AppTheme.errorPill(context).$1,
                        iconBg: AppTheme.errorPill(context).$2,
                        title: 'Sign out',
                        subtitle: 'Log out of your session on this device',
                        titleColor: AppTheme.errorPill(context).$1,
                        onTap: () => _confirmSignOut(context, ref),
                      ),
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 32),

              // App Version footer
              Center(
                child: Text(
                  'Yaldi HR Mobile v1.0.0 · Build 2026',
                  style: GoogleFonts.plusJakartaSans(
                    fontSize: 11,
                    fontWeight: FontWeight.w500,
                    color: AppTheme.textMut(context),
                  ),
                ),
              ),
              const SizedBox(height: 20),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildActionRow(
    BuildContext context, {
    required IconData icon,
    required Color iconColor,
    required Color iconBg,
    required String title,
    required String subtitle,
    Color? titleColor,
    required VoidCallback onTap,
  }) {
    return InkWell(
      onTap: onTap,
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 18.0, vertical: 14.0),
        child: Row(
          children: [
            Container(
              width: 38,
              height: 38,
              decoration: BoxDecoration(
                color: iconBg,
                borderRadius: BorderRadius.circular(12),
              ),
              child: Icon(icon, size: 20, color: iconColor),
            ),
            const SizedBox(width: 14),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    title,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 14.5,
                      fontWeight: FontWeight.w700,
                      color: titleColor ?? AppTheme.textPri(context),
                    ),
                  ),
                  Text(
                    subtitle,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 11.5,
                      color: AppTheme.textMut(context),
                    ),
                  ),
                ],
              ),
            ),
            Icon(
              Icons.chevron_right_rounded,
              size: 20,
              color: AppTheme.textMut(context),
            ),
          ],
        ),
      ),
    );
  }
}
