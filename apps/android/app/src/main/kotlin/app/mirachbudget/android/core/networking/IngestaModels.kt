package app.mirachbudget.android.core.networking

import java.time.Instant

/** App-owned models of "Subir cartola". Screens use these, never the generated types. */

/** Result of `POST /api/ingestas/preview`: what the file contains, nothing saved yet. */
data class CartolaPreview(
    val banco: String,
    val tipoCuenta: String,
    /** As it arrives (the catalog says not to reformat it). */
    val numeroCuenta: String,
    val totalFilas: Int,
    val duplicados: Int,
    val nuevas: Int,
    /** Every row of the statement, in file order. */
    val filas: List<CartolaRow>,
)

/** One row of the preview. Money is whole pesos: [cargo] is an expense, [abono] an income. */
data class CartolaRow(
    val rowIndex: Int,
    val fecha: Instant,
    val descripcion: String,
    val cargo: Long,
    val abono: Long,
    /** Already imported: shown marked, not editable, and skipped by the server on commit. */
    val esDuplicado: Boolean,
    /** `null`: no pattern matched (or the bucket is unknown to the app); the row lands in «Deseos · Desconocido». */
    val sugerido: Sugerencia?,
) {
    /** What the server would classify the row as, before any manual edit. */
    data class Sugerencia(
        val bucket: Bucket,
        /** `null` when the server gave a bucket but no category. */
        val categoriaId: String?,
    )
}

/**
 * One manual reclassification. Only rows the person touched are sent, and always with a real
 * category: the app never sends `categoriaId: null`.
 */
data class CartolaEdit(val rowIndex: Int, val categoriaId: String)

/** Result of `POST /api/ingestas/commit`. */
data class CartolaCommitResult(
    val ingestaId: String,
    val totalTransacciones: Int,
    val duplicadosOmitidos: Int,
)

/** Whether the person has accepted statement processing (PRI-02) and not revoked it. */
data class Consentimientos(val cartolasVigente: Boolean)

/**
 * What the upload endpoints can answer besides success. 401 is not here: it goes through the single
 * session-expiry relay ([SessionExpiredException]).
 */
sealed class IngestaException(message: String) : Exception(message) {
    /** 400 `PDF_PROTEGIDO`: the PDF is encrypted and no password was sent. */
    class PasswordRequired : IngestaException("Password required")

    /** 400 `PDF_PASSWORD_INCORRECTA`. */
    class PasswordIncorrect : IngestaException("Password incorrect")

    /** 400 `SIN_MOVIMIENTOS`: a valid file with zero movements. */
    class NoMovements : IngestaException("No movements")

    /** Any other 400 (file, unknown bank, structure...). [serverMessage] is `null` when the server sent none. */
    class Rejected(val serverMessage: String?) : IngestaException("Rejected: $serverMessage")

    /** 409 `CONSENTIMIENTO_CARTOLAS_REQUERIDO`: the statement-processing consent is missing (PRI-02). */
    class ConsentRequired : IngestaException("Consent required")

    /** Any other 409 (`CATALOGO_INCOMPLETO`): permanent, a problem of the account. */
    class CatalogIncomplete : IngestaException("Catalog incomplete")

    /** 503 `CATALOGO_NO_DISPONIBLE`: transient, nothing was saved. */
    class CatalogUnavailable : IngestaException("Catalog unavailable")

    /** 500: unexpected, nothing was saved; trying again is safe. */
    class ServerFailure : IngestaException("Server failure")

    /** The staged copy cannot be read any more: trying again cannot help, the file must be chosen again. */
    class FileUnreadable : IngestaException("Staged file unreadable")
}
