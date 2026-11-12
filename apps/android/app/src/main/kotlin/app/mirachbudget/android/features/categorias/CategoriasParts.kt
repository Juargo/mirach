package app.mirachbudget.android.features.categorias

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.MirachPrimaryButton
import app.mirachbudget.android.core.design.MirachSpacing
import app.mirachbudget.android.core.design.MirachTextStyles
import app.mirachbudget.android.core.design.MirachTheme

// Pieces both screens of the feature use: the loading and error states, the notices.

@Composable
internal fun Loading(text: String) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(text, style = MirachTextStyles.cuerpo, color = MirachTheme.colors.base.mutedForeground)
    }
}

/** A centered message with one action: a load error with «Reintentar», or the gone state. */
@Composable
internal fun CenteredMessage(text: String, action: String, onAction: () -> Unit, isError: Boolean = true) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp, start = MirachSpacing.m, end = MirachSpacing.m),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text,
            style = if (isError) MirachTextStyles.cuerpo else MirachTextStyles.cuerpoDestacado,
            color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
        )
        MirachPrimaryButton(action, onAction)
    }
}

/** The result of a write or a failed refresh. A live region announces it without moving focus. */
@Composable
internal fun Notice(text: String, isError: Boolean, modifier: Modifier = Modifier) {
    Text(
        (if (isError) "⚠ " else "✓ ") + text,
        style = MirachTextStyles.cuerpo,
        color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.feedback.successText,
        modifier = modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = text
            liveRegion = LiveRegionMode.Polite
        },
    )
}
