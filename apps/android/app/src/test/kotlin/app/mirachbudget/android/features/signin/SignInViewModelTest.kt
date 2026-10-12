package app.mirachbudget.android.features.signin

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.ApiKeyRejectedException
import app.mirachbudget.android.core.networking.AuthCapabilities
import app.mirachbudget.android.core.networking.InvalidCredentialsException
import app.mirachbudget.android.core.networking.RateLimitedException
import app.mirachbudget.android.core.networking.SignInUnavailableException
import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionController
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.features.signin.SignInViewModel.Message
import app.mirachbudget.android.testing.FakeMirachApi
import app.mirachbudget.android.testing.InMemorySessionStore
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class SignInViewModelTest {
    private val api = FakeMirachApi()
    private val store = InMemorySessionStore()
    private val controller = SessionController(api, store)
    private val session = Session("tok-1", "u-1", Instant.parse("2026-12-01T00:00:00Z"))

    private fun viewModel(googleConfigured: Boolean = true) = SignInViewModel(api, controller, googleConfigured)

    private class FakeLauncher(private val result: GoogleSignInResult) : GoogleSignInLauncher {
        var calls = 0
        override suspend fun requestIdToken(): GoogleSignInResult {
            calls++
            return result
        }
    }

    private suspend fun loaded(
        google: Boolean = true,
        password: Boolean = false,
        googleConfigured: Boolean = true,
    ): SignInViewModel {
        api.onCapabilities = { AuthCapabilities(googleLoginEnabled = google, passwordLoginEnabled = password) }
        return viewModel(googleConfigured).also { it.loadProviders() }
    }

    // --- capabilities gating

    @Test
    fun startsLoadingProviders() {
        assertEquals(SignInViewModel.Phase.LoadingProviders, viewModel().state.value.phase)
    }

    @Test
    fun googleOnlyShowsTheGoogleButton() = runTest {
        val vm = loaded(google = true, password = false)

        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
        assertTrue(vm.state.value.googleAvailable)
        assertFalse(vm.state.value.passwordAvailable)
    }

    @Test
    fun passwordFormAppearsOnlyWhenTheServerEnablesIt() = runTest {
        val vm = loaded(google = true, password = true)

        assertTrue(vm.state.value.passwordAvailable)
        assertFalse(loaded(google = true, password = false).state.value.passwordAvailable)
    }

    @Test
    fun googleIsHiddenWhenTheWebClientIdIsNotConfigured() = runTest {
        val vm = loaded(google = true, password = true, googleConfigured = false)

        assertFalse(vm.state.value.googleAvailable)
        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
    }

    @Test
    fun noUsableProviderIsAnEmptyState() = runTest {
        assertEquals(SignInViewModel.Phase.NoProviders, loaded(google = false, password = false).state.value.phase)
        assertEquals(
            SignInViewModel.Phase.NoProviders,
            loaded(google = true, password = false, googleConfigured = false).state.value.phase,
        )
    }

    @Test
    fun capabilitiesNetworkErrorOffersRetry() = runTest {
        api.onCapabilities = { throw IOException() }
        val vm = viewModel().also { it.loadProviders() }

        assertEquals(SignInViewModel.Phase.ProvidersFailed(Message.CONNECTION), vm.state.value.phase)
    }

    @Test
    fun capabilitiesWithRejectedKeyShowsTheConfigurationMessage() = runTest {
        api.onCapabilities = { throw ApiKeyRejectedException() }
        val vm = viewModel().also { it.loadProviders() }

        assertEquals(SignInViewModel.Phase.ProvidersFailed(Message.MISCONFIGURED), vm.state.value.phase)
    }

    // --- Google

    @Test
    fun googleSuccessStoresTheSessionAndOpensTheSignedInArea() = runTest {
        val vm = loaded()
        api.onGoogle = { session }

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Success("id-1")))

        assertEquals(listOf("id-1"), api.googleTokens)
        assertEquals(session, store.load())
        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
        assertNull(vm.state.value.errorMessage)
        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
    }

    @Test
    fun googleCancellationIsNotAnError() = runTest {
        val vm = loaded()

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Cancelled))

        assertNull(vm.state.value.errorMessage)
        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
        assertEquals(emptyList<String>(), api.googleTokens)
    }

    @Test
    fun googleFailureShowsItsMessageAndSkipsTheApi() = runTest {
        val vm = loaded()

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Failed))

        assertEquals(Message.GOOGLE_FAILED, vm.state.value.errorMessage)
        assertEquals(emptyList<String>(), api.googleTokens)
    }

    @Test
    fun googleIsIgnoredWhenNotOffered() = runTest {
        val vm = loaded(google = false, password = true)
        val launcher = FakeLauncher(GoogleSignInResult.Success("id"))

        vm.signInWithGoogle(launcher)

        assertEquals(0, launcher.calls)
    }

    @Test
    fun googleRejectedByTheApiShowsTheGenericMessage() = runTest {
        val vm = loaded()
        api.onGoogle = { throw InvalidCredentialsException() }

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Success("id")))

        assertEquals(Message.INVALID_CREDENTIALS, vm.state.value.errorMessage)
        assertNull(store.load())
    }

    @Test
    fun googleSwitchedOffOnTheServerReloadsTheProviders() = runTest {
        val vm = loaded()
        api.onGoogle = { throw SignInUnavailableException() }
        api.onCapabilities = { AuthCapabilities(googleLoginEnabled = false, passwordLoginEnabled = true) }

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Success("id")))

        assertFalse(vm.state.value.googleAvailable)
        assertTrue(vm.state.value.passwordAvailable)
    }

    @Test
    fun aSessionThatCannotBeSavedShowsTheSaveMessage() = runTest {
        val vm = loaded()
        store.failOnSave = true
        api.onGoogle = { session }

        vm.signInWithGoogle(FakeLauncher(GoogleSignInResult.Success("id")))

        assertEquals(Message.SAVE_FAILED, vm.state.value.errorMessage)
        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
    }

    // --- password

    @Test
    fun passwordSuccessTrimsTheEmailAndSignsIn() = runTest {
        val vm = loaded(password = true)
        api.onPassword = { _, _ -> session }

        vm.signInWithPassword("  rev@example.com ", "s3cret")

        assertEquals(listOf("rev@example.com" to "s3cret"), api.passwordAttempts)
        assertEquals(Phase.SignedIn("u-1"), controller.phase.value)
    }

    @Test
    fun wrongCredentialsShowTheReviewerMessage() = runTest {
        val vm = loaded(password = true)
        api.onPassword = { _, _ -> throw InvalidCredentialsException() }

        vm.signInWithPassword("rev@example.com", "bad")

        assertEquals(Message.PASSWORD_REJECTED, vm.state.value.errorMessage)
        assertEquals(SignInViewModel.Phase.Ready, vm.state.value.phase)
    }

    @Test
    fun passwordNetworkErrorShowsTheConnectionMessage() = runTest {
        val vm = loaded(password = true)
        api.onPassword = { _, _ -> throw IOException() }

        vm.signInWithPassword("rev@example.com", "x")

        assertEquals(Message.CONNECTION, vm.state.value.errorMessage)
    }

    @Test
    fun passwordServerErrorAndRateLimitAndKeyMessages() = runTest {
        val vm = loaded(password = true)

        api.onPassword = { _, _ -> throw RateLimitedException() }
        vm.signInWithPassword("a@b.c", "x")
        assertEquals(Message.RATE_LIMITED, vm.state.value.errorMessage)

        api.onPassword = { _, _ -> throw ApiKeyRejectedException() }
        vm.signInWithPassword("a@b.c", "x")
        assertEquals(Message.MISCONFIGURED, vm.state.value.errorMessage)

        api.onPassword = { _, _ -> throw ApiException(500) }
        vm.signInWithPassword("a@b.c", "x")
        assertEquals(Message.CONNECTION, vm.state.value.errorMessage)
    }

    @Test
    fun passwordIsIgnoredWhenNotOfferedOrIncomplete() = runTest {
        val disabled = loaded(password = false)
        disabled.signInWithPassword("a@b.c", "x")
        val enabled = loaded(password = true)
        enabled.signInWithPassword("   ", "x")
        enabled.signInWithPassword("a@b.c", "")

        assertEquals(emptyList<Pair<String, String>>(), api.passwordAttempts)
    }

    @Test
    fun aNewAttemptClearsThePreviousError() = runTest {
        val vm = loaded(password = true)
        api.onPassword = { _, _ -> throw InvalidCredentialsException() }
        vm.signInWithPassword("a@b.c", "bad")
        assertNotNull(vm.state.value.errorMessage)
        api.onPassword = { _, _ -> session }

        vm.signInWithPassword("a@b.c", "good")

        assertNull(vm.state.value.errorMessage)
    }
}
