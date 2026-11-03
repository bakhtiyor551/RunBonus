import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

abstract final class RB {
  static const bg = Color(0xFF131313);
  static const surfaceLow = Color(0xFF1B1B1B);
  static const surface = Color(0xFF1F1F1F);
  static const surfaceHigh = Color(0xFF2A2A2A);
  static const surfaceHighest = Color(0xFF353535);
  static const onSurface = Color(0xFFE2E2E2);
  static const onSurfaceVariant = Color(0xFFC4C9AC);
  static const outline = Color(0xFF444933);
  static const neon = Color(0xFFC3F400);
  static const neonDim = Color(0xFFABD600);
  static const onNeon = Color(0xFF161E00);
  static const error = Color(0xFFFFB4AB);

  static const radius = 16.0;
  static const radiusLg = 24.0;

  static TextStyle headline({double size = 24, FontWeight weight = FontWeight.w700, Color color = onSurface}) =>
      GoogleFonts.spaceGrotesk(fontSize: size, fontWeight: weight, color: color, height: 1.15);

  static TextStyle body({double size = 14, FontWeight weight = FontWeight.w400, Color color = onSurface}) =>
      GoogleFonts.inter(fontSize: size, fontWeight: weight, color: color);

  /// Маленькая подпись капсом (метки статистики).
  static TextStyle label({double size = 11, Color color = onSurfaceVariant}) =>
      GoogleFonts.inter(fontSize: size, fontWeight: FontWeight.w600, color: color, letterSpacing: 1.2);

  static BoxDecoration glass({double radius = RB.radius, Color? border}) => BoxDecoration(
        color: Colors.white.withValues(alpha: 0.03),
        borderRadius: BorderRadius.circular(radius),
        border: Border.all(color: border ?? Colors.white.withValues(alpha: 0.10)),
      );
}

ThemeData buildTheme() {
  final base = ThemeData(
    brightness: Brightness.dark,
    useMaterial3: true,
    fontFamily: GoogleFonts.inter().fontFamily,
    scaffoldBackgroundColor: RB.bg,
    colorScheme: const ColorScheme.dark(
      primary: RB.neon,
      onPrimary: RB.onNeon,
      secondary: RB.neonDim,
      surface: RB.surface,
      onSurface: RB.onSurface,
      onSurfaceVariant: RB.onSurfaceVariant,
      outline: RB.outline,
      error: RB.error,
    ),
  );
  return base.copyWith(
    textTheme: base.textTheme.apply(bodyColor: RB.onSurface, displayColor: RB.onSurface),
    appBarTheme: const AppBarTheme(backgroundColor: RB.bg, elevation: 0, scrolledUnderElevation: 0),
    snackBarTheme: SnackBarThemeData(
      backgroundColor: RB.surfaceHigh,
      contentTextStyle: RB.body(),
      behavior: SnackBarBehavior.floating,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: RB.surfaceLow,
      hintStyle: RB.body(color: RB.onSurfaceVariant.withValues(alpha: 0.6)),
      labelStyle: RB.body(color: RB.onSurfaceVariant),
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(RB.radius), borderSide: const BorderSide(color: RB.outline)),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(RB.radius), borderSide: const BorderSide(color: RB.outline)),
      focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(RB.radius), borderSide: const BorderSide(color: RB.neon)),
    ),
    bottomSheetTheme: const BottomSheetThemeData(
      backgroundColor: RB.surfaceLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.vertical(top: Radius.circular(RB.radiusLg))),
      showDragHandle: true,
      dragHandleColor: RB.outline,
    ),
    dialogTheme: DialogThemeData(
      backgroundColor: RB.surfaceLow,
      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(RB.radiusLg)),
    ),
    progressIndicatorTheme: const ProgressIndicatorThemeData(color: RB.neon),
    dividerColor: Colors.white.withValues(alpha: 0.08),
  );
}
