package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.BucketDetalleMesResponse
import app.mirachbudget.android.core.api.generated.models.BucketDetalleMesResponseGruposInner
import app.mirachbudget.android.core.api.generated.models.PatronExistente as PatronExistenteWire
import app.mirachbudget.android.core.api.generated.models.PatronVistaPreviaResponse

/**
 * Wire shapes of the bucket detail and the classification-learning calls to app models. What the
 * app cannot trust throws `SerializationException`.
 */
internal object BucketDetalleMapper {
    fun detalle(wire: BucketDetalleMesResponse) = BucketDetalle(
        bucket = bucket(wire.bucket),
        periodo = periodo(wire.periodo),
        total = money(wire.total),
        porcentajeBp = wire.porcentajeBp,
        metaBp = wire.metaBp,
        totalTransacciones = wire.totalTransacciones,
        totalCategorias = wire.totalCategorias,
        grupos = wire.grupos.map(::group),
    )

    fun vistaPrevia(wire: PatronVistaPreviaResponse) = VistaPreviaPatron(
        periodo = periodo(wire.periodo),
        patron = wire.patron,
        total = wire.total,
        coincidencias = wire.coincidencias.map {
            CoincidenciaPatron(id = it.id, descripcion = it.descripcion, fecha = IngestaMapper.instant(it.fecha), monto = money(it.monto))
        },
        existente = wire.existente?.let(::existente),
    )

    fun existente(wire: PatronExistenteWire) = PatronExistente(
        patronId = wire.patronId,
        categoriaId = wire.categoriaId,
        categoria = wire.categoria,
        bucket = bucket(wire.bucket),
    )

    fun bucket(name: String): Bucket = Bucket.fromApi(name) ?: throw IngestaMapper.malformed("bucket $name")

    private fun group(wire: BucketDetalleMesResponseGruposInner) = GrupoCategoria(
        categoriaId = wire.categoriaId,
        nombre = wire.nombre,
        icono = wire.icono,
        subtotal = money(wire.subtotal),
        conteo = wire.conteo,
        transacciones = wire.transacciones.map {
            MovimientoBucket(
                id = it.id,
                fecha = IngestaMapper.instant(it.fecha),
                descripcion = it.descripcion,
                origen = it.origen,
                monto = money(it.monto),
            )
        },
    )

    private fun periodo(text: String): Periodo = Periodo.parse(text) ?: throw IngestaMapper.malformed("periodo $text")

    private fun money(text: String): Long = Money.pesos(text) ?: throw IngestaMapper.malformed("amount $text")
}
