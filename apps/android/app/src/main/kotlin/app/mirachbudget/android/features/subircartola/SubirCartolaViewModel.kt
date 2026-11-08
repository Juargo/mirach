package app.mirachbudget.android.features.subircartola

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.CartolaEdit
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.IngestaException
import app.mirachbudget.android.core.networking.IngestaMapper
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.staging.CartolaFile
import app.mirachbudget.android.core.staging.CartolaSource
import app.mirachbudget.android.core.staging.CartolaStaging
import app.mirachbudget.android.core.staging.StageResult
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.withContext

/**
 * State machine of "Subir cartola" (port of iOS `SubirCartolaViewModel.swift`), plus the
 * statement-processing consent (PRI-02) before the first upload.
 *
 * The password lives in a private property, never in [State], so it cannot leak through a screen,
 * a log line or a test failure message. It is re-sent on every later call: the API keeps no preview.
 */
class SubirCartolaViewModel(
    private val api: MirachApi,
    private val staging: CartolaStaging,
    /** Staging copies up to 10 MB: never on the main thread. */
    private val io: CoroutineDispatcher = Dispatchers.IO,
) : ViewModel() {
    sealed interface PreviewFailure {
        data object NoMovements : PreviewFailure

        /** The server's own message for a bad file, unknown bank or bad structure (or the app's fallback). */
        data class Rejected(val message: String) : PreviewFailure
        data object TemporarilyUnavailable : PreviewFailure
        data object AccountProblem : PreviewFailure
        data object Connection : PreviewFailure
        data object Server : PreviewFailure
    }

    enum class ImportFailure {
        TemporarilyUnavailable,

        /** Permanent: retrying cannot help. */
        AccountProblem,
        Connection,
        Server,
        ;

        val isRetryable: Boolean get() = this != AccountProblem
    }

    data class ImportSummary(val banco: String, val totalTransacciones: Int, val duplicadosOmitidos: Int)

    /** What [receiveSharedFile] did with a shared file: the caller removes it from the inbox only when consumed. */
    enum class SharedFileReceipt {
        /** Taken: staged, refused with a message, or ignored with [State.sharedFileNotice]. */
        CONSUMED,

        /** The flow cannot take it yet (consent check or acceptance running): offer it again later. */
        PENDING,
    }

    sealed interface Step {
        /** Checking the consent: nothing to show yet. Also where sign-out leaves the flow. */
        data object Preparando : Step

        /**
         * The PRI-02 consent screen. [dismissed]: «Ahora no» was tapped, uploads stay blocked until
         * the person reopens and accepts it. [failed]: the last acceptance did not reach the server.
         */
        data class Consentimiento(
            val dismissed: Boolean = false,
            val isAccepting: Boolean = false,
            val failed: Boolean = false,
        ) : Step

        /** Nothing chosen. [message] explains a refused file or a rejected upload. */
        data class Inicial(val message: String?) : Step
        data object Previsualizando : Step

        /** A protected PDF: ask for the password ([incorrect] after a wrong attempt). */
        data class Protegido(val filename: String, val incorrect: Boolean) : Step
        data class ErrorPrevia(val failure: PreviewFailure) : Step
        data class Decidiendo(val preview: CartolaPreview) : Step

        /** Reviewing the rows. The edits live in [State.edits]. */
        data class Revisando(val preview: CartolaPreview) : Step
        data object Subiendo : Step

        /** [canReturnToReview]: the failed commit came from the review, «Volver a revisar» is offered. */
        data class ErrorImportacion(val failure: ImportFailure, val canReturnToReview: Boolean) : Step
        data class Exito(val summary: ImportSummary) : Step
    }

    /** The user's categories, loaded on reaching [Step.Decidiendo]. «Subir tal cual» never needs them. */
    sealed interface CatalogState {
        data object Loading : CatalogState
        data class Loaded(val catalog: CatalogoCategorias) : CatalogState
        data object Failed : CatalogState
    }

    /** Field-level messages of the "Crear categoría" form; [general] belongs to no field. */
    data class CategoryFormErrors(
        val name: String? = null,
        val bucket: String? = null,
        val pattern: String? = null,
        val general: String? = null,
    ) {
        val isEmpty: Boolean get() = this == CategoryFormErrors()
    }

    /** The repeated preview after creating a category. */
    sealed interface PreviewRefresh {
        data object Idle : PreviewRefresh
        data object Updating : PreviewRefresh

        /** The category exists but the new preview could not load; «Reintentar» is offered. */
        data class Failed(val categoryName: String) : PreviewRefresh
    }

    data class State(
        val step: Step = Step.Preparando,
        val catalog: CatalogState = CatalogState.Loading,
        /** What the person changed, `rowIndex` to `categoriaId`. Only touched rows are here. */
        val edits: Map<Int, String> = emptyMap(),
        /** An error above the review (a refused edit, a commit that bounced back). */
        val reviewNotice: String? = null,
        /** A neutral message above the review («X» se aplicó a N filas más). */
        val reviewInfo: String? = null,
        val previewRefresh: PreviewRefresh = PreviewRefresh.Idle,
        val isCreatingCategory: Boolean = false,
        val categoryFormErrors: CategoryFormErrors = CategoryFormErrors(),
        /** Grows by one with every category created: the form closes when it changes. */
        val createdCategoryCount: Int = 0,
        /** Grows by one with every finished import: the shell reloads the Resumen when it changes. */
        val importsCompleted: Int = 0,
        /** The staged copy, for the "file chosen" line. `null` when nothing is staged. */
        val stagedFile: CartolaFile? = null,
        /**
         * One-shot message about a file shared from another app (S2): ignored because the flow is
         * busy, or refused while the consent is shown. Cleared with [dismissSharedFileNotice].
         */
        val sharedFileNotice: String? = null,
    ) {
        val loadedCatalog: CatalogoCategorias? get() = (catalog as? CatalogState.Loaded)?.catalog
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    private var password: String? = null
    private var preview: CartolaPreview? = null

    /** The last commit attempt, to retry it as it was. */
    private var lastCommit: Pair<List<CartolaEdit>, Boolean>? = null

    /** Set when a commit bounced because of the edits: the next catalog that loads drops gone categories. */
    private var pruneEditsPending = false

    /** A commit already bounced back to the review: a second rejection is not about the edits. */
    private var editsBounced = false

    /** Tags each repeated preview so a stale answer cannot overwrite a newer one. */
    private var refreshSerial = 0
    private var pendingRefresh: Pair<CategoriaCatalogo, Int>? = null

    /** Bumped whenever the flow is reset so an answer to an old request is dropped. */
    private var generation = 0

    private val step: Step get() = _state.value.step

    // --- consent (PRI-02)

    /**
     * The flow opens: shows the consent first unless it is in force. A failed check lets the API decide.
     * Opening it again on the idle initial screen checks once more, so a consent revoked from Perfil
     * (PRI-06) brings the consent back; an in-force answer or a failed check leaves the screen as it is.
     */
    suspend fun start() {
        val opened = step
        if (opened != Step.Preparando && !(opened is Step.Inicial && _state.value.stagedFile == null)) return
        val mine = generation
        val inForce = try {
            api.consentimientos().cartolasVigente
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            true
        }
        if (mine != generation || step != opened) return
        if (!inForce) setStep(Step.Consentimiento()) else if (opened == Step.Preparando) setStep(Step.Inicial(null))
    }

    /** «Acepto y continúo». A file waiting for the consent is previewed again with its password. */
    suspend fun acceptConsent() {
        val current = step as? Step.Consentimiento ?: return
        if (current.isAccepting) return
        setStep(Step.Consentimiento(isAccepting = true))
        val mine = generation
        try {
            api.aceptarConsentimientoCartolas()
        } catch (cancelled: CancellationException) {
            if (mine == generation) setStep(Step.Consentimiento())
            throw cancelled
        } catch (e: Exception) {
            // A 401 has no message here: the relay signs out.
            if (mine == generation) setStep(Step.Consentimiento(failed = e !is SessionExpiredException))
            return
        }
        if (mine != generation) return
        if (_state.value.stagedFile != null) runPreview(mine) else setStep(Step.Inicial(null))
    }

    /** «Ahora no»: no upload until accepted. A file waiting for the consent is deleted. */
    fun declineConsent() {
        val current = step as? Step.Consentimiento ?: return
        if (current.isAccepting) return
        clear()
        setStep(Step.Consentimiento(dismissed = true))
    }

    /** Reopens the consent after «Ahora no». */
    fun showConsent() {
        if ((step as? Step.Consentimiento)?.dismissed == true) setStep(Step.Consentimiento())
    }

    // --- choosing and previewing

    /** Picked from the system picker. Validates and stages the file, then asks for the preview. */
    suspend fun chooseFile(source: CartolaSource) {
        when (step) {
            is Step.Inicial, is Step.Protegido, is Step.ErrorPrevia -> Unit
            else -> return
        }
        clear()
        val mine = generation
        val result = withContext(io) { staging.stage(source) }
        if (mine != generation) {
            if (result is StageResult.Staged) staging.discard(result.file)
            return
        }
        when (result) {
            is StageResult.Rejected -> setStep(Step.Inicial(SubirCartolaMessages.fileProblem(result.problem)))
            is StageResult.Staged -> {
                _state.update { it.copy(stagedFile = result.file) }
                runPreview(mine)
            }
        }
    }

    /**
     * A `.pdf` or `.xlsx` shared from another app (S2). Idle steps and [Step.Exito] treat it like a
     * picked file; the consent keeps it waiting; a busy flow ignores it with [State.sharedFileNotice].
     * [onConsumed] runs before any staging starts, so the caller can drop the inbox entry at once.
     */
    suspend fun receiveSharedFile(source: CartolaSource, onConsumed: () -> Unit = {}): SharedFileReceipt {
        when (val current = step) {
            Step.Preparando -> return SharedFileReceipt.PENDING
            is Step.Consentimiento -> {
                if (current.isAccepting) return SharedFileReceipt.PENDING
                onConsumed()
                stageForConsent(source)
            }
            is Step.Inicial, is Step.Protegido, is Step.ErrorPrevia -> {
                onConsumed()
                chooseFile(source)
            }
            is Step.Exito -> {
                onConsumed()
                discard()
                chooseFile(source)
            }
            Step.Previsualizando, is Step.Decidiendo, is Step.Revisando, Step.Subiendo, is Step.ErrorImportacion -> {
                onConsumed()
                _state.update { it.copy(sharedFileNotice = SubirCartolaMessages.SHARED_FILE_BUSY) }
            }
        }
        return SharedFileReceipt.CONSUMED
    }

    /** The screen showed [State.sharedFileNotice]. */
    fun dismissSharedFileNotice() = _state.update { it.copy(sharedFileNotice = null) }

    /** «Reintentar» with a password from [Step.Protegido]. */
    suspend fun submitPassword(text: String) {
        if (step !is Step.Protegido || text.isEmpty()) return
        password = text
        runPreview(generation)
    }

    /** «Reintentar» after a failed preview. */
    suspend fun retryPreview() {
        if (step !is Step.ErrorPrevia || _state.value.stagedFile == null) return
        runPreview(generation)
    }

    /** «Reintentar» for the catalog, from the decision or the review. */
    suspend fun retryCatalog() {
        if (!isDecidingOrReviewing() || _state.value.catalog != CatalogState.Failed) return
        loadCatalog(generation)
    }

    /** The catalog was written elsewhere: read it again and drop the edits whose category is gone. */
    suspend fun catalogDidChange() {
        if (!isDecidingOrReviewing()) return
        pruneEditsPending = true
        val mine = generation
        val removed = loadCatalog(mine)
        if (removed != null && removed > 0 && mine == generation) {
            _state.update { it.copy(reviewNotice = SubirCartolaMessages.STALE_EDITS) }
        }
    }

    // --- deciding and reviewing

    /** «Revisar y editar». Needs the catalog: without it the rows cannot be named or edited. */
    fun startReview() {
        val deciding = step as? Step.Decidiendo ?: return
        if (_state.value.loadedCatalog == null) return
        _state.update { it.copy(edits = emptyMap(), reviewNotice = null, step = Step.Revisando(deciding.preview)) }
    }

    /**
     * The person picked [categoriaId] for a row, kept in memory until «Confirmar». Picking the
     * category the server already suggested undoes the edit.
     */
    fun choose(categoriaId: String, rowIndex: Int) {
        val current = _state.value
        val reviewing = current.step as? Step.Revisando ?: return
        val categories = current.loadedCatalog ?: return
        if (current.previewRefresh == PreviewRefresh.Updating) return
        val row = editableRow(reviewing.preview, rowIndex) ?: return
        if (categories.categoria(categoriaId) == null) return
        val next = if (row.sugerido?.categoriaId == categoriaId) {
            current.edits - rowIndex
        } else {
            current.edits + (rowIndex to categoriaId)
        }
        if (!fits(next)) {
            _state.update { it.copy(reviewNotice = SubirCartolaMessages.TOO_MANY_EDITS) }
            return
        }
        _state.update { it.copy(edits = next, reviewNotice = null) }
    }

    /** «Confirmar»: commits with only the rows the person touched. */
    suspend fun confirm() {
        val current = _state.value
        if (current.step !is Step.Revisando || current.loadedCatalog == null) return
        if (current.previewRefresh == PreviewRefresh.Updating) return
        commit(sorted(current.edits), fromReview = true)
    }

    /** «Subir tal cual»: commit with no edits. */
    suspend fun uploadAsIs() {
        if (step !is Step.Decidiendo) return
        commit(emptyList(), fromReview = false)
    }

    /** «Reintentar» after a failed import: the same edits again. */
    suspend fun retryImport() {
        val failed = step as? Step.ErrorImportacion ?: return
        val (edits, fromReview) = lastCommit ?: return
        if (!failed.failure.isRetryable) return
        commit(edits, fromReview)
    }

    /** «Volver a revisar»: the edits are still there. */
    fun backToReview() {
        val failed = step as? Step.ErrorImportacion ?: return
        val preview = preview ?: return
        if (!failed.canReturnToReview) return
        _state.update { it.copy(reviewNotice = null, step = Step.Revisando(preview)) }
    }

    /**
     * «Descartar», «Subir otra cartola» and «Empezar de nuevo»: back to the start with the staged
     * copy and the password gone. The confirmation dialog belongs to the screen.
     */
    fun discard() {
        clear()
        setStep(Step.Inicial(null))
    }

    /** Sign-out: every staged copy deleted, and the next person's consent is checked again. */
    fun discardAll() {
        clear()
        staging.purgeAll()
        setStep(Step.Preparando)
    }

    // --- create a category from a row

    /** Called when the form opens: clears the errors of a previous attempt. */
    fun resetCategoryForm() = _state.update { it.copy(categoryFormErrors = CategoryFormErrors()) }

    /**
     * «Crear» in the category form, for the row it was opened from. On success the row takes the
     * new category, the form closes ([State.createdCategoryCount] changes) and the preview is
     * repeated with the same file and password so the new pattern can reclassify other rows.
     */
    suspend fun createCategory(nueva: NuevaCategoria, rowIndex: Int) {
        val current = _state.value
        val reviewing = current.step as? Step.Revisando ?: return
        val categories = current.loadedCatalog ?: return
        if (current.previewRefresh == PreviewRefresh.Updating || current.isCreatingCategory) return
        editableRow(reviewing.preview, rowIndex) ?: return
        _state.update { it.copy(isCreatingCategory = true, categoryFormErrors = CategoryFormErrors()) }
        val mine = generation
        val category = try {
            api.crearCategoria(nueva)
        } catch (cancelled: CancellationException) {
            if (mine == generation) _state.update { it.copy(isCreatingCategory = false) }
            throw cancelled
        } catch (e: Exception) {
            if (mine != generation) return
            if (e is SessionExpiredException) {
                discard()
            } else {
                _state.update { it.copy(isCreatingCategory = false, categoryFormErrors = SubirCartolaMessages.formErrors(e)) }
            }
            return
        }
        if (mine != generation) return
        _state.update {
            val next = it.edits + (rowIndex to category.id)
            val fits = fits(next)
            it.copy(
                isCreatingCategory = false,
                // The category exists on the server now: usable at once, even if the refresh fails.
                catalog = CatalogState.Loaded(CatalogoCategorias(categories.categorias + category)),
                edits = if (fits) next else it.edits,
                reviewNotice = if (fits) null else SubirCartolaMessages.TOO_MANY_EDITS,
                reviewInfo = null,
                createdCategoryCount = it.createdCategoryCount + 1,
            )
        }
        refreshPreview(category, rowIndex, mine)
    }

    /** «Reintentar» after the repeated preview failed. */
    suspend fun retryPreviewRefresh() {
        val current = _state.value
        val (category, row) = pendingRefresh ?: return
        if (current.previewRefresh !is PreviewRefresh.Failed || current.isCreatingCategory) return
        if (current.step !is Step.Revisando) return
        refreshPreview(category, row, generation)
    }

    // --- internals

    private suspend fun runPreview(mine: Int) {
        val file = _state.value.stagedFile ?: return
        setStep(Step.Previsualizando)
        val result = try {
            api.previewIngesta(file, password)
        } catch (cancelled: CancellationException) {
            if (mine == generation) setStep(Step.ErrorPrevia(PreviewFailure.Connection))
            throw cancelled
        } catch (e: Exception) {
            if (mine == generation) failPreview(e, file.filename)
            return
        }
        if (mine != generation) return
        preview = result
        setStep(Step.Decidiendo(result))
        // The catalog arrives after the decision shows: «Subir tal cual» never waits for it.
        loadCatalog(mine)
    }

    /**
     * Stages a shared file while the consent is shown. It replaces a file waiting after a 409, and
     * reopens the consent after «Ahora no» so the person can accept it for this file.
     */
    private suspend fun stageForConsent(source: CartolaSource) {
        clear()
        val mine = generation
        val result = withContext(io) { staging.stage(source) }
        if (mine != generation) {
            if (result is StageResult.Staged) staging.discard(result.file)
            return
        }
        when (result) {
            is StageResult.Rejected ->
                _state.update { it.copy(sharedFileNotice = SubirCartolaMessages.fileProblem(result.problem)) }
            is StageResult.Staged -> when (val current = step) {
                // An acceptance that is running previews the file once it lands.
                is Step.Consentimiento -> _state.update {
                    it.copy(stagedFile = result.file, step = if (current.isAccepting) current else current.copy(dismissed = false))
                }
                // Accepted while the copy was being made: preview it as a picked file.
                is Step.Inicial -> {
                    _state.update { it.copy(stagedFile = result.file) }
                    runPreview(mine)
                }
                else -> staging.discard(result.file)
            }
        }
    }

    private fun failPreview(error: Exception, filename: String) {
        when (error) {
            // The shell is already moving to sign-in: leave nothing behind.
            is SessionExpiredException -> discard()
            is IngestaException.PasswordRequired -> {
                password = null
                setStep(Step.Protegido(filename, incorrect = false))
            }
            is IngestaException.PasswordIncorrect -> {
                password = null
                setStep(Step.Protegido(filename, incorrect = true))
            }
            // The file and password stay: once accepted, the same preview runs again.
            is IngestaException.ConsentRequired -> setStep(Step.Consentimiento())
            // Not retryable: drop the broken copy, ask for the file again.
            is IngestaException.FileUnreadable -> {
                clear()
                setStep(Step.Inicial(SubirCartolaMessages.UNREADABLE_COPY))
            }
            is IngestaException.NoMovements -> setStep(Step.ErrorPrevia(PreviewFailure.NoMovements))
            is IngestaException.Rejected -> setStep(Step.ErrorPrevia(PreviewFailure.Rejected(rejectedMessage(error))))
            is IngestaException.CatalogUnavailable -> setStep(Step.ErrorPrevia(PreviewFailure.TemporarilyUnavailable))
            is IngestaException.CatalogIncomplete -> setStep(Step.ErrorPrevia(PreviewFailure.AccountProblem))
            is IOException -> setStep(Step.ErrorPrevia(PreviewFailure.Connection))
            else -> setStep(Step.ErrorPrevia(PreviewFailure.Server))
        }
    }

    private suspend fun commit(edits: List<CartolaEdit>, fromReview: Boolean) {
        val file = _state.value.stagedFile ?: return
        val preview = preview ?: return
        lastCommit = edits to fromReview
        setStep(Step.Subiendo)
        val mine = generation
        val result = try {
            api.commitIngesta(file, password, edits)
        } catch (cancelled: CancellationException) {
            // A failed commit saves nothing: safe to retry.
            if (mine == generation) setStep(Step.ErrorImportacion(ImportFailure.Connection, fromReview))
            throw cancelled
        } catch (e: Exception) {
            if (mine == generation) failImport(e, sentEdits = edits.isNotEmpty(), fromReview = fromReview)
            return
        }
        if (mine != generation) return
        val summary = ImportSummary(preview.banco, result.totalTransacciones, result.duplicadosOmitidos)
        // Done: the copy and the password are not needed any more.
        clear()
        _state.update { it.copy(step = Step.Exito(summary), importsCompleted = it.importsCompleted + 1) }
    }

    private suspend fun failImport(error: Exception, sentEdits: Boolean, fromReview: Boolean) {
        when {
            error is SessionExpiredException -> discard()
            error is IngestaException.ConsentRequired -> setStep(Step.Consentimiento())
            error is IngestaException.Rejected && sentEdits && !editsBounced -> recoverFromBadEdits(error)
            error is IngestaException.Rejected -> rejectCommit(error)
            error is IngestaException.NoMovements -> {
                clear()
                setStep(Step.Inicial(SubirCartolaMessages.NO_MOVEMENTS))
            }
            error is IngestaException.FileUnreadable -> {
                clear()
                setStep(Step.Inicial(SubirCartolaMessages.UNREADABLE_COPY))
            }
            error is IngestaException.CatalogIncomplete -> setStep(Step.ErrorImportacion(ImportFailure.AccountProblem, fromReview))
            error is IngestaException.CatalogUnavailable ->
                setStep(Step.ErrorImportacion(ImportFailure.TemporarilyUnavailable, fromReview))
            error is IOException -> setStep(Step.ErrorImportacion(ImportFailure.Connection, fromReview))
            else -> setStep(Step.ErrorImportacion(ImportFailure.Server, fromReview))
        }
    }

    /**
     * A 400 about `edits` has the same shape as one about the file. This file just previewed fine,
     * so the edits are the likely cause (the catalog drifted): reload the catalog and drop the edits
     * it explains. If that explains nothing, the 400 is about the file after all. Happens once.
     */
    private suspend fun recoverFromBadEdits(error: IngestaException.Rejected) {
        val preview = preview ?: return
        val mine = generation
        pruneEditsPending = true
        val removed = loadCatalog(mine)
        if (mine != generation) return
        if (removed == 0) {
            rejectCommit(error)
            return
        }
        editsBounced = true
        _state.update { it.copy(reviewNotice = SubirCartolaMessages.BAD_EDITS, step = Step.Revisando(preview)) }
    }

    /** Same family as the preview's 400 (file, bank, structure): the message, back to the start. */
    private fun rejectCommit(error: IngestaException.Rejected) {
        clear()
        setStep(Step.Inicial(rejectedMessage(error)))
    }

    /** Loads the catalog. Returns how many edits a pending prune dropped, or `null` when it failed or the flow moved on. */
    private suspend fun loadCatalog(mine: Int): Int? {
        _state.update { it.copy(catalog = CatalogState.Loading) }
        val result = try {
            api.categorias()
        } catch (cancelled: CancellationException) {
            if (mine == generation) _state.update { it.copy(catalog = CatalogState.Failed) }
            throw cancelled
        } catch (e: Exception) {
            if (mine != generation) return null
            if (e is SessionExpiredException) discard() else _state.update { it.copy(catalog = CatalogState.Failed) }
            return null
        }
        if (mine != generation) return null
        if (!pruneEditsPending) {
            _state.update { it.copy(catalog = CatalogState.Loaded(result)) }
            return 0
        }
        // An edit naming a category that no longer exists would be refused again.
        pruneEditsPending = false
        val edits = _state.value.edits
        val kept = edits.filterValues { result.categoria(it) != null }
        _state.update { it.copy(catalog = CatalogState.Loaded(result), edits = kept) }
        return edits.size - kept.size
    }

    private suspend fun refreshPreview(category: CategoriaCatalogo, fromRow: Int, mine: Int) {
        val file = _state.value.stagedFile ?: return
        pendingRefresh = category to fromRow
        _state.update { it.copy(previewRefresh = PreviewRefresh.Updating) }
        val serial = ++refreshSerial
        fun current() = mine == generation && serial == refreshSerial

        // The catalog first, so rows resolve against the server's; if it cannot be read the local one stays.
        val fresh = try {
            api.categorias()
        } catch (cancelled: CancellationException) {
            if (current()) _state.update { it.copy(previewRefresh = PreviewRefresh.Failed(category.nombre)) }
            throw cancelled
        } catch (e: Exception) {
            null
        }
        if (fresh != null && current()) {
            // A stale read that does not list it yet still offers the category the server just confirmed.
            val listed = fresh.categoria(category.id) != null
            val catalog = if (listed) fresh else CatalogoCategorias(fresh.categorias + category)
            _state.update { it.copy(catalog = CatalogState.Loaded(catalog)) }
        }
        if (!current()) return

        val result = try {
            api.previewIngesta(file, password)
        } catch (cancelled: CancellationException) {
            if (current()) _state.update { it.copy(previewRefresh = PreviewRefresh.Failed(category.nombre)) }
            throw cancelled
        } catch (e: Exception) {
            if (!current()) return
            if (e is SessionExpiredException) {
                discard()
            } else {
                _state.update { it.copy(previewRefresh = PreviewRefresh.Failed(category.nombre)) }
            }
            return
        }
        if (!current()) return
        val before = (step as? Step.Revisando)?.preview ?: return
        val edits = _state.value.edits
        val count = newMatches(before.filas, result.filas, category.id, fromRow, edits)
        preview = result
        pendingRefresh = null
        // Same file, same rows: an edit keeps only a row that still exists and is editable.
        val editable = result.filas.filter { it.isEditable }.map { it.rowIndex }.toSet()
        _state.update {
            it.copy(
                step = Step.Revisando(result),
                edits = it.edits.filterKeys { row -> row in editable },
                previewRefresh = PreviewRefresh.Idle,
                reviewInfo = SubirCartolaMessages.applied(category.nombre, count),
            )
        }
    }

    /** Forgets the file, its copy on disk, the password and any pending answer. */
    private fun clear() {
        generation++
        _state.value.stagedFile?.let(staging::discard)
        password = null
        preview = null
        lastCommit = null
        pruneEditsPending = false
        editsBounced = false
        pendingRefresh = null
        _state.update {
            it.copy(
                stagedFile = null,
                catalog = CatalogState.Loading,
                edits = emptyMap(),
                reviewNotice = null,
                reviewInfo = null,
                previewRefresh = PreviewRefresh.Idle,
                isCreatingCategory = false,
                categoryFormErrors = CategoryFormErrors(),
            )
        }
    }

    private fun setStep(next: Step) = _state.update { it.copy(step = next) }

    private fun isDecidingOrReviewing() = step is Step.Decidiendo || step is Step.Revisando

    private fun editableRow(preview: CartolaPreview, rowIndex: Int): CartolaRow? =
        preview.filas.firstOrNull { it.rowIndex == rowIndex }?.takeIf { it.isEditable }

    private fun rejectedMessage(error: IngestaException.Rejected) =
        error.serverMessage ?: SubirCartolaMessages.REJECTED_FALLBACK

    companion object {
        /** The server rejects an `edits` text over 256 KB. */
        const val MAX_EDITS_JSON_BYTES = 256 * 1024

        private fun sorted(edits: Map<Int, String>): List<CartolaEdit> =
            edits.toSortedMap().map { (row, id) -> CartolaEdit(row, id) }

        private fun fits(edits: Map<Int, String>): Boolean =
            IngestaMapper.editsJson(sorted(edits)).toByteArray(Charsets.UTF_8).size <= MAX_EDITS_JSON_BYTES

        /**
         * Rows the new category now matches that it did not before. Not counted: the row it was
         * created from, rows classified by hand, duplicates and incomes. A row absent from [before]
         * counts like a changed one.
         */
        internal fun newMatches(
            before: List<CartolaRow>,
            after: List<CartolaRow>,
            categoryId: String,
            fromRow: Int,
            edits: Map<Int, String>,
        ): Int {
            val previous = before.distinctBy { it.rowIndex }.associate { it.rowIndex to it.sugerido?.categoriaId }
            return after.count { row ->
                row.isEditable && row.rowIndex != fromRow && edits[row.rowIndex] == null &&
                    row.sugerido?.categoriaId == categoryId && previous[row.rowIndex] != categoryId
            }
        }
    }
}
