package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.agosto
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.catalog
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.detalle
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.moved
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.restaurantes
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.ropa
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.septiembre
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.suggestion
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.supermercado
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples.vestuario
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReclassifyApplyRegressionTest {
    private val api = FakeMirachApi().apply {
        onBucketDetalle = { _, periodo -> detalle(periodo) }
        onPeriodos = { listOf(septiembre, agosto) }
        onCategorias = { catalog }
        onReclasificar = { _, c, _ -> moved(catalog.categoria(c)!!) }
    }

    private suspend fun sheet(): DetalleBucketViewModel {
        val vm = DetalleBucketViewModel(api, Bucket.Deseos, septiembre)
        vm.load()
        vm.beginReclassify(ropa) // currently in c-ropa
        return vm
    }

    @Test
    fun checkboxOffSendsNoApply() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(restaurantes.id)
        assertTrue(vm.state.value.suggestion != null)
        vm.save()
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun checkboxOnSendsTheScreensPeriodo() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.save()
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, septiembre as Periodo?)), api.reclasificarCalls)
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, septiembre)), api.parecidosCalls)
    }

    @Test
    fun changingCategoryAfterASuggestionDropsTheStaleApply() = runTest {
        api.onParecidos = { _, c, _ -> if (c == restaurantes.id) suggestion() else Parecidos.Ninguno }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.choose(supermercado.id) // other bucket, no patron
        assertNull(vm.state.value.suggestion)
        vm.save()
        vm.confirmBucketChange()
        assertEquals(listOf(Triple(ropa.id, supermercado.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun changingCategoryToOneWhoseLookupFailsDropsTheStaleApply() = runTest {
        api.onParecidos = { _, c, _ -> if (c == restaurantes.id) suggestion() else throw IOException("x") }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.choose(supermercado.id)
        vm.setApplyToSimilar(true) // even if the UI tried to turn it on
        vm.save()
        vm.confirmBucketChange()
        assertEquals(listOf(Triple(ropa.id, supermercado.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun aFailedLookupNeverSendsApplyEvenIfTheFlagIsSet() = runTest {
        api.onParecidos = { _, _, _ -> throw IOException("offline") }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        assertTrue(vm.state.value.canSave)
        vm.save()
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun aNullPatronNeverSendsApply() = runTest {
        api.onParecidos = { _, _, _ -> Parecidos.Ninguno }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.save()
        assertEquals(listOf(Triple(ropa.id, restaurantes.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun bucketChangeConfirmationHonorsTheCheckboxOnAndOff() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(supermercado.id)
        vm.setApplyToSimilar(true)
        vm.save()
        assertTrue(api.reclasificarCalls.isEmpty())
        vm.cancelBucketChange()
        assertEquals(supermercado, vm.state.value.selection)
        assertTrue(vm.state.value.applyToSimilar)
        vm.setApplyToSimilar(false)
        vm.save()
        vm.confirmBucketChange()
        assertEquals(listOf(Triple(ropa.id, supermercado.id, null as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun bucketChangeConfirmationWithCheckboxOnSendsPeriodo() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(supermercado.id)
        vm.setApplyToSimilar(true)
        vm.save()
        vm.confirmBucketChange()
        assertEquals(listOf(Triple(ropa.id, supermercado.id, septiembre as Periodo?)), api.reclasificarCalls)
    }

    @Test
    fun pickingTheCurrentCategoryClearsAndSendsNothing() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = sheet()
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.choose(vestuario.id)
        assertNull(vm.state.value.selection)
        assertEquals(false, vm.state.value.applyToSimilar)
        vm.save()
        assertTrue(api.reclasificarCalls.isEmpty())
    }

    @Test
    fun theSuggestionPeriodoIsTheMonthOnScreenAfterNavigating() = runTest {
        api.onParecidos = { _, _, _ -> suggestion() }
        val vm = DetalleBucketViewModel(api, Bucket.Deseos, septiembre)
        vm.load()
        vm.select(agosto)
        vm.beginReclassify(ropa)
        vm.choose(restaurantes.id)
        vm.setApplyToSimilar(true)
        vm.save()
        assertEquals(agosto, api.parecidosCalls.single().third)
        assertEquals(agosto, api.reclasificarCalls.single().third)
    }
}
