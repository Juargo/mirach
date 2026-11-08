package app.mirachbudget.android.core.networking

import java.time.Instant

/** A category of the user's catalog (`GET /api/categorias`). */
data class CategoriaCatalogo(
    val id: String,
    val nombre: String,
    val bucket: Bucket,
    /** A value of the allowed icon list, or `null` (the app shows a generic symbol). */
    val icono: String?,
    /** All the user's movements in this category (full history). */
    val transaccionesCount: Int = 0,
    /** A system category («Desconocido»): the server refuses to edit or delete it. */
    val esInterna: Boolean = false,
    val patrones: List<PatronCategoria> = emptyList(),
)

/** `PATCH /api/categorias/{id}`: only the fields that changed (`null` leaves one as it is). */
data class CategoriaCambios(
    val nombre: String? = null,
    val bucket: Bucket? = null,
    val icono: String? = null,
) {
    val isEmpty: Boolean get() = nombre == null && bucket == null && icono == null
}

/** A pattern of a category. [matchType] is the server's value, kept as is (CLA-14: new ones are «contains»). */
data class PatronCategoria(val id: String, val patron: String, val matchType: String)

/** `PATCH /api/patrones/{id}`: the text, or [categoriaId] to move the pattern there (CLA-17). */
data class PatronCambios(val patron: String? = null, val categoriaId: String? = null)

/** Where a pattern text already lives (CLA-17). */
data class PatronExistente(val patronId: String, val categoriaId: String, val categoria: String, val bucket: Bucket)

/** A movement of the previewed month that the pattern would classify. */
data class CoincidenciaPatron(val id: String, val descripcion: String, val fecha: Instant, val monto: Long)

/** `POST /api/patrones/vista-previa` (CLA-15): what a pattern would match in [periodo]; saves nothing. */
data class VistaPreviaPatron(
    val periodo: Periodo,
    /** The text as the engine compares it. */
    val patron: String,
    val total: Int,
    val coincidencias: List<CoincidenciaPatron>,
    val existente: PatronExistente?,
)

/** `POST /api/patrones` 201: the new pattern and how many movements of the month it moved. */
data class PatronCreado(val patron: PatronCategoria, val movidos: Int)

/** What the pattern endpoints can answer besides success. 401 goes through the session relay. */
sealed class PatronException(message: String) : Exception(message) {
    class InvalidPattern : PatronException("PATRON_INVALIDO")
    class InvalidMatchType : PatronException("MATCH_TYPE_INVALIDO")
    class InvalidRegex : PatronException("REGEX_INVALIDA")
    class InvalidPriority : PatronException("PRIORIDAD_INVALIDA")

    /** The text already exists and the server did not say where. */
    class Duplicate : PatronException("PATRON_DUPLICADO")

    /** The text already exists in [existente] (CLA-17). */
    class DuplicateOf(val existente: PatronExistente) : PatronException("PATRON_DUPLICADO")
    class CategoryNotFound : PatronException("CATEGORIA_NO_ENCONTRADA")
    class PatternNotFound : PatronException("PATRON_NO_ENCONTRADO")

    /** A code the app does not tell apart (including the internal category's 403): the server's own message. */
    class Rejected(val serverMessage: String) : PatronException("Rejected: $serverMessage")
}

/** The catalog as the API sends it (already ordered by name). */
data class CatalogoCategorias(val categorias: List<CategoriaCatalogo>) {
    fun categoria(id: String): CategoriaCatalogo? = categorias.firstOrNull { it.id == id }

    /** The categories of one bucket, in catalog order. */
    fun deBucket(bucket: Bucket): List<CategoriaCatalogo> = categorias.filter { it.bucket == bucket }
}

/**
 * What the "Crear categoría" form sends (`POST /api/categorias`): at most one pattern, always
 * «contains», and an optional icon from the allowed list.
 */
data class NuevaCategoria(
    val nombre: String,
    val bucket: Bucket,
    /** Text to look for in a movement's description; `null` or blank means no pattern. */
    val patron: String?,
    /** `null` means no icon (the field is left out). */
    val icono: String?,
)

/**
 * What `POST /api/categorias` can answer besides success (400 and 409 with a `code`). 401 goes
 * through the single session-expiry relay. [indice] is the zero-based position of the offending
 * entry of `patrones` (the server sends it for pattern failures only).
 */
sealed class CategoriaException(message: String, val indice: Int? = null) : Exception(message) {
    class InvalidName : CategoriaException("NOMBRE_INVALIDO")
    class BucketNotAssignable : CategoriaException("BUCKET_NO_ASIGNABLE")
    class InvalidIcon : CategoriaException("ICONO_INVALIDO")
    class InvalidPattern(indice: Int?) : CategoriaException("PATRON_INVALIDO", indice)
    class InvalidMatchType(indice: Int?) : CategoriaException("MATCH_TYPE_INVALIDO", indice)
    class InvalidRegex(indice: Int?) : CategoriaException("REGEX_INVALIDA", indice)
    class DuplicateName : CategoriaException("NOMBRE_DUPLICADO")
    class DuplicatePattern(indice: Int?) : CategoriaException("PATRON_DUPLICADO", indice)

    /** 404 on edit or delete: the category no longer exists. */
    class NotFound : CategoriaException("CATEGORIA_NO_ENCONTRADA")

    /** 403: a system category, which cannot be edited or deleted. */
    class IsInternal : CategoriaException("CATEGORIA_INTERNA")

    /** A 400 or 409 whose `code` the app does not know: the server's own message. */
    class Rejected(val serverMessage: String) : CategoriaException("Rejected: $serverMessage")
}
