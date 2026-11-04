package app.mirachbudget.android.features.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import app.mirachbudget.android.core.design.MirachTheme

/** One tab of the signed-in area: a stable [id] (saved across rotation), its [label] and its screen. */
class ShellTab(val id: String, val label: String, val content: @Composable () -> Unit)

/**
 * The signed-in area: the current tab's screen above a bottom navigation bar. Adding a tab
 * (Categorías arrives later) is one more [ShellTab] in the list the caller passes. The caller owns
 * the selection, so a screen can switch tabs (e.g. "Ver resumen del mes" after an import).
 */
@Composable
fun SignedInShell(tabs: List<ShellTab>, selectedId: String, onSelect: (String) -> Unit, modifier: Modifier = Modifier) {
    val selected = tabs.firstOrNull { it.id == selectedId } ?: tabs.first()
    val colors = MirachTheme.colors.base
    Scaffold(
        modifier = modifier,
        containerColor = colors.background,
        bottomBar = {
            NavigationBar(containerColor = colors.card) {
                tabs.forEach { tab ->
                    NavigationBarItem(
                        selected = tab == selected,
                        onClick = { onSelect(tab.id) },
                        // No icon set is bundled yet: the label carries the tab.
                        icon = {},
                        label = { Text(tab.label) },
                        alwaysShowLabel = true,
                        colors = NavigationBarItemDefaults.colors(
                            selectedTextColor = colors.foreground,
                            unselectedTextColor = colors.mutedForeground,
                            indicatorColor = colors.accent,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) { selected.content() }
    }
}
