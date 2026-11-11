package app.mirachbudget.android.core.design

import app.mirachbudget.android.core.networking.EstadoSemaforo
import org.junit.Assert.assertEquals
import org.junit.Test

/** The Estado mark: a square in the state color plus the word, never color alone (VIS-02). */
class EstadoTest {
    private val estado = MirachPalettes.light.estado

    @Test
    fun theWordComesFromTheDesignCopy() {
        assertEquals(MirachCopy.Estado.bien, EstadoSemaforo.Verde.word)
        assertEquals(MirachCopy.Estado.cerca, EstadoSemaforo.Amarillo.word)
        assertEquals(MirachCopy.Estado.sobre, EstadoSemaforo.Rojo.word)
    }

    @Test
    fun theMarkIsFilledWithTheStateFill() {
        assertEquals(estado.bien, estado.mark(EstadoSemaforo.Verde))
        assertEquals(estado.cerca, estado.mark(EstadoSemaforo.Amarillo))
        assertEquals(estado.sobre, estado.mark(EstadoSemaforo.Rojo))
    }

    @Test
    fun theWordUsesTheTextTokensAndSobreHasNoSeparateTextToken() {
        assertEquals(estado.bienText, estado.text(EstadoSemaforo.Verde))
        assertEquals(estado.cercaText, estado.text(EstadoSemaforo.Amarillo))
        assertEquals(estado.sobre, estado.text(EstadoSemaforo.Rojo))
    }
}
