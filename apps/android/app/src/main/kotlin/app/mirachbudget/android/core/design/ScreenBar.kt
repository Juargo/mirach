package app.mirachbudget.android.core.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/** What TalkBack reads on the bar's back arrow (iOS uses the system back button, which has no copy of its own). */
private const val BACK_LABEL = "Volver"

/**
 * Figma's «Barra superior»: a 48dp leading slot (the back arrow, or empty on the tab's root), the title
 * centered in «Cuerpo destacado» on one line, and a trailing slot for the screen's action.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun ScreenBar(title: String, onBack: (() -> Unit)? = null, trailing: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth().windowInsetsPadding(TopAppBarDefaults.windowInsets).heightIn(min = 56.dp).padding(horizontal = MirachSpacing.s),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(Modifier.size(48.dp), contentAlignment = Alignment.Center) { if (onBack != null) BackArrow(onBack) }
        Text(
            title,
            style = MirachTextStyles.cuerpoDestacado,
            color = MirachTheme.colors.base.foreground,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        Box(Modifier.widthIn(min = 48.dp), contentAlignment = Alignment.Center) { trailing() }
    }
}

@Composable
private fun BackArrow(onClick: () -> Unit) {
    IconButton(onClick = onClick, modifier = Modifier.semantics { contentDescription = BACK_LABEL }) {
        Text("←", style = MirachTextStyles.cuerpoDestacado, color = MirachTheme.colors.base.foreground, modifier = Modifier.clearAndSetSemantics {})
    }
}
