package app.mirachbudget.android.features.categorias

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.design.BucketChoice
import app.mirachbudget.android.core.design.FieldError
import app.mirachbudget.android.core.design.Footer
import app.mirachbudget.android.core.design.FormHeader
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.PatronCategoria
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.Content
import app.mirachbudget.android.features.subircartola.StatusMessage
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * "Detalle de categoría y patrones" for [categoriaId] (never a name), with its own view model per
 * opening: each opening reads the catalog afresh, as iOS pushes a new screen. Usable from the
 * Categorías list and from a bucket detail. [onBack] closes it (also after it was deleted);
 * [onChange] runs after every write; [onDeleted] gets the name once this screen deleted it.
 */
@Composable
fun DetalleCategoriaRoute(
    api: MirachApi,
    categoriaId: String,
    onBack: () -> Unit,
    onChange: () -> Unit,
    modifier: Modifier = Modifier,
    onDeleted: (String) -> Unit = {},
) {
    val currentOnChange by rememberUpdatedState(onChange)
    val currentOnDeleted by rememberUpdatedState(onDeleted)
    // One id per opening, kept across rotation: an id never names another opening's view model.
    val opening = rememberSaveable(categoriaId) { UUID.randomUUID().toString() }
    val viewModel = viewModel<DetalleCategoriaViewModel>(
        key = "detalle-categoria-$categoriaId-$opening",
        factory = viewModelFactory {
            initializer { DetalleCategoriaViewModel(api, categoriaId, onChange = { currentOnChange() }, onDeleted = { currentOnDeleted(it) }) }
        },
    )
    DetalleCategoriaScreen(viewModel, onBack, modifier)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetalleCategoriaScreen(viewModel: DetalleCategoriaViewModel, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Writes outlive the screen: leaving it mid-request must not cancel them (or their `onChange`).
    val scope = viewModel.viewModelScope
    val focus = LocalFocusManager.current
    // With unsaved changes, going back would drop them silently: ask first.
    val leave = { if (state.hasChanges) viewModel.askToDiscard() else onBack() }
    BackHandler(onBack = leave)
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }
    LaunchedEffect(state.isGone) { if (state.isGone) onBack() }
    val category = state.category

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text(category?.nombre ?: DetalleCategoriaMessages.TITLE_FALLBACK, maxLines = 1) },
                navigationIcon = { BackArrow(onClick = leave) },
                // Nothing to save until the category is on screen.
                actions = {
                    if (category != null) {
                        SaveAction(state) {
                            focus.clearFocus()
                            scope.launch { viewModel.save() }
                        }
                    }
                },
                colors = barColors(),
            )
        },
    ) { padding ->
        Column(Modifier.padding(padding).fillMaxSize()) {
            // The result of a write, pinned above the form: the person may be scrolled to the bottom.
            Banner(state)
            PullToRefreshBox(
                isRefreshing = state.isRefreshing,
                onRefresh = { scope.launch { viewModel.refresh() } },
                modifier = Modifier.fillMaxSize(),
            ) {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                    when (val content = state.content) {
                        Content.Loading -> Loading(DetalleCategoriaMessages.LOADING)
                        is Content.Failed -> CenteredMessage(
                            DetalleCategoriaMessages.loadFailure(content.failure),
                            DetalleCategoriaMessages.RETRY,
                            onAction = { scope.launch { viewModel.retry() } },
                        )
                        Content.NotFound -> CenteredMessage(DetalleCategoriaMessages.GONE, DetalleCategoriaMessages.BACK_TO_LIST, onAction = onBack, isError = false)
                        is Content.Loaded -> Form(viewModel, state, content.categoria, onDelete = {
                            focus.clearFocus()
                            viewModel.requestDeletion()
                        })
                    }
                }
            }
        }
    }

    Dialogs(viewModel, state, onDiscarded = onBack)
    val sheet = state.patternSheet
    if (sheet != null && category != null) PatternSheet(viewModel, state, sheet, category)
}

@Composable
private fun SaveAction(state: DetalleCategoriaViewModel.State, onSave: () -> Unit) {
    if (state.isSaving) {
        CircularProgressIndicator(
            Modifier.padding(horizontal = 16.dp).size(20.dp).semantics { contentDescription = DetalleCategoriaMessages.SAVING },
            strokeWidth = 2.dp,
        )
    } else {
        TextButton(onClick = onSave, enabled = state.hasChanges && !state.isProtected) { Text(DetalleCategoriaMessages.SAVE) }
    }
}

@Composable
private fun Banner(state: DetalleCategoriaViewModel.State) {
    val announcement = state.announcement
    val notice = state.notice ?: state.refreshNotice
    if (announcement == null && notice == null) return
    Column(
        Modifier.fillMaxWidth().background(MirachTheme.colors.base.card).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        announcement?.let { Notice(it, isError = false) }
        notice?.let { Notice(it, isError = true) }
    }
}

/**
 * The form. A protected category cannot be edited: only the controls go off, so the person can
 * still scroll and read it.
 */
@Composable
private fun Form(viewModel: DetalleCategoriaViewModel, state: DetalleCategoriaViewModel.State, category: CategoriaCatalogo, onDelete: () -> Unit) {
    val locked = state.isProtected || state.isSaving
    val colors = MirachTheme.colors
    Column(Modifier.fillMaxWidth().padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.isProtected) Text("🔒 " + DetalleCategoriaMessages.PROTECTED, color = colors.base.foreground)

        FormHeader(DetalleCategoriaMessages.NAME)
        OutlinedTextField(
            value = state.draftNombre,
            onValueChange = { viewModel.setDraftNombre(it.filterNot { c -> c == '\n' || c == '\r' }) },
            label = { Text(DetalleCategoriaMessages.NAME) },
            singleLine = true,
            enabled = !locked,
            isError = state.fieldErrors.name != null,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, autoCorrectEnabled = false, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth(),
        )
        FieldError(state.fieldErrors.name)
        Footer(DetalleCategoriaMessages.nameFooter(category))

        FormHeader(DetalleCategoriaMessages.BUCKET)
        // The shared choice has no disabled look; a locked form simply ignores the pick.
        BucketChoice(state.draftBucket, onSelect = { if (!locked) viewModel.setDraftBucket(it) })
        FieldError(state.fieldErrors.bucket)
        Footer(DetalleCategoriaMessages.BUCKET_FOOTER)

        FormHeader(DetalleCategoriaMessages.ICON)
        IconPicker(selection = state.draftIcono, allowsNone = category.icono == null, enabled = !locked, onSelect = viewModel::setDraftIcono)
        FieldError(state.fieldErrors.icon)

        FormHeader(DetalleCategoriaMessages.PATTERNS)
        if (category.patrones.isEmpty()) Text(DetalleCategoriaMessages.PATTERNS_EMPTY, color = colors.base.mutedForeground)
        category.patrones.forEach { pattern ->
            PatternRow(
                pattern = pattern,
                isDeleting = state.deletingPattern == pattern.id,
                enabled = !locked,
                onEdit = { viewModel.beginEditPattern(pattern) },
                onDelete = { viewModel.requestPatternDeletion(pattern) },
            )
        }
        TextButton(onClick = viewModel::beginAddPattern, enabled = !locked) { Text("+ " + DetalleCategoriaMessages.ADD_PATTERN) }
        Footer(DetalleCategoriaMessages.PATTERNS_FOOTER)

        state.fieldErrors.general?.let { StatusMessage(it, isError = true) }

        if (state.isDeleting) {
            Row(
                Modifier.heightIn(min = 48.dp).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Text(DetalleCategoriaMessages.DELETING, color = colors.base.mutedForeground)
            }
        } else {
            TextButton(
                onClick = onDelete,
                enabled = !locked,
                colors = ButtonDefaults.textButtonColors(contentColor = colors.feedback.errorText),
            ) { Text(DetalleCategoriaMessages.DELETE_CATEGORY) }
        }
    }
}

@Composable
private fun PatternRow(pattern: PatronCategoria, isDeleting: Boolean, enabled: Boolean, onEdit: () -> Unit, onDelete: () -> Unit) {
    val colors = MirachTheme.colors
    Row(Modifier.fillMaxWidth().background(colors.base.card), verticalAlignment = Alignment.CenterVertically) {
        Column(
            Modifier
                .weight(1f)
                .heightIn(min = 48.dp)
                .clickable(enabled = enabled, role = Role.Button, onClickLabel = DetalleCategoriaMessages.EDIT_PATTERN_HINT, onClick = onEdit)
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .clearAndSetSemantics { contentDescription = DetalleCategoriaMessages.patternRowLabel(pattern.matchType, pattern.patron) },
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(pattern.patron, color = colors.base.cardForeground)
            Text(DetalleCategoriaMessages.matchType(pattern.matchType), style = MaterialTheme.typography.bodySmall, color = colors.base.mutedForeground)
        }
        if (isDeleting) {
            CircularProgressIndicator(Modifier.padding(12.dp).size(20.dp), strokeWidth = 2.dp)
        } else {
            TextButton(
                onClick = onDelete,
                enabled = enabled,
                colors = ButtonDefaults.textButtonColors(contentColor = colors.feedback.errorText),
                modifier = Modifier.semantics { contentDescription = DetalleCategoriaMessages.deletePatternLabel(pattern.patron) },
            ) { Text(DetalleCategoriaMessages.DELETE) }
        }
    }
}

/** The four confirmations; each names its consequence and has two explicit options. */
@Composable
private fun Dialogs(viewModel: DetalleCategoriaViewModel, state: DetalleCategoriaViewModel.State, onDiscarded: () -> Unit) {
    val scope = viewModel.viewModelScope
    state.pendingBucketChange?.let { change ->
        Confirmation(
            title = DetalleCategoriaMessages.BUCKET_CHANGE_TITLE,
            message = DetalleCategoriaMessages.bucketChange(change),
            confirm = DetalleCategoriaMessages.CONFIRM,
            dismiss = DetalleCategoriaMessages.CANCEL,
            destructive = false,
            onConfirm = { scope.launch { viewModel.confirmBucketChange() } },
            onDismiss = viewModel::cancelBucketChange,
        )
    }
    val category = state.category
    if (state.pendingDeletion && category != null) {
        Confirmation(
            title = DetalleCategoriaMessages.DELETE_TITLE,
            message = DetalleCategoriaMessages.deletion(category),
            confirm = DetalleCategoriaMessages.DELETE,
            dismiss = DetalleCategoriaMessages.CANCEL,
            onConfirm = { scope.launch { viewModel.confirmDeletion() } },
            onDismiss = viewModel::cancelDeletion,
        )
    }
    if (state.pendingPatternDeletion != null) {
        Confirmation(
            title = DetalleCategoriaMessages.DELETE_PATTERN_TITLE,
            message = DetalleCategoriaMessages.DELETE_PATTERN_MESSAGE,
            confirm = DetalleCategoriaMessages.DELETE,
            dismiss = DetalleCategoriaMessages.CANCEL,
            onConfirm = { scope.launch { viewModel.confirmPatternDeletion() } },
            onDismiss = viewModel::cancelPatternDeletion,
        )
    }
    if (state.pendingDiscard) {
        Confirmation(
            title = DetalleCategoriaMessages.DISCARD_TITLE,
            message = DetalleCategoriaMessages.DISCARD_MESSAGE,
            confirm = DetalleCategoriaMessages.DISCARD,
            dismiss = DetalleCategoriaMessages.KEEP_EDITING,
            onConfirm = {
                viewModel.discardChanges()
                onDiscarded()
            },
            onDismiss = viewModel::cancelDiscard,
        )
    }
}

@Composable
private fun Confirmation(
    title: String,
    message: String,
    confirm: String,
    dismiss: String,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
    destructive: Boolean = true,
) {
    val colors = MirachTheme.colors.base
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(title) },
        text = { Text(message) },
        confirmButton = {
            Button(
                onClick = onConfirm,
                colors = if (destructive) {
                    ButtonDefaults.buttonColors(containerColor = colors.destructive, contentColor = colors.primaryForeground)
                } else {
                    ButtonDefaults.buttonColors()
                },
            ) { Text(confirm) }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text(dismiss) } },
    )
}
