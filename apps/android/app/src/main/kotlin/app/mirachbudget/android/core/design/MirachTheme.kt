package app.mirachbudget.android.core.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.foundation.shape.RoundedCornerShape

private val LocalMirachPalette = staticCompositionLocalOf { MirachPalettes.light }

/** Accessor for the full Mirach palette: `MirachTheme.colors.bucket.gustos`. */
object MirachTheme {
    val colors: MirachPalette
        @Composable
        @ReadOnlyComposable
        get() = LocalMirachPalette.current
}

/** Maps the tokens that have a Material 3 role; everything else stays reachable via [MirachTheme.colors]. */
fun MirachPalette.toMaterialColorScheme(dark: Boolean): ColorScheme {
    val b = base
    return if (dark) {
        darkColorScheme(
            primary = b.primary, onPrimary = b.primaryForeground,
            secondary = b.accent, onSecondary = b.accentForeground,
            background = b.background, onBackground = b.foreground,
            surface = b.card, onSurface = b.cardForeground,
            surfaceVariant = b.accent, onSurfaceVariant = b.mutedForeground,
            error = b.destructive, onError = b.primaryForeground,
            outline = b.input, outlineVariant = b.border,
        )
    } else {
        lightColorScheme(
            primary = b.primary, onPrimary = b.primaryForeground,
            secondary = b.accent, onSecondary = b.accentForeground,
            background = b.background, onBackground = b.foreground,
            surface = b.card, onSurface = b.cardForeground,
            surfaceVariant = b.accent, onSurfaceVariant = b.mutedForeground,
            error = b.destructive, onError = b.primaryForeground,
            outline = b.input, outlineVariant = b.border,
        )
    }
}

/** Light/dark follows the system. Corners are square (`radius.base`). */
@Composable
fun MirachTheme(darkTheme: Boolean = isSystemInDarkTheme(), content: @Composable () -> Unit) {
    val palette = if (darkTheme) MirachPalettes.dark else MirachPalettes.light
    val square = RoundedCornerShape(MirachRadius.base)
    CompositionLocalProvider(LocalMirachPalette provides palette) {
        MaterialTheme(
            colorScheme = palette.toMaterialColorScheme(darkTheme),
            shapes = Shapes(square, square, square, square, square),
            content = content,
        )
    }
}
