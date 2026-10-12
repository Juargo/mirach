package app.mirachbudget.android.core.session

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.core.session.SessionController.SignedOutNotice
import app.mirachbudget.android.testing.FakeMirachApi
import app.mirachbudget.android.testing.InMemorySessionStore
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.delay
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** Every way a session ends: logout with the server, account deletion, 401. */
class SessionEndTest {
    private val saved = Session("tok-123", "u-1", Instant.parse("2026-12-01T00:00:00Z"))
    private val api = FakeMirachApi().apply { onCurrentUser = { CurrentUser("u-1", "Ana") } }
    private val store = InMemorySessionStore(saved)
    private val controller = SessionController(api, store)

    // --- logout

    @Test
    fun logoutCallsTheServerBeforeClearingTheTokenThenSignsOut() = runTest {
        controller.start()
        var tokenSeenByTheCall: String? = null
        api.onLogout = { tokenSeenByTheCall = store.load()?.token }

        controller.signOutRemotely()

        assertEquals(1, api.logoutCalls)
        assertEquals("tok-123", tokenSeenByTheCall)
        assertNull(store.load())
        assertEquals(Phase.SignedOut, controller.phase.value)
    }

    @Test
    fun aFailedLogoutStillSignsOutLocallyWithoutAnError() = runTest {
        for (failure in listOf(IOException("offline"), ApiException(503), IllegalStateException("odd"))) {
            val store = InMemorySessionStore(saved)
            val api = FakeMirachApi().apply { onLogout = { throw failure } }
            val controller = SessionController(api, store)

            controller.signOutRemotely()

            assertEquals("$failure", 1, api.logoutCalls)
            assertNull("$failure", store.load())
            assertEquals("$failure", Phase.SignedOut, controller.phase.value)
        }
    }

    @Test
    fun aSlowLogoutDoesNotKeepThePersonWaiting() = runTest {
        api.onLogout = { delay(60_000) }

        controller.signOutRemotely(timeoutMillis = 50)

        assertEquals(50L, testScheduler.currentTime)
        assertNull(store.load())
        assertEquals(Phase.SignedOut, controller.phase.value)
    }

    @Test
    fun theDefaultCapIsFiveSeconds() = runTest {
        api.onLogout = { delay(60_000) }

        controller.signOutRemotely()

        assertEquals(5_000L, testScheduler.currentTime)
        assertEquals(Phase.SignedOut, controller.phase.value)
    }

    // --- account deletion

    @Test
    fun aDeletedAccountClearsTheSessionAndLeavesANoticeForSignIn() = runTest {
        controller.start()

        controller.accountDeleted()

        assertNull(store.load())
        assertEquals(Phase.SignedOut, controller.phase.value)
        assertEquals(SignedOutNotice.AccountDeleted, controller.signedOutNotice.value)
    }

    @Test
    fun theNoticeDisappearsWithTheNextSignIn() = runTest {
        controller.accountDeleted()

        controller.signIn(saved)

        assertNull(controller.signedOutNotice.value)
    }

    @Test
    fun aPlainSignOutLeavesNoNotice() {
        controller.signOut()
        assertNull(controller.signedOutNotice.value)
    }

    // --- local cleanup hook

    @Test
    fun everyWayOfEndingTheSessionRunsTheCleanup() = runTest {
        var ended = 0
        controller.onSessionEnded = { ended++ }

        controller.signOut()
        assertEquals(1, ended)

        controller.signIn(saved)
        controller.accountDeleted()
        assertEquals(2, ended)

        controller.signIn(saved)
        controller.sessionExpired("tok-123")
        assertEquals(3, ended)

        controller.signIn(saved)
        controller.signOutRemotely()
        assertEquals(4, ended)
    }
}
