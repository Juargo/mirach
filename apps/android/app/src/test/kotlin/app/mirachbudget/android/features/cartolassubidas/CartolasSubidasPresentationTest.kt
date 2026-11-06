package app.mirachbudget.android.features.cartolassubidas

import app.mirachbudget.android.core.networking.CartolaSubida
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.fallida
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.procesada
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.unMovimiento
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Message
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class CartolasSubidasPresentationTest {
    @Test
    fun anUnresolvedBankReadsAsNotIdentified() {
        assertEquals("Banco no identificado", CartolasSubidasMessages.banco(fallida))
        assertEquals("Banco de Chile", CartolasSubidasMessages.banco(procesada))
    }

    @Test
    fun theStatusIsAWordNeverOnlyAColor() {
        assertEquals("Procesada", CartolasSubidasMessages.estado(procesada))
        assertEquals("Fallida", CartolasSubidasMessages.estado(fallida))
    }

    @Test
    fun countsMovementsInTheSingularToo() {
        assertEquals("37 movimientos", CartolasSubidasMessages.movimientos(procesada))
        assertEquals("1 movimiento", CartolasSubidasMessages.movimientos(unMovimiento))
        // A failed import has no movements to count.
        assertNull(CartolasSubidasMessages.movimientos(fallida))
    }

    @Test
    fun theReasonIsShownOnlyForAFailedImportThatHasOne() {
        assertEquals("No se reconoció el formato del archivo", CartolasSubidasMessages.motivo(fallida))
        assertNull(CartolasSubidasMessages.motivo(procesada))
        assertNull(CartolasSubidasMessages.motivo(fallida.copy(motivoFallo = "")))
    }

    @Test
    fun confirmationNamesTheConsequenceOfDeletingAProcessedImport() {
        assertEquals(
            "Se eliminarán 37 movimientos de Banco de Chile (3 oct). Esta acción no se puede deshacer.",
            CartolasSubidasMessages.confirmation(procesada),
        )
        assertEquals(
            "Se eliminará 1 movimiento de BancoEstado (2 sep). Esta acción no se puede deshacer.",
            CartolasSubidasMessages.confirmation(unMovimiento),
        )
    }

    @Test
    fun confirmationForAFailedImportDoesNotPromiseMovements() {
        assertEquals(
            "Se eliminará esta cartola fallida de Banco no identificado (2 oct).",
            CartolasSubidasMessages.confirmation(fallida),
        )
    }

    @Test
    fun talkBackReadsBankFileDateStatusAndCountOrReason() {
        assertEquals(
            "Banco de Chile. cartola-septiembre.xlsx. 3 oct. Procesada. 37 movimientos",
            CartolasSubidasMessages.rowLabel(procesada),
        )
        assertEquals(
            "Banco no identificado. estado-de-cuenta.pdf. 2 oct. Fallida. Motivo: No se reconoció el formato del archivo",
            CartolasSubidasMessages.rowLabel(fallida),
        )
    }

    @Test
    fun aFailedImportWithoutAReasonStillReadsAsFailed() {
        val bare = CartolaSubida("g-9", null, "x.pdf", CartolaSubida.Estado.Fallida, null, fallida.fecha, 0)
        assertEquals("Banco no identificado. x.pdf. 2 oct. Fallida", CartolasSubidasMessages.rowLabel(bare))
    }

    @Test
    fun theDeleteButtonNamesWhichImport() {
        assertEquals("Eliminar cartola de Banco de Chile, 3 oct", CartolasSubidasMessages.deleteLabel(procesada))
        assertEquals("Eliminar cartola de Banco no identificado, 2 oct", CartolasSubidasMessages.deleteLabel(fallida))
    }

    @Test
    fun theDateLineAddsTheCountOnlyForAProcessedImport() {
        assertEquals("3 oct · 37 movimientos", CartolasSubidasMessages.dateAndCount(procesada))
        assertEquals("2 oct", CartolasSubidasMessages.dateAndCount(fallida))
    }

    @Test
    fun copyIsVerbatimFromIOS() {
        assertEquals("Cartolas subidas", CartolasSubidasMessages.TITLE)
        assertEquals("Cargando cartolas…", CartolasSubidasMessages.LOADING)
        assertEquals("Problema de conexión. Revisa tu conexión e inténtalo de nuevo.", CartolasSubidasMessages.loadFailure(CartolasSubidasViewModel.Failure.Connection))
        assertEquals("No pudimos cargar las cartolas. Inténtalo de nuevo en unos segundos.", CartolasSubidasMessages.loadFailure(CartolasSubidasViewModel.Failure.Server))
        assertEquals("Reintentar", CartolasSubidasMessages.RETRY)
        assertEquals("No hay cartolas cargadas. Sube una cartola para poder gestionarla aquí.", CartolasSubidasMessages.EMPTY)
        assertEquals("Subir cartola", CartolasSubidasMessages.UPLOAD)
        assertEquals("¿Eliminar esta cartola?", CartolasSubidasMessages.DELETE_TITLE)
        assertEquals("Eliminar", CartolasSubidasMessages.DELETE)
        assertEquals("Cancelar", CartolasSubidasMessages.CANCEL)
        assertEquals("Eliminando…", CartolasSubidasMessages.DELETING)
        assertEquals("No se pudo actualizar la lista.", CartolasSubidasMessages.REFRESH_FAILED)
        assertEquals("Cartola eliminada", Message.Deleted.text)
        assertEquals("Esa cartola ya no existía. Se quitó de la lista.", Message.AlreadyGone.text)
        assertEquals("No se pudo eliminar la cartola. Intenta nuevamente.", Message.Failed.text)
    }
}
