package app.mirachbudget.android.features.perfil

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.DialogProperties
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.mirachbudget.android.core.design.DialogDestructiveButton
import app.mirachbudget.android.core.design.DialogTextButton
import app.mirachbudget.android.core.design.MirachAlertDialog
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachSecondaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextField
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.features.perfil.PerfilViewModel.DeleteState
import app.mirachbudget.android.features.perfil.PerfilViewModel.LoadState
import app.mirachbudget.android.features.perfil.PerfilViewModel.RevokeState
import app.mirachbudget.android.features.perfil.PerfilViewModel.SaveState
import app.mirachbudget.android.features.categorias.CenteredMessage
import app.mirachbudget.android.features.categorias.Loading
import kotlinx.coroutines.launch

/** "Perfil": edit the name, see the email, revoke the statement consent, sign out, delete the account. */
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
            // Figma's «Ajustes» heading: «Título», left-aligned, on the tab's root.
            Text(
                "Perfil",
                style = MirachTextStyles.titulo,
                color = MirachTheme.colors.base.foreground,
                modifier = Modifier
                    .fillMaxWidth()
                    .windowInsetsPadding(TopAppBarDefaults.windowInsets)
                    .padding(horizontal = MirachSpacing.l, vertical = MirachSpacing.m)
                    .semantics { heading() },
            )
        },
    ) { padding ->
        Column(
            Modifier.padding(padding).fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = MirachSpacing.l, vertical = MirachSpacing.m),
            verticalArrangement = Arrangement.spacedBy(MirachSpacing.l),
        ) {
            when (val load = state.load) {
                LoadState.Loading -> Loading("Cargando tu perfil…")
                is LoadState.Failed -> CenteredMessage(PerfilMessages.load(load.failure), "Reintentar", onAction = { scope.launch { viewModel.load() } })
                LoadState.Loaded -> {
                    NameSection(
                        state = state,
                        onChange = viewModel::onNombreChange,
                        onSave = { scope.launch { viewModel.save() } },
                    )
                    state.email?.let { EmailSection(it) }
                    // Hidden while the status is unknown (loading, or its request failed).
                    state.cartolasConsent?.let { inForce ->
                        ConsentSection(state = state, inForce = inForce, onRevoke = viewModel::askRevokeConsent)
                    }
                    SessionSection(
                        state = state,
                        onSignOut = { scope.launch { viewModel.signOut() } },
                        onDelete = { confirmingDeletion = true },
                    )
                }
            }
        }
    }

    if (state.isConfirmingRevocation) {
        RevokeConsentDialog(
            onConfirm = { scope.launch { viewModel.revokeConsent() } },
            onDismiss = viewModel::cancelRevokeConsent,
        )
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
private fun NameSection(state: PerfilViewModel.State, onChange: (String) -> Unit, onSave: () -> Unit) {
    val saving = state.save == SaveState.Saving
    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
        MirachTextField(
            value = state.nombre,
            onValueChange = { onChange(it.filterNot { c -> c == '\n' || c == '\r' }) },
            label = "Nombre",
            enabled = !state.isBusyWithSession,
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { if (state.canSave) onSave() }),
        )
        MirachPrimaryButton("Guardar", onClick = onSave, enabled = state.canSave, busy = saving)
        // A live region announces the result without moving focus.
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            when (val save = state.save) {
                is SaveState.Failed -> Text(PerfilMessages.save(save.failure), style = MirachTextStyles.cuerpo, color = MirachTheme.colors.feedback.errorText)
                SaveState.Saved -> if (!state.hasNameChanges) Text(PerfilMessages.SAVED, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.feedback.successText)
                else -> Unit
            }
        }
    }
}

@Composable
private fun EmailSection(email: String) {
    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.xs)) {
        Text("Correo", style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.mutedForeground)
        // Read only. It may be Apple's private relay address.
        Text(email, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.base.foreground)
    }
}

@Composable
private fun ConsentSection(state: PerfilViewModel.State, inForce: Boolean, onRevoke: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
        Text(PerfilMessages.CONSENT_TITLE, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.mutedForeground)
        Text(PerfilMessages.consentText(inForce), style = MirachTextStyles.cuerpo, color = MirachTheme.colors.base.foreground)
        if (inForce) {
            MirachSecondaryButton(PerfilMessages.REVOKE_BUTTON, onClick = onRevoke, enabled = state.canRevoke)
        }
        // A live region announces the result without moving focus.
        Column(Modifier.semantics { liveRegion = LiveRegionMode.Polite }) {
            when (val revoke = state.revoke) {
                RevokeState.Revoked -> Text(PerfilMessages.REVOKED, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.feedback.successText)
                is RevokeState.Failed -> Text(PerfilMessages.revoke(revoke.failure), style = MirachTextStyles.cuerpo, color = MirachTheme.colors.feedback.errorText)
                else -> Unit
            }
        }
    }
}

/** Only "Revocar" sends the revocation. */
@Composable
private fun RevokeConsentDialog(onConfirm: () -> Unit, onDismiss: () -> Unit) {
    MirachAlertDialog(
        onDismissRequest = onDismiss,
        title = PerfilMessages.REVOKE_CONFIRM_TITLE,
        text = { Text(PerfilMessages.REVOKE_CONFIRM_BODY) },
        confirmButton = { DialogTextButton(PerfilMessages.REVOKE_CONFIRM, onConfirm, contentColor = MirachTheme.colors.feedback.errorText) },
        dismissButton = { DialogTextButton(PerfilMessages.CANCEL, onDismiss) },
    )
}

@Composable
private fun SessionSection(state: PerfilViewModel.State, onSignOut: () -> Unit, onDelete: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.s)) {
        HorizontalDivider(color = MirachTheme.colors.base.border, modifier = Modifier.padding(bottom = MirachSpacing.s))
        MirachSecondaryButton(
            if (state.isSigningOut) "Cerrando sesión…" else "Cerrar sesión",
            onClick = onSignOut,
            enabled = !state.isBusyWithSession,
        )
        // Easy to find, as Google Play requires, and clearly separate from signing out.
        MirachSecondaryButton(onClick = onDelete, enabled = !state.isBusyWithSession) {
            Text("Eliminar cuenta", color = MirachTheme.colors.feedback.errorText)
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
    MirachAlertDialog(
        // Once the request is out there is no going back.
        onDismissRequest = { if (!deleting) onDismiss() },
        properties = DialogProperties(dismissOnBackPress = !deleting, dismissOnClickOutside = !deleting),
        title = "Esta acción no se puede deshacer",
        text = {
            Column(Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                Text("Se eliminarán tu cuenta, tus cartolas, tus movimientos, tus categorías y tus patrones. No podrás recuperarlos.")
                Text(
                    "Para confirmar, escribe ${PerfilViewModel.CONFIRMATION_WORD}.",
                    color = MirachTheme.colors.base.mutedForeground,
                )
                // No autocorrect or capitals: the word must be typed exactly.
                MirachTextField(
                    value = state.deleteConfirmation,
                    onValueChange = onConfirmationChange,
                    label = PerfilViewModel.CONFIRMATION_WORD,
                    enabled = !deleting,
                    keyboardOptions = KeyboardOptions(
                        capitalization = KeyboardCapitalization.None,
                        autoCorrectEnabled = false,
                        keyboardType = KeyboardType.Ascii,
                        imeAction = ImeAction.Done,
                    ),
                )
                (state.delete as? DeleteState.Failed)?.let {
                    Text(
                        PerfilMessages.delete(it.failure),
                        style = MirachTextStyles.cuerpo,
                        color = MirachTheme.colors.feedback.errorText,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
        },
        confirmButton = {
            DialogDestructiveButton(if (deleting) "Eliminando cuenta…" else "Eliminar definitivamente", onConfirm, enabled = state.canDelete)
        },
        dismissButton = { DialogTextButton("Cancelar", onDismiss, enabled = !deleting) },
    )
}
