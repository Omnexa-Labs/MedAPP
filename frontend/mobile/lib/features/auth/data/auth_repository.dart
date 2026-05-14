import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/config/env.dart';
import '../../../core/network/api_client.dart';
import '../domain/auth_user.dart';

abstract class AuthRepository {
  Future<({String accessToken, AuthUser user})> login(String email, String password);
  Future<AuthUser> me();
}

class _HttpAuthRepository implements AuthRepository {
  _HttpAuthRepository(this._dio);
  final Dio _dio;

  @override
  Future<({String accessToken, AuthUser user})> login(String email, String password) async {
    final r = await _dio.post('/auth/login', data: {'email': email, 'password': password});
    final token = r.data['access_token'] as String;
    final meResp = await _dio.get(
      '/profile/me',
      options: Options(headers: {'Authorization': 'Bearer $token'}),
    );
    return (accessToken: token, user: AuthUser.fromJson(meResp.data as Map<String, dynamic>));
  }

  @override
  Future<AuthUser> me() async {
    final r = await _dio.get('/profile/me');
    return AuthUser.fromJson(r.data as Map<String, dynamic>);
  }
}

class _MockAuthRepository implements AuthRepository {
  @override
  Future<({String accessToken, AuthUser user})> login(String email, String password) async {
    await Future.delayed(const Duration(milliseconds: 400));
    if (password.length < 4) {
      throw DioException(
        requestOptions: RequestOptions(path: '/auth/login'),
        response: Response(
          requestOptions: RequestOptions(path: '/auth/login'),
          statusCode: 401,
          data: {'message': 'invalid credentials'},
        ),
        message: 'invalid credentials',
      );
    }
    return (
      accessToken: 'mock-token',
      user: AuthUser(id: 'demo', email: email, fullName: 'Demo Patient', role: 'patient'),
    );
  }

  @override
  Future<AuthUser> me() async {
    await Future.delayed(const Duration(milliseconds: 200));
    return AuthUser(id: 'demo', email: 'demo@medapp.test', fullName: 'Demo Patient', role: 'patient');
  }
}

final authRepositoryProvider = Provider<AuthRepository>((ref) {
  if (Env.useMockApi) return _MockAuthRepository();
  return _HttpAuthRepository(ref.watch(dioProvider));
});
