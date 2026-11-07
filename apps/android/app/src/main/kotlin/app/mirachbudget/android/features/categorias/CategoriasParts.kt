package app.mirachbudget.android.features.categorias

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarColors
import androidx.compose.material3.TopAppBarDefaults
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
import app.mirachbudget.android.core.design.MirachTheme

// Pieces both screens of the feature use: the bar, the loading and error states, the notices.

/** What TalkBack reads on the bar's back arrow (iOS uses the system back button, which has no copy of its own). */
private const val BACK_LABEL = "Volver"

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun barColors(): TopAppBarColors = TopAppBarDefaults.topAppBarColors(
    containerColor = MirachTheme.colors.base.background,
    titleContentColor = MirachTheme.colors.base.foreground,
    navigationIconContentColor = MirachTheme.colors.base.foreground,
    actionIconContentColor = MirachTheme.colors.base.foreground,
)

@Composable
internal fun BackArrow(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = BACK_LABEL }) {
        Text("←", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clearAndSetSemantics {})
    }
}

@Composable
internal fun Loading(text: String) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(text, color = MirachTheme.colors.base.mutedForeground)
    }
}

/** A centered message with one action: a load error with «Reintentar», or the gone state. */
@Composable
internal fun CenteredMessage(text: String, action: String, onAction: () -> Unit, isError: Boolean = true) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp, start = 16.dp, end = 16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text,
            style = if (isError) MaterialTheme.typography.bodyLarge else MaterialTheme.typography.titleMedium,
            color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
        )
        Button(onClick = onAction) { Text(action) }
    }
}

/** The result of a write or a failed refresh. A live region announces it without moving focus. */
@Composable
internal fun Notice(text: String, isError: Boolean, modifier: Modifier = Modifier) {
    Text(
        (if (isError) "⚠ " else "✓ ") + text,
        color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.feedback.successText,
        modifier = modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = text
            liveRegion = LiveRegionMode.Polite
        },
    )
}
