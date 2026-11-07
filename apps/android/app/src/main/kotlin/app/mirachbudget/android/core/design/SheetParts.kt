package app.mirachbudget.android.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.features.resumen.fill
import app.mirachbudget.android.features.resumen.label

// Sheet and form pieces shared by the upload review, the bucket detail and the categories screens.

/** The bucket color is a fill; the name next to it is the real label. */
@Composable
internal fun Swatch(bucket: Bucket) {
    Box(Modifier.size(14.dp).background(MirachTheme.colors.bucket.fill(bucket)))
}

@Composable
internal fun SheetBar(title: String, leading: String, onLeading: () -> Unit, trailing: @Composable () -> Unit = {}) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onLeading) { Text(leading) }
        Text(
            title,
            style = MaterialTheme.typography.titleMedium,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

@Composable
internal fun SheetRow(onClick: () -> Unit, selected: Boolean? = null, content: @Composable RowScope.() -> Unit) {
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    Row(
        (if (selected != null) base.selectable(selected = selected, onClick = onClick, role = Role.Button) else base.clickable(onClick = onClick, role = Role.Button))
            .padding(horizontal = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
internal fun FormHeader(text: String) {
    Text(
        text,
        style = MaterialTheme.typography.labelLarge,
        color = MirachTheme.colors.base.mutedForeground,
        modifier = Modifier.padding(top = 8.dp).semantics { heading() },
    )
}

@Composable
internal fun Footer(text: String) {
    Text(text, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
}

@Composable
internal fun FieldError(text: String?) {
    text?.let {
        Text(
            it,
            style = MaterialTheme.typography.bodySmall,
            color = MirachTheme.colors.feedback.errorText,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/** Three labeled options, one per row, with a check on the chosen one (not color alone). */
@Composable
internal fun BucketChoice(selection: Bucket?, onSelect: (Bucket) -> Unit) {
    Column(Modifier.fillMaxWidth().background(MirachTheme.colors.base.card)) {
        Bucket.entries.forEach { option ->
            val selected = selection == option
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 48.dp)
                    .selectable(selected = selected, onClick = { onSelect(option) }, role = Role.RadioButton)
                    .padding(horizontal = 12.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                Swatch(option)
                Text(option.label, maxLines = 1, color = MirachTheme.colors.base.cardForeground, modifier = Modifier.weight(1f))
                if (selected) Text("✓", color = MirachTheme.colors.base.cardForeground, modifier = Modifier.clearAndSetSemantics {})
            }
        }
    }
}
