import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../features/auth/auth_provider.dart';
import 'constants.dart';

class WorkspaceState {
  final Set<String> hiddenSections;
  final Map<String, dynamic>? currentUser;
  final List<Map<String, dynamic>> locations;
  final Map<String, dynamic>? settings;
  final Map<String, dynamic>? todayRoster;
  final String effectiveClockInPolicy;
  final double maxMobileAccuracyMeters;
  final bool isLoading;
  final DateTime? lastSyncedAt;
  final String? errorMessage;

  const WorkspaceState({
    this.hiddenSections = const {},
    this.currentUser,
    this.locations = const [],
    this.settings,
    this.todayRoster,
    this.effectiveClockInPolicy = AppConstants.policyStrictMobileGps,
    this.maxMobileAccuracyMeters = 50.0,
    this.isLoading = false,
    this.lastSyncedAt,
    this.errorMessage,
  });

  bool get isExecutiveExempt {
    final role = AppConstants.normalizeRole(currentUser?['role']);
    return role == AppConstants.roleMainManager;
  }

  bool get isClockInHidden {
    return isExecutiveExempt ||
        hiddenSections.contains(AppConstants.sectionClockIn) ||
        hiddenSections.contains('attendance');
  }

  bool get isAttendanceLogsHidden {
    return hiddenSections.contains(AppConstants.sectionAttendanceLogs);
  }

  bool get isRequestsHidden {
    return hiddenSections.contains(AppConstants.sectionRequests);
  }

  bool get isLeavesHidden {
    return hiddenSections.contains(AppConstants.sectionLeaves);
  }

  bool get isDeductionApprovalsHidden {
    return hiddenSections.contains(AppConstants.sectionDeductionApprovals);
  }

  bool get isScheduledOnLeaveToday {
    final status = todayRoster?['status']?.toString().toLowerCase();
    final canClockIn = todayRoster?['canClockIn'];
    if (status == 'leave') return true;
    if (canClockIn == false && status != null && status != 'work') {
      return true;
    }
    return false;
  }

  List<String> get assignedZoneIds {
    final raw = currentUser?['assignedZoneIds'] ??
        currentUser?['assigned_zone_ids'] ??
        currentUser?['zoneIds'];
    if (raw is List) {
      return raw.map((e) => e.toString()).toList();
    }
    return [];
  }

  List<String> get managedSectionIds {
    final raw = currentUser?['managedSectionIds'] ??
        currentUser?['managed_section_ids'];
    if (raw is List) {
      return raw.map((e) => e.toString()).toList();
    }
    return [];
  }

  bool get hasApprovalRole {
    return AppConstants.isApprovalRole(currentUser?['role']);
  }

  WorkspaceState copyWith({
    Set<String>? hiddenSections,
    Map<String, dynamic>? currentUser,
    List<Map<String, dynamic>>? locations,
    Map<String, dynamic>? settings,
    Map<String, dynamic>? todayRoster,
    String? effectiveClockInPolicy,
    double? maxMobileAccuracyMeters,
    bool? isLoading,
    DateTime? lastSyncedAt,
    String? errorMessage,
  }) {
    return WorkspaceState(
      hiddenSections: hiddenSections ?? this.hiddenSections,
      currentUser: currentUser ?? this.currentUser,
      locations: locations ?? this.locations,
      settings: settings ?? this.settings,
      todayRoster: todayRoster ?? this.todayRoster,
      effectiveClockInPolicy:
          effectiveClockInPolicy ?? this.effectiveClockInPolicy,
      maxMobileAccuracyMeters:
          maxMobileAccuracyMeters ?? this.maxMobileAccuracyMeters,
      isLoading: isLoading ?? this.isLoading,
      lastSyncedAt: lastSyncedAt ?? this.lastSyncedAt,
      errorMessage: errorMessage,
    );
  }
}

final workspaceProvider =
    NotifierProvider<WorkspaceNotifier, WorkspaceState>(WorkspaceNotifier.new);

class WorkspaceNotifier extends Notifier<WorkspaceState> {
  Dio get _dio => ref.read(dioProvider);

  @override
  WorkspaceState build() {
    // Only re-build when authentication status flips, preventing unwanted state resets
    final isAuthenticated =
        ref.watch(authProvider.select((a) => a.isAuthenticated));

    if (isAuthenticated) {
      // Seed initial user data immediately from auth session to preserve executive role from frame 1
      final initialUser = ref.read(authProvider).user;
      Future.microtask(() => syncWorkspace(background: true));
      return WorkspaceState(currentUser: initialUser);
    }

    return const WorkspaceState();
  }

  Future<void> syncWorkspace({bool background = true}) async {
    // Never flip isLoading to true if we already have loaded state, preventing UI flickering
    if (!background && state.currentUser == null) {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }

    final authState = ref.read(authProvider);

    try {
      // 1. GET /visibility-rules/me
      Set<String> hiddenSections = state.hiddenSections;
      try {
        final res = await _dio.get('/visibility-rules/me');
        final parsed = _parseHiddenSections(res.data);
        if (parsed.isNotEmpty || res.data != null) {
          hiddenSections = parsed;
        }
      } catch (_) {}

      // 2. GET /users (resolve current user while preserving existing main_manager role)
      Map<String, dynamic>? resolvedUser = state.currentUser ?? authState.user;
      try {
        final res = await _dio.get('/users');
        final currentUserId = resolvedUser?['id']?.toString() ??
            resolvedUser?['userId']?.toString() ??
            resolvedUser?['uid']?.toString() ??
            authState.user?['id']?.toString() ??
            authState.user?['userId']?.toString() ??
            authState.user?['uid']?.toString();
        final currentUserEmail = (resolvedUser?['email'] ?? authState.user?['email'])
            ?.toString()
            .toLowerCase();

        if (res.data is List) {
          final usersList = List<dynamic>.from(res.data as List);
          for (final u in usersList) {
            if (u is Map<String, dynamic>) {
              final uid = u['id']?.toString() ?? u['uid']?.toString();
              final uemail = u['email']?.toString().toLowerCase();
              if ((currentUserId != null && uid == currentUserId) ||
                  (currentUserEmail != null && uemail == currentUserEmail)) {
                // Merge into existing user map so loaded fields/roles are preserved
                resolvedUser = {
                  ...?resolvedUser,
                  ...u,
                };
                break;
              }
            }
          }
        } else if (res.data is Map<String, dynamic>) {
          if (res.data['user'] is Map<String, dynamic>) {
            resolvedUser = {
              ...?resolvedUser,
              ...Map<String, dynamic>.from(res.data['user'] as Map),
            };
          }
        }

        if (resolvedUser != null) {
          ref.read(storageServiceProvider).saveUserData(resolvedUser);
        }
      } catch (_) {}

      // 3. GET /locations & GET /settings (preserve existing if request fails)
      List<Map<String, dynamic>> locations = state.locations;
      try {
        final res = await _dio.get('/locations');
        if (res.data is List) {
          locations = (res.data as List)
              .whereType<Map<String, dynamic>>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        } else if (res.data is Map && res.data['locations'] is List) {
          locations = (res.data['locations'] as List)
              .whereType<Map<String, dynamic>>()
              .map((e) => Map<String, dynamic>.from(e))
              .toList();
        }
      } catch (_) {}

      Map<String, dynamic>? settings = state.settings;
      try {
        final res = await _dio.get('/settings');
        if (res.data is Map<String, dynamic>) {
          settings = Map<String, dynamic>.from(res.data as Map);
        }
      } catch (_) {}

      // 4. GET /rosters/today (preserve existing roster if request fails)
      Map<String, dynamic>? todayRoster = state.todayRoster;
      try {
        final res = await _dio.get('/rosters/today');
        if (res.data is Map<String, dynamic>) {
          todayRoster = Map<String, dynamic>.from(res.data as Map);
        } else if (res.data is List && (res.data as List).isNotEmpty) {
          todayRoster = Map<String, dynamic>.from((res.data as List).first as Map);
        }
      } catch (_) {}

      // 5. Compute effectiveClockInPolicy and maxMobileAccuracyMeters
      final userOverride = resolvedUser?['clockInPolicyOverride'] ??
          resolvedUser?['clock_in_policy_override'];
      final globalPolicy = settings?['globalClockInPolicy'] ??
          settings?['global_clock_in_policy'] ??
          settings?['clockInPolicy'] ??
          state.effectiveClockInPolicy;

      String effectivePolicy = state.effectiveClockInPolicy;
      if (userOverride != null &&
          userOverride.toString().trim().isNotEmpty &&
          userOverride.toString() != 'inherit' &&
          userOverride.toString() != 'default') {
        effectivePolicy = userOverride.toString();
      } else if (globalPolicy != null) {
        effectivePolicy = globalPolicy.toString();
      }

      final rawAccuracy = settings?['maxMobileAccuracyMeters'] ??
          settings?['max_mobile_accuracy_meters'] ??
          state.maxMobileAccuracyMeters;
      final maxAccuracy = (rawAccuracy is num) ? rawAccuracy.toDouble() : 50.0;

      // Update state without resetting existing values back to defaults
      state = state.copyWith(
        hiddenSections: hiddenSections,
        currentUser: resolvedUser,
        locations: locations,
        settings: settings,
        todayRoster: todayRoster,
        effectiveClockInPolicy: effectivePolicy,
        maxMobileAccuracyMeters: maxAccuracy,
        isLoading: false,
        lastSyncedAt: DateTime.now(),
        errorMessage: null,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Workspace sync failed: ${e.toString()}',
      );
    }
  }

  Set<String> _parseHiddenSections(dynamic data) {
    final Set<String> hidden = {};
    if (data is List) {
      for (final item in data) {
        if (item is String) {
          hidden.add(item.trim());
        } else if (item is Map && item['section'] != null) {
          hidden.add(item['section'].toString().trim());
        }
      }
    } else if (data is Map) {
      if (data['hiddenSections'] is List) {
        for (final item in data['hiddenSections']) {
          hidden.add(item.toString().trim());
        }
      } else if (data['sections'] is List) {
        for (final item in data['sections']) {
          hidden.add(item.toString().trim());
        }
      }
    }
    return hidden;
  }
}
