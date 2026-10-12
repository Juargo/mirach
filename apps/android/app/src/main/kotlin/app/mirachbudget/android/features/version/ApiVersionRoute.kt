package app.mirachbudget.android.features.version

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

/** Connects the view model to the stateless screen. */
@Composable
fun ApiVersionRoute(viewModel: ApiVersionViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    // Runs when the screen appears and is cancelled when it leaves.
    LaunchedEffect(viewModel) { viewModel.load() }
    ApiVersionScreen(state = state, onRetry = { scope.launch { viewModel.retry() } })
}
