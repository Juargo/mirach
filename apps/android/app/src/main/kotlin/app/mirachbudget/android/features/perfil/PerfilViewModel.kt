package app.mirachbudget.android.features.perfil

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.ConfirmationRejectedException
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.InvalidNameException
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.session.SessionController
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** State of "Perfil": the name to edit, the email to show, and the two session actions. */
class PerfilViewModel(
    private val api: MirachApi,
    private val session: SessionController,
) : ViewModel() {
    enum class Failure {
        /** No answer from the server (offline, timeout). */
        Connection,

        /** The server answered with something the app cannot use. */
        Server,
    }

    sealed interface LoadState {
        data object Loading : LoadState
        data object Loaded : LoadState
        data class Failed(val failure: Failure) : LoadState
    }

    enum class SaveFailure { InvalidName, Connection, Server }

    sealed interface SaveState {
        data object Idle : SaveState
        data object Saving : SaveState
        data object Saved : SaveState
        data class Failed(val failure: SaveFailure) : SaveState
    }

    enum class DeleteFailure {
        /** The server did not take the word (nothing was deleted). */
        ConfirmationRejected,

        /** Network or server trouble: nothing is assumed deleted. */
        Retry,
    }

    sealed interface DeleteState {
        data object Idle : DeleteState
        data object Deleting : DeleteState
        data class Failed(val failure: DeleteFailure) : DeleteState
    }

    data class State(
        val load: LoadState = LoadState.Loading,
        val email: String? = null,
        /** The text field; the person edits it freely. */
        val nombre: String = "",
        /** The name as the server has it, to know whether there is anything to save. */
        val savedNombre: String = "",
        val save: SaveState = SaveState.Idle,
        val isSigningOut: Boolean = false,
        val deleteConfirmation: String = "",
        val delete: DeleteState = DeleteState.Idle,
    ) {
        val hasNameChanges: Boolean get() = normalized(nombre) != normalized(savedNombre)

        val canSave: Boolean get() = load == LoadState.Loaded && hasNameChanges && save != SaveState.Saving && !isBusyWithSession

        val canDelete: Boolean
            get() = deleteConfirmation == CONFIRMATION_WORD && delete != DeleteState.Deleting && !isSigningOut

        /** Signing out or deleting: the rest of the screen is locked. */
        val isBusyWithSession: Boolean get() = isSigningOut || delete == DeleteState.Deleting
    }

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    /**
     * An attempt ended without an answer (timeout, 5xx): the server may have deleted everything
     * anyway. Kept until a deletion succeeds, even if the dialog is closed and reopened.
     */
    private var deletionMayHaveHappened = false

    fun onNombreChange(value: String) = _state.update {
        // Typing after a save drops the "Perfil guardado" confirmation; a pending failure stays until the next save.
        it.copy(nombre = value, save = if (it.save == SaveState.Saved) SaveState.Idle else it.save)
    }

    fun onDeleteConfirmationChange(value: String) = _state.update { it.copy(deleteConfirmation = value) }

    // --- load

    /**
     * Opening the screen, "Reintentar", and every time the tab comes back. Once loaded it refreshes
     * quietly: no loading flash, a failure keeps what is on screen, an unsaved draft is never
     * overwritten, and nothing runs while a save is in flight.
     */
    suspend fun load() {
        if (_state.value.save == SaveState.Saving) return
        val isRefresh = _state.value.load == LoadState.Loaded
        if (!isRefresh) _state.update { it.copy(load = LoadState.Loading) }
        try {
            val user = api.currentUser()
            // A save may have started while this request was out: its answer wins.
            if (_state.value.save == SaveState.Saving) return
            _state.update {
                if (isRefresh && it.hasNameChanges) {
                    it.copy(savedNombre = user.nombre, email = user.email)
                } else {
                    it.apply(user).copy(load = LoadState.Loaded)
                }
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (e: Exception) {
            val failure = failure(e)
            if (!isRefresh && failure != null) _state.update { it.copy(load = LoadState.Failed(failure)) }
        }
    }

    // --- name

    suspend fun save() {
        if (!_state.value.canSave) return
        _state.update { it.copy(save = SaveState.Saving) }
        try {
            // The answer replaces the local copy, including the name as the server normalised it.
            val user = api.updateNombre(normalized(_state.value.nombre))
            _state.update { it.apply(user).copy(save = SaveState.Saved) }
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(save = SaveState.Idle) }
            throw cancelled
        } catch (e: Exception) {
            // What was typed stays in the field for another try.
            val next = when {
                e is InvalidNameException -> SaveState.Failed(SaveFailure.InvalidName)
                // A 401 (the relay signs out) has no message of its own.
                else -> when (failure(e)) {
                    Failure.Connection -> SaveState.Failed(SaveFailure.Connection)
                    Failure.Server -> SaveState.Failed(SaveFailure.Server)
                    null -> SaveState.Idle
                }
            }
            _state.update { it.copy(save = next) }
        }
    }

    // --- session

    suspend fun signOut() {
        if (_state.value.isSigningOut) return
        _state.update { it.copy(isSigningOut = true) }
        session.signOutRemotely()
    }

    /** Only a typed `ELIMINAR` reaches the API; a second tap while one request is out does nothing. */
    suspend fun deleteAccount() {
        val confirmation = _state.value.deleteConfirmation
        if (!_state.value.canDelete) return
        _state.update { it.copy(delete = DeleteState.Deleting) }
        try {
            api.deleteAccount(confirmation)
            session.accountDeleted()
        } catch (cancelled: CancellationException) {
            // Cancelled, not answered: claims nothing about the account.
            _state.update { it.copy(delete = DeleteState.Idle) }
            throw cancelled
        } catch (e: ConfirmationRejectedException) {
            _state.update { it.copy(delete = DeleteState.Failed(DeleteFailure.ConfirmationRejected)) }
        } catch (e: Exception) {
            when (failure(e)) {
                null -> if (e is SessionExpiredException && deletionMayHaveHappened) {
                    // After a successful deletion the session no longer exists, so this 401 is the
                    // proof that the lost attempt did go through. Say so instead of signing out silently.
                    session.accountDeleted()
                } else {
                    // Any other 401 is left to the single relay and claims nothing about the account.
                    _state.update { it.copy(delete = DeleteState.Idle) }
                }
                Failure.Connection, Failure.Server -> {
                    deletionMayHaveHappened = true
                    _state.update { it.copy(delete = DeleteState.Failed(DeleteFailure.Retry)) }
                }
            }
        }
    }

    /** The confirmation dialog was dismissed: forget the word and the error. */
    fun resetDeletion() {
        if (_state.value.delete == DeleteState.Deleting) return
        _state.update { it.copy(deleteConfirmation = "", delete = DeleteState.Idle) }
    }

    // --- internals

    private fun State.apply(user: CurrentUser) = copy(nombre = user.nombre, savedNombre = user.nombre, email = user.email)

    /** `null` for what needs no message here: an expired session, because the relay already signs out. */
    private fun failure(error: Exception): Failure? = when (error) {
        is SessionExpiredException -> null
        is IOException -> Failure.Connection
        else -> Failure.Server
    }

    companion object {
        /** The word the person types to confirm; the same text goes to the API. */
        const val CONFIRMATION_WORD = "ELIMINAR"

        /**
         * One line: surrounding whitespace dropped, any run of spaces or newlines inside it
         * collapsed to one space. What the person typed and what is sent differ only by this.
         */
        fun normalized(name: String): String =
            name.split(Regex("[\\s\\u00A0]+")).filter(String::isNotEmpty).joinToString(" ")
    }
}
