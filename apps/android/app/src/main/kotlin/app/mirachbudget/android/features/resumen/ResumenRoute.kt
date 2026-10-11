package app.mirachbudget.android.features.resumen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.VersionInfo
import kotlinx.coroutines.launch

/**
 * The signed-in home: the Resumen del mes under a top bar whose menu holds "Cerrar sesión" (the
 * tab bar arrives with the Subir and Perfil screens). `/version` stays as a discreet footnote.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResumenRoute(viewModel: ResumenViewModel, version: VersionInfo?, onSignOut: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val periodos by viewModel.periodos.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    // Leaving the screen cancels the load; coming back finishes it, and a month on screen is kept.
    LaunchedEffect(viewModel) { viewModel.start() }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text("Resumen") },
                actions = { AccountMenu(onSignOut) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
    ) { padding ->
        // `periodos` is read so the arrows recompose when the month list arrives.
        PullToRefreshBox(
            isRefreshing = refreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            Column(
                Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                ResumenScreen(
                    state = state,
                    anterior = viewModel.anterior.takeIf { periodos.isNotEmpty() },
                    siguiente = viewModel.siguiente.takeIf { periodos.isNotEmpty() },
                    onSelect = { scope.launch { viewModel.select(it) } },
                    onRetry = { scope.launch { viewModel.retry() } },
                )
                version?.let { VersionFootnote(it) }
            }
        }
    }
}

@Composable
fun ResumenScreen(
    state: ResumenViewModel.State,
    anterior: Periodo?,
    siguiente: Periodo?,
    onSelect: (Periodo) -> Unit,
    onRetry: () -> Unit,
) {
    when (state) {
        ResumenViewModel.State.Loading -> LoadingBlock()
        is ResumenViewModel.State.Failed -> ErrorBlock(state.failure, onRetry)
        is ResumenViewModel.State.Loaded -> {
            MonthSelector(state.mes.periodo, anterior, siguiente, onSelect)
            if (state.mes.sinIngreso) EmptyMonth() else ResumenContent(state.mes)
        }
    }
}

@Composable
private fun AccountMenu(onSignOut: () -> Unit) {
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "Menú de la cuenta" }) {
        Text("⋮", style = MaterialTheme.typography.titleLarge, color = MirachTheme.colors.base.foreground)
    }
    DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
        DropdownMenuItem(
            text = { Text("Cerrar sesión") },
            onClick = {
                open = false
                onSignOut()
            },
        )
    }
}

@Composable
private fun VersionFootnote(info: VersionInfo) {
    Text(
        "API ${info.version} · ${info.commit}",
        style = MaterialTheme.typography.bodySmall.mirachFigures(),
        color = MirachTheme.colors.base.mutedForeground,
        modifier = Modifier.fillMaxWidth(),
        textAlign = TextAlign.Center,
    )
}
