import 'package:uuid/uuid.dart';

import 'storage.dart';

const _storageKey = 'runbonus_device_id';

String? _cached;

/// Уникальный ID установки приложения (один раз на устройство).
String getDeviceId() {
  if (_cached != null) return _cached!;
  var id = Storage.getString(_storageKey);
  if (id == null || id.isEmpty) {
    id = const Uuid().v4();
    Storage.setString(_storageKey, id);
  }
  _cached = id;
  return id;
}
