package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.ClasificacionPreview
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.preview
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** Screen 04's classification accordion: pure presentation over `CartolaPreview.clasificacion`. */
class PreviewSummaryPresentationTest {
    private fun summary(desconocidos: Int) = ClasificacionPreview(ClasificacionPreview.Ingresos(0, 0), emptyList(), desconocidos)

    // --- rows of a category

    @Test
    fun `the rows of a category are looked up by rowIndex in order`() {
        val category = ClasificacionPreview.Categoria("c", "X", 2, 1, listOf(2, 0))

        assertEquals(listOf(0, 2), PreviewSummaryPresentation.rows(category, preview()).map { it.rowIndex })
    }

    @Test
    fun `a rowIndex the preview does not have is skipped`() {
        val category = ClasificacionPreview.Categoria("c", "X", 2, 1, listOf(1, 99))

        assertEquals(listOf(1), PreviewSummaryPresentation.rows(category, preview()).map { it.rowIndex })
    }

    @Test
    fun `the income rows are the non-duplicate rows with abono only`() {
        assertEquals(listOf(3), PreviewSummaryPresentation.incomeRows(preview()).map { it.rowIndex })
    }

    // --- the unknowns line and the button order

    @Test
    fun `zero unknowns says everything was classified and keeps upload as primary`() {
        assertEquals("Todos los movimientos quedaron clasificados.", PreviewSummaryPresentation.unknownsMessage(summary(0)))
        assertFalse(PreviewSummaryPresentation.reviewIsPrimary(summary(0)))
    }

    @Test
    fun `one unknown is singular and makes review primary`() {
        assertEquals("1 movimiento quedó en Desconocido", PreviewSummaryPresentation.unknownsMessage(summary(1)))
        assertTrue(PreviewSummaryPresentation.reviewIsPrimary(summary(1)))
    }

    @Test
    fun `several unknowns are plural`() {
        assertEquals("3 movimientos quedaron en Desconocido", PreviewSummaryPresentation.unknownsMessage(summary(3)))
    }

    // --- counts and titles

    @Test
    fun `counts read as movements`() {
        assertEquals("1 movimiento", PreviewSummaryPresentation.countText(1))
        assertEquals("4 movimientos", PreviewSummaryPresentation.countText(4))
    }

    @Test
    fun `a bucket group is named with the product label and spoken with its total`() {
        val group = ClasificacionPreview.BucketGroup(Bucket.Deseos, 2, 28_490, emptyList())

        assertEquals("Gustos", PreviewSummaryPresentation.title(group))
        assertEquals("Gustos. 2 movimientos. Gasto de $28.490", PreviewSummaryPresentation.spokenSummary(group))
    }

    @Test
    fun `the income header speaks its total`() {
        val ingresos = ClasificacionPreview.Ingresos(1, 1_200_000)

        assertEquals("Ingresos. 1 movimiento. Ingreso de $1.200.000", PreviewSummaryPresentation.spokenSummary(ingresos))
    }

    @Test
    fun `a category speaks its name, count and total`() {
        val category = ClasificacionPreview.Categoria("c", "Supermercado", 1, 25_990, listOf(0))

        assertEquals("Supermercado. 1 movimiento. Gasto de $25.990", PreviewSummaryPresentation.spokenSummary(category))
    }
}
