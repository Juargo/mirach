package app.mirachbudget.android.core.session

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.ApiKeyRejectedException
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.testing.FakeMirachApi
import app.mirachbudget.android.testing.InMemorySessionStore
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SessionControllerTest {
    private val session = Session("tok-1", "u-1", Instant.parse("2026-12-01T00:00:00Z"))
    private val api = FakeMirachApi()

    private fun controller(store: InMemorySessionStore) = SessionController(api, store)

    @Test
    fun startsValidating() {
        assertEquals(Phase.Validating, controller(InMemorySessionStore()).phase.value)
    }

    @Test
    fun withoutASavedSessionStartGoesToSignInWithoutCallingTheApi() = runTest {
        val controller = controller(InMemorySessionStore())

        controller.start()

        assertEquals(Phase.SignedOut, controller.phase.value)
        assertEquals(0, api.currentUserCalls)
    }

    @Test
    fun aValidSavedSessionSignsIn() = runTest {
        api.onCurrentUser = { CurrentUser("u-1", "Ana") }
        val controller = controller(InMemorySessionStore(session))

        controller.start()

        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
    }

    @Test
    fun aRejectedSessionIsClearedAndSignsOut() = runTest {
        api.onCurrentUser = { throw SessionExpiredException() }
        val store = InMemorySessionStore(session)
        val controller = controller(store)
        var ended = 0
        controller.onSessionEnded = { ended++ }

        controller.start()

        assertEquals(Phase.SignedOut, controller.phase.value)
        assertNull(store.load())
        assertEquals(1, ended)
    }

    @Test
    fun aNetworkErrorKeepsTheSessionAndOffersRetry() = runTest {
        api.onCurrentUser = { throw IOException("offline") }
        val store = InMemorySessionStore(session)
        val controller = controller(store)

        controller.start()

        assertEquals(Phase.ConnectionFailed, controller.phase.value)
        assertNotNull(store.load())
    }

    @Test
    fun aServerErrorKeepsTheSessionToo() = runTest {
        api.onCurrentUser = { throw ApiException(503) }
        val store = InMemorySessionStore(session)
        val controller = controller(store)

        controller.start()

        assertEquals(Phase.ConnectionFailed, controller.phase.value)
        assertNotNull(store.load())
    }

    @Test
    fun retryAfterAFailureValidatesAgain() = runTest {
        var offline = true
        api.onCurrentUser = { if (offline) throw IOException() else CurrentUser("u-1", "Ana") }
        val controller = controller(InMemorySessionStore(session))
        controller.start()
        offline = false

        controller.start()

        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
    }

    @Test
    fun aRejectedApiKeyKeepsTheSessionAndIsMisconfigured() = runTest {
        api.onCurrentUser = { throw ApiKeyRejectedException() }
        val store = InMemorySessionStore(session)
        val controller = controller(store)

        controller.start()

        assertEquals(Phase.Misconfigured, controller.phase.value)
        assertNotNull(store.load())
    }

    @Test
    fun cancellationLeavesTheStateAsItWasAndPropagates() = runTest {
        api.onCurrentUser = { throw CancellationException("gone") }
        val controller = controller(InMemorySessionStore(session))

        var propagated = false
        try {
            controller.start()
        } catch (_: CancellationException) {
            propagated = true
        }

        assertTrue(propagated)
        assertEquals(Phase.Validating, controller.phase.value)
    }

    @Test
    fun signInSavesTheSessionAndOpensTheSignedInArea() {
        val store = InMemorySessionStore()
        val controller = controller(store)

        controller.signIn(session)

        assertEquals(session, store.load())
        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
    }

    @Test
    fun signInThatCannotBeStoredThrowsAndStaysSignedOut() {
        val store = InMemorySessionStore().apply { failOnSave = true }
        val controller = controller(store)
        controller.phase.value.let { assertEquals(Phase.Validating, it) }

        assertThrows(IllegalStateException::class.java) { controller.signIn(session) }

        assertEquals(Phase.Validating, controller.phase.value)
    }

    @Test
    fun signOutClearsTheStoreAndRunsTheHook() {
        val store = InMemorySessionStore(session)
        val controller = controller(store)
        var ended = 0
        controller.onSessionEnded = { ended++ }

        controller.signOut()

        assertNull(store.load())
        assertEquals(Phase.SignedOut, controller.phase.value)
        assertEquals(1, ended)
    }

    @Test
    fun signOutStillShowsSignedOutWhenTheStoreCannotClear() {
        val store = InMemorySessionStore(session).apply { failOnClear = true }
        val controller = controller(store)

        controller.signOut()

        assertEquals(Phase.SignedOut, controller.phase.value)
    }

    @Test
    fun anExpiryForTheCurrentTokenSignsOut() {
        val store = InMemorySessionStore(session)
        val controller = controller(store)
        controller.signIn(session)

        controller.sessionExpired("tok-1")

        assertEquals(Phase.SignedOut, controller.phase.value)
        assertNull(store.load())
    }

    @Test
    fun aLateExpiryForAnOlderTokenDoesNotEndTheNewSession() {
        val store = InMemorySessionStore(session)
        val controller = controller(store)
        controller.signIn(session.copy(token = "tok-2"))

        controller.sessionExpired("tok-1")

        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
        assertEquals("tok-2", store.load()?.token)
    }
}
