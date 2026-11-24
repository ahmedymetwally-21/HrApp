import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import '../../core/workspace_provider.dart';
import '../auth/auth_provider.dart';
import 'geofence_service.dart';

Map<String, dynamic> normalizeAttendanceRecord(Map<String, dynamic> raw) {
  final copy = Map<String, dynamic>.from(raw);

  final id = raw['id'] ??
      raw['aid'] ??
      raw['logId'] ??
      raw['attendance_id'] ??
      raw['attendanceId'];
  final date = raw['date'] ??
      raw['workDate'] ??
      raw['work_date'] ??
      raw['clockInDate'] ??
      raw['clock_in_date'];
  final clockIn = raw['clockInTime'] ??
      raw['clockInAt'] ??
      raw['clock_in_at'] ??
      raw['clockIn'] ??
      raw['clock_in'] ??
      raw['checkIn'] ??
      raw['check_in'] ??
      raw['inTime'] ??
      raw['in_time'] ??
      raw['startTime'] ??
      raw['timeIn'];
  final clockOut = raw['clockOutTime'] ??
      raw['clockOutAt'] ??
      raw['clock_out_at'] ??
      raw['clockOut'] ??
      raw['clock_out'] ??
      raw['checkOut'] ??
      raw['check_out'] ??
      raw['outTime'] ??
      raw['out_time'] ??
      raw['endTime'] ??
      raw['timeOut'];
  final zoneName = raw['zoneName'] ??
      raw['zone_name'] ??
      raw['locationName'] ??
      raw['location_name'] ??
      raw['locationId'] ??
      raw['zoneId'] ??
      raw['location'];
  final status = raw['status']?.toString().toLowerCase().trim();

  copy['id'] = id?.toString() ?? '';
  copy['date'] = date?.toString() ?? '';
  copy['workDate'] = copy['date'];
  copy['work_date'] = copy['date'];

  copy['clockIn'] = clockIn?.toString();
  copy['clock_in'] = copy['clockIn'];
  copy['clockInTime'] = copy['clockIn'];
  copy['clockInAt'] = copy['clockIn'];
  copy['clock_in_at'] = copy['clockIn'];

  final isOutEmpty = isClockOutEmpty(clockOut);
  copy['clockOut'] = isOutEmpty ? null : clockOut.toString().trim();
  copy['clock_out'] = copy['clockOut'];
  copy['clockOutTime'] = copy['clockOut'];
  copy['clockOutAt'] = copy['clockOut'];
  copy['clock_out_at'] = copy['clockOut'];

  copy['zoneName'] = zoneName?.toString();
  copy['zone_name'] = copy['zoneName'];
  copy['locationName'] = copy['zoneName'];
  copy['location_name'] = copy['zoneName'];

  copy['status'] = status;

  return copy;
}

bool isClockOutEmpty(dynamic val) {
  if (val == null) return true;
  final str = val.toString().trim().toLowerCase();
  return str.isEmpty || str == 'null' || str == 'active' || str == '--:--';
}

bool isSessionActive(Map<String, dynamic> log) {
  final clockOut = log['clockOutTime'] ??
      log['clockOutAt'] ??
      log['clock_out_at'] ??
      log['clockOut'] ??
      log['clock_out'];
  if (!isClockOutEmpty(clockOut)) {
    return false;
  }
  final status = (log['status'] ?? '').toString().toLowerCase().trim();
  if (status == 'completed' || status == 'clocked_out' || status == 'closed') {
    return false;
  }
  final clockIn = log['clockInTime'] ??
      log['clockInAt'] ??
      log['clock_in_at'] ??
      log['clockIn'] ??
      log['clock_in'];
  return clockIn != null && clockIn.toString().trim().isNotEmpty;
}

DateTime? parseAttendanceDateTime(dynamic val, [DateTime? referenceDate]) {
  if (val == null) return null;
  if (val is DateTime) return val.toLocal();

  final str = val.toString().trim();
  if (str.isEmpty || isClockOutEmpty(str)) return null;

  // 1. Try ISO-8601 or standard DateTime format
  final parsed = DateTime.tryParse(str);
  if (parsed != null) {
    return parsed.toLocal();
  }

  // 2. Try parsing HH:mm or HH:mm:ss or hh:mm a
  try {
    final base = referenceDate ?? DateTime.now();

    // Check for AM/PM format (e.g. "03:10 PM", "9:05 am")
    final amPmMatch = RegExp(
      r'^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)$',
      caseSensitive: false,
    ).firstMatch(str);
    if (amPmMatch != null) {
      int hour = int.parse(amPmMatch.group(1)!);
      final minute = int.parse(amPmMatch.group(2)!);
      final second = int.tryParse(amPmMatch.group(3) ?? '0') ?? 0;
      final isPm = amPmMatch.group(4)!.toUpperCase() == 'PM';
      if (isPm && hour < 12) hour += 12;
      if (!isPm && hour == 12) hour = 0;
      return DateTime(base.year, base.month, base.day, hour, minute, second);
    }

    // Check for 24-hour HH:mm(:ss) format (e.g. "15:10", "15:10:00")
    final time24Match =
        RegExp(r'^(\d{1,2}):(\d{2})(?::(\d{2}))?$').firstMatch(str);
    if (time24Match != null) {
      final hour = int.parse(time24Match.group(1)!);
      final minute = int.parse(time24Match.group(2)!);
      final second = int.tryParse(time24Match.group(3) ?? '0') ?? 0;
      return DateTime(base.year, base.month, base.day, hour, minute, second);
    }
  } catch (_) {}

  return null;
}

String formatAttendanceTime(dynamic val, [DateTime? referenceDate]) {
  if (val == null) return '--:--';
  if (isClockOutEmpty(val)) return 'Active';

  final dt = parseAttendanceDateTime(val, referenceDate);
  if (dt != null) {
    final hour = dt.hour == 0 ? 12 : (dt.hour > 12 ? dt.hour - 12 : dt.hour);
    final hourStr = hour.toString().padLeft(2, '0');
    final minuteStr = dt.minute.toString().padLeft(2, '0');
    final amPm = dt.hour >= 12 ? 'PM' : 'AM';
    return '$hourStr:$minuteStr $amPm';
  }

  final raw = val.toString().trim();
  return raw.isNotEmpty ? raw : '--:--';
}

class AttendanceState {
  final List<Map<String, dynamic>> logs;
  final Map<String, dynamic>? activeLog;
  final GeofenceCheckResult? geofenceResult;
  final Position? currentPosition;
  final bool isLocationLoading;
  final bool isClockingIn;
  final bool isClockingOut;
  final bool isLoadingLogs;
  final String? errorMessage;
  final String? successMessage;

  const AttendanceState({
    this.logs = const [],
    this.activeLog,
    this.geofenceResult,
    this.currentPosition,
    this.isLocationLoading = false,
    this.isClockingIn = false,
    this.isClockingOut = false,
    this.isLoadingLogs = false,
    this.errorMessage,
    this.successMessage,
  });

  bool get isClockedIn => activeLog != null;

  AttendanceState copyWith({
    List<Map<String, dynamic>>? logs,
    Map<String, dynamic>? Function()? activeLog,
    GeofenceCheckResult? geofenceResult,
    Position? currentPosition,
    bool? isLocationLoading,
    bool? isClockingIn,
    bool? isClockingOut,
    bool? isLoadingLogs,
    String? errorMessage,
    String? successMessage,
  }) {
    return AttendanceState(
      logs: logs ?? this.logs,
      activeLog: activeLog != null ? activeLog() : this.activeLog,
      geofenceResult: geofenceResult ?? this.geofenceResult,
      currentPosition: currentPosition ?? this.currentPosition,
      isLocationLoading: isLocationLoading ?? this.isLocationLoading,
      isClockingIn: isClockingIn ?? this.isClockingIn,
      isClockingOut: isClockingOut ?? this.isClockingOut,
      isLoadingLogs: isLoadingLogs ?? this.isLoadingLogs,
      errorMessage: errorMessage,
      successMessage: successMessage,
    );
  }
}

final attendanceProvider =
    NotifierProvider<AttendanceNotifier, AttendanceState>(
        AttendanceNotifier.new);

class AttendanceNotifier extends Notifier<AttendanceState> {
  Dio get _dio => ref.read(dioProvider);

  @override
  AttendanceState build() {
    final isAuthenticated =
        ref.watch(authProvider.select((a) => a.isAuthenticated));

    if (isAuthenticated) {
      // Only load logs in background, never trigger GPS checks during build
      Future.microtask(() => loadAttendanceLogs(background: true));
    }

    return const AttendanceState();
  }

  Future<void> checkLocationAndGeofence() async {
    final workspace = ref.read(workspaceProvider);

    // Skip GPS check completely when user is main_manager (executive exemption)
    if (workspace.isExecutiveExempt) {
      return;
    }

    state = state.copyWith(isLocationLoading: true, errorMessage: null);

    try {
      final pos = await GeofenceService.getCurrentPosition();
      final eval = GeofenceService.evaluateGeofence(
        position: pos,
        assignedZoneIds: workspace.assignedZoneIds,
        allLocations: workspace.locations,
        policy: workspace.effectiveClockInPolicy,
        maxAccuracyMeters: workspace.maxMobileAccuracyMeters,
      );

      state = state.copyWith(
        isLocationLoading: false,
        currentPosition: pos,
        geofenceResult: eval,
      );
    } catch (e) {
      state = state.copyWith(
        isLocationLoading: false,
        errorMessage: 'GPS verification error: ${e.toString()}',
      );
    }
  }

  Future<void> loadAttendanceLogs({bool background = false}) async {
    final workspace = ref.read(workspaceProvider);
    if (workspace.isAttendanceLogsHidden) return;

    // Never reset or clear existing logs during background refresh
    if (!background && state.logs.isEmpty) {
      state = state.copyWith(isLoadingLogs: true, errorMessage: null);
    }

    try {
      final res = await _dio.get('/attendance');
      List<Map<String, dynamic>> rawLogs = [];

      if (res.data is List) {
        rawLogs = (res.data as List)
            .whereType<Map<String, dynamic>>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      } else if (res.data is Map && res.data['logs'] is List) {
        rawLogs = (res.data['logs'] as List)
            .whereType<Map<String, dynamic>>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      } else if (res.data is Map && res.data['attendance'] is List) {
        rawLogs = (res.data['attendance'] as List)
            .whereType<Map<String, dynamic>>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      final normalizedLogs =
          rawLogs.map((e) => normalizeAttendanceRecord(e)).toList();

      // Identify active open log (where clockOut is null or empty, and status != completed/clocked_out)
      Map<String, dynamic>? active;
      for (final log in normalizedLogs) {
        if (isSessionActive(log)) {
          active = log;
          break;
        }
      }

      state = state.copyWith(
        logs: normalizedLogs,
        activeLog: () => active,
        isLoadingLogs: false,
      );
    } catch (_) {
      // Preserve existing logs and activeLog state on background refresh error
      state = state.copyWith(isLoadingLogs: false);
    }
  }

  Future<bool> clockIn() async {
    state = state.copyWith(
        isClockingIn: true, errorMessage: null, successMessage: null);

    final workspace = ref.read(workspaceProvider);

    try {
      final pos = await GeofenceService.getCurrentPosition();
      final eval = GeofenceService.evaluateGeofence(
        position: pos,
        assignedZoneIds: workspace.assignedZoneIds,
        allLocations: workspace.locations,
        policy: workspace.effectiveClockInPolicy,
        maxAccuracyMeters: workspace.maxMobileAccuracyMeters,
      );

      state = state.copyWith(currentPosition: pos, geofenceResult: eval);

      if (!eval.canClockIn) {
        state = state.copyWith(
          isClockingIn: false,
          errorMessage: eval.statusMessage,
        );
        return false;
      }

      final nowIso = DateTime.now().toIso8601String();
      final zoneId = eval.matchedZone?['id'] ?? eval.matchedZone?['lid'];
      final zoneName = eval.matchedZone?['name'];

      final payload = {
        'latitude': pos?.latitude,
        'longitude': pos?.longitude,
        'accuracyMeters': pos?.accuracy,
        'accuracy': pos?.accuracy,
        'zoneId': zoneId,
        'zoneName': zoneName,
        'punchSource': 'Mobile App',
        'policy': workspace.effectiveClockInPolicy,
        'timestamp': nowIso,
      };

      final res = await _dio.post('/attendance/clock-in', data: payload);

      Map<String, dynamic>? newActiveLog;
      if (res.data is Map<String, dynamic>) {
        if (res.data['log'] is Map<String, dynamic>) {
          newActiveLog = normalizeAttendanceRecord(
              Map<String, dynamic>.from(res.data['log'] as Map));
        } else if (res.data['attendance'] is Map<String, dynamic>) {
          newActiveLog = normalizeAttendanceRecord(
              Map<String, dynamic>.from(res.data['attendance'] as Map));
        } else if (res.data['id'] != null ||
            res.data['clockInTime'] != null ||
            res.data['clockInAt'] != null ||
            res.data['clock_in_at'] != null ||
            res.data['clockIn'] != null ||
            res.data['clock_in'] != null) {
          newActiveLog = normalizeAttendanceRecord(
              Map<String, dynamic>.from(res.data));
        }
      }

      newActiveLog ??= normalizeAttendanceRecord({
        'id': 'temp_${DateTime.now().millisecondsSinceEpoch}',
        'date': nowIso.substring(0, 10),
        'workDate': nowIso.substring(0, 10),
        'clockInTime': nowIso,
        'clockInAt': nowIso,
        'clockIn': nowIso,
        'clockOut': null,
        'clockOutTime': null,
        'clockOutAt': null,
        'zoneName': zoneName ?? 'Authorized Location',
        'punchSource': 'Mobile App',
        'status': 'active',
      });

      // Immediately flip hero card to CLOCKED IN with active log
      state = state.copyWith(
        isClockingIn: false,
        activeLog: () => newActiveLog,
        successMessage:
            'Successfully Clocked In at ${eval.matchedZone?['name'] ?? 'Authorized Location'}!',
      );

      // Immediately re-fetch full attendance logs
      await loadAttendanceLogs(background: true);
      return true;
    } on DioException catch (e) {
      String msg = 'Clock-In failed.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isClockingIn: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isClockingIn: false,
        errorMessage: 'Clock-In error: ${e.toString()}',
      );
      return false;
    }
  }

  Future<bool> clockOut() async {
    final logId = state.activeLog?['id'] ??
        state.activeLog?['lid'] ??
        state.activeLog?['logId'] ??
        state.activeLog?['attendance_id'];

    if (logId == null || logId.toString().isEmpty) {
      state = state.copyWith(
        errorMessage: 'No active clock-in session found to clock out.',
      );
      return false;
    }

    state = state.copyWith(
        isClockingOut: true, errorMessage: null, successMessage: null);

    try {
      final pos = await GeofenceService.getCurrentPosition();

      final payload = {
        'latitude': pos?.latitude,
        'longitude': pos?.longitude,
        'accuracyMeters': pos?.accuracy,
        'accuracy': pos?.accuracy,
        'punchSource': 'Mobile App',
        'timestamp': DateTime.now().toIso8601String(),
      };

      await _dio.put('/attendance/$logId/clock-out', data: payload);

      // Immediately flip hero card to CLOCKED OUT
      state = state.copyWith(
        isClockingOut: false,
        activeLog: () => null,
        successMessage: 'Successfully Clocked Out!',
      );

      // Immediately re-fetch full attendance logs
      await loadAttendanceLogs(background: true);
      return true;
    } on DioException catch (e) {
      String msg = 'Clock-Out failed.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isClockingOut: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isClockingOut: false,
        errorMessage: 'Clock-Out error: ${e.toString()}',
      );
      return false;
    }
  }

  void clearMessages() {
    state = state.copyWith(errorMessage: null, successMessage: null);
  }
}
