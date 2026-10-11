package app.mirachbudget.android.core.networking

/** Source of the session token sent as `Authorization: Bearer`. */
fun interface AuthTokenProvider {
    /** The current session token, or null when nobody is signed in. */
    fun token(): String?

    companion object {
        /** No session yet; replaced by the real store when sign-in lands. */
        val None = AuthTokenProvider { null }
    }
}
