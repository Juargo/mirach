package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.ApiCuentaDeleteRequest
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.HTTP

/**
 * `DELETE /api/cuenta`, declared by hand. The generator emits `@DELETE` with a `@Body`, which
 * Retrofit rejects at call time ("Non-body HTTP method cannot contain @Body"); `@HTTP` with
 * `hasBody = true` is the supported way to send a body on DELETE. The request model stays generated.
 */
interface CuentaApi {
    @HTTP(method = "DELETE", path = "api/cuenta", hasBody = true)
    suspend fun apiCuentaDelete(@Body request: ApiCuentaDeleteRequest): Response<Unit>
}
