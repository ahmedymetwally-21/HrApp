import 'dart:convert';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'constants.dart';

class StorageService {
  final FlutterSecureStorage _storage;

  StorageService([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  Future<void> saveToken(String token) async {
    await _storage.write(key: AppConstants.keyToken, value: token);
  }

  Future<String?> getToken() async {
    return await _storage.read(key: AppConstants.keyToken);
  }

  Future<void> saveUserData(Map<String, dynamic> user) async {
    await _storage.write(
      key: AppConstants.keyUserData,
      value: jsonEncode(user),
    );
  }

  Future<Map<String, dynamic>?> getUserData() async {
    final str = await _storage.read(key: AppConstants.keyUserData);
    if (str == null || str.isEmpty) return null;
    try {
      return jsonDecode(str) as Map<String, dynamic>;
    } catch (_) {
      return null;
    }
  }

  Future<void> saveMustChangePassword(bool mustChange) async {
    await _storage.write(
      key: AppConstants.keyMustChangePassword,
      value: mustChange.toString(),
    );
  }

  Future<bool> getMustChangePassword() async {
    final str = await _storage.read(key: AppConstants.keyMustChangePassword);
    return str == 'true';
  }

  Future<void> clearAll() async {
    await _storage.deleteAll();
  }
}
