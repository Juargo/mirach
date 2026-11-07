package app.mirachbudget.android.features.detallebucket

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.R
import app.mirachbudget.android.core.design.CategoryIcon
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.SheetBar
import app.mirachbudget.android.core.design.Swatch
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.features.categoriasheet.CategoryFormState
import app.mirachbudget.android.features.categoriasheet.CategorySheet
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.CatalogState
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Content
import app.mirachbudget.android.features.resumen.MonthSelector
import app.mirachbudget.android.features.resumen.card
import app.mirachbudget.android.features.resumen.isLargeText
import app.mirachbudget.android.features.resumen.label
import app.mirachbudget.android.features.subircartola.PrimaryButton
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import kotlinx.coroutines.launch

/** What TalkBack reads on the bar's back arrow (same assumption as Cartolas subidas). */
private const val BACK_LABEL = "Volver"

/**
 * "Detalle de bucket": a bucket's movements for a month, grouped by category (port of iOS
 * `DetalleBucketView`). Tapping a movement opens a sheet to move it to another category. [onBack]
 * returns to the Resumen. [onOpenCategory], when set, makes each category header open that
 * category (its id); `null` leaves the headers plain.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DetalleBucketScreen(
    viewModel: DetalleBucketViewModel,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    onOpenCategory: ((String) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // A move outlives the screen: going back mid-request must not cancel it (or its `onReclassified`).
    val scope = viewModel.viewModelScope
    BackHandler(onBack = onBack)
    // Runs again on every appearance; once loaded it does nothing, so the month is kept.
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text(viewModel.bucket.label) },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = BACK_LABEL }) {
                        Text("←", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clearAndSetSemantics {})
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                    navigationIconContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (val content = state.content) {
                    Content.Loading -> item { Loading() }
                    is Content.Failed -> item {
                        LoadError(DetalleBucketMessages.loadFailure(content.failure), onRetry = { scope.launch { viewModel.retry() } })
                    }
                    is Content.Loaded -> {
                        val detalle = content.detalle
                        item(key = "months") {
                            MonthSelector(detalle.periodo, state.anterior, state.siguiente, onSelect = { scope.launch { viewModel.select(it) } })
                        }
                        state.announcement?.let { text -> item(key = "announcement") { Notice(text, isError = false) } }
                        state.notice?.let { text -> item(key = "notice") { Notice(text, isError = true) } }
                        if (detalle.grupos.isEmpty()) {
                            item(key = "empty") { Empty(DetalleBucketMessages.empty(detalle.periodo)) }
                        } else {
                            item(key = "header") { BucketHeader(detalle) }
                            detalle.grupos.forEach { group ->
                                item(key = "group-${group.key}") {
                                    GroupHeader(group, onOpen = group.categoriaId?.let { id -> onOpenCategory?.let { open -> { open(id) } } })
                                }
                                items(group.transacciones, key = { "row-${it.id}" }) { movement ->
                                    MovementRow(
                                        movement = movement,
                                        isMoving = state.reclassifyingId == movement.id,
                                        isEnabled = state.reclassifyingId == null,
                                        onTap = { scope.launch { viewModel.beginReclassify(movement) } },
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    state.sheetMovement?.let { movement -> ReclassifySheet(viewModel, state, movement) }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ReclassifySheet(viewModel: DetalleBucketViewModel, state: DetalleBucketViewModel.State, movement: MovimientoBucket) {
    val scope = viewModel.viewModelScope
    when (val catalog = state.catalog) {
        is CatalogState.Loaded -> CategorySheet(
            openingKey = movement.id,
            summaryTitle = movement.descripcion,
            summaryDetail = DetalleBucketMessages.sheetDetail(movement),
            catalog = catalog.catalog,
            selectedId = state.selection?.id ?: state.currentCategoryId(movement),
            // The bucket detail's form offers no pattern (as iOS).
            form = CategoryFormState(initialPattern = null, errors = state.categoryFormErrors, isCreating = state.isCreatingCategory),
            createdCount = state.createdCategoryCount,
            onSelect = { id -> scope.launch { viewModel.choose(id) } },
            onFormShown = viewModel::resetCategoryForm,
            onCreate = { nueva -> scope.launch { viewModel.createCategory(nueva) } },
            onDismiss = viewModel::dismissSheet,
            notice = state.sheetNotice,
            isBusy = state.isSheetBusy,
            footer = { SaveFooter(viewModel, state) },
        )
        CatalogState.Idle, CatalogState.Loading, CatalogState.Failed -> ModalBottomSheet(
            onDismissRequest = viewModel::dismissSheet,
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
            containerColor = MirachTheme.colors.base.background,
        ) {
            SheetBar(SubirCartolaMessages.SHEET_TITLE, SubirCartolaMessages.SHEET_CANCEL, viewModel::dismissSheet)
            if (catalog == CatalogState.Failed) {
                LoadError(DetalleBucketMessages.CATALOG_FAILED, onRetry = { scope.launch { viewModel.retryCatalog() } })
            } else {
                Loading(DetalleBucketMessages.LOADING_CATEGORIES)
            }
            Spacer(Modifier.navigationBarsPadding().size(48.dp))
        }
    }

    // Over the sheet, so it is above whatever the sheet is showing (list or form).
    state.pendingChange?.let { change ->
        AlertDialog(
            onDismissRequest = viewModel::cancelBucketChange,
            title = { Text(DetalleBucketMessages.BUCKET_CHANGE_TITLE) },
            text = { Text(DetalleBucketMessages.bucketChangeMessage(viewModel.bucket, change.category.bucket)) },
            confirmButton = { Button(onClick = { scope.launch { viewModel.confirmBucketChange() } }) { Text(DetalleBucketMessages.CONFIRM) } },
            dismissButton = { TextButton(onClick = viewModel::cancelBucketChange) { Text(DetalleBucketMessages.CANCEL) } },
        )
    }
}

/** «Guardar» under the categories (Figma 09), with «Aplicar a “…”» over it when the API suggested a pattern. */
@Composable
private fun SaveFooter(viewModel: DetalleBucketViewModel, state: DetalleBucketViewModel.State) {
    val scope = viewModel.viewModelScope
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.suggestion?.let { suggestion ->
            val parecidos = suggestion.parecidos
            CheckboxRow(
                title = DetalleBucketMessages.applyTitle(parecidos.patron.orEmpty()),
                lines = listOfNotNull(
                    DetalleBucketMessages.applySubtitle(parecidos.total),
                    DetalleBucketMessages.applyElsewhere(parecidos.existente, suggestion.category.id),
                ),
                spokenLabel = DetalleBucketMessages.applyLabel(parecidos, suggestion.category.id),
                isOn = state.applyToSimilar,
                enabled = !state.isSheetBusy,
                onToggle = viewModel::setApplyToSimilar,
            )
        }
        Column(Modifier.semantics(mergeDescendants = true) { stateDescription = DetalleBucketMessages.saveHint(state.selection) }) {
            PrimaryButton(DetalleBucketMessages.SAVE, enabled = state.canSave) { scope.launch { viewModel.save() } }
        }
    }
}

/**
 * A checkbox with a title and the lines that explain it (port of iOS `CheckboxRow`). TalkBack reads
 * it as one element with [spokenLabel], says whether it is marked, and a double tap toggles it.
 */
@Composable
private fun CheckboxRow(title: String, lines: List<String>, spokenLabel: String, isOn: Boolean, enabled: Boolean, onToggle: (Boolean) -> Unit) {
    val colors = MirachTheme.colors
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .clickable(enabled = enabled) { onToggle(!isOn) }
            .clearAndSetSemantics {
                contentDescription = spokenLabel
                role = Role.Checkbox
                toggleableState = ToggleableState(isOn)
                stateDescription = if (isOn) DetalleBucketMessages.CHECKED else DetalleBucketMessages.UNCHECKED
                if (enabled) onClick { onToggle(!isOn); true } else disabled()
            },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Checkbox(checked = isOn, onCheckedChange = null, enabled = enabled)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, color = colors.base.foreground)
            lines.forEach { Text(it, style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground) }
        }
    }
}

@Composable
private fun Loading(text: String = DetalleBucketMessages.LOADING) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(text, color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
private fun LoadError(text: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp, start = 16.dp, end = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(text, color = MirachTheme.colors.feedback.errorText, textAlign = TextAlign.Center)
        Button(onClick = onRetry) { Text(DetalleBucketMessages.RETRY) }
    }
}

@Composable
private fun Empty(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.titleMedium,
        color = MirachTheme.colors.base.foreground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(top = 32.dp),
    )
}

/** The result of a move or a failed refresh. A live region announces it without moving focus. */
@Composable
private fun Notice(text: String, isError: Boolean) {
    Text(
        (if (isError) "⚠ " else "✓ ") + text,
        color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.feedback.successText,
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = text
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
private fun BucketHeader(detalle: BucketDetalle) {
    val colors = MirachTheme.colors
    Column(
        Modifier.card().clearAndSetSemantics { contentDescription = DetalleBucketMessages.headerLabel(detalle) },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Swatch(detalle.bucket)
            Text(detalle.bucket.label, style = MaterialTheme.typography.titleMedium, color = colors.base.cardForeground)
        }
        Text(Format.expense(detalle.total), style = MaterialTheme.typography.headlineSmall.mirachFigures(), fontWeight = FontWeight.Bold, color = colors.feedback.expenseText)
        Text(DetalleBucketMessages.share(detalle.porcentajeBp), style = MaterialTheme.typography.bodySmall.mirachFigures(), color = colors.base.mutedForeground)
        detalle.metaBp?.let {
            Text(DetalleBucketMessages.meta(it), style = MaterialTheme.typography.bodySmall.mirachFigures(), color = colors.base.mutedForeground)
        }
        Text(DetalleBucketMessages.counts(detalle), style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground)
    }
}

/** A category's name, icon, count and subtotal. With [onOpen] it is a button that opens the category. */
@Composable
private fun GroupHeader(group: GrupoCategoria, onOpen: (() -> Unit)?) {
    val colors = MirachTheme.colors
    val label = DetalleBucketMessages.groupLabel(group)
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = 12.dp)
    val name: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Icon(painterResource(CategoryIcon.drawable(group.icono)), contentDescription = null, tint = colors.base.mutedForeground, modifier = Modifier.size(20.dp))
            Text(group.nombre, style = MaterialTheme.typography.titleMedium, maxLines = 2, color = colors.base.foreground)
        }
    }
    val figures: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(DetalleBucketMessages.movements(group.conteo), style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground)
            Text(Format.expense(group.subtotal), style = MaterialTheme.typography.titleSmall.mirachFigures(), fontWeight = FontWeight.Bold, color = colors.feedback.expenseText)
            if (onOpen != null) Text("›", style = MaterialTheme.typography.bodyLarge, color = colors.base.mutedForeground)
        }
    }
    val modifier = (if (onOpen != null) base.clickable(onClick = onOpen) else base).clearAndSetSemantics {
        contentDescription = label
        heading()
        if (onOpen != null) {
            role = Role.Button
            onClick(label = DetalleBucketMessages.GROUP_HINT) { onOpen(); true }
        }
    }
    if (isLargeText()) {
        Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
            name()
            figures()
        }
    } else {
        Row(modifier, verticalAlignment = Alignment.CenterVertically) {
            Column(Modifier.weight(1f)) { name() }
            figures()
        }
    }
}

/** One movement: a single TalkBack element that opens the sheet. */
@Composable
private fun MovementRow(movement: MovimientoBucket, isMoving: Boolean, isEnabled: Boolean, onTap: () -> Unit) {
    val colors = MirachTheme.colors
    val label = DetalleBucketMessages.rowLabel(movement)
    Column {
        Column(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 48.dp)
                .clickable(enabled = isEnabled, onClick = onTap)
                .padding(vertical = 10.dp)
                .clearAndSetSemantics {
                    contentDescription = label
                    role = Role.Button
                    if (isEnabled) onClick(label = DetalleBucketMessages.ROW_HINT) { onTap(); true } else disabled()
                },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            val amount: @Composable () -> Unit = {
                Text(Format.expense(movement.monto), style = MaterialTheme.typography.bodyLarge.mirachFigures(), maxLines = 1, color = colors.feedback.expenseText)
            }
            if (isLargeText()) {
                Text(movement.descripcion, color = colors.base.foreground)
                amount()
            } else {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(movement.descripcion, maxLines = 2, color = colors.base.foreground, modifier = Modifier.weight(1f))
                    amount()
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(DetalleBucketMessages.rowSubtitle(movement), style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground, modifier = Modifier.weight(1f))
                if (isMoving) {
                    CircularProgressIndicator(Modifier.size(16.dp), strokeWidth = 2.dp)
                } else {
                    // The tag says the row can be moved; TalkBack gets the click label instead.
                    Icon(painterResource(R.drawable.ic_categoria_tag), contentDescription = null, tint = colors.base.mutedForeground, modifier = Modifier.size(16.dp))
                }
            }
        }
        HorizontalDivider(color = colors.base.border)
    }
}
