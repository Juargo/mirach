package app.mirachbudget.android.core.design

import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/** The shared controls follow the Figma «Botón» (52dp tall) and keep the 48dp touch target. */
class ControlsTest {
    @Test
    fun buttonsAre52dpTallAndNeverBelowTheTouchTarget() {
        assertEquals(52.dp, ControlMetrics.buttonHeight)
        assertTrue(ControlMetrics.buttonHeight >= 48.dp)
    }

    @Test
    fun buttonsAndFieldsUseSquareCorners() {
        assertEquals(MirachRadius.base, ControlMetrics.cornerRadius)
        assertEquals(0.dp, ControlMetrics.cornerRadius)
    }
}
