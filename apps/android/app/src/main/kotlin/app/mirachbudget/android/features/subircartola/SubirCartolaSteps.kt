package app.mirachbudget.android.features.subircartola

import android.text.format.Formatter
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.networking.CartolaPreview
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.CatalogState
import app.mirachbudget.android.features.resumen.card
import app.mirachbudget.android.features.resumen.isLargeText
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel.Step

/** Every step but the review, which has its own lazy list. */
@Composable
internal fun StepContent(viewModel: SubirCartolaViewModel, state: SubirCartolaViewModel.State, actions: StepActions) {
    when (val step = state.step) {
        Step.Preparando -> Progress(null)
        is Step.Consentimiento -> Consent(step, actions)
        is Step.Inicial -> Initial(step.message, actions)
        Step.Previsualizando -> Progress(SubirCartolaMessages.PREVIEWING)
        is Step.Protegido -> PasswordPrompt(step, actions)
        is Step.ErrorPrevia -> {
            StatusMessage(SubirCartolaMessages.previewFailure(step.failure), isError = true)
            PrimaryButton(SubirCartolaMessages.RETRY) { actions.call { it.retryPreview() } }
            SecondaryButton(SubirCartolaMessages.CHOOSE_OTHER, onClick = actions.pickFile)
        }
        is Step.Decidiendo -> Deciding(step.preview, state, actions)
        // Drawn by `ReviewScreen`, outside this scrolling column.
        is Step.Revisando -> Unit
        Step.Subiendo -> Progress(SubirCartolaMessages.UPLOADING)
        is Step.ErrorImportacion -> {
            StatusMessage(SubirCartolaMessages.importFailure(step.failure), isError = true)
            if (step.failure.isRetryable) PrimaryButton(SubirCartolaMessages.RETRY) { actions.call { it.retryImport() } }
            if (step.canReturnToReview) SecondaryButton(SubirCartolaMessages.BACK_TO_REVIEW, onClick = viewModel::backToReview)
            SecondaryButton(SubirCartolaMessages.START_OVER, onClick = viewModel::discard)
        }
        is Step.Exito -> Success(step.summary, actions, onAnother = viewModel::discard)
    }
}

// --- building blocks

@Composable
internal fun PrimaryButton(text: String, enabled: Boolean = true, busy: Boolean = false, onClick: () -> Unit) {
    Button(onClick = onClick, enabled = enabled && !busy, modifier = Modifier.fillMaxWidth()) {
        if (busy) CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp) else Text(text)
    }
}

@Composable
internal fun SecondaryButton(text: String, enabled: Boolean = true, onClick: () -> Unit) {
    OutlinedButton(onClick = onClick, enabled = enabled, modifier = Modifier.fillMaxWidth()) { Text(text) }
}

/** A spinner with what is happening; [text] `null` while there is nothing to say yet. */
@Composable
private fun Progress(text: String?) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        text?.let { Text(it, color = MirachTheme.colors.base.mutedForeground) }
    }
}

/** A live region announces the message without moving focus. */
@Composable
internal fun StatusMessage(text: String, isError: Boolean, modifier: Modifier = Modifier) {
    Text(
        text,
        color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.base.foreground,
        modifier = modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
    )
}

// --- consent (PRI-02, Figma 16 node 114:442)

@Composable
private fun Consent(step: Step.Consentimiento, actions: StepActions) {
    if (step.dismissed) {
        StatusMessage(SubirCartolaMessages.CONSENT_DISMISSED, isError = false)
        PrimaryButton(SubirCartolaMessages.CONSENT_REOPEN) { actions.call { it.showConsent() } }
        return
    }
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(
            SubirCartolaMessages.CONSENT_TITLE,
            style = MaterialTheme.typography.headlineSmall,
            color = MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth().semantics { heading() },
        )
        Text(
            SubirCartolaMessages.CONSENT_BODY,
            color = MirachTheme.colors.base.mutedForeground,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
    Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(6.dp)) {
        Text(
            SubirCartolaMessages.CONSENT_LIST_HEADER,
            style = MaterialTheme.typography.titleSmall,
            color = MirachTheme.colors.base.cardForeground,
            modifier = Modifier.semantics { heading() },
        )
        SubirCartolaMessages.CONSENT_ITEMS.forEach {
            Text(it, style = MaterialTheme.typography.bodyMedium, color = MirachTheme.colors.base.mutedForeground)
        }
    }
    if (step.failed) StatusMessage(SubirCartolaMessages.CONSENT_ACCEPT_FAILED, isError = true)
    PrimaryButton(SubirCartolaMessages.CONSENT_ACCEPT, busy = step.isAccepting) { actions.call { it.acceptConsent() } }
    SecondaryButton(SubirCartolaMessages.CONSENT_DECLINE, enabled = !step.isAccepting) {
        actions.call { it.declineConsent() }
    }
}

// --- choosing a file

@Composable
private fun Initial(message: String?, actions: StepActions) {
    message?.let { StatusMessage(it, isError = true) }
    Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text(
            SubirCartolaMessages.INITIAL_TITLE,
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.semantics { heading() },
        )
        Text(SubirCartolaMessages.INITIAL_FORMATS, color = MirachTheme.colors.base.mutedForeground)
        Text(SubirCartolaMessages.INITIAL_PREVIEW_FIRST, color = MirachTheme.colors.base.mutedForeground)
    }
    // PRI-03: no bank passwords, the file is deleted after reading it.
    Text(SubirCartolaMessages.INITIAL_PRIVACY, style = MaterialTheme.typography.bodyMedium, color = MirachTheme.colors.base.foreground)
    PrimaryButton(SubirCartolaMessages.CHOOSE_FILE, onClick = actions.pickFile)
}

/**
 * The protected-PDF step. The text lives only in this composable's memory until sent, then in the
 * view model's; never in saved instance state, which may be written to disk. Every attempt passes
 * through «Generando vista previa…», so the field comes back empty after a wrong one.
 */
@Composable
private fun PasswordPrompt(step: Step.Protegido, actions: StepActions) {
    var password by remember { mutableStateOf("") }
    val focus = remember { FocusRequester() }
    val send = {
        if (password.isNotEmpty()) {
            val text = password
            password = ""
            actions.call { it.submitPassword(text) }
        }
    }
    LaunchedEffect(step) { focus.requestFocus() }

    Text(step.filename, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
    StatusMessage(SubirCartolaMessages.passwordPrompt(step.incorrect), isError = step.incorrect)
    // Hidden; no autocorrect, capitals or suggestions: it is a bank password.
    OutlinedTextField(
        value = password,
        onValueChange = { password = it },
        label = { Text(SubirCartolaMessages.PASSWORD_FIELD) },
        singleLine = true,
        visualTransformation = PasswordVisualTransformation(),
        keyboardOptions = KeyboardOptions(
            capitalization = KeyboardCapitalization.None,
            autoCorrectEnabled = false,
            keyboardType = KeyboardType.Password,
            imeAction = ImeAction.Go,
        ),
        keyboardActions = KeyboardActions(onGo = { send() }),
        modifier = Modifier.fillMaxWidth().focusRequester(focus),
    )
    PrimaryButton(SubirCartolaMessages.RETRY, enabled = password.isNotEmpty(), onClick = send)
    SecondaryButton(SubirCartolaMessages.CHOOSE_OTHER, onClick = actions.pickFile)
}

// --- deciding

@Composable
private fun Deciding(preview: CartolaPreview, state: SubirCartolaViewModel.State, actions: StepActions) {
    val context = LocalContext.current
    state.stagedFile?.let { file ->
        Text(
            SubirCartolaDisplay.fileLine(file.filename, Formatter.formatShortFileSize(context, file.byteCount)),
            style = MaterialTheme.typography.bodySmall,
            color = MirachTheme.colors.base.mutedForeground,
        )
    }
    Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(preview.banco, style = MaterialTheme.typography.titleMedium, color = MirachTheme.colors.base.cardForeground)
            Text(
                SubirCartolaMessages.account(preview.tipoCuenta, preview.numeroCuenta),
                style = MaterialTheme.typography.bodyMedium,
                color = MirachTheme.colors.base.mutedForeground,
            )
        }
        Counters(preview)
    }
    Text(SubirCartolaMessages.NOTHING_SAVED_YET, color = MirachTheme.colors.base.mutedForeground)
    PrimaryButton(SubirCartolaMessages.UPLOAD_AS_IS) { actions.call { it.uploadAsIs() } }
    // «Revisar y editar» needs the catalog; if it could not load, the rest still works and this says why.
    SecondaryButton(SubirCartolaMessages.REVIEW_AND_EDIT, enabled = state.loadedCatalog != null) {
        actions.call { it.startReview() }
    }
    when (state.catalog) {
        is CatalogState.Loaded -> Unit
        CatalogState.Loading ->
            Text(SubirCartolaMessages.LOADING_CATEGORIES, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
        CatalogState.Failed -> {
            Text(
                SubirCartolaMessages.CATALOG_FAILED_DECIDING,
                style = MaterialTheme.typography.bodySmall,
                color = MirachTheme.colors.feedback.errorText,
            )
            SecondaryButton(SubirCartolaMessages.RETRY) { actions.call { it.retryCatalog() } }
        }
    }
    SecondaryButton(SubirCartolaMessages.DISCARD, onClick = actions.confirmDiscard)
}

/** Three counters; at large text sizes they stack so no figure is cut. */
@Composable
private fun Counters(preview: CartolaPreview) {
    val items = listOf(
        SubirCartolaMessages.TOTAL_ROWS to preview.totalFilas,
        SubirCartolaMessages.DUPLICATES to preview.duplicados,
        SubirCartolaMessages.NEW_ROWS to preview.nuevas,
    )
    val counter: @Composable (String, Int) -> Unit = { label, value ->
        Column(Modifier.semantics(mergeDescendants = true) {}, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
            Text(
                value.toString(),
                style = MaterialTheme.typography.titleLarge.mirachFigures(),
                fontWeight = FontWeight.Bold,
                color = MirachTheme.colors.base.cardForeground,
            )
        }
    }
    if (isLargeText()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) { items.forEach { (l, v) -> counter(l, v) } }
    } else {
        Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) { items.forEach { (l, v) -> counter(l, v) } }
    }
}

// --- success

@Composable
private fun Success(summary: SubirCartolaViewModel.ImportSummary, actions: StepActions, onAnother: () -> Unit) {
    Column(
        Modifier.semantics(mergeDescendants = true) { liveRegion = LiveRegionMode.Polite },
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        // Decoration: the headline says it all.
        Text(
            "✓",
            style = MaterialTheme.typography.displaySmall,
            color = MirachTheme.colors.feedback.successText,
            modifier = Modifier.clearAndSetSemantics {},
        )
        Text(
            SubirCartolaMessages.headline(summary),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = MirachTheme.colors.base.foreground,
        )
        SubirCartolaMessages.duplicatesLine(summary)?.let { Text(it, color = MirachTheme.colors.base.mutedForeground) }
    }
    PrimaryButton(SubirCartolaMessages.SHOW_SUMMARY, onClick = actions.showResumen)
    SecondaryButton(SubirCartolaMessages.UPLOAD_ANOTHER, onClick = onAnother)
}
