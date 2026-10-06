import Foundation
import Testing
@testable import Mirach

private let saved = Session(
    token: "tok-123", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)
private let ana = CurrentUser(userId: "u-1", nombre: "Ana", email: "ana@example.com")

@MainActor
struct PerfilViewModelTests {
    private struct Rig {
        let api: FakeMirachAPI
        let store: InMemorySessionStore
        let session: SessionController
        let viewModel: PerfilViewModel
    }

    private func makeRig(me: Result<CurrentUser, any Error> = .success(ana)) async -> Rig {
        let api = FakeMirachAPI(currentUserResult: me)
        let store = InMemorySessionStore(session: saved)
        let session = SessionController(api: api, store: store)
        await session.start()
        return Rig(api: api, store: store, session: session, viewModel: PerfilViewModel(api: api, session: session))
    }

    // MARK: loading

    @Test func startsLoadingThenShowsNameAndEmail() async {
        let rig = await makeRig()
        #expect(rig.viewModel.loadState == .loading)

        await rig.viewModel.load()

        #expect(rig.viewModel.loadState == .loaded)
        #expect(rig.viewModel.nombre == "Ana")
        #expect(rig.viewModel.email == "ana@example.com")
    }

    @Test func aMissingEmailIsNil() async {
        let rig = await makeRig(me: .success(CurrentUser(userId: "u-1", nombre: "Ana", email: nil)))
        await rig.viewModel.load()
        #expect(rig.viewModel.email == nil)
    }

    @Test func aFailedLoadOffersRetryAndRetryRecovers() async {
        let rig = await makeRig()
        rig.api.setCurrentUserResult(.failure(URLError(.notConnectedToInternet)))
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .failed(.connection))

        rig.api.setCurrentUserResult(.failure(APIError.badStatus(503)))
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .failed(.server))

        rig.api.setCurrentUserResult(.success(ana))
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .loaded)
    }

    // MARK: editing the name

    @Test func saveIsDisabledUntilTheNameChangesAndIgnoresSurroundingSpaces() async {
        let rig = await makeRig()
        await rig.viewModel.load()
        #expect(!rig.viewModel.canSave)

        rig.viewModel.nombre = "  Ana  "
        #expect(!rig.viewModel.canSave, "the same name once trimmed")

        rig.viewModel.nombre = "Ana María"
        #expect(rig.viewModel.canSave)
    }

    @Test func savingSendsTheTrimmedNameAndReplacesTheLocalCopy() async {
        let rig = await makeRig()
        rig.api.setUpdateNombreResults([.success(CurrentUser(userId: "u-1", nombre: "Ana María", email: "ana@example.com"))])
        await rig.viewModel.load()
        rig.viewModel.nombre = "  Ana María "

        await rig.viewModel.save()

        #expect(rig.api.updateNombreCalls == ["Ana María"])
        #expect(rig.viewModel.nombre == "Ana María")
        #expect(rig.viewModel.saveState == .saved)
        #expect(!rig.viewModel.canSave, "nothing left to save")
    }

    @Test func whileSavingTheButtonIsDisabledAndAnotherSaveIsIgnored() async {
        let rig = await makeRig()
        let gate = Gate()
        rig.api.updateGate = gate
        await rig.viewModel.load()
        rig.viewModel.nombre = "Otro"

        let first = Task { await rig.viewModel.save() }
        await gate.waitUntilWaiting()
        #expect(rig.viewModel.saveState == .saving)
        #expect(!rig.viewModel.canSave)
        await rig.viewModel.save()
        await gate.open()
        await first.value

        #expect(rig.api.updateNombreCalls == ["Otro"], "one request, not two")
    }

    @Test func eachSaveErrorKeepsWhatWasTypedAndSaysWhatHappened() async {
        let cases: [(any Error, PerfilViewModel.SaveFailure)] = [
            (PerfilError.invalidName, .invalidName),
            (URLError(.notConnectedToInternet), .connection),
            (APIError.badStatus(500), .server),
            (APIError.badStatus(403), .server),
        ]
        for (error, expected) in cases {
            let rig = await makeRig()
            rig.api.setUpdateNombreResults([.failure(error)])
            await rig.viewModel.load()
            rig.viewModel.nombre = "Otro nombre"

            await rig.viewModel.save()

            #expect(rig.viewModel.saveState == .failed(expected), "\(error)")
            #expect(rig.viewModel.nombre == "Otro nombre", "what was typed is kept")
            #expect(rig.viewModel.canSave, "retry is possible")
        }
    }

    @Test func anExpiredSessionWhileSavingAddsNoMessageOfItsOwn() async {
        let rig = await makeRig()
        rig.api.setUpdateNombreResults([.failure(APIError.sessionExpired)])
        await rig.viewModel.load()
        rig.viewModel.nombre = "Otro"

        await rig.viewModel.save()

        #expect(rig.viewModel.saveState == .idle, "the single relay signs out; the screen stays quiet")
    }

    // MARK: logout

    @Test func signOutCallsTheServerThenClearsTheSession() async {
        let rig = await makeRig()
        await rig.viewModel.load()

        await rig.viewModel.signOut()

        #expect(rig.api.logoutCalls == 1)
        #expect(rig.store.load() == nil)
        #expect(rig.session.phase == .signedOut)
    }

    @Test func signOutStillWorksWhenTheServerCallFails() async {
        let rig = await makeRig()
        rig.api.setLogoutResult(.failure(URLError(.notConnectedToInternet)))
        await rig.viewModel.load()

        await rig.viewModel.signOut()

        #expect(rig.store.load() == nil)
        #expect(rig.session.phase == .signedOut)
    }

    // MARK: account deletion

    @Test func deletionIsImpossibleUntilTheExactWordIsTyped() async {
        let rig = await makeRig()
        await rig.viewModel.load()

        for typed in ["", "eliminar", "ELIMINAR ", " ELIMINAR", "ELIMINA", "Eliminar"] {
            rig.viewModel.deleteConfirmation = typed
            #expect(!rig.viewModel.canDelete, "\(typed.debugDescription)")
            await rig.viewModel.deleteAccount()
        }

        #expect(rig.api.deleteCalls.isEmpty, "the destructive call never left the app")
        #expect(rig.session.phase == .signedIn(userId: "u-1"))
        rig.viewModel.deleteConfirmation = "ELIMINAR"
        #expect(rig.viewModel.canDelete)
    }

    @Test func confirmedDeletionSendsTheWordClearsTheSessionAndLeavesTheNotice() async {
        let rig = await makeRig()
        await rig.viewModel.load()
        rig.viewModel.deleteConfirmation = "ELIMINAR"

        await rig.viewModel.deleteAccount()

        #expect(rig.api.deleteCalls == ["ELIMINAR"])
        #expect(rig.store.load() == nil)
        #expect(rig.session.phase == .signedOut)
        #expect(rig.session.signedOutNotice == .accountDeleted)
    }

    @Test func whileDeletingEverythingIsDisabledAndASecondSubmitIsIgnored() async {
        let rig = await makeRig()
        let gate = Gate()
        rig.api.deleteGate = gate
        await rig.viewModel.load()
        rig.viewModel.deleteConfirmation = "ELIMINAR"

        let first = Task { await rig.viewModel.deleteAccount() }
        await gate.waitUntilWaiting()
        #expect(rig.viewModel.deleteState == .deleting)
        #expect(!rig.viewModel.canDelete)
        await rig.viewModel.deleteAccount()
        await gate.open()
        await first.value

        #expect(rig.api.deleteCalls == ["ELIMINAR"], "one request, not two")
    }

    @Test func aFailedDeletionKeepsTheAccountTheSessionAndTheTypedWord() async {
        let cases: [(any Error, PerfilViewModel.DeleteFailure)] = [
            (URLError(.notConnectedToInternet), .retry),
            (APIError.badStatus(500), .retry),
            (CuentaError.confirmationRejected, .confirmationRejected),
        ]
        for (error, expected) in cases {
            let rig = await makeRig()
            rig.api.setDeleteResult(.failure(error))
            await rig.viewModel.load()
            rig.viewModel.deleteConfirmation = "ELIMINAR"

            await rig.viewModel.deleteAccount()

            #expect(rig.viewModel.deleteState == .failed(expected), "\(error)")
            #expect(rig.viewModel.deleteConfirmation == "ELIMINAR")
            #expect(rig.store.load() != nil)
            #expect(rig.session.phase == .signedIn(userId: "u-1"))
            #expect(rig.session.signedOutNotice == nil)
            #expect(rig.viewModel.canDelete, "retry is offered")
        }
    }

    @Test func retryAfterAFailureCanSucceed() async {
        let rig = await makeRig()
        rig.api.setDeleteResult(.failure(URLError(.timedOut)))
        await rig.viewModel.load()
        rig.viewModel.deleteConfirmation = "ELIMINAR"
        await rig.viewModel.deleteAccount()

        rig.api.setDeleteResult(.success(()))
        await rig.viewModel.deleteAccount()

        #expect(rig.api.deleteCalls == ["ELIMINAR", "ELIMINAR"])
        #expect(rig.session.phase == .signedOut)
    }

    @Test func anExpiredSessionWhileDeletingIsLeftToTheRelayWithNoClaimOfDeletion() async {
        let rig = await makeRig()
        rig.api.setDeleteResult(.failure(APIError.sessionExpired))
        await rig.viewModel.load()
        rig.viewModel.deleteConfirmation = "ELIMINAR"

        await rig.viewModel.deleteAccount()

        #expect(rig.viewModel.deleteState == .idle)
        #expect(rig.session.signedOutNotice == nil, "401 does not confirm that anything was deleted")
    }

    @Test func cancellingTheConfirmationClearsTheWordAndTheError() async {
        let rig = await makeRig()
        rig.api.setDeleteResult(.failure(APIError.badStatus(500)))
        await rig.viewModel.load()
        rig.viewModel.deleteConfirmation = "ELIMINAR"
        await rig.viewModel.deleteAccount()

        rig.viewModel.resetDeletion()

        #expect(rig.viewModel.deleteConfirmation.isEmpty)
        #expect(rig.viewModel.deleteState == .idle)
    }
}
