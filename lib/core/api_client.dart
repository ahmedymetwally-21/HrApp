import 'package:dio/dio.dart';
import 'constants.dart';
import 'storage_service.dart';

typedef OnUnauthorizedCallback = void Function();

class ApiClient {
  late Dio dio;
  final StorageService storageService;
  OnUnauthorizedCallback? onUnauthorized;

  ApiClient({
    required this.storageService,
    this.onUnauthorized,
  }) {
    dio = Dio(
      BaseOptions(
        baseUrl: AppConstants.baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 15),
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
      ),
    );

    dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) async {
          final token = await storageService.getToken();
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          return handler.next(options);
        },
        onError: (DioException error, handler) async {
          if (error.response?.statusCode == 401) {
            // Automatic logout on 401 Unauthorized
            await storageService.clearAll();
            onUnauthorized?.call();
          }
          return handler.next(error);
        },
      ),
    );
  }
}
