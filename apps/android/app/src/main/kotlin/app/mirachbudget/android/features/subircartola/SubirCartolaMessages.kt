package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.staging.CartolaFileProblem
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.ImportFailure
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.ImportSummary
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewFailure
import java.io.IOException

/**
 * The words of "Subir cartola": neutral Spanish with "tú", identical to the iPhone app
 * (`SubirCartolaPresentation.swift` and the views of `Features/SubirCartola`). The server's own
 * message is shown only for a 400 the app cannot name.
 */
object SubirCartolaMessages {
    const val TITLE = "Subir cartola"

    // --- consent (PRI-02, Figma 16 node 114:442)

    const val CONSENT_TITLE = "Antes de tu primera cartola"
    const val CONSENT_BODY =
        "Para mostrarte tu 50/30/20 necesitamos leer los movimientos de tu cartola. Esto es lo que hacemos con ella."
    const val CONSENT_LIST_HEADER = "Qué hacemos con tu archivo"
    val CONSENT_ITEMS = listOf(
        "1. Leemos la fecha, la descripción y el monto de cada movimiento.",
        "2. Borramos el archivo apenas terminamos de leerlo.",
        "3. Encriptamos los detalles de tus movimientos.",
        "4. No pedimos tu clave del banco ni nos conectamos a él.",
    )
    const val CONSENT_ACCEPT = "Acepto y continúo"
    const val CONSENT_DECLINE = "Ahora no"

    /** Assumption (not in Figma): the acceptance did not reach the server. */
    const val CONSENT_ACCEPT_FAILED = "No pudimos guardar tu aceptación. Inténtalo de nuevo."

    /** Assumption (not in Figma): what the screen says after «Ahora no». */
    const val CONSENT_DISMISSED = "Para subir una cartola necesitas aceptar cómo tratamos tu archivo."

    /** Assumption (not in Figma): reopens the consent after «Ahora no». */
    const val CONSENT_REOPEN = "Ver el permiso"

    // --- initial screen

    const val INITIAL_TITLE = "Sube tu cartola"
    const val INITIAL_FORMATS = "Archivos .xlsx o .pdf de Banco de Chile, BancoEstado, BCI y Santander, de hasta 10 MB."
    const val INITIAL_PREVIEW_FIRST = "Primero verás una vista previa. Nada se guarda hasta que confirmes."

    /** PRI-03 (S3, assumption on the wording): no bank passwords, the file is deleted after reading it. */
    const val INITIAL_PRIVACY = "No pedimos claves de tu banco. Borramos el archivo apenas terminamos de leerlo."
    const val CHOOSE_FILE = "Elegir archivo"

    /** Assumption (not in Figma, S2): a file shared from another app while an upload is in progress. */
    const val SHARED_FILE_BUSY = "Termina o descarta la cartola en curso para subir la que compartiste."

    fun fileProblem(problem: CartolaFileProblem): String = when (problem) {
        CartolaFileProblem.UNSUPPORTED_EXTENSION -> "Elige un archivo .xlsx o .pdf."
        CartolaFileProblem.TOO_LARGE -> "El archivo pesa más de 10 MB. Elige uno más pequeño."
        CartolaFileProblem.UNREADABLE -> "No pudimos abrir el archivo. Inténtalo de nuevo."
    }

    // --- progress and common buttons

    const val PREVIEWING = "Generando vista previa…"
    const val UPLOADING = "Subiendo transacciones…"
    const val RETRY = "Reintentar"
    const val CHOOSE_OTHER = "Elegir otro archivo"
    const val BACK_TO_REVIEW = "Volver a revisar"
    const val START_OVER = "Empezar de nuevo"

    // --- password

    const val PASSWORD_FIELD = "Contraseña del archivo"

    fun passwordPrompt(incorrect: Boolean): String =
        if (incorrect) {
            "La contraseña es incorrecta. Inténtalo de nuevo."
        } else {
            "Este archivo está protegido. Ingresa su contraseña para continuar."
        }

    // --- errors

    const val NO_MOVEMENTS = "No encontramos movimientos en el archivo"
    const val CONNECTION = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."

    /** 409 `CATALOGO_INCOMPLETO`: own copy, the server's text uses the old bucket label. */
    const val ACCOUNT_PROBLEM =
        "No pudimos importar tu cartola por un problema de tu cuenta. El archivo está bien y no se importó nada."

    /** A 400 the app cannot name and that came without a message of the server. */
    const val REJECTED_FALLBACK = "No pudimos leer la cartola. Revisa que sea una cartola válida."
    const val UNREADABLE_COPY = "No pudimos leer el archivo. Elígelo de nuevo."

    fun previewFailure(failure: PreviewFailure): String = when (failure) {
        PreviewFailure.NoMovements -> NO_MOVEMENTS
        is PreviewFailure.Rejected -> failure.message
        PreviewFailure.TemporarilyUnavailable -> "No se pudo analizar ahora, intenta de nuevo."
        PreviewFailure.AccountProblem -> ACCOUNT_PROBLEM
        PreviewFailure.Connection -> CONNECTION
        PreviewFailure.Server -> "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos."
    }

    fun importFailure(failure: ImportFailure): String = when (failure) {
        ImportFailure.TemporarilyUnavailable -> "No se pudo importar ahora, intenta de nuevo. No se guardó nada."
        ImportFailure.AccountProblem -> ACCOUNT_PROBLEM
        ImportFailure.Connection -> "Problema de conexión. No se guardó nada; revisa tu conexión e inténtalo de nuevo."
        ImportFailure.Server -> "No pudimos importar la cartola. No se guardó nada; inténtalo de nuevo."
    }

    // --- decision

    const val NOTHING_SAVED_YET = "Nada se ha guardado aún."
    const val UPLOAD_AS_IS = "Subir tal cual"
    const val REVIEW_AND_EDIT = "Revisar y editar"
    const val DISCARD = "Descartar"
    const val LOADING_CATEGORIES = "Cargando categorías…"
    const val CATALOG_FAILED_DECIDING =
        "No pudimos cargar tus categorías, así que no se puede revisar. Puedes subir tal cual."
    const val TOTAL_ROWS = "Total filas"
    const val DUPLICATES = "Duplicados"
    const val NEW_ROWS = "Nuevas"

    /** «Cuenta Corriente · 00-123-45678-09». */
    fun account(tipoCuenta: String, numeroCuenta: String): String = "$tipoCuenta · $numeroCuenta"

    // --- discard confirmation

    const val DISCARD_TITLE = "¿Descartar esta cartola?"
    const val DISCARD_MESSAGE = "Se perderá la revisión. Nada se ha guardado."
    const val DISCARD_CANCEL = "Seguir con la cartola"

    // --- review

    const val REVIEW_HINT = "Revisa las filas y confirma para importar. Nada se ha guardado aún."
    const val CATALOG_FAILED_REVIEW = "No pudimos cargar las categorías."
    const val TOO_MANY_EDITS =
        "No caben más cambios en una sola importación. Confirma los que ya hiciste o deshaz alguno."

    /** 400 on a commit that carried edits: the catalog drifted since the review started. */
    const val BAD_EDITS = "No pudimos aplicar tus cambios. Revisa la clasificación e inténtalo de nuevo."

    /** The catalog changed while reviewing and some chosen categories no longer exist. */
    const val STALE_EDITS = "Algunas categorías que elegiste ya no existen. Esas filas volvieron a su sugerencia."
    const val UPDATING_PREVIEW = "Actualizando la vista previa con la nueva categoría…"
    const val ALREADY_LOADED = "Ya cargado"
    const val EDITED = "Editada"
    const val EDIT_ROW_HINT = "Toca para cambiar la categoría"

    /** «Banco de Chile · Cuenta Corriente», the review header. */
    fun reviewHeader(banco: String, tipoCuenta: String): String = "$banco · $tipoCuenta"

    fun confirmTitle(editCount: Int): String = when (editCount) {
        0 -> "Confirmar"
        1 -> "Confirmar (1 cambio)"
        else -> "Confirmar ($editCount cambios)"
    }

    /** «X» se aplicó a N filas más (or just "created" when nothing else matched). */
    fun applied(name: String, count: Int): String {
        if (count <= 0) return "Categoría «$name» creada."
        return "«$name» se aplicó a $count ${if (count == 1) "fila" else "filas"} más"
    }

    fun refreshFailed(name: String): String =
        "«$name» se creó, pero no pudimos actualizar la vista previa. Tus cambios siguen aquí."

    // --- category sheet and form

    const val SHEET_TITLE = "Categoría"
    const val SHEET_CANCEL = "Cancelar"
    const val CREATE_CATEGORY = "Crear categoría"
    const val NO_CATEGORIES = "Sin categorías"
    const val FORM_TITLE = "Nueva categoría"
    const val FORM_NAME = "Nombre"
    const val FORM_BUCKET = "Grupo"
    const val FORM_BUCKET_FOOTER =
        "Define cómo cuenta este gasto en tu 50/30/20; puedes cambiarlo después, pero afecta todos los meses."
    const val FORM_PATTERN = "Patrón (opcional)"
    const val FORM_PATTERN_FIELD = "Texto a buscar"
    const val FORM_PATTERN_FOOTER =
        "Si la descripción de un movimiento contiene este texto, queda en esta categoría. No ignora tildes. " +
            "Déjalo vacío para asignarla solo a mano."
    const val FORM_CREATE = "Crear"
    const val FORM_CREATING = "Creando…"

    /** Where each error of `POST /api/categorias` shows in the form. The server's message only for an unknown code. */
    fun formErrors(error: Exception): CategoryFormErrors = when (error) {
        is CategoriaException.InvalidName -> CategoryFormErrors(name = "El nombre debe tener entre 1 y 40 caracteres")
        is CategoriaException.BucketNotAssignable -> CategoryFormErrors(bucket = "Elige un grupo: Necesidades, Gustos o Ahorro")
        is CategoriaException.InvalidIcon -> CategoryFormErrors(general = "Elige un ícono válido de la lista")
        is CategoriaException.InvalidPattern ->
            CategoryFormErrors(pattern = "Escribe un texto válido para el patrón (de 1 a 200 caracteres)")
        is CategoriaException.InvalidMatchType -> CategoryFormErrors(pattern = "Ese tipo de coincidencia no es válido")
        is CategoriaException.InvalidRegex -> CategoryFormErrors(pattern = "Esa expresión regular no es válida")
        is CategoriaException.DuplicateName -> CategoryFormErrors(name = "Ya tienes una categoría con ese nombre")
        is CategoriaException.DuplicatePattern -> CategoryFormErrors(pattern = "Ya tienes un patrón con ese texto")
        is CategoriaException.Rejected -> CategoryFormErrors(general = error.serverMessage)
        is IOException ->
            CategoryFormErrors(general = "No pudimos crear la categoría. Revisa tu conexión e inténtalo de nuevo.")
        else -> CategoryFormErrors(general = "No pudimos crear la categoría. Inténtalo de nuevo.")
    }

    // --- success

    const val SHOW_SUMMARY = "Ver resumen del mes"
    const val UPLOAD_ANOTHER = "Subir otra cartola"

    /** «37 movimientos importados de Banco de Chile» («1 movimiento importado de …»). */
    fun headline(summary: ImportSummary): String {
        val noun = if (summary.totalTransacciones == 1) "movimiento importado" else "movimientos importados"
        return "${summary.totalTransacciones} $noun de ${summary.banco}"
    }

    /** «5 duplicados omitidos», or `null` when there were none. */
    fun duplicatesLine(summary: ImportSummary): String? {
        if (summary.duplicadosOmitidos <= 0) return null
        val noun = if (summary.duplicadosOmitidos == 1) "duplicado omitido" else "duplicados omitidos"
        return "${summary.duplicadosOmitidos} $noun"
    }
}
