package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.apis.DefaultApi
import app.mirachbudget.android.core.api.generated.models.ApiAuthGoogleTokenPostRequest
import app.mirachbudget.android.core.api.generated.models.ApiAuthLoginPostRequest
import app.mirachbudget.android.core.api.generated.models.AuthLoginResponse
import app.mirachbudget.android.core.session.Session
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import retrofit2.Response

/**
 * [MirachApi] over the generated Retrofit client. It translates responses into app types and
 * deliberately catches no I/O: timeouts, I/O and decoding failures reach the caller as they are,
 * and a coroutine cancellation stays a `CancellationException` (never mapped to an error).
 *
 * [onSessionExpired] receives the token that was rejected whenever an authenticated call gets 401
 * `SESION_INVALIDA`: the single place that notices an expired session, so no screen has to
 * remember to handle it. The token is read when the call starts, so a late answer is attributed to
 * the session it was sent with.
 */
class GeneratedMirachApi(
    private val api: DefaultApi,
    private val tokenProvider: AuthTokenProvider = AuthTokenProvider.None,
    private val onSessionExpired: (String) -> Unit = {},
) : MirachApi {
    override suspend fun version(): VersionInfo {
        val response = api.versionGet()
        if (!response.isSuccessful) throw ApiException(response.code())
        val body = response.body() ?: throw SerializationException("Empty body for GET /version")
        return VersionInfo(version = body.version, commit = body.commit)
    }

    override suspend fun capabilities(): AuthCapabilities {
        val response = api.apiAuthCapabilitiesGet()
        if (response.code() == 401) throw rejectedKey(response)
        val body = response.bodyOrThrow("GET /api/auth/capabilities")
        return AuthCapabilities(
            googleLoginEnabled = body.googleLoginMobileEnabled,
            passwordLoginEnabled = body.passwordLoginEnabled,
        )
    }

    override suspend fun signInWithGoogle(idToken: String): Session =
        toSession(api.apiAuthGoogleTokenPost(ApiAuthGoogleTokenPostRequest(idToken = idToken)), providerSwitchedOff404 = true)

    override suspend fun signInWithPassword(email: String, password: String): Session =
        toSession(api.apiAuthLoginPost(ApiAuthLoginPostRequest(email = email, password = password)), providerSwitchedOff404 = false)

    override suspend fun currentUser(): CurrentUser {
        val sentToken = tokenProvider.token()
        val response = api.apiAuthMeGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        val me = response.bodyOrThrow("GET /api/auth/me")
        return CurrentUser(userId = me.userId, nombre = me.nombre, email = me.email)
    }

    override suspend fun resumen(periodo: Periodo?): ResumenMes {
        val sentToken = tokenProvider.token()
        val response = api.apiResumenGet(periodo?.apiValue)
        if (response.code() == 401) throw rejection(response, sentToken)
        return ResumenMapper.map(response.bodyOrThrow("GET /api/resumen"))
    }

    override suspend fun periodos(): List<Periodo> {
        val sentToken = tokenProvider.token()
        val response = api.apiPeriodosGet()
        if (response.code() == 401) throw rejection(response, sentToken)
        return response.bodyOrThrow("GET /api/periodos").periodos.map(ResumenMapper::periodo)
    }

    /**
     * Every authenticated endpoint funnels its 401 through here, so the expired-session
     * notification lives in exactly one place.
     */
    private fun rejection(response: Response<*>, sentToken: String?): Exception = when (errorCode(response)) {
        "SESION_INVALIDA" -> {
            sentToken?.let(onSessionExpired)
            SessionExpiredException()
        }
        "API_KEY_INVALIDA" -> ApiKeyRejectedException()
        else -> ApiException(401)
    }

    /** A failed sign-in is never "session expired": there is no session yet. */
    private fun toSession(response: Response<AuthLoginResponse>, providerSwitchedOff404: Boolean): Session {
        when (response.code()) {
            401 -> throw when (errorCode(response)) {
                "API_KEY_INVALIDA" -> ApiKeyRejectedException()
                "CREDENCIALES_INVALIDAS" -> InvalidCredentialsException()
                else -> ApiException(401)
            }
            404 -> if (providerSwitchedOff404) throw SignInUnavailableException()
            429 -> throw RateLimitedException()
        }
        val login = response.bodyOrThrow("sign-in")
        val expiresAt = try {
            Instant.parse(login.expiresAt)
        } catch (e: DateTimeParseException) {
            throw SerializationException("expiresAt is not an ISO 8601 instant", e)
        }
        return Session(token = login.token, userId = login.userId, expiresAt = expiresAt)
    }

    private fun rejectedKey(response: Response<*>): Exception =
        if (errorCode(response) == "API_KEY_INVALIDA") ApiKeyRejectedException() else ApiException(401)

    private fun <T> Response<T>.bodyOrThrow(what: String): T {
        if (!isSuccessful) throw ApiException(code())
        return body() ?: throw SerializationException("Empty body for $what")
    }

    private fun errorCode(response: Response<*>): String? = try {
        response.errorBody()?.string()?.let { errorJson.decodeFromString<ErrorBody>(it).code }
    } catch (_: SerializationException) {
        null
    } catch (_: IllegalArgumentException) {
        null
    }

    @kotlinx.serialization.Serializable
    private class ErrorBody(val code: String? = null)

    private companion object {
        val errorJson = Json { ignoreUnknownKeys = true }
    }
}
