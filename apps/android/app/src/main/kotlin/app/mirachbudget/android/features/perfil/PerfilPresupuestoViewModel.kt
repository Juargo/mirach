package app.mirachbudget.android.features.perfil

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.PerfilPredefinido
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.perfil.PerfilViewModel.Failure
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of "Perfil de porcentajes": which of the four predefined cards is selected and whether
 * "Guardar" may send it. [onSaved] runs once per successful save: the caller closes the screen and
 * reloads Inicio.
 */
class PerfilPresupuestoViewModel(
    private val api: MirachApi,
    private val onSaved: () -> Unit = {},
) : ViewModel() {
    sealed interface LoadState {
        data object Loading : LoadState
        data object Loaded : LoadState
        data class Failed(val failure: Failure) : LoadState
    }

    sealed interface SaveState {
        data object Idle : SaveState
        data object Saving : SaveState
        data class Failed(val failure: Failure) : SaveState
    }

    data class State(
        val load: LoadState = LoadState.Loading,
        /** The profile the server has; `null` when it is a custom one. */
        val stored: PerfilPredefinido? = null,
        /** The card the person tapped; starts as [stored]. */
        val selected: PerfilPredefinido? = null,
        val save: SaveState = SaveState.Idle,
    ) {
        /** Only a different card, with nothing in flight. */
        val canSave: Boolean get() = load == LoadState.Loaded && selected != null && selected != stored && save != SaveState.Saving
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /** Opening the screen and "Reintentar". */
    suspend fun load() {
        _state.update { it.copy(load = LoadState.Loading) }
        try {
            val stored = api.perfilPresupuesto()
            _state.update { it.copy(load = LoadState.Loaded, stored = stored, selected = stored) }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            // An expired session (the relay signs out) has no message of its own: keep loading.
            failure(e)?.let { failure -> _state.update { it.copy(load = LoadState.Failed(failure)) } }
        }
    }

    /** Called when the screen is composed: loads once, and finishes a load that was cancelled with the screen. */
    suspend fun loadIfNeeded() {
        if (_state.value.load != LoadState.Loaded) load()
    }

    /** A tap on a card: local only, and locked while a save is out. */
    fun select(perfil: PerfilPredefinido) = _state.update {
        if (it.load != LoadState.Loaded || it.save == SaveState.Saving) it else it.copy(selected = perfil, save = SaveState.Idle)
    }

    /** "Guardar": sends only the selected id. A failure keeps the selection for another try. */
    suspend fun save() {
        val selected = _state.value.selected
        if (!_state.value.canSave || selected == null) return
        _state.update { it.copy(save = SaveState.Saving) }
        try {
            val stored = api.cambiarPerfilPresupuesto(selected)
            _state.update { it.copy(stored = stored, selected = stored, save = SaveState.Idle) }
            onSaved()
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(save = SaveState.Idle) }
            throw cancelled
        } catch (e: Exception) {
            _state.update { it.copy(save = failure(e)?.let(SaveState::Failed) ?: SaveState.Idle) }
        }
    }

    /** `null` for what needs no message here: an expired session, because the relay already signs out. */
    private fun failure(error: Exception): Failure? = when (error) {
        is SessionExpiredException -> null
        is IOException -> Failure.Connection
        else -> Failure.Server
    }
}
