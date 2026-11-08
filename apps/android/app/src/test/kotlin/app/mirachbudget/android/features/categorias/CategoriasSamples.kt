package app.mirachbudget.android.features.categorias

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CoincidenciaPatron
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronExistente
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.VistaPreviaPatron
import java.time.Instant

/** The catalog of the iOS tests: a category with two patterns, an empty one and the system one. */
object CategoriasSamples {
    val lider = PatronCategoria(id = "p-1", patron = "LIDER", matchType = "CONTAINS")
    val jumbo = PatronCategoria(id = "p-2", patron = "JUMBO", matchType = "STARTS_WITH")

    val supermercado = CategoriaCatalogo(
        id = "cat-super", nombre = "Supermercado", bucket = Bucket.Necesidades, icono = "shopping-cart",
        transaccionesCount = 12, patrones = listOf(lider, jumbo),
    )
    val vacia = CategoriaCatalogo(id = "cat-empty", nombre = "Vacía", bucket = Bucket.Deseos, icono = null, transaccionesCount = 0)
    val restaurantes = CategoriaCatalogo(id = "cat-rest", nombre = "Restaurantes", bucket = Bucket.Deseos, icono = "utensils", transaccionesCount = 4)
    val sistema = CategoriaCatalogo(id = "cat-sys", nombre = "Desconocido", bucket = Bucket.Deseos, icono = "circle-help", esInterna = true)

    /** Ordered by name, as the API sends it. */
    val catalogo = CatalogoCategorias(listOf(sistema, restaurantes, supermercado, vacia))

    val octubre = Periodo(2026, 10)

    /** Where a typed text already lives: another category. */
    val enOtra = PatronExistente(patronId = "p-77", categoriaId = "cat-empty", categoria = "Vacía", bucket = Bucket.Deseos)

    /** The same text in the category being edited. */
    val aqui = PatronExistente(patronId = "p-1", categoriaId = "cat-super", categoria = "Supermercado", bucket = Bucket.Necesidades)

    /** 14 Oct 2026, midnight UTC, as the API sends a statement's day. */
    val catorceOctubre: Instant = Instant.parse("2026-10-14T00:00:00Z")

    fun preview(total: Int, existente: PatronExistente? = null, periodo: Periodo = octubre) = VistaPreviaPatron(
        periodo = periodo,
        patron = "acuenta",
        total = total,
        coincidencias = (0 until total).map { CoincidenciaPatron(id = "t-$it", descripcion = "SUPER ACUENTA", fecha = catorceOctubre, monto = 32_400) },
        existente = existente,
    )
}
