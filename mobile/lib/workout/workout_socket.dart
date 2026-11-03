import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:web_socket_channel/io.dart';

import '../core/api.dart';
import '../core/config.dart';
import '../core/device_id.dart';

typedef SocketCommandHandler = void Function(Map<String, dynamic> msg);

/// Канал отправки GPS-точек с подтверждением (points_ack).
class WorkoutSocket {
  WorkoutSocket._();

  static const _path = '/app/workout';
  static const _reconnectDelay = Duration(seconds: 2);
  static const _ackTimeout = Duration(seconds: 8);
  static final _connectTimeout = Duration(milliseconds: Platform.isAndroid ? 3500 : 6000);

  static IOWebSocketChannel? _channel;
  static StreamSubscription<dynamic>? _sub;
  static int? _workoutId;
  static bool _open = false;
  static bool _connecting = false;
  static bool _intentionalClose = false;
  static Timer? _reconnectTimer;
  static Timer? _pingTimer;
  static SocketCommandHandler? _onCommand;
  static final Map<String, ({Completer<Map<String, dynamic>> completer, Timer timer})> _pending = {};
  static int _ackSeq = 0;

  static bool get isOpen => _open;
  static bool get isConnecting => _connecting;

  static Uri _buildUri(int workoutId) {
    var base = apiUrl;
    if (base.startsWith(RegExp('https://', caseSensitive: false))) {
      base = base.replaceFirst(RegExp('^https', caseSensitive: false), 'wss');
    } else if (base.startsWith(RegExp('http://', caseSensitive: false))) {
      base = base.replaceFirst(RegExp('^http', caseSensitive: false), 'ws');
    }
    return Uri.parse('$base$_path').replace(queryParameters: {
      'token': Api.token ?? '',
      'device_id': getDeviceId(),
      'workout_id': '$workoutId',
    });
  }

  static void _rejectAll(Object err) {
    for (final p in _pending.values) {
      p.timer.cancel();
      if (!p.completer.isCompleted) p.completer.completeError(err);
    }
    _pending.clear();
  }

  static void _handleMessage(dynamic raw) {
    Map<String, dynamic> msg;
    try {
      final data = jsonDecode(raw is String ? raw : utf8.decode(raw as List<int>));
      if (data is! Map<String, dynamic>) return;
      msg = data;
    } catch (_) {
      return;
    }

    final type = msg['type'];
    if (type == 'points_ack' || type == 'finish_ack') {
      final pending = _pending.remove(msg['request_id']);
      if (pending == null) return;
      pending.timer.cancel();
      if (msg['ok'] == false) {
        pending.completer.completeError(Exception(msg['error'] ?? 'points_rejected'));
      } else {
        pending.completer.complete(msg);
      }
      return;
    }
    if (type == 'fund_exhausted' || type == 'workout_force_stop') {
      _onCommand?.call(msg);
    }
  }

  static void _closeChannel() {
    _pingTimer?.cancel();
    _pingTimer = null;
    _sub?.cancel();
    _sub = null;
    _channel?.sink.close();
    _channel = null;
    _open = false;
    _connecting = false;
  }

  static void _scheduleReconnect() {
    if (_intentionalClose || _workoutId == null) return;
    _reconnectTimer?.cancel();
    _reconnectTimer = Timer(_reconnectDelay, () {
      final id = _workoutId;
      if (id != null) connect(id).catchError((_) {});
    });
  }

  static Future<void> connect(int workoutId, {SocketCommandHandler? onCommand}) async {
    _onCommand = onCommand ?? _onCommand;
    _intentionalClose = false;

    if (_open && _workoutId == workoutId) return;
    _workoutId = workoutId;
    _closeChannel();

    if ((Api.token ?? '').isEmpty) throw Exception('Нет токена авторизации');

    _connecting = true;
    final channel = IOWebSocketChannel.connect(_buildUri(workoutId), connectTimeout: _connectTimeout);
    _channel = channel;

    try {
      await channel.ready.timeout(_connectTimeout);
    } catch (err) {
      if (_channel == channel) {
        _closeChannel();
        _scheduleReconnect();
      }
      rethrow;
    }
    if (_channel != channel) return;

    _connecting = false;
    _open = true;
    _pingTimer = Timer.periodic(const Duration(seconds: 25), (_) {
      if (_open) channel.sink.add(jsonEncode({'type': 'ping'}));
    });
    _sub = channel.stream.listen(
      _handleMessage,
      onDone: () {
        if (_channel != channel) return;
        _closeChannel();
        _rejectAll(Exception('WebSocket closed'));
        _scheduleReconnect();
      },
      onError: (_) {},
      cancelOnError: false,
    );
  }

  static Future<Map<String, dynamic>> _sendWithAck(String prefix, Map<String, dynamic> body) {
    final channel = _channel;
    if (channel == null || !_open) {
      return Future.error(Exception('WebSocket не подключён'));
    }
    final requestId = '$prefix-${++_ackSeq}';
    final completer = Completer<Map<String, dynamic>>();
    final timer = Timer(_ackTimeout, () {
      final p = _pending.remove(requestId);
      if (p != null && !p.completer.isCompleted) {
        p.completer.completeError(TimeoutException('ack timeout'));
      }
    });
    _pending[requestId] = (completer: completer, timer: timer);
    channel.sink.add(jsonEncode({...body, 'request_id': requestId}));
    return completer.future;
  }

  static Future<void> sendPoints(List<Map<String, dynamic>> points, int stepsCount) async {
    if (points.isEmpty) return;
    await _sendWithAck('pt', {
      'type': 'client_point_send',
      'points': points,
      'steps_count': stepsCount,
    });
  }

  static Future<void> disconnect() async {
    _intentionalClose = true;
    _reconnectTimer?.cancel();
    _rejectAll(Exception('disconnect'));
    if (_open) {
      try {
        await _sendWithAck('fin', {'type': 'client_finish'});
      } catch (_) {}
    }
    _closeChannel();
    _workoutId = null;
  }
}
