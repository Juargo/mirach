package app.mirachbudget.android.features.movimientos

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.ReclasificarException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.features.detallebucket.DetalleBucketMessages
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Failure
import java.io.IOException
import java.time.LocalDate
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * State of the «Movimientos» tab: one month and the three buckets side by side, each with its own
 * [DetalleBucketViewModel] (a [pane]); only one of them is open at a time ([State.openBucket]), the other
 * two show their header. The panes hold the detail of their bucket and the whole
 * reclassify sheet flow, so a move here goes through exactly the code the bucket detail uses; this
 * class only resolves the month once, asks for the three buckets together, and keeps the notice with
 * its «Deshacer». Every move or undo bumps [State.reclassifiedCount]: Resumen's figures changed, and the
 * root, which owns the other tabs, reloads them when it sees the count grow.
 */
class MovimientosViewModel(
    private val api: MirachApi,
    private val today: () -> Periodo = ::currentMonth,
) : ViewModel() {
    /** What the three panes say together. */
    sealed interface Content {
        data object Loading : Content

        /** The three buckets of the month, in pane order. */
        data class Loaded(val detalles: List<BucketDetalle>) : Content

        /** Any of the requests failed (or the months could not be resolved). */
        data class Failed(val failure: Failure) : Content
    }

    /** Sends [movementId] back to [categoriaId], the category it had before the move. */
    data class Undo(val movementId: String, val categoriaId: String)

    /** «Movido a …», with «Deshacer» when [undo] is set. */
    data class MoveNotice(val text: String, val undo: Undo?)

    data class State(
        /** The month on screen (or being loaded). */
        val periodo: Periodo,
        /** Months with movements, most recent first; empty until loaded or if that call failed. */
        val periodos: List<Periodo> = emptyList(),
        val isRefreshing: Boolean = false,
        /** Set when the months could not be resolved: the panes never got a request. */
        val failure: Failure? = null,
        val notice: MoveNotice? = null,
        /** An error message on the screen: a failed refresh, reload or undo. The data stays. */
        val warning: String? = null,
        /** Grows by one with every successful move or undo. */
        val reclassifiedCount: Int = 0,
        /** The one bucket whose movements are showing. It stays through a month change, a move and a reload. */
        val openBucket: Bucket = Bucket.entries.first(),
    ) {
        /** The next older month that has data (the list is most recent first), if any. */
        val anterior: Periodo? get() = neighbour(offset = 1)

        /** The next newer month that has data, if any. */
        val siguiente: Periodo? get() = neighbour(offset = -1)

        private fun neighbour(offset: Int): Periodo? {
            val index = periodos.indexOf(periodo)
            if (index < 0) return null
            return periodos.getOrNull(index + offset)
        }
    }

    private val _state = MutableStateFlow(State(periodo = today()))
    val state: StateFlow<State> = _state

    /** Necesidades, Gustos and Ahorro, the order of the screen. */
    val panes: List<DetalleBucketViewModel> = Bucket.entries.map { bucket ->
        DetalleBucketViewModel(api, bucket, _state.value.periodo, onReclassified = ::didReclassify, onMoved = ::moved)
    }

    fun pane(bucket: Bucket): DetalleBucketViewModel = panes.first { it.bucket == bucket }

    /** Shows the movements of [bucket] and closes the bucket that was open. */
    fun open(bucket: Bucket) = _state.update { it.copy(openBucket = bucket) }

    /** The combined state of the panes: any failure wins, then any pane still loading. */
    val content: Content get() = combine(_state.value.failure, panes.map { it.state.value.content })

    private var needsLoad = true

    /** Set once a month was resolved, so a reload keeps the month the person chose. */
    private var resolved = false

    /** Runs [load] unless the screen already finished one: a load cancelled midway must run again. */
    suspend fun loadIfNeeded() {
        if (needsLoad) load()
    }

    /** Resolves the month once (the most recent with data), then asks for the three buckets of it together. */
    suspend fun load() {
        _state.update { it.copy(failure = null, notice = null, warning = null) }
        val months = try {
            api.periodos()
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            needsLoad = false
            _state.update { it.copy(failure = DetalleBucketViewModel.failure(error)) }
            return
        }
        val periodo = chosenMonth(months)
        resolved = true
        _state.update { it.copy(periodos = months, periodo = periodo) }
        loadPanes(periodo)
        needsLoad = false
    }

    /** «Reintentar»: the same query that failed, again. */
    suspend fun retry() {
        if (!resolved) return load()
        _state.update { it.copy(failure = null, notice = null, warning = null) }
        loadPanes(_state.value.periodo)
        if (_state.value.periodos.isEmpty()) fetchPeriodos()?.let { list -> _state.update { it.copy(periodos = list) } }
    }

    suspend fun select(periodo: Periodo) {
        _state.update { it.copy(periodo = periodo, notice = null, warning = null) }
        loadPanes(periodo)
    }

    /** Pull to refresh: repeats the queries without blanking the panes, and keeps them if one fails. */
    suspend fun refresh() {
        if (content !is Content.Loaded) return retry()
        _state.update { it.copy(isRefreshing = true) }
        try {
            fetchPeriodos()?.let { list -> _state.update { it.copy(periodos = list) } }
            val warning = if (reloadPanes()) null else DetalleBucketMessages.REFRESH_FAILED
            _state.update { it.copy(warning = warning) }
        } finally {
            _state.update { it.copy(isRefreshing = false) }
        }
    }

    /** An import, a deleted statement or a saved profile changed the data: reload, unless the tab was never opened. */
    suspend fun reload() {
        if (needsLoad) return
        refresh()
    }

    /** The catalog changed: the panes read it again the next time a sheet opens, and the tab reloads. */
    suspend fun catalogDidChange() {
        panes.forEach { it.catalogDidChange() }
        reload()
    }

    /** «Deshacer»: sends the movement back to the category it came from. */
    suspend fun undo() {
        val undo = _state.value.notice?.undo ?: return
        try {
            api.reclasificar(undo.movementId, undo.categoriaId)
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (error: Exception) {
            if (error is SessionExpiredException) return
            _state.update { it.copy(notice = null, warning = undoFailure(error)) }
            return
        }
        _state.update { it.copy(notice = null, warning = null) }
        didReclassify()
        reloadAfterMove()
    }

    private fun didReclassify() = _state.update { it.copy(reclassifiedCount = it.reclassifiedCount + 1) }

    private fun undoFailure(error: Exception): String = when (error) {
        is ReclasificarException.MovementNotFound -> DetalleBucketMessages.MOVEMENT_GONE
        is IOException -> MovimientosMessages.UNDO_FAILED_CONNECTION
        else -> MovimientosMessages.UNDO_FAILED
    }

    /** A pane saved a move: say so (with «Deshacer» when it can be reverted) and reload the three buckets. */
    private suspend fun moved(move: DetalleBucketViewModel.Move) {
        // The API cannot restore «Sin categoría», nor revert a pattern and the other movements it moved.
        val undo = move.previousCategoryId?.takeIf { move.aplicarAParecidos == null }?.let { Undo(move.movement.id, it) }
        val text = MovimientosMessages.moved(move.result.bucket, move.result.categoriaNombre)
        _state.update { it.copy(notice = MoveNotice(text, undo), warning = null) }
        reloadAfterMove()
    }

    private suspend fun reloadAfterMove() {
        if (!reloadPanes()) _state.update { it.copy(warning = DetalleBucketMessages.RELOAD_AFTER_MOVE_FAILED) }
    }

    /** The three buckets again for the month on screen. `true` when none of the requests failed. */
    private suspend fun reloadPanes(): Boolean = coroutineScope {
        panes.map { async { it.reloadKeepingContent() } }.awaitAll().all { it }
    }

    private suspend fun loadPanes(periodo: Periodo) = coroutineScope {
        panes.map { async { it.select(periodo) } }.awaitAll()
    }

    /** The month the person was on if it still has data, else the most recent one; the current month when there is none. */
    private fun chosenMonth(months: List<Periodo>): Periodo {
        val current = _state.value.periodo
        if (resolved && (months.isEmpty() || current in months)) return current
        return months.firstOrNull() ?: today()
    }

    private suspend fun fetchPeriodos(): List<Periodo>? = try {
        api.periodos()
    } catch (cancelled: CancellationException) {
        throw cancelled
    } catch (_: Exception) {
        null
    }

    private fun combine(failure: Failure?, contents: List<DetalleBucketViewModel.Content>): Content {
        failure?.let { return Content.Failed(it) }
        contents.firstNotNullOfOrNull { (it as? DetalleBucketViewModel.Content.Failed)?.failure }?.let { return Content.Failed(it) }
        val loaded = contents.filterIsInstance<DetalleBucketViewModel.Content.Loaded>()
        if (loaded.size < contents.size) return Content.Loading
        return Content.Loaded(loaded.map { it.detalle })
    }
}

private fun currentMonth(): Periodo = LocalDate.now().let { Periodo(it.year, it.monthValue) }
