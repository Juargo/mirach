package app.mirachbudget.android.features.categorias

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetValue
import androidx.compose.material3.Text
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
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.core.design.FieldError
import app.mirachbudget.android.core.design.FormHeader
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachSecondaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextField
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.SheetBar
import app.mirachbudget.android.core.networking.CategoriaCatalogo
import app.mirachbudget.android.core.networking.VistaPreviaPatron
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternConflict
import app.mirachbudget.android.features.categorias.DetalleCategoriaViewModel.PatternSheet
import app.mirachbudget.android.features.subircartola.StatusMessage
import kotlinx.coroutines.launch

/**
 * The sheet for a new pattern or the edit of one (Figma 28 and 30, port of iOS `PatternSheet`). A
 * new pattern is always «contains» (CLA-14): while typing, it shows what the text would move and
 * offers to move it too (CLA-15); a text of another category offers to move that pattern here
 * (CLA-17). Editing changes only the text.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun PatternSheet(viewModel: DetalleCategoriaViewModel, state: DetalleCategoriaViewModel.State, sheet: PatternSheet, here: CategoriaCatalogo) {
    val scope = viewModel.viewModelScope
    val saving by rememberUpdatedState(state.isSavingPattern)
    var text by rememberSaveable(sheet) { mutableStateOf((sheet as? PatternSheet.Editing)?.pattern?.patron.orEmpty()) }
    // Keyed by the text: every keystroke cancels the previous wait (the debounce).
    LaunchedEffect(text) { viewModel.previewPattern(text) }

    ModalBottomSheet(
        onDismissRequest = viewModel::dismissPatternSheet,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true, confirmValueChange = { it != SheetValue.Hidden || !saving }),
        containerColor = MirachTheme.colors.base.background,
    ) {
        val title = if (sheet is PatternSheet.Editing) DetalleCategoriaMessages.EDIT_PATTERN else DetalleCategoriaMessages.NEW_PATTERN
        SheetBar(title, DetalleCategoriaMessages.CANCEL, onLeading = viewModel::dismissPatternSheet)
        Column(
            Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(MirachSpacing.m).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(MirachSpacing.s),
        ) {
            FormHeader(DetalleCategoriaMessages.PATTERN_TEXT)
            MirachTextField(
                value = text,
                onValueChange = { text = it.filterNot { c -> c == '\n' || c == '\r' } },
                label = DetalleCategoriaMessages.PATTERN_TEXT,
                isError = state.patternErrors.pattern != null,
                keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.None, autoCorrectEnabled = false, imeAction = ImeAction.Done),
            )
            FieldError(state.patternErrors.pattern)

            val conflict = state.patternConflict
            val preview = state.patternPreview
            when {
                conflict != null -> Conflict(conflict, here)
                preview != null -> Preview(preview, here, offersMove = state.offersMoveMatches, moveMatches = state.moveMatches, onMoveMatches = viewModel::setMoveMatches)
            }

            state.patternErrors.general?.let { StatusMessage(it, isError = true) }

            Column(Modifier.padding(top = MirachSpacing.s), verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
                when {
                    state.isSavingPattern -> Saving()
                    conflict != null -> {
                        MirachPrimaryButton(DetalleCategoriaMessages.moveHere(here), onClick = { scope.launch { viewModel.movePatternHere() } })
                        MirachSecondaryButton(DetalleCategoriaMessages.CANCEL, onClick = viewModel::dismissPatternSheet)
                    }
                    else -> MirachPrimaryButton(DetalleCategoriaMessages.SAVE_PATTERN, onClick = { scope.launch { viewModel.savePattern(text) } }, enabled = text.isNotBlank())
                }
            }
        }
    }
}

/** Figma's «Aviso» in its note form: a `card` panel, 16dp padding, 6dp between its «Etiqueta» lines. */
@Composable
private fun NotePanel(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Column(
        modifier.fillMaxWidth().background(MirachTheme.colors.base.card).padding(MirachSpacing.m),
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) { content() }
}

/** Screen 30: the text already lives in another category. */
@Composable
private fun Conflict(conflict: PatternConflict, here: CategoriaCatalogo) {
    val colors = MirachTheme.colors.base
    NotePanel(Modifier.semantics(mergeDescendants = true) {}) {
        Text(DetalleCategoriaMessages.conflictTitle(conflict), style = MirachTextStyles.etiqueta, color = colors.cardForeground)
        Text(DetalleCategoriaMessages.CONFLICT_RULE, style = MirachTextStyles.etiqueta, color = colors.mutedForeground)
        Text(DetalleCategoriaMessages.conflictConsequence(conflict, here), style = MirachTextStyles.etiqueta, color = colors.mutedForeground)
    }
}

/** Screen 28: what the text would move in the month the API answered, and the offer to move it. */
@Composable
private fun Preview(preview: VistaPreviaPatron, here: CategoriaCatalogo, offersMove: Boolean, moveMatches: Boolean, onMoveMatches: (Boolean) -> Unit) {
    val colors = MirachTheme.colors.base
    NotePanel {
        Text(
            DetalleCategoriaMessages.previewTitle(preview.total, preview.periodo),
            style = MirachTextStyles.etiqueta,
            color = colors.cardForeground,
            modifier = Modifier.semantics { heading() },
        )
        preview.coincidencias.forEach { row ->
            Text(
                DetalleCategoriaMessages.previewRow(row),
                style = MirachTextStyles.etiqueta,
                color = colors.mutedForeground,
                modifier = Modifier.clearAndSetSemantics { contentDescription = DetalleCategoriaMessages.previewRowLabel(row) },
            )
        }
    }
    if (!offersMove) return
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 48.dp)
            .toggleable(value = moveMatches, role = Role.Checkbox, onValueChange = onMoveMatches),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Checkbox(
            checked = moveMatches,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(checkedColor = colors.primary, checkmarkColor = colors.primaryForeground, uncheckedColor = colors.input),
        )
        Column(Modifier.weight(1f).padding(top = 12.dp), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(DetalleCategoriaMessages.moveMatchesTitle(preview.total, here.nombre), style = MirachTextStyles.cuerpo, color = colors.foreground)
            Text(DetalleCategoriaMessages.MOVE_MATCHES_NOTE, style = MirachTextStyles.etiqueta, color = colors.mutedForeground)
        }
    }
}

@Composable
internal fun Saving() {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 48.dp).semantics(mergeDescendants = true) { contentDescription = DetalleCategoriaMessages.SAVING },
        horizontalArrangement = Arrangement.Center,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        CircularProgressIndicator()
    }
}
