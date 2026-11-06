package app.mirachbudget.android

import android.net.Uri
import app.mirachbudget.android.core.staging.ContentResolverCartolaSource
import app.mirachbudget.android.features.cartolassubidas.CartolasSubidasViewModel
import app.mirachbudget.android.features.subircartola.SubirCartolaViewModel
import app.mirachbudget.android.features.subircartola.SubirCartolaRoute
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import kotlinx.coroutines.launch
import androidx.lifecycle.viewmodel.initializer
import androidx.lifecycle.viewmodel.viewModelFactory
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.features.session.ConnectionFailedScreen
import app.mirachbudget.android.features.session.ValidatingScreen
import app.mirachbudget.android.features.perfil.PerfilMessages
import app.mirachbudget.android.features.perfil.PerfilRoute
import app.mirachbudget.android.features.perfil.PerfilViewModel
import app.mirachbudget.android.features.resumen.ResumenRoute
import app.mirachbudget.android.features.resumen.ResumenViewModel
import app.mirachbudget.android.features.shell.ShellTab
import app.mirachbudget.android.features.shell.SignedInShell
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
    // Counts the sessions that ended, so a ViewModel never outlives its session: the same person
    // signing in again gets a fresh Perfil (no stale lock, no stale deletion suspicion).
    var sessionsEnded by rememberSaveable { mutableIntStateOf(0) }
    // Signing out also deletes any statement copy still staged for upload.
    LaunchedEffect(phase == Phase.SignedOut) {
        if (phase == Phase.SignedOut) {
            sessionsEnded++
            dependencies.staging.purgeAll()
        }
    }
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
            val notice by session.signedOutNotice.collectAsStateWithLifecycle()
            SignInRoute(viewModel, dependencies.googleWebClientId, notice = notice?.let(PerfilMessages::notice))
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
            val perfilViewModel = viewModel<PerfilViewModel>(
                key = "perfil-${(phase as Phase.SignedIn).userId}-$sessionsEnded",
                factory = viewModelFactory { initializer { PerfilViewModel(dependencies.api, session) } },
            )
            val subirViewModel = viewModel<SubirCartolaViewModel>(
                key = "subir-${(phase as Phase.SignedIn).userId}-$sessionsEnded",
                factory = viewModelFactory { initializer { SubirCartolaViewModel(dependencies.api, dependencies.staging) } },
            )
            // A finished import changes the months with data: reload Resumen even while its tab is hidden.
            val subirState by subirViewModel.state.collectAsStateWithLifecycle()
            LaunchedEffect(subirState.importsCompleted) {
                if (subirState.importsCompleted > 0) resumenViewModel.load()
            }
            // Deleting an uploaded statement also changes the months with data.
            var cartolasDeleted by rememberSaveable { mutableIntStateOf(0) }
            LaunchedEffect(cartolasDeleted) {
                if (cartolasDeleted > 0) resumenViewModel.load()
            }
            var selectedTab by rememberSaveable { mutableStateOf("resumen") }
            // A file shared from another app opens Subir. It is retried whenever the step changes,
            // because it waits while Subir is still preparing or accepting the consent. The call runs
            // in a scope the step change does not cancel, so a running preview is never interrupted.
            val sharedUri by dependencies.sharedCartola.pending.collectAsStateWithLifecycle()
            val resolver = LocalContext.current.contentResolver
            val shareScope = rememberCoroutineScope()
            LaunchedEffect(sharedUri) { if (sharedUri != null) selectedTab = "subir" }
            LaunchedEffect(sharedUri, subirState.step) {
                val uri = sharedUri ?: return@LaunchedEffect
                shareScope.launch {
                    // An earlier launch for the same share may have taken it already.
                    if (dependencies.sharedCartola.pending.value != uri) return@launch
                    subirViewModel.receiveSharedFile(ContentResolverCartolaSource(resolver, Uri.parse(uri))) {
                        dependencies.sharedCartola.consume(uri)
                    }
                }
            }
            SignedInShell(
                tabs = listOf(
                    ShellTab("resumen", "Resumen") {
                        ResumenRoute(
                            viewModel = resumenViewModel,
                            version = (version as? ApiVersionState.Loaded)?.info,
                            onUploadStatement = { selectedTab = "subir" },
                        )
                    },
                    ShellTab("subir", "Subir") {
                        SubirCartolaRoute(
                            subirViewModel,
                            onShowResumen = { selectedTab = "resumen" },
                            cartolasSubidasViewModel = { onChange -> CartolasSubidasViewModel(dependencies.api, onChange) },
                            onCartolaDeleted = { cartolasDeleted++ },
                        )
                    },
                    ShellTab("perfil", "Perfil") { PerfilRoute(perfilViewModel) },
                ),
                selectedId = selectedTab,
                onSelect = { selectedTab = it },
            )
        }
        Phase.ConnectionFailed -> ConnectionFailedScreen(onRetry = { retry++ })
        Phase.Misconfigured -> ConfigurationErrorScreen()
    }
}
