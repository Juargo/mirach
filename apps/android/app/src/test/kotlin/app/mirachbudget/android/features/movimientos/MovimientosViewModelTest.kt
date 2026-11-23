package app.mirachbudget.android.features.movimientos

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.detallebucket.DetalleBucketMessages
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.agosto
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.cafe
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.catalog
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.moved
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.ropa
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.septiembre
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suelto
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suggestion
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.supermercado
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.vestuario
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.CatalogState
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Failure
import app.mirachbudget.android.features.movimientos.MovimientosViewModel.Content
import app.mirachbudget.android.features.movimientos.MovimientosViewModel.MoveNotice
import app.mirachbudget.android.features.movimientos.MovimientosViewModel.Undo
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class MovimientosViewModelTest {
    private var cafeMoved = false
    private val api = FakeMirachApi().apply {
        onPeriodos = { listOf(septiembre, agosto) }
        onBucketDetalle = { bucket, periodo ->
            when (bucket) {
                Bucket.Necesidades -> MovimientosSamples.necesidades(periodo)
                Bucket.Deseos -> if (cafeMoved) MovimientosSamples.gustos(periodo, MovimientosSamples.gruposAfterCafeToRopa()) else MovimientosSamples.gustos(periodo)
                Bucket.Ahorro -> MovimientosSamples.ahorro(periodo)
            }
        }
        onCategorias = { catalog }
        onParecidos = { _, _, _ -> app.mirachbudget.android.core.networking.Parecidos.Ninguno }
        onReclasificar = { _, categoriaId, _ ->
            cafeMoved = categoriaId == vestuario.id
            moved(catalog.categoria(categoriaId)!!)
        }
    }

    private fun viewModel() = MovimientosViewModel(api, today = { Periodo(2026, 11) })

    private val MovimientosViewModel.current get() = state.value
    private val MovimientosViewModel.reclassified get() = current.reclassifiedCount

    private suspend fun loaded() = viewModel().also {
        it.load()
        assertTrue(it.content is Content.Loaded)
    }

    private fun MovimientosViewModel.detalles() = (content as Content.Loaded).detalles

    /** Opens the sheet of the Gustos pane for [movement] and picks [categoryId]. */
    private suspend fun MovimientosViewModel.pick(movement: app.mirachbudget.android.core.networking.MovimientoBucket, categoryId: String) {
        pane(Bucket.Deseos).beginReclassify(movement)
        pane(Bucket.Deseos).choose(categoryId)
    }

    // --- S2: three fixed panes, one periodo

    @Test
    fun theThreePanesAreNecesidadesGustosAndAhorroInThatOrder() {
        assertEquals(listOf(Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro), viewModel().panes.map { it.bucket })
    }

    @Test
    fun opensOnTheMostRecentMonthAndRequestsTheThreeBucketsForThatOneMonth() = runTest {
        val vm = viewModel()
        assertEquals(Content.Loading, vm.content)

        vm.load()

        assertEquals(1, api.periodosCalls)
        assertEquals(setOf(Bucket.Necesidades to septiembre, Bucket.Deseos to septiembre, Bucket.Ahorro to septiembre), api.bucketDetalleCalls.toSet())
        assertEquals(3, api.bucketDetalleCalls.size)
        assertEquals(septiembre, vm.current.periodo)
        assertEquals(listOf(septiembre, agosto), vm.current.periodos)
        assertEquals(
            listOf(MovimientosSamples.necesidades(septiembre), MovimientosSamples.gustos(septiembre), MovimientosSamples.ahorro(septiembre)),
            vm.detalles(),
        )
    }

    @Test
    fun aBucketWithoutMovementsKeepsItsPaneAndTheScreenStaysLoaded() = runTest {
        val vm = loaded()

        val ahorro = vm.detalles().single { it.bucket == Bucket.Ahorro }

        assertTrue(ahorro.grupos.isEmpty())
        assertNull(ahorro.porcentajeBp)
    }

    @Test
    fun withoutAnyMonthWithDataItAsksForTheCurrentMonth() = runTest {
        api.onPeriodos = { emptyList() }
        val vm = viewModel()

        vm.load()

        assertEquals(Periodo(2026, 11), vm.current.periodo)
        assertEquals(Periodo(2026, 11), api.bucketDetalleCalls.map { it.second }.distinct().single())
    }

    // --- S8: states

    @Test
    fun ifOneOfTheThreeRequestsFailsTheScreenShowsTheErrorAndRetryAsksAgainForTheSameMonth() = runTest {
        api.onBucketDetalle = { bucket, periodo -> if (bucket == Bucket.Deseos) throw IOException("offline") else MovimientosSamples.necesidades(periodo) }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Failed(Failure.Connection), vm.content)

        api.onBucketDetalle = { bucket, periodo ->
            when (bucket) {
                Bucket.Necesidades -> MovimientosSamples.necesidades(periodo)
                Bucket.Deseos -> MovimientosSamples.gustos(periodo)
                Bucket.Ahorro -> MovimientosSamples.ahorro(periodo)
            }
        }
        api.bucketDetalleCalls.clear()
        vm.retry()

        assertTrue(vm.content is Content.Loaded)
        assertEquals(1, api.periodosCalls)
        assertEquals(3, api.bucketDetalleCalls.size)
        assertEquals(setOf(septiembre), api.bucketDetalleCalls.map { it.second }.toSet())
    }

    @Test
    fun aServerAnswerTheAppCannotUseIsAServerFailure() = runTest {
        api.onBucketDetalle = { _, _ -> error("bad body") }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Failed(Failure.Server), vm.content)
    }

    @Test
    fun ifTheMonthsCannotBeResolvedTheScreenShowsTheErrorAndAsksForNoBucket() = runTest {
        api.onPeriodos = { throw IOException("offline") }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Failed(Failure.Connection), vm.content)
        assertTrue(api.bucketDetalleCalls.isEmpty())

        api.onPeriodos = { listOf(septiembre) }
        vm.retry()

        assertTrue(vm.content is Content.Loaded)
    }

    @Test
    fun pullToRefreshKeepsTheDataAndWarnsWhenARequestFails() = runTest {
        val vm = loaded()
        val before = vm.content
        api.onBucketDetalle = { _, _ -> throw IOException("offline") }

        vm.refresh()

        assertEquals(before, vm.content)
        assertEquals(DetalleBucketMessages.REFRESH_FAILED, vm.current.warning)
        assertFalse(vm.current.isRefreshing)
    }

    @Test
    fun reloadingBeforeTheTabWasEverOpenedAsksForNothing() = runTest {
        val vm = viewModel()

        vm.reload()

        assertEquals(0, api.periodosCalls)
        assertTrue(api.bucketDetalleCalls.isEmpty())
    }

    // --- S7: month

    @Test
    fun changingTheMonthAsksForTheThreeBucketsOfThatMonthAndClearsTheNotice() = runTest {
        val vm = loaded()
        vm.pick(cafe, vestuario.id)
        vm.pane(Bucket.Deseos).save()
        assertEquals(vestuario.id, api.reclasificarCalls.single().second)
        api.bucketDetalleCalls.clear()

        vm.select(agosto)

        assertEquals(agosto, vm.current.periodo)
        assertEquals(setOf(Bucket.Necesidades to agosto, Bucket.Deseos to agosto, Bucket.Ahorro to agosto), api.bucketDetalleCalls.toSet())
        assertNull(vm.current.notice)
        assertEquals(septiembre, vm.current.siguiente)
        assertNull(vm.current.anterior)
    }

    // --- S5, S6: move

    @Test
    fun movingWithinTheBucketSavesWithoutAskingReloadsTheThreeBucketsAndOffersUndo() = runTest {
        val vm = loaded()
        api.bucketDetalleCalls.clear()

        vm.pick(cafe, vestuario.id)
        vm.pane(Bucket.Deseos).save()

        assertNull(vm.pane(Bucket.Deseos).state.value.pendingChange)
        assertEquals(listOf(Triple("t1", vestuario.id, null)), api.reclasificarCalls)
        assertNull(vm.pane(Bucket.Deseos).state.value.sheetMovement)
        assertEquals(MoveNotice("Movido a Gustos · Ropa", Undo("t1", "c-rest")), vm.current.notice)
        assertNull(vm.current.warning)
        assertEquals(setOf(Bucket.Necesidades, Bucket.Deseos, Bucket.Ahorro), api.bucketDetalleCalls.map { it.first }.toSet())
        assertEquals(3, api.bucketDetalleCalls.size)
        assertEquals(2, vm.detalles().single { it.bucket == Bucket.Deseos }.grupos.first().conteo)
        assertEquals(1, vm.reclassified)
    }

    @Test
    fun movingToAnotherBucketAsksFirstComparingWithTheBucketTheMovementIsIn() = runTest {
        val vm = loaded()

        vm.pick(cafe, supermercado.id)
        vm.pane(Bucket.Deseos).save()

        val pending = vm.pane(Bucket.Deseos).state.value.pendingChange
        assertEquals(supermercado, pending?.category)
        assertEquals(cafe, pending?.movement)
        assertTrue(api.reclasificarCalls.isEmpty())
        assertNull(vm.current.notice)

        vm.pane(Bucket.Deseos).confirmBucketChange()

        assertEquals(listOf(Triple("t1", supermercado.id, null)), api.reclasificarCalls)
        assertEquals(MoveNotice("Movido a Necesidades · Supermercado", Undo("t1", "c-rest")), vm.current.notice)
    }

    @Test
    fun theSheetFlowIsTheBucketDetailOnePerPane() = runTest {
        val vm = loaded()

        vm.pane(Bucket.Deseos).beginReclassify(cafe)

        assertEquals(CatalogState.Loaded(catalog), vm.pane(Bucket.Deseos).state.value.catalog)
        assertEquals(cafe, vm.pane(Bucket.Deseos).state.value.sheetMovement)
        assertNull(vm.pane(Bucket.Necesidades).state.value.sheetMovement)
    }

    // --- S6: undo

    @Test
    fun undoSendsTheMovementBackReloadsReloadsResumenAndRemovesTheNotice() = runTest {
        val vm = loaded()
        vm.pick(cafe, vestuario.id)
        vm.pane(Bucket.Deseos).save()
        api.reclasificarCalls.clear()
        api.bucketDetalleCalls.clear()

        vm.undo()

        assertEquals(listOf(Triple("t1", "c-rest", null)), api.reclasificarCalls)
        assertNull(vm.current.notice)
        assertNull(vm.current.warning)
        assertEquals(3, api.bucketDetalleCalls.size)
        assertEquals(2, vm.reclassified)
    }

    @Test
    fun aMovementFromSinCategoriaCannotBeUndone() = runTest {
        val vm = loaded()

        vm.pick(suelto, vestuario.id)
        vm.pane(Bucket.Deseos).save()

        assertEquals(MoveNotice("Movido a Gustos · Ropa", undo = null), vm.current.notice)
        vm.undo()
        assertEquals(1, api.reclasificarCalls.size)
    }

    @Test
    fun aMoveSavedWithApplyToSimilarCannotBeUndone() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = loaded()
        vm.pick(ropa, restauranteId)
        vm.pane(Bucket.Deseos).setApplyToSimilar(true)

        vm.pane(Bucket.Deseos).save()

        assertEquals(listOf(Triple("t2", restauranteId, septiembre)), api.reclasificarCalls)
        assertEquals(MoveNotice("Movido a Gustos · Restaurantes", undo = null), vm.current.notice)
    }

    @Test
    fun aFailedUndoShowsAnErrorNoticeAndKeepsTheDataOnScreen() = runTest {
        val vm = loaded()
        vm.pick(cafe, vestuario.id)
        vm.pane(Bucket.Deseos).save()
        val before = vm.content
        api.onReclasificar = { _, _, _ -> throw IOException("offline") }
        api.bucketDetalleCalls.clear()

        vm.undo()

        assertEquals(DetalleBucketMessages.MOVE_FAILED_CONNECTION, vm.current.warning)
        assertNull(vm.current.notice)
        assertEquals(before, vm.content)
        assertTrue(api.bucketDetalleCalls.isEmpty())
        assertEquals(1, vm.reclassified)
    }

    @Test
    fun ifTheListCannotBeReloadedAfterAMoveTheNoticeStaysAndTheWarningSaysSo() = runTest {
        val vm = loaded()
        vm.pick(cafe, vestuario.id)
        api.onBucketDetalle = { _, _ -> throw IOException("offline") }

        vm.pane(Bucket.Deseos).save()

        assertEquals("Movido a Gustos · Ropa", vm.current.notice?.text)
        assertEquals(DetalleBucketMessages.RELOAD_AFTER_MOVE_FAILED, vm.current.warning)
        assertTrue(vm.content is Content.Loaded)
    }

    // --- S6: external changes

    @Test
    fun aCatalogChangeReloadsTheTabAndTheSheetReadsTheCatalogAgain() = runTest {
        val vm = loaded()
        vm.pane(Bucket.Deseos).beginReclassify(cafe)
        vm.pane(Bucket.Deseos).dismissSheet()
        assertEquals(1, api.categoriasCalls)
        api.bucketDetalleCalls.clear()

        vm.catalogDidChange()

        assertEquals(CatalogState.Idle, vm.pane(Bucket.Deseos).state.value.catalog)
        assertEquals(3, api.bucketDetalleCalls.size)
        vm.pane(Bucket.Deseos).beginReclassify(cafe)
        assertEquals(2, api.categoriasCalls)
    }

    @Test
    fun anImportReloadsTheMonthsAndTheThreeBucketsKeepingTheMonthOnScreen() = runTest {
        val vm = loaded()
        vm.select(agosto)
        api.bucketDetalleCalls.clear()
        api.onPeriodos = { listOf(Periodo(2026, 10), septiembre, agosto) }

        vm.reload()

        assertEquals(listOf(Periodo(2026, 10), septiembre, agosto), vm.current.periodos)
        assertEquals(agosto, vm.current.periodo)
        assertEquals(setOf(agosto), api.bucketDetalleCalls.map { it.second }.toSet())
        assertEquals(3, api.bucketDetalleCalls.size)
    }

    private val restauranteId = "c-rest"
}
