package app.mirachbudget.android.core.networking

import java.time.Instant

/** One bucket's month (`GET /api/buckets/{bucket}/detalle`): its total and movements by category. */
data class BucketDetalle(
    val bucket: Bucket,
    val periodo: Periodo,
    /** Whole pesos. */
    val total: Long,
    /** Share of the month's income, in basis points; `null` without income. */
    val porcentajeBp: Int?,
    /** The bucket's target, in basis points. */
    val metaBp: Int?,
    val totalTransacciones: Int,
    val totalCategorias: Int,
    /** Groups in the server's order. */
    val grupos: List<GrupoCategoria>,
)

/** The movements of one category inside a bucket's month. */
data class GrupoCategoria(
    /** `null` for movements without a category. */
    val categoriaId: String?,
    val nombre: String,
    val icono: String?,
    val subtotal: Long,
    val conteo: Int,
    val transacciones: List<MovimientoBucket>,
) {
    /** A stable key for lists: movements without a category share one group. */
    val key: String get() = categoriaId ?: "sin-categoria"
}

/** One expense of a bucket's month. */
data class MovimientoBucket(
    val id: String,
    val fecha: Instant,
    val descripcion: String,
    /** The statement's bank. */
    val origen: String,
    /** Whole pesos, positive. */
    val monto: Long,
)

/** What `PATCH /api/transacciones/{id}/categoria` answers. */
data class Reclasificacion(
    val categoriaId: String,
    val categoriaNombre: String,
    val bucket: Bucket,
    /** Other movements of the month moved by «Aplicar a …» (CLA-03); 0 without it. */
    val movidos: Int = 0,
)

/**
 * What `GET /api/transacciones/{id}/parecidos` suggests (CLA-03): the text a pattern would use, how
 * many OTHER movements of the month it would move, and where the text already lives.
 */
data class Parecidos(val patron: String?, val total: Int, val existente: PatronExistente?) {
    companion object {
        /** Nothing to offer: no checkbox. */
        val Ninguno = Parecidos(patron = null, total = 0, existente = null)
    }
}

/** Why a reclassification (or its suggestion) was refused. 401 goes through the session relay. */
sealed class ReclasificarException(message: String) : Exception(message) {
    /** The category was deleted meanwhile (400, or 404 `CATEGORIA_NO_ENCONTRADA`). */
    class CategoryNotFound : ReclasificarException("CATEGORIA_NO_ENCONTRADA")

    /** The movement was deleted meanwhile (404 `TRANSACCION_NO_ENCONTRADA`). */
    class MovementNotFound : ReclasificarException("TRANSACCION_NO_ENCONTRADA")
}
