package app.mirachbudget.android.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ProvideTextStyle
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
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
    Row(Modifier.fillMaxWidth().padding(horizontal = MirachSpacing.s), verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = onLeading) { Text(leading, style = MirachTextStyles.boton) }
        Text(
            title,
            style = MirachTextStyles.cuerpoDestacado,
            color = MirachTheme.colors.base.foreground,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

/** A list row in Figma's «Fila de ajuste» shape: 48dp touch target, a 1dp rule under it. */
@Composable
internal fun SheetRow(onClick: () -> Unit, selected: Boolean? = null, content: @Composable RowScope.() -> Unit) {
    val base = Modifier.fillMaxWidth().heightIn(min = 48.dp)
    Column {
        Row(
            (if (selected != null) base.selectable(selected = selected, onClick = onClick, role = Role.Button) else base.clickable(onClick = onClick, role = Role.Button))
                .padding(horizontal = MirachSpacing.m),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            ProvideTextStyle(MirachTextStyles.cuerpo) { content() }
        }
        HorizontalDivider(Modifier.padding(horizontal = MirachSpacing.m), color = MirachTheme.colors.base.border)
    }
}

@Composable
internal fun FormHeader(text: String) {
    Text(
        text,
        style = MirachTextStyles.etiqueta,
        color = MirachTheme.colors.base.mutedForeground,
        modifier = Modifier.padding(top = MirachSpacing.s).semantics { heading() },
    )
}

@Composable
internal fun Footer(text: String) {
    Text(text, style = MirachTextStyles.etiqueta, color = MirachTheme.colors.base.mutedForeground)
}

@Composable
internal fun FieldError(text: String?) {
    text?.let {
        Text(
            it,
            style = MirachTextStyles.etiqueta,
            color = MirachTheme.colors.feedback.errorText,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
        )
    }
}

/**
 * Figma's «Selector segmentado»: the three buckets side by side in a square 1dp frame in `input`. The
 * chosen one is filled in `primary` with `primaryForeground` text, so it never rests on color alone,
 * and is announced as selected.
 */
@Composable
internal fun BucketChoice(selection: Bucket?, onSelect: (Bucket) -> Unit) {
    val colors = MirachTheme.colors.base
    Row(Modifier.fillMaxWidth().border(1.dp, colors.input).selectableGroup()) {
        Bucket.entries.forEach { option ->
            val selected = selection == option
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = 48.dp)
                    .background(if (selected) colors.primary else Color.Transparent)
                    .selectable(selected = selected, onClick = { onSelect(option) }, role = Role.RadioButton)
                    .padding(horizontal = MirachSpacing.xs),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    option.label,
                    style = MirachTextStyles.cuerpoDestacado,
                    textAlign = TextAlign.Center,
                    color = if (selected) colors.primaryForeground else colors.foreground,
                )
            }
        }
    }
}
