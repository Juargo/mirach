package app.mirachbudget.android.features.signin

import androidx.lifecycle.ViewModel
import app.mirachbudget.android.core.networking.ApiKeyRejectedException
import app.mirachbudget.android.core.networking.InvalidCredentialsException
import app.mirachbudget.android.core.networking.MirachApi
import app.mirachbudget.android.core.networking.RateLimitedException
import app.mirachbudget.android.core.networking.SignInUnavailableException
import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionController
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/** What the sign-in screen draws (catalog: `inicio-de-sesion.md`). */
data class SignInUiState(
    val phase: SignInViewModel.Phase = SignInViewModel.Phase.LoadingProviders,
    /** The last attempt's error, shown under the buttons. Null when there is none. */
    val errorMessage: String? = null,
    val googleAvailable: Boolean = false,
    val passwordAvailable: Boolean = false,
)

/**
 * Drives the sign-in screen: Google, plus the App Review email and password form when the server
 * enables it (ADR-051). [googleConfigured] is false when the build has no web client ID, which
 * hides the Google button even if the server offers it.
 */
class SignInViewModel(
    private val api: MirachApi,
    private val session: SessionController,
    private val googleConfigured: Boolean,
) : ViewModel() {
    sealed interface Phase {
        data object LoadingProviders : Phase

        /** At least one provider is available. */
        data object Ready : Phase

        /** The server has every provider switched off. */
        data object NoProviders : Phase
        data class ProvidersFailed(val message: String) : Phase

        /** A sign-in API call is in flight; the buttons are disabled. */
        data object Authenticating : Phase
    }

    /** Copy shown to the person; identical to the iPhone app. */
    object Message {
        const val CONNECTION = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        const val MISCONFIGURED = "La app no está configurada correctamente."
        const val INVALID_CREDENTIALS = "No se pudo iniciar sesión"
        const val PASSWORD_REJECTED = "Correo o contraseña incorrectos"
        const val RATE_LIMITED = "Demasiados intentos, intenta más tarde"
        const val GOOGLE_FAILED = "No se pudo completar el inicio de sesión con Google. Inténtalo de nuevo."
        const val SAVE_FAILED = "No pudimos guardar tu sesión en este dispositivo. Inténtalo de nuevo."
    }

    private val _state = MutableStateFlow(SignInUiState())
    val state: StateFlow<SignInUiState> = _state

    /**
     * Called whenever the screen is composed. Loads the providers the first time and after a
     * failure; once they are known it does nothing, so a rotation never swaps the form for
     * "Cargando…" (which would drop the form's open/closed toggle). "Reintentar" calls [loadProviders].
     */
    suspend fun start() {
        when (_state.value.phase) {
            Phase.LoadingProviders, is Phase.ProvidersFailed -> loadProviders()
            Phase.Ready, Phase.NoProviders, Phase.Authenticating -> Unit
        }
    }

    suspend fun loadProviders() {
        _state.update { it.copy(phase = Phase.LoadingProviders) }
        try {
            val capabilities = api.capabilities()
            val google = capabilities.googleLoginEnabled && googleConfigured
            val password = capabilities.passwordLoginEnabled
            _state.update {
                it.copy(
                    phase = if (google || password) Phase.Ready else Phase.NoProviders,
                    googleAvailable = google,
                    passwordAvailable = password,
                )
            }
        } catch (cancelled: CancellationException) {
            throw cancelled
        } catch (_: ApiKeyRejectedException) {
            _state.update { it.copy(phase = Phase.ProvidersFailed(Message.MISCONFIGURED)) }
        } catch (_: Exception) {
            _state.update { it.copy(phase = Phase.ProvidersFailed(Message.CONNECTION)) }
        }
    }

    /** Called when the person taps "Continuar con Google". */
    suspend fun signInWithGoogle(launcher: GoogleSignInLauncher) {
        val current = _state.value
        if (current.phase != Phase.Ready || !current.googleAvailable) return
        _state.update { it.copy(errorMessage = null, phase = Phase.Authenticating) }
        when (val result = launcher.requestIdToken()) {
            GoogleSignInResult.Cancelled -> _state.update { it.copy(phase = Phase.Ready) }
            GoogleSignInResult.Failed -> _state.update { it.copy(phase = Phase.Ready, errorMessage = Message.GOOGLE_FAILED) }
            is GoogleSignInResult.Success -> attempt(rejected = Message.INVALID_CREDENTIALS) { api.signInWithGoogle(result.idToken) }
        }
    }

    /** Called by the review form. The email is trimmed; the password is never logged or kept here. */
    suspend fun signInWithPassword(email: String, password: String) {
        val trimmed = email.trim()
        val current = _state.value
        if (current.phase != Phase.Ready || !current.passwordAvailable || trimmed.isEmpty() || password.isEmpty()) return
        _state.update { it.copy(errorMessage = null, phase = Phase.Authenticating) }
        attempt(rejected = Message.PASSWORD_REJECTED) { api.signInWithPassword(trimmed, password) }
    }

    private suspend fun attempt(rejected: String, call: suspend () -> Session) {
        val newSession = try {
            call()
        } catch (cancelled: CancellationException) {
            _state.update { it.copy(phase = Phase.Ready) }
            throw cancelled
        } catch (e: Exception) {
            handleFailure(e, rejected)
            return
        }
        try {
            session.signIn(newSession)
            _state.update { it.copy(phase = Phase.Ready) }
        } catch (_: Exception) {
            _state.update { it.copy(phase = Phase.Ready, errorMessage = Message.SAVE_FAILED) }
        }
    }

    private suspend fun handleFailure(error: Exception, rejected: String) {
        _state.update { it.copy(phase = Phase.Ready) }
        when (error) {
            is InvalidCredentialsException -> showError(rejected)
            is RateLimitedException -> showError(Message.RATE_LIMITED)
            is ApiKeyRejectedException -> showError(Message.MISCONFIGURED)
            // Google was switched off on the server: ask again so the button disappears.
            is SignInUnavailableException -> loadProviders()
            else -> showError(Message.CONNECTION)
        }
    }

    private fun showError(message: String) = _state.update { it.copy(errorMessage = message) }
}
