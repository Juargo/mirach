package app.mirachbudget.android.features.subircartola

import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CenterAlignedTopAppBar
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.design.MirachSecondaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.staging.CartolaFileRules
import app.mirachbudget.android.core.staging.ContentResolverCartolaSource
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasMessages
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasScreen
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * "Subir cartola": one screen that changes with the view model's step (port of iOS
 * `SubirCartolaView.swift`). [onShowResumen] is «Ver resumen del mes»: the shell selects the Resumen tab.
 *
 * «Cartolas subidas» opens over this tab, with no navigation library: back returns here. It is
 * offered only when [cartolasSubidasViewModel] is given; it builds the screen's view model, which
 * calls the `onChange` it receives after a deletion. [onCartolaDeleted] is that `onChange`.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SubirCartolaRoute(
    viewModel: SubirCartolaViewModel,
    onShowResumen: () -> Unit,
    modifier: Modifier = Modifier,
    cartolasSubidasViewModel: ((onChange: () -> Unit) -> CartolasSubidasViewModel)? = null,
    onCartolaDeleted: () -> Unit = {},
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // Uploads outlive the tab: leaving it mid-commit must not cancel the request.
    val scope = viewModel.viewModelScope
    val resolver = LocalContext.current.contentResolver
    var confirmingDiscard by rememberSaveable { mutableStateOf(false) }
    // `start` only acts on `Preparando` or the idle initial screen, so running it again after a
    // rotation or a tab switch costs at most one consent check and brings back a revoked consent.
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

    // One id per opening, kept across rotation: each opening gets a fresh list, as on iOS, and an
    // id never names another opening's view model (nor another person's after signing in again).
    var cartolasOpening by rememberSaveable { mutableStateOf<String?>(null) }
    val currentOnCartolaDeleted by rememberUpdatedState(onCartolaDeleted)
    val opening = cartolasOpening
    if (opening != null && cartolasSubidasViewModel != null) {
        val cartolasViewModel = viewModel<CartolasSubidasViewModel>(
            key = "cartolas-subidas-$opening",
            factory = viewModelFactory { initializer { cartolasSubidasViewModel { currentOnCartolaDeleted() } } },
        )
        CartolasSubidasScreen(cartolasViewModel, onBack = { cartolasOpening = null }, modifier = modifier)
        return
    }
    val openCartolas = cartolasSubidasViewModel?.let { { cartolasOpening = UUID.randomUUID().toString() } }
    // A file shared while another statement is in progress (or refused during the consent) is announced once.
    val snackbarHostState = remember { SnackbarHostState() }
    val sharedFileNotice = state.sharedFileNotice
    LaunchedEffect(sharedFileNotice) {
        // Dismissed only after it was shown: clearing it first changes the key and cancels the snackbar.
        if (sharedFileNotice != null) {
            snackbarHostState.showSnackbar(sharedFileNotice)
            viewModel.dismissSharedFileNotice()
        }
    }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            CenterAlignedTopAppBar(
                title = { Text(SubirCartolaMessages.TITLE, style = MirachTextStyles.cuerpoDestacado, maxLines = 1, overflow = TextOverflow.Ellipsis) },
                // In the bar, not under «Confirmar»: it frees room for rows and is hard to hit by accident.
                actions = {
                    if (reviewing != null) {
                        TextButton(
                            onClick = { confirmingDiscard = true },
                            colors = ButtonDefaults.textButtonColors(contentColor = MirachTheme.colors.feedback.errorText),
                        ) { Text(SubirCartolaMessages.DISCARD, style = MirachTextStyles.boton) }
                    }
                },
                colors = TopAppBarDefaults.centerAlignedTopAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
        snackbarHost = { SnackbarHost(snackbarHostState) },
        bottomBar = { if (reviewing != null) ReviewActions(state, onConfirm = { actions.call { it.confirm() } }) },
    ) { padding ->
        if (reviewing != null) {
            // Its own lazy list: a statement can have hundreds of rows.
            ReviewScreen(viewModel, state, reviewing.preview, actions, Modifier.padding(padding).fillMaxSize())
        } else {
            Column(
                Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState())
                    .padding(horizontal = MirachSpacing.l, vertical = MirachSpacing.m),
                verticalArrangement = Arrangement.spacedBy(MirachSpacing.m),
            ) {
                StepContent(viewModel, state, actions)
                // The way to the imports already made, to check or undo one (iOS shows it in the same two steps).
                if (openCartolas != null && (state.step is Step.Inicial || state.step is Step.Exito)) CartolasSubidasLink(openCartolas)
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

/** «Cartolas subidas», styled as a secondary action with a chevron. */
@Composable
private fun CartolasSubidasLink(onClick: () -> Unit) {
    MirachSecondaryButton(onClick = onClick) {
        Row(Modifier.fillMaxWidth()) {
            Text(CartolasSubidasMessages.TITLE)
            Spacer(Modifier.weight(1f))
            Text("›", modifier = Modifier.clearAndSetSemantics {})
        }
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
        title = { Text(SubirCartolaMessages.DISCARD_TITLE, style = MirachTextStyles.cuerpoDestacado) },
        text = { Text(SubirCartolaMessages.DISCARD_MESSAGE, style = MirachTextStyles.cuerpo) },
        confirmButton = {
            Button(
                onClick = onDiscard,
                shape = RectangleShape,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MirachTheme.colors.base.destructive,
                    contentColor = MirachTheme.colors.base.primaryForeground,
                ),
            ) { Text(SubirCartolaMessages.DISCARD, style = MirachTextStyles.boton) }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(SubirCartolaMessages.DISCARD_CANCEL, style = MirachTextStyles.boton) } },
    )
}
