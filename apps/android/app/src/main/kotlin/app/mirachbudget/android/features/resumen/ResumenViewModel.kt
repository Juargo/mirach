package app.mirachbudget.android.features.resumen

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ResumenMes
import app.mirachbudget.android.core.networking.SessionExpiredException
import java.io.IOException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/** State of "Resumen del mes": one month at a time, plus the list of months for the arrows. */
class ResumenViewModel(private val api: MirachApi) : ViewModel() {
    enum class Failure {
        /** No answer from the server (offline, timeout). */
        Connection,

        /** The server answered with something the app cannot use (non-2xx, unexpected body). */
        Server,
    }

    sealed interface State {
        data object Loading : State
        data class Loaded(val mes: ResumenMes) : State
        data class Failed(val failure: Failure) : State
    }

    private val _state = MutableStateFlow<State>(State.Loading)
    val state: StateFlow<State> = _state

    private val _periodos = MutableStateFlow<List<Periodo>>(emptyList())

    /** Months with movements, most recent first. Empty until loaded or if that call failed: the summary does not depend on it. */
    val periodos: StateFlow<List<Periodo>> = _periodos

    private val _refreshing = MutableStateFlow(false)

    /** True while a pull to refresh runs; the month on screen stays visible. */
    val refreshing: StateFlow<Boolean> = _refreshing

    /** The month asked for; null lets the API choose the latest one (first load). */
    private var requested: Periodo? = null

    /** Bumped on every request so a late answer for an older choice is dropped. */
    private var generation = 0

    /** The next older month that has data (the list is most recent first), if any. */
    val anterior: Periodo? get() = neighbour(offset = 1)

    /** The next newer month that has data, if any. */
    val siguiente: Periodo? get() = neighbour(offset = -1)

    /**
     * Called whenever the screen is composed: finishes a load that was interrupted (cancelled with
     * the screen) and does nothing once a month is on screen, so recomposing never repeats a query.
     */
    suspend fun start() {
        if (_state.value != State.Loading) return
        if (requested == null) load() else retry()
    }

    /** First load: the API picks the month; the month list loads alongside. */
    suspend fun load() {
        requested = null
        _state.value = State.Loading
        coroutineScope {
            val months = async { fetchPeriodos() }
            fetch(null)
            months.await()?.let { _periodos.value = it }
        }
    }

    /** "Reintentar": the same query that failed, again. */
    suspend fun retry() {
        _state.value = State.Loading
        fetch(requested)
        if (_periodos.value.isEmpty()) fetchPeriodos()?.let { _periodos.value = it }
    }

    /** Pull to refresh: repeats the query for the month on screen without blanking it, keeping the old month if it fails. */
    suspend fun refresh() {
        val current = (_state.value as? State.Loaded)?.mes ?: return retry()
        _refreshing.value = true
        try {
            fetch(current.periodo, keepContentOnFailure = true)
            fetchPeriodos()?.let { _periodos.value = it }
        } finally {
            _refreshing.value = false
        }
    }

    suspend fun select(periodo: Periodo) {
        _state.value = State.Loading
        fetch(periodo)
    }

    private fun neighbour(offset: Int): Periodo? {
        val current = (_state.value as? State.Loaded)?.mes ?: return null
        val list = _periodos.value
        val index = list.indexOf(current.periodo)
        if (index < 0) return null
        return list.getOrNull(index + offset)
    }

    private suspend fun fetch(periodo: Periodo?, keepContentOnFailure: Boolean = false) {
        requested = periodo
        generation += 1
        val mine = generation
        try {
            val mes = api.resumen(periodo)
            if (mine == generation) _state.value = State.Loaded(mes)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (mine != generation || keepContentOnFailure) return
            failure(error)?.let { _state.value = State.Failed(it) }
        }
    }

    private suspend fun fetchPeriodos(): List<Periodo>? = try {
        api.periodos()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
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
