package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.apis.DefaultApi
import kotlinx.serialization.SerializationException

/**
 * [MirachApi] over the generated Retrofit client. It translates responses into app types and
 * deliberately catches nothing: timeouts, I/O and decoding failures reach the caller as they are,
 * and a coroutine cancellation stays a `CancellationException` (never mapped to an error).
 */
class GeneratedMirachApi(private val api: DefaultApi) : MirachApi {
    override suspend fun version(): VersionInfo {
        val response = api.versionGet()
        if (!response.isSuccessful) throw ApiException(response.code())
        val body = response.body() ?: throw SerializationException("Empty body for GET /version")
        return VersionInfo(version = body.version, commit = body.commit)
    }
}
