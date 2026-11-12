package app.mirachbudget.android.core.design

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp

/**
 * Aviso: an action strip. The message takes the free width and wraps; the action label sits at the
 * trailing edge; the whole strip is one button. [bordered] adds a 1dp inside border in `base.input`.
 * No icon and no red.
 */
@Composable
fun Aviso(message: String, action: String, onClick: () -> Unit, modifier: Modifier = Modifier, bordered: Boolean = false) {
    val colors = MirachTheme.colors.base
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .background(colors.card)
            .then(if (bordered) Modifier.border(1.dp, colors.input) else Modifier)
            .clickable(role = Role.Button, onClick = onClick)
            .padding(horizontal = MirachSpacing.m, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Text(message, style = MirachTextStyles.etiqueta, color = colors.foreground, modifier = Modifier.weight(1f))
        Text(action, style = MirachTextStyles.etiqueta, color = colors.foreground)
    }
}
