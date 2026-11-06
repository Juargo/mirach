package app.mirachbudget.android.features.cartolassubidas

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import app.mirachbudget.android.core.design.MirachTheme
import app.mirachbudget.android.core.networking.CartolaSubida
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Content
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel.Message
import app.mirachbudget.android.features.resumen.card
import kotlinx.coroutines.launch

/** What TalkBack reads on the bar's back arrow. Assumed: iOS uses the system back button, which has no copy of its own. */
private const val BACK_LABEL = "Volver"

/**
 * "Cartolas subidas": the user's imports, newest first, and deleting one at a time (port of iOS
 * `CartolasSubidasView`). [onBack] returns to Subir; the empty list's «Subir cartola» does the same,
 * since Subir is where this screen was opened from.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartolasSubidasScreen(viewModel: CartolasSubidasViewModel, onBack: () -> Unit, modifier: Modifier = Modifier) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    // A deletion outlives the screen: going back mid-request must not cancel it (or its `onChange`).
    val scope = viewModel.viewModelScope
    BackHandler(onBack = onBack)
    // Runs again on every appearance; once loaded it does nothing, so the list is not blanked.
    LaunchedEffect(viewModel) { viewModel.loadIfNeeded() }

    Scaffold(
        modifier = modifier,
        containerColor = MirachTheme.colors.base.background,
        topBar = {
            TopAppBar(
                title = { Text(CartolasSubidasMessages.TITLE) },
                navigationIcon = {
                    IconButton(onClick = onBack, modifier = Modifier.semantics { contentDescription = BACK_LABEL }) {
                        Text("←", style = MaterialTheme.typography.headlineSmall, modifier = Modifier.clearAndSetSemantics {})
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MirachTheme.colors.base.background,
                    titleContentColor = MirachTheme.colors.base.foreground,
                    navigationIconContentColor = MirachTheme.colors.base.foreground,
                ),
            )
        },
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = state.isRefreshing,
            onRefresh = { scope.launch { viewModel.refresh() } },
            modifier = Modifier.padding(padding).fillMaxSize(),
        ) {
            LazyColumn(
                Modifier.fillMaxSize(),
                contentPadding = PaddingValues(16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                when (val content = state.content) {
                    Content.Loading -> item { Loading() }
                    is Content.Failed -> item {
                        LoadError(content.failure, onRetry = { scope.launch { viewModel.retry() } })
                    }
                    is Content.Loaded -> {
                        state.message?.let { message -> item { Notice(message.text, isError = message != Message.Deleted) } }
                        state.refreshNotice?.let { text -> item { Notice(text, isError = true) } }
                        if (content.cartolas.isEmpty()) {
                            item { Empty(onUpload = onBack) }
                        } else {
                            items(content.cartolas, key = { it.id }) { cartola ->
                                CartolaRow(
                                    cartola = cartola,
                                    isDeleting = cartola.id in state.deleting,
                                    onDelete = { viewModel.requestDeletion(cartola) },
                                )
                            }
                        }
                    }
                }
            }
        }
    }

    state.pendingDeletion?.let { cartola ->
        DeleteDialog(
            cartola = cartola,
            onDelete = { scope.launch { viewModel.confirmDeletion(cartola) } },
            onCancel = viewModel::cancelDeletion,
        )
    }
}

@Composable
private fun Loading() {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp).semantics(mergeDescendants = true) {},
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        CircularProgressIndicator()
        Text(CartolasSubidasMessages.LOADING, color = MirachTheme.colors.base.mutedForeground)
    }
}

@Composable
private fun LoadError(failure: CartolasSubidasViewModel.Failure, onRetry: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 48.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(CartolasSubidasMessages.loadFailure(failure), color = MirachTheme.colors.feedback.errorText, textAlign = TextAlign.Center)
        Button(onClick = onRetry) { Text(CartolasSubidasMessages.RETRY) }
    }
}

@Composable
private fun Empty(onUpload: () -> Unit) {
    Column(
        Modifier.fillMaxWidth().padding(top = 32.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(CartolasSubidasMessages.EMPTY, color = MirachTheme.colors.base.mutedForeground, textAlign = TextAlign.Center)
        Button(onClick = onUpload) { Text(CartolasSubidasMessages.UPLOAD) }
    }
}

/** The result of a deletion or a failed refresh. A live region announces it without moving focus. */
@Composable
private fun Notice(text: String, isError: Boolean) {
    Text(
        (if (isError) "⚠ " else "✓ ") + text,
        color = if (isError) MirachTheme.colors.feedback.errorText else MirachTheme.colors.feedback.successText,
        modifier = Modifier.fillMaxWidth().clearAndSetSemantics {
            contentDescription = text
            liveRegion = LiveRegionMode.Polite
        },
    )
}

@Composable
private fun CartolaRow(cartola: CartolaSubida, isDeleting: Boolean, onDelete: () -> Unit) {
    Column(Modifier.card(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(
            Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = CartolasSubidasMessages.rowLabel(cartola) },
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(CartolasSubidasMessages.banco(cartola), style = MaterialTheme.typography.titleMedium, color = MirachTheme.colors.base.foreground)
            Text(
                cartola.nombreArchivo,
                style = MaterialTheme.typography.bodyMedium,
                maxLines = 1,
                overflow = TextOverflow.MiddleEllipsis,
                color = MirachTheme.colors.base.mutedForeground,
            )
            Text(CartolasSubidasMessages.dateAndCount(cartola), style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.mutedForeground)
            Status(cartola)
            CartolasSubidasMessages.motivo(cartola)?.let {
                Text(it, style = MaterialTheme.typography.bodySmall, color = MirachTheme.colors.base.foreground)
            }
        }
        if (isDeleting) {
            Row(
                Modifier.heightIn(min = 48.dp).semantics(mergeDescendants = true) {},
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                CircularProgressIndicator(Modifier.size(20.dp), strokeWidth = 2.dp)
                Text(CartolasSubidasMessages.DELETING, color = MirachTheme.colors.base.mutedForeground)
            }
        } else {
            TextButton(
                onClick = onDelete,
                colors = ButtonDefaults.textButtonColors(contentColor = MirachTheme.colors.feedback.errorText),
                modifier = Modifier.semantics { contentDescription = CartolasSubidasMessages.deleteLabel(cartola) },
            ) { Text(CartolasSubidasMessages.DELETE) }
        }
    }
}

/** A word and a symbol, so the status never rests on colour alone. */
@Composable
private fun Status(cartola: CartolaSubida) {
    val ok = cartola.estado == CartolaSubida.Estado.Procesada
    Text(
        (if (ok) "✓ " else "⚠ ") + CartolasSubidasMessages.estado(cartola),
        style = MaterialTheme.typography.bodySmall,
        fontWeight = FontWeight.SemiBold,
        color = if (ok) MirachTheme.colors.feedback.successText else MirachTheme.colors.feedback.errorText,
    )
}

/** Two explicit options; the message names what will be lost. */
@Composable
private fun DeleteDialog(cartola: CartolaSubida, onDelete: () -> Unit, onCancel: () -> Unit) {
    AlertDialog(
        onDismissRequest = onCancel,
        title = { Text(CartolasSubidasMessages.DELETE_TITLE) },
        text = { Text(CartolasSubidasMessages.confirmation(cartola)) },
        confirmButton = {
            Button(
                onClick = onDelete,
                colors = ButtonDefaults.buttonColors(
                    containerColor = MirachTheme.colors.base.destructive,
                    contentColor = MirachTheme.colors.base.primaryForeground,
                ),
            ) { Text(CartolasSubidasMessages.DELETE) }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(CartolasSubidasMessages.CANCEL) } },
    )
}
