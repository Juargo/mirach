package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CartolaCommitResult
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.staging.CartolaSource
import java.io.ByteArrayInputStream
import java.io.InputStream
import java.time.Instant

object SubirCartolaSamples {
    val supermercado = CategoriaCatalogo("cat-super", "Supermercado", Bucket.Necesidades, null)
    val arriendo = CategoriaCatalogo("cat-arriendo", "Arriendo", Bucket.Necesidades, null)
    val restaurantes = CategoriaCatalogo("cat-resto", "Restaurantes", Bucket.Deseos, null)
    val fondo = CategoriaCatalogo("cat-fondo", "Fondo", Bucket.Ahorro, null)

    val catalogo = CatalogoCategorias(listOf(arriendo, supermercado, restaurantes, fondo))

    fun sugerencia(bucket: Bucket, id: String?) = CartolaRow.Sugerencia(bucket, id)

    fun row(
        index: Int,
        cargo: Long = 1_000,
        abono: Long = 0,
        duplicado: Boolean = false,
        sugerido: CartolaRow.Sugerencia? = sugerencia(Bucket.Necesidades, "cat-super"),
        descripcion: String = "MOVIMIENTO $index",
    ) = CartolaRow(
        rowIndex = index,
        fecha = Instant.parse("2026-01-05T00:00:00Z"),
        descripcion = descripcion,
        cargo = cargo,
        abono = abono,
        esDuplicado = duplicado,
        sugerido = sugerido,
    )

    /** Rows 0-2 editable expenses, 3 an income, 4 a duplicate. */
    val filas = listOf(
        row(0),
        row(1, sugerido = sugerencia(Bucket.Deseos, "cat-resto")),
        row(2, sugerido = null),
        row(3, cargo = 0, abono = 500_000, sugerido = null),
        row(4, duplicado = true),
    )

    fun preview(rows: List<CartolaRow> = filas) = CartolaPreview(
        banco = "Banco de Chile",
        tipoCuenta = "Cuenta Corriente",
        numeroCuenta = "00-123-45678-09",
        totalFilas = rows.size,
        duplicados = rows.count { it.esDuplicado },
        nuevas = rows.count { !it.esDuplicado },
        filas = rows,
    )

    val commitResult = CartolaCommitResult(ingestaId = "ing-1", totalTransacciones = 4, duplicadosOmitidos = 1)
}

/** A picked document: a name and its bytes. */
class FakeSource(private val name: String, private val bytes: ByteArray = "%PDF-1.7".toByteArray()) : CartolaSource {
    override fun displayName() = name

    override fun size() = bytes.size.toLong()

    override fun openInputStream(): InputStream = ByteArrayInputStream(bytes)
}
