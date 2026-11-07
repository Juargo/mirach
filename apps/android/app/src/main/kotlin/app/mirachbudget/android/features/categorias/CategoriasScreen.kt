package app.mirachbudget.android.features.categorias

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.design.BucketChoice
import app.mirachbudget.android.core.design.CategoryIcon
import app.mirachbudget.android.core.design.FieldError
import app.mirachbudget.android.core.design.Footer
import app.mirachbudget.android.core.design.FormHeader
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.SheetBar
import app.mirachbudget.android.core.design.Swatch
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.NuevaCategoria
import app.mirachbudget.android.features.categorias.CategoriasViewModel.Content
import app.mirachbudget.android.features.resumen.card
import app.mirachbudget.android.features.resumen.label
import app.mirachbudget.android.features.subircartola.StatusMessage
import app.mirachbudget.android.features.subircartola.SubirCartolaDisplay
import app.mirachbudget.android.features.subircartola.SubirCartolaMessages
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CategoryFormErrors
import kotlinx.coroutines.launch

/**
 * The «Categorías» tab: the list, and a category's detail opened in place over it (port of iOS
 * `CategoriasView`). [onChange] runs after every catalog write made here or in a detail opened from
 * here, so the other tabs can refresh. Bump [catalogRevision] when the catalog changed elsewhere (a
 * reclassification, a category created in Subir): the list reads it again without blanking. Bumping
 * it for writes reported by [onChange] too is harmless; the newer read supersedes the older.
 */
@Composable
fun CategoriasRoute(
    api: MirachApi,
    userId: String,
    onChange: () -> Unit,
    modifier: Modifier = Modifier,
    catalogRevision: Int = 0,
) {
    val currentOnChange by rememberUpdatedState(onChange)
    // Keyed by person, so signing in as someone else never shows the previous catalog.
    val viewModel = viewModel<CategoriasViewModel>(
        key = "categorias-$userId",
        factory = viewModelFactory { initializer { CategoriasViewModel(api) { currentOnChange() } } },
    )
    // Writes outlive the screen: leaving it mid-request must not cancel them (or their `onChange`).
    val scope = viewModel.viewModelScope
    LaunchedEffect(catalogRevision) { if (catalogRevision > 0) viewModel.catalogDidChange() }

    var openedId by rememberSaveable { mutableStateOf<String?>(null) }
    val opened = openedId
    if (opened != null) {
        DetalleCategoriaRoute(
            api = api,
            categoriaId = opened,
            onBack = { openedId = null },
            onChange = {
                currentOnChange()
                scope.launch { viewModel.catalogDidChange() }
            },
            onDeleted = viewModel::announceDeletion,
            modifier = modifier,
        )
        return
    }
    CategoriasScreen(viewModel, onOpen = { openedId = it }, modifier = modifier)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun CategoriasScreen(viewModel: CategoriasViewModel, onOpen: (String) -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = viewModel.viewModelScope
    // Runs again on every appearance; once loaded it does nothing, so the list is not blanked.
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }
    // The form is open while no category was created since it opened: a creation closes it, a rotation does not.
    var formOpenedAt by rememberSaveable { mutableStateOf<Int?>(null) }
    val openForm = {
        viewModel.resetForm()
        formOpenedAt = state.createdCount
    }
    val listState = rememberLazyListState()
    // The announcement is the list's first row: bring it into view, wherever the list was scrolled.
    LaunchedEffect(state.announcement) { if (state.announcement != null) listState.animateScrollToItem(0) }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text(CategoriasMessages.TITLE) },
                actions = {
                    IconButton(
                        onClick = openForm,
                        enabled = state.content is Content.Loaded,
                        modifier = Modifier.semantics { contentDescription = CategoriasMessages.NEW_CATEGORY },
                    ) {
                        Text("+", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clearAndSetSemantics {})
                    }
                },
                colors = barColors(),
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
                state = listState,
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                when (val content = state.content) {
                    Content.Loading -> item { Loading(CategoriasMessages.LOADING) }
                    is Content.Failed -> item {
                        CenteredMessage(CategoriasMessages.loadFailure(content.failure), CategoriasMessages.RETRY, onAction = { scope.launch { viewModel.retry() } })
                    }
                    is Content.Loaded -> {
                        state.announcement?.let { text -> item(key = "announcement") { Notice(text, isError = false) } }
                        state.refreshNotice?.let { text -> item(key = "notice") { Notice(text, isError = true) } }
                        if (content.catalog.categorias.isEmpty()) item(key = "empty") { Empty(onCreate = openForm) }
                        Bucket.entries.forEach { bucket ->
                            item(key = "group-${bucket.apiName}") { GroupHeader(bucket) }
                            val categorias = content.catalog.deBucket(bucket)
                            if (categorias.isEmpty()) {
                                item(key = "none-${bucket.apiName}") {
                                    Text(CategoriasMessages.NO_CATEGORIES, color = MirachTheme.colors.base.mutedForeground)
                                }
                            }
                            items(categorias, key = { it.id }) { category -> CategoriaRow(category, onClick = { onOpen(category.id) }) }
                        }
                    }
                }
            }
        }
    }

    if (formOpenedAt == state.createdCount) {
        NewCategorySheet(
            errors = state.formErrors,
            isCreating = state.isCreating,
            onCreate = { nueva -> scope.launch { viewModel.create(nueva) } },
            onDismiss = { formOpenedAt = null },
        )
    }
}

@Composable
private fun Empty(onCreate: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(CategoriasMessages.EMPTY, color = MirachTheme.colors.base.mutedForeground, textAlign = TextAlign.Center)
        Button(onClick = onCreate) { Text(CategoriasMessages.NEW_CATEGORY) }
    }
}

@Composable
private fun GroupHeader(bucket: Bucket) {
    Row(
        Modifier.fillMaxWidth().padding(top = 12.dp).semantics(mergeDescendants = true) { heading() },
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Swatch(bucket)
        Text(bucket.label, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = MirachTheme.colors.base.foreground)
    }
}

@Composable
private fun CategoriaRow(category: CategoriaCatalogo, onClick: () -> Unit) {
    val colors = MirachTheme.colors.base
    Row(
        Modifier
            .clickable(role = Role.Button, onClick = onClick)
            .card()
            .heightIn(min = 48.dp)
            .clearAndSetSemantics { contentDescription = CategoriasMessages.rowLabel(category) },
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(painterResource(CategoryIcon.drawable(category.icono)), contentDescription = null, tint = colors.mutedForeground, modifier = Modifier.size(24.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(category.nombre, style = MaterialTheme.typography.titleMedium, maxLines = 2, color = colors.cardForeground)
            Text(CategoriasMessages.counts(category), style = MaterialTheme.typography.bodySmall, color = colors.mutedForeground)
        }
        Text("›", color = colors.mutedForeground)
    }
}

/**
 * "Nueva categoría": the review's creation form (name, group) with an icon and no pattern, as iOS
 * `NewCategoryForm` with `offersIcon` and no initial pattern (patterns are added in the detail).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewCategorySheet(errors: CategoryFormErrors, isCreating: Boolean, onCreate: (NuevaCategoria) -> Unit, onDismiss: () -> Unit) {
    val creating by rememberUpdatedState(isCreating)
    var name by rememberSaveable { mutableStateOf("") }
    var bucket by rememberSaveable { mutableStateOf<Bucket?>(null) }
    var icon by rememberSaveable { mutableStateOf<String?>(null) }
    val colors = MirachTheme.colors

    ModalBottomSheet(
        onDismissRequest = { if (!creating) onDismiss() },
        // A creation under way cannot be swiped away: its answer would have nowhere to land.
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || !creating }),
        containerColor = colors.base.background,
    ) {
        SheetBar(SubirCartolaMessages.FORM_TITLE, CategoriasMessages.CANCEL, onLeading = { if (!creating) onDismiss() }) {
            TextButton(
                onClick = { bucket?.let { onCreate(NuevaCategoria(nombre = name.trim(), bucket = it, patron = null, icono = icon)) } },
                enabled = SubirCartolaDisplay.canCreate(name, bucket, isCreating),
            ) { Text(if (isCreating) SubirCartolaMessages.FORM_CREATING else SubirCartolaMessages.FORM_CREATE) }
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

            FormHeader(CategoriasMessages.FORM_ICON)
            IconPicker(selection = icon, allowsNone = true, onSelect = { icon = it })

            errors.general?.let { StatusMessage(it, isError = true) }
        }
    }
}
