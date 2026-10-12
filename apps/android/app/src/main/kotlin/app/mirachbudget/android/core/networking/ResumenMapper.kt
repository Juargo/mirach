package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.ResumenMesResponse
import app.mirachbudget.android.core.api.generated.models.ResumenMesResponseBucketsInner
import java.math.BigDecimal
import java.math.RoundingMode
import kotlinx.serialization.SerializationException

/**
 * Wire shape of `GET /api/resumen` to the app's models. Anything the app cannot trust (bad period,
 * non-integer money, unknown, repeated or missing bucket) throws [SerializationException] instead
 * of showing a wrong figure.
 */
internal object ResumenMapper {
    fun map(wire: ResumenMesResponse): ResumenMes {
        val periodo = Periodo.parse(wire.periodo) ?: throw malformed("periodo ${wire.periodo}")
        val metas = mapOf(
            Bucket.Necesidades to basisPoints(wire.targets.necesidades),
            Bucket.Deseos to basisPoints(wire.targets.deseos),
            Bucket.Ahorro to basisPoints(wire.targets.ahorro),
        )
        val byBucket = mutableMapOf<Bucket, BucketResumen>()
        for (item in wire.buckets) {
            val bucket = Bucket.fromApi(item.bucket) ?: throw malformed("bucket ${item.bucket}")
            if (bucket in byBucket) throw malformed("repeated bucket ${item.bucket}")
            byBucket[bucket] = BucketResumen(
                bucket = bucket,
                total = money(item.total),
                porcentajeBp = item.porcentajeBp,
                metaBp = metas.getValue(bucket),
                estado = estado(item.estadoSemaforo),
            )
        }
        // The catalog fixes the order and says there are always three.
        val ordered = Bucket.entries.map { byBucket[it] ?: throw malformed("missing bucket $it") }
        return ResumenMes(
            periodo = periodo,
            sinIngreso = wire.sinIngreso,
            totalIngreso = money(wire.totalIngreso),
            estadoGlobal = estado(wire.estadoGlobal),
            buckets = ordered,
        )
    }

    fun periodo(text: String): Periodo = Periodo.parse(text) ?: throw malformed("periodo $text")

    // `null` is no state. The spec lists `null` among the enum values, so a client could see an
    // empty value too: that means the same, and it never reaches a screen.
    private fun estado(wire: ResumenMesResponse.EstadoGlobal?): EstadoSemaforo? = when (wire) {
        ResumenMesResponse.EstadoGlobal.verde -> EstadoSemaforo.Verde
        ResumenMesResponse.EstadoGlobal.amarillo -> EstadoSemaforo.Amarillo
        ResumenMesResponse.EstadoGlobal.rojo -> EstadoSemaforo.Rojo
        null -> null
    }

    private fun estado(wire: ResumenMesResponseBucketsInner.EstadoSemaforo?): EstadoSemaforo? = when (wire) {
        ResumenMesResponseBucketsInner.EstadoSemaforo.verde -> EstadoSemaforo.Verde
        ResumenMesResponseBucketsInner.EstadoSemaforo.amarillo -> EstadoSemaforo.Amarillo
        ResumenMesResponseBucketsInner.EstadoSemaforo.rojo -> EstadoSemaforo.Rojo
        null -> null
    }

    private fun money(text: String): Long = Money.pesos(text) ?: throw malformed("amount $text")

    /** Targets arrive as a JSON number (50, 30, 20): kept in basis points like every percentage. */
    private fun basisPoints(percent: BigDecimal): Int =
        percent.multiply(BigDecimal(100)).setScale(0, RoundingMode.HALF_UP).intValueExact()

    private fun malformed(what: String) = SerializationException("Unexpected $what")
}
