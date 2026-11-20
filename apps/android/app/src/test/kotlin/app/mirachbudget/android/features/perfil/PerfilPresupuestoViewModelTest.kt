package app.mirachbudget.android.features.perfil

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.PerfilPredefinido
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.perfil.PerfilPresupuestoViewModel.LoadState
import app.mirachbudget.android.features.perfil.PerfilPresupuestoViewModel.SaveState
import app.mirachbudget.android.features.perfil.PerfilViewModel.Failure
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class PerfilPresupuestoViewModelTest {
    private val api = FakeMirachApi().apply { onPerfilPresupuesto = { PerfilPredefinido.P50_30_20 } }
    private var savedCalls = 0
    private val vm = PerfilPresupuestoViewModel(api, onSaved = { savedCalls++ })
    private val state get() = vm.state.value

    // --- S3: load

    @Test
    fun startsLoadingThenSelectsTheStoredProfile() = runTest {
        assertEquals(LoadState.Loading, state.load)

        vm.load()

        assertEquals(LoadState.Loaded, state.load)
        assertEquals(PerfilPredefinido.P50_30_20, state.selected)
        assertEquals(1, api.perfilPresupuestoCalls)
    }

    @Test
    fun aCustomStoredProfileSelectsNoCard() = runTest {
        api.onPerfilPresupuesto = { null }

        vm.load()

        assertEquals(LoadState.Loaded, state.load)
        assertNull(state.selected)
        assertFalse(state.canSave)
    }

    @Test
    fun aFailedLoadShowsTheErrorAndRetryLoadsAgain() = runTest {
        api.onPerfilPresupuesto = { throw IOException("offline") }
        vm.load()
        assertEquals(LoadState.Failed(Failure.Connection), state.load)

        api.onPerfilPresupuesto = { throw ApiException(500) }
        vm.load()
        assertEquals(LoadState.Failed(Failure.Server), state.load)

        api.onPerfilPresupuesto = { PerfilPredefinido.P70_15_15 }
        vm.load()
        assertEquals(LoadState.Loaded, state.load)
        assertEquals(PerfilPredefinido.P70_15_15, state.selected)
    }

    @Test
    fun anExpiredSessionWhileLoadingHasNoMessageOfItsOwn() = runTest {
        api.onPerfilPresupuesto = { throw SessionExpiredException() }

        vm.load()

        // The relay signs out; the screen keeps loading instead of showing an error.
        assertEquals(LoadState.Loading, state.load)
    }

    // --- S4: selection and Guardar

    @Test
    fun guardarIsDisabledWhileTheSelectionEqualsTheStoredProfile() = runTest {
        vm.load()
        assertFalse(state.canSave)

        vm.select(PerfilPredefinido.P60_20_20)
        assertTrue(state.canSave)

        vm.select(PerfilPredefinido.P50_30_20)
        assertFalse(state.canSave)
    }

    @Test
    fun guardarIsDisabledAndSendsNothingWithoutASelection() = runTest {
        api.onPerfilPresupuesto = { null }
        vm.load()

        vm.save()

        assertFalse(state.canSave)
        assertEquals(emptyList<PerfilPredefinido>(), api.cambiarPerfilPresupuestoCalls)
        assertEquals(0, savedCalls)
    }

    @Test
    fun tappingACardSelectsItLocallyWithoutCallingTheApi() = runTest {
        vm.load()

        vm.select(PerfilPredefinido.P80_10_10)

        assertEquals(PerfilPredefinido.P80_10_10, state.selected)
        assertEquals(emptyList<PerfilPredefinido>(), api.cambiarPerfilPresupuestoCalls)
    }

    @Test
    fun guardarIsDisabledAndTheSelectionLockedWhileSaving() = runTest {
        vm.load()
        vm.select(PerfilPredefinido.P60_20_20)
        val gate = CompletableDeferred<PerfilPredefinido?>()
        api.onCambiarPerfilPresupuesto = { gate.await() }

        val job = launch { vm.save() }
        runCurrent()

        assertEquals(SaveState.Saving, state.save)
        assertFalse(state.canSave)
        // A second tap while the request is out sends nothing, and the cards do not move.
        vm.save()
        vm.select(PerfilPredefinido.P70_15_15)
        assertEquals(PerfilPredefinido.P60_20_20, state.selected)
        assertEquals(listOf(PerfilPredefinido.P60_20_20), api.cambiarPerfilPresupuestoCalls)

        gate.complete(PerfilPredefinido.P60_20_20)
        job.join()
    }

    // --- S4/S5: save result

    @Test
    fun aSuccessfulSaveSendsTheSelectionStoresItAndReturns() = runTest {
        vm.load()
        vm.select(PerfilPredefinido.P60_20_20)
        api.onCambiarPerfilPresupuesto = { it }

        vm.save()

        assertEquals(listOf(PerfilPredefinido.P60_20_20), api.cambiarPerfilPresupuestoCalls)
        // One return-and-reload signal, and the stored profile is now the saved one.
        assertEquals(1, savedCalls)
        assertEquals(SaveState.Idle, state.save)
        assertEquals(PerfilPredefinido.P60_20_20, state.selected)
        assertFalse(state.canSave)
    }

    @Test
    fun aFailedSaveKeepsTheSelectionShowsTheErrorAndEnablesGuardarAgain() = runTest {
        vm.load()
        vm.select(PerfilPredefinido.P70_15_15)
        api.onCambiarPerfilPresupuesto = { throw IOException("offline") }

        vm.save()

        assertEquals(SaveState.Failed(Failure.Connection), state.save)
        assertEquals(PerfilPredefinido.P70_15_15, state.selected)
        assertTrue(state.canSave)
        assertEquals(0, savedCalls)

        api.onCambiarPerfilPresupuesto = { throw ApiException(400) }
        vm.save()
        assertEquals(SaveState.Failed(Failure.Server), state.save)
        assertTrue(state.canSave)

        // A retry that works returns.
        api.onCambiarPerfilPresupuesto = { it }
        vm.save()
        assertEquals(1, savedCalls)
    }

    @Test
    fun anExpiredSessionWhileSavingKeepsTheSelectionWithoutAMessage() = runTest {
        vm.load()
        vm.select(PerfilPredefinido.P80_10_10)
        api.onCambiarPerfilPresupuesto = { throw SessionExpiredException() }

        vm.save()

        assertEquals(SaveState.Idle, state.save)
        assertEquals(PerfilPredefinido.P80_10_10, state.selected)
        assertEquals(0, savedCalls)
    }

    @Test
    fun choosingAnotherCardClearsThePreviousSaveError() = runTest {
        vm.load()
        vm.select(PerfilPredefinido.P70_15_15)
        api.onCambiarPerfilPresupuesto = { throw ApiException(500) }
        vm.save()

        vm.select(PerfilPredefinido.P60_20_20)

        assertEquals(SaveState.Idle, state.save)
    }
}
