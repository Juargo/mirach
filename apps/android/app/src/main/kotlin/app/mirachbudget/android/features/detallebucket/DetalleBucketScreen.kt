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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.R
import app.mirachbudget.android.core.design.BucketBar
import app.mirachbudget.android.core.design.CategoryIcon
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachRadius
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.ScreenBar
import app.mirachbudget.android.core.design.SheetBar
import app.mirachbudget.android.core.design.Swatch
import app.mirachbudget.android.core.design.barFractions
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.BucketDetalle
import app.mirachbudget.android.core.networking.GrupoCategoria
import app.mirachbudget.android.core.networking.MovimientoBucket
import app.mirachbudget.android.features.categoriasheet.CategoryFormState
import app.mirachbudget.android.features.categoriasheet.CategorySheet
import app.mirachbudget.android.features.categorias.CenteredMessage
import app.mirachbudget.android.features.categorias.Loading
import app.mirachbudget.android.features.categorias.Notice
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.CatalogState
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel.Content
import app.mirachbudget.android.features.resumen.MonthSelector
import app.mirachbudget.android.features.resumen.isLargeText
import app.mirachbudget.android.features.resumen.fill
import app.mirachbudget.android.features.resumen.label
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import kotlinx.coroutines.launch

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
        topBar = { ScreenBar(title = viewModel.bucket.label, onBack = onBack) },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(horizontal = MirachSpacing.l, vertical = MirachSpacing.m),
            ) {
                when (val content = state.content) {
                    Content.Loading -> item { Loading(DetalleBucketMessages.LOADING) }
                    is Content.Failed -> item {
                        CenteredMessage(DetalleBucketMessages.loadFailure(content.failure), DetalleBucketMessages.RETRY, onAction = { scope.launch { viewModel.retry() } })
                    }
                    is Content.Loaded -> {
                        val detalle = content.detalle
                        item(key = "months") {
                            MonthSelector(detalle.periodo, state.anterior, state.siguiente, onSelect = { scope.launch { viewModel.select(it) } }, modifier = Modifier.padding(bottom = MirachSpacing.m))
                        }
                        state.announcement?.let { text -> item(key = "announcement") { Notice(text, isError = false, Modifier.padding(bottom = MirachSpacing.m)) } }
                        state.notice?.let { text -> item(key = "notice") { Notice(text, isError = true, Modifier.padding(bottom = MirachSpacing.m)) } }
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
                CenteredMessage(DetalleBucketMessages.CATALOG_FAILED, DetalleBucketMessages.RETRY, onAction = { scope.launch { viewModel.retryCatalog() } })
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
            title = { Text(DetalleBucketMessages.BUCKET_CHANGE_TITLE, style = MirachTextStyles.cuerpoDestacado) },
            text = { Text(DetalleBucketMessages.bucketChangeMessage(viewModel.bucket, change.category.bucket), style = MirachTextStyles.cuerpo) },
            confirmButton = {
                Button(
                    onClick = { scope.launch { viewModel.confirmBucketChange() } },
                    shape = RoundedCornerShape(MirachRadius.base),
                    colors = ButtonDefaults.buttonColors(containerColor = MirachTheme.colors.base.primary, contentColor = MirachTheme.colors.base.primaryForeground),
                ) {
                    Text(DetalleBucketMessages.CONFIRM, style = MirachTextStyles.boton)
                }
            },
            dismissButton = { TextButton(onClick = viewModel::cancelBucketChange) { Text(DetalleBucketMessages.CANCEL, style = MirachTextStyles.boton) } },
            shape = RoundedCornerShape(MirachRadius.base),
            containerColor = MirachTheme.colors.base.background,
            titleContentColor = MirachTheme.colors.base.foreground,
            textContentColor = MirachTheme.colors.base.foreground,
        )
    }
}

/** «Guardar» under the categories (Figma 09), with «Aplicar a “…”» over it when the API suggested a pattern. */
@Composable
private fun SaveFooter(viewModel: DetalleBucketViewModel, state: DetalleBucketViewModel.State) {
    val scope = viewModel.viewModelScope
    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.m)) {
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
            MirachPrimaryButton(DetalleBucketMessages.SAVE, onClick = { scope.launch { viewModel.save() } }, enabled = state.canSave)
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
        horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s),
    ) {
        Checkbox(
            checked = isOn,
            onCheckedChange = null,
            enabled = enabled,
            colors = CheckboxDefaults.colors(
                checkedColor = colors.base.primary,
                checkmarkColor = colors.base.primaryForeground,
                uncheckedColor = colors.base.input,
            ),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(title, style = MirachTextStyles.cuerpo, color = colors.base.foreground)
            lines.forEach { Text(it, style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground) }
        }
    }
}

@Composable
private fun Empty(text: String) {
    Text(
        text,
        style = MirachTextStyles.cuerpoDestacado,
        color = MirachTheme.colors.base.foreground,
        textAlign = TextAlign.Center,
        modifier = Modifier.fillMaxWidth().padding(top = MirachSpacing.xl),
    )
}

/**
 * The bucket's total in «Número grande» with its counts under it, then Figma's bar of real share
 * against target when the API sent a target. Without one, the share is plain text under the name.
 */
@Composable
private fun BucketHeader(detalle: BucketDetalle) {
    val colors = MirachTheme.colors
    val meta = detalle.metaBp
    Column(
        Modifier.fillMaxWidth().padding(bottom = MirachSpacing.s).clearAndSetSemantics { contentDescription = DetalleBucketMessages.headerLabel(detalle) },
        verticalArrangement = Arrangement.spacedBy(MirachSpacing.s),
    ) {
        Text(Format.expense(detalle.total), style = MirachTextStyles.numeroGrande.mirachFigures(), color = colors.feedback.expenseText)
        Text(DetalleBucketMessages.counts(detalle), style = MirachTextStyles.cuerpo, color = colors.base.mutedForeground)
        if (meta != null) {
            BucketBar(
                name = detalle.bucket.label,
                color = colors.bucket.fill(detalle.bucket),
                estado = null,
                fractions = barFractions(detalle.porcentajeBp, meta),
                caption = DetalleBucketMessages.share(detalle.porcentajeBp) + " · " + DetalleBucketMessages.meta(meta),
                description = DetalleBucketMessages.headerLabel(detalle),
            )
        } else {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
                Swatch(detalle.bucket)
                Text(detalle.bucket.label, style = MirachTextStyles.cuerpoDestacado, color = colors.base.foreground)
            }
            Text(DetalleBucketMessages.share(detalle.porcentajeBp), style = MirachTextStyles.etiqueta.mirachFigures(), color = colors.base.mutedForeground)
        }
    }
}

/** A category's name, icon, count and subtotal. With [onOpen] it is a button that opens the category. */
@Composable
private fun GroupHeader(group: GrupoCategoria, onOpen: (() -> Unit)?) {
    val colors = MirachTheme.colors
    val label = DetalleBucketMessages.groupLabel(group)
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp).padding(top = MirachSpacing.m)
    val name: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
            Icon(painterResource(CategoryIcon.drawable(group.icono)), contentDescription = null, tint = colors.base.mutedForeground, modifier = Modifier.size(20.dp))
            Text(group.nombre, style = MirachTextStyles.cuerpoDestacado, maxLines = 2, color = colors.base.foreground)
        }
    }
    val figures: @Composable () -> Unit = {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
            Text(DetalleBucketMessages.movements(group.conteo), style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
            Text(Format.expense(group.subtotal), style = MirachTextStyles.cuerpoDestacado.mirachFigures(), color = colors.feedback.expenseText)
            if (onOpen != null) Text("›", style = MirachTextStyles.cuerpo, color = colors.base.mutedForeground)
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
        Column(modifier, verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs)) {
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
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            val amount: @Composable () -> Unit = {
                Text(Format.expense(movement.monto), style = MirachTextStyles.cuerpoDestacado.mirachFigures(), maxLines = 1, color = colors.feedback.expenseText)
            }
            if (isLargeText()) {
                Text(movement.descripcion, style = MirachTextStyles.cuerpo, color = colors.base.foreground)
                amount()
            } else {
                Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(MirachSpacing.m)) {
                    Text(movement.descripcion, style = MirachTextStyles.cuerpo, maxLines = 2, color = colors.base.foreground, modifier = Modifier.weight(1f))
                    amount()
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                Text(DetalleBucketMessages.rowSubtitle(movement), style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground, modifier = Modifier.weight(1f))
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
