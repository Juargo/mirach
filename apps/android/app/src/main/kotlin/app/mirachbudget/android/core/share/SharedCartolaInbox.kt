package app.mirachbudget.android.core.share

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * The statement shared from another app that the upload flow has not taken yet. It waits here
 * while the person signs in or the flow checks the consent. Holds one URI: a newer share replaces it.
 */
class SharedCartolaInbox {
    private val _pending = MutableStateFlow<String?>(null)

    /** The waiting `content://` URI, or `null`. */
    val pending: StateFlow<String?> = _pending.asStateFlow()

    fun offer(uri: String) {
        _pending.value = uri
    }

    /** Removes [uri] once the flow took it. `false` when a newer share already replaced it. */
    fun consume(uri: String): Boolean = _pending.compareAndSet(uri, null)
}
