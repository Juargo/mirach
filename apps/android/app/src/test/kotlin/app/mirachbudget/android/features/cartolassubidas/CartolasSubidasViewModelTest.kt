package app.mirachbudget.android.features.cartolassubidas

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.CartolaNotFoundException
import app.mirachbudget.android.core.networking.CartolaSubida
import app.mirachbudget.android.core.networking.MirachApiFactory
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionController
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.cartolas
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.fallida
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasSamples.procesada
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Content
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Failure
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Message
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
import org.junit.Assert.assertTrue
import org.junit.Test

class CartolasSubidasViewModelTest {
    private val api = FakeMirachApi()
    private var changes = 0
    private val rest = cartolas.drop(1)

    private fun viewModel() = CartolasSubidasViewModel(api, onChange = { changes++ })

    /** Each list call takes the next answer; the last one repeats. */
    private fun answers(vararg results: () -> List<CartolaSubida>) {
        var index = 0
        api.onCartolasSubidas = { results[minOf(index++, results.lastIndex)]() }
    }

    private suspend fun loaded(): CartolasSubidasViewModel {
        val vm = viewModel()
        vm.load()
        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        return vm
    }

    // --- loading

    @Test
    fun startsLoadingThenShowsTheImportsInTheServerOrder() = runTest {
        answers({ cartolas })
        val vm = viewModel()
        assertEquals(Content.Loading, vm.state.value.content)

        vm.load()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        assertEquals(1, api.cartolasSubidasCalls)
    }

    @Test
    fun noImportsIsALoadedEmptyListSoTheScreenCanOfferToUpload() = runTest {
        answers({ emptyList() })
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Loaded(emptyList()), vm.state.value.content)
    }

    @Test
    fun aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() = runTest {
        answers({ throw IOException("offline") }, { cartolas })
        val vm = viewModel()

        vm.load()
        assertEquals(Content.Failed(Failure.Connection), vm.state.value.content)

        vm.retry()
        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
    }

    @Test
    fun serverAndDecodingProblemsAreServerFailures() = runTest {
        for (error in listOf(ApiException(503), SerializationException("bad"))) {
            api.onCartolasSubidas = { throw error }
            val vm = viewModel()
            vm.load()
            assertEquals(error.toString(), Content.Failed(Failure.Server), vm.state.value.content)
        }
    }

    @Test
    fun cancellationLeavesTheStateAloneAndStaysACancellation() = runTest {
        api.onCartolasSubidas = { throw CancellationException("gone") }
        val vm = viewModel()

        var cancelled = false
        try {
            vm.load()
        } catch (_: CancellationException) {
            cancelled = true
        }

        assertTrue(cancelled)
        assertEquals(Content.Loading, vm.state.value.content)
    }

    @Test
    fun anExpiredSessionShowsNoError() = runTest {
        api.onCartolasSubidas = { throw SessionExpiredException() }
        val vm = viewModel()

        vm.load()

        assertEquals(Content.Loading, vm.state.value.content)
    }

    @Test
    fun aRejectedSessionSignsOutThroughTheSingle401PathAndShowsNoError() = runBlocking<Unit> {
        val server = MockWebServer().apply { start() }
        try {
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
            val vm = CartolasSubidasViewModel(real)

            vm.load()

            assertEquals(Phase.SignedOut, controller.phase.value)
            assertNull(store.load())
            assertTrue("an expired session must not show an error", vm.state.value.content !is Content.Failed)
        } finally {
            server.close()
        }
    }

    // --- stale answers and appearing again

    @Test
    fun aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() = runTest {
        answers({ cartolas })
        val vm = loaded()
        val gate = CompletableDeferred<List<CartolaSubida>>()
        api.onCartolasSubidas = { gate.await() }

        val first = launch { vm.refresh() }
        runCurrent()
        answers({ cartolas })
        vm.refresh()
        gate.complete(emptyList())
        first.join()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
    }

    @Test
    fun aLateFailureFromAnOlderRequestDoesNotReplaceTheNewerList() = runTest {
        answers({ cartolas })
        val vm = loaded()
        val gate = CompletableDeferred<List<CartolaSubida>>()
        api.onCartolasSubidas = { gate.await() }

        val first = launch { vm.retry() }
        runCurrent()
        answers({ cartolas })
        vm.refresh()
        gate.completeExceptionally(SocketTimeoutException())
        first.join()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        assertNull(vm.state.value.refreshNotice)
    }

    @Test
    fun aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() = runTest {
        answers({ throw CancellationException("gone") }, { cartolas })
        val vm = viewModel()

        try {
            vm.loadIfNeeded()
        } catch (_: CancellationException) {
        }
        assertEquals(Content.Loading, vm.state.value.content)

        vm.loadIfNeeded()
        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        vm.loadIfNeeded()
        assertEquals("appearing again must not reload and blank the list", 2, api.cartolasSubidasCalls)
    }

    @Test
    fun aFailedLoadStillCountsAsFinishedSoTheErrorIsNotRetriedOnReappearing() = runTest {
        answers({ throw ApiException(503) }, { cartolas })
        val vm = viewModel()

        vm.loadIfNeeded()
        vm.loadIfNeeded()

        assertEquals(Content.Failed(Failure.Server), vm.state.value.content)
        assertEquals(1, api.cartolasSubidasCalls)
    }

    @Test
    fun anInitialLoadSupersededByARefreshStillMarksTheListLoaded() = runTest {
        val gate = CompletableDeferred<List<CartolaSubida>>()
        api.onCartolasSubidas = { gate.await() }
        val vm = viewModel()

        val initial = launch { vm.loadIfNeeded() }
        runCurrent()
        answers({ cartolas })
        vm.refresh()
        gate.complete(cartolas)
        initial.join()
        vm.loadIfNeeded()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        assertEquals("appearing again must not reload and blank the list", 2, api.cartolasSubidasCalls)
    }

    // --- refresh

    @Test
    fun aFailedRefreshKeepsTheListAndSaysSoUntilTheNextSuccess() = runTest {
        answers({ cartolas })
        val vm = loaded()
        api.onCartolasSubidas = { throw SocketTimeoutException() }

        vm.refresh()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
        assertEquals("No se pudo actualizar la lista.", vm.state.value.refreshNotice)
        assertFalse(vm.state.value.isRefreshing)

        answers({ cartolas })
        vm.refresh()
        assertNull(vm.state.value.refreshNotice)
    }

    @Test
    fun refreshingIsReportedWhileThePullRuns() = runTest {
        answers({ cartolas })
        val vm = loaded()
        val gate = CompletableDeferred<List<CartolaSubida>>()
        api.onCartolasSubidas = { gate.await() }

        val pull = launch { vm.refresh() }
        runCurrent()
        assertTrue(vm.state.value.isRefreshing)
        assertEquals("the list stays on screen", Content.Loaded(cartolas), vm.state.value.content)

        gate.complete(rest)
        pull.join()
        assertFalse(vm.state.value.isRefreshing)
        assertEquals(Content.Loaded(rest), vm.state.value.content)
    }

    @Test
    fun refreshWithoutAListIsARetry() = runTest {
        answers({ throw IOException("offline") }, { cartolas })
        val vm = viewModel()
        vm.load()

        vm.refresh()

        assertEquals(Content.Loaded(cartolas), vm.state.value.content)
    }

    // --- deleting

    @Test
    fun askingToDeleteOnlyAsksAndCancellingChangesNothing() = runTest {
        answers({ cartolas })
        val vm = loaded()

        vm.requestDeletion(procesada)
        assertEquals(procesada, vm.state.value.pendingDeletion)
        assertEquals(emptyList<String>(), api.eliminarCartolaCalls)

        vm.cancelDeletion()
        assertNull(vm.state.value.pendingDeletion)
        assertEquals(emptyList<String>(), api.eliminarCartolaCalls)
    }

    @Test
    fun confirmingDeletesThatImportDropsItAnnouncesAndReloadsTheList() = runTest {
        answers({ cartolas }, { rest })
        val vm = loaded()

        vm.requestDeletion(procesada)
        vm.confirmDeletion(procesada)

        assertEquals(listOf("g-3"), api.eliminarCartolaCalls)
        assertEquals(Content.Loaded(rest), vm.state.value.content)
        assertEquals(Message.Deleted, vm.state.value.message)
        assertNull(vm.state.value.pendingDeletion)
        assertEquals(emptySet<String>(), vm.state.value.deleting)
        assertEquals("the list is reloaded after the deletion", 2, api.cartolasSubidasCalls)
        assertEquals("the Resumen is told to reload", 1, changes)
    }

    @Test
    fun theRowIsDisabledWhileTheServerAnswersAndASecondConfirmIsIgnored() = runTest {
        answers({ cartolas })
        val vm = loaded()
        val gate = CompletableDeferred<Unit>()
        api.onEliminarCartola = { gate.await() }

        vm.requestDeletion(procesada)
        val first = launch { vm.confirmDeletion(procesada) }
        runCurrent()
        assertEquals(setOf("g-3"), vm.state.value.deleting)

        vm.requestDeletion(procesada)
        assertNull("a row being deleted cannot be asked about again", vm.state.value.pendingDeletion)
        vm.confirmDeletion(procesada)
        gate.complete(Unit)
        first.join()

        assertEquals(listOf("g-3"), api.eliminarCartolaCalls)
        assertEquals(emptySet<String>(), vm.state.value.deleting)
    }

    @Test
    fun anImportThatIsAlreadyGoneIsRemovedAndSaidSo() = runTest {
        api.onEliminarCartola = { throw CartolaNotFoundException() }
        answers({ cartolas }, { rest })
        val vm = loaded()

        vm.requestDeletion(procesada)
        vm.confirmDeletion(procesada)

        assertEquals(Message.AlreadyGone, vm.state.value.message)
        assertEquals(Content.Loaded(rest), vm.state.value.content)
        // As after a 204: the Resumen reloads and the list is fetched again.
        assertEquals(1, changes)
        assertEquals(2, api.cartolasSubidasCalls)
    }

    @Test
    fun aFailedDeletionKeepsTheRowAvailableAndExplains() = runTest {
        for (error in listOf(SocketTimeoutException(), ApiException(500))) {
            val api = FakeMirachApi()
            api.onCartolasSubidas = { cartolas }
            api.onEliminarCartola = { throw error }
            var changed = 0
            val vm = CartolasSubidasViewModel(api, onChange = { changed++ })
            vm.load()

            vm.requestDeletion(procesada)
            vm.confirmDeletion(procesada)

            assertEquals(Message.Failed, vm.state.value.message)
            assertEquals(Content.Loaded(cartolas), vm.state.value.content)
            assertEquals(emptySet<String>(), vm.state.value.deleting)
            assertEquals("nothing changed: no reload", 1, api.cartolasSubidasCalls)
            assertEquals(0, changed)
        }
    }

    @Test
    fun aDeletionRejectedBySessionShowsNoMessage() = runTest {
        api.onEliminarCartola = { throw SessionExpiredException() }
        answers({ cartolas })
        val vm = loaded()

        vm.requestDeletion(procesada)
        vm.confirmDeletion(procesada)

        assertNull(vm.state.value.message)
        assertEquals(emptySet<String>(), vm.state.value.deleting)
        assertEquals(0, changes)
    }

    @Test
    fun aListRequestedBeforeTheDeletionFinishedCannotBringTheRowBack() = runTest {
        answers({ cartolas })
        val vm = loaded()
        // A refresh starts now and will answer, late, with the old list (it still has the row).
        val gate = CompletableDeferred<List<CartolaSubida>>()
        api.onCartolasSubidas = { gate.await() }
        val stale = launch { vm.refresh() }
        runCurrent()
        answers({ rest })

        vm.requestDeletion(procesada)
        vm.confirmDeletion(procesada)
        gate.complete(cartolas)
        stale.join()

        assertEquals(Content.Loaded(rest), vm.state.value.content)
    }

    @Test
    fun aFailedReloadAfterADeletionStillShowsTheRowGoneAndTheNotice() = runTest {
        answers({ cartolas }, { throw SocketTimeoutException() })
        val vm = loaded()

        vm.requestDeletion(procesada)
        vm.confirmDeletion(procesada)

        assertEquals(Content.Loaded(rest), vm.state.value.content)
        assertEquals("No se pudo actualizar la lista.", vm.state.value.refreshNotice)
        assertEquals(Message.Deleted, vm.state.value.message)
    }

    @Test
    fun dismissingTheMessageClearsIt() = runTest {
        api.onEliminarCartola = { throw SocketTimeoutException() }
        answers({ cartolas })
        val vm = loaded()
        vm.requestDeletion(fallida)
        vm.confirmDeletion(fallida)
        assertEquals(Message.Failed, vm.state.value.message)

        vm.dismissMessage()

        assertNull(vm.state.value.message)
    }
}
