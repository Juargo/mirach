package app.mirachbudget.android.core.networking

import okhttp3.Interceptor
import okhttp3.Response

/**
 * Adds the public client key (ADR-047) and the session Bearer token, only on `/api` paths:
 * `/version` is public and must not receive credentials.
 */
class ApiAuthInterceptor(
    private val apiKey: String,
    private val tokenProvider: AuthTokenProvider,
) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val path = request.url.encodedPath
        if (path != "/api" && !path.startsWith("/api/")) return chain.proceed(request)

        val authenticated = request.newBuilder().header("x-api-key", apiKey)
        tokenProvider.token()?.let { authenticated.header("Authorization", "Bearer $it") }
        return chain.proceed(authenticated.build())
    }
}
