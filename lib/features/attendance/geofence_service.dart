import 'package:geolocator/geolocator.dart';
import '../../core/constants.dart';

class GeofenceCheckResult {
  final bool canClockIn;
  final bool isInsideZone;
  final bool isAccuracyValid;
  final Position? position;
  final Map<String, dynamic>? matchedZone;
  final double? distanceToNearestZone;
  final String? nearestZoneName;
  final String statusMessage;

  const GeofenceCheckResult({
    required this.canClockIn,
    required this.isInsideZone,
    required this.isAccuracyValid,
    this.position,
    this.matchedZone,
    this.distanceToNearestZone,
    this.nearestZoneName,
    required this.statusMessage,
  });
}

class GeofenceService {
  static Future<Position?> getCurrentPosition() async {
    bool serviceEnabled = await Geolocator.isLocationServiceEnabled();
    if (!serviceEnabled) {
      return null;
    }

    LocationPermission permission = await Geolocator.checkPermission();
    if (permission == LocationPermission.denied) {
      permission = await Geolocator.requestPermission();
      if (permission == LocationPermission.denied) {
        return null;
      }
    }

    if (permission == LocationPermission.deniedForever) {
      return null;
    }

    return await Geolocator.getCurrentPosition(
      locationSettings: const LocationSettings(
        accuracy: LocationAccuracy.high,
        timeLimit: Duration(seconds: 15),
      ),
    );
  }

  static GeofenceCheckResult evaluateGeofence({
    required Position? position,
    required List<String> assignedZoneIds,
    required List<Map<String, dynamic>> allLocations,
    required String policy,
    required double maxAccuracyMeters,
  }) {
    if (policy == AppConstants.policyGeofenceExempt) {
      return GeofenceCheckResult(
        canClockIn: true,
        isInsideZone: true,
        isAccuracyValid: true,
        position: position,
        statusMessage: 'Geofence Exempt: You can clock in from anywhere.',
      );
    }

    if (position == null) {
      return const GeofenceCheckResult(
        canClockIn: false,
        isInsideZone: false,
        isAccuracyValid: false,
        statusMessage:
            'Location unavailable. Please enable device GPS & permissions.',
      );
    }

    final isAccuracyValid = position.accuracy <= maxAccuracyMeters;

    // Filter locations to assigned zones if user has assigned zones;
    // If user has no specific assigned zones, consider all active company locations.
    final candidateLocations = assignedZoneIds.isEmpty
        ? allLocations
        : allLocations.where((loc) {
            final id = loc['id']?.toString() ?? loc['lid']?.toString();
            return id != null && assignedZoneIds.contains(id);
          }).toList();

    if (candidateLocations.isEmpty) {
      // If no locations configured or assigned
      final allow = policy == AppConstants.policyMobileOrOffice;
      return GeofenceCheckResult(
        canClockIn: allow,
        isInsideZone: true,
        isAccuracyValid: isAccuracyValid,
        position: position,
        statusMessage: allow
            ? 'Mobile/Office policy: No specific geofence assigned.'
            : 'No assigned geofence zone found for your account.',
      );
    }

    Map<String, dynamic>? matchedZone;
    double? minDistance;
    String? nearestName;

    for (final loc in candidateLocations) {
      final latRaw = loc['latitude'] ?? loc['lat'];
      final lngRaw = loc['longitude'] ?? loc['lng'] ?? loc['lon'];
      final radiusRaw = loc['radius'] ??
          loc['geofenceRadiusMeters'] ??
          loc['radiusMeters'] ??
          100.0;

      if (latRaw == null || lngRaw == null) continue;

      final lat = (latRaw is num) ? latRaw.toDouble() : double.tryParse(latRaw.toString()) ?? 0.0;
      final lng = (lngRaw is num) ? lngRaw.toDouble() : double.tryParse(lngRaw.toString()) ?? 0.0;
      final radius = (radiusRaw is num) ? radiusRaw.toDouble() : double.tryParse(radiusRaw.toString()) ?? 100.0;

      final distance = Geolocator.distanceBetween(
        position.latitude,
        position.longitude,
        lat,
        lng,
      );

      if (minDistance == null || distance < minDistance) {
        minDistance = distance;
        nearestName = loc['name']?.toString() ?? 'Assigned Zone';
      }

      if (distance <= radius) {
        matchedZone = loc;
        break;
      }
    }

    final isInsideZone = matchedZone != null;

    if (isInsideZone) {
      if (!isAccuracyValid && policy == AppConstants.policyStrictMobileGps) {
        return GeofenceCheckResult(
          canClockIn: false,
          isInsideZone: true,
          isAccuracyValid: false,
          position: position,
          matchedZone: matchedZone,
          statusMessage:
              'Inside ${matchedZone['name']}, but GPS accuracy (${position.accuracy.toStringAsFixed(1)}m) is below required ${maxAccuracyMeters.toStringAsFixed(0)}m.',
        );
      }

      return GeofenceCheckResult(
        canClockIn: true,
        isInsideZone: true,
        isAccuracyValid: isAccuracyValid,
        position: position,
        matchedZone: matchedZone,
        statusMessage: 'Inside zone: ${matchedZone['name'] ?? 'Office'}',
      );
    }

    // Outside zone
    if (policy == AppConstants.policyMobileOrOffice) {
      return GeofenceCheckResult(
        canClockIn: true,
        isInsideZone: false,
        isAccuracyValid: isAccuracyValid,
        position: position,
        distanceToNearestZone: minDistance,
        nearestZoneName: nearestName,
        statusMessage:
            'Outside office (${minDistance?.toStringAsFixed(0)}m away), allowed by Mobile-or-Office policy.',
      );
    }

    return GeofenceCheckResult(
      canClockIn: false,
      isInsideZone: false,
      isAccuracyValid: isAccuracyValid,
      position: position,
      distanceToNearestZone: minDistance,
      nearestZoneName: nearestName,
      statusMessage:
          'Outside assigned zone. Nearest: $nearestName (${minDistance?.toStringAsFixed(0)}m away).',
    );
  }
}
