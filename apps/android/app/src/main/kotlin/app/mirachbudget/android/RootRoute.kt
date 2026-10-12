package app.mirachbudget.android

import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.features.session.ConnectionFailedScreen
import app.mirachbudget.android.features.session.ValidatingScreen
import app.mirachbudget.android.features.resumen.ResumenRoute
import app.mirachbudget.android.features.resumen.ResumenViewModel
import app.mirachbudget.android.features.signin.SignInRoute
import app.mirachbudget.android.features.signin.SignInViewModel
import app.mirachbudget.android.features.version.ApiVersionState
import app.mirachbudget.android.features.version.ApiVersionViewModel
import app.mirachbudget.android.features.version.ConfigurationErrorScreen

/** The single place that turns "who is signed in" into a screen. */
@Composable
fun RootRoute(dependencies: AppEnvironment.Dependencies) {
    if (dependencies.configurationProblem != null) {
        ConfigurationErrorScreen()
        return
    }
    val session = dependencies.session
    val phase by session.phase.collectAsStateWithLifecycle()
    var retry by remember { mutableIntStateOf(0) }
    // Both calls are no-ops unless the phase asks for them, so recreating the activity
    // (rotation, theme) never re-validates; "Reintentar" bumps the counter to call session.retry().
    LaunchedEffect(Unit) { session.start() }
    LaunchedEffect(retry) { if (retry > 0) session.retry() }

    when (phase) {
        Phase.Validating -> ValidatingScreen()
        Phase.SignedOut -> {
            val viewModel = viewModel<SignInViewModel>(
                factory = viewModelFactory {
                    initializer {
                        SignInViewModel(dependencies.api, session, googleConfigured = dependencies.googleWebClientId.isNotBlank())
                    }
                },
            )
            SignInRoute(viewModel, dependencies.googleWebClientId)
        }
        is Phase.SignedIn -> {
            val versionViewModel = viewModel<ApiVersionViewModel>(
                factory = viewModelFactory { initializer { ApiVersionViewModel(dependencies.api) } },
            )
            val version by versionViewModel.state.collectAsStateWithLifecycle()
            LaunchedEffect(versionViewModel) { versionViewModel.load() }
            // Keyed by person, so signing in as someone else never shows the previous Resumen.
            val resumenViewModel = viewModel<ResumenViewModel>(
                key = "resumen-${(phase as Phase.SignedIn).userId}",
                factory = viewModelFactory { initializer { ResumenViewModel(dependencies.api) } },
            )
            ResumenRoute(
                viewModel = resumenViewModel,
                version = (version as? ApiVersionState.Loaded)?.info,
                onSignOut = session::signOut,
            )
        }
        Phase.ConnectionFailed -> ConnectionFailedScreen(onRetry = { retry++ })
        Phase.Misconfigured -> ConfigurationErrorScreen()
    }
}
