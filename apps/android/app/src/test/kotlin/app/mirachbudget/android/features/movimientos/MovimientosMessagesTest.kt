package app.mirachbudget.android.features.movimientos

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.cafe
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.septiembre
import org.junit.Assert.assertEquals
import org.junit.Test

class MovimientosMessagesTest {
    @Test
    fun theNewCopyIsTheSpecOne() {
        assertEquals("Movimientos", MovimientosMessages.TITLE)
        assertEquals("Sin movimientos", MovimientosMessages.EMPTY)
        assertEquals("Mover", MovimientosMessages.MOVE)
        assertEquals("Deshacer", MovimientosMessages.UNDO)
    }

    @Test
    fun aPaneHeaderSaysWhetherItsMovementsAreShowing() {
        assertEquals("Abierto", MovimientosMessages.paneState(isOpen = true))
        assertEquals("Cerrado", MovimientosMessages.paneState(isOpen = false))
        assertEquals("mostrar los movimientos de este bloque", MovimientosMessages.OPEN_ACTION)
    }

    @Test
    fun aPaneHeaderIsOnlyTheTotalAndItsPercentage() {
        assertEquals("$569.400 · 52%", MovimientosMessages.paneHeader(MovimientosSamples.necesidades(septiembre)))
    }

    @Test
    fun aMissingPercentageIsADash() {
        assertEquals("$0 · —", MovimientosMessages.paneHeader(MovimientosSamples.ahorro(septiembre)))
    }

    @Test
    fun theMovedNoticeNamesTheBucketAndTheCategory() {
        assertEquals("Movido a Gustos · Ropa", MovimientosMessages.moved(Bucket.Deseos, "Ropa"))
    }

    @Test
    fun theMoveButtonSaysWhichMovementItMoves() {
        assertEquals("Mover CAFE CENTRAL", MovimientosMessages.moveLabel(cafe))
    }
}
