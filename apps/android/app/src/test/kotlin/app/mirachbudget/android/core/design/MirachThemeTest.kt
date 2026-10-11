package app.mirachbudget.android.core.design

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class MirachThemeTest {
    @Test
    fun lightAndDarkPalettesDifferWhereTheTokensDo() {
        // design/tokens.json: bucket.deseos is #782c5c in light and #bb6c90 in dark.
        assertEquals(Color(0xFF782C5C), MirachPalettes.light.bucket.deseos)
        assertEquals(Color(0xFFBB6C90), MirachPalettes.dark.bucket.deseos)
        assertNotEquals(MirachPalettes.light.base.background, MirachPalettes.dark.base.background)
    }

    @Test
    fun materialSchemeIsDerivedFromTheTokensOfEachTheme() {
        val light = MirachPalettes.light.toMaterialColorScheme(dark = false)
        val dark = MirachPalettes.dark.toMaterialColorScheme(dark = true)
        assertEquals(MirachPalettes.light.base.primary, light.primary)
        assertEquals(MirachPalettes.dark.base.primary, dark.primary)
        assertEquals(MirachPalettes.light.base.background, light.background)
        assertEquals(MirachPalettes.dark.base.destructive, dark.error)
        assertNotEquals(light.background, dark.background)
    }
}
