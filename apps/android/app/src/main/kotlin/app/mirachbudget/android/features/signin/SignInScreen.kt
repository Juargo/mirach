package app.mirachbudget.android.features.signin

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.R
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachSecondaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextField
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.networking.LegalDocuments

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
    // The form plus the keyboard can exceed a small screen: scroll, and keep the buttons at the bottom otherwise.
    BoxWithConstraints(modifier = modifier.fillMaxSize().imePadding()) {
        val screenHeight = maxHeight
        Column(
            modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = screenHeight).padding(MirachSpacing.l),
            verticalArrangement = Arrangement.SpaceBetween,
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            Column(
                modifier = Modifier.padding(top = 96.dp),
                verticalArrangement = Arrangement.spacedBy(MirachSpacing.m),
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                BrandRing()
                Text("Mirach", style = MirachTextStyles.numeroGrande, color = MirachTheme.colors.base.foreground)
                Text(
                    "¿Estoy gastando bien? Te lo mostramos en un vistazo: necesidades, gustos y ahorro.",
                    style = MirachTextStyles.cuerpo,
                    color = MirachTheme.colors.base.mutedForeground,
                    textAlign = TextAlign.Center,
                )
                notice?.let {
                    Text(
                        it,
                        style = MirachTextStyles.cuerpo,
                        color = MirachTheme.colors.feedback.successText,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                    )
                }
            }
            when (val phase = state.phase) {
                SignInViewModel.Phase.LoadingProviders -> Loading("Cargando…")
                SignInViewModel.Phase.NoProviders -> RetryBlock("El inicio de sesión no está disponible por ahora", onRetry)
                is SignInViewModel.Phase.ProvidersFailed -> RetryBlock(phase.message, onRetry)
                SignInViewModel.Phase.Ready, SignInViewModel.Phase.Authenticating -> {
                    val busy = phase == SignInViewModel.Phase.Authenticating
                    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.s), horizontalAlignment = Alignment.CenterHorizontally) {
                        state.errorMessage?.let { ErrorBlock(it, state.errorDetail) }
                        if (busy) Loading("Iniciando sesión…")
                        if (state.googleAvailable) {
                            MirachSecondaryButton(onClick = onGoogle, enabled = !busy) {
                                // Google's "G" before the text, as its branding guidelines require. The text
                                // names the provider, so the mark has no description for TalkBack.
                                Image(
                                    painter = painterResource(R.drawable.google_logo),
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp),
                                )
                                Spacer(Modifier.width(MirachSpacing.s))
                                Text("Continuar con Google")
                            }
                        }
                        if (state.passwordAvailable) PasswordSignInForm(busy = busy, onSubmit = onPassword)
                        LegalNotice()
                    }
                }
            }
        }
    }
}

@Composable
private fun ErrorBlock(message: String, detail: String?) {
    if (detail == null) {
        Text(
            message,
            style = MirachTextStyles.cuerpo,
            color = MirachTheme.colors.feedback.errorText,
            textAlign = TextAlign.Center,
        )
        return
    }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .background(MirachTheme.colors.base.card)
            .padding(MirachSpacing.m)
            .semantics { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Text(message, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.foreground)
        Text(detail, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
private fun LegalNotice() {
    val linkStyle = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline))
    Text(
        buildAnnotatedString {
            append("Al continuar aceptas los ")
            withLink(LinkAnnotation.Url(LegalDocuments.TERMINOS_URL, linkStyle)) { append("Términos") }
            append(" y la ")
            withLink(LinkAnnotation.Url(LegalDocuments.PRIVACIDAD_URL, linkStyle)) { append("Política de privacidad") }
            append(". No pedimos claves de tu banco.")
        },
        style = MirachTextStyles.mini,
        color = MirachTheme.colors.base.mutedForeground,
        textAlign = TextAlign.Center,
        modifier = Modifier.padding(top = MirachSpacing.s),
    )
}

/** The 50/30/20 mark of the welcome screen. Decorative: the text next to it carries the meaning. */
@Composable
private fun BrandRing() {
    val bucket = MirachTheme.colors.bucket
    val segments = listOf(
        Triple(-90f, 180f, bucket.necesidades),
        Triple(90f, 108f, bucket.gustos),
        Triple(198f, 72f, bucket.ahorro),
    )
    Canvas(modifier = Modifier.size(140.dp)) {
        val width = 20.dp.toPx()
        val inset = Offset(width / 2, width / 2)
        val arcSize = Size(size.width - width, size.height - width)
        segments.forEach { (start, sweep, color) ->
            drawArc(color, start + 1.5f, sweep - 3f, useCenter = false, topLeft = inset, size = arcSize, style = Stroke(width))
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

    Column(verticalArrangement = Arrangement.spacedBy(MirachSpacing.s), horizontalAlignment = Alignment.CenterHorizontally) {
        MirachSecondaryButton(if (open) "Ocultar acceso con correo" else "Acceso con correo", onClick = { open = !open })
        if (open) {
            MirachTextField(
                value = email,
                onValueChange = { email = it },
                label = "Correo",
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email),
            )
            MirachTextField(
                value = password,
                onValueChange = { password = it },
                label = "Contraseña",
                visualTransformation = PasswordVisualTransformation(),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            )
            // The fields stay filled on failure; a success replaces this screen.
            MirachPrimaryButton("Ingresar", onClick = { onSubmit(email, password) }, enabled = canSubmit)
        }
    }
}

@Composable
private fun Loading(message: String) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        CircularProgressIndicator()
        Text(message, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.base.mutedForeground, textAlign = TextAlign.Center)
    }
}

@Composable
private fun RetryBlock(message: String, onRetry: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), horizontalAlignment = Alignment.CenterHorizontally) {
        Text(message, style = MirachTextStyles.cuerpo, textAlign = TextAlign.Center, color = MirachTheme.colors.base.foreground)
        MirachPrimaryButton("Reintentar", onClick = onRetry)
    }
}
