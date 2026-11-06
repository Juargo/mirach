package app.mirachbudget.android.core.networking

import java.time.Instant

/**
 * App-owned model of "Cartolas subidas" (`GET /api/ingestas`). Screens use it, never the generated
 * types. Mirrors `CartolaSubida` on iOS.
 */
data class CartolaSubida(
    val id: String,
    /** `null` when a failed import never resolved the bank. */
    val banco: String?,
    val nombreArchivo: String,
    val estado: Estado,
    /** The server's reason; only a failed import has one. */
    val motivoFallo: String?,
    /** The day of the import, read in UTC like every date the API sends. */
    val fecha: Instant,
    val totalTransacciones: Int,
) {
    enum class Estado { Procesada, Fallida }
}

/** 404 on `DELETE /api/ingestas/{id}`: it does not exist or is not the user's (the API does not say which). */
class CartolaNotFoundException : Exception("Cartola not found")
