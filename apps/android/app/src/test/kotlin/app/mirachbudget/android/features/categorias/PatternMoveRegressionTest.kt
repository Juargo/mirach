package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.PatronCambios
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronCreado
import app.mirachbudget.android.core.networking.PatronException
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.categorias.CategoriasSamples.aqui
import app.mirachbudget.android.features.categorias.CategoriasSamples.enOtra
import app.mirachbudget.android.features.categorias.CategoriasSamples.lider
import app.mirachbudget.android.features.categorias.CategoriasSamples.octubre
import app.mirachbudget.android.features.categorias.CategoriasSamples.preview
import java.io.IOException
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PatternMoveRegressionTest : DetalleCategoriaTestBase() {
    private fun created(text: String, movidos: Int = 0) = PatronCreado(PatronCategoria("p-new", text, "CONTAINS"), movidos)

    @Test
    fun savingATextOtherThanThePreviewedOneSendsNoMove() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        assertTrue(vm.state.value.offersMoveMatches)
        vm.setMoveMatches(true)
        vm.savePattern("acuenta express")
        assertEquals(listOf(Triple("cat-super", "acuenta express", null as Periodo?)), api.crearPatronCalls)
    }

    @Test
    fun savingThePreviewedTextWithCheckboxOnSendsThePreviewPeriodo() = runTest {
        val vm = loaded()
        val septiembre = Periodo(2026, 9)
        api.onVistaPreviaPatron = { _, _ -> preview(3, periodo = septiembre) }
        api.onCrearPatron = { _, t, _ -> created(t, 3) }
        vm.beginAddPattern()
        vm.previewPattern("  acuenta ")
        vm.setMoveMatches(true)
        vm.savePattern("acuenta  ")
        assertEquals(listOf(Triple("cat-super", "acuenta", septiembre as Periodo?)), api.crearPatronCalls)
        assertEquals(listOf("cat-super" to "acuenta"), api.vistaPreviaPatronCalls)
    }

    @Test
    fun checkboxOffSendsNoMove() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.savePattern("acuenta")
        assertEquals(listOf(Triple("cat-super", "acuenta", null as Periodo?)), api.crearPatronCalls)
    }

    @Test
    fun aFailedPreviewSendsNoMoveEvenIfTheFlagIsSet() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> throw IOException("x") }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)
        vm.savePattern("acuenta")
        assertEquals(listOf(Triple("cat-super", "acuenta", null as Periodo?)), api.crearPatronCalls)
    }

    @Test
    fun aZeroPreviewSendsNoMove() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(0) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        assertFalse(vm.state.value.offersMoveMatches)
        vm.setMoveMatches(true)
        vm.savePattern("acuenta")
        assertNull(api.crearPatronCalls.single().third)
    }

    @Test
    fun aNewPreviewWithADifferentCountTurnsTheCheckboxOff() = runTest {
        val vm = loaded()
        var n = 3
        api.onVistaPreviaPatron = { _, _ -> preview(n) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)
        n = 5
        vm.previewPattern("acuenta2")
        assertFalse(vm.state.value.moveMatches)
        vm.savePattern("acuenta2")
        assertNull(api.crearPatronCalls.single().third)
    }

    @Test
    fun savingWhileANewPreviewIsDebouncingSendsNoMove() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)
        val job = launch { vm.previewPattern("acuentax") }
        advanceTimeBy(100)
        vm.savePattern("acuentax")
        job.cancel()
        assertNull(api.crearPatronCalls.single().third)
    }

    @Test
    fun aConflictPreviewHidesTheCheckboxAndSendsNoMove() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3, existente = enOtra) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        assertFalse(vm.state.value.offersMoveMatches)
        assertEquals("acuenta", vm.state.value.patternConflict?.texto)
    }

    @Test
    fun movingItHerePatchesOnlyTheCategoriaId() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3, existente = enOtra) }
        api.onActualizarPatron = { id, _ -> PatronCategoria(id, "acuenta", "CONTAINS") }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)
        vm.movePatternHere()
        assertEquals(listOf("p-77" to PatronCambios(categoriaId = "cat-super")), api.actualizarPatronCalls)
        assertTrue(api.crearPatronCalls.isEmpty())
    }

    @Test
    fun a409InTheSameCategoryIsNotAConflict() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(0) }
        api.onCrearPatron = { _, _, _ -> throw PatronException.DuplicateOf(aqui) }
        vm.beginAddPattern()
        vm.previewPattern("lider")
        vm.savePattern("lider")
        assertNull(vm.state.value.patternConflict)
        assertTrue(vm.state.value.patternErrors.pattern != null || vm.state.value.patternErrors.general != null)
    }

    @Test
    fun a409InAnotherCategoryIsAConflict() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> throw IOException() }
        api.onCrearPatron = { _, _, _ -> throw PatronException.DuplicateOf(enOtra) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.savePattern(" acuenta ")
        assertEquals("acuenta", vm.state.value.patternConflict?.texto)
    }

    @Test
    fun editingSendsOnlyTheText() = runTest {
        val vm = loaded()
        api.onActualizarPatron = { id, c -> PatronCategoria(id, c.patron!!, "CONTAINS") }
        vm.beginEditPattern(lider)
        vm.setMoveMatches(true)
        vm.savePattern("LIDER EXPRESS")
        assertEquals(listOf("p-1" to PatronCambios(patron = "LIDER EXPRESS")), api.actualizarPatronCalls)
        assertTrue(api.crearPatronCalls.isEmpty())
        assertTrue(api.vistaPreviaPatronCalls.isEmpty())
    }

    @Test
    fun editingNeverAsksForAPreview() = runTest {
        val vm = loaded()
        vm.beginEditPattern(lider)
        vm.previewPattern("LIDER X")
        assertTrue(api.vistaPreviaPatronCalls.isEmpty())
    }

    @Test
    fun reopeningTheSheetForgetsThePreviousPreview() = runTest {
        val vm = loaded()
        api.onVistaPreviaPatron = { _, _ -> preview(3) }
        api.onCrearPatron = { _, t, _ -> created(t) }
        vm.beginAddPattern()
        vm.previewPattern("acuenta")
        vm.setMoveMatches(true)
        vm.dismissPatternSheet()
        vm.beginAddPattern()
        vm.setMoveMatches(true)
        vm.savePattern("acuenta")
        assertNull(api.crearPatronCalls.single().third)
    }
}
