import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:material_ui/material_ui.dart';

class ThemeModeNotifier extends Notifier<ThemeMode> {
  final FlutterSecureStorage _storage = const FlutterSecureStorage();
  static const String _storageKey = 'yaldi_theme_mode';

  @override
  ThemeMode build() {
    _loadPersistedTheme();
    return ThemeMode.dark;
  }

  Future<void> _loadPersistedTheme() async {
    try {
      final saved = await _storage.read(key: _storageKey);
      if (saved == 'light') {
        state = ThemeMode.light;
      } else if (saved == 'dark') {
        state = ThemeMode.dark;
      }
    } catch (_) {}
  }

  Future<void> toggleDarkMode(bool isDark) async {
    state = isDark ? ThemeMode.dark : ThemeMode.light;
    try {
      await _storage.write(
        key: _storageKey,
        value: isDark ? 'dark' : 'light',
      );
    } catch (_) {}
  }

  Future<void> toggleTheme(bool isDark) => toggleDarkMode(isDark);
}

final themeModeProvider =
    NotifierProvider<ThemeModeNotifier, ThemeMode>(ThemeModeNotifier.new);

class AppTheme {
  // Yaldi Design System Palette (Light Mode)
  static const Color canvasBackground = Color(0xFFF7F8FA);
  static const Color cardSurface = Color(0xFFFFFFFF);
  static const Color cardBorder = Color(0xFFE6E8EC);
  static const Color dividerColor = Color(0xFFEAECEF);

  // Yaldi Design System Palette (Dark Mode - Yaldi Navy)
  static const Color darkCanvasBackground = Color(0xFF031125);
  static const Color darkCardSurface = Color(0xFF0B2546);
  static const Color darkCardBorder = Color(0xFF1A4579);
  static const Color darkDividerColor = Color(0xFF1A4579);
  static const Color darkTextPrimary = Color(0xFFF8FAFC);
  static const Color darkTextSecondary = Color(0xFFC9D8FA);
  static const Color darkTextMuted = Color(0xFF898A8F);

  // Primary Blue & Deep Navy Stops
  static const Color primaryBlue = Color(0xFF3B8BEC);
  static const Color navyDarkest = Color(0xFF031125);
  static const Color navyMiddle = Color(0xFF0B2546);
  static const Color navyLight = Color(0xFF1A4579);

  // Hero Card Blue Tints (Light)
  static const Color heroBlueStart = Color(0xFFEEF4FF);
  static const Color heroBlueEnd = Color(0xFFDCE8FD);
  static const Color heroBlueBorder = Color(0xFFC9D8FA);
  static const Color navPillBg = Color(0xFFC9D8FA);
  static const Color navActiveIcon = Color(0xFF2A67B1);

  // Hero Card Blue Tints (Dark)
  static const Color darkHeroBlueStart = Color(0xFF0B2546);
  static const Color darkHeroBlueEnd = Color(0xFF1A4579);
  static const Color darkHeroBlueBorder = Color(0xFF2A67B1);

  // Yaldi Gold & Teal Accents
  static const Color goldAccent = Color(0xFFCB9E55);
  static const Color goldTint = Color(0xFFFBEFE2);
  static const Color tealAccent = Color(0xFF49A166);

  // Status Pills (Light)
  static const Color successText = Color(0xFF548C0C);
  static const Color successFill = Color(0xFFEBF9DC);

  static const Color warningText = Color(0xFFA96D14);
  static const Color warningFill = Color(0xFFFEEADD);

  static const Color errorText = Color(0xFFB80E2B);
  static const Color errorFill = Color(0xFFFEEDED);

  // Status Pills (Dark)
  static const Color darkSuccessText = Color(0xFF89E01A);
  static const Color darkSuccessFill = Color(0xFF163308);

  static const Color darkWarningText = Color(0xFFFDB775);
  static const Color darkWarningFill = Color(0xFF3A2404);

  static const Color darkErrorText = Color(0xFFFC7E87);
  static const Color darkErrorFill = Color(0xFF3B0A14);

  // Text Scale (Light)
  static const Color textPrimary = Color(0xFF111112);
  static const Color textSecondary = Color(0xFF434448);
  static const Color textMuted = Color(0xFF898A8F);

  // Legacy mappings for backward compatibility
  static const Color primaryColor = primaryBlue;
  static const Color secondaryColor = tealAccent;
  static const Color accentAmber = goldAccent;
  static const Color errorRed = errorText;
  static const Color successGreen = successText;

  // Context-aware dynamic helpers
  static bool isDark(BuildContext context) =>
      Theme.of(context).brightness == Brightness.dark;

  static Color scaffoldBackground(BuildContext context) =>
      isDark(context) ? darkCanvasBackground : canvasBackground;

  static Color surface(BuildContext context) =>
      isDark(context) ? darkCardSurface : cardSurface;

  static Color border(BuildContext context) =>
      isDark(context) ? darkCardBorder : cardBorder;

  static Color divider(BuildContext context) =>
      isDark(context) ? darkDividerColor : dividerColor;

  static Color textPri(BuildContext context) =>
      isDark(context) ? darkTextPrimary : textPrimary;

  static Color textSec(BuildContext context) =>
      isDark(context) ? darkTextSecondary : textSecondary;

  static Color textMut(BuildContext context) =>
      isDark(context) ? darkTextMuted : textMuted;

  static List<Color> heroGradient(BuildContext context) =>
      isDark(context)
          ? const [darkHeroBlueStart, darkHeroBlueEnd]
          : const [heroBlueStart, heroBlueEnd];

  static Color heroBorder(BuildContext context) =>
      isDark(context) ? darkHeroBlueBorder : heroBlueBorder;

  static (Color text, Color fill) successPill(BuildContext context) =>
      isDark(context)
          ? (darkSuccessText, darkSuccessFill)
          : (successText, successFill);

  static (Color text, Color fill) warningPill(BuildContext context) =>
      isDark(context)
          ? (darkWarningText, darkWarningFill)
          : (warningText, warningFill);

  static (Color text, Color fill) errorPill(BuildContext context) =>
      isDark(context)
          ? (darkErrorText, darkErrorFill)
          : (errorText, errorFill);

  static ThemeData get lightTheme {
    final baseTextTheme = Typography.blackMountainView;
    final plusJakartaTheme = GoogleFonts.plusJakartaSansTextTheme(baseTextTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.light,
      scaffoldBackgroundColor: canvasBackground,
      colorScheme: const ColorScheme(
        brightness: Brightness.light,
        primary: primaryBlue,
        onPrimary: Colors.white,
        secondary: tealAccent,
        onSecondary: Colors.white,
        error: errorText,
        onError: Colors.white,
        surface: cardSurface,
        onSurface: textPrimary,
      ),
      textTheme: plusJakartaTheme.apply(
        bodyColor: textPrimary,
        displayColor: textPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: cardSurface,
        foregroundColor: textPrimary,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 1,
        titleTextStyle: TextStyle(
          color: textPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: cardSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: cardBorder, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: primaryBlue,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(27),
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(27),
          ),
          side: const BorderSide(color: cardBorder),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: cardSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: cardBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: cardBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: primaryBlue, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: errorText),
        ),
        labelStyle: const TextStyle(color: textSecondary, fontSize: 14),
        hintStyle: const TextStyle(color: textMuted, fontSize: 14),
      ),
    );
  }

  static ThemeData get darkTheme {
    final baseTextTheme = Typography.whiteMountainView;
    final plusJakartaTheme = GoogleFonts.plusJakartaSansTextTheme(baseTextTheme);

    return ThemeData(
      useMaterial3: true,
      brightness: Brightness.dark,
      scaffoldBackgroundColor: darkCanvasBackground,
      colorScheme: const ColorScheme(
        brightness: Brightness.dark,
        primary: primaryBlue,
        onPrimary: Colors.white,
        secondary: tealAccent,
        onSecondary: Colors.white,
        error: darkErrorText,
        onError: Colors.white,
        surface: darkCardSurface,
        onSurface: darkTextPrimary,
      ),
      textTheme: plusJakartaTheme.apply(
        bodyColor: darkTextPrimary,
        displayColor: darkTextPrimary,
      ),
      appBarTheme: const AppBarTheme(
        backgroundColor: darkCardSurface,
        foregroundColor: darkTextPrimary,
        elevation: 0,
        centerTitle: false,
        scrolledUnderElevation: 1,
        titleTextStyle: TextStyle(
          color: darkTextPrimary,
          fontSize: 20,
          fontWeight: FontWeight.w700,
          letterSpacing: -0.3,
        ),
      ),
      cardTheme: CardThemeData(
        color: darkCardSurface,
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(22),
          side: const BorderSide(color: darkCardBorder, width: 1),
        ),
        margin: EdgeInsets.zero,
      ),
      elevatedButtonTheme: ElevatedButtonThemeData(
        style: ElevatedButton.styleFrom(
          elevation: 0,
          backgroundColor: primaryBlue,
          foregroundColor: Colors.white,
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(27),
          ),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
      outlinedButtonTheme: OutlinedButtonThemeData(
        style: OutlinedButton.styleFrom(
          padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 14),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(27),
          ),
          side: const BorderSide(color: darkCardBorder),
          textStyle: GoogleFonts.plusJakartaSans(
            fontSize: 15,
            fontWeight: FontWeight.w600,
          ),
        ),
      ),
      inputDecorationTheme: InputDecorationTheme(
        filled: true,
        fillColor: darkCardSurface,
        contentPadding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: darkCardBorder),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: darkCardBorder),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: primaryBlue, width: 1.5),
        ),
        errorBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(18),
          borderSide: const BorderSide(color: darkErrorText),
        ),
        labelStyle: const TextStyle(color: darkTextSecondary, fontSize: 14),
        hintStyle: const TextStyle(color: darkTextMuted, fontSize: 14),
      ),
    );
  }
}
