package app.mirachbudget.android.core.networking

/** What the first screen shows from the public `GET /version` endpoint. */
data class VersionInfo(val version: String, val commit: String)

/** The API calls the app needs; T2 replaces the implementation with the generated client. */
interface VersionApi {
    suspend fun version(): VersionInfo
}

/** The server answered with a non-2xx status. */
class ApiException(val status: Int) : Exception("HTTP $status")
