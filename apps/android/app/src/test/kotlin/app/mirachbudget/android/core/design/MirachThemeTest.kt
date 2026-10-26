package app.mirachbudget.android.core.design

import androidx.compose.ui.graphics.Color
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

class MirachThemeTest {
    @Test
    fun lightAndDarkPalettesDifferWhereTheTokensDo() {
        // design/tokens.json (from Figma): bucket.gustos is #7b61a8 in light and #a891d6 in dark.
        assertEquals(Color(0xFF7B61A8), MirachPalettes.light.bucket.gustos)
        assertEquals(Color(0xFFA891D6), MirachPalettes.dark.bucket.gustos)
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
