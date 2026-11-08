package app.mirachbudget.android.features.detallebucket

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.PatronExistente
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.Reclasificacion
import java.time.Instant

object DetalleBucketSamples {
    val septiembre = Periodo(2026, 9)
    val agosto = Periodo(2026, 8)

    val cafe = MovimientoBucket("t1", Instant.parse("2026-09-05T12:00:00Z"), "CAFE CENTRAL", "Banco de Chile", 4_500)
    val ropa = MovimientoBucket("t2", Instant.parse("2026-09-07T12:00:00Z"), "TIENDA ROPA", "BCI", 25_990)
    val suelto = MovimientoBucket("t3", Instant.parse("2026-09-09T12:00:00Z"), "SIN NOMBRE", "BCI", 1_000)

    val restaurantes = CategoriaCatalogo("c-rest", "Restaurantes", Bucket.Deseos, "utensils")
    val vestuario = CategoriaCatalogo("c-ropa", "Ropa", Bucket.Deseos, "shirt")
    val supermercado = CategoriaCatalogo("c-super", "Supermercado", Bucket.Necesidades, "shopping-cart")
    val catalog = CatalogoCategorias(listOf(restaurantes, vestuario, supermercado))

    fun detalle(periodo: Periodo = septiembre, grupos: List<GrupoCategoria> = grupos()) = BucketDetalle(
        bucket = Bucket.Deseos,
        periodo = periodo,
        total = grupos.sumOf { it.subtotal },
        porcentajeBp = 3_050,
        metaBp = 3_000,
        totalTransacciones = grupos.sumOf { it.conteo },
        totalCategorias = grupos.size,
        grupos = grupos,
    )

    fun grupos() = listOf(
        GrupoCategoria("c-rest", "Restaurantes", "utensils", 4_500, 1, listOf(cafe)),
        GrupoCategoria("c-ropa", "Ropa", "shirt", 25_990, 1, listOf(ropa)),
        GrupoCategoria(null, "Sin categoría", null, 1_000, 1, listOf(suelto)),
    )

    fun moved(category: CategoriaCatalogo, movidos: Int = 0) =
        Reclasificacion(categoriaId = category.id, categoriaNombre = category.nombre, bucket = category.bucket, movidos = movidos)

    fun suggestion(total: Int = 2, existente: PatronExistente? = null) = Parecidos(patron = "tienda ropa", total = total, existente = existente)
}
