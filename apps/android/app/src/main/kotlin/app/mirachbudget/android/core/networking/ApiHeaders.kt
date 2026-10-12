package app.mirachbudget.android.core.networking

/** The public client key (ADR-047) goes only to `/api` paths; `/version` is public. */
object ApiHeaders {
    fun forPath(path: String, apiKey: String): Map<String, String> =
        if (path == "/api" || path.startsWith("/api/")) mapOf("x-api-key" to apiKey) else emptyMap()
}
