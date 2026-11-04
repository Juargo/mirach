package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.features.resumen.isLargeText
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.resumen.fill
import app.mirachbudget.android.features.resumen.label
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CatalogState
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.PreviewRefresh

/**
 * `Revisando`: every row with its classification, grouped by bucket and category (port of iOS
 * `ReviewView.swift`). Tapping an editable row opens a sheet to choose another category.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
internal fun ReviewScreen(
    viewModel: SubirCartolaViewModel,
    state: SubirCartolaViewModel.State,
    preview: CartolaPreview,
    actions: StepActions,
    modifier: Modifier = Modifier,
) {
    val catalog = state.loadedCatalog
    val sections = ReviewPresentation.sections(preview.filas, state.edits, catalog)
    // The row whose sheet is open (its `rowIndex`), kept across a rotation.
    var editingRow by rememberSaveable { mutableStateOf<Int?>(null) }
    // A category created from the sheet closes it: compare against the count seen when it opened.
    var seenCreated by rememberSaveable { mutableIntStateOf(state.createdCategoryCount) }
    LaunchedEffect(state.createdCategoryCount) {
        if (state.createdCategoryCount != seenCreated) {
            seenCreated = state.createdCategoryCount
            editingRow = null
        }
    }

    LazyColumn(modifier, contentPadding = PaddingValues(horizontal = 16.dp, vertical = 16.dp)) {
        item(key = "header") { ReviewHeader(preview) }
        item(key = "notices") { ReviewNotices(state, actions) }
        sections.forEach { section ->
            stickyHeader(key = "section-${section.id}") { SectionHeader(section) }
            items(section.rows, key = { "row-${it.rowIndex}" }) { row ->
                val edit = state.edits[row.rowIndex]
                ReviewRow(
                    row = row,
                    classification = ReviewPresentation.classification(row, edit, catalog),
                    isEdited = edit != null,
                    onEdit = if (SubirCartolaDisplay.canEdit(row, catalog != null, state.previewRefresh)) {
                        { editingRow = row.rowIndex }
                    } else {
                        null
                    },
                )
                HorizontalDivider(color = MirachTheme.colors.base.border)
            }
        }
    }

    val row = editingRow?.let { index -> preview.filas.firstOrNull { it.rowIndex == index && it.isEditable } }
    if (row != null && catalog != null) {
        CategorySheet(
            row = row,
            catalog = catalog,
            selectedId = state.edits[row.rowIndex] ?: row.sugerido?.categoriaId,
            state = state,
            onSelect = { id ->
                viewModel.choose(id, row.rowIndex)
                editingRow = null
            },
            onFormShown = viewModel::resetCategoryForm,
            onCreate = { nueva -> actions.call { it.createCategory(nueva, row.rowIndex) } },
            onDismiss = { editingRow = null },
        )
    }
}

/** «Confirmar (N cambios)», pinned under the list. */
@Composable
internal fun ReviewActions(state: SubirCartolaViewModel.State, onConfirm: () -> Unit) {
    Column(Modifier.fillMaxWidth().background(MirachTheme.colors.base.background).navigationBarsPadding()) {
        HorizontalDivider(color = MirachTheme.colors.base.border)
        Box(Modifier.padding(16.dp)) {
            PrimaryButton(
                SubirCartolaMessages.confirmTitle(state.edits.size),
                enabled = state.loadedCatalog != null && state.previewRefresh != PreviewRefresh.Updating,
                onClick = onConfirm,
            )
        }
    }
}

@Composable
private fun ReviewHeader(preview: CartolaPreview) {
    Column(
        Modifier.fillMaxWidth().padding(bottom = 12.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        Text(
            SubirCartolaMessages.reviewHeader(preview.banco, preview.tipoCuenta),
            style = MaterialTheme.typography.titleMedium,
            color = MirachTheme.colors.base.foreground,
        )
        Text(SubirCartolaMessages.REVIEW_HINT, style = MaterialTheme.typography.bodyMedium, color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
private fun ReviewNotices(state: SubirCartolaViewModel.State, actions: StepActions) {
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        state.reviewNotice?.let { StatusMessage(it, isError = true) }
        // After creating a category: the repeated preview in progress, its result or its failure.
        when (val refresh = state.previewRefresh) {
            PreviewRefresh.Updating -> Muted(SubirCartolaMessages.UPDATING_PREVIEW, live = true)
            is PreviewRefresh.Failed -> {
                StatusMessage(SubirCartolaMessages.refreshFailed(refresh.categoryName), isError = true)
                SecondaryButton(SubirCartolaMessages.RETRY) { actions.call { it.retryPreviewRefresh() } }
            }
            PreviewRefresh.Idle -> state.reviewInfo?.let { StatusMessage(it, isError = false) }
        }
        when (state.catalog) {
            is CatalogState.Loaded -> Unit
            CatalogState.Loading -> Muted(SubirCartolaMessages.LOADING_CATEGORIES)
            CatalogState.Failed -> {
                StatusMessage(SubirCartolaMessages.CATALOG_FAILED_REVIEW, isError = true)
                SecondaryButton(SubirCartolaMessages.RETRY) { actions.call { it.retryCatalog() } }
            }
        }
    }
}

@Composable
private fun Muted(text: String, live: Boolean = false) {
    Text(
        text,
        color = MirachTheme.colors.base.mutedForeground,
        modifier = if (live) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier,
    )
}

/** The bucket color is a fill; the name next to it is the real label. */
@Composable
private fun Swatch(bucket: Bucket) {
    Box(Modifier.size(14.dp).background(MirachTheme.colors.bucket.fill(bucket)))
}

/** «Necesidades · Supermercado» with the bucket swatch and the row count; pinned while its rows scroll. */
@Composable
private fun SectionHeader(section: ReviewPresentation.Section) {
    Row(
        Modifier
            .fillMaxWidth()
            .background(MirachTheme.colors.base.background)
            .padding(vertical = 8.dp)
            .semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        section.bucket?.let { Swatch(it) }
        Text(
            section.title,
            style = MaterialTheme.typography.titleSmall,
            fontWeight = FontWeight.Bold,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.weight(1f),
        )
        Text(
            section.rows.size.toString(),
            style = MaterialTheme.typography.bodySmall.mirachFigures(),
            color = MirachTheme.colors.base.mutedForeground,
        )
    }
}

/** One statement row: a single TalkBack element. Duplicates and incomes are not buttons. */
@Composable
private fun ReviewRow(
    row: CartolaRow,
    classification: ReviewPresentation.Classification,
    isEdited: Boolean,
    onEdit: (() -> Unit)?,
) {
    val label = SubirCartolaDisplay.rowAccessibilityLabel(row, ReviewPresentation.rowDetail(row, classification, isEdited))
    val colors = MirachTheme.colors
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    Column(
        (if (onEdit != null) base.clickable(onClick = onEdit) else base)
            .padding(vertical = 10.dp)
            .clearAndSetSemantics {
                contentDescription = label
                if (onEdit != null) {
                    role = Role.Button
                    onClick(label = SubirCartolaMessages.EDIT_ROW_HINT) { onEdit(); true }
                }
            },
        verticalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        val description: @Composable (Modifier) -> Unit = { m ->
            Text(
                row.descripcion,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = if (row.esDuplicado) colors.base.mutedForeground else colors.base.foreground,
                modifier = m,
            )
        }
        val amount: @Composable () -> Unit = {
            Text(
                row.amountText,
                style = MaterialTheme.typography.bodyLarge.mirachFigures(),
                maxLines = 1,
                color = if (row.cargo != 0L) colors.feedback.expenseText else colors.base.foreground,
            )
        }
        val detail = when {
            row.esDuplicado -> "✓ ${SubirCartolaMessages.ALREADY_LOADED}"
            row.esIngreso -> ReviewPresentation.INCOME_TITLE
            isEdited -> "${classification.text} · ${SubirCartolaMessages.EDITED}"
            else -> classification.text
        }
        if (isLargeText()) {
            description(Modifier)
            amount()
            Text(Format.shortDate(row.fecha), style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground)
            Text(detail, style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground)
        } else {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                description(Modifier.weight(1f))
                amount()
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${Format.shortDate(row.fecha)} · $detail",
                    style = MaterialTheme.typography.bodySmall,
                    color = colors.base.mutedForeground,
                    modifier = Modifier.weight(1f),
                )
                if (row.isEditable) Text("›", style = MaterialTheme.typography.bodyLarge, color = colors.base.mutedForeground)
            }
        }
    }
}

/**
 * The bottom sheet: every category of the catalog grouped by bucket, plus «Crear categoría», which
 * swaps the list for the creation form inside the same sheet (as iOS pushes it inside its sheet).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategorySheet(
    row: CartolaRow,
    catalog: CatalogoCategorias,
    selectedId: String?,
    state: SubirCartolaViewModel.State,
    onSelect: (String) -> Unit,
    onFormShown: () -> Unit,
    onCreate: (NuevaCategoria) -> Unit,
    onDismiss: () -> Unit,
) {
    var showingForm by rememberSaveable(row.rowIndex) { mutableStateOf(false) }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = MirachTheme.colors.base.background,
    ) {
        if (showingForm) {
            NewCategoryForm(
                initialPattern = SubirCartolaDisplay.initialPattern(row.descripcion),
                errors = state.categoryFormErrors,
                isCreating = state.isCreatingCategory,
                onShown = onFormShown,
                onCreate = onCreate,
                onBack = { showingForm = false },
            )
        } else {
            CategoryList(row, catalog, selectedId, onSelect, onCreateCategory = { showingForm = true }, onCancel = onDismiss)
        }
    }
}

@Composable
private fun SheetBar(title: String, leading: String, onLeading: () -> Unit, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onLeading) { Text(leading) }
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

@Composable
private fun CategoryList(
    row: CartolaRow,
    catalog: CatalogoCategorias,
    selectedId: String?,
    onSelect: (String) -> Unit,
    onCreateCategory: () -> Unit,
    onCancel: () -> Unit,
) {
    val colors = MirachTheme.colors
    SheetBar(SubirCartolaMessages.SHEET_TITLE, SubirCartolaMessages.SHEET_CANCEL, onCancel)
    // What is being classified, so the sheet makes sense without the list behind it.
    Column(
        Modifier.fillMaxWidth().background(colors.base.card).padding(16.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(row.descripcion, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = colors.base.cardForeground)
        Text(SubirCartolaDisplay.rowSummaryDetail(row), style = MaterialTheme.typography.bodySmall.mirachFigures(), color = colors.base.mutedForeground)
    }
    HorizontalDivider(color = colors.base.border)
    LazyColumn(Modifier.fillMaxWidth()) {
        item(key = "create") {
            SheetRow(onClick = onCreateCategory) {
                Text("+ ${SubirCartolaMessages.CREATE_CATEGORY}", color = colors.base.foreground, modifier = Modifier.weight(1f))
                Text("›", color = colors.base.mutedForeground)
            }
        }
        Bucket.entries.forEach { bucket ->
            item(key = "bucket-${bucket.apiName}") {
                Row(
                    Modifier.fillMaxWidth().padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = 4.dp).semantics(mergeDescendants = true) { heading() },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Swatch(bucket)
                    Text(bucket.label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = colors.base.foreground)
                }
            }
            val categorias = catalog.deBucket(bucket)
            if (categorias.isEmpty()) {
                item(key = "empty-${bucket.apiName}") {
                    Text(SubirCartolaMessages.NO_CATEGORIES, color = colors.base.mutedForeground, modifier = Modifier.padding(16.dp))
                }
            }
            items(categorias, key = { "cat-${it.id}" }) { category ->
                val selected = category.id == selectedId
                SheetRow(onClick = { onSelect(category.id) }, selected = selected) {
                    Text(category.nombre, color = colors.base.foreground, modifier = Modifier.weight(1f))
                    // The check is decoration: `selected` already tells TalkBack.
                    if (selected) Text("✓", color = colors.base.foreground, modifier = Modifier.clearAndSetSemantics {})
                }
            }
        }
        item(key = "bottom") { Spacer(Modifier.navigationBarsPadding().size(16.dp)) }
    }
}

@Composable
private fun SheetRow(onClick: () -> Unit, selected: Boolean? = null, content: @Composable RowScope.() -> Unit) {
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    Row(
        (if (selected != null) base.selectable(selected = selected, onClick = onClick, role = Role.Button) else base.clickable(onClick = onClick, role = Role.Button))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

/**
 * "Nueva categoría": name, group and a pattern prefilled with the row's description (port of iOS
 * `NewCategoryForm.swift`). It knows nothing of the screen it serves: state and actions come in as values.
 */
@Composable
private fun NewCategoryForm(
    initialPattern: String,
    errors: SubirCartolaViewModel.CategoryFormErrors,
    isCreating: Boolean,
    onShown: () -> Unit,
    onCreate: (NuevaCategoria) -> Unit,
    onBack: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var bucket by rememberSaveable { mutableStateOf<Bucket?>(null) }
    var pattern by rememberSaveable { mutableStateOf(initialPattern) }
    val canCreate = SubirCartolaDisplay.canCreate(name, bucket, isCreating)
    LaunchedEffect(Unit) { onShown() }
    val colors = MirachTheme.colors

    SheetBar(SubirCartolaMessages.FORM_TITLE, SubirCartolaMessages.SHEET_CANCEL, onBack) {
        TextButton(onClick = { bucket?.let { onCreate(SubirCartolaDisplay.nuevaCategoria(name, it, pattern)) } }, enabled = canCreate) {
            Text(if (isCreating) SubirCartolaMessages.FORM_CREATING else SubirCartolaMessages.FORM_CREATE)
        }
    }
    Column(
        Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(16.dp).navigationBarsPadding(),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        OutlinedTextField(
            value = name,
            onValueChange = { name = it.filterNot { c -> c == '\n' || c == '\r' } },
            label = { Text(SubirCartolaMessages.FORM_NAME) },
            singleLine = true,
            isError = errors.name != null,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, autoCorrectEnabled = false, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        FieldError(errors.name)

        FormHeader(SubirCartolaMessages.FORM_BUCKET)
        BucketChoice(bucket, onSelect = { bucket = it })
        FieldError(errors.bucket)
        Footer(SubirCartolaMessages.FORM_BUCKET_FOOTER)

        FormHeader(SubirCartolaMessages.FORM_PATTERN)
        OutlinedTextField(
            value = pattern,
            onValueChange = { pattern = it.filterNot { c -> c == '\n' || c == '\r' } },
            label = { Text(SubirCartolaMessages.FORM_PATTERN_FIELD) },
            singleLine = true,
            isError = errors.pattern != null,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        FieldError(errors.pattern)
        Footer(SubirCartolaMessages.FORM_PATTERN_FOOTER)

        errors.general?.let { StatusMessage(it, isError = true) }
    }
}

@Composable
private fun FormHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MirachTheme.colors.base.mutedForeground,
        modifier = Modifier.padding(top = 8.dp).semantics { heading() },
    )
}

@Composable
private fun Footer(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
}

@Composable
private fun FieldError(text: String?) {
    text?.let {
        Text(
            it,
            style = MaterialTheme.typography.bodySmall,
            color = MirachTheme.colors.feedback.errorText,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** Three labeled options, one per row, with a check on the chosen one (not color alone). */
@Composable
private fun BucketChoice(selection: Bucket?, onSelect: (Bucket) -> Unit) {
    Column(Modifier.fillMaxWidth().background(MirachTheme.colors.base.card)) {
        Bucket.entries.forEach { option ->
            val selected = selection == option
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .selectable(selected = selected, onClick = { onSelect(option) }, role = Role.RadioButton)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Swatch(option)
                Text(option.label, maxLines = 1, color = MirachTheme.colors.base.cardForeground, modifier = Modifier.weight(1f))
                if (selected) Text("✓", color = MirachTheme.colors.base.cardForeground, modifier = Modifier.clearAndSetSemantics {})
            }
        }
    }
}
