import 'dart:convert';

import 'package:image_picker/image_picker.dart';

/// Выбрать фото и вернуть сжатый JPEG как data URL (`data:image/jpeg;base64,…`).
Future<String?> pickImageDataUrl(ImageSource source, {double maxSide = 1280, int quality = 82}) async {
  final file = await ImagePicker().pickImage(
    source: source,
    maxWidth: maxSide,
    maxHeight: maxSide,
    imageQuality: quality,
  );
  if (file == null) return null;
  final bytes = await file.readAsBytes();
  final mime = file.mimeType ?? (file.path.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
  return 'data:$mime;base64,${base64Encode(bytes)}';
}

/// Байты картинки из data URL (для превью).
List<int>? dataUrlBytes(String? dataUrl) {
  if (dataUrl == null) return null;
  final i = dataUrl.indexOf(',');
  return i < 0 ? null : base64Decode(dataUrl.substring(i + 1));
}
