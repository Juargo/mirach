package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.row
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewRefresh
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The display rules the Compose screens use, kept out of the composables so they can be tested. */
class SubirCartolaDisplayTest {
    @Test
    fun rowAccessibilityLabelReadsDescriptionSpokenAmountDateAndDetail() {
        val label = SubirCartolaDisplay.rowAccessibilityLabel(row(0, cargo = 25_990, descripcion = "LIDER"), "Necesidades · Supermercado")
        assertEquals("LIDER. Gasto de $25.990. 5 ene. Necesidades · Supermercado", label)
    }

    @Test
    fun rowSummaryDetailIsDateAndSignedAmount() {
        assertEquals("5 ene · -$1.000", SubirCartolaDisplay.rowSummaryDetail(row(0)))
        assertEquals("5 ene · +$500.000", SubirCartolaDisplay.rowSummaryDetail(row(3, cargo = 0, abono = 500_000)))
    }

    @Test
    fun aRowOpensThePickerOnlyWhenEditableWithACatalogAndNoRefreshRunning() {
        assertTrue(SubirCartolaDisplay.canEdit(row(0), catalogLoaded = true, refresh = PreviewRefresh.Idle))
        assertTrue(SubirCartolaDisplay.canEdit(row(0), catalogLoaded = true, refresh = PreviewRefresh.Failed("X")))
        assertFalse(SubirCartolaDisplay.canEdit(row(0), catalogLoaded = false, refresh = PreviewRefresh.Idle))
        assertFalse(SubirCartolaDisplay.canEdit(row(0), catalogLoaded = true, refresh = PreviewRefresh.Updating))
        assertFalse(SubirCartolaDisplay.canEdit(row(4, duplicado = true), catalogLoaded = true, refresh = PreviewRefresh.Idle))
        assertFalse(SubirCartolaDisplay.canEdit(row(3, cargo = 0, abono = 1), catalogLoaded = true, refresh = PreviewRefresh.Idle))
    }

    @Test
    fun initialPatternIsTheTrimmedDescriptionCappedAt200Characters() {
        assertEquals("LIDER", SubirCartolaDisplay.initialPattern("  LIDER  "))
        assertEquals(200, SubirCartolaDisplay.initialPattern("a".repeat(250)).length)
    }

    @Test
    fun theFormCreatesOnlyWithANameAndABucketAndWhileIdle() {
        assertTrue(SubirCartolaDisplay.canCreate("Café", Bucket.Deseos, isCreating = false))
        assertFalse(SubirCartolaDisplay.canCreate("   ", Bucket.Deseos, isCreating = false))
        assertFalse(SubirCartolaDisplay.canCreate("Café", null, isCreating = false))
        assertFalse(SubirCartolaDisplay.canCreate("Café", Bucket.Deseos, isCreating = true))
    }

    @Test
    fun theNewCategoryTrimsTheNameKeepsThePatternAndSendsNoIcon() {
        assertEquals(
            NuevaCategoria(nombre = "Café", bucket = Bucket.Deseos, patron = "STARBUCKS", icono = null),
            SubirCartolaDisplay.nuevaCategoria("  Café ", Bucket.Deseos, "STARBUCKS"),
        )
    }

    @Test
    fun fileLineJoinsNameAndSize() {
        assertEquals("cartola.pdf · 1,2 MB", SubirCartolaDisplay.fileLine("cartola.pdf", "1,2 MB"))
    }

    @Test
    fun consentHeadlineFitsAFirstConsentAndAConsentGivenAgain() {
        // The same screen comes back after a revocation (PRI-06), so it cannot say "primera".
        assertEquals("Antes de subir tu cartola", SubirCartolaMessages.CONSENT_TITLE)
    }
}
