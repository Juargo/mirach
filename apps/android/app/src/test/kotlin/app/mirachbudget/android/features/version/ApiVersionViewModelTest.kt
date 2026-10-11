package app.mirachbudget.android.features.version

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.VersionInfo
import app.mirachbudget.android.testing.FakeMirachApi
import java.io.IOException
import java.net.SocketTimeoutException
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Test

class ApiVersionViewModelTest {
    private val sample = VersionInfo(version = "1.2.3", commit = "abc1234")

    /** Each call consumes one outcome: a [VersionInfo] to return or a [Throwable] to throw. */
    private class Outcomes(private val outcomes: MutableList<Any>) {
        val api = FakeMirachApi()
        var calls = 0

        init {
            api.onVersion = {
                calls++
                when (val outcome = outcomes.removeAt(0)) {
                    is Throwable -> throw outcome
                    else -> outcome as VersionInfo
                }
            }
        }
    }

    private fun viewModel(outcome: Any) = ApiVersionViewModel(Outcomes(mutableListOf(outcome)).api)

    @Test
    fun startsIdle() {
        assertEquals(ApiVersionState.Idle, viewModel(sample).state.value)
    }

    @Test
    fun loadsVersionAndCommit() = runTest {
        val vm = viewModel(sample)
        vm.load()
        assertEquals(ApiVersionState.Loaded(sample), vm.state.value)
    }

    @Test
    fun reportsNetworkFailure() = runTest {
        val vm = viewModel(IOException("offline"))
        vm.load()
        assertEquals(
            ApiVersionState.Failed("No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."),
            vm.state.value,
        )
    }

    @Test
    fun reportsTimeoutWithDedicatedMessage() = runTest {
        val vm = viewModel(SocketTimeoutException())
        vm.load()
        assertEquals(
            ApiVersionState.Failed("El servidor tardó demasiado en responder. Puede estar despertando: inténtalo de nuevo."),
            vm.state.value,
        )
    }

    @Test
    fun reportsServerErrorStatus() = runTest {
        val vm = viewModel(ApiException(503))
        vm.load()
        assertEquals(
            ApiVersionState.Failed("El servidor no está disponible en este momento. Intenta de nuevo en unos segundos."),
            vm.state.value,
        )
    }

    @Test
    fun reportsUnexpectedBody() = runTest {
        val vm = viewModel(SerializationException("bad"))
        vm.load()
        assertEquals(
            ApiVersionState.Failed("La respuesta del servidor no tiene el formato esperado."),
            vm.state.value,
        )
    }

    @Test
    fun retryAfterFailureLoadsAgain() = runTest {
        val outcomes = Outcomes(mutableListOf<Any>(IOException(), sample))
        val vm = ApiVersionViewModel(outcomes.api)
        vm.load()
        vm.retry()
        assertEquals(ApiVersionState.Loaded(sample), vm.state.value)
        assertEquals(2, outcomes.calls)
    }
}
