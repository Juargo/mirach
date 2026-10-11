package app.mirachbudget.android.core.networking

import java.net.HttpURLConnection
import java.net.URL
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * Hand-written `GET /version` for the skeleton. T2 replaces it with the client generated from
 * `openapi.json`, behind the same [VersionApi] interface.
 */
class HttpVersionApi(
    private val baseUrl: String,
    private val apiKey: String,
    private val timeoutMillis: Int = TIMEOUT_MILLIS,
) : VersionApi {
    @Serializable
    private class VersionDto(val version: String, val commit: String)

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun version(): VersionInfo = withContext(Dispatchers.IO) {
        val path = "/version"
        val connection = URL(baseUrl + path).openConnection() as HttpURLConnection
        try {
            connection.connectTimeout = timeoutMillis
            connection.readTimeout = timeoutMillis
            connection.setRequestProperty("Accept", "application/json")
            ApiHeaders.forPath(path, apiKey).forEach { (name, value) -> connection.setRequestProperty(name, value) }
            val status = connection.responseCode
            if (status !in 200..299) throw ApiException(status)
            val body = connection.inputStream.bufferedReader().use { it.readText() }
            val dto = json.decodeFromString<VersionDto>(body)
            VersionInfo(version = dto.version, commit = dto.commit)
        } finally {
            connection.disconnect()
        }
    }

    private companion object {
        /** Generous: the free Render instance sleeps and its cold start takes up to ~1 minute. */
        const val TIMEOUT_MILLIS = 90_000
    }
}
