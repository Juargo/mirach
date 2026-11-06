package app.mirachbudget.android.core.share

/**
 * Reads the statement another app hands to Mirach (S2, IMP-01): «Compartir» sends it as
 * `ACTION_SEND` with `EXTRA_STREAM`, «Abrir con» as `ACTION_VIEW` with the data URI.
 * Pure Kotlin over strings so it is tested without Android; the activity passes the intent's parts.
 */
object SharedIntentParser {
    const val ACTION_SEND = "android.intent.action.SEND"
    const val ACTION_VIEW = "android.intent.action.VIEW"

    private const val CONTENT_SCHEME = "content"

    /**
     * The URI to offer to [SharedCartolaInbox], or `null` when the intent carries no statement.
     * Only `content://` is accepted: a `file://` URI could point inside the app's own storage.
     * [launchedFromHistory]: reopened from recents, the old share was already handled.
     */
    fun sharedUri(action: String?, stream: String?, data: String?, launchedFromHistory: Boolean = false): String? {
        if (launchedFromHistory) return null
        val uri = when (action) {
            ACTION_SEND -> stream
            ACTION_VIEW -> data
            else -> null
        } ?: return null
        return uri.takeIf { it.substringBefore(':', missingDelimiterValue = "").equals(CONTENT_SCHEME, ignoreCase = true) }
    }
}
