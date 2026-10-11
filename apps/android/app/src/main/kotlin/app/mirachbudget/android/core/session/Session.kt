package app.mirachbudget.android.core.session

import java.time.Instant

/** A signed-in session as the API returns it (`AuthLoginResponse`). */
data class Session(val token: String, val userId: String, val expiresAt: Instant)

/**
 * Where the session lives between launches. An interface so tests use an in-memory fake while the
 * app uses [EncryptedSessionStore].
 */
interface SessionStore {
    /** The saved session, or null when there is none or what was stored cannot be read. */
    fun load(): Session?

    /** Throws when the write fails: better an error than a session that vanishes next launch. */
    fun save(session: Session)

    /** Throws when the stored session could not be deleted (it would come back next launch). */
    fun clear()
}
