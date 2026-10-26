// GENERATED FILE. DO NOT EDIT.
// Source: design/tokens.json. Regenerate with: apps/android/scripts/generate-tokens.sh
// CI fails when this file is out of date (see the `android` job in .github/workflows/ci.yml).

package app.mirachbudget.android.core.design

import androidx.compose.runtime.Immutable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// region Colors

@Immutable
class BaseColors(
    val background: Color,
    val foreground: Color,
    val card: Color,
    val cardForeground: Color,
    val primary: Color,
    val primaryForeground: Color,
    val mutedForeground: Color,
    val accent: Color,
    val accentForeground: Color,
    val destructive: Color,
    val border: Color,
    val input: Color,
)

@Immutable
class BucketColors(
    val necesidades: Color,
    val gustos: Color,
    val ahorro: Color,
    val ahorroText: Color,
)

@Immutable
class EstadoColors(
    val bien: Color,
    val cerca: Color,
    val sobre: Color,
    val bienText: Color,
    val cercaText: Color,
)

@Immutable
class FeedbackColors(
    val errorText: Color,
    val successText: Color,
    val expenseText: Color,
)

@Immutable
class IngresoColors(
    val text: Color,
)

/** Every Mirach color for one theme. Use: `MirachTheme.colors.bucket.gustos`. */
@Immutable
class MirachPalette(
    val base: BaseColors,
    val bucket: BucketColors,
    val estado: EstadoColors,
    val feedback: FeedbackColors,
    val ingreso: IngresoColors,
)

object MirachPalettes {
    val light = MirachPalette(
        base = BaseColors(
            background = Color(0xFFFFFFFF),
            foreground = Color(0xFF1A1C23),
            card = Color(0xFFF6F7F8),
            cardForeground = Color(0xFF1A1C23),
            primary = Color(0xFF1A1C23),
            primaryForeground = Color(0xFFFFFFFF),
            mutedForeground = Color(0xFF6B7080),
            accent = Color(0xFFF6F7F8),
            accentForeground = Color(0xFF1A1C23),
            destructive = Color(0xFFC0392B),
            border = Color(0xFFE1E3E8),
            input = Color(0xFF8A8F9C),
        ),
        bucket = BucketColors(
            necesidades = Color(0xFF3C5A80),
            gustos = Color(0xFF7B61A8),
            ahorro = Color(0xFF009B7D),
            ahorroText = Color(0xFF007F66),
        ),
        estado = EstadoColors(
            bien = Color(0xFF1F8A4C),
            cerca = Color(0xFFB7791F),
            sobre = Color(0xFFC0392B),
            bienText = Color(0xFF1D8046),
            cercaText = Color(0xFF98651A),
        ),
        feedback = FeedbackColors(
            errorText = Color(0xFFC0392B),
            successText = Color(0xFF1D8046),
            expenseText = Color(0xFF1A1C23),
        ),
        ingreso = IngresoColors(
            text = Color(0xFF1D8046),
        ),
    )

    val dark = MirachPalette(
        base = BaseColors(
            background = Color(0xFF1C1E24),
            foreground = Color(0xFFECEDF0),
            card = Color(0xFF262930),
            cardForeground = Color(0xFFECEDF0),
            primary = Color(0xFFECEDF0),
            primaryForeground = Color(0xFF1C1E24),
            mutedForeground = Color(0xFFA3A8B5),
            accent = Color(0xFF262930),
            accentForeground = Color(0xFFECEDF0),
            destructive = Color(0xFFF0786B),
            border = Color(0xFF41454F),
            input = Color(0xFF6F7484),
        ),
        bucket = BucketColors(
            necesidades = Color(0xFF7F9FCB),
            gustos = Color(0xFFA891D6),
            ahorro = Color(0xFF2FBF9A),
            ahorroText = Color(0xFF4FD0AD),
        ),
        estado = EstadoColors(
            bien = Color(0xFF4FBF7F),
            cerca = Color(0xFFE2A64E),
            sobre = Color(0xFFF0786B),
            bienText = Color(0xFF5FCA8B),
            cercaText = Color(0xFFE8B462),
        ),
        feedback = FeedbackColors(
            errorText = Color(0xFFF0786B),
            successText = Color(0xFF5FCA8B),
            expenseText = Color(0xFFECEDF0),
        ),
        ingreso = IngresoColors(
            text = Color(0xFF5FCA8B),
        ),
    )
}

// endregion

// region Copy

/** User-facing labels from `copy.*` in tokens.json. The 30% bucket is "Gustos". */
object MirachCopy {
    object Bucket {
        const val necesidades = "Necesidades"
        const val gustos = "Gustos"
        const val ahorro = "Ahorro"
        const val ingreso = "Ingreso"
    }
    object Estado {
        const val bien = "Bien"
        const val cerca = "Cerca"
        const val sobre = "Sobre"
        const val sinDatos = "Sin datos"
    }
}

// endregion

// region Typography

/** Font family names from `typography.font-family`, in fallback order. Inter is bundled (see MirachTypography.kt). */
object MirachFont {
    val sans: List<String> = listOf("Inter", "system-ui")

    /** OpenType feature required for figures (`typography.figure-features`). */
    const val figureFeatures = "tnum"
}

/** Rule "figures use tabular digits": amounts, dates and counts align in columns. */
fun TextStyle.mirachFigures(): TextStyle = copy(fontFeatureSettings = "tnum")

// endregion

// region Radius

/** Corner radii from `radius.*`. Corners are square. */
object MirachRadius {
    val base: Dp = 0.dp
}

// endregion

// region Spacing

/** Spacing scale from `spacing.*`, in dp. */
object MirachSpacing {
    val xs: Dp = 4.dp
    val s: Dp = 8.dp
    val m: Dp = 16.dp
    val l: Dp = 24.dp
    val xl: Dp = 32.dp
}

// endregion
