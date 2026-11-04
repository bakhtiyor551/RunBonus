import 'dart:convert';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:image_picker/image_picker.dart';

/// Выбрать фото, ужать и вернуть PNG data URL (`data:image/png;base64,…`).
/// PNG из галереи iOS не сжимается image_picker — поэтому ресайзим сами.
Future<String?> pickImageDataUrl(ImageSource source, {double maxSide = 1280, int quality = 82}) async {
  final file = await ImagePicker().pickImage(
    source: source,
    maxWidth: maxSide,
    maxHeight: maxSide,
    imageQuality: quality,
  );
  if (file == null) return null;
  final raw = await file.readAsBytes();
  final bytes = await _resizePng(raw, maxSide: maxSide.round());
  return 'data:image/png;base64,${base64Encode(bytes)}';
}

Future<List<int>> _resizePng(List<int> raw, {required int maxSide}) async {
  final codec = await ui.instantiateImageCodec(
    Uint8List.fromList(raw),
    targetWidth: maxSide,
  );
  final frame = await codec.getNextFrame();
  final image = frame.image;
  try {
    final data = await image.toByteData(format: ui.ImageByteFormat.png);
    if (data == null) return raw;
    return data.buffer.asUint8List();
  } finally {
    image.dispose();
  }
}

/// Байты картинки из data URL (для превью).
List<int>? dataUrlBytes(String? dataUrl) {
  if (dataUrl == null) return null;
  final i = dataUrl.indexOf(',');
  return i < 0 ? null : base64Decode(dataUrl.substring(i + 1));
}
