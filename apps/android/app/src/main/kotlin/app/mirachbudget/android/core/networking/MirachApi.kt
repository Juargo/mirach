package app.mirachbudget.android.core.networking

/** What the first screen shows from the public `GET /version` endpoint. */
data class VersionInfo(val version: String, val commit: String)

/**
 * What screens need from the API. Screens depend on this interface, never on the generated types,
 * so a contract change is absorbed in the adapter. Mirrors `MirachAPI` on iOS; endpoints are added
 * here as the screens that use them are built.
 */
interface MirachApi {
    /** Public `GET /version`: the deployed build of the API. */
    suspend fun version(): VersionInfo
}

/** The server answered with a non-2xx status. */
class ApiException(val status: Int) : Exception("HTTP $status")
