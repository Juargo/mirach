package app.mirachbudget.android.features.perfil

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.features.perfil.PerfilViewModel.DeleteState
import app.mirachbudget.android.features.perfil.PerfilViewModel.LoadState
import app.mirachbudget.android.features.perfil.PerfilViewModel.SaveState
import kotlinx.coroutines.launch

/** "Perfil": edit the name, see the email, sign out, delete the account. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PerfilRoute(viewModel: PerfilViewModel, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    var confirmingDeletion by rememberSaveable { mutableStateOf(false) }
    // Runs on entering the tab, cancelled when it goes away; a loaded profile refreshes quietly.
    LaunchedEffect(viewModel) { viewModel.load() }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text("Perfil") },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(24.dp),
        ) {
            when (val load = state.load) {
                LoadState.Loading -> Loading()
                is LoadState.Failed -> LoadError(PerfilMessages.load(load.failure)) { scope.launch { viewModel.load() } }
                LoadState.Loaded -> {
                    NameSection(
                        state = state,
                        onChange = viewModel::onNombreChange,
                        onSave = { scope.launch { viewModel.save() } },
                    )
                    state.email?.let { EmailSection(it) }
                    SessionSection(
                        state = state,
                        onSignOut = { scope.launch { viewModel.signOut() } },
                        onDelete = { confirmingDeletion = true },
                    )
                }
            }
        }
    }

    if (confirmingDeletion) {
        DeleteAccountDialog(
            state = state,
            onConfirmationChange = viewModel::onDeleteConfirmationChange,
            onConfirm = { scope.launch { viewModel.deleteAccount() } },
            onDismiss = {
                confirmingDeletion = false
                viewModel.resetDeletion()
            },
        )
    }
}

@Composable
private fun Loading() {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text("Cargando tu perfil…", color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
private fun LoadError(message: String, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(message, textAlign = TextAlign.Center, color = MirachTheme.colors.feedback.errorText)
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}

@Composable
private fun NameSection(state: PerfilViewModel.State, onChange: (String) -> Unit, onSave: () -> Unit) {
    val saving = state.save == SaveState.Saving
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        OutlinedTextField(
            value = state.nombre,
            onValueChange = { onChange(it.filterNot { c -> c == '\n' || c == '\r' }) },
            label = { Text("Nombre") },
            singleLine = true,
            enabled = !state.isBusyWithSession,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (state.canSave) onSave() }),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(onClick = onSave, enabled = state.canSave, modifier = Modifier.fillMaxWidth()) {
            if (saving) CircularProgressIndicator(Modifier.padding(2.dp), strokeWidth = 2.dp) else Text("Guardar")
        }
        // A live region announces the result without moving focus.
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            when (val save = state.save) {
                is SaveState.Failed -> Text(PerfilMessages.save(save.failure), color = MirachTheme.colors.feedback.errorText)
                SaveState.Saved -> if (!state.hasNameChanges) Text(PerfilMessages.SAVED, color = MirachTheme.colors.feedback.successText)
                else -> Unit
            }
        }
    }
}

@Composable
private fun EmailSection(email: String) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Correo", style = MaterialTheme.typography.labelMedium, color = MirachTheme.colors.base.mutedForeground)
        // Read only. It may be Apple's private relay address.
        Text(email, color = MirachTheme.colors.base.foreground)
    }
}

@Composable
private fun SessionSection(state: PerfilViewModel.State, onSignOut: () -> Unit, onDelete: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        HorizontalDivider(color = MirachTheme.colors.base.border)
        OutlinedButton(onClick = onSignOut, enabled = !state.isBusyWithSession, modifier = Modifier.fillMaxWidth()) {
            Text(if (state.isSigningOut) "Cerrando sesión…" else "Cerrar sesión")
        }
        // Easy to find, as Google Play requires, and clearly separate from signing out.
        OutlinedButton(
            onClick = onDelete,
            enabled = !state.isBusyWithSession,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = MirachTheme.colors.feedback.errorText),
            modifier = Modifier.fillMaxWidth(),
        ) {
            Text("Eliminar cuenta")
        }
    }
}

/** The irreversible step: the person types the word before the red button wakes up. */
@Composable
private fun DeleteAccountDialog(
    state: PerfilViewModel.State,
    onConfirmationChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit,
) {
    val deleting = state.delete == DeleteState.Deleting
    AlertDialog(
        // Once the request is out there is no going back.
        onDismissRequest = { if (!deleting) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !deleting, dismissOnClickOutside = !deleting),
        title = { Text("Esta acción no se puede deshacer") },
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Se eliminarán tu cuenta, tus cartolas, tus movimientos, tus categorías y tus patrones. No podrás recuperarlos.")
                Text(
                    "Para confirmar, escribe ${PerfilViewModel.CONFIRMATION_WORD}.",
                    color = MirachTheme.colors.base.mutedForeground,
                )
                // No autocorrect or capitals: the word must be typed exactly.
                OutlinedTextField(
                    value = state.deleteConfirmation,
                    onValueChange = onConfirmationChange,
                    placeholder = { Text(PerfilViewModel.CONFIRMATION_WORD) },
                    singleLine = true,
                    enabled = !deleting,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Done,
                    ),
                    modifier = Modifier.fillMaxWidth(),
                )
                (state.delete as? DeleteState.Failed)?.let {
                    Text(
                        PerfilMessages.delete(it.failure),
                        color = MirachTheme.colors.feedback.errorText,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = onConfirm,
                enabled = state.canDelete,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MirachTheme.colors.base.destructive,
                    contentColor = MirachTheme.colors.base.primaryForeground,
                ),
            ) {
                Text(if (deleting) "Eliminando cuenta…" else "Eliminar definitivamente")
            }
        },
        dismissButton = { TextButton(onClick = onDismiss, enabled = !deleting) { Text("Cancelar") } },
    )
}
