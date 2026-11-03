import 'dart:async';

import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import '../../app_state.dart';
import '../../core/api.dart';
import '../../core/phone.dart';
import '../theme.dart';
import '../widgets/common.dart';
import '../widgets/forms.dart';

class LoginPage extends StatefulWidget {
  const LoginPage({super.key});

  @override
  State<LoginPage> createState() => _LoginPageState();
}

class _LoginPageState extends State<LoginPage> {
  final _phone = TextEditingController();
  int _step = 0;
  String _otp = '';
  String? _error;
  String? _notice;
  bool _loading = false;
  int _resendSec = 0;
  Timer? _timer;

  @override
  void initState() {
    super.initState();
    final state = context.read<AppState>();
    _notice = state.authNotice;
    state.authNotice = null;
  }

  @override
  void dispose() {
    _timer?.cancel();
    _phone.dispose();
    super.dispose();
  }

  void _startResendTimer() {
    _timer?.cancel();
    setState(() => _resendSec = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (t) {
      if (!mounted) return t.cancel();
      setState(() => _resendSec = _resendSec <= 1 ? 0 : _resendSec - 1);
      if (_resendSec == 0) t.cancel();
    });
  }

  Future<void> _sendCode() async {
    setState(() => _error = null);
    final phone = _phone.text.trim();
    if (phone.isEmpty) return setState(() => _error = 'Введите номер телефона');
    final phoneErr = phoneValidationMessage(phone);
    if (phoneErr != null) return setState(() => _error = phoneErr);

    setState(() => _loading = true);
    try {
      await Api.post('/api/auth/sms/send', {'phone': phone, 'purpose': 'login'});
      if (!mounted) return;
      setState(() {
        _step = 1;
        _otp = '';
      });
      _startResendTimer();
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Не удалось отправить SMS'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _submitOtp() async {
    setState(() => _error = null);
    if (_otp.length != 6) return setState(() => _error = 'Введите код из SMS (6 цифр)');
    setState(() => _loading = true);
    try {
      final data = await Api.post('/api/auth/sms/login', {'phone': _phone.text.trim(), 'code': _otp});
      if (!mounted) return;
      await context.read<AppState>().onAuth(Map<String, dynamic>.from(data as Map));
    } catch (err) {
      if (mounted) setState(() => _error = errorMessage(err, 'Ошибка входа'));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PopScope(
      canPop: _step == 0,
      onPopInvokedWithResult: (didPop, _) {
        if (!didPop) setState(() => _step = 0);
      },
      child: Scaffold(
        appBar: AppHeader(showAvatar: false, onBack: _step > 0 ? () => setState(() => _step = 0) : null),
        body: Stack(
          children: [
            const Positioned.fill(child: Atmosphere()),
            SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(20, 40, 20, 32),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Text('Бегай.\nЗарабатывай.', style: RB.headline(size: 40)),
                  const SizedBox(height: 8),
                  Text('Вход по SMS-коду', style: RB.body(size: 16, color: RB.onSurfaceVariant)),
                  const SizedBox(height: 28),
                  GlassCard(
                    radius: RB.radiusLg,
                    padding: const EdgeInsets.all(20),
                    child: AutofillGroup(child: _step == 0 ? _phoneStep() : _otpStep()),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _phoneStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        PhoneInput(controller: _phone, label: 'Телефон', autofocus: true),
        if (_notice != null)
          Padding(
            padding: const EdgeInsets.only(bottom: 12),
            child: Text(_notice!, style: RB.body(size: 13, color: RB.onSurfaceVariant)),
          ),
        if (_error != null) _errorText(),
        PrimaryButton(
          label: _loading ? 'Отправка…' : 'Получить код',
          icon: Icons.arrow_forward,
          onPressed: _loading ? null : _sendCode,
        ),
      ],
    );
  }

  Widget _otpStep() {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text('Код отправлен на ${formatPhoneDisplay(_phone.text)}', style: RB.body(color: RB.onSurfaceVariant)),
        const SizedBox(height: 16),
        OtpInput(
          value: _otp,
          enabled: !_loading,
          onChanged: (v) {
            setState(() => _otp = v);
            if (v.length == 6 && !_loading) _submitOtp();
          },
        ),
        const SizedBox(height: 16),
        if (_error != null) _errorText(),
        PrimaryButton(label: _loading ? 'Вход…' : 'Войти', icon: Icons.arrow_forward, onPressed: _loading ? null : _submitOtp),
        const SizedBox(height: 10),
        OutlineButtonRB(
          expand: true,
          label: _resendSec > 0 ? 'Повтор через $_resendSec с' : 'Отправить код снова',
          onPressed: _loading || _resendSec > 0 ? null : _sendCode,
        ),
      ],
    );
  }

  Widget _errorText() => Padding(
        padding: const EdgeInsets.only(bottom: 12),
        child: Text(_error!, style: RB.body(color: RB.error, weight: FontWeight.w500)),
      );
}
