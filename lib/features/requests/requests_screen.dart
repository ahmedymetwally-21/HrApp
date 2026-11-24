import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:intl/intl.dart';
import 'package:material_ui/material_ui.dart';
import '../../core/theme.dart';
import '../../core/workspace_provider.dart';
import 'new_request_sheet.dart';
import 'requests_provider.dart';

class RequestsScreen extends ConsumerStatefulWidget {
  const RequestsScreen({super.key});

  @override
  ConsumerState<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends ConsumerState<RequestsScreen> {
  String _activeFilter = 'All'; // 'All', 'Pending', 'Approved', 'Rejected'

  @override
  Widget build(BuildContext context) {
    final workspace = ref.watch(workspaceProvider);
    final state = ref.watch(requestsProvider);
    final notifier = ref.read(requestsProvider.notifier);
    final isDark = AppTheme.isDark(context);

    if (workspace.isRequestsHidden) {
      return Scaffold(
        backgroundColor: AppTheme.scaffoldBackground(context),
        body: Center(
          child: Text(
            'Requests section is currently restricted by organization policy.',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 14,
              color: AppTheme.textMut(context),
            ),
          ),
        ),
      );
    }

    final allReqs = state.requests;
    final pendingCount = allReqs.where((r) {
      final s = (r['status']?.toString() ?? 'pending').toLowerCase();
      return s == 'pending';
    }).length;

    final approvedCount = allReqs.where((r) {
      final s = (r['status']?.toString() ?? '').toLowerCase();
      return s == 'approved';
    }).length;

    final rejectedCount = allReqs.where((r) {
      final s = (r['status']?.toString() ?? '').toLowerCase();
      return s == 'rejected';
    }).length;

    // Filter items based on active pill
    final filtered = allReqs.where((r) {
      if (_activeFilter == 'All') return true;
      final s = (r['status']?.toString() ?? 'pending').toLowerCase();
      return s == _activeFilter.toLowerCase();
    }).toList();

    return Scaffold(
      backgroundColor: AppTheme.scaffoldBackground(context),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () {
          showModalBottomSheet(
            context: context,
            isScrollControlled: true,
            backgroundColor: Colors.transparent,
            builder: (_) => const NewRequestSheet(),
          );
        },
        backgroundColor: AppTheme.primaryBlue,
        foregroundColor: Colors.white,
        elevation: 2,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        icon: const Icon(Icons.add_rounded, size: 20),
        label: Text(
          'New request',
          style: GoogleFonts.plusJakartaSans(
            fontWeight: FontWeight.w700,
            fontSize: 14,
          ),
        ),
      ),
      body: SafeArea(
        child: RefreshIndicator(
          onRefresh: () => notifier.loadRequests(background: true),
          color: AppTheme.primaryBlue,
          child: SingleChildScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            padding: const EdgeInsets.fromLTRB(20, 16, 20, 96),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                // Header Title
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          'My Requests',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 24,
                            fontWeight: FontWeight.w800,
                            color: AppTheme.textPri(context),
                            letterSpacing: -0.5,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          'Track applications and approvals',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 13,
                            fontWeight: FontWeight.w500,
                            color: AppTheme.textMut(context),
                          ),
                        ),
                      ],
                    ),
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
                      onPressed: () => notifier.loadRequests(background: true),
                    ),
                  ],
                ),
                const SizedBox(height: 18),

                // 2-Column Summary KPI Cards (large colored numbers)
                Row(
                  children: [
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Pending Review',
                        count: pendingCount,
                        color: isDark ? AppTheme.darkWarningText : const Color(0xFFDB8E1D),
                        icon: Icons.hourglass_top_rounded,
                        bgColor: AppTheme.warningPill(context).$2,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: _buildKpiCard(
                        context,
                        title: 'Approved',
                        count: approvedCount,
                        color: isDark ? AppTheme.darkSuccessText : const Color(0xFF548C0C),
                        icon: Icons.check_circle_rounded,
                        bgColor: AppTheme.successPill(context).$2,
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
                      _buildFilterChip(context, 'All', allReqs.length),
                      const SizedBox(width: 8),
                      _buildFilterChip(context, 'Pending', pendingCount),
                      const SizedBox(width: 8),
                      _buildFilterChip(context, 'Approved', approvedCount),
                      const SizedBox(width: 8),
                      _buildFilterChip(context, 'Rejected', rejectedCount),
                    ],
                  ),
                ),
                const SizedBox(height: 18),

                // Request Items List
                if (state.isLoading && allReqs.isEmpty)
                  const Padding(
                    padding: EdgeInsets.all(40.0),
                    child: Center(
                      child: CircularProgressIndicator(color: AppTheme.primaryBlue),
                    ),
                  )
                else if (filtered.isEmpty)
                  _buildEmptyState(context)
                else
                  ListView.separated(
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    itemCount: filtered.length,
                    separatorBuilder: (context, index) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final req = filtered[index];
                      return _buildFigmaRequestCard(context, req);
                    },
                  ),
              ],
            ),
          ),
        ),
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
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
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
                  fontSize: 12.5,
                  fontWeight: FontWeight.w600,
                  color: AppTheme.textSec(context),
                ),
              ),
              Container(
                padding: const EdgeInsets.all(6),
                decoration: BoxDecoration(
                  color: bgColor,
                  shape: BoxShape.circle,
                ),
                child: Icon(icon, size: 14, color: color),
              ),
            ],
          ),
          const SizedBox(height: 8),
          Text(
            '$count',
            style: GoogleFonts.plusJakartaSans(
              fontSize: 28,
              fontWeight: FontWeight.w800,
              color: color,
              letterSpacing: -0.8,
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

  Widget _buildFigmaRequestCard(BuildContext context, Map<String, dynamic> req) {
    final title = req['title']?.toString() ?? 'Request';
    final category = req['category']?.toString() ?? 'General';
    final status = (req['status']?.toString() ?? 'pending').toLowerCase();
    final reason = req['reason']?.toString() ?? '';
    final rawDate = req['createdAt'] ?? req['created_at'] ?? req['date'];
    final isDark = AppTheme.isDark(context);

    String formattedDate = '';
    if (rawDate != null) {
      try {
        final d = DateTime.parse(rawDate.toString());
        formattedDate = DateFormat('MMM d, yyyy • hh:mm a').format(d);
      } catch (_) {
        formattedDate = rawDate.toString();
      }
    }

    final attachment = req['attachmentUrl'] ?? req['fileUrl'];

    // Left status bar color
    Color statusBarColor;
    if (status == 'approved') {
      statusBarColor = isDark ? AppTheme.darkSuccessText : AppTheme.successText;
    } else if (status == 'rejected') {
      statusBarColor = isDark ? AppTheme.darkErrorText : AppTheme.errorText;
    } else if (status == 'bypassed') {
      statusBarColor = const Color(0xFF7C3AED);
    } else {
      statusBarColor = isDark ? AppTheme.darkWarningText : const Color(0xFFDB8E1D);
    }

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
              // 4px rounded vertical left status bar
              Container(
                width: 4,
                color: statusBarColor,
              ),

              // Card Body
              Expanded(
                child: Theme(
                  data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
                  child: ExpansionTile(
                    tilePadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                    childrenPadding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
                    leading: Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: _getCategoryColor(category).withValues(alpha: isDark ? 0.2 : 0.12),
                        shape: BoxShape.circle,
                      ),
                      child: Icon(
                        _getCategoryIcon(category),
                        color: _getCategoryColor(category),
                        size: 20,
                      ),
                    ),
                    title: Text(
                      title,
                      style: GoogleFonts.plusJakartaSans(
                        fontSize: 15,
                        fontWeight: FontWeight.w700,
                        color: AppTheme.textPri(context),
                        letterSpacing: -0.2,
                      ),
                    ),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Row(
                          children: [
                            _buildFigmaStatusPill(context, status),
                            const SizedBox(width: 8),
                            Text(
                              _formatCategory(category),
                              style: GoogleFonts.plusJakartaSans(
                                fontSize: 11.5,
                                fontWeight: FontWeight.w600,
                                color: AppTheme.textMut(context),
                              ),
                            ),
                          ],
                        ),
                        if (formattedDate.isNotEmpty) ...[
                          const SizedBox(height: 4),
                          Text(
                            formattedDate,
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 11,
                              color: AppTheme.textMut(context),
                            ),
                          ),
                        ],
                      ],
                    ),
                    children: [
                      Divider(color: AppTheme.divider(context), height: 16),
                      if (reason.isNotEmpty) ...[
                        Align(
                          alignment: Alignment.centerLeft,
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(
                                'Reason & Justification',
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 12,
                                  fontWeight: FontWeight.w700,
                                  color: AppTheme.textSec(context),
                                ),
                              ),
                              const SizedBox(height: 4),
                              Text(
                                reason,
                                style: GoogleFonts.plusJakartaSans(
                                  fontSize: 13,
                                  color: AppTheme.textPri(context),
                                  height: 1.35,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 12),
                      ],

                      if (attachment != null) ...[
                        Container(
                          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                          decoration: BoxDecoration(
                            color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(color: AppTheme.border(context)),
                          ),
                          child: Row(
                            children: [
                              const Icon(
                                Icons.attach_file_rounded,
                                size: 16,
                                color: AppTheme.primaryBlue,
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: Text(
                                  'Document: ${attachment.toString().split('/').last}',
                                  style: GoogleFonts.plusJakartaSans(
                                    fontSize: 12,
                                    color: AppTheme.textSec(context),
                                    fontWeight: FontWeight.w600,
                                  ),
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(height: 14),
                      ],

                      _buildApprovalWorkflowSteps(context, req),
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

  Widget _buildFigmaStatusPill(BuildContext context, String status) {
    Color bg;
    Color fg;
    String label;
    final isDark = AppTheme.isDark(context);

    switch (status) {
      case 'approved':
        final (t, b) = AppTheme.successPill(context);
        bg = b;
        fg = t;
        label = 'Approved';
        break;
      case 'rejected':
        final (t, b) = AppTheme.errorPill(context);
        bg = b;
        fg = t;
        label = 'Rejected';
        break;
      case 'bypassed':
        bg = isDark ? const Color(0xFF2E1065) : const Color(0xFFF3E8FF);
        fg = isDark ? const Color(0xFFC084FC) : const Color(0xFF7C3AED);
        label = 'Bypassed';
        break;
      default:
        final (t, b) = AppTheme.warningPill(context);
        bg = b;
        fg = t;
        label = 'Pending';
        break;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 2),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        label,
        style: GoogleFonts.plusJakartaSans(
          fontSize: 10.5,
          fontWeight: FontWeight.w800,
          color: fg,
        ),
      ),
    );
  }

  Widget _buildApprovalWorkflowSteps(BuildContext context, Map<String, dynamic> req) {
    final overallStatus = (req['status']?.toString() ?? 'pending').toLowerCase();
    final rawChain = req['approvalChain'] ?? req['approval_chain'] ?? req['steps'];
    final isDark = AppTheme.isDark(context);

    List<Map<String, dynamic>> chain = [];
    if (rawChain is List && rawChain.isNotEmpty) {
      chain = rawChain
          .whereType<Map<String, dynamic>>()
          .map((e) => Map<String, dynamic>.from(e))
          .toList();
    } else {
      chain = [
        {
          'role': 'Direct Manager',
          'status': overallStatus == 'approved'
              ? 'approved'
              : (overallStatus == 'rejected' ? 'rejected' : 'pending'),
          'note': overallStatus == 'approved' ? 'Verified schedule' : null,
        },
        {
          'role': 'HR Operations',
          'status': overallStatus == 'approved' ? 'approved' : 'pending',
          'note': null,
        },
        {
          'role': 'Executive Review',
          'status': overallStatus == 'approved' ? 'approved' : 'pending',
          'note': null,
        },
      ];
    }

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Approval Workflow Progress',
          style: GoogleFonts.plusJakartaSans(
            fontSize: 12,
            fontWeight: FontWeight.w700,
            color: AppTheme.textSec(context),
          ),
        ),
        const SizedBox(height: 10),
        ListView.separated(
          shrinkWrap: true,
          physics: const NeverScrollableScrollPhysics(),
          itemCount: chain.length,
          separatorBuilder: (context, index) => const SizedBox(height: 8),
          itemBuilder: (context, i) {
            final step = chain[i];
            final stepRole = step['role'] ?? step['title'] ?? 'Step ${i + 1}';
            final stepStatus = (step['status']?.toString() ?? 'pending').toLowerCase();
            final note = step['note'] ?? step['comment'];

            IconData icon = Icons.radio_button_unchecked_rounded;
            Color iconColor = AppTheme.textMut(context);

            if (stepStatus == 'approved') {
              icon = Icons.check_circle_rounded;
              iconColor = isDark ? AppTheme.darkSuccessText : AppTheme.successText;
            } else if (stepStatus == 'rejected') {
              icon = Icons.cancel_rounded;
              iconColor = isDark ? AppTheme.darkErrorText : AppTheme.errorText;
            } else if (stepStatus == 'bypassed') {
              icon = Icons.fast_forward_rounded;
              iconColor = const Color(0xFF7C3AED);
            } else {
              icon = Icons.schedule_rounded;
              iconColor = isDark ? AppTheme.darkWarningText : const Color(0xFFDB8E1D);
            }

            return Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Icon(icon, size: 16, color: iconColor),
                const SizedBox(width: 8),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        mainAxisAlignment: MainAxisAlignment.spaceBetween,
                        children: [
                          Text(
                            stepRole.toString(),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 12,
                              fontWeight: FontWeight.w600,
                              color: AppTheme.textPri(context),
                            ),
                          ),
                          Text(
                            stepStatus.toUpperCase(),
                            style: GoogleFonts.plusJakartaSans(
                              fontSize: 10,
                              fontWeight: FontWeight.w800,
                              color: iconColor,
                            ),
                          ),
                        ],
                      ),
                      if (note != null && note.toString().isNotEmpty) ...[
                        const SizedBox(height: 2),
                        Text(
                          'Note: $note',
                          style: GoogleFonts.plusJakartaSans(
                            fontSize: 11,
                            color: AppTheme.textMut(context),
                            fontStyle: FontStyle.italic,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ],
    );
  }

  Widget _buildEmptyState(BuildContext context) {
    final isDark = AppTheme.isDark(context);
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
                color: isDark ? AppTheme.darkCanvasBackground : AppTheme.canvasBackground,
                shape: BoxShape.circle,
              ),
              child: Icon(
                Icons.assignment_outlined,
                size: 36,
                color: AppTheme.textMut(context),
              ),
            ),
            const SizedBox(height: 14),
            Text(
              'No requests match "$_activeFilter"',
              style: GoogleFonts.plusJakartaSans(
                fontSize: 16,
                fontWeight: FontWeight.w700,
                color: AppTheme.textPri(context),
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Submit a new request or switch filters.',
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

  IconData _getCategoryIcon(String category) {
    switch (category) {
      case 'time_off':
        return Icons.calendar_month_rounded;
      case 'advance_loan':
        return Icons.payments_rounded;
      case 'custom_clock':
        return Icons.schedule_rounded;
      case 'salary_adjustment':
        return Icons.trending_up_rounded;
      default:
        return Icons.assignment_rounded;
    }
  }

  Color _getCategoryColor(String category) {
    switch (category) {
      case 'time_off':
        return AppTheme.primaryBlue;
      case 'advance_loan':
        return AppTheme.tealAccent;
      case 'custom_clock':
        return AppTheme.goldAccent;
      case 'salary_adjustment':
        return const Color(0xFF7C3AED);
      default:
        return AppTheme.textMuted;
    }
  }

  String _formatCategory(String cat) {
    switch (cat) {
      case 'time_off':
        return 'Time Off';
      case 'advance_loan':
        return 'Advance Loan';
      case 'custom_clock':
        return 'Clock Adjustment';
      case 'salary_adjustment':
        return 'Salary Adjustment';
      default:
        return cat.replaceAll('_', ' ').toUpperCase();
    }
  }
}
