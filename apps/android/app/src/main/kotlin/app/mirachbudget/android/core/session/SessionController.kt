package app.mirachbudget.android.core.session

import android.util.Log
import app.mirachbudget.android.core.networking.ApiKeyRejectedException
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.SessionExpiredException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.withTimeoutOrNull

/** Owns "who is signed in" for the whole app. The root screen only draws [phase]. */
class SessionController(
    private val api: MirachApi,
    private val store: SessionStore,
) {
    sealed interface Phase {
        /** Checking a saved session with the server (or nothing decided yet). */
        data object Validating : Phase
        data object SignedOut : Phase
        data class SignedIn(val userId: String) : Phase

        /** A saved session exists but the server could not be reached: offer retry. */
        data object ConnectionFailed : Phase

        /** The server rejected the app's own client key: no sign-in can fix it. */
        data object Misconfigured : Phase
    }

    private val _phase = MutableStateFlow<Phase>(Phase.Validating)
    val phase: StateFlow<Phase> = _phase

    /** Why the person is on the sign-in screen when it is not their own doing. */
    enum class SignedOutNotice { AccountDeleted }

    private val _signedOutNotice = MutableStateFlow<SignedOutNotice?>(null)

    /** Shown once on the sign-in screen; the next sign-in clears it. */
    val signedOutNotice: StateFlow<SignedOutNotice?> = _signedOutNotice

    /**
     * Extension point for screens that hold person-specific data (the staged statement arrives in
     * T6): they assign a callback to drop that data. Runs after every sign-out or expiry. Nothing
     * is registered yet.
     */
    var onSessionEnded: () -> Unit = {}

    /**
     * Startup: with a saved token ask `GET /api/auth/me`; without one go to sign-in. Idempotent:
     * it only acts while nothing has been decided yet, so activity recreation (rotation, theme)
     * never re-validates a working session. A start cancelled mid-flight leaves the phase
     * undecided, so the next call still validates.
     */
    suspend fun start() {
        if (_phase.value != Phase.Validating) return
        validate()
    }

    /** The explicit "Reintentar": the only way to validate again after [Phase.ConnectionFailed]. */
    suspend fun retry() {
        if (_phase.value != Phase.ConnectionFailed) return
        validate()
    }

    private suspend fun validate() {
        val validatedToken = store.load()?.token
        if (validatedToken == null) {
            _phase.value = Phase.SignedOut
            return
        }
        _phase.value = Phase.Validating
        try {
            _phase.value = Phase.SignedIn(api.currentUser().userId)
        } catch (_: SessionExpiredException) {
            // The adapter also notifies the relay; whichever arrives second finds the session gone.
            sessionExpired(validatedToken)
        } catch (_: ApiKeyRejectedException) {
            // The session is probably fine; the app's key is not. Keep the session.
            _phase.value = Phase.Misconfigured
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            // No answer from the server (offline, timeout, 5xx): do NOT discard the session.
            _phase.value = Phase.ConnectionFailed
        }
    }

    /** Saves a fresh session and opens the signed-in area. Throws when the store refuses the write. */
    fun signIn(session: Session) {
        store.save(session)
        _signedOutNotice.value = null
        _phase.value = Phase.SignedIn(session.userId)
    }

    /**
     * "Cerrar sesión": revokes the session on the server, then signs out locally. The server call is
     * best effort: whatever happens to it (offline, 5xx, no answer within [timeoutMillis]) the
     * person ends up signed out and never sees an error. The request goes out while the token is
     * still stored; the cap keeps a cold server (about 50 s on the free tier) from holding the person.
     */
    suspend fun signOutRemotely(timeoutMillis: Long = LOGOUT_TIMEOUT_MILLIS) {
        try {
            withTimeoutOrNull(timeoutMillis) {
                try {
                    api.logout()
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (_: Exception) {
                    // Best effort.
                }
            }
        } finally {
            // Also when the screen that started this goes away mid-request.
            signOut()
        }
    }

    /** The server deleted the account: no token to revoke, only local state to drop, and a notice for sign-in. */
    fun accountDeleted() {
        _signedOutNotice.value = SignedOutNotice.AccountDeleted
        signOut()
    }

    /** Local sign-out only; [signOutRemotely] is the one that also tells the server. */
    fun signOut() {
        try {
            store.clear()
        } catch (e: Exception) {
            // Still show signed-out, but the token is still stored and would come back next launch.
            // Log the failure type only, never the token.
            Log.e(TAG, "Could not delete the saved session: ${e.javaClass.simpleName}")
        }
        _phase.value = Phase.SignedOut
        onSessionEnded()
    }

    /**
     * The server rejected the session identified by [token]. Notifications arrive asynchronously,
     * so one can be late: it only applies if that token is STILL the current session, otherwise a
     * stale 401 would sign the person out of a newer sign-in.
     */
    fun sessionExpired(token: String) {
        if (store.load()?.token != token) return
        signOut()
    }

    private companion object {
        const val TAG = "MirachSession"
        const val LOGOUT_TIMEOUT_MILLIS = 5_000L
    }
}
