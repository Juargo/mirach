package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.PatronCambios
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronCreado
import app.mirachbudget.android.core.networking.PatronException
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.categorias.CategoriasSamples.aqui
import app.mirachbudget.android.features.categorias.CategoriasSamples.enOtra
import app.mirachbudget.android.features.categorias.CategoriasSamples.jumbo
import app.mirachbudget.android.features.categorias.CategoriasSamples.lider
import app.mirachbudget.android.features.categorias.CategoriasSamples.octubre
import app.mirachbudget.android.features.categorias.CategoriasSamples.preview
import app.mirachbudget.android.features.categorias.CategoriasSamples.supermercado
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.Content
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternConflict
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternSheet
import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The patterns of "Detalle de categoría": adding, editing and deleting them, the new pattern's
 * preview (CLA-15, Figma 28) and a text of another category (CLA-17, Figma 30). Port of the pattern
 * cases of iOS `DetalleCategoriaViewModelTests`.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class DetalleCategoriaPatronesTest : DetalleCategoriaTestBase() {
    private val unimarc = PatronCategoria(id = "p-9", patron = "UNIMARC", matchType = "CONTAINS")

    private fun creates(patron: PatronCategoria, movidos: Int = 0) {
        api.onCrearPatron = { _, _, _ -> PatronCreado(patron, movidos) }
    }

    // --- adding, editing, deleting

    @Test
    fun addingAPatternSendsTheCategoryIdAndTheTrimmedTextMovingNothingThenListsIt() = runTest {
        val vm = loaded()
        creates(unimarc)
        vm.beginAddPattern()

        vm.savePattern("  UNIMARC ")

        assertEquals(listOf(Triple("cat-super", "UNIMARC", null as Periodo?)), api.crearPatronCalls)
        assertEquals(listOf("p-1", "p-2", "p-9"), vm.shown().patrones.map { it.id })
        assertNull("the sheet closes", vm.state.value.patternSheet)
        assertEquals("Patrón guardado", vm.state.value.announcement)
        assertEquals(1, changes)
    }

    @Test
    fun editingAPatternSendsOnlyTheTextAndReplacesTheRow() = runTest {
        val vm = loaded()
        val updated = jumbo.copy(patron = "JUMBO CL")
        api.onActualizarPatron = { _, _ -> updated }
        vm.beginEditPattern(jumbo)

        vm.savePattern("JUMBO CL")

        assertEquals(listOf("p-2" to PatronCambios(patron = "JUMBO CL")), api.actualizarPatronCalls)
        assertTrue(api.crearPatronCalls.isEmpty())
        assertEquals(updated, vm.shown().patrones.first { it.id == "p-2" })
        assertNull(vm.state.value.patternSheet)
        assertEquals(1, changes)
    }

    @Test
    fun changingOnlyTheTextOfAnUnknownTypePatternNeverSendsAMatchType() = runTest {
        val vm = loaded()
        val odd = PatronCategoria(id = "p-odd", patron = "HBO", matchType = "ENDS_WITH")
        api.onActualizarPatron = { _, _ -> odd.copy(patron = "HBO MAX") }
        vm.beginEditPattern(odd)

        vm.savePattern("HBO MAX")

        assertEquals(listOf("p-odd" to PatronCambios(patron = "HBO MAX")), api.actualizarPatronCalls)
    }

    @Test
    fun editingAPatternWithoutChangesJustClosesTheSheet() = runTest {
        val vm = loaded()
        vm.beginEditPattern(lider)

        vm.savePattern("LIDER ")

        assertTrue(api.actualizarPatronCalls.isEmpty())
        assertNull(vm.state.value.patternSheet)
        assertEquals(0, changes)
    }

    @Test
    fun eachPatternRejectionShowsItsMessageInTheSheetAndKeepsItOpen() = runTest {
        val cases = listOf(
            PatronException.InvalidPattern() to "Escribe un texto válido para el patrón (de 1 a 200 caracteres)",
            PatronException.InvalidRegex() to "Esa expresión regular no es válida",
            PatronException.Duplicate() to "Ya tienes un patrón con ese texto",
            PatronException.InvalidMatchType() to "Ese tipo de coincidencia no es válido",
            PatronException.Rejected("Otra cosa") to "Otra cosa",
        )
        for ((error, text) in cases) {
            val vm = loaded()
            api.onCrearPatron = { _, _, _ -> throw error }
            vm.beginAddPattern()

            vm.savePattern("x")

            val errors = vm.state.value.patternErrors
            assertEquals(text, errors.pattern ?: errors.general)
            assertEquals(PatternSheet.Adding, vm.state.value.patternSheet)
            assertEquals(Content.Loaded(supermercado), vm.state.value.content)
            assertFalse(vm.state.value.isSavingPattern)
        }
        assertEquals(0, changes)
    }

    @Test
    fun aMissingCategoryWhileAddingAPatternSendsThePersonBackToGone() = runTest {
        val vm = loaded()
        api.onCrearPatron = { _, _, _ -> throw PatronException.CategoryNotFound() }
        vm.beginAddPattern()

        vm.savePattern("x")

        assertEquals(Content.NotFound, vm.state.value.content)
        assertNull(vm.state.value.patternSheet)
        assertEquals(1, changes)
    }

    @Test
    fun aMissingPatternWhileEditingRemovesItFromTheListAndSaysSo() = runTest {
        val vm = loaded()
        api.onActualizarPatron = { _, _ -> throw PatronException.PatternNotFound() }
        vm.beginEditPattern(lider)

        vm.savePattern("OTRO")

        assertEquals(listOf("p-2"), vm.shown().patrones.map { it.id })
        assertEquals("Ese patrón ya no existe", vm.state.value.notice)
        assertNull(vm.state.value.patternSheet)
        assertEquals(1, changes)
    }

    @Test
    fun whileSavingAPatternASecondSaveIsIgnored() = runTest {
        val vm = loaded()
        val gate = CompletableDeferred<PatronCreado>()
        api.onCrearPatron = { _, _, _ -> gate.await() }
        vm.beginAddPattern()

        val first = launch { vm.savePattern("x") }
        runCurrent()
        assertTrue(vm.state.value.isSavingPattern)
        vm.savePattern("x")
        gate.complete(PatronCreado(unimarc, 0))
        first.join()

        assertEquals(1, api.crearPatronCalls.size)
    }

    @Test
    fun deletingAPatternAsksFirstThenDeletesByIdAndAnnounces() = runTest {
        val vm = loaded()

        vm.requestPatternDeletion(lider)
        assertEquals(lider, vm.state.value.pendingPatternDeletion)
        assertTrue(api.eliminarPatronCalls.isEmpty())
        vm.confirmPatternDeletion()

        assertEquals(listOf("p-1"), api.eliminarPatronCalls)
        assertEquals(listOf("p-2"), vm.shown().patrones.map { it.id })
        assertEquals("Patrón eliminado", vm.state.value.announcement)
        assertNull(vm.state.value.deletingPattern)
        assertEquals(1, changes)
    }

    @Test
    fun cancellingAPatternDeletionDeletesNothing() = runTest {
        val vm = loaded()
        vm.requestPatternDeletion(lider)

        vm.cancelPatternDeletion()
        vm.confirmPatternDeletion()

        assertTrue(api.eliminarPatronCalls.isEmpty())
    }

    @Test
    fun aMissingPatternWhileDeletingIsRemovedFromTheList() = runTest {
        val vm = loaded()
        api.onEliminarPatron = { throw PatronException.PatternNotFound() }
        vm.requestPatternDeletion(lider)

        vm.confirmPatternDeletion()

        assertEquals(listOf("p-2"), vm.shown().patrones.map { it.id })
        assertEquals(1, changes)
    }

    @Test
    fun aFailedPatternDeletionKeepsTheRowAndSaysSo() = runTest {
        val vm = loaded()
        api.onEliminarPatron = { throw SocketTimeoutException() }
        vm.requestPatternDeletion(lider)

        vm.confirmPatternDeletion()

        assertEquals(2, vm.shown().patrones.size)
        assertEquals("No pudimos eliminar el patrón. Revisa tu conexión e inténtalo de nuevo.", vm.state.value.notice)
        assertEquals(0, changes)
    }

    // --- the new pattern's preview (CLA-15, Figma 28)

    @Test
    fun typingANewPatternAsksForThePreviewOfThisCategoryWithoutAMonth() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        vm.beginAddPattern()

        vm.previewPattern("  acuenta ")

        assertEquals(listOf("cat-super" to "acuenta"), api.vistaPreviaPatronCalls)
        assertEquals(preview(3), vm.state.value.patternPreview)
        assertFalse("off until the person marks it (CLA-15)", vm.state.value.moveMatches)
        assertTrue(vm.state.value.offersMoveMatches)
    }

    @Test
    fun thePreviewWaits350MillisecondsOfStillnessBeforeAsking() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        vm.beginAddPattern()

        val typing = launch { vm.previewPattern("acuenta") }
        advanceTimeBy(349)
        runCurrent()
        assertTrue(api.vistaPreviaPatronCalls.isEmpty())
        advanceTimeBy(2)
        runCurrent()
        typing.join()

        assertEquals(listOf("cat-super" to "acuenta"), api.vistaPreviaPatronCalls)
    }

    @Test
    fun aNewerKeystrokeSupersedesTheWaitingOne() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        vm.beginAddPattern()

        val first = launch { vm.previewPattern("acu") }
        advanceTimeBy(200)
        val second = launch { vm.previewPattern("acuenta") }
        first.join()
        second.join()

        assertEquals("only the last text is asked for", listOf("cat-super" to "acuenta"), api.vistaPreviaPatronCalls)
    }

    @Test
    fun anEmptyTextAsksNothingAndClearsThePreview() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        vm.beginAddPattern()
        vm.previewPattern("acuenta")

        vm.previewPattern("  ")

        assertEquals(1, api.vistaPreviaPatronCalls.size)
        assertNull(vm.state.value.patternPreview)
    }

    @Test
    fun editingAPatternNeverAsksForAPreview() = runTest {
        val vm = loaded()
        vm.beginEditPattern(lider)

        vm.previewPattern("LIDER EXPRESS")

        assertTrue(api.vistaPreviaPatronCalls.isEmpty())
    }

    @Test
    fun theMoveCheckboxIsOfferedOnlyWhenSomethingCoincides() = runTest {
        var calls = 0
        api.onVistaPreviaPatron = { _, _ -> if (calls++ == 0) preview(0) else preview(2) }
        val vm = loaded()
        vm.beginAddPattern()

        vm.previewPattern("acuenta")
        assertFalse(vm.state.value.offersMoveMatches)
        vm.previewPattern("acuenta ñuñoa")
        assertTrue(vm.state.value.offersMoveMatches)
    }

    @Test
    fun aDifferentAnswerTurnsTheCheckboxOffAgain() = runTest {
        var calls = 0
        api.onVistaPreviaPatron = { _, _ -> if (calls++ == 0) preview(3) else preview(2) }
        val vm = loaded()
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)

        vm.previewPattern("acuenta ñuñoa")

        assertFalse("the person agreed to move another list", vm.state.value.moveMatches)
    }

    @Test
    fun savingWithTheCheckboxOnMovesThePreviewedMonthAndSaysHowMany() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        creates(unimarc.copy(patron = "acuenta"), movidos = 3)
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        val readsBefore = api.categoriasCalls

        vm.setMoveMatches(true)
        vm.savePattern("acuenta")

        assertEquals(listOf(Triple("cat-super", "acuenta", octubre as Periodo?)), api.crearPatronCalls)
        assertNull(vm.state.value.patternSheet)
        assertEquals("Patrón guardado · 3 movidos", vm.state.value.announcement)
        assertEquals(1, changes)
        assertEquals("moved movements change the count: read again", readsBefore + 1, api.categoriasCalls)
    }

    @Test
    fun theMoveUsesTheMonthThePreviewAnswered() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(2, periodo = Periodo(2026, 9)) }
        val vm = loaded()
        creates(unimarc)
        vm.beginAddPattern()
        vm.previewPattern("acuenta")

        vm.setMoveMatches(true)
        vm.savePattern("acuenta")

        assertEquals(listOf(Periodo(2026, 9) as Periodo?), api.crearPatronCalls.map { it.third })
    }

    /** The text changed after the preview (saved within the debounce): nothing moves (L21). */
    @Test
    fun savingATextOtherThanThePreviewedOneMovesNothing() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        creates(unimarc.copy(patron = "acu"))
        vm.beginAddPattern()
        vm.previewPattern("acuenta")

        vm.setMoveMatches(true)
        vm.savePattern("acu")

        assertEquals(listOf(Triple("cat-super", "acu", null as Periodo?)), api.crearPatronCalls)
    }

    @Test
    fun savingWithTheCheckboxOffMovesNothing() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        creates(unimarc)
        vm.beginAddPattern()
        vm.previewPattern("acuenta")

        vm.savePattern("acuenta")

        assertEquals(listOf(null as Periodo?), api.crearPatronCalls.map { it.third })
        assertEquals("Patrón guardado", vm.state.value.announcement)
    }

    @Test
    fun aFailedPreviewHidesItAndSavingStillWorksMovingNothing() = runTest {
        api.onVistaPreviaPatron = { _, _ -> throw IOException("offline") }
        val vm = loaded()
        creates(unimarc)
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        assertNull(vm.state.value.patternPreview)
        assertFalse(vm.state.value.offersMoveMatches)

        vm.setMoveMatches(true)
        vm.savePattern("acuenta")

        assertEquals("no preview, no month to move", listOf(null as Periodo?), api.crearPatronCalls.map { it.third })
    }

    @Test
    fun reopeningTheSheetStartsWithNoPreviewAndTheCheckboxOff() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        val vm = loaded()
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)

        vm.dismissPatternSheet()
        vm.beginAddPattern()

        assertNull(vm.state.value.patternPreview)
        assertFalse(vm.state.value.moveMatches)
    }

    // --- a text that lives in another category (CLA-17, Figma 30)

    @Test
    fun aPreviewNamingAnotherCategoryBecomesTheConflict() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(1, existente = enOtra) }
        val vm = loaded()
        vm.beginAddPattern()

        vm.previewPattern(" unimarc ")

        assertEquals(PatternConflict(texto = "unimarc", existente = enOtra), vm.state.value.patternConflict)
        assertFalse("the conflict replaces the preview", vm.state.value.offersMoveMatches)
    }

    @Test
    fun aPreviewNamingThisCategoryIsNoConflict() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(0, existente = aqui) }
        val vm = loaded()
        vm.beginAddPattern()

        vm.previewPattern("lider")

        assertNull(vm.state.value.patternConflict)
    }

    @Test
    fun aDuplicateNamingAnotherCategoryOnSaveBecomesTheConflict() = runTest {
        val vm = loaded()
        api.onCrearPatron = { _, _, _ -> throw PatronException.DuplicateOf(enOtra) }
        vm.beginAddPattern()

        vm.savePattern("unimarc")

        assertEquals(PatternConflict(texto = "unimarc", existente = enOtra), vm.state.value.patternConflict)
        assertEquals(PatternSheet.Adding, vm.state.value.patternSheet)
        assertTrue(vm.state.value.patternErrors.isEmpty)
    }

    @Test
    fun aDuplicateInThisCategoryKeepsTheDuplicateMessage() = runTest {
        val vm = loaded()
        api.onCrearPatron = { _, _, _ -> throw PatronException.DuplicateOf(aqui) }
        vm.beginAddPattern()

        vm.savePattern("lider")

        assertNull(vm.state.value.patternConflict)
        assertEquals("Ya tienes un patrón con ese texto", vm.state.value.patternErrors.pattern)
    }

    @Test
    fun movingItHerePatchesThePatternWithThisCategoryAndListsIt() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(0, existente = enOtra) }
        val moved = PatronCategoria(id = "p-77", patron = "unimarc", matchType = "CONTAINS")
        api.onActualizarPatron = { _, _ -> moved }
        val vm = loaded()
        vm.beginAddPattern()
        vm.previewPattern("unimarc")

        vm.movePatternHere()

        assertEquals(listOf("p-77" to PatronCambios(categoriaId = "cat-super")), api.actualizarPatronCalls)
        assertTrue(api.crearPatronCalls.isEmpty())
        assertEquals(listOf("p-1", "p-2", "p-77"), vm.shown().patrones.map { it.id })
        assertNull(vm.state.value.patternSheet)
        assertNull(vm.state.value.patternConflict)
        assertEquals("Patrón guardado", vm.state.value.announcement)
        assertEquals(1, changes)
    }

    @Test
    fun aPatternDeletedMeanwhileClearsTheConflictAndSaysSo() = runTest {
        api.onVistaPreviaPatron = { _, _ -> preview(0, existente = enOtra) }
        api.onActualizarPatron = { _, _ -> throw PatronException.PatternNotFound() }
        val vm = loaded()
        vm.beginAddPattern()
        vm.previewPattern("unimarc")

        vm.movePatternHere()

        assertNull(vm.state.value.patternConflict)
        assertEquals("Ese patrón ya no existe. Puedes guardarlo aquí.", vm.state.value.patternErrors.general)
        assertEquals(PatternSheet.Adding, vm.state.value.patternSheet)
        assertFalse(vm.state.value.isSavingPattern)
        assertEquals(0, changes)
    }
}
