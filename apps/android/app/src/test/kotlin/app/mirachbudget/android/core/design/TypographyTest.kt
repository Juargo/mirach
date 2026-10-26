package app.mirachbudget.android.core.design

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
}
