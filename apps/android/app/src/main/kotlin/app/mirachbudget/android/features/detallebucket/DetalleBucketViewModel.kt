package app.mirachbudget.android.features.detallebucket

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.Parecidos
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ReclasificarException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of "Detalle de bucket" (port of iOS `DetalleBucketViewModel`): one bucket and month at a
 * time, plus the reclassification of a movement in a sheet over the list (Figma 09) and the creation
 * of a category from that sheet. [onReclassified] runs once per successful move: the Resumen's
 * figures changed too.
 */
class DetalleBucketViewModel(
    private val api: MirachApi,
    val bucket: Bucket,
    periodo: Periodo,
    private val onReclassified: () -> Unit = {},
) : ViewModel() {
    enum class Failure {
        /** No answer from the server (offline, timeout). */
        Connection,

        /** The server answered with something the app cannot use (non-2xx, unexpected body). */
        Server,
    }

    sealed interface Content {
        data object Loading : Content
        data class Loaded(val detalle: BucketDetalle) : Content
        data class Failed(val failure: Failure) : Content
    }

    /** The user's categories, loaded the first time the sheet opens. */
    sealed interface CatalogState {
        data object Idle : CatalogState
        data object Loading : CatalogState
        data class Loaded(val catalog: CatalogoCategorias) : CatalogState
        data object Failed : CatalogState
    }

    /** A move to another bucket, waiting for the person to confirm it (it changes the month's maths). */
    data class BucketChange(
        val movement: MovimientoBucket,
        val category: CategoriaCatalogo,
        /** The month whose similar movements move too, when the person marked «Aplicar a…». */
        val aplicarAParecidos: Periodo?,
    )

    /**
     * The picked category with a suggested pattern (CLA-03): the sheet adds «Aplicar a “…”» over
     * «Guardar». [periodo] is the month `parecidos` answered for, the only one «Aplicar» may send.
     */
    data class SimilarSuggestion(val movement: MovimientoBucket, val category: CategoriaCatalogo, val parecidos: Parecidos, val periodo: Periodo)

    data class State(
        val content: Content = Content.Loading,
        /** The month on screen (or being loaded). */
        val periodo: Periodo,
        /** Months with movements, most recent first; empty until loaded or if that call failed. */
        val periodos: List<Periodo> = emptyList(),
        val isRefreshing: Boolean = false,
        val catalog: CatalogState = CatalogState.Idle,
        /** The movement the sheet is open for, or `null` when it is closed. */
        val sheetMovement: MovimientoBucket? = null,
        val pendingChange: BucketChange? = null,
        /** The movement being sent to the server: it shows progress and nothing else can be done. */
        val reclassifyingId: String? = null,
        /** A message inside the sheet (the move failed but the sheet stays open to try again). */
        val sheetNotice: String? = null,
        /** A message on the screen (the list is out of date, the movement is gone). */
        val notice: String? = null,
        /** What TalkBack announces after a successful move: «Movida a Gustos · Ropa». */
        val announcement: String? = null,
        /** The category picked in the sheet: highlighted, and sent only on «Guardar». */
        val selection: CategoriaCatalogo? = null,
        /** Set after picking a category the API suggests a pattern for; `null` hides the checkbox. */
        val suggestion: SimilarSuggestion? = null,
        /** The «Aplicar a “…”» checkbox; off by default. */
        val applyToSimilar: Boolean = false,
        /** Asking the API for similar movements: the sheet waits, nothing else can be chosen. */
        val isCheckingSimilar: Boolean = false,
        val isCreatingCategory: Boolean = false,
        val categoryFormErrors: CategoryFormErrors = CategoryFormErrors(),
        /** Grows by one with every category created: the form closes when it changes. */
        val createdCategoryCount: Int = 0,
    ) {
        /** The next older month that has data (the list is most recent first), if any. */
        val anterior: Periodo? get() = neighbour(offset = 1)

        /** The next newer month that has data, if any. */
        val siguiente: Periodo? get() = neighbour(offset = -1)

        /** Whether «Guardar» can be tapped: a category is picked and nothing else is going on. */
        val canSave: Boolean
            get() = selection != null && sheetMovement != null && reclassifyingId == null && pendingChange == null && !isCheckingSimilar

        /** The sheet is sending or asking: nothing can be chosen meanwhile. */
        val isSheetBusy: Boolean get() = reclassifyingId != null || isCheckingSimilar

        fun currentCategoryId(movement: MovimientoBucket): String? {
            val detalle = (content as? Content.Loaded)?.detalle ?: return null
            return detalle.grupos.firstOrNull { group -> group.transacciones.any { it.id == movement.id } }?.categoriaId
        }

        private fun neighbour(offset: Int): Periodo? {
            val index = periodos.indexOf(periodo)
            if (index < 0) return null
            return periodos.getOrNull(index + offset)
        }
    }

    private val _state = MutableStateFlow(State(periodo = periodo))
    val state: StateFlow<State> = _state

    /** Bumped on every detail request so a late answer for an older choice is dropped. */
    private var generation = 0
    private var needsLoad = true

    /** Bumped on every catalog read, so an answer for an older one is dropped. */
    private var catalogGeneration = 0

    // --- detail

    /** Runs [load] unless the screen already finished one: a load cancelled midway must run again. */
    suspend fun loadIfNeeded() {
        if (needsLoad) load()
    }

    suspend fun load() {
        _state.update { it.copy(content = Content.Loading) }
        coroutineScope {
            val months = async { fetchPeriodos() }
            fetch(_state.value.periodo)
            months.await()?.let { list -> _state.update { it.copy(periodos = list) } }
        }
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() {
        _state.update { it.copy(content = Content.Loading) }
        fetch(_state.value.periodo)
        if (_state.value.periodos.isEmpty()) fetchPeriodos()?.let { list -> _state.update { it.copy(periodos = list) } }
    }

    /** Pull to refresh: repeats the query without blanking the list, and keeps it if it fails. */
    suspend fun refresh() {
        if (_state.value.content !is Content.Loaded) return retry()
        _state.update { it.copy(isRefreshing = true) }
        try {
            when (fetch(_state.value.periodo, keepContentOnFailure = true)) {
                true -> _state.update { it.copy(notice = null) }
                false -> _state.update { it.copy(notice = DetalleBucketMessages.REFRESH_FAILED) }
                null -> Unit
            }
        } finally {
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    suspend fun select(periodo: Periodo) {
        _state.update { it.copy(content = Content.Loading, notice = null) }
        fetch(periodo)
    }

    /**
     * Any answer that is still current marks the screen as loaded; a cancelled call does not (it is
     * rethrown), so the next appearance runs again. `true`: the detail is fresh. `false`: the
     * request failed. `null`: a newer request took over, or the session expired.
     */
    private suspend fun fetch(periodo: Periodo, keepContentOnFailure: Boolean = false): Boolean? {
        _state.update { it.copy(periodo = periodo) }
        generation += 1
        val mine = generation
        return try {
            val detalle = api.bucketDetalle(bucket, periodo)
            if (mine != generation) return null
            needsLoad = false
            _state.update { it.copy(content = Content.Loaded(detalle)) }
            true
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (mine != generation) return null
            val failure = failure(error) ?: return null
            needsLoad = false
            if (!keepContentOnFailure) _state.update { it.copy(content = Content.Failed(failure)) }
            false
        }
    }

    private suspend fun fetchPeriodos(): List<Periodo>? = try {
        api.periodos()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    /** Null means "show nothing": the session expired and the root is already switching to sign-in. */
    private fun failure(error: Exception): Failure? = when (error) {
        is SessionExpiredException -> null
        is IOException -> Failure.Connection
        else -> Failure.Server
    }

    // --- reclassification

    /** Opens the sheet for a movement; the catalog loads the first time only. */
    suspend fun beginReclassify(movement: MovimientoBucket) {
        if (_state.value.reclassifyingId != null) return
        _state.update {
            it.withoutSelection().copy(sheetMovement = movement, sheetNotice = null, announcement = null, notice = null)
        }
        if (_state.value.catalog == CatalogState.Idle) loadCatalog()
    }

    fun dismissSheet() {
        if (_state.value.reclassifyingId != null) return
        _state.update { it.withoutSelection().copy(sheetMovement = null, pendingChange = null, sheetNotice = null) }
    }

    /** "Reintentar" inside the sheet after the catalog failed. */
    suspend fun retryCatalog() {
        if (_state.value.catalog == CatalogState.Failed) loadCatalog()
    }

    private suspend fun loadCatalog() {
        catalogGeneration += 1
        val mine = catalogGeneration
        _state.update { it.copy(catalog = CatalogState.Loading) }
        val next = try {
            CatalogState.Loaded(api.categorias())
        } catch (cancelled: CancellationException) {
            if (mine == catalogGeneration) _state.update { it.copy(catalog = CatalogState.Idle) }
            throw cancelled
        } catch (_: Exception) {
            // A rejected session is already being handled; either way the sheet offers a retry.
            CatalogState.Failed
        }
        if (mine == catalogGeneration) _state.update { it.copy(catalog = next) }
    }

    /**
     * The person picked a category in the sheet: it is only selected, nothing is sent until
     * «Guardar». The API is asked for a suggested pattern (CLA-03) for the screen's month so the
     * sheet can offer «Aplicar a “…”»; a failed lookup only hides the checkbox. Picking the category
     * the movement already has leaves nothing to save.
     */
    suspend fun choose(categoryId: String) {
        val current = _state.value
        if (current.reclassifyingId != null || current.pendingChange != null || current.isCheckingSimilar) return
        val movement = current.sheetMovement ?: return
        val category = (current.catalog as? CatalogState.Loaded)?.catalog?.categoria(categoryId) ?: return
        _state.update { it.withoutSelection() }
        if (category.id == current.currentCategoryId(movement)) return
        _state.update { it.copy(selection = category, isCheckingSimilar = true) }
        val parecidos = try {
            api.parecidos(movement.id, category.id, current.periodo)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isCheckingSimilar = false) }
            throw cancelled
        } catch (_: Exception) {
            null
        }
        _state.update { state ->
            // The sheet was closed (or opened for another movement) meanwhile.
            val stillPicked = state.sheetMovement == movement && state.selection == category
            val suggestion = parecidos?.takeIf { stillPicked && it.patron != null }?.let { SimilarSuggestion(movement, category, it, current.periodo) }
            state.copy(isCheckingSimilar = false, suggestion = suggestion ?: state.suggestion)
        }
    }

    fun setApplyToSimilar(on: Boolean) = _state.update { it.copy(applyToSimilar = on) }

    /** «Guardar»: the picked category, applied to the similar ones when marked. Another bucket asks first. */
    suspend fun save() {
        val current = _state.value
        if (!current.canSave) return
        val movement = current.sheetMovement ?: return
        val category = current.selection ?: return
        // Only the month `parecidos` answered for, and only when the checkbox is on.
        val aplicar = current.suggestion?.takeIf { current.applyToSimilar }?.periodo
        if (category.bucket != bucket) {
            _state.update { it.copy(pendingChange = BucketChange(movement, category, aplicar)) }
        } else {
            move(movement, category, aplicar)
        }
    }

    suspend fun confirmBucketChange() {
        val current = _state.value
        if (current.reclassifyingId != null) return
        val change = current.pendingChange ?: return
        _state.update { it.copy(pendingChange = null) }
        move(change.movement, change.category, change.aplicarAParecidos)
    }

    /** «Cancelar»: nothing is sent; the sheet stays open with the selection and the checkbox. */
    fun cancelBucketChange() = _state.update { it.copy(pendingChange = null) }

    private suspend fun move(movement: MovimientoBucket, category: CategoriaCatalogo, aplicarAParecidos: Periodo?) {
        _state.update { it.copy(reclassifyingId = movement.id, sheetNotice = null) }
        val result = try {
            api.reclasificar(movement.id, category.id, aplicarAParecidos)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(reclassifyingId = null) }
            throw cancelled
        } catch (error: Exception) {
            _state.update { it.copy(reclassifyingId = null) }
            handleMoveFailure(error)
            return
        }
        _state.update {
            it.withoutSelection().copy(
                reclassifyingId = null,
                sheetMovement = null,
                announcement = DetalleBucketMessages.movedAnnouncement(result),
            )
        }
        onReclassified()
        // The movement may have changed group or left this bucket: ask again.
        if (fetch(_state.value.periodo, keepContentOnFailure = true) == false) {
            _state.update { it.copy(notice = DetalleBucketMessages.RELOAD_AFTER_MOVE_FAILED) }
        }
    }

    private suspend fun handleMoveFailure(error: Exception) {
        when (error) {
            is ReclasificarException.CategoryNotFound -> {
                _state.update { it.withoutSelection().copy(sheetNotice = DetalleBucketMessages.CATEGORY_GONE) }
                loadCatalog()
            }
            is ReclasificarException.MovementNotFound -> {
                _state.update { it.withoutSelection().copy(sheetMovement = null, notice = DetalleBucketMessages.MOVEMENT_GONE) }
                fetch(_state.value.periodo, keepContentOnFailure = true)
            }
            is SessionExpiredException -> Unit
            is IOException -> _state.update { it.copy(sheetNotice = DetalleBucketMessages.MOVE_FAILED_CONNECTION) }
            else -> _state.update { it.copy(sheetNotice = DetalleBucketMessages.MOVE_FAILED) }
        }
    }

    private fun State.withoutSelection() = copy(selection = null, suggestion = null, applyToSimilar = false)

    // --- create a category from the sheet

    fun resetCategoryForm() = _state.update { it.copy(categoryFormErrors = CategoryFormErrors()) }

    /**
     * «Crear» in the form: on success the category joins the catalog, the form closes and the new
     * category is picked, waiting for «Guardar» like any other. Goes through the same
     * `crearCategoria` call and form messages as Subir cartola.
     */
    suspend fun createCategory(nueva: NuevaCategoria) {
        val current = _state.value
        val movement = current.sheetMovement ?: return
        val categories = (current.catalog as? CatalogState.Loaded)?.catalog ?: return
        if (current.isCreatingCategory || current.reclassifyingId != null) return
        _state.update { it.copy(isCreatingCategory = true, categoryFormErrors = CategoryFormErrors()) }
        val category = try {
            api.crearCategoria(nueva)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isCreatingCategory = false) }
            throw cancelled
        } catch (error: Exception) {
            _state.update {
                if (error is SessionExpiredException) {
                    it.copy(isCreatingCategory = false)
                } else {
                    it.copy(isCreatingCategory = false, categoryFormErrors = SubirCartolaMessages.formErrors(error))
                }
            }
            return
        }
        _state.update {
            it.copy(
                isCreatingCategory = false,
                // The server confirmed it: usable at once.
                catalog = CatalogState.Loaded(CatalogoCategorias(categories.categorias + category)),
                createdCategoryCount = it.createdCategoryCount + 1,
            )
        }
        if (_state.value.sheetMovement == movement) choose(category.id)
    }
}
