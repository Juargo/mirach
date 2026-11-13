import AuthenticationServices
import Foundation
import Testing
@testable import Mirach

private let anonymous = Session(
    token: "tok-anon", userId: "u-anon", expiresAt: Date(timeIntervalSince1970: 1_800_000_000), isAnonymous: true
)
private let linked = Session(
    token: "tok-linked", userId: "u-anon", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)
private let existing = Session(
    token: "tok-existing", userId: "u-existing", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)
private let appleCredential = AppleCredential(
    identityToken: "apple-jwt", fullName: "Ana Pérez", authorizationCode: "code-1"
)
private let bothProviders = AuthCapabilities(appleLoginEnabled: true, googleLoginMobileEnabled: true)

/// "Respalda tus datos": linking an anonymous account from Perfil (S7).
@MainActor
struct PerfilLinkTests {
    private struct Rig {
        let api: FakeMirachAPI
        let store: InMemorySessionStore
        let session: SessionController
        let google: FakeGoogleSignIn
        let viewModel: PerfilViewModel
    }

    private func makeRig(
        session stored: Session = anonymous,
        capabilities: AuthCapabilities = bothProviders,
        me: CurrentUser = CurrentUser(userId: "u-anon", nombre: "", email: "")
    ) async -> Rig {
        let api = FakeMirachAPI(
            capabilitiesResult: .success(capabilities), currentUserResult: .success(me)
        )
        let store = InMemorySessionStore(session: stored)
        let session = SessionController(api: api, store: store)
        await session.start()
        let google = FakeGoogleSignIn()
        let viewModel = PerfilViewModel(
            api: api, session: session, makeNonce: { "raw-nonce" }, googleSignIn: google
        )
        await viewModel.load()
        return Rig(api: api, store: store, session: session, google: google, viewModel: viewModel)
    }

    // MARK: what Perfil offers

    @Test func anAnonymousSessionOffersTheLinkSectionWithBothProviders() async {
        let rig = await makeRig()

        #expect(rig.viewModel.showsLinkSection)
        #expect(rig.viewModel.appleLinkAvailable)
        #expect(rig.viewModel.googleLinkAvailable)
    }

    @Test func aProviderThatIsOffIsHidden() async {
        let rig = await makeRig(capabilities: AuthCapabilities(appleLoginEnabled: false, googleLoginMobileEnabled: true))

        #expect(rig.viewModel.showsLinkSection)
        #expect(rig.viewModel.appleLinkAvailable == false)
        #expect(rig.viewModel.googleLinkAvailable)
    }

    @Test func anOrdinarySessionNeverShowsTheLinkSectionAndKeepsSigningOut() async {
        let rig = await makeRig(
            session: linked, me: CurrentUser(userId: "u-anon", nombre: "Ana", email: "ana@example.com")
        )

        #expect(rig.viewModel.showsLinkSection == false)
        #expect(rig.viewModel.offersSignOut)
        #expect(rig.api.capabilitiesCalls == 0, "no provider lookup for an account that cannot be linked")

        await rig.viewModel.signOut()
        #expect(rig.store.load() == nil)
    }

    @Test func anAnonymousSessionDoesNotOfferSigningOut() async {
        #expect(await makeRig().viewModel.offersSignOut == false)
    }

    @Test func anEmptyEmailIsNotShown() async {
        let rig = await makeRig(me: CurrentUser(userId: "u-anon", nombre: "", email: ""))
        #expect(rig.viewModel.email == nil)
    }

    @Test func theCopyOfTheLinkSectionIsTheOneOfTheSpec() {
        #expect(PerfilViewModel.linkTitle == "Respalda tus datos")
        #expect(PerfilViewModel.linkText
            == "Vincula tu cuenta para no perder tus datos si borras la app o cambias de teléfono.")
        #expect(PerfilViewModel.linkAppleTitle == "Vincular con Apple")
        #expect(PerfilViewModel.linkGoogleTitle == "Vincular con Google")
        #expect(PerfilViewModel.linkedMessage == "Cuenta vinculada")
        #expect(PerfilViewModel.existingAccountTitle == "Esa cuenta ya existe")
        #expect(PerfilViewModel.existingAccountMessage
            == "Si entras a ella, uniremos los datos de este dispositivo con los de esa cuenta.")
        #expect(PerfilViewModel.existingAccountConfirmButton == "Entrar y unir datos")
        #expect(PerfilViewModel.existingAccountCancelButton == "Cancelar")
    }

    // MARK: linking

    @Test func linkingWithAppleReplacesTheSessionWithAnOrdinaryOne() async {
        let rig = await makeRig()
        let hashed = rig.viewModel.prepareAppleLink()
        #expect(hashed == AppleNonce.sha256Hex("raw-nonce"))

        await rig.viewModel.completeAppleLink(.success(appleCredential))

        #expect(rig.api.linkAppleCalls == [.init(
            identityToken: "apple-jwt", nonce: "raw-nonce", nombre: "Ana Pérez", authorizationCode: "code-1"
        )])
        #expect(rig.api.mergeCalls.isEmpty, "linking a new identity merges nothing")
        #expect(rig.store.load() == linked)
        #expect(rig.session.isAnonymous == false)
        #expect(rig.viewModel.showsLinkSection == false)
        #expect(rig.viewModel.linkState == .linked)
        #expect(rig.viewModel.linkedNotice == "Cuenta vinculada")
        #expect(rig.viewModel.linkFailureMessage == nil)
    }

    @Test func linkingWithGoogleReplacesTheSessionWithAnOrdinaryOne() async {
        let rig = await makeRig()

        await rig.viewModel.linkWithGoogle()

        #expect(rig.api.linkGoogleCalls == ["google-jwt"])
        #expect(rig.store.load() == linked)
        #expect(rig.session.isAnonymous == false)
        #expect(rig.viewModel.linkState == .linked)
    }

    @Test func closingTheProviderSheetSendsNothingAndShowsNoMessage() async {
        let rig = await makeRig()
        rig.google.result = .cancelled

        await rig.viewModel.linkWithGoogle()
        _ = rig.viewModel.prepareAppleLink()
        await rig.viewModel.completeAppleLink(.failure(ASAuthorizationError(.canceled)))

        #expect(rig.api.linkGoogleCalls.isEmpty)
        #expect(rig.api.linkAppleCalls.isEmpty)
        #expect(rig.viewModel.linkState == .idle)
        #expect(rig.store.load() == anonymous)
    }

    @Test func aProviderFailureShowsTheGenericMessageAndSendsNothing() async {
        let rig = await makeRig()
        rig.google.result = .failed

        await rig.viewModel.linkWithGoogle()

        #expect(rig.api.linkGoogleCalls.isEmpty)
        #expect(rig.viewModel.linkFailureMessage == "No pudimos vincular la cuenta. Inténtalo de nuevo.")
    }

    @Test func linkFailuresShowTheSpecMessagesAndKeepTheAnonymousSession() async {
        let cases: [(any Error, String)] = [
            (URLError(.notConnectedToInternet), "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."),
            (APIError.badStatus(503), "No pudimos vincular la cuenta. Inténtalo de nuevo."),
            (APIError.rateLimited, "No pudimos vincular la cuenta. Inténtalo de nuevo."),
            (APIError.accountNotAnonymous, "No pudimos vincular la cuenta. Inténtalo de nuevo."),
        ]
        for (error, message) in cases {
            let rig = await makeRig()
            rig.api.setLinkGoogleResult(.failure(error))

            await rig.viewModel.linkWithGoogle()

            #expect(rig.viewModel.linkFailureMessage == message)
            #expect(rig.store.load() == anonymous)
            #expect(rig.viewModel.isConfirmingExistingAccount == false)
        }
    }

    @Test func aProviderSwitchedOffDuringTheLinkRefreshesWhatIsOffered() async {
        let rig = await makeRig()
        rig.api.setLinkGoogleResult(.failure(APIError.linkProviderUnavailable))
        rig.api.setCapabilitiesResult(.success(AuthCapabilities(appleLoginEnabled: true, googleLoginMobileEnabled: false)))

        await rig.viewModel.linkWithGoogle()

        #expect(rig.viewModel.googleLinkAvailable == false)
        #expect(rig.viewModel.appleLinkAvailable)
    }

    // MARK: the identity already has an account

    @Test func anExistingAccountAsksForConfirmationAndChangesNothing() async {
        let rig = await makeRig()
        rig.api.setLinkAppleResult(.failure(APIError.accountAlreadyExists))
        _ = rig.viewModel.prepareAppleLink()

        await rig.viewModel.completeAppleLink(.success(appleCredential))

        #expect(rig.viewModel.isConfirmingExistingAccount)
        #expect(rig.viewModel.linkFailureMessage == nil)
        #expect(rig.store.load() == anonymous)
        #expect(rig.store.loadAnonymousBackup() == nil)
        #expect(rig.api.signInCalls.isEmpty)
        #expect(rig.api.mergeCalls.isEmpty)
    }

    @Test func enteringTheExistingAccountParksTheAnonymousSessionAndSignsInWithTheSameAppleCredential() async {
        let rig = await makeRig()
        rig.api.setLinkAppleResult(.failure(APIError.accountAlreadyExists))
        _ = rig.viewModel.prepareAppleLink()
        await rig.viewModel.completeAppleLink(.success(appleCredential))

        await rig.viewModel.enterExistingAccount()

        // The ordinary token route, with the credential the link attempt used.
        #expect(rig.api.signInCalls == [.init(
            identityToken: "apple-jwt", nonce: "raw-nonce", nombre: "Ana Pérez", authorizationCode: "code-1"
        )])
        #expect(rig.api.mergeCalls == ["tok-anon"], "the parked session's token goes to the merge")
        #expect(rig.store.loadAnonymousBackup() == nil, "merged, so the parked item is cleared")
        #expect(rig.store.load()?.isAnonymous == false)
        #expect(rig.store.load()?.token == "tok", "the session the token route returned")
        #expect(rig.session.isAnonymous == false)
        #expect(rig.viewModel.isConfirmingExistingAccount == false)
    }

    @Test func enteringTheExistingAccountWithGoogleUsesTheGoogleTokenRoute() async {
        let rig = await makeRig()
        rig.api.setLinkGoogleResult(.failure(APIError.accountAlreadyExists))
        await rig.viewModel.linkWithGoogle()

        await rig.viewModel.enterExistingAccount()

        #expect(rig.api.googleSignInCalls == ["google-jwt"])
        #expect(rig.api.mergeCalls == ["tok-anon"])
        #expect(rig.store.load()?.isAnonymous == false)
        #expect(rig.api.linkGoogleCalls == ["google-jwt"])
    }

    @Test func cancellingTheConfirmationSendsNothingMore() async {
        let rig = await makeRig()
        rig.api.setLinkGoogleResult(.failure(APIError.accountAlreadyExists))
        await rig.viewModel.linkWithGoogle()

        rig.viewModel.cancelExistingAccount()
        await rig.viewModel.enterExistingAccount()

        #expect(rig.viewModel.isConfirmingExistingAccount == false)
        #expect(rig.api.googleSignInCalls.isEmpty)
        #expect(rig.api.mergeCalls.isEmpty)
        #expect(rig.store.load() == anonymous)
        #expect(rig.store.loadAnonymousBackup() == nil)
    }

    @Test func ifTheAnonymousSessionCannotBeParkedNothingIsSignedIn() async {
        let api = FakeMirachAPI(capabilitiesResult: .success(bothProviders))
        api.setLinkGoogleResult(.failure(APIError.accountAlreadyExists))
        let session = SessionController(api: api, store: ParkFailingStore(session: anonymous))
        await session.start()
        let viewModel = PerfilViewModel(api: api, session: session, googleSignIn: FakeGoogleSignIn())
        await viewModel.load()
        await viewModel.linkWithGoogle()

        await viewModel.enterExistingAccount()

        #expect(api.googleSignInCalls.isEmpty)
        #expect(viewModel.linkFailureMessage == "No pudimos vincular la cuenta. Inténtalo de nuevo.")
        #expect(session.isAnonymous)
    }

    @Test func aFailedSignInToTheExistingAccountKeepsTheAnonymousSession() async {
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

        #expect(store.load() == anonymous)
        #expect(viewModel.linkFailureMessage == "Problema de conexión. Revisa tu conexión e inténtalo de nuevo.")
    }
}

/// A store whose second item cannot be written, to prove nothing is signed in without the backup.
private struct ParkFailingStore: SessionStore {
    let session: Session
    func load() -> Session? { session }
    func save(_ session: Session) throws {}
    func clear() throws {}
    func saveAnonymousBackup(_ session: Session) throws { throw KeychainSessionStore.KeychainError(status: -25299) }
    func loadAnonymousBackup() -> Session? { nil }
    func clearAnonymousBackup() throws {}
}
