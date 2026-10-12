package app.mirachbudget.android.features.perfil

import app.mirachbudget.android.core.networking.ApiException
import app.mirachbudget.android.core.networking.ApiKeyRejectedException
import app.mirachbudget.android.core.networking.ConfirmationRejectedException
import app.mirachbudget.android.core.networking.CurrentUser
import app.mirachbudget.android.core.networking.InvalidNameException
import app.mirachbudget.android.core.networking.SessionExpiredException
import app.mirachbudget.android.core.session.Session
import app.mirachbudget.android.core.session.SessionController
import app.mirachbudget.android.core.session.SessionController.Phase
import app.mirachbudget.android.core.session.SessionController.SignedOutNotice
import app.mirachbudget.android.features.perfil.PerfilViewModel.DeleteFailure
import app.mirachbudget.android.features.perfil.PerfilViewModel.DeleteState
import app.mirachbudget.android.features.perfil.PerfilViewModel.Failure
import app.mirachbudget.android.features.perfil.PerfilViewModel.LoadState
import app.mirachbudget.android.features.perfil.PerfilViewModel.SaveFailure
import app.mirachbudget.android.features.perfil.PerfilViewModel.SaveState
import app.mirachbudget.android.testing.FakeMirachApi
import app.mirachbudget.android.testing.InMemorySessionStore
import java.io.IOException
import java.net.SocketTimeoutException
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class PerfilViewModelTest {
    private val saved = Session("tok-123", "u-1", Instant.parse("2026-12-01T00:00:00Z"))
    private val ana = CurrentUser("u-1", "Ana", "ana@example.com")
    private val api = FakeMirachApi().apply { onCurrentUser = { ana } }
    private val store = InMemorySessionStore(saved)
    private val session = SessionController(api, store)
    private val vm = PerfilViewModel(api, session)
    private val state get() = vm.state.value

    private suspend fun loaded() {
        session.start()
        vm.load()
    }

    // --- loading

    @Test
    fun startsLoadingThenShowsNameAndEmail() = runTest {
        assertEquals(LoadState.Loading, state.load)

        loaded()

        assertEquals(LoadState.Loaded, state.load)
        assertEquals("Ana", state.nombre)
        assertEquals("ana@example.com", state.email)
    }

    @Test
    fun aMissingEmailIsNull() = runTest {
        api.onCurrentUser = { CurrentUser("u-1", "Ana", null) }
        loaded()
        assertNull(state.email)
    }

    @Test
    fun aFailedLoadOffersRetryAndRetryRecovers() = runTest {
        session.start()
        api.onCurrentUser = { throw IOException("offline") }
        vm.load()
        assertEquals(LoadState.Failed(Failure.Connection), state.load)

        api.onCurrentUser = { throw ApiException(503) }
        vm.load()
        assertEquals(LoadState.Failed(Failure.Server), state.load)

        api.onCurrentUser = { throw SerializationException("bad") }
        vm.load()
        assertEquals(LoadState.Failed(Failure.Server), state.load)

        api.onCurrentUser = { ana }
        vm.load()
        assertEquals(LoadState.Loaded, state.load)
    }

    @Test
    fun anExpiredSessionWhileLoadingAddsNoMessageOfItsOwn() = runTest {
        session.start()
        api.onCurrentUser = { throw SessionExpiredException() }

        vm.load()

        assertEquals(LoadState.Loading, state.load)
    }

    @Test
    fun cancellationWhileLoadingIsNeverShownAsAnError() = runTest {
        session.start()
        api.onCurrentUser = { throw CancellationException("gone") }

        assertThrows(CancellationException::class.java) { kotlinx.coroutines.runBlocking { vm.load() } }
        assertEquals(LoadState.Loading, state.load)
    }

    // --- reloading when the tab comes back

    @Test
    fun reloadingKeepsAnUnsavedDraftButTakesTheServerValues() = runTest {
        loaded()
        vm.onNombreChange("Borrador")
        api.onCurrentUser = { CurrentUser("u-1", "Ana B", "nuevo@example.com") }

        vm.load()

        assertEquals("Borrador", state.nombre)
        assertEquals(LoadState.Loaded, state.load)
        assertEquals("nuevo@example.com", state.email)
        assertTrue(state.canSave)
    }

    @Test
    fun reloadingACleanFormRefreshesTheName() = runTest {
        loaded()
        api.onCurrentUser = { CurrentUser("u-1", "Ana B", "ana@example.com") }

        vm.load()

        assertEquals("Ana B", state.nombre)
        assertFalse(state.canSave)
    }

    @Test
    fun aFailedRefreshKeepsWhatIsOnScreen() = runTest {
        loaded()
        api.onCurrentUser = { throw IOException("offline") }

        vm.load()

        assertEquals(LoadState.Loaded, state.load)
        assertEquals("Ana", state.nombre)
    }

    @Test
    fun reloadingWhileASaveIsInFlightDoesNothing() = runTest {
        loaded()
        val gate = CompletableDeferred<Unit>()
        api.onUpdateNombre = { gate.await(); CurrentUser("u-1", it, "ana@example.com") }
        vm.onNombreChange("Otro")
        val callsBefore = api.currentUserCalls

        val save = launch { vm.save() }
        runCurrent()
        vm.load()
        assertEquals(callsBefore, api.currentUserCalls)
        assertEquals("Otro", state.nombre)
        gate.complete(Unit)
        save.join()

        assertEquals(SaveState.Saved, state.save)
    }

    // --- editing the name

    @Test
    fun saveIsDisabledUntilTheNameChangesAndIgnoresSurroundingSpaces() = runTest {
        loaded()
        assertFalse(state.canSave)

        vm.onNombreChange("  Ana  ")
        assertFalse(state.canSave)

        vm.onNombreChange("Ana María")
        assertTrue(state.canSave)
    }

    @Test
    fun savingSendsTheTrimmedNameAndReplacesTheLocalCopy() = runTest {
        loaded()
        api.onUpdateNombre = { CurrentUser("u-1", "Ana María", "ana@example.com") }
        vm.onNombreChange("  Ana María ")

        vm.save()

        assertEquals(listOf("Ana María"), api.updateNombreCalls)
        assertEquals("Ana María", state.nombre)
        assertEquals(SaveState.Saved, state.save)
        assertFalse(state.canSave)
    }

    @Test
    fun aNameWithNewlinesOrRepeatedSpacesIsSentAsOneCleanLine() = runTest {
        loaded()
        api.onUpdateNombre = { CurrentUser("u-1", it, null) }
        vm.onNombreChange("  Ana\n María \r\n  Pérez \n")

        vm.save()

        assertEquals(listOf("Ana María Pérez"), api.updateNombreCalls)
    }

    @Test
    fun differencesOnlyInWhitespaceAreNotChanges() = runTest {
        loaded()
        vm.onNombreChange("Ana\n")
        assertFalse(state.canSave)
        vm.onNombreChange("A  na")
        assertTrue(state.canSave)
    }

    @Test
    fun typingAfterASaveClearsTheSavedConfirmation() = runTest {
        loaded()
        api.onUpdateNombre = { CurrentUser("u-1", it, null) }
        vm.onNombreChange("Otro")
        vm.save()

        vm.onNombreChange("Otro más")

        assertEquals(SaveState.Idle, state.save)
    }

    @Test
    fun whileSavingTheButtonIsDisabledAndAnotherSaveIsIgnored() = runTest {
        loaded()
        val gate = CompletableDeferred<Unit>()
        api.onUpdateNombre = { gate.await(); CurrentUser("u-1", it, null) }
        vm.onNombreChange("Otro")

        val first = launch { vm.save() }
        runCurrent()
        assertEquals(SaveState.Saving, state.save)
        assertFalse(state.canSave)
        vm.save()
        gate.complete(Unit)
        first.join()

        assertEquals(listOf("Otro"), api.updateNombreCalls)
    }

    @Test
    fun eachSaveErrorKeepsWhatWasTypedAndSaysWhatHappened() = runTest {
        val cases = listOf(
            InvalidNameException() to SaveFailure.InvalidName,
            IOException("offline") to SaveFailure.Connection,
            SocketTimeoutException() to SaveFailure.Connection,
            ApiException(500) to SaveFailure.Server,
            ApiException(403) to SaveFailure.Server,
            SerializationException("bad") to SaveFailure.Server,
            ApiKeyRejectedException() to SaveFailure.Server,
        )
        for ((error, expected) in cases) {
            val api = FakeMirachApi().apply {
                onCurrentUser = { ana }
                onUpdateNombre = { throw error }
            }
            val vm = PerfilViewModel(api, SessionController(api, InMemorySessionStore(saved)))
            vm.load()
            vm.onNombreChange("Otro nombre")

            vm.save()

            assertEquals("$error", SaveState.Failed(expected), vm.state.value.save)
            assertEquals("$error", "Otro nombre", vm.state.value.nombre)
            assertTrue("$error", vm.state.value.canSave)
        }
    }

    @Test
    fun anExpiredSessionWhileSavingAddsNoMessageOfItsOwn() = runTest {
        loaded()
        api.onUpdateNombre = { throw SessionExpiredException() }
        vm.onNombreChange("Otro")

        vm.save()

        assertEquals(SaveState.Idle, state.save)
    }

    @Test
    fun cancellationWhileSavingIsNotAnError() = runTest {
        loaded()
        api.onUpdateNombre = { throw CancellationException("gone") }
        vm.onNombreChange("Otro")

        assertThrows(CancellationException::class.java) { kotlinx.coroutines.runBlocking { vm.save() } }
        assertEquals(SaveState.Idle, state.save)
        assertEquals("Otro", state.nombre)
    }

    // --- logout

    @Test
    fun signOutCallsTheServerThenClearsTheSession() = runTest {
        loaded()

        vm.signOut()

        assertEquals(1, api.logoutCalls)
        assertNull(store.load())
        assertEquals(Phase.SignedOut, session.phase.value)
    }

    @Test
    fun signOutStillWorksWhenTheServerCallFails() = runTest {
        loaded()
        api.onLogout = { throw IOException("offline") }

        vm.signOut()

        assertNull(store.load())
        assertEquals(Phase.SignedOut, session.phase.value)
    }

    @Test
    fun signOutLocksTheScreenAndIgnoresASecondTap() = runTest {
        loaded()
        val gate = CompletableDeferred<Unit>()
        api.onLogout = { gate.await() }

        val first = launch { vm.signOut() }
        runCurrent()
        assertTrue(state.isSigningOut)
        assertTrue(state.isBusyWithSession)
        vm.signOut()
        gate.complete(Unit)
        first.join()

        assertEquals(1, api.logoutCalls)
    }

    @Test
    fun signOutFinishingLeavesTheScreenUsable() = runTest {
        loaded()

        vm.signOut()

        assertFalse(state.isSigningOut)
        assertFalse(state.isBusyWithSession)
    }

    @Test
    fun theSameUserSigningInAgainGetsAUsablePerfil() = runTest {
        loaded()
        vm.signOut()
        assertEquals(Phase.SignedOut, session.phase.value)

        session.signIn(saved)
        vm.load()
        vm.onNombreChange("Ana María")
        vm.onDeleteConfirmationChange("ELIMINAR")

        assertTrue(state.canSave)
        assertTrue(state.canDelete)
    }

    // --- account deletion

    @Test
    fun deletionIsImpossibleUntilTheExactWordIsTyped() = runTest {
        loaded()

        for (typed in listOf("", "eliminar", "ELIMINAR ", " ELIMINAR", "ELIMINA", "Eliminar")) {
            vm.onDeleteConfirmationChange(typed)
            assertFalse(typed, state.canDelete)
            vm.deleteAccount()
        }

        assertEquals(emptyList<String>(), api.deleteCalls)
        assertEquals(Phase.SignedIn("u-1"), session.phase.value)
        vm.onDeleteConfirmationChange("ELIMINAR")
        assertTrue(state.canDelete)
    }

    @Test
    fun confirmedDeletionSendsTheWordClearsTheSessionAndLeavesTheNotice() = runTest {
        loaded()
        vm.onDeleteConfirmationChange("ELIMINAR")

        vm.deleteAccount()

        assertEquals(listOf("ELIMINAR"), api.deleteCalls)
        assertNull(store.load())
        assertEquals(Phase.SignedOut, session.phase.value)
        assertEquals(SignedOutNotice.AccountDeleted, session.signedOutNotice.value)
    }

    @Test
    fun whileDeletingEverythingIsDisabledAndASecondSubmitIsIgnored() = runTest {
        loaded()
        val gate = CompletableDeferred<Unit>()
        api.onDeleteAccount = { gate.await() }
        vm.onDeleteConfirmationChange("ELIMINAR")

        val first = launch { vm.deleteAccount() }
        runCurrent()
        assertEquals(DeleteState.Deleting, state.delete)
        assertFalse(state.canDelete)
        assertTrue(state.isBusyWithSession)
        vm.deleteAccount()
        gate.complete(Unit)
        first.join()

        assertEquals(listOf("ELIMINAR"), api.deleteCalls)
    }

    @Test
    fun aFailedDeletionKeepsTheAccountTheSessionAndTheTypedWord() = runTest {
        val cases = listOf(
            IOException("offline") to DeleteFailure.Retry,
            ApiException(500) to DeleteFailure.Retry,
            ApiException(400) to DeleteFailure.Retry,
            ConfirmationRejectedException() to DeleteFailure.ConfirmationRejected,
        )
        for ((error, expected) in cases) {
            val api = FakeMirachApi().apply {
                onCurrentUser = { ana }
                onDeleteAccount = { throw error }
            }
            val session = SessionController(api, InMemorySessionStore(saved))
            val vm = PerfilViewModel(api, session)
            session.start()
            vm.load()
            vm.onDeleteConfirmationChange("ELIMINAR")

            vm.deleteAccount()

            val s = vm.state.value
            assertEquals("$error", DeleteState.Failed(expected), s.delete)
            assertEquals("$error", "ELIMINAR", s.deleteConfirmation)
            assertEquals("$error", Phase.SignedIn("u-1"), session.phase.value)
            assertNull("$error", session.signedOutNotice.value)
            assertTrue("$error", s.canDelete)
        }
    }

    @Test
    fun retryAfterAFailureCanSucceed() = runTest {
        loaded()
        api.onDeleteAccount = { throw SocketTimeoutException() }
        vm.onDeleteConfirmationChange("ELIMINAR")
        vm.deleteAccount()

        api.onDeleteAccount = {}
        vm.deleteAccount()

        assertEquals(listOf("ELIMINAR", "ELIMINAR"), api.deleteCalls)
        assertEquals(Phase.SignedOut, session.phase.value)
    }

    @Test
    fun anExpiredSessionWhileDeletingIsLeftToTheRelayWithNoClaimOfDeletion() = runTest {
        loaded()
        api.onDeleteAccount = { throw SessionExpiredException() }
        vm.onDeleteConfirmationChange("ELIMINAR")

        vm.deleteAccount()

        assertEquals(DeleteState.Idle, state.delete)
        assertNull(session.signedOutNotice.value)
    }

    @Test
    fun aRetryThatFindsTheSessionGoneConfirmsTheDeletion() = runTest {
        // The first attempt got no answer although the server had already deleted everything: the
        // retry gets 401 because the session no longer exists, which proves the deletion.
        for (firstFailure in listOf<Exception>(SocketTimeoutException(), ApiException(503))) {
            val store = InMemorySessionStore(saved)
            val api = FakeMirachApi().apply { onCurrentUser = { ana } }
            val session = SessionController(api, store)
            val vm = PerfilViewModel(api, session)
            session.start()
            vm.load()
            api.onDeleteAccount = { throw firstFailure }
            vm.onDeleteConfirmationChange("ELIMINAR")
            vm.deleteAccount()
            assertEquals(DeleteState.Failed(DeleteFailure.Retry), vm.state.value.delete)

            api.onDeleteAccount = { throw SessionExpiredException() }
            vm.deleteAccount()

            assertEquals(Phase.SignedOut, session.phase.value)
            assertEquals("$firstFailure", SignedOutNotice.AccountDeleted, session.signedOutNotice.value)
            assertNull(store.load())
        }
    }

    @Test
    fun aRefusedConfirmationDoesNotMakeALater401MeanDeleted() = runTest {
        loaded()
        api.onDeleteAccount = { throw ConfirmationRejectedException() }
        vm.onDeleteConfirmationChange("ELIMINAR")
        vm.deleteAccount()

        api.onDeleteAccount = { throw SessionExpiredException() }
        vm.deleteAccount()

        assertNull(session.signedOutNotice.value)
    }

    @Test
    fun aLater401MeansDeletedOnlyAfterAnAttemptThatGotNoAnswer() = runTest {
        // A definite answer (4xx, rejected key, refused word) proves the account exists, so it must
        // not leave a "may have been deleted" suspicion behind, even after an earlier lost attempt.
        val definiteAnswers = listOf<Pair<String, Exception>>(
            "400" to ApiException(400),
            "403" to ApiException(403),
            "key" to ApiKeyRejectedException(),
        )
        for ((name, answer) in definiteAnswers) {
            val api = FakeMirachApi().apply { onCurrentUser = { ana } }
            val session = SessionController(api, InMemorySessionStore(saved))
            val vm = PerfilViewModel(api, session)
            session.start()
            vm.load()
            vm.onDeleteConfirmationChange("ELIMINAR")

            api.onDeleteAccount = { throw answer }
            vm.deleteAccount()
            api.onDeleteAccount = { throw SessionExpiredException() }
            vm.deleteAccount()

            assertNull(name, session.signedOutNotice.value)
            assertEquals(name, DeleteState.Idle, vm.state.value.delete)
        }
    }

    @Test
    fun aRefusedConfirmationClearsTheSuspicionFromAnEarlierLostAttempt() = runTest {
        loaded()
        vm.onDeleteConfirmationChange("ELIMINAR")
        api.onDeleteAccount = { throw SocketTimeoutException() }
        vm.deleteAccount()
        api.onDeleteAccount = { throw ConfirmationRejectedException() }
        vm.deleteAccount()

        api.onDeleteAccount = { throw SessionExpiredException() }
        vm.deleteAccount()

        assertNull(session.signedOutNotice.value)
    }

    @Test
    fun aDefiniteAnswerAfterALostAttemptClearsTheSuspicion() = runTest {
        loaded()
        vm.onDeleteConfirmationChange("ELIMINAR")
        api.onDeleteAccount = { throw SocketTimeoutException() }
        vm.deleteAccount()
        api.onDeleteAccount = { throw ApiException(400) }
        vm.deleteAccount()

        api.onDeleteAccount = { throw SessionExpiredException() }
        vm.deleteAccount()

        assertNull(session.signedOutNotice.value)
    }

    @Test
    fun cancellationWhileDeletingDoesNotClaimAnything() = runTest {
        loaded()
        api.onDeleteAccount = { throw CancellationException("gone") }
        vm.onDeleteConfirmationChange("ELIMINAR")

        assertThrows(CancellationException::class.java) { kotlinx.coroutines.runBlocking { vm.deleteAccount() } }

        assertNull(session.signedOutNotice.value)
        assertNotNull(store.load())
    }

    @Test
    fun cancellingTheConfirmationClearsTheWordAndTheError() = runTest {
        loaded()
        api.onDeleteAccount = { throw ApiException(500) }
        vm.onDeleteConfirmationChange("ELIMINAR")
        vm.deleteAccount()

        vm.resetDeletion()

        assertEquals("", state.deleteConfirmation)
        assertEquals(DeleteState.Idle, state.delete)
    }

    @Test
    fun theWordCannotBeResetWhileTheRequestIsOut() = runTest {
        loaded()
        val gate = CompletableDeferred<Unit>()
        api.onDeleteAccount = { gate.await() }
        vm.onDeleteConfirmationChange("ELIMINAR")
        val first = launch { vm.deleteAccount() }
        runCurrent()

        vm.resetDeletion()

        assertEquals("ELIMINAR", state.deleteConfirmation)
        assertEquals(DeleteState.Deleting, state.delete)
        gate.complete(Unit)
        first.join()
    }

    @Test
    fun theMessagesAreTheCatalogCopy() {
        assertEquals("Perfil guardado", PerfilMessages.SAVED)
        assertEquals("Problema de conexión. Revisa tu conexión e inténtalo de nuevo.", PerfilMessages.load(Failure.Connection))
        assertEquals("No pudimos cargar tu perfil. Inténtalo de nuevo en unos segundos.", PerfilMessages.load(Failure.Server))
        assertEquals("El nombre debe tener entre 1 y 80 caracteres", PerfilMessages.save(SaveFailure.InvalidName))
        assertEquals("Problema de conexión. Revisa tu conexión e inténtalo de nuevo.", PerfilMessages.save(SaveFailure.Connection))
        assertEquals("No pudimos guardar el nombre. Inténtalo de nuevo.", PerfilMessages.save(SaveFailure.Server))
        assertEquals("La confirmación no coincide. No se eliminó nada.", PerfilMessages.delete(DeleteFailure.ConfirmationRejected))
        assertEquals("No se pudo eliminar la cuenta. Intenta de nuevo.", PerfilMessages.delete(DeleteFailure.Retry))
        assertEquals("Tu cuenta y tus datos se eliminaron", PerfilMessages.notice(SignedOutNotice.AccountDeleted))
    }
}
