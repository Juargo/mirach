package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.IngestasListResponse
import app.mirachbudget.android.core.api.generated.models.IngestasListResponseIngestasInner
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException

/**
 * Wire shape of `GET /api/ingestas` to the app's models, in the server's order. A malformed date
 * throws [SerializationException] instead of showing a wrong one.
 */
internal object CartolasSubidasMapper {
    fun map(wire: IngestasListResponse): List<CartolaSubida> = wire.ingestas.map { item ->
        CartolaSubida(
            id = item.id,
            banco = item.banco,
            nombreArchivo = item.nombreArchivo,
            estado = if (item.estado == IngestasListResponseIngestasInner.Estado.PROCESADA) {
                CartolaSubida.Estado.Procesada
            } else {
                CartolaSubida.Estado.Fallida
            },
            motivoFallo = item.motivoFallo,
            fecha = instant(item.fecha),
            totalTransacciones = item.totalTransacciones,
        )
    }

    /** ISO 8601 UTC, with or without fractional seconds. */
    private fun instant(text: String): Instant = try {
        Instant.parse(text)
    } catch (e: DateTimeParseException) {
        throw SerializationException("Unexpected date $text", e)
    }
}
