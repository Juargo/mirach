package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.session.Session

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

    /** `GET /api/auth/capabilities`: which providers can be offered. Needs only the API key. */
    suspend fun capabilities(): AuthCapabilities

    /**
     * `POST /api/auth/google/token`. Throws [InvalidCredentialsException], [ApiKeyRejectedException],
     * [SignInUnavailableException] (404), [RateLimitedException] or [ApiException].
     */
    suspend fun signInWithGoogle(idToken: String): Session

    /** `POST /api/auth/login` (App Review account, ADR-051). Same errors as Google, minus 404. */
    suspend fun signInWithPassword(email: String, password: String): Session

    /**
     * `GET /api/auth/me`. Throws [SessionExpiredException] on 401 `SESION_INVALIDA` (also reported
     * once through the [SessionExpiryRelay]) and [ApiKeyRejectedException] on `API_KEY_INVALIDA`.
     */
    suspend fun currentUser(): CurrentUser

    /**
     * `PATCH /api/perfil` with only the name; answers the updated identity. Throws
     * [InvalidNameException] for `NOMBRE_INVALIDO`, [SessionExpiredException] on 401.
     */
    suspend fun updateNombre(nombre: String): CurrentUser

    /** `POST /api/auth/logout`: revokes the session on the server. Throws on any failure; the caller signs out locally either way. */
    suspend fun logout()

    /**
     * `DELETE /api/cuenta` with `{"confirmacion": confirmacion}`. Throws [ConfirmationRejectedException]
     * for `CONFIRMACION_INVALIDA` and [SessionExpiredException] on 401.
     */
    suspend fun deleteAccount(confirmacion: String)

    /** `GET /api/resumen`. `null` lets the API resolve the latest month with movements. */
    suspend fun resumen(periodo: Periodo?): ResumenMes

    /** `GET /api/periodos`: months with movements, most recent first. */
    suspend fun periodos(): List<Periodo>
}

/** The server answered with a non-2xx status. */
class ApiException(val status: Int) : Exception("HTTP $status")
