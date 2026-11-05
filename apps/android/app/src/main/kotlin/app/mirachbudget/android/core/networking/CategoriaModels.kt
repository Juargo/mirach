package app.mirachbudget.android.core.networking

/** A category of the user's catalog (`GET /api/categorias`), with what the upload review needs. */
data class CategoriaCatalogo(
    val id: String,
    val nombre: String,
    val bucket: Bucket,
    /** A value of the allowed icon list, or `null` (the app shows a generic symbol). */
    val icono: String?,
)

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

    /** A 400 or 409 whose `code` the app does not know: the server's own message. */
    class Rejected(val serverMessage: String) : CategoriaException("Rejected: $serverMessage")
}
