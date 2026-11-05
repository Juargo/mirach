package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.features.subircartola.ReviewPresentation.Classification
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.catalogo
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.row
import app.mirachbudget.android.features.subircartola.SubirCartolaSamples.sugerencia
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class ReviewPresentationTest {
    @Test
    fun `only a new expense-like row is editable`() {
        assertTrue(row(0).isEditable)
        assertFalse("duplicate", row(1, duplicado = true).isEditable)
        assertFalse("income (IMP-21)", row(2, cargo = 0, abono = 1_000).isEditable)
        assertTrue("credit with a debit is not an income", row(3, cargo = 500, abono = 1_000).isEditable)
        assertTrue(row(2, cargo = 0, abono = 1_000).esIngreso)
        assertFalse(row(3, cargo = 500, abono = 1_000).esIngreso)
    }

    @Test
    fun `the edit wins over the suggestion`() {
        val classification = ReviewPresentation.classification(row(0), edit = "cat-resto", catalog = catalogo)

        assertEquals(Classification(Bucket.Deseos, "Restaurantes"), classification)
        assertEquals("Gustos · Restaurantes", classification.text)
    }

    @Test
    fun `a row with no suggestion or no category is unknown, and an unlisted id keeps its bucket`() {
        assertEquals(
            Classification(Bucket.Deseos, "Desconocido"),
            ReviewPresentation.classification(row(0, sugerido = null), edit = null, catalog = catalogo),
        )
        assertEquals(
            Classification(Bucket.Ahorro, "Desconocido"),
            ReviewPresentation.classification(row(0, sugerido = sugerencia(Bucket.Ahorro, null)), edit = null, catalog = catalogo),
        )
        assertEquals(
            Classification(Bucket.Necesidades, "Otra categoría"),
            ReviewPresentation.classification(
                row(0, sugerido = sugerencia(Bucket.Necesidades, "cat-gone")),
                edit = null,
                catalog = catalogo,
            ),
        )
        assertEquals(
            Classification(Bucket.Necesidades, "Supermercado"),
            ReviewPresentation.classification(row(0), edit = null, catalog = catalogo),
        )
    }

    @Test
    fun `sections go by bucket and catalog order, then incomes, then already loaded rows`() {
        val rows = listOf(
            row(7, duplicado = true),
            row(6, cargo = 0, abono = 900),
            row(5, sugerido = sugerencia(Bucket.Ahorro, "cat-fondo")),
            row(4, sugerido = null),
            row(3),
            row(2, sugerido = sugerencia(Bucket.Necesidades, "cat-arriendo")),
            row(1),
            row(0, sugerido = sugerencia(Bucket.Deseos, "cat-resto")),
        )

        val sections = ReviewPresentation.sections(rows, edits = mapOf(4 to "cat-super"), catalog = catalogo)

        assertEquals(
            listOf(
                "Necesidades · Arriendo",
                "Necesidades · Supermercado",
                "Gustos · Restaurantes",
                "Ahorro · Fondo",
                "Ingreso",
                "Ya cargados",
            ),
            sections.map { it.title },
        )
        assertEquals(listOf(listOf(2), listOf(1, 3, 4), listOf(0), listOf(5), listOf(6), listOf(7)), sections.map { s ->
            s.rows.map { it.rowIndex }
        })
        assertEquals(listOf(Bucket.Necesidades, Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro, null, null), sections.map { it.bucket })
        assertEquals(listOf("ingresos", "duplicados"), sections.takeLast(2).map { it.id })
    }

    @Test
    fun `an unknown category goes after the known ones of its bucket`() {
        val rows = listOf(row(0, sugerido = null), row(1, sugerido = sugerencia(Bucket.Deseos, "cat-resto")))

        val sections = ReviewPresentation.sections(rows, edits = emptyMap(), catalog = catalogo)

        assertEquals(listOf("Gustos · Restaurantes", "Gustos · Desconocido"), sections.map { it.title })
    }

    @Test
    fun `amounts and row details read as on iOS`() {
        assertEquals("-$25.990", row(0, cargo = 25_990).amountText)
        assertEquals("+$1.200.000", row(0, cargo = 0, abono = 1_200_000).amountText)
        assertEquals("Gasto de $25.990", row(0, cargo = 25_990).spokenAmount)
        assertEquals("Ingreso de $1.200.000", row(0, cargo = 0, abono = 1_200_000).spokenAmount)
        assertEquals("Sin monto", row(0, cargo = 0, abono = 0).spokenAmount)

        val classification = Classification(Bucket.Necesidades, "Supermercado")
        assertEquals("Ya cargado, no se puede editar", ReviewPresentation.rowDetail(row(0, duplicado = true), classification, false))
        assertEquals("Ingreso, no se puede editar", ReviewPresentation.rowDetail(row(0, cargo = 0, abono = 5), classification, false))
        assertEquals("Necesidades · Supermercado", ReviewPresentation.rowDetail(row(0), classification, false))
        assertEquals("Necesidades · Supermercado, editada", ReviewPresentation.rowDetail(row(0), classification, true))
    }
}
