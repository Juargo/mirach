package app.mirachbudget.android.core.networking

import app.mirachbudget.android.core.api.generated.models.CatalogoResponse
import app.mirachbudget.android.core.api.generated.models.CategoriaResponse
import app.mirachbudget.android.core.api.generated.models.PreviewIngestaResponse
import app.mirachbudget.android.core.api.generated.models.PreviewIngestaResponseFilasInner
import java.time.Instant
import java.time.format.DateTimeParseException
import kotlinx.serialization.SerializationException
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.json.Json

/**
 * Wire shapes of the upload flow to app models, and back for `edits`. The only place that knows how
 * amounts, dates and suggestions travel. What the app cannot trust throws [SerializationException].
 */
internal object IngestaMapper {
    fun preview(wire: PreviewIngestaResponse): CartolaPreview {
        // `resumen` is optional in the contract, but without it there is nothing to decide on.
        val resumen = wire.resumen ?: throw malformed("resumen")
        return CartolaPreview(
            banco = wire.banco,
            tipoCuenta = wire.tipoCuenta,
            numeroCuenta = wire.numeroCuenta,
            totalFilas = resumen.totalFilas,
            duplicados = resumen.duplicadosDetectados,
            nuevas = resumen.nuevas,
            filas = wire.filas.orEmpty().map(::row),
        )
    }

    /** A category in a bucket the app does not know cannot be placed in a group: left out. */
    fun catalog(wire: CatalogoResponse): CatalogoCategorias = CatalogoCategorias(wire.categorias.mapNotNull(::category))

    /** `null` for a bucket the app does not know. */
    fun category(wire: CategoriaResponse): CategoriaCatalogo? = Bucket.fromApi(wire.bucket)?.let {
        CategoriaCatalogo(id = wire.id, nombre = wire.nombre, bucket = it, icono = wire.icono)
    }

    /** The `edits` form field: `[{"rowIndex":3,"categoriaId":"..."}]`, keys in that order. */
    fun editsJson(edits: List<CartolaEdit>): String =
        Json.encodeToString(ListSerializer(EditWire.serializer()), edits.map { EditWire(it.rowIndex, it.categoriaId) })

    private fun row(wire: PreviewIngestaResponseFilasInner) = CartolaRow(
        rowIndex = wire.rowIndex,
        fecha = instant(wire.fecha),
        descripcion = wire.descripcion,
        cargo = money(wire.cargo),
        abono = money(wire.abono),
        esDuplicado = wire.esDuplicado,
        // A bucket the app does not know cannot be shown: same as no suggestion.
        sugerido = wire.sugerido?.let { s -> Bucket.fromApi(s.bucket)?.let { CartolaRow.Sugerencia(it, s.categoriaId) } },
    )

    /** ISO 8601 UTC, with or without fractional seconds. */
    private fun instant(text: String): Instant = try {
        Instant.parse(text)
    } catch (e: DateTimeParseException) {
        throw SerializationException("Unexpected date $text", e)
    }

    private fun money(text: String): Long = Money.pesos(text) ?: throw malformed("amount $text")

    fun malformed(what: String) = SerializationException("Unexpected $what")

    @kotlinx.serialization.Serializable
    private class EditWire(val rowIndex: Int, val categoriaId: String)
}
