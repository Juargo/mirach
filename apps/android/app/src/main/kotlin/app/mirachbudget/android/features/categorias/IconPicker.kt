package app.mirachbudget.android.features.categorias

import androidx.annotation.DrawableRes
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.mirachbudget.android.core.design.CategoryIcon
import app.mirachbudget.android.core.design.MirachTheme

/**
 * The allowed icons as a grid (port of iOS `IconPicker`). The chosen one carries a check and a
 * border, so it never rests on color alone, and every cell has its own spoken name. «Sin ícono» is
 * offered while the category has none ([allowsNone]): the API cannot clear an icon, so replacing is
 * possible and removing is not.
 */
@Composable
internal fun IconPicker(selection: String?, allowsNone: Boolean, enabled: Boolean = true, onSelect: (String?) -> Unit) {
    FlowRow(
        Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        if (allowsNone) IconCell(null, CategoryIcon.generic, CategoriasMessages.NO_ICON, selection == null, enabled, onSelect)
        CategoryIcon.options.forEach { option ->
            IconCell(option.value, option.drawable, option.label, selection == option.value, enabled, onSelect)
        }
    }
}

@Composable
private fun IconCell(value: String?, @DrawableRes drawable: Int, label: String, selected: Boolean, enabled: Boolean, onSelect: (String?) -> Unit) {
    val colors = MirachTheme.colors.base
    val shape = RoundedCornerShape(8.dp)
    Box(
        Modifier
            .size(56.dp)
            .clip(shape)
            .background(if (selected) colors.accent else colors.card)
            .border(if (selected) 2.dp else 1.dp, if (selected) colors.foreground else colors.border, shape)
            .selectable(selected = selected, enabled = enabled, role = Role.RadioButton, onClick = { onSelect(value) })
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            painterResource(drawable),
            contentDescription = null,
            tint = if (selected) colors.accentForeground else colors.foreground,
            modifier = Modifier.size(24.dp),
        )
        if (selected) {
            Text(
                "✓",
                style = MaterialTheme.typography.labelSmall,
                color = colors.foreground,
                modifier = Modifier.align(Alignment.TopEnd).padding(4.dp).clearAndSetSemantics {},
            )
        }
    }
}
