class AppConstants {
  static const String baseUrl = 'https://yaldi.ddns.net/hr-api';

  // Secure Storage Keys
  static const String keyToken = 'jwt_token';
  static const String keyUserData = 'user_data';
  static const String keyMustChangePassword = 'must_change_password';

  // Visibility Rule Section Keys
  static const String sectionAttendanceLogs = 'attendance_logs';
  static const String sectionRequests = 'requests';
  static const String sectionLeaves = 'leaves';
  static const String sectionDeductionApprovals = 'deduction_approvals';
  static const String sectionClockIn = 'clock_in';

  // Policies
  static const String policyStrictMobileGps = 'strict_mobile_gps';
  static const String policyMobileOrOffice = 'mobile_or_office';
  static const String policyGeofenceExempt = 'geofence_exempt';

  // Roles
  static const String roleMainManager = 'main_manager';
  static const String roleHrManager = 'hr_manager';
  static const String roleHrAdmin = 'hr_admin';
  static const String roleHr = 'hr';
  static const String roleDirectManager = 'direct_manager';
  static const String roleManager = 'manager';
  static const String roleEmployee = 'employee';

  static String normalizeRole(dynamic rawRole) {
    if (rawRole == null) return '';
    return rawRole.toString().trim().toLowerCase().replaceAll(' ', '_');
  }

  static bool isApprovalRole(dynamic rawRole) {
    final role = normalizeRole(rawRole);
    return role == roleMainManager ||
        role == roleHrManager ||
        role == roleHrAdmin ||
        role == roleHr;
  }
}
