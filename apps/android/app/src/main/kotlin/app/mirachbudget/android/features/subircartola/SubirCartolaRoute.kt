package app.mirachbudget.android.features.subircartola

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.staging.CartolaFileRules
import app.mirachbudget.android.core.staging.ContentResolverCartolaSource
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import kotlinx.coroutines.launch

/**
 * "Subir cartola": one screen that changes with the view model's step (port of iOS
 * `SubirCartolaView.swift`). [onShowResumen] is «Ver resumen del mes»: the shell selects the Resumen tab.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubirCartolaRoute(viewModel: SubirCartolaViewModel, onShowResumen: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Uploads outlive the tab: leaving it mid-commit must not cancel the request.
    val scope = viewModel.viewModelScope
    val resolver = LocalContext.current.contentResolver
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    // `start` only acts on `Preparando`, so running it again after a rotation or a tab switch is harmless.
    LaunchedEffect(viewModel) { viewModel.start() }

    // The system picker, limited to the two formats the API reads. A cancelled pick returns null.
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        if (uri != null) scope.launch { viewModel.chooseFile(ContentResolverCartolaSource(resolver, uri)) }
    }
    val actions = StepActions(
        pickFile = { picker.launch(CartolaFileRules.PICKER_MIME_TYPES) },
        call = { action -> scope.launch { action(viewModel) } },
        confirmDiscard = { confirmingDiscard = true },
        showResumen = onShowResumen,
    )
    val reviewing = state.step as? Step.Revisando

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text(SubirCartolaMessages.TITLE) },
                // In the bar, not under «Confirmar»: it frees room for rows and is hard to hit by accident.
                actions = {
                    if (reviewing != null) {
                        TextButton(
                            onClick = { confirmingDiscard = true },
                            colors = ButtonDefaults.textButtonColors(contentColor = MirachTheme.colors.feedback.errorText),
                        ) { Text(SubirCartolaMessages.DISCARD) }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
        bottomBar = { if (reviewing != null) ReviewActions(state, onConfirm = { actions.call { it.confirm() } }) },
    ) { padding ->
        if (reviewing != null) {
            // Its own lazy list: a statement can have hundreds of rows.
            ReviewScreen(viewModel, state, reviewing.preview, actions, Modifier.padding(padding).fillMaxSize())
        } else {
            Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                StepContent(viewModel, state, actions)
            }
        }
    }

    if (confirmingDiscard) {
        DiscardDialog(
            onDiscard = {
                confirmingDiscard = false
                viewModel.discard()
            },
            onCancel = { confirmingDiscard = false },
        )
    }
}

/** What the steps can ask of the route; [call] launches a view model call that outlives the tab. */
internal class StepActions(
    val pickFile: () -> Unit,
    val call: (suspend (SubirCartolaViewModel) -> Unit) -> Unit,
    val confirmDiscard: () -> Unit,
    val showResumen: () -> Unit,
)

/** Two explicit options: discarding loses the review, nothing was saved. */
@Composable
private fun DiscardDialog(onDiscard: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(SubirCartolaMessages.DISCARD_TITLE) },
        text = { Text(SubirCartolaMessages.DISCARD_MESSAGE) },
        confirmButton = {
            Button(
                onClick = onDiscard,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MirachTheme.colors.base.destructive,
                    contentColor = MirachTheme.colors.base.primaryForeground,
                ),
            ) { Text(SubirCartolaMessages.DISCARD) }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(SubirCartolaMessages.DISCARD_CANCEL) } },
    )
}
