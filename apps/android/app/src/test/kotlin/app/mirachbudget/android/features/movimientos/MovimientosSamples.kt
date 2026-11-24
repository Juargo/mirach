package app.mirachbudget.android.features.movimientos

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.features.detallebucket.DetalleBucketSamples
import java.time.Instant

/** The three buckets of one month; Gustos is the bucket detail's sample, so both features share its movements. */
object MovimientosSamples {
    val mercado = MovimientoBucket("t4", Instant.parse("2026-09-02T12:00:00Z"), "SUPERMERCADO CENTRAL", "Banco de Chile", 569_400)

    fun necesidades(periodo: Periodo) = BucketDetalle(
        bucket = Bucket.Necesidades,
        periodo = periodo,
        total = 569_400,
        porcentajeBp = 5_200,
        metaBp = 5_000,
        totalTransacciones = 1,
        totalCategorias = 1,
        grupos = listOf(GrupoCategoria("c-super", "Supermercado", "shopping-cart", 569_400, 1, listOf(mercado))),
    )

    fun gustos(periodo: Periodo, grupos: List<GrupoCategoria> = DetalleBucketSamples.grupos()) = DetalleBucketSamples.detalle(periodo, grupos)

    /** A bucket with nothing in it and no income to measure against. */
    fun ahorro(periodo: Periodo) = BucketDetalle(
        bucket = Bucket.Ahorro,
        periodo = periodo,
        total = 0,
        porcentajeBp = null,
        metaBp = 2_000,
        totalTransacciones = 0,
        totalCategorias = 0,
        grupos = emptyList(),
    )

    /** Gustos after «Café central» moved from Restaurantes to Ropa. */
    fun gruposAfterCafeToRopa() = listOf(
        GrupoCategoria("c-ropa", "Ropa", "shirt", 30_490, 2, listOf(DetalleBucketSamples.ropa, DetalleBucketSamples.cafe)),
        GrupoCategoria(null, "Sin categoría", null, 1_000, 1, listOf(DetalleBucketSamples.suelto)),
    )
}
