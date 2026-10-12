package app.mirachbudget.android.features.signin

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachTheme

/** Stateless sign-in screen (catalog: `inicio-de-sesion.md`); copy identical to the iPhone app. */
@Composable
fun SignInScreen(
    state: SignInUiState,
    /** Why the person is here when it is not their own doing, e.g. «Tu cuenta y tus datos se eliminaron». */
    notice: String?,
    onRetry: () -> Unit,
    onGoogle: () -> Unit,
    onPassword: (email: String, password: String) -> Unit,
    modifier: Modifier = Modifier,
) {
    Column(
        modifier = modifier.fillMaxSize().imePadding().verticalScroll(rememberScrollState()).padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(24.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("Mirach", style = MaterialTheme.typography.headlineLarge, color = MirachTheme.colors.base.foreground)
        Text(
            "Inicia sesión para ver tus finanzas.",
            style = MaterialTheme.typography.bodyLarge,
            color = MirachTheme.colors.base.mutedForeground,
        )
        notice?.let {
            Text(
                it,
                style = MaterialTheme.typography.bodyMedium,
                color = MirachTheme.colors.feedback.successText,
                textAlign = TextAlign.Center,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
            )
        }
        when (val phase = state.phase) {
            SignInViewModel.Phase.LoadingProviders -> Loading("Cargando…")
            SignInViewModel.Phase.NoProviders -> RetryBlock("El inicio de sesión no está disponible por ahora", onRetry)
            is SignInViewModel.Phase.ProvidersFailed -> RetryBlock(phase.message, onRetry)
            SignInViewModel.Phase.Ready, SignInViewModel.Phase.Authenticating -> {
                val busy = phase == SignInViewModel.Phase.Authenticating
                Column(verticalArrangement = Arrangement.spacedBy(16.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    if (state.googleAvailable) {
                        Button(onClick = onGoogle, enabled = !busy, modifier = Modifier.fillMaxWidth()) {
                            Text("Continuar con Google")
                        }
                    }
                    if (state.passwordAvailable) PasswordSignInForm(busy = busy, onSubmit = onPassword)
                    if (busy) Loading("Iniciando sesión…")
                    state.errorMessage?.let {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            color = MirachTheme.colors.feedback.errorText,
                            textAlign = TextAlign.Center,
                        )
                    }
                }
            }
        }
    }
}

/** The App Review form (ADR-051) behind a quiet toggle so Google stays the primary path. */
@Composable
private fun PasswordSignInForm(busy: Boolean, onSubmit: (String, String) -> Unit) {
    var open by rememberSaveable { mutableStateOf(false) }
    var email by rememberSaveable { mutableStateOf("") }
    // Plain remember: a saved password would land in the plaintext saved-instance Bundle.
    var password by remember { mutableStateOf("") }
    val canSubmit = !busy && email.isNotBlank() && password.isNotEmpty()

    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        OutlinedButton(onClick = { open = !open }, modifier = Modifier.fillMaxWidth()) {
            Text(if (open) "Ocultar acceso con correo" else "Acceso con correo")
        }
        if (open) {
            OutlinedTextField(
                value = email,
                onValueChange = { email = it },
                label = { Text("Correo") },
                singleLine = true,
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
                modifier = Modifier.fillMaxWidth(),
            )
            OutlinedTextField(
                value = password,
                onValueChange = { password = it },
                label = { Text("Contraseña") },
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
                modifier = Modifier.fillMaxWidth(),
            )
            // The fields stay filled on failure; a success replaces this screen.
            Button(onClick = { onSubmit(email, password) }, enabled = canSubmit, modifier = Modifier.fillMaxWidth()) {
                Text("Ingresar")
            }
        }
    }
}

@Composable
private fun Loading(message: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Text(message, color = MirachTheme.colors.base.mutedForeground, textAlign = TextAlign.Center)
    }
}

@Composable
private fun RetryBlock(message: String, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, textAlign = TextAlign.Center, color = MirachTheme.colors.base.foreground)
        Button(onClick = onRetry) { Text("Reintentar") }
    }
}
