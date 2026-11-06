package app.mirachbudget.android.features.cartolassubidas

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.CartolaNotFoundException
import app.mirachbudget.android.core.networking.CartolaSubida
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.SessionExpiredException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of "Cartolas subidas": the user's imports, and deleting one at a time (port of iOS
 * `CartolasSubidasViewModel`). [onChange] runs after an import is deleted, so the Resumen reloads.
 */
class CartolasSubidasViewModel(
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

        /** An empty list is a loaded one: the screen offers to upload. */
        data class Loaded(val cartolas: List<CartolaSubida>) : Content
        data class Failed(val failure: Failure) : Content
    }

    /** What the last deletion left to say. */
    enum class Message(val text: String) {
        Deleted("Cartola eliminada"),
        AlreadyGone("Esa cartola ya no existía. Se quitó de la lista."),
        Failed("No se pudo eliminar la cartola. Intenta nuevamente."),
    }

    data class State(
        val content: Content = Content.Loading,
        /** Set when a refresh failed and the list on screen is the previous answer. */
        val refreshNotice: String? = null,
        /** True while a pull to refresh runs; the list stays on screen. */
        val isRefreshing: Boolean = false,
        /** The import waiting for the person's confirmation. */
        val pendingDeletion: CartolaSubida? = null,
        /** Imports whose deletion the server has not answered yet: their rows are disabled. */
        val deleting: Set<String> = emptySet(),
        val message: Message? = null,
    )

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Bumped on every request so a late answer for an older one is dropped. */
    private var generation = 0
    private var needsLoad = true

    /**
     * Runs [load] unless the screen already finished one: the screen calls it on every appearance,
     * and a load cancelled midway (the screen went away) must run again.
     */
    suspend fun loadIfNeeded() {
        if (needsLoad) load()
    }

    suspend fun load() {
        _state.update { it.copy(content = Content.Loading, refreshNotice = null) }
        fetch()
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() = load()

    /** Pull to refresh: repeats the query without blanking the list, and keeps it if it fails. */
    suspend fun refresh() {
        if (_state.value.content !is Content.Loaded) return retry()
        _state.update { it.copy(isRefreshing = true) }
        try {
            fetch(keepContentOnFailure = true)
        } finally {
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    // --- deleting

    fun requestDeletion(cartola: CartolaSubida) {
        if (cartola.id in _state.value.deleting) return
        _state.update { it.copy(pendingDeletion = cartola) }
    }

    fun cancelDeletion() = _state.update { it.copy(pendingDeletion = null) }

    fun dismissMessage() = _state.update { it.copy(message = null) }

    /** Takes the import explicitly: the dialog clears [State.pendingDeletion] as it closes. */
    suspend fun confirmDeletion(cartola: CartolaSubida) {
        _state.update { it.copy(pendingDeletion = null) }
        if (cartola.id in _state.value.deleting) return
        _state.update { it.copy(deleting = it.deleting + cartola.id, message = null) }
        try {
            api.eliminarCartola(cartola.id)
            removed(cartola, Message.Deleted)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: CartolaNotFoundException) {
            removed(cartola, Message.AlreadyGone)
        } catch (error: Exception) {
            // A 401 is handled by the single relay.
            if (failure(error) != null) _state.update { it.copy(message = Message.Failed) }
        } finally {
            _state.update { it.copy(deleting = it.deleting - cartola.id) }
        }
    }

    /**
     * The import is gone: drop its row, let the other screens know, and read the list again (that
     * request supersedes any made before the deletion, which would bring the row back).
     */
    private suspend fun removed(cartola: CartolaSubida, message: Message) {
        _state.update { state ->
            val content = state.content
            val remaining = if (content is Content.Loaded) Content.Loaded(content.cartolas.filter { it.id != cartola.id }) else content
            state.copy(content = remaining, message = message)
        }
        onChange()
        fetch(keepContentOnFailure = true)
    }

    /**
     * Any answer that is still current marks the screen as loaded; a cancelled call does not (it is
     * rethrown), so the next appearance runs again. A newer request reports nothing.
     */
    private suspend fun fetch(keepContentOnFailure: Boolean = false) {
        generation += 1
        val mine = generation
        try {
            val list = api.cartolasSubidas()
            if (mine != generation) return
            needsLoad = false
            _state.update { it.copy(content = Content.Loaded(list), refreshNotice = null) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (mine != generation) return
            val failure = failure(error) ?: return
            needsLoad = false
            _state.update {
                if (keepContentOnFailure) it.copy(refreshNotice = CartolasSubidasMessages.REFRESH_FAILED) else it.copy(content = Content.Failed(failure))
            }
        }
    }

    /**
     * Null means "show nothing": the session expired, in which case the root is already switching
     * to sign-in (cancellation never gets here: it is rethrown).
     */
    private fun failure(error: Exception): Failure? = when (error) {
        is SessionExpiredException -> null
        is IOException -> Failure.Connection
        else -> Failure.Server
    }
}
