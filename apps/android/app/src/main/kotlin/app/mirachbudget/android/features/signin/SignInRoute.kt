package app.mirachbudget.android.features.signin

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import kotlinx.coroutines.launch

/** Connects the view model to the stateless screen; [googleWebClientId] is the WEB-type OAuth client. */
@Composable
fun SignInRoute(viewModel: SignInViewModel, googleWebClientId: String, notice: String? = null) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val scope = rememberCoroutineScope()
    val activity = LocalContext.current
    var retry by remember { mutableIntStateOf(0) }
    // `start()` is a no-op once the providers are known (rotation); "Reintentar" bumps [retry] to reload.
    LaunchedEffect(viewModel) { viewModel.start() }
    LaunchedEffect(retry) { if (retry > 0) viewModel.loadProviders() }
    SignInScreen(
        state = state,
        notice = notice,
        onRetry = { retry++ },
        onGoogle = {
            scope.launch { viewModel.signInWithGoogle(CredentialManagerGoogleSignIn(activity, googleWebClientId)) }
        },
        onPassword = { email, password -> scope.launch { viewModel.signInWithPassword(email, password) } },
    )
}
