package app.mirachbudget.android.features.movimientos

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.core.design.CategoryIcon
import app.mirachbudget.android.core.design.MirachRadius
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.ScreenBar
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.features.categorias.CenteredMessage
import app.mirachbudget.android.features.categorias.Loading
import app.mirachbudget.android.features.categorias.Notice
import app.mirachbudget.android.features.detallebucket.DetalleBucketMessages
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel
import app.mirachbudget.android.features.detallebucket.ReclassifySheet
import app.mirachbudget.android.features.movimientos.MovimientosViewModel.Content
import app.mirachbudget.android.features.resumen.MonthSelector
import app.mirachbudget.android.features.resumen.fill
import app.mirachbudget.android.features.resumen.isLargeText
import app.mirachbudget.android.features.resumen.label
import kotlinx.coroutines.launch

/**
 * «Movimientos»: the month's movements in three bucket panes of equal height that scroll on their own,
 * each with a visible «Mover» button. At large text sizes the panes give way to one scrolling list.
 * The view model is hoisted by the root (a hidden tab's composition is dropped), so the sheet and the
 * notice survive a tab switch.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MovimientosRoute(viewModel: MovimientosViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Collecting each pane makes this screen recompose when any of them changes.
    val paneStates = viewModel.panes.map { it.state.collectAsStateWithLifecycle().value }
    val scope = viewModel.viewModelScope
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }
    val busy = paneStates.any { it.reclassifyingId != null }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = { ScreenBar(title = MovimientosMessages.TITLE) },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            when (val content = viewModel.content) {
                Content.Loading -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) { Loading(DetalleBucketMessages.LOADING) }
                is Content.Failed -> Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                    CenteredMessage(DetalleBucketMessages.loadFailure(content.failure), DetalleBucketMessages.RETRY, onAction = { scope.launch { viewModel.retry() } })
                }
                is Content.Loaded -> {
                    val onMove: (MovimientoBucket, DetalleBucketViewModel) -> Unit = { movement, pane -> scope.launch { pane.beginReclassify(movement) } }
                    Column(Modifier.fillMaxSize().padding(horizontal = MirachSpacing.l)) {
                        MonthSelector(state.periodo, state.anterior, state.siguiente, onSelect = { scope.launch { viewModel.select(it) } })
                        if (isLargeText()) {
                            LargeTextList(viewModel, state, content.detalles, busy, onMove)
                        } else {
                            Notices(state, onUndo = { scope.launch { viewModel.undo() } }, Modifier.padding(bottom = MirachSpacing.s))
                            FixedPanes(viewModel, content.detalles, busy, onMove)
                        }
                    }
                }
            }
        }
    }

    // The sheet belongs to the pane whose movement is being moved.
    viewModel.panes.zip(paneStates).firstOrNull { (_, paneState) -> paneState.sheetMovement != null }?.let { (pane, paneState) ->
        paneState.sheetMovement?.let { movement -> ReclassifySheet(pane, paneState, movement) }
    }
}

/** Three panes of equal height between the title and the tab bar: the screen does not scroll, each pane does. */
@Composable
private fun FixedPanes(viewModel: MovimientosViewModel, detalles: List<BucketDetalle>, busy: Boolean, onMove: (MovimientoBucket, DetalleBucketViewModel) -> Unit) {
    Column(Modifier.fillMaxSize().padding(bottom = MirachSpacing.s), verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
        detalles.forEach { detalle ->
            val pane = viewModel.pane(detalle.bucket)
            Column(Modifier.weight(1f).fillMaxWidth().border(1.dp, MirachTheme.colors.base.border)) {
                PaneHeader(detalle)
                LazyColumn(Modifier.weight(1f).fillMaxWidth()) { paneRows(detalle, busy) { onMove(it, pane) } }
            }
        }
    }
}

/** The same content in one list, so nothing is clipped at large text sizes. */
@Composable
private fun LargeTextList(
    viewModel: MovimientosViewModel,
    state: MovimientosViewModel.State,
    detalles: List<BucketDetalle>,
    busy: Boolean,
    onMove: (MovimientoBucket, DetalleBucketViewModel) -> Unit,
) {
    val scope = viewModel.viewModelScope
    LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = MirachSpacing.m), verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
        item(key = "notices") { Notices(state, onUndo = { scope.launch { viewModel.undo() } }, Modifier) }
        detalles.forEach { detalle ->
            val pane = viewModel.pane(detalle.bucket)
            item(key = "pane-${detalle.bucket.apiName}") { PaneHeader(detalle, Modifier.border(1.dp, MirachTheme.colors.base.border)) }
            paneRows(detalle, busy) { onMove(it, pane) }
        }
    }
}

/** The move's notice (with «Deshacer» when it can be reverted) and the error, if any, in live regions. */
@Composable
private fun Notices(state: MovimientosViewModel.State, onUndo: () -> Unit, modifier: Modifier) {
    Column(modifier) {
        state.notice?.let { notice ->
            val text: @Composable (Modifier) -> Unit = { Notice(notice.text, isError = false, it) }
            val undo: @Composable () -> Unit = {
                notice.undo?.let { TextButton(onClick = onUndo, modifier = Modifier.heightIn(min = 48.dp)) { Text(MovimientosMessages.UNDO, style = MirachTextStyles.boton) } }
            }
            if (isLargeText()) {
                Column { text(Modifier); undo() }
            } else {
                Row(verticalAlignment = Alignment.CenterVertically) { text(Modifier.weight(1f)); undo() }
            }
        }
        state.warning?.let { Notice(it, isError = true, Modifier.padding(vertical = MirachSpacing.xs)) }
    }
}

/** A pane's bar in its bucket colour, with the name and, under it, only the total and its percentage. */
@Composable
private fun PaneHeader(detalle: BucketDetalle, modifier: Modifier = Modifier) {
    val colors = MirachTheme.colors
    Column(modifier.fillMaxWidth()) {
        Box(Modifier.fillMaxWidth().height(4.dp).background(colors.bucket.fill(detalle.bucket)))
        Column(
            Modifier.fillMaxWidth().padding(horizontal = MirachSpacing.m, vertical = MirachSpacing.s).clearAndSetSemantics {
                contentDescription = MovimientosMessages.paneLabel(detalle)
                heading()
            },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(detalle.bucket.label, style = MirachTextStyles.cuerpoDestacado, color = colors.base.foreground)
            Text(MovimientosMessages.paneHeader(detalle), style = MirachTextStyles.cuerpo.mirachFigures(), color = colors.base.mutedForeground)
        }
    }
}

/** Each group of the API as a marked row, its movements under it, in the API's order; «Sin movimientos» when there are none. */
private fun LazyListScope.paneRows(detalle: BucketDetalle, busy: Boolean, onMove: (MovimientoBucket) -> Unit) {
    if (detalle.grupos.isEmpty()) {
        item(key = "empty-${detalle.bucket.apiName}") {
            Text(
                MovimientosMessages.EMPTY,
                style = MirachTextStyles.cuerpo,
                color = MirachTheme.colors.base.mutedForeground,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth().padding(MirachSpacing.m),
            )
        }
        return
    }
    detalle.grupos.forEach { group ->
        item(key = "group-${detalle.bucket.apiName}-${group.key}") { CategoryRow(detalle, group) }
        items(group.transacciones.size, key = { "row-${group.transacciones[it].id}" }) { index ->
            val movement = group.transacciones[index]
            MovementRow(movement, enabled = !busy, onMove = { onMove(movement) })
        }
    }
}

/** A category: a square tile in the bucket colour holding its icon, its name, its count and its subtotal. Not a button. */
@Composable
private fun CategoryRow(detalle: BucketDetalle, group: GrupoCategoria) {
    val colors = MirachTheme.colors
    val tile: @Composable () -> Unit = {
        Box(Modifier.size(36.dp).background(colors.bucket.fill(detalle.bucket)), contentAlignment = Alignment.Center) {
            Icon(painterResource(CategoryIcon.drawable(group.icono)), contentDescription = null, tint = colors.base.background, modifier = Modifier.size(20.dp))
        }
    }
    val name: @Composable (Modifier) -> Unit = {
        Column(it) {
            Text(group.nombre, style = MirachTextStyles.cuerpoDestacado, color = colors.base.foreground)
            Text(DetalleBucketMessages.movements(group.conteo), style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
        }
    }
    val subtotal: @Composable () -> Unit = {
        Text(Format.money(group.subtotal), style = MirachTextStyles.cuerpoDestacado.mirachFigures(), color = colors.base.foreground)
    }
    val base = Modifier
        .fillMaxWidth()
        .background(colors.base.card)
        .heightIn(min = 48.dp)
        .padding(horizontal = MirachSpacing.m, vertical = MirachSpacing.s)
        .clearAndSetSemantics { contentDescription = DetalleBucketMessages.groupLabel(group) }
    if (isLargeText()) {
        Column(base, verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs)) {
            tile()
            name(Modifier)
            subtotal()
        }
    } else {
        Row(base, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.m)) {
            tile()
            name(Modifier.weight(1f))
            subtotal()
        }
    }
}

/**
 * A movement under its category, indented: the full description (it wraps), the date, the amount and a
 * visible «Mover» button. The row itself does nothing when tapped; only the button acts.
 */
@Composable
private fun MovementRow(movement: MovimientoBucket, enabled: Boolean, onMove: () -> Unit) {
    val colors = MirachTheme.colors
    val text: @Composable (Modifier) -> Unit = {
        Column(it.semantics(mergeDescendants = true) { contentDescription = MovimientosMessages.movementLabel(movement) }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(movement.descripcion, style = MirachTextStyles.cuerpo, color = colors.base.foreground)
            Text(Format.shortDate(movement.fecha), style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
        }
    }
    val amount: @Composable () -> Unit = {
        Text(Format.money(movement.monto), style = MirachTextStyles.cuerpoDestacado.mirachFigures(), color = colors.base.foreground)
    }
    val button: @Composable () -> Unit = { MoveButton(movement, enabled, onMove) }
    Column {
        val base = Modifier.fillMaxWidth().padding(start = MirachSpacing.l, end = MirachSpacing.m, top = MirachSpacing.s, bottom = MirachSpacing.s)
        if (isLargeText()) {
            Column(base, verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs)) {
                text(Modifier)
                amount()
                button()
            }
        } else {
            Row(base, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.m)) {
                text(Modifier.weight(1f))
                Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs)) {
                    amount()
                    button()
                }
            }
        }
        Box(Modifier.fillMaxWidth().height(1.dp).background(colors.base.border))
    }
}

/** The visible «Mover» button: a 1dp border so it reads as a button, 48dp tall, named after its movement for TalkBack. */
@Composable
private fun MoveButton(movement: MovimientoBucket, enabled: Boolean, onClick: () -> Unit) {
    val colors = MirachTheme.colors.base
    OutlinedButton(
        onClick = onClick,
        enabled = enabled,
        modifier = Modifier.heightIn(min = 48.dp).widthIn(min = 48.dp).semantics { contentDescription = MovimientosMessages.moveLabel(movement) },
        shape = RoundedCornerShape(MirachRadius.base),
        border = BorderStroke(1.dp, if (enabled) colors.input else colors.border),
        colors = ButtonDefaults.outlinedButtonColors(contentColor = colors.foreground),
        contentPadding = PaddingValues(horizontal = MirachSpacing.m),
    ) {
        Text(MovimientosMessages.MOVE, style = MirachTextStyles.boton)
    }
}
