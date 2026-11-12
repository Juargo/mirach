package app.mirachbudget.android.features.subircartola

import app.mirachbudget.android.features.categoriasheet.CategoryFormState
import app.mirachbudget.android.features.categoriasheet.CategorySheet

import app.mirachbudget.android.core.design.Swatch
import app.mirachbudget.android.features.resumen.isLargeText
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.formatting.Format
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.core.networking.CartolaRow
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

    LazyColumn(modifier, contentPadding = PaddingValues(horizontal = MirachSpacing.m, vertical = MirachSpacing.m)) {
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
            openingKey = row.rowIndex,
            summaryTitle = row.descripcion,
            summaryDetail = SubirCartolaDisplay.rowSummaryDetail(row),
            catalog = catalog,
            selectedId = state.edits[row.rowIndex] ?: row.sugerido?.categoriaId,
            form = CategoryFormState(
                initialPattern = SubirCartolaDisplay.initialPattern(row.descripcion),
                errors = state.categoryFormErrors,
                isCreating = state.isCreatingCategory,
            ),
            createdCount = state.createdCategoryCount,
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
        Box(Modifier.padding(MirachSpacing.m)) {
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
            style = MirachTextStyles.cuerpoDestacado,
            color = MirachTheme.colors.base.foreground,
        )
        Text(SubirCartolaMessages.REVIEW_HINT, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.base.mutedForeground)
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
        style = MirachTextStyles.cuerpo,
        color = MirachTheme.colors.base.mutedForeground,
        modifier = if (live) Modifier.semantics { liveRegion = LiveRegionMode.Polite } else Modifier,
    )
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
            style = MirachTextStyles.cuerpoDestacado,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.weight(1f),
        )
        Text(
            section.rows.size.toString(),
            style = MirachTextStyles.etiqueta.mirachFigures(),
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
                style = MirachTextStyles.cuerpo,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
                color = if (row.esDuplicado) colors.base.mutedForeground else colors.base.foreground,
                modifier = m,
            )
        }
        val amount: @Composable () -> Unit = {
            Text(
                row.amountText,
                style = MirachTextStyles.cuerpo.mirachFigures(),
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
            Text(Format.shortDate(row.fecha), style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
            Text(detail, style = MirachTextStyles.etiqueta, color = colors.base.mutedForeground)
        } else {
            Row(verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                description(Modifier.weight(1f))
                amount()
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    "${Format.shortDate(row.fecha)} · $detail",
                    style = MirachTextStyles.etiqueta,
                    color = colors.base.mutedForeground,
                    modifier = Modifier.weight(1f),
                )
                if (row.isEditable) Text("›", style = MirachTextStyles.cuerpo, color = colors.base.mutedForeground)
            }
        }
    }
}
