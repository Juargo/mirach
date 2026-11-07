package app.mirachbudget.android.features.categorias

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CategoriaCambios
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.CategoriaException
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.PatronCambios
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.core.networking.PatronException
import app.mirachbudget.android.core.networking.PatronExistente
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.networking.VistaPreviaPatron
import java.io.IOException
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of "Detalle de categoría": one category of the catalog, its edit form (name, bucket, icon),
 * deleting it, and its patterns (port of iOS `DetalleCategoriaViewModel`). The API has no endpoint
 * for a single category, so the screen reads the catalog and takes its entry by id (never by name).
 *
 * [onChange] runs once per successful write (lists, Resumen and the review catalog are stale);
 * [onDeleted] gets the name once this screen deleted the category, so the list announces it.
 */
class DetalleCategoriaViewModel(
    private val api: MirachApi,
    val categoriaId: String,
    private val onChange: () -> Unit = {},
    private val onDeleted: (String) -> Unit = {},
    /** How long the text of a new pattern must stay still before the preview is asked for. */
    private val previewDelay: Duration = 350.milliseconds,
) : ViewModel() {
    enum class Failure {
        /** No answer from the server (offline, timeout). */
        Connection,

        /** The server answered with something the app cannot use (non-2xx, unexpected body). */
        Server,
    }

    sealed interface Content {
        data object Loading : Content
        data class Loaded(val categoria: CategoriaCatalogo) : Content

        /** The id is not in the catalog (deleted elsewhere): «Esa categoría ya no existe». */
        data object NotFound : Content
        data class Failed(val failure: Failure) : Content
    }

    /** A message next to the control that failed. */
    data class FieldErrors(
        val name: String? = null,
        val bucket: String? = null,
        val icon: String? = null,
        /** A problem that belongs to no field (protected, unknown code, connection). */
        val general: String? = null,
    ) {
        val isEmpty: Boolean get() = this == FieldErrors()
    }

    data class PatternErrors(val pattern: String? = null, val general: String? = null) {
        val isEmpty: Boolean get() = this == PatternErrors()
    }

    /** A move to another bucket waiting for the person's confirmation: it changes every month. */
    data class BucketChange(val count: Int, val from: Bucket, val to: Bucket)

    /** The text typed for a new pattern already lives in ANOTHER category (CLA-17, Figma 30). */
    data class PatternConflict(val texto: String, val existente: PatronExistente)

    sealed interface PatternSheet {
        data object Adding : PatternSheet
        data class Editing(val pattern: PatronCategoria) : PatternSheet
    }

    data class State(
        val content: Content = Content.Loading,
        /** Set when a refresh failed and the screen is the previous answer. */
        val refreshNotice: String? = null,
        val isRefreshing: Boolean = false,
        // The edit form; [changes] is what differs from the saved values.
        val draftNombre: String = "",
        val draftBucket: Bucket = Bucket.Necesidades,
        /** An icon the app does not know stays as it came unless the person picks another. */
        val draftIcono: String? = null,
        val fieldErrors: FieldErrors = FieldErrors(),
        val isSaving: Boolean = false,
        val pendingBucketChange: BucketChange? = null,
        val pendingDeletion: Boolean = false,
        val isDeleting: Boolean = false,
        /** The category no longer exists (deleted here or elsewhere): the screen goes back. */
        val isGone: Boolean = false,
        /** A 403 told us it is a system category. */
        val refusedAsInternal: Boolean = false,
        val pendingDiscard: Boolean = false,
        val patternSheet: PatternSheet? = null,
        val patternErrors: PatternErrors = PatternErrors(),
        val isSavingPattern: Boolean = false,
        val pendingPatternDeletion: PatronCategoria? = null,
        /** The id of the pattern whose deletion the server has not answered yet. */
        val deletingPattern: String? = null,
        /** What the text typed for a new pattern would move (CLA-15); `null` hides it. */
        val patternPreview: VistaPreviaPatron? = null,
        /** «Mover también estos N movimientos a …»; off until the person marks it. */
        val moveMatches: Boolean = false,
        /** Replaces the preview and the «Guardar patrón» button while it is set. */
        val patternConflict: PatternConflict? = null,
        /** The result of a write: «Categoría guardada». */
        val announcement: String? = null,
        /** A problem on the screen that is not tied to a control. */
        val notice: String? = null,
    ) {
        val category: CategoriaCatalogo? get() = (content as? Content.Loaded)?.categoria

        /** A system category, from the catalog or from a 403: nothing can be edited or deleted. */
        val isProtected: Boolean get() = refusedAsInternal || category?.esInterna == true

        /**
         * Only what differs from the saved category. The icon can be replaced but not cleared (the
         * client cannot send `null`), so a draft without icon over a saved one is no change.
         */
        val changes: CategoriaCambios
            get() {
                val category = category ?: return CategoriaCambios()
                val name = draftNombre.trim()
                return CategoriaCambios(
                    nombre = name.takeIf { it != category.nombre },
                    bucket = draftBucket.takeIf { it != category.bucket },
                    icono = draftIcono?.takeIf { it != category.icono },
                )
            }

        val hasChanges: Boolean get() = !changes.isEmpty

        /** The checkbox is offered only when the preview found something to move (and no conflict). */
        val offersMoveMatches: Boolean get() = patternConflict == null && (patternPreview?.total ?: 0) > 0
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Bumped on every request (and write) so a late answer for an older one is dropped. */
    private var generation = 0

    /** Bumped on every keystroke and whenever the sheet opens or closes. */
    private var previewGeneration = 0

    /**
     * The text [State.patternPreview] answers for. Saving another text (within the debounce) never
     * moves the previewed list: it no longer describes what would move.
     */
    private var previewedText: String? = null
    private var needsLoad = true

    // --- loading

    /** Runs [load] unless the screen already finished one; a load cancelled midway runs again. */
    suspend fun loadIfNeeded() {
        if (needsLoad) load()
    }

    suspend fun load() {
        _state.update { it.copy(content = Content.Loading, refreshNotice = null) }
        fetch(isRefresh = false)
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() = load()

    /** Pull to refresh: repeats the query without blanking the screen, and keeps it if it fails. */
    suspend fun refresh() {
        if (_state.value.content !is Content.Loaded) return retry()
        _state.update { it.copy(isRefreshing = true) }
        try {
            fetch(isRefresh = true)
        } finally {
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    private suspend fun fetch(isRefresh: Boolean) {
        generation += 1
        val mine = generation
        try {
            val catalog = api.categorias()
            if (mine != generation) return
            needsLoad = false
            val found = catalog.categoria(categoriaId)
            _state.update { state ->
                val next = state.copy(refreshNotice = null)
                if (found == null) next.copy(content = Content.NotFound) else next.showing(found, keepDraft = isRefresh && state.hasChanges)
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (mine != generation) return
            val failure = failure(error) ?: return
            needsLoad = false
            _state.update { if (isRefresh) it.copy(refreshNotice = DetalleCategoriaMessages.REFRESH_FAILED) else it.copy(content = Content.Failed(failure)) }
        }
    }

    // --- the edit form

    fun setDraftNombre(value: String) = _state.update { it.copy(draftNombre = value) }

    fun setDraftBucket(value: Bucket) = _state.update { it.copy(draftBucket = value) }

    fun setDraftIcono(value: String?) = _state.update { it.copy(draftIcono = value) }

    /** «Guardar». A bucket change asks first ([State.pendingBucketChange]), also when it moves nothing. */
    suspend fun save() {
        val state = _state.value
        val category = state.category ?: return
        if (state.isProtected || state.isSaving || state.isDeleting || !state.hasChanges) return
        if (state.draftBucket != category.bucket) {
            _state.update { it.copy(pendingBucketChange = BucketChange(category.transaccionesCount, category.bucket, state.draftBucket)) }
            return
        }
        performSave()
    }

    suspend fun confirmBucketChange() {
        if (_state.value.pendingBucketChange == null) return
        _state.update { it.copy(pendingBucketChange = null) }
        performSave()
    }

    /** «Cancelar»: nothing is sent and the draft stays. */
    fun cancelBucketChange() = _state.update { it.copy(pendingBucketChange = null) }

    private suspend fun performSave() {
        val state = _state.value
        val category = state.category ?: return
        if (state.isProtected || state.isSaving || !state.hasChanges) return
        val sent = state.changes
        _state.update { it.copy(isSaving = true, fieldErrors = FieldErrors(), announcement = null, notice = null) }
        val updated = try {
            api.actualizarCategoria(category.id, sent)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isSaving = false) }
            throw cancelled
        } catch (error: Exception) {
            _state.update { it.copy(isSaving = false) }
            saveFailed(error)
            return
        }
        generation += 1
        _state.update { it.showing(updated).copy(isSaving = false, announcement = DetalleCategoriaMessages.SAVED) }
        onChange()
    }

    private fun saveFailed(error: Exception) {
        when (error) {
            is SessionExpiredException -> Unit
            is CategoriaException.NotFound -> gone()
            is CategoriaException.IsInternal ->
                _state.update { it.copy(refusedAsInternal = true, fieldErrors = DetalleCategoriaMessages.categoryErrors(error)) }
            else -> _state.update { it.copy(fieldErrors = DetalleCategoriaMessages.categoryErrors(error)) }
        }
    }

    /** The category is not there any more: this screen has nothing to show, the lists must re-read. */
    private fun gone() {
        generation += 1
        _state.update { it.copy(content = Content.NotFound) }
        onChange()
    }

    // --- deleting the category

    fun requestDeletion() {
        val state = _state.value
        if (state.category == null || state.isProtected || state.isDeleting) return
        _state.update { it.copy(pendingDeletion = true) }
    }

    fun cancelDeletion() = _state.update { it.copy(pendingDeletion = false) }

    suspend fun confirmDeletion() {
        val state = _state.value
        val category = state.category ?: return
        if (!state.pendingDeletion || state.isProtected || state.isDeleting) return
        _state.update { it.copy(pendingDeletion = false, isDeleting = true, notice = null, announcement = null) }
        try {
            api.eliminarCategoria(category.id)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isDeleting = false) }
            throw cancelled
        } catch (_: CategoriaException.NotFound) {
            // Already gone: the same result, said by the list instead of by this screen.
            _state.update { it.copy(isDeleting = false, isGone = true) }
            onChange()
            return
        } catch (error: CategoriaException.IsInternal) {
            _state.update {
                it.copy(isDeleting = false, refusedAsInternal = true, fieldErrors = DetalleCategoriaMessages.categoryErrors(error))
            }
            return
        } catch (error: Exception) {
            val notice = if (error is SessionExpiredException) null else DetalleCategoriaMessages.deleteFailure(error, "la categoría")
            _state.update { it.copy(isDeleting = false, notice = notice) }
            return
        }
        _state.update { it.copy(isDeleting = false, isGone = true) }
        onChange()
        onDeleted(category.nombre)
    }

    // --- leaving with unsaved changes

    fun askToDiscard() {
        if (_state.value.hasChanges) _state.update { it.copy(pendingDiscard = true) }
    }

    fun cancelDiscard() = _state.update { it.copy(pendingDiscard = false) }

    fun discardChanges() = _state.update { state ->
        val restored = state.category?.let { state.showing(it) } ?: state
        restored.copy(pendingDiscard = false, fieldErrors = FieldErrors())
    }

    // --- patterns

    fun beginAddPattern() = openPatternSheet(PatternSheet.Adding)

    fun beginEditPattern(pattern: PatronCategoria) = openPatternSheet(PatternSheet.Editing(pattern))

    private fun openPatternSheet(sheet: PatternSheet) {
        val state = _state.value
        if (state.category == null || state.isProtected || state.isSavingPattern) return
        resetPatternSheet()
        _state.update { it.copy(patternSheet = sheet) }
    }

    fun dismissPatternSheet() {
        if (_state.value.isSavingPattern) return
        resetPatternSheet()
        _state.update { it.copy(patternSheet = null) }
    }

    fun setMoveMatches(value: Boolean) = _state.update { it.copy(moveMatches = value) }

    private fun resetPatternSheet() {
        previewedText = null
        previewGeneration += 1
        _state.update { it.copy(patternErrors = PatternErrors(), patternPreview = null, patternConflict = null, moveMatches = false) }
    }

    /**
     * The text of a new pattern changed: after [previewDelay] without another change, asks what it
     * would move. The screen calls it from an effect keyed by the text, so typing cancels the wait;
     * a newer call also supersedes an older one. No month is sent: the API resolves the latest one
     * with data. A failed preview only hides it; saving never depends on it.
     */
    suspend fun previewPattern(text: String) {
        val category = _state.value.category ?: return
        if (_state.value.patternSheet != PatternSheet.Adding) return
        previewGeneration += 1
        val mine = previewGeneration
        val trimmed = text.trim()
        _state.update { it.copy(patternConflict = null) }
        if (trimmed.isEmpty()) {
            previewedText = null
            _state.update { it.copy(patternPreview = null, moveMatches = false) }
            return
        }
        delay(previewDelay)
        if (mine != previewGeneration) return
        val preview = try {
            api.vistaPreviaPatron(category.id, trimmed)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: Exception) {
            null
        }
        if (mine != previewGeneration || _state.value.patternSheet != PatternSheet.Adding) return
        previewedText = trimmed
        val existente = preview?.existente
        _state.update { state ->
            val sameAnswer = preview?.total == state.patternPreview?.total && preview?.periodo == state.patternPreview?.periodo
            state.copy(
                patternPreview = preview,
                moveMatches = state.moveMatches && sameAnswer,
                patternConflict = existente?.takeIf { it.categoriaId != category.id }?.let { PatternConflict(trimmed, it) },
            )
        }
    }

    /**
     * «Guardar patrón»: a new «contains» pattern (CLA-14), moving the previewed month's movements
     * only when the checkbox is marked and the text is exactly the previewed one (CLA-15, L21).
     * Editing sends only the text, if it changed.
     */
    suspend fun savePattern(text: String) {
        val state = _state.value
        val category = state.category ?: return
        val sheet = state.patternSheet ?: return
        if (state.isSavingPattern) return
        val trimmed = text.trim()
        if (sheet is PatternSheet.Editing && trimmed == sheet.pattern.patron) {
            _state.update { it.copy(patternSheet = null) }
            return
        }
        _state.update { it.copy(isSavingPattern = true, patternErrors = PatternErrors()) }
        var movidos = 0
        val saved = try {
            when (sheet) {
                PatternSheet.Adding -> {
                    val moves = previewedText == trimmed && state.offersMoveMatches && state.moveMatches
                    val created = api.crearPatron(category.id, trimmed, moverDelPeriodo = if (moves) state.patternPreview?.periodo else null)
                    movidos = created.movidos
                    created.patron
                }
                is PatternSheet.Editing -> api.actualizarPatron(sheet.pattern.id, PatronCambios(patron = trimmed))
            }
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isSavingPattern = false) }
            throw cancelled
        } catch (error: Exception) {
            _state.update { it.copy(isSavingPattern = false) }
            patternFailed(error, sheet, trimmed)
            return
        }
        _state.update { it.copy(isSavingPattern = false) }
        dismissPatternSheet()
        generation += 1
        when (sheet) {
            PatternSheet.Adding -> replacePatterns { it + saved }
            is PatternSheet.Editing -> replacePatterns { list -> list.map { if (it.id == sheet.pattern.id) saved else it } }
        }
        _state.update { it.copy(announcement = DetalleCategoriaMessages.patternSaved(movidos)) }
        onChange()
        // Moved movements change this category's count: read it again without blanking the screen.
        if (movidos > 0) fetch(isRefresh = true)
    }

    /** «Moverlo a …» (Figma 30): the existing pattern moves here, keeping its id (CLA-17). */
    suspend fun movePatternHere() {
        val state = _state.value
        val category = state.category ?: return
        val conflict = state.patternConflict ?: return
        if (state.isSavingPattern) return
        _state.update { it.copy(isSavingPattern = true, patternErrors = PatternErrors()) }
        val moved = try {
            api.actualizarPatron(conflict.existente.patronId, PatronCambios(categoriaId = category.id))
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isSavingPattern = false) }
            throw cancelled
        } catch (_: PatronException.PatternNotFound) {
            // Deleted meanwhile: the text is free now, so the conflict goes and saving works.
            _state.update {
                it.copy(
                    isSavingPattern = false,
                    patternConflict = null,
                    patternErrors = PatternErrors(general = DetalleCategoriaMessages.PATTERN_GONE_SAVE_HERE),
                )
            }
            return
        } catch (error: Exception) {
            _state.update { it.copy(isSavingPattern = false) }
            patternFailed(error, PatternSheet.Adding, conflict.texto)
            return
        }
        _state.update { it.copy(isSavingPattern = false) }
        dismissPatternSheet()
        generation += 1
        replacePatterns { list -> list.filter { it.id != moved.id } + moved }
        _state.update { it.copy(announcement = DetalleCategoriaMessages.patternSaved(0)) }
        onChange()
    }

    private fun patternFailed(error: Exception, sheet: PatternSheet, text: String) {
        when {
            error is SessionExpiredException -> Unit
            // CLA-17: the text lives in another category; the sheet offers to move it here.
            error is PatronException.DuplicateOf && error.existente.categoriaId != categoriaId ->
                _state.update { it.copy(patternConflict = PatternConflict(text, error.existente)) }
            error is PatronException.CategoryNotFound -> {
                _state.update { it.copy(patternSheet = null) }
                gone()
            }
            error is PatronException.PatternNotFound -> {
                _state.update { it.copy(patternSheet = null, notice = DetalleCategoriaMessages.PATTERN_GONE) }
                if (sheet is PatternSheet.Editing) replacePatterns { list -> list.filter { it.id != sheet.pattern.id } }
                onChange()
            }
            else -> _state.update { it.copy(patternErrors = DetalleCategoriaMessages.patternErrors(error)) }
        }
    }

    fun requestPatternDeletion(pattern: PatronCategoria) {
        val state = _state.value
        if (state.isProtected || state.deletingPattern != null) return
        _state.update { it.copy(pendingPatternDeletion = pattern) }
    }

    fun cancelPatternDeletion() = _state.update { it.copy(pendingPatternDeletion = null) }

    suspend fun confirmPatternDeletion() {
        val state = _state.value
        val pattern = state.pendingPatternDeletion ?: return
        if (state.deletingPattern != null) return
        _state.update { it.copy(pendingPatternDeletion = null, deletingPattern = pattern.id, notice = null, announcement = null) }
        try {
            api.eliminarPatron(pattern.id)
            generation += 1
            replacePatterns { list -> list.filter { it.id != pattern.id } }
            _state.update { it.copy(announcement = DetalleCategoriaMessages.PATTERN_DELETED) }
            onChange()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: PatronException.PatternNotFound) {
            replacePatterns { list -> list.filter { it.id != pattern.id } }
            onChange()
        } catch (error: Exception) {
            if (error !is SessionExpiredException) {
                _state.update { it.copy(notice = DetalleCategoriaMessages.deleteFailure(error, "el patrón")) }
            }
        } finally {
            _state.update { it.copy(deletingPattern = null) }
        }
    }

    private fun replacePatterns(change: (List<PatronCategoria>) -> List<PatronCategoria>) = _state.update { state ->
        val current = state.category ?: return@update state
        state.copy(content = Content.Loaded(current.copy(patrones = change(current.patrones))))
    }

    private companion object {
        /** Takes a category as the saved one; the form follows it unless the person is mid-edit. */
        fun State.showing(category: CategoriaCatalogo, keepDraft: Boolean = false): State {
            val loaded = copy(content = Content.Loaded(category))
            if (keepDraft) return loaded
            return loaded.copy(draftNombre = category.nombre, draftBucket = category.bucket, draftIcono = category.icono)
        }

        /** Null means "show nothing": the session expired and the root is already switching to sign-in. */
        fun failure(error: Exception): Failure? = when (error) {
            is SessionExpiredException -> null
            is IOException -> Failure.Connection
            else -> Failure.Server
        }
    }
}
