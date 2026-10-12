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
    val popover: Color,
    val popoverForeground: Color,
    val primary: Color,
    val primaryForeground: Color,
    val secondary: Color,
    val secondaryForeground: Color,
    val muted: Color,
    val mutedForeground: Color,
    val accent: Color,
    val accentForeground: Color,
    val destructive: Color,
    val border: Color,
    val input: Color,
    val ring: Color,
)

@Immutable
class BucketColors(
    val necesidades: Color,
    val deseos: Color,
    val ahorro: Color,
    val exceso: Color,
    val sinCategoria: Color,
)

@Immutable
class PieColors(
    val labelNecesidades: Color,
    val labelDeseos: Color,
    val labelAhorro: Color,
    val labelSinCategoria: Color,
    val separator: Color,
)

@Immutable
class IngresoColors(
    val fill: Color,
    val text: Color,
)

@Immutable
class SemaforoColors(
    val verdeFill: Color,
    val verdeInk: Color,
    val verdeBand: Color,
    val amarilloFill: Color,
    val amarilloInk: Color,
    val amarilloBand: Color,
    val rojoFill: Color,
    val rojoInk: Color,
    val rojoBand: Color,
    val sinDatosInk: Color,
)

@Immutable
class FeedbackColors(
    val warningFill: Color,
    val warningBorder: Color,
    val warningInk: Color,
    val warningAccent: Color,
    val successText: Color,
    val expenseText: Color,
    val errorText: Color,
    val linkActiveFill: Color,
    val linkActiveInk: Color,
)

/** Every Mirach color for one theme. Use: `MirachTheme.colors.bucket.deseos`. */
@Immutable
class MirachPalette(
    val base: BaseColors,
    val bucket: BucketColors,
    val pie: PieColors,
    val ingreso: IngresoColors,
    val semaforo: SemaforoColors,
    val feedback: FeedbackColors,
)

object MirachPalettes {
    val light = MirachPalette(
        base = BaseColors(
            background = Color(0xFFEDF0F5),
            foreground = Color(0xFF2A2F3A),
            card = Color(0xFFF9FAFC),
            cardForeground = Color(0xFF2A2F3A),
            popover = Color(0xFFF9FAFC),
            popoverForeground = Color(0xFF2A2F3A),
            primary = Color(0xFF1D5FA8),
            primaryForeground = Color(0xFFFFFFFF),
            secondary = Color(0xFF4F4A6B),
            secondaryForeground = Color(0xFFFFFFFF),
            muted = Color(0xFFE3E7EE),
            mutedForeground = Color(0xFF5A6270),
            accent = Color(0xFFDCE1EA),
            accentForeground = Color(0xFF2A2F3A),
            destructive = Color(0xFFC1121F),
            border = Color(0xFFB6BECC),
            input = Color(0xFF7C8798),
            ring = Color(0xFF1D5FA8),
        ),
        bucket = BucketColors(
            necesidades = Color(0xFF4369A2),
            deseos = Color(0xFF782C5C),
            ahorro = Color(0xFF049A78),
            exceso = Color(0xFFC2410C),
            sinCategoria = Color(0xFF2B2E32),
        ),
        pie = PieColors(
            labelNecesidades = Color(0xFFFFFFFF),
            labelDeseos = Color(0xFFFFFFFF),
            labelAhorro = Color(0xFF0F1F1A),
            labelSinCategoria = Color(0xFFFFFFFF),
            separator = Color(0xFFFAFBFD),
        ),
        ingreso = IngresoColors(
            fill = Color(0xFFDCFCE7),
            text = Color(0xFF0F6B4A),
        ),
        semaforo = SemaforoColors(
            verdeFill = Color(0xFFDCFCE7),
            verdeInk = Color(0xFF0F6B4A),
            verdeBand = Color(0xFF0F6B4A),
            amarilloFill = Color(0xFFF3E4C0),
            amarilloInk = Color(0xFF8A5000),
            amarilloBand = Color(0xFF8A5000),
            rojoFill = Color(0xFFF8DCE3),
            rojoInk = Color(0xFFB4143C),
            rojoBand = Color(0xFFB4143C),
            sinDatosInk = Color(0xFF5A6270),
        ),
        feedback = FeedbackColors(
            warningFill = Color(0xFFF5E7C4),
            warningBorder = Color(0xFFB5760A),
            warningInk = Color(0xFF8A5000),
            warningAccent = Color(0xFFEEDBA8),
            successText = Color(0xFF0F6B4A),
            expenseText = Color(0xFFB4143C),
            errorText = Color(0xFFB4143C),
            linkActiveFill = Color(0xFFDCFCE7),
            linkActiveInk = Color(0xFF0F6B4A),
        ),
    )

    val dark = MirachPalette(
        base = BaseColors(
            background = Color(0xFF1A1917),
            foreground = Color(0xFFD5D0C6),
            card = Color(0xFF22211E),
            cardForeground = Color(0xFFD5D0C6),
            popover = Color(0xFF22211E),
            popoverForeground = Color(0xFFD5D0C6),
            primary = Color(0xFF6FB8BE),
            primaryForeground = Color(0xFF1A1917),
            secondary = Color(0xFFB0A893),
            secondaryForeground = Color(0xFF1A1917),
            muted = Color(0xFF2A2825),
            mutedForeground = Color(0xFF9A9488),
            accent = Color(0xFF302E2A),
            accentForeground = Color(0xFFD5D0C6),
            destructive = Color(0xFFBE4E43),
            border = Color(0xFF3F3B34),
            input = Color(0xFF7A7362),
            ring = Color(0xFF8FCDD2),
        ),
        bucket = BucketColors(
            necesidades = Color(0xFF77A7E5),
            deseos = Color(0xFFBB6C90),
            ahorro = Color(0xFF47DAB4),
            exceso = Color(0xFFBF9350),
            sinCategoria = Color(0xFF696C63),
        ),
        pie = PieColors(
            labelNecesidades = Color(0xFF1A1C1C),
            labelDeseos = Color(0xFF1A1C1C),
            labelAhorro = Color(0xFF1A1C1C),
            labelSinCategoria = Color(0xFFF0EEE9),
            separator = Color(0xFF100F0D),
        ),
        ingreso = IngresoColors(
            fill = Color(0xFF202A1E),
            text = Color(0xFF7FB77E),
        ),
        semaforo = SemaforoColors(
            verdeFill = Color(0xFF202A1E),
            verdeInk = Color(0xFF7FB77E),
            verdeBand = Color(0xFF7FB77E),
            amarilloFill = Color(0xFF2B2313),
            amarilloInk = Color(0xFFD9A44C),
            amarilloBand = Color(0xFFD9A44C),
            rojoFill = Color(0xFF2B1F1D),
            rojoInk = Color(0xFFD97A72),
            rojoBand = Color(0xFFD97A72),
            sinDatosInk = Color(0xFF9A9488),
        ),
        feedback = FeedbackColors(
            warningFill = Color(0xFF2B2210),
            warningBorder = Color(0xFF8A6A2E),
            warningInk = Color(0xFFD9A44C),
            warningAccent = Color(0xFF332813),
            successText = Color(0xFF7FB77E),
            expenseText = Color(0xFFD97A72),
            errorText = Color(0xFFD97A72),
            linkActiveFill = Color(0xFF202A1E),
            linkActiveInk = Color(0xFF7FB77E),
        ),
    )
}

// endregion

// region Copy

/** User-facing labels from `copy.*` in tokens.json. The 30% bucket is "Deseos". */
object MirachCopy {
    object Bucket {
        const val necesidades = "Necesidades"
        const val deseos = "Deseos"
        const val ahorro = "Ahorro"
        const val ingreso = "Ingreso"
    }
    object Semaforo {
        const val verde = "Muy Saludable"
        const val amarillo = "Saludable"
        const val rojo = "En peligro"
        const val sinDatos = "Sin datos"
    }
}

// endregion

// region Typography

/** Font family names from `typography.font-family`, in fallback order. Fonts are not bundled yet. */
object MirachFont {
    val sans: List<String> = listOf("Inter Variable", "system-ui", "Segoe UI", "Roboto", "sans-serif")
    val mono: List<String> = listOf("Geist Mono Variable", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace")

    /** OpenType feature required for figures (`typography.figure-features`). */
    const val figureFeatures = "tnum"
}

/** Rule "figures use tabular digits": amounts, dates and counts align in columns. */
fun TextStyle.mirachFigures(): TextStyle = copy(fontFeatureSettings = "tnum")

// endregion

// region Radius

/** Corner radii from `radius.*`. The base is square; `maxAllowed` is a ceiling, not a default. */
object MirachRadius {
    val base: Dp = 0.dp
    val maxAllowed: Dp = 2.dp
}

// endregion
