package app.mirachbudget.android.core.design

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import org.junit.Assert.assertEquals
import org.junit.Test

/** Inter is the only family (decision D2): every Material text style uses it. */
class TypographyTest {
    @Test
    fun everyMaterialTextStyleUsesInter() {
        val t = MirachTypography
        val styles = listOf(
            t.displayLarge, t.displayMedium, t.displaySmall,
            t.headlineLarge, t.headlineMedium, t.headlineSmall,
            t.titleLarge, t.titleMedium, t.titleSmall,
            t.bodyLarge, t.bodyMedium, t.bodySmall,
            t.labelLarge, t.labelMedium, t.labelSmall,
        )
        styles.forEach { assertEquals(InterFontFamily, it.fontFamily) }
    }

    @Test
    fun generatedTextStylesUseInterWithTheTokenSizeAndLineHeight() {
        val s = MirachTextStyles
        val expected = listOf(
            Triple(s.titulo, 28, 34), Triple(s.numeroGrande, 40, 44), Triple(s.cuerpo, 16, 24),
            Triple(s.cuerpoDestacado, 16, 24), Triple(s.boton, 16, 20), Triple(s.etiqueta, 13, 16), Triple(s.mini, 11, 14),
        )
        expected.forEach { (style, size, line) ->
            assertEquals(InterFontFamily, style.fontFamily)
            assertEquals(size.sp, style.fontSize)
            assertEquals(line.sp, style.lineHeight)
        }
        assertEquals(FontWeight.SemiBold, s.titulo.fontWeight)
        assertEquals(FontWeight.Normal, s.cuerpo.fontWeight)
        assertEquals(FontWeight.Medium, s.etiqueta.fontWeight)
    }
}
