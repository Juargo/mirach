package app.mirachbudget.android.features.shell

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import app.mirachbudget.android.core.design.MirachTheme

/** One tab of the signed-in area: a stable [id] (saved across rotation), its [label] and its screen. */
class ShellTab(val id: String, val label: String, val content: @Composable () -> Unit)

/**
 * The signed-in area: the current tab's screen above a bottom navigation bar. Adding a tab (Subir
 * and Categorías arrive later) is one more [ShellTab] in the list the caller passes.
 */
@Composable
fun SignedInShell(tabs: List<ShellTab>, modifier: Modifier = Modifier) {
    var selectedId by rememberSaveable { mutableStateOf(tabs.first().id) }
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
                        onClick = { selectedId = tab.id },
                        // No icon set is bundled yet: the label carries the tab.
                        icon = {},
                        label = { Text(tab.label) },
                        alwaysShowLabel = true,
                        colors = NavigationBarItemDefaults.colors(
                            selectedTextColor = colors.foreground,
                            unselectedTextColor = colors.mutedForeground,
                            indicatorColor = colors.muted,
                        ),
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) { selected.content() }
    }
}
