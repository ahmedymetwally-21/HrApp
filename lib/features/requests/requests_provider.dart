import 'package:dio/dio.dart';
import 'package:file_picker/file_picker.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import '../auth/auth_provider.dart';

class RequestsState {
  final List<Map<String, dynamic>> requests;
  final bool isLoading;
  final bool isSubmitting;
  final bool isUploading;
  final String? uploadedFileUrl;
  final String? uploadedFileName;
  final String? errorMessage;
  final String? successMessage;

  const RequestsState({
    this.requests = const [],
    this.isLoading = false,
    this.isSubmitting = false,
    this.isUploading = false,
    this.uploadedFileUrl,
    this.uploadedFileName,
    this.errorMessage,
    this.successMessage,
  });

  RequestsState copyWith({
    List<Map<String, dynamic>>? requests,
    bool? isLoading,
    bool? isSubmitting,
    bool? isUploading,
    String? Function()? uploadedFileUrl,
    String? Function()? uploadedFileName,
    String? errorMessage,
    String? successMessage,
  }) {
    return RequestsState(
      requests: requests ?? this.requests,
      isLoading: isLoading ?? this.isLoading,
      isSubmitting: isSubmitting ?? this.isSubmitting,
      isUploading: isUploading ?? this.isUploading,
      uploadedFileUrl:
          uploadedFileUrl != null ? uploadedFileUrl() : this.uploadedFileUrl,
      uploadedFileName:
          uploadedFileName != null ? uploadedFileName() : this.uploadedFileName,
      errorMessage: errorMessage,
      successMessage: successMessage,
    );
  }
}

final requestsProvider =
    NotifierProvider<RequestsNotifier, RequestsState>(RequestsNotifier.new);

class RequestsNotifier extends Notifier<RequestsState> {
  Dio get _dio => ref.read(dioProvider);

  @override
  RequestsState build() {
    final isAuthenticated =
        ref.watch(authProvider.select((a) => a.isAuthenticated));

    if (isAuthenticated) {
      Future.microtask(() => loadRequests(background: true));
    }

    return const RequestsState();
  }

  Future<void> loadRequests({bool background = false}) async {
    if (!background && state.requests.isEmpty) {
      state = state.copyWith(isLoading: true, errorMessage: null);
    }

    try {
      final res = await _dio.get('/requests');
      List<Map<String, dynamic>> allRequests = [];

      if (res.data is List) {
        allRequests = (res.data as List)
            .whereType<Map<String, dynamic>>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      } else if (res.data is Map && res.data['requests'] is List) {
        allRequests = (res.data['requests'] as List)
            .whereType<Map<String, dynamic>>()
            .map((e) => Map<String, dynamic>.from(e))
            .toList();
      }

      final auth = ref.read(authProvider);
      final currentUserId = auth.user?['id']?.toString() ??
          auth.user?['userId']?.toString() ??
          auth.user?['uid']?.toString();
      final currentUserEmail = auth.user?['email']?.toString().toLowerCase();

      final myRequests = allRequests.where((req) {
        final creatorId = req['userId']?.toString() ??
            req['user_id']?.toString() ??
            req['employeeId']?.toString() ??
            req['employee_id']?.toString();
        final creatorEmail = req['email']?.toString().toLowerCase() ??
            req['userEmail']?.toString().toLowerCase();

        if (creatorId != null && currentUserId != null) {
          return creatorId == currentUserId;
        }
        if (creatorEmail != null && currentUserEmail != null) {
          return creatorEmail == currentUserEmail;
        }
        return true;
      }).toList();

      myRequests.sort((a, b) {
        final dateA = a['createdAt'] ?? a['created_at'] ?? '';
        final dateB = b['createdAt'] ?? b['created_at'] ?? '';
        return dateB.toString().compareTo(dateA.toString());
      });

      state = state.copyWith(requests: myRequests, isLoading: false);
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Failed to load requests: ${e.toString()}',
      );
    }
  }

  Future<void> pickAndUploadFile() async {
    state = state.copyWith(isUploading: true, errorMessage: null);

    try {
      final files = await FilePicker.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['pdf', 'png', 'jpg', 'jpeg', 'docx', 'doc'],
      );

      if (files.isEmpty) {
        state = state.copyWith(isUploading: false);
        return;
      }

      final file = files.first;
      final bytes = await file.readAsBytes();
      final multipartFile = MultipartFile.fromBytes(
        bytes,
        filename: file.name,
      );

      final formData = FormData.fromMap({
        'file': multipartFile,
      });

      final response = await _dio.post('/requests/upload', data: formData);

      String? uploadedUrl;
      if (response.data is Map) {
        uploadedUrl = response.data['url'] ??
            response.data['file_url'] ??
            response.data['path'] ??
            response.data['filename'];
      } else if (response.data is String) {
        uploadedUrl = response.data;
      }

      state = state.copyWith(
        isUploading: false,
        uploadedFileUrl: () => uploadedUrl ?? file.name,
        uploadedFileName: () => file.name,
        successMessage: 'File "${file.name}" uploaded successfully.',
      );
    } on DioException catch (e) {
      String msg = 'Failed to upload attachment.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isUploading: false, errorMessage: msg);
    } catch (e) {
      state = state.copyWith(
        isUploading: false,
        errorMessage: 'Attachment upload failed: ${e.toString()}',
      );
    }
  }

  void removeAttachment() {
    state = state.copyWith(
      uploadedFileUrl: () => null,
      uploadedFileName: () => null,
    );
  }

  Future<bool> createRequest({
    required String category,
    required String title,
    required String reason,
    required Map<String, dynamic> categoryDetails,
  }) async {
    state = state.copyWith(
        isSubmitting: true, errorMessage: null, successMessage: null);

    try {
      final auth = ref.read(authProvider);
      final currentUserId =
          auth.user?['id'] ?? auth.user?['userId'] ?? auth.user?['uid'];

      final payload = {
        'category': category,
        'title': title,
        'reason': reason,
        'userId': currentUserId,
        'details': categoryDetails,
        ...categoryDetails,
        if (state.uploadedFileUrl != null) ...{
          'attachmentUrl': state.uploadedFileUrl,
          'fileUrl': state.uploadedFileUrl,
          'attachments': [state.uploadedFileUrl],
        },
      };

      await _dio.post('/requests', data: payload);

      state = state.copyWith(
        isSubmitting: false,
        uploadedFileUrl: () => null,
        uploadedFileName: () => null,
        successMessage: 'Request submitted successfully!',
      );

      await loadRequests();
      return true;
    } on DioException catch (e) {
      String msg = 'Failed to submit request.';
      if (e.response?.data is Map && e.response?.data['detail'] != null) {
        msg = e.response?.data['detail'].toString() ?? msg;
      }
      state = state.copyWith(isSubmitting: false, errorMessage: msg);
      return false;
    } catch (e) {
      state = state.copyWith(
        isSubmitting: false,
        errorMessage: 'Request submission failed: ${e.toString()}',
      );
      return false;
    }
  }

  void clearMessages() {
    state = state.copyWith(errorMessage: null, successMessage: null);
  }
}
