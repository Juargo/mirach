package app.mirachbudget.android.features.categoriasheet

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.BucketChoice
import app.mirachbudget.android.core.design.FieldError
import app.mirachbudget.android.core.design.Footer
import app.mirachbudget.android.core.design.FormHeader
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.SheetBar
import app.mirachbudget.android.core.design.SheetRow
import app.mirachbudget.android.core.design.Swatch
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CatalogoCategorias
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.resumen.label
import app.mirachbudget.android.features.subircartola.StatusMessage
import app.mirachbudget.android.features.subircartola.SubirCartolaDisplay
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors

/** What the "Nueva categoría" form shows; [initialPattern] `null` hides the pattern field (as iOS). */
internal data class CategoryFormState(
    val initialPattern: String?,
    val errors: CategoryFormErrors,
    val isCreating: Boolean,
)

/**
 * The bottom sheet to choose a category, shared by the upload review and the bucket detail (port of
 * iOS `CategorySheet`): every category of the catalog grouped by bucket, plus «Crear categoría», which
 * swaps the list for the creation form inside the same sheet. The form goes back to the list when
 * [createdCount] changes. [isBusy] keeps the sheet open and shows progress; [footer] is pinned under
 * the list.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun CategorySheet(
    openingKey: Any,
    summaryTitle: String,
    summaryDetail: String,
    catalog: CatalogoCategorias,
    selectedId: String?,
    form: CategoryFormState,
    createdCount: Int,
    onSelect: (String) -> Unit,
    onFormShown: () -> Unit,
    onCreate: (NuevaCategoria) -> Unit,
    onDismiss: () -> Unit,
    notice: String? = null,
    isBusy: Boolean = false,
    footer: (@Composable () -> Unit)? = null,
) {
    var showingForm by rememberSaveable(openingKey) { mutableStateOf(false) }
    var seenCreated by rememberSaveable(openingKey) { mutableIntStateOf(createdCount) }
    LaunchedEffect(createdCount) {
        if (createdCount != seenCreated) {
            seenCreated = createdCount
            showingForm = false
        }
    }
    val busy by rememberUpdatedState(isBusy)
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        // While a move is being sent the sheet cannot be swiped away.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || !busy }),
        containerColor = MirachTheme.colors.base.background,
    ) {
        if (showingForm) {
            NewCategoryForm(form, onShown = onFormShown, onCreate = onCreate, onBack = { showingForm = false })
        } else {
            CategoryList(
                summaryTitle = summaryTitle,
                summaryDetail = summaryDetail,
                catalog = catalog,
                selectedId = selectedId,
                notice = notice,
                isBusy = isBusy,
                onSelect = onSelect,
                onCreateCategory = { showingForm = true },
                onCancel = onDismiss,
                footer = footer,
            )
        }
    }
}

@Composable
private fun ColumnScope.CategoryList(
    summaryTitle: String,
    summaryDetail: String,
    catalog: CatalogoCategorias,
    selectedId: String?,
    notice: String?,
    isBusy: Boolean,
    onSelect: (String) -> Unit,
    onCreateCategory: () -> Unit,
    onCancel: () -> Unit,
    footer: (@Composable () -> Unit)?,
) {
    val colors = MirachTheme.colors
    // Nothing can be chosen while the sheet is busy.
    val select: (String) -> Unit = { if (!isBusy) onSelect(it) }
    SheetBar(SubirCartolaMessages.SHEET_TITLE, SubirCartolaMessages.SHEET_CANCEL, onLeading = { if (!isBusy) onCancel() })
    // What is being classified, so the sheet makes sense without the list behind it.
    Column(
        Modifier.fillMaxWidth().background(colors.base.card).padding(16.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(2.dp),
    ) {
        Text(summaryTitle, style = MaterialTheme.typography.titleMedium, maxLines = 2, overflow = TextOverflow.Ellipsis, color = colors.base.cardForeground)
        Text(summaryDetail, style = MaterialTheme.typography.bodySmall.mirachFigures(), color = colors.base.mutedForeground)
    }
    HorizontalDivider(color = colors.base.border)
    if (isBusy) {
        Box(Modifier.fillMaxWidth().padding(8.dp), contentAlignment = Alignment.Center) {
            CircularProgressIndicator(Modifier.size(24.dp).semantics { contentDescription = MOVING_LABEL }, strokeWidth = 2.dp)
        }
    }
    LazyColumn(Modifier.fillMaxWidth().weight(1f, fill = false)) {
        notice?.let { text -> item(key = "notice") { StatusMessage(text, isError = true, modifier = Modifier.padding(16.dp)) } }
        item(key = "create") {
            SheetRow(onClick = { if (!isBusy) onCreateCategory() }) {
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
                SheetRow(onClick = { select(category.id) }, selected = selected) {
                    Text(category.nombre, color = colors.base.foreground, modifier = Modifier.weight(1f))
                    // The check is decoration: `selected` already tells TalkBack.
                    if (selected) Text("✓", color = colors.base.foreground, modifier = Modifier.clearAndSetSemantics {})
                }
            }
        }
        if (footer == null) item(key = "bottom") { Spacer(Modifier.navigationBarsPadding().size(16.dp)) }
    }
    if (footer != null) {
        HorizontalDivider(color = colors.base.border)
        Box(Modifier.fillMaxWidth().background(colors.base.card).padding(16.dp).navigationBarsPadding()) { footer() }
    }
}

/** What TalkBack reads on the sheet's spinner (iOS: «Moviendo el movimiento»). */
private const val MOVING_LABEL = "Moviendo el movimiento"

/**
 * "Nueva categoría": name, group and, when [CategoryFormState.initialPattern] is set, a pattern
 * prefilled with it (port of iOS `NewCategoryForm.swift`). It knows nothing of the screen it
 * serves: state and actions come in as values.
 */
@Composable
private fun NewCategoryForm(
    form: CategoryFormState,
    onShown: () -> Unit,
    onCreate: (NuevaCategoria) -> Unit,
    onBack: () -> Unit,
) {
    var name by rememberSaveable { mutableStateOf("") }
    var bucket by rememberSaveable { mutableStateOf<Bucket?>(null) }
    var pattern by rememberSaveable { mutableStateOf(form.initialPattern.orEmpty()) }
    val errors = form.errors
    val canCreate = SubirCartolaDisplay.canCreate(name, bucket, form.isCreating)
    LaunchedEffect(Unit) { onShown() }

    SheetBar(SubirCartolaMessages.FORM_TITLE, SubirCartolaMessages.SHEET_CANCEL, onBack) {
        TextButton(onClick = { bucket?.let { onCreate(SubirCartolaDisplay.nuevaCategoria(name, it, pattern)) } }, enabled = canCreate) {
            Text(if (form.isCreating) SubirCartolaMessages.FORM_CREATING else SubirCartolaMessages.FORM_CREATE)
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

        if (form.initialPattern != null) {
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
        }

        errors.general?.let { StatusMessage(it, isError = true) }
    }
}
