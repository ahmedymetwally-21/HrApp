import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/constants.dart';
import '../../core/workspace_provider.dart';
import '../auth/auth_provider.dart';

class ApprovalsState {
  final List<Map<String, dynamic>> pendingRequests;
  final List<Map<String, dynamic>> pendingLeaves;
  final List<Map<String, dynamic>> pendingDeductions;
  final bool isLoading;
  final bool isActing;
  final String? errorMessage;
  final String? successMessage;

  const ApprovalsState({
    this.pendingRequests = const [],
    this.pendingLeaves = const [],
    this.pendingDeductions = const [],
    this.isLoading = false,
    this.isActing = false,
    this.errorMessage,
    this.successMessage,
  });

  int get totalPendingCount =>
      pendingRequests.length + pendingLeaves.length + pendingDeductions.length;

  ApprovalsState copyWith({
    List<Map<String, dynamic>>? pendingRequests,
    List<Map<String, dynamic>>? pendingLeaves,
    List<Map<String, dynamic>>? pendingDeductions,
    bool? isLoading,
    bool? isActing,
    String? errorMessage,
    String? successMessage,
  }) {
    return ApprovalsState(
      pendingRequests: pendingRequests ?? this.pendingRequests,
      pendingLeaves: pendingLeaves ?? this.pendingLeaves,
      pendingDeductions: pendingDeductions ?? this.pendingDeductions,
      isLoading: isLoading ?? this.isLoading,
      isActing: isActing ?? this.isActing,
      errorMessage: errorMessage,
      successMessage: successMessage,
    );
  }
}

final approvalsProvider =
    NotifierProvider<ApprovalsNotifier, ApprovalsState>(ApprovalsNotifier.new);

class ApprovalsNotifier extends Notifier<ApprovalsState> {
  Dio get _dio => ref.read(dioProvider);

  @override
  ApprovalsState build() {
    final isAuthenticated =
        ref.watch(authProvider.select((a) => a.isAuthenticated));

    if (isAuthenticated) {
      final role = AppConstants.normalizeRole(ref.read(authProvider).user?['role']);
      if (AppConstants.isApprovalRole(role)) {
        Future.microtask(() => loadAllApprovals(background: true));
      }
    }

    return const ApprovalsState();
  }

  Future<void> loadAllApprovals({bool background = false}) async {
    final workspace = ref.read(workspaceProvider);
    final authState = ref.read(authProvider);
    final userRole = AppConstants.normalizeRole(
        workspace.currentUser?['role'] ?? authState.user?['role']);

    if (!AppConstants.isApprovalRole(userRole)) {
      // Do not query approvals endpoints for unauthorized users
      state = const ApprovalsState();
      return;
    }

    if (!background && state.totalPendingCount == 0) {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }

    try {
      List<Map<String, dynamic>> requests = [];
      List<Map<String, dynamic>> leaves = [];
      List<Map<String, dynamic>> deductions = [];

      // 1. Unified Requests
      try {
        final res = await _dio.get('/requests');
        if (res.data is List) {
          requests = (res.data as List)
              .whereType<Map<String, dynamic>>()
              .map((e) => Map<String, dynamic>.from(e))
              .where((r) =>
                  (r['status']?.toString().toLowerCase() ?? 'pending') ==
                  'pending')
              .toList();
        } else if (res.data is Map && res.data['requests'] is List) {
          requests = (res.data['requests'] as List)
              .whereType<Map<String, dynamic>>()
              .map((e) => Map<String, dynamic>.from(e))
              .where((r) =>
                  (r['status']?.toString().toLowerCase() ?? 'pending') ==
                  'pending')
              .toList();
        }
      } catch (_) {}

      // 2. Pending Leaves (if not hidden by visibility rules)
      if (!workspace.isLeavesHidden) {
        try {
          final res = await _dio.get('/leaves');
          if (res.data is List) {
            leaves = (res.data as List)
                .whereType<Map<String, dynamic>>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((l) =>
                    (l['status']?.toString().toLowerCase() ?? 'pending') ==
                    'pending')
                .toList();
          } else if (res.data is Map && res.data['leaves'] is List) {
            leaves = (res.data['leaves'] as List)
                .whereType<Map<String, dynamic>>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((l) =>
                    (l['status']?.toString().toLowerCase() ?? 'pending') ==
                    'pending')
                .toList();
          }
        } catch (_) {}
      }

      // 3. Pending Deduction Approvals (if not hidden by visibility rules)
      if (!workspace.isDeductionApprovalsHidden) {
        try {
          final res = await _dio.get('/payroll/deduction-approvals');
          if (res.data is List) {
            deductions = (res.data as List)
                .whereType<Map<String, dynamic>>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((d) =>
                    (d['status']?.toString().toLowerCase() ?? 'pending') ==
                    'pending')
                .toList();
          } else if (res.data is Map && res.data['approvals'] is List) {
            deductions = (res.data['approvals'] as List)
                .whereType<Map<String, dynamic>>()
                .map((e) => Map<String, dynamic>.from(e))
                .where((d) =>
                    (d['status']?.toString().toLowerCase() ?? 'pending') ==
                    'pending')
                .toList();
          }
        } catch (_) {}
      }

      state = state.copyWith(
        pendingRequests: requests,
        pendingLeaves: leaves,
        pendingDeductions: deductions,
        isLoading: false,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to fetch pending approvals: ${e.toString()}',
      );
    }
  }

  // Unified Request Action: approve, reject, bypass
  Future<bool> actOnRequest({
    required String requestId,
    required String action, // 'approve', 'reject', 'bypass'
    String? note,
  }) async {
    state = state.copyWith(isActing: true, errorMessage: null, successMessage: null);

    try {
      await _dio.post(
        '/requests/$requestId/action',
        data: {
          'action': action,
          'note': note ?? '',
          'reason': note ?? '',
        },
      );

      state = state.copyWith(
        isActing: false,
        successMessage: 'Request $action action processed.',
      );

      await loadAllApprovals();
      return true;
    } on DioException catch (e) {
      String msg = 'Failed to process request action.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isActing: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isActing: false,
        errorMessage: 'Action error: ${e.toString()}',
      );
      return false;
    }
  }

  // Leave Decision: approve, reject
  Future<bool> decideLeave({
    required String leaveId,
    required String decision, // 'approved', 'rejected'
    String? note,
  }) async {
    state = state.copyWith(isActing: true, errorMessage: null, successMessage: null);

    try {
      await _dio.put(
        '/leaves/$leaveId/decision',
        data: {
          'decision': decision,
          'status': decision,
          'note': note ?? '',
        },
      );

      state = state.copyWith(
        isActing: false,
        successMessage: 'Leave request $decision.',
      );

      await loadAllApprovals();
      return true;
    } on DioException catch (e) {
      String msg = 'Failed to decide leave.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isActing: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isActing: false,
        errorMessage: 'Error deciding leave: ${e.toString()}',
      );
      return false;
    }
  }

  // Deduction Decision: manager-decision or hr-decision
  Future<bool> decideDeduction({
    required String deductionId,
    required String decision, // 'approved', 'rejected'
    String? note,
  }) async {
    state = state.copyWith(isActing: true, errorMessage: null, successMessage: null);

    final workspace = ref.read(workspaceProvider);

    try {
      final role = workspace.currentUser?['role']?.toString().toLowerCase();
      final endpoint = (role == AppConstants.roleHrManager)
          ? '/payroll/deduction-approvals/$deductionId/hr-decision'
          : '/payroll/deduction-approvals/$deductionId/manager-decision';

      await _dio.put(
        endpoint,
        data: {
          'decision': decision,
          'status': decision,
          'note': note ?? '',
        },
      );

      state = state.copyWith(
        isActing: false,
        successMessage: 'Deduction approval $decision.',
      );

      await loadAllApprovals();
      return true;
    } on DioException catch (e) {
      String msg = 'Failed to decide deduction approval.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isActing: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isActing: false,
        errorMessage: 'Error deciding deduction: ${e.toString()}',
      );
      return false;
    }
  }

  void clearMessages() {
    state = state.copyWith(errorMessage: null, successMessage: null);
  }
}
