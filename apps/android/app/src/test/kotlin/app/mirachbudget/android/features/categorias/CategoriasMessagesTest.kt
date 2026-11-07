package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.CoincidenciaPatron
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronException
import app.mirachbudget.android.features.categorias.CategoriasSamples.catorceOctubre
import app.mirachbudget.android.features.categorias.CategoriasSamples.octubre
import app.mirachbudget.android.features.categorias.CategoriasSamples.supermercado
import app.mirachbudget.android.features.categorias.CategoriasSamples.vacia
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.BucketChange
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternConflict
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Test

/** The copy of both screens, verbatim from iOS `CategoriasPresentationTests` and `DetalleCategoriaViewModelTests`. */
class CategoriasMessagesTest {
    private fun category(movements: Int, patterns: Int, isSystem: Boolean = false) = CategoriaCatalogo(
        id = "c", nombre = "Supermercado", bucket = Bucket.Necesidades, icono = null, transaccionesCount = movements, esInterna = isSystem,
        patrones = (0 until patterns).map { PatronCategoria(id = "p$it", patron = "x$it", matchType = "CONTAINS") },
    )

    @Test
    fun theCountsUseTheSingularAndThePluralOfBothNouns() {
        assertEquals("12 movimientos · 2 patrones", CategoriasMessages.counts(category(12, 2)))
        assertEquals("1 movimiento · 1 patrón", CategoriasMessages.counts(category(1, 1)))
        assertEquals("0 movimientos · 0 patrones", CategoriasMessages.counts(category(0, 0)))
    }

    @Test
    fun theSpokenRowNamesTheCategoryItsCountsAndThatItIsASystemOne() {
        assertEquals("Supermercado. 12 movimientos. 2 patrones", CategoriasMessages.rowLabel(category(12, 2)))
        assertEquals("Supermercado. 0 movimientos. 0 patrones. Categoría del sistema", CategoriasMessages.rowLabel(category(0, 0, isSystem = true)))
    }

    @Test
    fun theBucketChangeSentenceNamesTheMovementsAndSoftensTheZeroCase() {
        assertEquals(
            "12 movimientos pasarán de Gustos a Necesidades en todos los meses.",
            DetalleCategoriaMessages.bucketChange(BucketChange(12, Bucket.Deseos, Bucket.Necesidades)),
        )
        assertEquals("1 movimiento pasará de Gustos a Ahorro en todos los meses.", DetalleCategoriaMessages.bucketChange(BucketChange(1, Bucket.Deseos, Bucket.Ahorro)))
        assertEquals(
            "Esta categoría todavía no tiene movimientos. Pasará de Gustos a Ahorro.",
            DetalleCategoriaMessages.bucketChange(BucketChange(0, Bucket.Deseos, Bucket.Ahorro)),
        )
    }

    @Test
    fun theDeletionSentenceNamesWhereTheMovementsGoAndWhatElseIsRemoved() {
        assertEquals(
            "Sus 12 movimientos pasarán a «Desconocido» de Necesidades. También se eliminarán sus 2 patrones. Esta acción no se puede deshacer.",
            DetalleCategoriaMessages.deletion(supermercado),
        )
        val one = CategoriaCatalogo(
            id = "x", nombre = "X", bucket = Bucket.Deseos, icono = null, transaccionesCount = 1,
            patrones = listOf(PatronCategoria(id = "p", patron = "a", matchType = "CONTAINS")),
        )
        assertEquals(
            "Su movimiento pasará a «Desconocido» de Gustos. También se eliminará su patrón. Esta acción no se puede deshacer.",
            DetalleCategoriaMessages.deletion(one),
        )
        assertEquals("No tiene movimientos. Esta acción no se puede deshacer.", DetalleCategoriaMessages.deletion(vacia))
    }

    @Test
    fun theThreeMatchTypesHaveTheirOwnLabelAndAnUnknownOneShowsAsItCame() {
        assertEquals(
            listOf("Contiene", "Empieza con", "Expresión regular", "ENDS_WITH"),
            listOf("CONTAINS", "STARTS_WITH", "REGEX", "ENDS_WITH").map(DetalleCategoriaMessages::matchType),
        )
    }

    @Test
    fun eachCategoryRejectionLandsOnItsField() {
        val errors = DetalleCategoriaMessages::categoryErrors
        assertEquals("El nombre debe tener entre 1 y 40 caracteres", errors(CategoriaException.InvalidName()).name)
        assertEquals("Ya tienes una categoría con ese nombre", errors(CategoriaException.DuplicateName()).name)
        assertEquals("Elige un grupo: Necesidades, Gustos o Ahorro", errors(CategoriaException.BucketNotAssignable()).bucket)
        assertEquals("Elige un ícono válido de la lista", errors(CategoriaException.InvalidIcon()).icon)
        assertEquals("Esta categoría es del sistema y no se puede editar ni eliminar", errors(CategoriaException.IsInternal()).general)
        assertEquals("Otra cosa", errors(CategoriaException.Rejected("Otra cosa")).general)
        assertEquals("No pudimos guardar los cambios. Revisa tu conexión e inténtalo de nuevo.", errors(IOException("offline")).general)
        assertEquals("No pudimos guardar los cambios. Inténtalo de nuevo.", errors(IllegalStateException()).general)
    }

    @Test
    fun eachPatternRejectionLandsOnItsField() {
        val errors = DetalleCategoriaMessages::patternErrors
        assertEquals("Escribe un texto válido para el patrón (de 1 a 200 caracteres)", errors(PatronException.InvalidPattern()).pattern)
        assertEquals("Esa expresión regular no es válida", errors(PatronException.InvalidRegex()).pattern)
        assertEquals("Ya tienes un patrón con ese texto", errors(PatronException.Duplicate()).pattern)
        assertEquals("Ya tienes un patrón con ese texto", errors(PatronException.DuplicateOf(CategoriasSamples.aqui)).pattern)
        assertEquals("Ese tipo de coincidencia no es válido", errors(PatronException.InvalidMatchType()).pattern)
        assertEquals("Otra cosa", errors(PatronException.Rejected("Otra cosa")).general)
        assertEquals("No pudimos guardar el patrón. Revisa tu conexión e inténtalo de nuevo.", errors(IOException("offline")).general)
        assertEquals("No pudimos guardar el patrón. Inténtalo de nuevo.", errors(IllegalStateException()).general)
    }

    @Test
    fun aFailedDeletionNamesWhatWasNotDeleted() {
        assertEquals("No pudimos eliminar la categoría. Revisa tu conexión e inténtalo de nuevo.", DetalleCategoriaMessages.deleteFailure(IOException(), "la categoría"))
        assertEquals("No pudimos eliminar el patrón. Inténtalo de nuevo.", DetalleCategoriaMessages.deleteFailure(IllegalStateException(), "el patrón"))
    }

    @Test
    fun thePreviewCopyCountsTheMonthsMovementsAndListsThem() {
        val row = CoincidenciaPatron(id = "t", descripcion = "SUPER ACUENTA ÑUÑOA", fecha = catorceOctubre, monto = 32_400)

        assertEquals("Coincide con 3 movimientos de octubre", DetalleCategoriaMessages.previewTitle(3, octubre))
        assertEquals("Coincide con 1 movimiento de octubre", DetalleCategoriaMessages.previewTitle(1, octubre))
        assertEquals("SUPER ACUENTA ÑUÑOA · 14 oct · -$32.400", DetalleCategoriaMessages.previewRow(row))
        assertEquals("SUPER ACUENTA ÑUÑOA. 14 oct. Gasto de $32.400", DetalleCategoriaMessages.previewRowLabel(row))
        assertEquals("Mover también estos 3 movimientos a Supermercado", DetalleCategoriaMessages.moveMatchesTitle(3, "Supermercado"))
        assertEquals("Mover también este movimiento a Supermercado", DetalleCategoriaMessages.moveMatchesTitle(1, "Supermercado"))
        assertEquals("Los que cambiaste a mano no se mueven. Las próximas cartolas usan el patrón siempre.", DetalleCategoriaMessages.MOVE_MATCHES_NOTE)
        assertEquals("Patrón guardado · 3 movidos", DetalleCategoriaMessages.patternSaved(3))
        assertEquals("Patrón guardado", DetalleCategoriaMessages.patternSaved(0))
    }

    @Test
    fun theConflictsCopyNamesBothCategoriesAndBuckets() {
        val conflict = PatternConflict(texto = "unimarc", existente = CategoriasSamples.aqui)
        val here = CategoriaCatalogo(id = "h", nombre = "Supermercado", bucket = Bucket.Deseos, icono = null)

        assertEquals("«unimarc» ya está en Supermercado (Necesidades)", DetalleCategoriaMessages.conflictTitle(conflict))
        assertEquals("Un texto solo puede estar en una categoría.", DetalleCategoriaMessages.CONFLICT_RULE)
        assertEquals(
            "Si lo mueves aquí, los próximos movimientos con «unimarc» contarán como gustos.",
            DetalleCategoriaMessages.conflictConsequence(conflict, here),
        )
        assertEquals("Moverlo a Supermercado (Gustos)", DetalleCategoriaMessages.moveHere(here))
    }

    @Test
    fun theNameFooterCountsTheMovementsOfTheWholeHistory() {
        assertEquals("12 movimientos en total", DetalleCategoriaMessages.nameFooter(supermercado))
        assertEquals("1 movimiento en total", DetalleCategoriaMessages.nameFooter(supermercado.copy(transaccionesCount = 1)))
    }
}
