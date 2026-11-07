package app.mirachbudget.android.features.categorias

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors
import java.io.IOException
import java.text.Collator
import java.util.Locale
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of "Categorías": the user's catalog grouped by bucket, and creating a category (port of iOS
 * `CategoriasViewModel`). [onChange] runs once per successful write: Resumen, bucket detail and the
 * review catalog are stale.
 */
class CategoriasViewModel(
    private val api: MirachApi,
    private val onChange: () -> Unit = {},
) : ViewModel() {
    enum class Failure {
        /** No answer from the server (offline, timeout). */
        Connection,

        /** The server answered with something the app cannot use (non-2xx, unexpected body). */
        Server,
    }

    sealed interface Content {
        data object Loading : Content

        /** An empty catalog is a loaded one: the three groups say «Sin categorías». */
        data class Loaded(val catalog: CatalogoCategorias) : Content
        data class Failed(val failure: Failure) : Content
    }

    data class State(
        val content: Content = Content.Loading,
        /** Set when a refresh failed and the list on screen is the previous answer. */
        val refreshNotice: String? = null,
        /** True while a pull to refresh runs; the list stays on screen. */
        val isRefreshing: Boolean = false,
        val isCreating: Boolean = false,
        val formErrors: CategoryFormErrors = CategoryFormErrors(),
        /** Grows by one with every category created: the form closes when it changes. */
        val createdCount: Int = 0,
        /** The result of the last write: «Categoría «Mascotas» creada». */
        val announcement: String? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Bumped on every request (and write) so a late answer for an older one is dropped. */
    private var generation = 0
    private var needsLoad = true

    /** Runs [load] unless the screen already finished one; a load cancelled midway runs again. */
    suspend fun loadIfNeeded() {
        if (needsLoad) load()
    }

    suspend fun load() {
        _state.update { it.copy(content = Content.Loading, refreshNotice = null, announcement = null) }
        fetch()
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() = load()

    /** Pull to refresh: repeats the query without blanking the list, and keeps it if it fails. */
    suspend fun refresh() {
        if (_state.value.content !is Content.Loaded) return retry()
        // The person asked for the list again: what was announced about an earlier write is stale.
        _state.update { it.copy(isRefreshing = true, announcement = null) }
        try {
            fetch(failureNotice = CategoriasMessages.REFRESH_FAILED)
        } finally {
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    /**
     * The catalog changed (here, in a category's detail or elsewhere): read it again, keeping the
     * announcement. A failure says the change did apply, so nobody repeats it.
     */
    suspend fun catalogDidChange() {
        if (_state.value.content !is Content.Loaded) return
        fetch(failureNotice = CategoriasMessages.CHANGE_APPLIED_REFRESH_FAILED)
    }

    // --- creating

    /** Called when the form opens: clears the errors of a previous attempt. */
    fun resetForm() = _state.update { it.copy(formErrors = CategoryFormErrors()) }

    fun dismissAnnouncement() = _state.update { it.copy(announcement = null) }

    /** The detail deleted a category and the person is back on the list. */
    fun announceDeletion(nombre: String) = _state.update { it.copy(announcement = CategoriasMessages.deleted(nombre)) }

    /**
     * «Crear» in the form. On success the category joins its group at once, the form closes
     * ([State.createdCount] changes) and the other screens are told. On failure the form stays.
     */
    suspend fun create(nueva: NuevaCategoria) {
        val current = _state.value
        if (current.content !is Content.Loaded || current.isCreating) return
        _state.update { it.copy(isCreating = true, formErrors = CategoryFormErrors(), announcement = null) }
        val category = try {
            api.crearCategoria(nueva)
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(isCreating = false) }
            throw cancelled
        } catch (error: Exception) {
            // A 401 is handled by the single relay.
            val errors = if (error is SessionExpiredException) CategoryFormErrors() else SubirCartolaMessages.formErrors(error)
            _state.update { it.copy(isCreating = false, formErrors = errors) }
            return
        }
        // A read that started before the creation must not take the new category away.
        generation += 1
        _state.update { state ->
            val catalog = (state.content as? Content.Loaded)?.catalog ?: CatalogoCategorias(emptyList())
            state.copy(
                content = Content.Loaded(CatalogoCategorias(inserting(category, catalog.categorias))),
                isCreating = false,
                announcement = CategoriasMessages.created(category.nombre),
                createdCount = state.createdCount + 1,
            )
        }
        onChange()
    }

    // --- internals

    /**
     * Any answer that is still current marks the screen as loaded; a cancelled call does not (it is
     * rethrown), so the next appearance runs again. A newer request reports nothing. With a
     * [failureNotice] the list on screen stays and the notice says the read failed.
     */
    private suspend fun fetch(failureNotice: String? = null) {
        generation += 1
        val mine = generation
        try {
            val catalog = api.categorias()
            if (mine != generation) return
            needsLoad = false
            _state.update { it.copy(content = Content.Loaded(catalog), refreshNotice = null) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (mine != generation) return
            val failure = failure(error) ?: return
            needsLoad = false
            _state.update { if (failureNotice != null) it.copy(refreshNotice = failureNotice) else it.copy(content = Content.Failed(failure)) }
        }
    }

    private companion object {
        /** Case-insensitive and Spanish-aware, as iOS `localizedCaseInsensitiveCompare`. */
        val collator: Collator = Collator.getInstance(Locale.forLanguageTag("es")).apply { strength = Collator.SECONDARY }

        /**
         * The API orders by name and the app keeps that order; a created one is placed by the same
         * rule, before the first category of its bucket that sorts after it.
         */
        fun inserting(category: CategoriaCatalogo, list: List<CategoriaCatalogo>): List<CategoriaCatalogo> {
            val index = list.indexOfFirst { it.bucket == category.bucket && collator.compare(it.nombre, category.nombre) > 0 }
            return list.toMutableList().apply { add(if (index < 0) size else index, category) }
        }

        /** Null means "show nothing": the session expired and the root is already switching to sign-in. */
        fun failure(error: Exception): Failure? = when (error) {
            is SessionExpiredException -> null
            is IOException -> Failure.Connection
            else -> Failure.Server
        }
    }
}
