import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/constants.dart';
import '../../core/theme.dart';
import '../../core/workspace_provider.dart';
import '../auth/auth_provider.dart';
import 'approvals_provider.dart';

class ApprovalsScreen extends ConsumerStatefulWidget {
  const ApprovalsScreen({super.key});

  @override
  ConsumerState<ApprovalsScreen> createState() => _ApprovalsScreenState();
}

class _ApprovalsScreenState extends ConsumerState<ApprovalsScreen> {
  String _activeFilter = 'All'; // 'All', 'Requests', 'Leaves', 'Deductions'

  void _showActionDialog({
    required String title,
    required String action,
    required Future<void> Function(String note) onConfirm,
  }) {
    final noteController = TextEditingController();
    final isDark = AppTheme.isDark(context);

    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        backgroundColor: isDark ? AppTheme.darkCardSurface : AppTheme.cardSurface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(22)),
        title: Text(
          title,
          style: GoogleFonts.plusJakartaSans(
            fontSize: 18,
            fontWeight: FontWeight.w700,
            color: isDark ? AppTheme.darkTextPrimary : AppTheme.textPrimary,
          ),
        ),
        content: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Are you sure you want to $action this submission?',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: isDark ? AppTheme.darkTextSecondary : AppTheme.textSecondary,
              ),
            ),
            const SizedBox(height: 14),
            TextField(
              controller: noteController,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 14,
                color: isDark ? AppTheme.darkTextPrimary : AppTheme.textPrimary,
              ),
              decoration: const InputDecoration(
                labelText: 'Notes / Reason (Optional)',
                hintText: 'Add remark for audit log...',
              ),
              maxLines: 2,
            ),
          ],
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(ctx).pop(),
            child: Text(
              'Cancel',
              style: GoogleFonts.plusJakartaSans(
                color: isDark ? AppTheme.darkTextMuted : AppTheme.textMuted,
                fontWeight: FontWeight.w600,
              ),
            ),
          ),
          ElevatedButton(
            style: ElevatedButton.styleFrom(
              backgroundColor: action == 'reject'
                  ? (isDark ? AppTheme.darkErrorText : AppTheme.errorText)
                  : (action == 'bypass'
                      ? AppTheme.goldAccent
                      : AppTheme.primaryBlue),
              foregroundColor: Colors.white,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(20),
              ),
            ),
            onPressed: () async {
              Navigator.of(ctx).pop();
              await onConfirm(noteController.text.trim());
            },
            child: Text(
              'Confirm ${action.toUpperCase()}',
              style: GoogleFonts.plusJakartaSans(
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final workspace = ref.watch(workspaceProvider);
    final authState = ref.watch(authProvider);

    final normalizedRole = AppConstants.normalizeRole(
        workspace.currentUser?['role'] ?? authState.user?['role']);
    final isAuthorized = AppConstants.isApprovalRole(normalizedRole);

    // STRICT SCOPE: If user does not have an approval role (main_manager, hr_manager, hr_admin, hr),
    // render access-restricted placeholder view immediately.
    if (!isAuthorized) {
      return _buildAccessRestrictedView(context, normalizedRole);
    }

    final state = ref.watch(approvalsProvider);
    final notifier = ref.read(approvalsProvider.notifier);

    final canBypass = normalizedRole == AppConstants.roleMainManager ||
        normalizedRole == AppConstants.roleHrManager;

    final reqs = state.pendingRequests;
    final leaves = workspace.isLeavesHidden ? <Map<String, dynamic>>[] : state.pendingLeaves;
    final deductions =
        workspace.isDeductionApprovalsHidden ? <Map<String, dynamic>>[] : state.pendingDeductions;
    final totalActionable = reqs.length + leaves.length + deductions.length;

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => notifier.loadAllApprovals(background: true),
          color: AppTheme.primaryBlue,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Top Header Row
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            'Approvals Desk',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 24,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.textPri(context),
                              letterSpacing: -0.5,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            '$totalActionable pending items require your action',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 13,
                              fontWeight: FontWeight.w500,
                              color: AppTheme.textMut(context),
                            ),
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(width: 12),
                    IconButton(
                      icon: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: BoxDecoration(
                          color: AppTheme.surface(context),
                          shape: BoxShape.circle,
                          border: Border.all(color: AppTheme.border(context)),
                        ),
                        child: Icon(
                          Icons.refresh_rounded,
                          size: 18,
                          color: AppTheme.textSec(context),
                        ),
                      ),
                      onPressed: () => notifier.loadAllApprovals(background: true),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Feedback Banner
                if (state.errorMessage != null) ...[
                  _buildFeedbackBanner(
                    context,
                    isError: true,
                    message: state.errorMessage!,
                    onClose: notifier.clearMessages,
                  ),
                  const SizedBox(height: 14),
                ],
                if (state.successMessage != null) ...[
                  _buildFeedbackBanner(
                    context,
                    isError: false,
                    message: state.successMessage!,
                    onClose: notifier.clearMessages,
                  ),
                  const SizedBox(height: 14),
                ],

                // 2-Column Summary KPI Cards with large colored numbers
                Row(
                  children: [
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Total Actionable',
                        count: totalActionable,
                        color: AppTheme.primaryBlue,
                        icon: Icons.pending_actions_rounded,
                        bgColor: AppTheme.isDark(context)
                            ? const Color(0xFF102A4C)
                            : AppTheme.heroBlueStart,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Pending Requests',
                        count: reqs.length,
                        color: AppTheme.isDark(context)
                            ? AppTheme.darkWarningText
                            : const Color(0xFFDB8E1D),
                        icon: Icons.assignment_late_rounded,
                        bgColor: AppTheme.warningPill(context).$2,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 12),
                Row(
                  children: [
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Leave Approvals',
                        count: leaves.length,
                        color: AppTheme.isDark(context)
                            ? AppTheme.darkSuccessText
                            : const Color(0xFF548C0C),
                        icon: Icons.beach_access_rounded,
                        bgColor: AppTheme.successPill(context).$2,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Deductions',
                        count: deductions.length,
                        color: AppTheme.warningPill(context).$1,
                        icon: Icons.receipt_long_rounded,
                        bgColor: AppTheme.isDark(context)
                            ? AppTheme.darkWarningFill
                            : AppTheme.goldTint,
                      ),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // Horizontal Pill Filter Chips
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _buildFilterChip(context, 'All', totalActionable),
                      const SizedBox(width: 8),
                      _buildFilterChip(context, 'Requests', reqs.length),
                      if (!workspace.isLeavesHidden) ...[
                        const SizedBox(width: 8),
                        _buildFilterChip(context, 'Leaves', leaves.length),
                      ],
                      if (!workspace.isDeductionApprovalsHidden) ...[
                        const SizedBox(width: 8),
                        _buildFilterChip(context, 'Deductions', deductions.length),
                      ],
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // Approval Cards List
                if (state.isLoading && totalActionable == 0)
                  const Padding(
                    padding: EdgeInsets.all(40.0),
                    child: Center(
                      child: CircularProgressIndicator(color: AppTheme.primaryBlue),
                    ),
                  )
                else
                  _buildContentList(context, state, notifier, canBypass),
              ],
            ),
          ),
        ),
      ),
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

  Widget _buildKpiCard(
    BuildContext context, {
    required String title,
    required int count,
    required Color color,
    required IconData icon,
    required Color bgColor,
  }) {
    final isDark = AppTheme.isDark(context);
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border(context), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
            blurRadius: 10,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text(
                title,
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSec(context),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(5),
                decoration: BoxDecoration(
                  color: bgColor,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 14, color: color),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(
            '$count',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 26,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: -0.6,
            ),
          ),
        ],
      ),
    );
  }

  Widget _buildFilterChip(BuildContext context, String label, int count) {
    final isSelected = _activeFilter == label;
    final isDark = AppTheme.isDark(context);

    return InkWell(
      onTap: () {
        setState(() => _activeFilter = label);
      },
      borderRadius: BorderRadius.circular(20),
      child: AnimatedContainer(
        duration: const Duration(milliseconds: 180),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: isSelected
              ? AppTheme.primaryBlue
              : (isDark ? AppTheme.darkCardSurface : Colors.white),
          borderRadius: BorderRadius.circular(20),
          border: Border.all(
            color: isSelected ? AppTheme.primaryBlue : AppTheme.border(context),
            width: 1,
          ),
          boxShadow: isSelected
              ? [
                  BoxShadow(
                    color: AppTheme.primaryBlue.withValues(alpha: 0.25),
                    blurRadius: 8,
                    offset: const Offset(0, 2),
                  ),
                ]
              : null,
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              label,
              style: GoogleFonts.plusJakartaSans(
                fontSize: 13,
                fontWeight: isSelected ? FontWeight.w700 : FontWeight.w600,
                color: isSelected ? Colors.white : AppTheme.textSec(context),
              ),
            ),
            const SizedBox(width: 6),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
              decoration: BoxDecoration(
                color: isSelected
                    ? Colors.white.withValues(alpha: 0.25)
                    : (isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground),
                borderRadius: BorderRadius.circular(10),
              ),
              child: Text(
                '$count',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 11,
                  fontWeight: FontWeight.w700,
                  color: isSelected ? Colors.white : AppTheme.textMut(context),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildContentList(
    BuildContext context,
    ApprovalsState state,
    ApprovalsNotifier notifier,
    bool canBypass,
  ) {
    final items = <Widget>[];

    // Unified Requests
    if (_activeFilter == 'All' || _activeFilter == 'Requests') {
      for (final req in state.pendingRequests) {
        items.add(_buildUnifiedRequestCard(context, req, notifier, canBypass));
      }
    }

    // Leaves
    if (_activeFilter == 'All' || _activeFilter == 'Leaves') {
      for (final leave in state.pendingLeaves) {
        items.add(_buildLeaveCard(context, leave, notifier));
      }
    }

    // Deductions
    if (_activeFilter == 'All' || _activeFilter == 'Deductions') {
      for (final deduction in state.pendingDeductions) {
        items.add(_buildDeductionCard(context, deduction, notifier));
      }
    }

    if (items.isEmpty) {
      return Container(
        padding: const EdgeInsets.all(36.0),
        decoration: BoxDecoration(
          color: AppTheme.surface(context),
          borderRadius: BorderRadius.circular(22),
          border: Border.all(color: AppTheme.border(context)),
        ),
        child: Center(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Container(
                padding: const EdgeInsets.all(16),
                decoration: BoxDecoration(
                  color: AppTheme.isDark(context)
                      ? AppTheme.darkCanvasBackground
                      : AppTheme.canvasBackground,
                  shape: BoxShape.circle,
                ),
                child: const Icon(
                  Icons.check_circle_outline_rounded,
                  size: 36,
                  color: AppTheme.tealAccent,
                ),
              ),
              const SizedBox(height: 14),
              Text(
                'Inbox Zero for "$_activeFilter"',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 16,
                  fontWeight: FontWeight.w700,
                  color: AppTheme.textPri(context),
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'No pending actions currently require your review.',
                style: GoogleFonts.plusJakartaSans(
                  fontSize: 12.5,
                  color: AppTheme.textMut(context),
                ),
              ),
            ],
          ),
        ),
      );
    }

    return ListView.separated(
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      itemCount: items.length,
      separatorBuilder: (context, index) => const SizedBox(height: 12),
      itemBuilder: (context, index) => items[index],
    );
  }

  Widget _buildUnifiedRequestCard(
    BuildContext context,
    Map<String, dynamic> req,
    ApprovalsNotifier notifier,
    bool canBypass,
  ) {
    final id = req['id']?.toString() ?? req['rid']?.toString() ?? '';
    final title = req['title']?.toString() ?? 'Request';
    final user = req['userName'] ??
        req['employeeName'] ??
        req['userId'] ??
        'Employee';
    final category = req['category']?.toString() ?? 'General';
    final reason = req['reason']?.toString() ?? 'No description provided';
    final isDark = AppTheme.isDark(context);
    final (warnText, warnFill) = AppTheme.warningPill(context);
    final (errText, errFill) = AppTheme.errorPill(context);

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border(context), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 4px rounded vertical left status bar (Amber for Requests)
              Container(width: 4, color: isDark ? AppTheme.darkWarningText : const Color(0xFFDB8E1D)),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF102A4C) : AppTheme.heroBlueStart,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.assignment_rounded,
                              size: 16,
                              color: AppTheme.primaryBlue,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user.toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.textPri(context),
                                  ),
                                ),
                                Text(
                                  category.toUpperCase(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.primaryBlue,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: warnFill,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Pending Review',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: warnText,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        title,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 15,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPri(context),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Text(
                        reason,
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: AppTheme.textSec(context),
                          height: 1.35,
                        ),
                      ),
                      Divider(height: 22, color: AppTheme.divider(context)),

                      // Pill-shaped action buttons: Approve, Reject, Bypass
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          if (canBypass) ...[
                            ElevatedButton(
                              style: ElevatedButton.styleFrom(
                                backgroundColor: isDark ? AppTheme.darkWarningFill : AppTheme.goldTint,
                                foregroundColor: isDark ? AppTheme.darkWarningText : AppTheme.warningText,
                                elevation: 0,
                                padding: const EdgeInsets.symmetric(
                                    horizontal: 14, vertical: 8),
                                shape: RoundedRectangleBorder(
                                  borderRadius: BorderRadius.circular(20),
                                ),
                              ),
                              onPressed: () => _showActionDialog(
                                title: 'Bypass Approval',
                                action: 'bypass',
                                onConfirm: (note) => notifier.actOnRequest(
                                  requestId: id,
                                  action: 'bypass',
                                  note: note,
                                ),
                              ),
                              child: Text(
                                'Bypass',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            const SizedBox(width: 8),
                          ],
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: errFill,
                              foregroundColor: errText,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Reject Request',
                              action: 'reject',
                              onConfirm: (note) => notifier.actOnRequest(
                                requestId: id,
                                action: 'reject',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Reject',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryBlue,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Approve Request',
                              action: 'approve',
                              onConfirm: (note) => notifier.actOnRequest(
                                requestId: id,
                                action: 'approve',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Approve',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildLeaveCard(
    BuildContext context,
    Map<String, dynamic> leave,
    ApprovalsNotifier notifier,
  ) {
    final id = leave['id']?.toString() ?? leave['lid']?.toString() ?? '';
    final user = leave['userName'] ??
        leave['employeeName'] ??
        leave['user_id'] ??
        'Employee';
    final type = leave['type'] ?? leave['leaveType'] ?? 'Annual Leave';
    final start = leave['startDate'] ?? leave['start_date'] ?? 'N/A';
    final end = leave['endDate'] ?? leave['end_date'] ?? 'N/A';
    final notes = leave['notes'] ?? leave['reason'] ?? '';
    final isDark = AppTheme.isDark(context);
    final (warnText, warnFill) = AppTheme.warningPill(context);
    final (errText, errFill) = AppTheme.errorPill(context);

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border(context), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 4px rounded vertical left status bar (Teal for Leaves)
              Container(width: 4, color: AppTheme.tealAccent),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isDark ? const Color(0xFF0F3A22) : AppTheme.successFill,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.beach_access_rounded,
                              size: 16,
                              color: AppTheme.tealAccent,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user.toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.textPri(context),
                                  ),
                                ),
                                Text(
                                  type.toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 11,
                                    fontWeight: FontWeight.w600,
                                    color: AppTheme.tealAccent,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Container(
                            padding: const EdgeInsets.symmetric(
                                horizontal: 8, vertical: 3),
                            decoration: BoxDecoration(
                              color: warnFill,
                              borderRadius: BorderRadius.circular(8),
                            ),
                            child: Text(
                              'Leave Request',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 10.5,
                                fontWeight: FontWeight.w700,
                                color: warnText,
                              ),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        'Period: $start to $end',
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13.5,
                          fontWeight: FontWeight.w700,
                          color: AppTheme.textPri(context),
                        ),
                      ),
                      if (notes.toString().isNotEmpty) ...[
                        const SizedBox(height: 4),
                        Text(
                          notes.toString(),
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            color: AppTheme.textSec(context),
                          ),
                        ),
                      ],
                      Divider(height: 22, color: AppTheme.divider(context)),

                      // Pill-shaped Action Buttons: Approve, Reject
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: errFill,
                              foregroundColor: errText,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Reject Leave',
                              action: 'reject',
                              onConfirm: (note) => notifier.decideLeave(
                                leaveId: id,
                                decision: 'rejected',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Reject',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryBlue,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Approve Leave',
                              action: 'approve',
                              onConfirm: (note) => notifier.decideLeave(
                                leaveId: id,
                                decision: 'approved',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Approve',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildDeductionCard(
    BuildContext context,
    Map<String, dynamic> da,
    ApprovalsNotifier notifier,
  ) {
    final id = da['id']?.toString() ?? da['da_id']?.toString() ?? '';
    final user = da['userName'] ??
        da['employeeName'] ??
        da['user_id'] ??
        'Employee';
    final amount = da['amount']?.toString() ?? '0.00';
    final reason = da['reason'] ?? 'Deduction adjustment';
    final isDark = AppTheme.isDark(context);
    final (warnText, warnFill) = AppTheme.warningPill(context);
    final (errText, errFill) = AppTheme.errorPill(context);

    return Container(
      decoration: BoxDecoration(
        color: AppTheme.surface(context),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppTheme.border(context), width: 1),
        boxShadow: [
          BoxShadow(
            color: Colors.black.withValues(alpha: isDark ? 0.2 : 0.02),
            blurRadius: 8,
            offset: const Offset(0, 3),
          ),
        ],
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(20),
        child: IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // 4px rounded vertical left status bar (Gold for Deductions)
              Container(width: 4, color: AppTheme.goldAccent),

              Expanded(
                child: Padding(
                  padding: const EdgeInsets.all(16.0),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Container(
                            padding: const EdgeInsets.all(8),
                            decoration: BoxDecoration(
                              color: isDark ? AppTheme.darkWarningFill : AppTheme.goldTint,
                              shape: BoxShape.circle,
                            ),
                            child: const Icon(
                              Icons.receipt_long_rounded,
                              size: 16,
                              color: AppTheme.goldAccent,
                            ),
                          ),
                          const SizedBox(width: 10),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  user.toString(),
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 14,
                                    fontWeight: FontWeight.w700,
                                    color: AppTheme.textPri(context),
                                  ),
                                ),
                                Text(
                                  'PAYROLL DEDUCTION',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 10.5,
                                    fontWeight: FontWeight.w700,
                                    color: warnText,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            'AED $amount',
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 16,
                              fontWeight: FontWeight.w800,
                              color: AppTheme.textPri(context),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 10),
                      Text(
                        reason.toString(),
                        style: GoogleFonts.plusJakartaSans(
                          fontSize: 13,
                          color: AppTheme.textSec(context),
                        ),
                      ),
                      Divider(height: 22, color: AppTheme.divider(context)),

                      // Pill-shaped Action Buttons: Approve, Reject
                      Row(
                        mainAxisAlignment: MainAxisAlignment.end,
                        children: [
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: errFill,
                              foregroundColor: errText,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 14, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Reject Deduction',
                              action: 'reject',
                              onConfirm: (note) => notifier.decideDeduction(
                                deductionId: id,
                                decision: 'rejected',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Reject',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                          const SizedBox(width: 8),
                          ElevatedButton(
                            style: ElevatedButton.styleFrom(
                              backgroundColor: AppTheme.primaryBlue,
                              foregroundColor: Colors.white,
                              elevation: 0,
                              padding: const EdgeInsets.symmetric(
                                  horizontal: 16, vertical: 8),
                              shape: RoundedRectangleBorder(
                                borderRadius: BorderRadius.circular(20),
                              ),
                            ),
                            onPressed: () => _showActionDialog(
                              title: 'Approve Deduction',
                              action: 'approve',
                              onConfirm: (note) => notifier.decideDeduction(
                                deductionId: id,
                                decision: 'approved',
                                note: note,
                              ),
                            ),
                            child: Text(
                              'Approve',
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 12,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _buildAccessRestrictedView(BuildContext context, String role) {
    final displayRole = role.isEmpty ? 'employee' : role;
    final isDark = AppTheme.isDark(context);
    final (errText, errFill) = AppTheme.errorPill(context);

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24.0, vertical: 32.0),
            child: Container(
              constraints: const BoxConstraints(maxWidth: 420),
              padding: const EdgeInsets.all(28.0),
              decoration: BoxDecoration(
                color: AppTheme.surface(context),
                borderRadius: BorderRadius.circular(24),
                border: Border.all(color: AppTheme.border(context), width: 1.0),
                boxShadow: [
                  BoxShadow(
                    color: Colors.black.withValues(alpha: isDark ? 0.25 : 0.04),
                    blurRadius: 18,
                    offset: const Offset(0, 6),
                  ),
                ],
              ),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  // Icon badge
                  Container(
                    width: 72,
                    height: 72,
                    decoration: BoxDecoration(
                      color: errFill,
                      shape: BoxShape.circle,
                      border: Border.all(
                        color: errText.withValues(alpha: 0.2),
                        width: 1.5,
                      ),
                    ),
                    child: Center(
                      child: Icon(
                        Icons.lock_person_rounded,
                        size: 34,
                        color: errText,
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),
                  // Title
                  Text(
                    'Access Restricted',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 20,
                      fontWeight: FontWeight.w800,
                      color: AppTheme.textPri(context),
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 10),
                  // Subtitle
                  Text(
                    'The Approvals Desk is strictly restricted to Executive and HR Management (main_manager, hr_manager, hr_admin).',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 13.5,
                      height: 1.5,
                      color: AppTheme.textSec(context),
                    ),
                  ),
                  const SizedBox(height: 16),
                  // Role indicator pill
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
                    decoration: BoxDecoration(
                      color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                      borderRadius: BorderRadius.circular(16),
                      border: Border.all(color: AppTheme.border(context)),
                    ),
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        const Icon(
                          Icons.person_outline_rounded,
                          size: 15,
                          color: AppTheme.textMuted,
                        ),
                        const SizedBox(width: 6),
                        Text(
                          'Signed in as: $displayRole',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 12.5,
                            fontWeight: FontWeight.w600,
                            color: AppTheme.textMut(context),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                  Text(
                    'Direct managers, section managers, accounting, and regular employees do not have access to approval queues on mobile.',
                    textAlign: TextAlign.center,
                    style: GoogleFonts.plusJakartaSans(
                      fontSize: 12,
                      height: 1.4,
                      color: AppTheme.textMut(context),
                    ),
                  ),
                  if (Navigator.of(context).canPop()) ...[
                    const SizedBox(height: 20),
                    OutlinedButton.icon(
                      onPressed: () => Navigator.of(context).pop(),
                      icon: const Icon(Icons.arrow_back_rounded, size: 16),
                      label: Text(
                        'Go Back',
                        style: GoogleFonts.plusJakartaSans(
                          fontWeight: FontWeight.w700,
                          fontSize: 13,
                        ),
                      ),
                      style: OutlinedButton.styleFrom(
                        foregroundColor: AppTheme.textPri(context),
                        side: BorderSide(color: AppTheme.border(context)),
                        shape: RoundedRectangleBorder(
                          borderRadius: BorderRadius.circular(20),
                        ),
                        padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 12),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
