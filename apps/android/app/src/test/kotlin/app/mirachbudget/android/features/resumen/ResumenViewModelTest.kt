package app.mirachbudget.android.features.resumen

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.MirachApiFactory
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionController
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.features.resumen.ResumenSamples.mes
import app.mirachbudget.android.features.resumen.ResumenSamples.periodo
import app.mirachbudget.android.features.resumen.ResumenViewModel.Failure
import app.mirachbudget.android.features.resumen.ResumenViewModel.State
import app.mirachbudget.android.testing.FakeMirachApi
import app.mirachbudget.android.testing.InMemorySessionStore
import java.io.IOException
import java.net.SocketTimeoutException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class ResumenViewModelTest {
    private val api = FakeMirachApi()

    private fun periodos(vararg texts: String): List<Periodo> = texts.map(::periodo)

    private fun viewModel() = ResumenViewModel(api)

    private fun answers(vararg months: ResumenMes) {
        api.onResumen = { p -> months.firstOrNull { p == null || it.periodo == p } ?: error("no month for $p") }
    }

    @Test
    fun startsLoadingThenShowsTheMonthTheApiResolved() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()
        assertEquals(State.Loading, vm.state.value)

        vm.load()

        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
        // First load never names a period: the API picks the latest month with movements.
        assertEquals(listOf<Periodo?>(null), api.resumenCalls)
    }

    @Test
    fun aMonthWithoutIncomeIsStillLoadedSoTheScreenCanShowItsEmptyState() = runTest {
        val empty = mes("2026-07", ingreso = 0, sinIngreso = true, totals = listOf(0, 0, 0))
        answers(empty)
        api.onPeriodos = { emptyList() }
        val vm = viewModel()

        vm.load()

        assertEquals(State.Loaded(empty), vm.state.value)
    }

    @Test
    fun aNetworkErrorShowsAConnectionFailureAndRetryRecovers() = runTest {
        api.onResumen = { throw IOException("offline") }
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()

        vm.load()
        assertEquals(State.Failed(Failure.Connection), vm.state.value)

        answers(mes("2026-09"))
        vm.retry()

        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
    }

    @Test
    fun aTimeoutIsAConnectionFailureToo() = runTest {
        api.onResumen = { throw SocketTimeoutException() }
        api.onPeriodos = { emptyList() }
        val vm = viewModel()

        vm.load()

        assertEquals(State.Failed(Failure.Connection), vm.state.value)
    }

    @Test
    fun serverAndDecodingProblemsAreServerFailures() = runTest {
        for (error in listOf(ApiException(503), SerializationException("bad"))) {
            api.onResumen = { throw error }
            api.onPeriodos = { emptyList() }
            val vm = viewModel()

            vm.load()

            assertEquals(State.Failed(Failure.Server), vm.state.value)
        }
    }

    @Test
    fun cancellationIsNeverShownAsAnError() = runTest {
        api.onResumen = { throw CancellationException("screen left") }
        api.onPeriodos = { emptyList() }
        val vm = viewModel()

        assertThrows(CancellationException::class.java) { runBlocking { vm.load() } }

        assertEquals(State.Loading, vm.state.value)
    }

    @Test
    fun startPicksUpAnInterruptedLoadButNeverRepeatsALoadedScreen() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()

        vm.start()
        vm.start() // e.g. rotation: the screen is composed again

        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
        assertEquals(1, api.resumenCalls.size)
    }

    @Test
    fun retryAfterAFailureAsksForTheSameMonthAgain() = runTest {
        answers(mes("2026-09"), mes("2026-08"))
        api.onPeriodos = { periodos("2026-09", "2026-08") }
        val vm = viewModel()
        vm.load()
        api.onResumen = { throw ApiException(503) }
        vm.select(periodo("2026-08"))
        assertEquals(State.Failed(Failure.Server), vm.state.value)

        answers(mes("2026-08"))
        vm.retry()

        assertEquals(listOf<Periodo?>(null, periodo("2026-08"), periodo("2026-08")), api.resumenCalls)
        assertEquals(State.Loaded(mes("2026-08")), vm.state.value)
    }

    @Test
    fun arrowsWalkThePeriodsListAndStopAtTheEnds() = runTest {
        answers(mes("2026-08"), mes("2026-09"), mes("2026-06"))
        api.onPeriodos = { periodos("2026-09", "2026-08", "2026-06") }
        val vm = viewModel()
        api.onResumen = { mes("2026-08") }
        vm.load()

        // The list is most recent first: older = next in the list, and months without data are skipped.
        assertEquals(periodo("2026-09"), vm.siguiente)
        assertEquals(periodo("2026-06"), vm.anterior)

        api.onResumen = { mes("2026-09") }
        vm.select(checkNotNull(vm.siguiente))
        assertNull(vm.siguiente)
        assertEquals(periodo("2026-08"), vm.anterior)

        api.onResumen = { mes("2026-06") }
        vm.select(periodo("2026-06"))
        assertNull(vm.anterior)
        assertEquals(periodo("2026-08"), vm.siguiente)
    }

    @Test
    fun switchingMonthHidesTheOldOneWhileTheNewOneLoads() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09", "2026-08") }
        val vm = viewModel()
        vm.load()
        val gate = CompletableDeferred<ResumenMes>()
        api.onResumen = { gate.await() }

        val switching = launch { vm.select(periodo("2026-08")) }
        runCurrent()

        assertEquals(State.Loading, vm.state.value)
        gate.complete(mes("2026-08"))
        switching.join()
        assertEquals(State.Loaded(mes("2026-08")), vm.state.value)
    }

    @Test
    fun aLateAnswerForAnOlderChoiceDoesNotOverwriteTheNewerOne() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09", "2026-08", "2026-07") }
        val vm = viewModel()
        vm.load()
        val slow = CompletableDeferred<ResumenMes>()
        api.onResumen = { p -> if (p == periodo("2026-07")) slow.await() else mes("2026-08") }

        val first = launch { vm.select(periodo("2026-07")) }
        runCurrent()
        vm.select(periodo("2026-08"))
        slow.complete(mes("2026-07"))
        first.join()

        assertEquals(State.Loaded(mes("2026-08")), vm.state.value)
    }

    @Test
    fun aLateFailureForAnOlderChoiceDoesNotReplaceTheNewerMonthEither() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09", "2026-08", "2026-07") }
        val vm = viewModel()
        vm.load()
        val slow = CompletableDeferred<ResumenMes>()
        api.onResumen = { p -> if (p == periodo("2026-07")) slow.await() else mes("2026-08") }

        val first = launch { vm.select(periodo("2026-07")) }
        runCurrent()
        vm.select(periodo("2026-08"))
        slow.completeExceptionally(IOException("late"))
        first.join()

        assertEquals(State.Loaded(mes("2026-08")), vm.state.value)
    }

    @Test
    fun refreshKeepsTheContentAndShowsFreshData() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()
        vm.load()
        answers(mes("2026-09", ingreso = 2_000_000))

        vm.refresh()

        assertEquals(State.Loaded(mes("2026-09", ingreso = 2_000_000)), vm.state.value)
        assertEquals(listOf<Periodo?>(null, periodo("2026-09")), api.resumenCalls)
        assertFalse(vm.refreshing.value)
    }

    @Test
    fun refreshIsShownWhileItRunsAndNeverBlanksTheMonth() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()
        vm.load()
        val gate = CompletableDeferred<ResumenMes>()
        api.onResumen = { gate.await() }

        val refreshing = launch { vm.refresh() }
        runCurrent()

        assertTrue(vm.refreshing.value)
        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
        gate.complete(mes("2026-09"))
        refreshing.join()
        assertFalse(vm.refreshing.value)
    }

    @Test
    fun aFailedRefreshKeepsTheMonthOnScreen() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()
        vm.load()
        api.onResumen = { throw SocketTimeoutException() }

        vm.refresh()

        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
        assertFalse(vm.refreshing.value)
    }

    @Test
    fun aCancelledRefreshResetsTheIndicatorAndRethrows() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { periodos("2026-09") }
        val vm = viewModel()
        vm.load()
        api.onResumen = { throw CancellationException("left") }

        assertThrows(CancellationException::class.java) { runBlocking { vm.refresh() } }

        assertFalse(vm.refreshing.value)
        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
    }

    @Test
    fun aFailingPeriodsListDoesNotHideTheSummary() = runTest {
        answers(mes("2026-09"))
        api.onPeriodos = { throw SocketTimeoutException() }
        val vm = viewModel()

        vm.load()

        assertEquals(State.Loaded(mes("2026-09")), vm.state.value)
        assertTrue(vm.periodos.value.isEmpty())
        assertNull(vm.anterior)
        assertNull(vm.siguiente)
    }

    @Test
    fun aRejectedSessionShowsNoError() = runTest {
        api.onResumen = { throw SessionExpiredException() }
        api.onPeriodos = { throw SessionExpiredException() }
        val vm = viewModel()

        vm.load()

        assertEquals(State.Loading, vm.state.value)
    }

    @Test
    fun aRejectedSessionSignsOutThroughTheSingle401PathAndShowsNoError() = runBlocking<Unit> {
        val server = MockWebServer().apply { start() }
        try {
            server.enqueue(
                MockResponse.Builder().code(401).addHeader("Content-Type", "application/json")
                    .body("""{"message":"x","code":"SESION_INVALIDA"}""").build(),
            )
            server.enqueue(
                MockResponse.Builder().code(401).addHeader("Content-Type", "application/json")
                    .body("""{"message":"x","code":"SESION_INVALIDA"}""").build(),
            )
            val store = InMemorySessionStore(Session("tok-sent", "u-1", Instant.parse("2030-01-01T00:00:00Z")))
            var controller: SessionController? = null
            val real = MirachApiFactory.create(
                baseUrl = server.url("/").toString(),
                apiKey = "k",
                tokenProvider = { store.load()?.token },
                onSessionExpired = { controller?.sessionExpired(it) },
            )
            controller = SessionController(real, store).also { it.signIn(checkNotNull(store.load())) }
            val vm = ResumenViewModel(real)

            vm.load()

            assertEquals(Phase.SignedOut, controller.phase.value)
            assertNull(store.load())
            assertTrue("an expired session must not show an error", vm.state.value !is State.Failed)
        } finally {
            server.close()
        }
    }
}
