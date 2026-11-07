package app.mirachbudget.android.features.resumen

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
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
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.design.mirachFigures
import app.mirachbudget.android.core.networking.Bucket
import app.mirachbudget.android.core.networking.Periodo
import app.mirachbudget.android.core.networking.VersionInfo
import app.mirachbudget.android.features.detallebucket.DetalleBucketOpening
import app.mirachbudget.android.features.detallebucket.DetalleBucketScreen
import app.mirachbudget.android.features.detallebucket.DetalleBucketViewModel
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * The Resumen del mes tab. "Cerrar sesión" lives in Perfil. `/version` stays as a discreet footnote.
 * [onUploadStatement] is the empty month's "Subir cartola" (it opens the Subir tab).
 * [detalleBucketViewModel] builds the bucket detail for a bucket and month, given what to run after
 * a reclassification; with it, tapping a bucket opens its movements for the month on screen, in
 * place of the Resumen, and back returns here. `null` leaves the rows plain. [onOpenCategory] is
 * handed to the detail's category headers.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ResumenRoute(
    viewModel: ResumenViewModel,
    version: VersionInfo?,
    onUploadStatement: () -> Unit,
    modifier: Modifier = Modifier,
    detalleBucketViewModel: ((Bucket, Periodo, onReclassified: () -> Unit) -> DetalleBucketViewModel)? = null,
    onOpenCategory: ((String) -> Unit)? = null,
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val periodos by viewModel.periodos.collectAsStateWithLifecycle()
    val refreshing by viewModel.refreshing.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    // Leaving the screen cancels the load; coming back finishes it, and a month on screen is kept.
    LaunchedEffect(viewModel) { viewModel.start() }

    // One opening per tap, kept across rotation: each gets a fresh detail, as Cartolas subidas does.
    var bucketOpening by rememberSaveable { mutableStateOf<String?>(null) }
    val opening = bucketOpening?.let(DetalleBucketOpening::restore)
    if (opening != null && detalleBucketViewModel != null) {
        val detailViewModel = viewModel<DetalleBucketViewModel>(
            key = "detalle-bucket-${opening.id}",
            factory = viewModelFactory {
                initializer {
                    // A move changes this month's figures too: repeat the query for the month on screen.
                    // Run in the Resumen's own scope, so it finishes even if the detail closes first.
                    detalleBucketViewModel(opening.bucket, opening.periodo) { viewModel.viewModelScope.launch { viewModel.refresh() } }
                }
            },
        )
        DetalleBucketScreen(detailViewModel, onBack = { bucketOpening = null }, modifier = modifier, onOpenCategory = onOpenCategory)
        return
    }
    val openBucket = detalleBucketViewModel?.let {
        { bucket: Bucket, periodo: Periodo -> bucketOpening = DetalleBucketOpening(bucket, periodo, UUID.randomUUID().toString()).saved }
    }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text("Resumen") },
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
                    onUploadStatement = onUploadStatement,
                    onOpenBucket = openBucket,
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
    onUploadStatement: () -> Unit,
    onOpenBucket: ((Bucket, Periodo) -> Unit)? = null,
) {
    when (state) {
        ResumenViewModel.State.Loading -> LoadingBlock()
        is ResumenViewModel.State.Failed -> ErrorBlock(state.failure, onRetry)
        is ResumenViewModel.State.Loaded -> {
            MonthSelector(state.mes.periodo, anterior, siguiente, onSelect)
            if (state.mes.sinIngreso) EmptyMonth(onUpload = onUploadStatement) else ResumenContent(state.mes, onOpenBucket = onOpenBucket?.let { open -> { bucket -> open(bucket, state.mes.periodo) } })
        }
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
