import Foundation
import Testing
@testable import Mirach

private let anonymous = Session(
    token: "tok-anon", userId: "u-anon", expiresAt: Date(timeIntervalSince1970: 1_800_000_000), isAnonymous: true
)
private let existing = Session(
    token: "tok-existing", userId: "u-existing", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)
private let bothProviders = AuthCapabilities(appleLoginEnabled: true, googleLoginMobileEnabled: true)
private let connectionMessage = "No pudimos unir los datos de este dispositivo. Puedes intentarlo de nuevo desde Perfil."

/// Merging the parked anonymous account into the account of the session (ADR-014, S4).
@MainActor
struct PerfilMergeTests {
    private struct Rig {
        let api: FakeMirachAPI
        let store: InMemorySessionStore
        let session: SessionController
        let viewModel: PerfilViewModel
    }

    /// An ordinary session with (or without) an anonymous session parked beside it.
    private func makeRig(parked: Session? = anonymous, current: Session = existing) async -> Rig {
        let api = FakeMirachAPI(
            capabilitiesResult: .success(bothProviders),
            currentUserResult: .success(CurrentUser(userId: current.userId, nombre: "Ana", email: "ana@example.com"))
        )
        let store = InMemorySessionStore(session: current)
        if let parked { try? store.saveAnonymousBackup(parked) }
        let session = SessionController(api: api, store: store)
        await session.start()
        let viewModel = PerfilViewModel(api: api, session: session, googleSignIn: FakeGoogleSignIn())
        await viewModel.load()
        return Rig(api: api, store: store, session: session, viewModel: viewModel)
    }

    /// The whole flow: an anonymous session that links to an identity that already has an account.
    private func makeEnteringRig(mergeResult: Result<Void, any Error> = .success(())) async -> Rig {
        let api = FakeMirachAPI(
            capabilitiesResult: .success(bothProviders),
            googleSignInResult: .success(existing),
            currentUserResult: .success(CurrentUser(userId: "u-anon", nombre: "", email: ""))
        )
        api.setLinkGoogleResult(.failure(APIError.accountAlreadyExists))
        api.setMergeResult(mergeResult)
        let store = InMemorySessionStore(session: anonymous)
        let session = SessionController(api: api, store: store)
        await session.start()
        let viewModel = PerfilViewModel(api: api, session: session, googleSignIn: FakeGoogleSignIn())
        await viewModel.load()
        await viewModel.linkWithGoogle()
        return Rig(api: api, store: store, session: session, viewModel: viewModel)
    }

    // MARK: copy

    @Test func theCopyIsTheOneOfTheSpec() {
        #expect(PerfilViewModel.existingAccountMessage
            == "Si entras a ella, uniremos los datos de este dispositivo con los de esa cuenta.")
        #expect(PerfilViewModel.existingAccountConfirmButton == "Entrar y unir datos")
        #expect(PerfilViewModel.existingAccountCancelButton == "Cancelar")
        #expect(PerfilViewModel.mergeTitle == "Datos de este dispositivo")
        #expect(PerfilViewModel.mergeText == "Tienes datos guardados de cuando usaste la app sin cuenta.")
        #expect(PerfilViewModel.mergeActionTitle == "Unir a mi cuenta")
        #expect(PerfilViewModel.mergedMessage == "Datos de este dispositivo unidos a tu cuenta")
        #expect(PerfilViewModel.mergeFailedMessage == connectionMessage)
        #expect(PerfilViewModel.mergeUnavailableMessage == "Esos datos ya no están disponibles.")
    }

    // MARK: the section

    @Test func anOrdinarySessionWithAParkedItemOffersTheSection() async {
        let rig = await makeRig()

        #expect(rig.session.hasParkedAnonymousSession)
        #expect(rig.viewModel.showsMergeSection)
        #expect(rig.api.mergeCalls.isEmpty, "never merges without the explicit action")
    }

    @Test func anOrdinarySessionWithoutAParkedItemOffersNothing() async {
        let rig = await makeRig(parked: nil)

        #expect(rig.viewModel.showsMergeSection == false)
    }

    @Test func anAnonymousSessionNeverShowsTheSectionEvenWithAParkedItem() async {
        let rig = await makeRig(parked: anonymous, current: anonymous)

        #expect(rig.viewModel.showsMergeSection == false)
    }

    // MARK: "Unir a mi cuenta"

    @Test func mergingSendsTheParkedTokenClearsTheItemAndSaysSo() async {
        let rig = await makeRig()
        let revision = rig.session.mergeRevision

        await rig.viewModel.mergeParkedData()

        #expect(rig.api.mergeCalls == ["tok-anon"])
        #expect(rig.store.loadAnonymousBackup() == nil)
        #expect(rig.session.hasParkedAnonymousSession == false)
        #expect(rig.viewModel.showsMergeSection == false)
        #expect(rig.viewModel.mergeResultMessage == "Datos de este dispositivo unidos a tu cuenta")
        #expect(rig.viewModel.mergeFailureMessage == nil)
        #expect(rig.session.mergeRevision == revision + 1, "the data screens read again")
        #expect(rig.store.load() == existing, "still signed in to the same account")
    }

    @Test func aFailedMergeKeepsTheItemAndTheSectionAndShowsTheFailure() async {
        let failures: [any Error] = [URLError(.notConnectedToInternet), APIError.badStatus(503), APIError.rateLimited]
        for error in failures {
            let rig = await makeRig()
            rig.api.setMergeResult(.failure(error))
            let revision = rig.session.mergeRevision

            await rig.viewModel.mergeParkedData()

            #expect(rig.store.loadAnonymousBackup() == anonymous)
            #expect(rig.viewModel.showsMergeSection)
            #expect(rig.viewModel.mergeFailureMessage == connectionMessage)
            #expect(rig.viewModel.mergeResultMessage == nil)
            #expect(rig.session.mergeRevision == revision)
            #expect(rig.store.load() == existing)
        }
    }

    @Test func anInvalidOriginClearsTheItemAndSaysTheDataIsGone() async {
        let rig = await makeRig()
        rig.api.setMergeResult(.failure(APIError.mergeOriginInvalid))

        await rig.viewModel.mergeParkedData()

        #expect(rig.store.loadAnonymousBackup() == nil)
        #expect(rig.viewModel.showsMergeSection == false)
        #expect(rig.viewModel.mergeFailureMessage == "Esos datos ya no están disponibles.")
        #expect(rig.viewModel.mergeResultMessage == nil)
        #expect(rig.store.load() == existing)
    }

    @Test func aSecondTapWhileTheRequestIsOutDoesNothing() async {
        let rig = await makeRig()
        let gate = Gate()
        rig.api.setMergeGate(gate)

        let first = Task { await rig.viewModel.mergeParkedData() }
        await Task.yield()
        while rig.api.mergeCalls.isEmpty { await Task.yield() }
        #expect(rig.viewModel.isMerging)
        await rig.viewModel.mergeParkedData()
        await gate.open()
        await first.value

        #expect(rig.api.mergeCalls == ["tok-anon"])
        #expect(rig.viewModel.isMerging == false)
    }

    @Test func anExpiredSessionIsLeftToTheRelayAndKeepsTheItem() async {
        let rig = await makeRig()
        rig.api.setMergeResult(.failure(APIError.sessionExpired))

        await rig.viewModel.mergeParkedData()

        #expect(rig.store.loadAnonymousBackup() == anonymous)
        #expect(rig.viewModel.mergeFailureMessage == nil)
        #expect(rig.viewModel.mergeResultMessage == nil)
    }

    // MARK: "Entrar y unir datos"

    @Test func enteringAndMergingParksSignsInMergesWithTheParkedTokenAndClearsIt() async {
        let rig = await makeEnteringRig()
        let revision = rig.session.mergeRevision

        await rig.viewModel.enterExistingAccount()

        #expect(rig.api.googleSignInCalls == ["google-jwt"])
        #expect(rig.api.mergeCalls == ["tok-anon"])
        #expect(rig.store.load()?.isAnonymous == false)
        #expect(rig.store.loadAnonymousBackup() == nil)
        #expect(rig.session.hasParkedAnonymousSession == false)
        #expect(rig.viewModel.mergeResultMessage == "Datos de este dispositivo unidos a tu cuenta")
        #expect(rig.session.mergeRevision == revision + 1)
    }

    @Test func ifTheMergeFailsAfterEnteringThePersonStaysInTheAccountAndTheItemIsKept() async {
        let rig = await makeEnteringRig(mergeResult: .failure(URLError(.timedOut)))

        await rig.viewModel.enterExistingAccount()

        #expect(rig.store.load()?.isAnonymous == false)
        #expect(rig.session.isAnonymous == false)
        #expect(rig.store.loadAnonymousBackup() == anonymous)
        #expect(rig.viewModel.mergeFailureMessage == connectionMessage)
        #expect(rig.viewModel.showsMergeSection)
    }

    @Test func ifEnteringTheAccountFailsNothingIsMerged() async {
        let api = FakeMirachAPI(
            capabilitiesResult: .success(bothProviders),
            googleSignInResult: .failure(URLError(.timedOut))
        )
        api.setLinkGoogleResult(.failure(APIError.accountAlreadyExists))
        let store = InMemorySessionStore(session: anonymous)
        let session = SessionController(api: api, store: store)
        await session.start()
        let viewModel = PerfilViewModel(api: api, session: session, googleSignIn: FakeGoogleSignIn())
        await viewModel.load()
        await viewModel.linkWithGoogle()

        await viewModel.enterExistingAccount()

        #expect(api.mergeCalls.isEmpty)
        #expect(store.load() == anonymous)
        #expect(session.isAnonymous)
    }
}
