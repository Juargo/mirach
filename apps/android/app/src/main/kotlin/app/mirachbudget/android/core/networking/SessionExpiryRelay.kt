package app.mirachbudget.android.core.networking

/**
 * Lets the API adapter (built first) tell the `SessionController` (built second) that a 401
 * `SESION_INVALIDA` arrived, without either holding the other. The one place an expiry is reported.
 */
class SessionExpiryRelay {
    @Volatile
    private var receiver: ((String) -> Unit)? = null

    fun connect(receiver: (String) -> Unit) {
        this.receiver = receiver
    }

    /** [token] identifies the session that was rejected. */
    fun fire(token: String) {
        receiver?.invoke(token)
    }
}
