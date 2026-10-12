package app.mirachbudget.android.core.networking

/** Source of the session token sent as `Authorization: Bearer`. */
fun interface AuthTokenProvider {
    /** The current session token, or null when nobody is signed in. */
    fun token(): String?

    companion object {
        /** No session: used by tests and by calls made before sign-in. */
        val None = AuthTokenProvider { null }
    }
}
