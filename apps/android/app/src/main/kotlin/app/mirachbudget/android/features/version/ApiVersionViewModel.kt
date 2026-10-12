package app.mirachbudget.android.features.version

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.VersionApi
import app.mirachbudget.android.core.networking.VersionInfo
import java.net.SocketTimeoutException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.SerializationException

sealed interface ApiVersionState {
    data object Idle : ApiVersionState
    data object Loading : ApiVersionState
    data class Loaded(val info: VersionInfo) : ApiVersionState
    data class Failed(val message: String) : ApiVersionState
}

/** TEMPORARY: proves networking end to end, like the iOS first screen. */
class ApiVersionViewModel(private val api: VersionApi) : ViewModel() {
    private val _state = MutableStateFlow<ApiVersionState>(ApiVersionState.Idle)
    val state: StateFlow<ApiVersionState> = _state

    suspend fun load() {
        _state.value = ApiVersionState.Loading
        _state.value = try {
            ApiVersionState.Loaded(api.version())
        } catch (cancelled: CancellationException) {
            _state.value = ApiVersionState.Idle
            throw cancelled
        } catch (_: ApiException) {
            ApiVersionState.Failed(Message.SERVER_UNAVAILABLE)
        } catch (_: SerializationException) {
            ApiVersionState.Failed(Message.UNEXPECTED_FORMAT)
        } catch (_: SocketTimeoutException) {
            ApiVersionState.Failed(Message.TIMEOUT)
        } catch (_: Exception) {
            ApiVersionState.Failed(Message.NO_CONNECTION)
        }
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() = load()

    // Same copy as the iPhone app.
    private object Message {
        const val SERVER_UNAVAILABLE = "El servidor no está disponible en este momento. Intenta de nuevo en unos segundos."
        const val UNEXPECTED_FORMAT = "La respuesta del servidor no tiene el formato esperado."
        const val TIMEOUT = "El servidor tardó demasiado en responder. Puede estar despertando: inténtalo de nuevo."
        const val NO_CONNECTION = "No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo."
    }
}
