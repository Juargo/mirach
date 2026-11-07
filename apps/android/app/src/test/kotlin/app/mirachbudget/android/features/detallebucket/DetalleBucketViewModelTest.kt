package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ReclasificarException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.agosto
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.cafe
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.catalog
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.detalle
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.moved
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.restaurantes
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.ropa
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.septiembre
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suelto
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suggestion
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.supermercado
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.vestuario
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.BucketChange
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.CatalogState
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Content
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Failure
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class DetalleBucketViewModelTest {
    private val api = FakeMirachApi().apply {
        onBucketDetalle = { _, periodo -> detalle(periodo) }
        onPeriodos = { listOf(septiembre, agosto) }
        onCategorias = { catalog }
        onParecidos = { _, _, _ -> Parecidos.Ninguno }
    }
    private var reclassified = 0

    private fun viewModel() = DetalleBucketViewModel(api, Bucket.Deseos, septiembre, onReclassified = { reclassified++ })

    private val DetalleBucketViewModel.current get() = state.value

    private suspend fun loaded(): DetalleBucketViewModel = viewModel().also {
        it.load()
        assertEquals(Content.Loaded(detalle()), it.current.content)
    }

    /** The sheet open for [movement] with the catalog loaded. */
    private suspend fun sheet(movement: app.mirachbudget.android.core.networking.MovimientoBucket = ropa) = loaded().also {
        it.beginReclassify(movement)
        assertEquals(CatalogState.Loaded(catalog), it.current.catalog)
    }

    // --- S2: the detail

    @Test
    fun startsLoadingThenShowsTheBucketOfTheMonthItWasOpenedFor() = runTest {
        val vm = viewModel()
        assertEquals(Content.Loading, vm.current.content)

        vm.load()

        assertEquals(Content.Loaded(detalle()), vm.current.content)
        assertEquals(listOf(Bucket.Deseos to septiembre), api.bucketDetalleCalls)
        assertEquals(listOf(septiembre, agosto), vm.current.periodos)
    }

    @Test
    fun aNetworkErrorIsAConnectionFailureAndRetryAsksForTheSameMonthAgain() = runTest {
        api.onBucketDetalle = { _, _ -> throw IOException("offline") }
        val vm = viewModel()
        vm.load()
        assertEquals(Content.Failed(Failure.Connection), vm.current.content)

        api.onBucketDetalle = { _, periodo -> detalle(periodo) }
        vm.retry()

        assertEquals(Content.Loaded(detalle()), vm.current.content)
        assertEquals(listOf(Bucket.Deseos to septiembre, Bucket.Deseos to septiembre), api.bucketDetalleCalls)
    }

    @Test
    fun serverProblemsAreServerFailures() = runTest {
        api.onBucketDetalle = { _, _ -> throw ApiException(500) }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Failed(Failure.Server), vm.current.content)
    }

    @Test
    fun aRejectedSessionShowsNoError() = runTest {
        api.onBucketDetalle = { _, _ -> throw SessionExpiredException() }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Loading, vm.current.content)
    }

    @Test
    fun theArrowsStepThroughTheMonthsThatHaveData() = runTest {
        val vm = loaded()
        assertEquals(agosto, vm.current.anterior)
        assertNull(vm.current.siguiente)

        vm.select(agosto)

        assertEquals(Content.Loaded(detalle(agosto)), vm.current.content)
        assertEquals(Bucket.Deseos to agosto, api.bucketDetalleCalls.last())
        assertNull(vm.current.anterior)
        assertEquals(septiembre, vm.current.siguiente)
    }

    @Test
    fun aFailedRefreshKeepsTheMovementsAndSaysSo() = runTest {
        val vm = loaded()
        api.onBucketDetalle = { _, _ -> throw IOException("offline") }

        vm.refresh()

        assertEquals(Content.Loaded(detalle()), vm.current.content)
        assertEquals("No se pudo actualizar la lista.", vm.current.notice)
        assertFalse(vm.current.isRefreshing)
    }

    // --- S3: picking only selects

    @Test
    fun openingTheSheetLoadsTheCatalogOnceAndReusesItAfterwards() = runTest {
        val vm = sheet()
        vm.dismissSheet()
        vm.beginReclassify(cafe)

        assertEquals(1, api.categoriasCalls)
        assertEquals(cafe, vm.current.sheetMovement)
    }

    @Test
    fun aCatalogFailureIsShownInTheSheetAndRetryRecovers() = runTest {
        api.onCategorias = { throw IOException("offline") }
        val vm = loaded()
        vm.beginReclassify(ropa)
        assertEquals(CatalogState.Failed, vm.current.catalog)

        api.onCategorias = { catalog }
        vm.retryCatalog()

        assertEquals(CatalogState.Loaded(catalog), vm.current.catalog)
    }

    @Test
    fun pickingACategoryOnlySelectsItAndSendsNothing() = runTest {
        val vm = sheet()

        vm.choose(restaurantes.id)

        assertEquals(restaurantes, vm.current.selection)
        assertTrue(vm.current.canSave)
        assertEquals(ropa, vm.current.sheetMovement)
        assertTrue(api.reclasificarCalls.isEmpty())
        assertEquals(0, reclassified)
    }

    @Test
    fun guardarIsDisabledAndDoesNothingUntilACategoryIsPicked() = runTest {
        val vm = sheet()
        assertFalse(vm.current.canSave)

        vm.save()

        assertTrue(api.reclasificarCalls.isEmpty())
        assertEquals(ropa, vm.current.sheetMovement)
    }

    @Test
    fun guardarWithACategoryOfTheSameBucketSendsItOnceClosesTheSheetAndRefreshesEverything() = runTest {
        api.onReclasificar = { _, _, _ -> moved(restaurantes) }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
        assertNull(vm.current.sheetMovement)
        assertNull(vm.current.selection)
        assertEquals("Movida a Gustos · Restaurantes", vm.current.announcement)
        assertEquals(1, reclassified)
        assertEquals(2, api.bucketDetalleCalls.size)
        assertNull(vm.current.reclassifyingId)
    }

    @Test
    fun theAnnouncementReportsWhereTheServerPutTheMovement() = runTest {
        api.onReclasificar = { _, _, _ -> moved(supermercado) }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals("Movida a Necesidades · Supermercado", vm.current.announcement)
    }

    @Test
    fun pickingTheCategoryItAlreadyHasLeavesNothingToSave() = runTest {
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.choose(vestuario.id)

        assertNull(vm.current.selection)
        assertFalse(vm.current.canSave)
        assertEquals(ropa, vm.current.sheetMovement)
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, septiembre)), api.parecidosCalls)
    }

    @Test
    fun aMovementWithoutCategoryCanBeMovedToAnyCategory() = runTest {
        val vm = sheet(suelto)

        vm.choose(restaurantes.id)

        assertNull(vm.current.currentCategoryId(suelto))
        assertEquals(restaurantes, vm.current.selection)
    }

    // --- S3: another bucket

    @Test
    fun aCategoryOfAnotherBucketAsksForConfirmationOnGuardarBeforeCallingTheApi() = runTest {
        val vm = sheet()
        vm.choose(supermercado.id)

        vm.save()

        assertEquals(BucketChange(ropa, supermercado, aplicarAParecidos = null), vm.current.pendingChange)
        assertTrue(api.reclasificarCalls.isEmpty())
    }

    @Test
    fun cancellingTheConfirmationKeepsTheSheetTheSelectionAndTheCheckbox() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(supermercado.id)
        vm.setApplyToSimilar(true)
        vm.save()

        vm.cancelBucketChange()

        assertNull(vm.current.pendingChange)
        assertEquals(ropa, vm.current.sheetMovement)
        assertEquals(supermercado, vm.current.selection)
        assertTrue(vm.current.applyToSimilar)
        assertEquals(suggestion(), vm.current.suggestion?.parecidos)
        assertTrue(api.reclasificarCalls.isEmpty())
    }

    @Test
    fun confirmingTheBucketChangeSavesHonoringTheCheckbox() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        api.onReclasificar = { _, _, _ -> moved(supermercado, movidos = 2) }
        val vm = sheet()
        vm.choose(supermercado.id)
        vm.setApplyToSimilar(true)
        vm.save()

        vm.confirmBucketChange()

        assertEquals(listOf(Triple(ropa.id, supermercado.id, septiembre as Periodo?)), api.reclasificarCalls)
        assertNull(vm.current.pendingChange)
        assertNull(vm.current.sheetMovement)
        assertEquals("Movida a Necesidades · Supermercado · 2 movidos", vm.current.announcement)
        assertEquals(1, reclassified)
    }

    // --- S3: apply to similar movements

    @Test
    fun choosingACategoryAsksForSimilarMovementsOfTheScreensMonth() = runTest {
        val vm = sheet()
        vm.select(agosto)

        vm.choose(restaurantes.id)

        assertEquals(listOf(Triple(ropa.id, restaurantes.id, agosto)), api.parecidosCalls)
    }

    @Test
    fun aSuggestionShowsTheCheckboxOffAndWaitsForGuardar() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()

        vm.choose(restaurantes.id)

        assertEquals(DetalleBucketViewModel.SimilarSuggestion(ropa, restaurantes, suggestion(), septiembre), vm.current.suggestion)
        assertFalse(vm.current.applyToSimilar)
        assertFalse(vm.current.isCheckingSimilar)
        assertTrue(api.reclasificarCalls.isEmpty())
    }

    @Test
    fun withoutASuggestedTextTheCheckboxIsHidden() = runTest {
        api.onParecidos = { _, _, _ -> Parecidos(patron = null, total = 3, existente = null) }
        val vm = sheet()

        vm.choose(restaurantes.id)

        assertNull(vm.current.suggestion)
        assertTrue(vm.current.canSave)
    }

    @Test
    fun aFailedSimilarLookupHidesTheCheckboxAndNeverBlocksGuardar() = runTest {
        api.onParecidos = { _, _, _ -> throw IOException("offline") }
        api.onReclasificar = { _, _, _ -> moved(restaurantes) }
        val vm = sheet()
        vm.choose(restaurantes.id)
        assertNull(vm.current.suggestion)
        assertFalse(vm.current.isCheckingSimilar)
        assertTrue(vm.current.canSave)

        vm.save()

        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun guardarWithTheCheckboxOffIsThePlainReclassification() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        api.onReclasificar = { _, _, _ -> moved(restaurantes) }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun guardarWithTheCheckboxOnAppliesToTheSimilarOnesOfTheMonthItWasAskedFor() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        api.onReclasificar = { _, _, _ -> moved(restaurantes, movidos = 2) }
        val vm = sheet()
        vm.select(agosto)
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)

        vm.save()

        assertEquals(listOf(Triple(ropa.id, restaurantes.id, agosto as Periodo?)), api.reclasificarCalls)
        assertEquals("Movida a Gustos · Restaurantes · 2 movidos", vm.current.announcement)
        assertFalse(vm.current.applyToSimilar)
        assertNull(vm.current.suggestion)
    }

    @Test
    fun choosingAnotherCategoryReAsksAndTurnsTheCheckboxOff() = runTest {
        api.onParecidos = { _, categoriaId, _ -> if (categoriaId == restaurantes.id) suggestion() else suggestion(total = 5) }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)

        vm.choose(supermercado.id)

        assertEquals(supermercado, vm.current.selection)
        assertFalse(vm.current.applyToSimilar)
        assertEquals(suggestion(total = 5), vm.current.suggestion?.parecidos)
        assertEquals(2, api.parecidosCalls.size)
    }

    @Test
    fun closingTheSheetForgetsTheSelectionAndTheSuggestion() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)

        vm.dismissSheet()

        assertNull(vm.current.sheetMovement)
        assertNull(vm.current.selection)
        assertNull(vm.current.suggestion)
        assertFalse(vm.current.applyToSimilar)
    }

    // --- S3: a category created from the sheet

    @Test
    fun aNewCategoryComesBackSelectedAndWaitsForGuardar() = runTest {
        val nueva = NuevaCategoria(nombre = "Cafés", bucket = Bucket.Deseos, patron = null, icono = null)
        val created = CategoriaCatalogo("c-cafe", "Cafés", Bucket.Deseos, null)
        api.onCrearCategoria = { created }
        val vm = sheet()

        vm.createCategory(nueva)

        assertEquals(listOf(nueva), api.crearCategoriaCalls)
        assertEquals(CatalogState.Loaded(catalog.copy(categorias = catalog.categorias + created)), vm.current.catalog)
        assertEquals(1, vm.current.createdCategoryCount)
        assertEquals(created, vm.current.selection)
        assertEquals(listOf(Triple(ropa.id, created.id, septiembre)), api.parecidosCalls)
        assertTrue(api.reclasificarCalls.isEmpty())
        assertFalse(vm.current.isCreatingCategory)
    }

    @Test
    fun aRefusedCategoryShowsTheFormMessageAndSelectsNothing() = runTest {
        api.onCrearCategoria = { throw CategoriaException.DuplicateName() }
        val vm = sheet()

        vm.createCategory(NuevaCategoria(nombre = "Ropa", bucket = Bucket.Deseos, patron = null, icono = null))

        assertEquals("Ya tienes una categoría con ese nombre", vm.current.categoryFormErrors.name)
        assertEquals(0, vm.current.createdCategoryCount)
        assertNull(vm.current.selection)
    }

    // --- S3: error notices

    @Test
    fun aCategoryThatNoLongerExistsKeepsTheSheetSaysSoAndReloadsTheCatalog() = runTest {
        api.onReclasificar = { _, _, _ -> throw ReclasificarException.CategoryNotFound() }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals("Esa categoría ya no existe. Elige otra.", vm.current.sheetNotice)
        assertEquals(ropa, vm.current.sheetMovement)
        assertNull(vm.current.selection)
        assertEquals(2, api.categoriasCalls)
        assertEquals(0, reclassified)
    }

    @Test
    fun aMovementThatNoLongerExistsClosesTheSheetAndReloadsTheDetail() = runTest {
        api.onReclasificar = { _, _, _ -> throw ReclasificarException.MovementNotFound() }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertNull(vm.current.sheetMovement)
        assertEquals("Ese movimiento ya no existe.", vm.current.notice)
        assertEquals(2, api.bucketDetalleCalls.size)
    }

    @Test
    fun aConnectionFailureKeepsTheSheetAndTheSelectionWithAMessage() = runTest {
        api.onReclasificar = { _, _, _ -> throw IOException("offline") }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals("No pudimos mover el movimiento. Revisa tu conexión e inténtalo de nuevo.", vm.current.sheetNotice)
        assertEquals(ropa, vm.current.sheetMovement)
        assertEquals(restaurantes, vm.current.selection)
        assertNull(vm.current.reclassifyingId)
    }

    @Test
    fun aServerFailureWhileMovingSaysToTryAgain() = runTest {
        api.onReclasificar = { _, _, _ -> throw ApiException(500) }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals("No pudimos mover el movimiento. Inténtalo de nuevo.", vm.current.sheetNotice)
    }

    @Test
    fun aRejectedSessionWhileMovingShowsNoMessage() = runTest {
        api.onReclasificar = { _, _, _ -> throw SessionExpiredException() }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertNull(vm.current.sheetNotice)
        assertNull(vm.current.notice)
    }

    @Test
    fun aFailedReloadAfterMovingKeepsTheListAndSaysSo() = runTest {
        api.onReclasificar = { _, _, _ ->
            api.onBucketDetalle = { _, _ -> throw IOException("offline") }
            moved(restaurantes)
        }
        val vm = sheet()
        vm.choose(restaurantes.id)

        vm.save()

        assertEquals(Content.Loaded(detalle()), vm.current.content)
        assertEquals("Se movió, pero no pudimos actualizar la lista. Desliza hacia abajo para actualizar.", vm.current.notice)
        assertEquals(1, reclassified)
    }
}
