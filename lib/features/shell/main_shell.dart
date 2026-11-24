import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../core/workspace_provider.dart';
import '../approvals/approvals_provider.dart';
import '../approvals/approvals_screen.dart';
import '../attendance/attendance_screen.dart';
import '../auth/auth_provider.dart';
import '../requests/requests_screen.dart';

class CurrentTabNotifier extends Notifier<String> {
  @override
  String build() => 'attendance';

  void setTab(String tabId) {
    state = tabId;
  }
}

final currentTabProvider =
    NotifierProvider<CurrentTabNotifier, String>(CurrentTabNotifier.new);

class NavTabItem {
  final String id;
  final String label;
  final IconData icon;
  final IconData activeIcon;
  final Widget screen;
  final int badgeCount;

  NavTabItem({
    required this.id,
    required this.label,
    required this.icon,
    required this.activeIcon,
    required this.screen,
    this.badgeCount = 0,
  });
}

class MainShell extends ConsumerStatefulWidget {
  const MainShell({super.key});

  @override
  ConsumerState<MainShell> createState() => _MainShellState();
}

class _MainShellState extends ConsumerState<MainShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    final workspace = ref.watch(workspaceProvider);
    final approvalsState = ref.watch(approvalsProvider);

    // Build dynamic list of navigation tabs (strictly limited to Clock-In, Requests, Approvals)
    final List<NavTabItem> tabs = [];

    // 1. Clock-In / Out Tab
    tabs.add(
      NavTabItem(
        id: 'attendance',
        label: 'Clock-In',
        icon: Icons.access_time_rounded,
        activeIcon: Icons.access_time_filled_rounded,
        screen: const AttendanceScreen(),
      ),
    );

    // 2. My Requests Tab (hidden if hiddenSections contains 'requests')
    if (!workspace.isRequestsHidden) {
      tabs.add(
        NavTabItem(
          id: 'requests',
          label: 'Requests',
          icon: Icons.assignment_outlined,
          activeIcon: Icons.assignment_rounded,
          screen: const RequestsScreen(),
        ),
      );
    }

    // 3. Approvals Tab (STRICT RULE: ONLY visible if normalized role is main_manager, hr_manager, or hr_admin / hr)
    // NEVER show Approvals tab to direct managers, section managers, accounting, or regular employees,
    // even if pending items exist.
    final hasApprovalRole = workspace.hasApprovalRole ||
        AppConstants.isApprovalRole(ref.watch(authProvider).user?['role']);

    if (hasApprovalRole) {
      final totalPending = approvalsState.totalPendingCount;
      tabs.add(
        NavTabItem(
          id: 'approvals',
          label: 'Approvals',
          icon: Icons.approval_outlined,
          activeIcon: Icons.approval_rounded,
          screen: const ApprovalsScreen(),
          badgeCount: totalPending,
        ),
      );
    }

    // Sync selected index with currentTabProvider or bounds
    final currentTabId = ref.watch(currentTabProvider);
    final activeTabIndex = tabs.indexWhere((t) => t.id == currentTabId);
    if (activeTabIndex != -1 && activeTabIndex != _currentIndex) {
      _currentIndex = activeTabIndex;
    } else if (_currentIndex >= tabs.length) {
      _currentIndex = 0;
    }

    final isDark = AppTheme.isDark(context);

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: IndexedStack(
        index: _currentIndex,
        children: tabs.map((t) => t.screen).toList(),
      ),
      bottomNavigationBar: tabs.length > 1
          ? Container(
              decoration: BoxDecoration(
                color: isDark ? AppTheme.darkCardSurface : AppTheme.cardSurface,
                border: Border(
                  top: BorderSide(
                    color: isDark ? AppTheme.darkCardBorder : AppTheme.dividerColor,
                    width: 1.0,
                  ),
                ),
              ),
              child: SafeArea(
                top: false,
                child: Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 16.0, vertical: 8.0),
                  child: Row(
                    mainAxisAlignment: MainAxisAlignment.spaceAround,
                    children: List.generate(tabs.length, (index) {
                      final tab = tabs[index];
                      final isSelected = index == _currentIndex;

                      return Expanded(
                        child: InkWell(
                          onTap: () {
                            ref.read(currentTabProvider.notifier).setTab(tab.id);
                            if (_currentIndex != index) {
                              setState(() => _currentIndex = index);
                            }
                          },
                          splashColor: Colors.transparent,
                          highlightColor: Colors.transparent,
                          child: Column(
                            mainAxisSize: MainAxisSize.min,
                            children: [
                              // Active pill container (#C9D8FA / #1A4579) vs inactive
                              AnimatedContainer(
                                duration: const Duration(milliseconds: 200),
                                curve: Curves.easeInOut,
                                padding: EdgeInsets.symmetric(
                                  horizontal: isSelected ? 18.0 : 8.0,
                                  vertical: 4.0,
                                ),
                                decoration: BoxDecoration(
                                  color: isSelected
                                      ? (isDark ? const Color(0xFF1A4579) : AppTheme.navPillBg)
                                      : Colors.transparent,
                                  borderRadius: BorderRadius.circular(16),
                                ),
                                child: Stack(
                                  clipBehavior: Clip.none,
                                  children: [
                                    Icon(
                                      isSelected ? tab.activeIcon : tab.icon,
                                      size: 22,
                                      color: isSelected
                                          ? (isDark ? AppTheme.primaryBlue : AppTheme.navActiveIcon)
                                          : (isDark ? AppTheme.darkTextMuted : AppTheme.textMuted),
                                    ),
                                    if (tab.badgeCount > 0)
                                      Positioned(
                                        top: -6,
                                        right: -10,
                                        child: Container(
                                          padding: const EdgeInsets.symmetric(
                                            horizontal: 5,
                                            vertical: 2,
                                          ),
                                          decoration: BoxDecoration(
                                            color: isDark ? AppTheme.darkWarningFill : AppTheme.warningFill,
                                            borderRadius: BorderRadius.circular(10),
                                            border: Border.all(
                                              color: (isDark ? AppTheme.darkWarningText : AppTheme.warningText)
                                                  .withValues(alpha: 0.3),
                                              width: 1,
                                            ),
                                          ),
                                          child: Text(
                                            '${tab.badgeCount}',
                                            style: GoogleFonts.plusJakartaSans(
                                              fontSize: 9.5,
                                              fontWeight: FontWeight.w700,
                                              color: isDark ? AppTheme.darkWarningText : AppTheme.warningText,
                                            ),
                                          ),
                                        ),
                                      ),
                                  ],
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                tab.label,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: isSelected
                                      ? FontWeight.w700
                                      : FontWeight.w500,
                                  color: isSelected
                                      ? (isDark ? AppTheme.primaryBlue : AppTheme.navActiveIcon)
                                      : (isDark ? AppTheme.darkTextMuted : AppTheme.textMuted),
                                ),
                              ),
                            ],
                          ),
                        ),
                      );
                    }),
                  ),
                ),
              ),
            )
          : null,
    );
  }
}
