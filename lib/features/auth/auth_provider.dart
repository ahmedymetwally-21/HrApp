import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../../core/api_client.dart';
import '../../core/storage_service.dart';
import 'auth_state.dart';

final storageServiceProvider = Provider<StorageService>((ref) {
  return StorageService();
});

final dioProvider = Provider<Dio>((ref) {
  final storage = ref.watch(storageServiceProvider);
  final client = ApiClient(
    storageService: storage,
    onUnauthorized: () {
      ref.read(authProvider.notifier).logout();
    },
  );
  return client.dio;
});

final authProvider = NotifierProvider<AuthNotifier, AuthState>(AuthNotifier.new);

class AuthNotifier extends Notifier<AuthState> {
  StorageService get _storage => ref.read(storageServiceProvider);
  Dio get _dio => ref.read(dioProvider);

  @override
  AuthState build() {
    Future.microtask(() => _initializeAuth());
    return const AuthState(isLoading: true);
  }

  Future<void> _initializeAuth() async {
    try {
      final token = await _storage.getToken();
      final user = await _storage.getUserData();
      final mustChange = await _storage.getMustChangePassword();

      if (token != null && token.isNotEmpty) {
        state = AuthState(
          isAuthenticated: true,
          mustChangePassword: mustChange,
          token: token,
          user: user,
          isLoading: false,
        );
      } else {
        state = const AuthState(isLoading: false);
      }
    } catch (_) {
      state = const AuthState(isLoading: false);
    }
  }

  Future<bool> login({
    required String username,
    required String password,
  }) async {
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      final trimmed = username.trim();
      final response = await _dio.post(
        '/auth/login',
        data: {
          'username': trimmed,
          'email': trimmed,
          'password': password,
        },
      );

      final data = response.data;
      String? token;
      Map<String, dynamic>? userData;
      bool mustChange = false;

      if (data is Map<String, dynamic>) {
        token = data['token'] ?? data['access_token'] ?? data['accessToken'];
        if (data['user'] is Map<String, dynamic>) {
          userData = Map<String, dynamic>.from(data['user'] as Map);
        } else {
          userData = Map<String, dynamic>.from(data);
        }

        if (data['mustChangePassword'] == true ||
            data['must_change_password'] == true ||
            (userData['mustChangePassword'] == true) ||
            (userData['must_change_password'] == true)) {
          mustChange = true;
        }
      }

      if (token == null || token.isEmpty) {
        state = state.copyWith(
          isLoading: false,
          errorMessage: 'Login failed: No access token received from server.',
        );
        return false;
      }

      await _storage.saveToken(token);
      if (userData != null) {
        await _storage.saveUserData(userData);
      }
      await _storage.saveMustChangePassword(mustChange);

      state = AuthState(
        isAuthenticated: true,
        mustChangePassword: mustChange,
        token: token,
        user: userData,
        isLoading: false,
      );
      return true;
    } on DioException catch (e) {
      String msg = 'Login failed. Please check your credentials.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      } else if (e.response?.data is Map && e.response?.data['message'] != null) {
        msg = e.response?.data['message'].toString() ?? msg;
      }
      state = state.copyWith(isLoading: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'An unexpected error occurred: ${e.toString()}',
      );
      return false;
    }
  }

  Future<bool> changePassword({
    required String currentPassword,
    required String newPassword,
  }) async {
    state = state.copyWith(isLoading: true, errorMessage: null);

    try {
      await _dio.post(
        '/auth/change-password',
        data: {
          'currentPassword': currentPassword,
          'oldPassword': currentPassword,
          'newPassword': newPassword,
          'password': newPassword,
        },
      );

      await _storage.saveMustChangePassword(false);
      state = state.copyWith(
        isLoading: false,
        mustChangePassword: false,
        errorMessage: null,
      );
      return true;
    } on DioException catch (e) {
      String msg = 'Failed to change password.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isLoading: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'An unexpected error occurred: ${e.toString()}',
      );
      return false;
    }
  }

  void updateUserProfile(Map<String, dynamic> updatedUser) {
    state = state.copyWith(user: updatedUser);
    _storage.saveUserData(updatedUser);
  }

  Future<void> logout() async {
    await _storage.clearAll();
    state = const AuthState();
  }
}
