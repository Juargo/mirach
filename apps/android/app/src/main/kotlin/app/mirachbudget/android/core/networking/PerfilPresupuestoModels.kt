package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.PerfilPresupuestoPredefinido
import app.mirachbudget.android.core.api.generated.models.PerfilPresupuestoResponse
import retrofit2.Response
import retrofit2.http.Body
import retrofit2.http.PUT

/** The four predefined budget profiles the person can choose (`personalizado` is not offered in v1.0). */
enum class PerfilPredefinido {
    P50_30_20,
    P65_20_15,
    P80_10_10,
    P90_5_5,
}

/**
 * `PUT /api/perfil/presupuesto` with a predefined id, declared by hand. The generator flattens the
 * contract's `anyOf` into one request class whose `metas` is required and whose `perfil` only knows
 * `personalizado`, so a predefined id cannot be sent with it. The generated `PerfilPresupuestoPredefinido`
 * body (only `perfil`; the optional fields stay out of the JSON) is used instead, over the same client.
 */
interface PerfilPresupuestoApi {
    @PUT("api/perfil/presupuesto")
    suspend fun apiPerfilPresupuestoPut(@Body request: PerfilPresupuestoPredefinido): Response<PerfilPresupuestoResponse>
}

internal fun PerfilPredefinido.toWire(): PerfilPresupuestoPredefinido.Perfil = when (this) {
    PerfilPredefinido.P50_30_20 -> PerfilPresupuestoPredefinido.Perfil._50_30_20
    PerfilPredefinido.P65_20_15 -> PerfilPresupuestoPredefinido.Perfil._65_20_15
    PerfilPredefinido.P80_10_10 -> PerfilPresupuestoPredefinido.Perfil._80_10_10
    PerfilPredefinido.P90_5_5 -> PerfilPresupuestoPredefinido.Perfil._90_5_5
}

/** `null` for `personalizado`: the app offers no card for it. */
internal fun PerfilPresupuestoResponse.Perfil.toPredefinido(): PerfilPredefinido? = when (this) {
    PerfilPresupuestoResponse.Perfil._50_30_20 -> PerfilPredefinido.P50_30_20
    PerfilPresupuestoResponse.Perfil._65_20_15 -> PerfilPredefinido.P65_20_15
    PerfilPresupuestoResponse.Perfil._80_10_10 -> PerfilPredefinido.P80_10_10
    PerfilPresupuestoResponse.Perfil._90_5_5 -> PerfilPredefinido.P90_5_5
    PerfilPresupuestoResponse.Perfil.personalizado -> null
}
