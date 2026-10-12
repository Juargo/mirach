package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.apis.DefaultApi
import app.mirachbudget.android.core.api.generated.infrastructure.ApiClient
import app.mirachbudget.android.core.api.generated.infrastructure.Serializer
import java.util.concurrent.TimeUnit
import okhttp3.OkHttpClient

/** Builds the app's [MirachApi] over the generated client. */
object MirachApiFactory {
    /** Generous: the free Render instance sleeps and its cold start takes up to ~1 minute. */
    const val TIMEOUT_MILLIS = 90_000L

    init {
        // The generated Json is configured once, before its first use. An enum value the app does
        // not know (the spec also lists `null` among them) must not fail a whole response: on a
        // nullable field it reads as null, which the mappers treat as "no state".
        Serializer.kotlinxSerializationJsonConfiguration = {
            coerceInputValues = true
            explicitNulls = false
        }
    }

    fun create(
        baseUrl: String,
        apiKey: String,
        tokenProvider: AuthTokenProvider = AuthTokenProvider.None,
        timeoutMillis: Long = TIMEOUT_MILLIS,
        /** Called with the rejected token when an authenticated call gets 401 `SESION_INVALIDA`. */
        onSessionExpired: (String) -> Unit = {},
    ): MirachApi {
        // Our own builder replaces the generator's default one, which logs request bodies.
        val client = OkHttpClient.Builder()
            .connectTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .readTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .writeTimeout(timeoutMillis, TimeUnit.MILLISECONDS)
            .addInterceptor(ApiAuthInterceptor(apiKey, tokenProvider))
        val service = ApiClient(baseUrl = baseUrl, okHttpClientBuilder = client).createService(DefaultApi::class.java)
        return GeneratedMirachApi(service, tokenProvider, onSessionExpired)
    }
}
