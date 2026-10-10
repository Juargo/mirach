import AuthenticationServices
import Foundation
import Testing
@testable import Mirach

@MainActor
struct SignInViewModelTests {
    private let credential = AppleCredential(identityToken: "apple-jwt", fullName: "Ana Pérez")

    private struct Harness {
        let viewModel: SignInViewModel
        let api: FakeMirachAPI
        let store: InMemorySessionStore
        let session: SessionController
    }

    private func makeHarness(
        api: FakeMirachAPI = FakeMirachAPI(),
        store: (any SessionStore)? = nil,
        nonce: @escaping @Sendable () -> String = AppleNonce.random
    ) -> Harness {
        let memory = InMemorySessionStore()
        let session = SessionController(api: api, store: store ?? memory)
        return Harness(
            viewModel: SignInViewModel(api: api, session: session, makeNonce: nonce),
            api: api, store: memory, session: session
        )
    }

    // MARK: providers

    @Test func startsLoadingProviders() {
        #expect(makeHarness().viewModel.state == .loadingProviders)
    }

    @Test func showsTheAppleButtonWhenTheServerEnablesIt() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .ready)
    }

    @Test func showsTheEmptyStateWhenNoProviderIsEnabled() async {
        let h = makeHarness(api: FakeMirachAPI(capabilitiesResult: .success(AuthCapabilities(appleLoginEnabled: false))))
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .noProviders)
    }

    @Test func connectionErrorWhileLoadingProvidersOffersRetry() async {
        let h = makeHarness(api: FakeMirachAPI(capabilitiesResult: .failure(URLError(.notConnectedToInternet))))
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .providersFailed(SignInViewModel.Message.connection))
    }

    @Test func rejectedKeyWhileLoadingProvidersSaysTheAppIsMisconfigured() async {
        let h = makeHarness(api: FakeMirachAPI(capabilitiesResult: .failure(APIError.apiKeyRejected)))
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .providersFailed(SignInViewModel.Message.misconfigured))
    }

    @Test func hidesThePasswordPathUnlessTheServerEnablesIt() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        #expect(h.viewModel.appleLoginAvailable)
        #expect(!h.viewModel.passwordLoginAvailable)
    }

    @Test func offersThePasswordPathBesideApple() async {
        let caps = AuthCapabilities(appleLoginEnabled: true, passwordLoginEnabled: true)
        let h = makeHarness(api: FakeMirachAPI(capabilitiesResult: .success(caps)))
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .ready)
        #expect(h.viewModel.appleLoginAvailable)
        #expect(h.viewModel.passwordLoginAvailable)
    }

    @Test func passwordOnlyIsNotTheEmptyState() async {
        let caps = AuthCapabilities(appleLoginEnabled: false, passwordLoginEnabled: true)
        let h = makeHarness(api: FakeMirachAPI(capabilitiesResult: .success(caps)))
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .ready)
        #expect(!h.viewModel.appleLoginAvailable)
        #expect(h.viewModel.passwordLoginAvailable)
    }

    // MARK: password sign-in

    private func passwordHarness(_ api: FakeMirachAPI = FakeMirachAPI()) async -> Harness {
        api.setCapabilitiesResult(.success(AuthCapabilities(appleLoginEnabled: true, passwordLoginEnabled: true)))
        let h = makeHarness(api: api)
        await h.viewModel.loadProviders()
        return h
    }

    @Test func passwordSuccessSavesTheSessionLikeApple() async {
        let h = await passwordHarness()

        await h.viewModel.signInWithPassword(email: "  rev@example.com ", password: "s3cret")

        #expect(h.api.passwordSignInCalls == [.init(email: "rev@example.com", password: "s3cret")])
        #expect(h.store.load()?.token == "tok-pw")
        #expect(h.session.phase == .signedIn(userId: "u-1"))
        #expect(h.viewModel.errorMessage == nil)
    }

    @Test func passwordRejectedShowsTheSpecificMessageAndSavesNothing() async {
        let h = await passwordHarness(FakeMirachAPI(passwordSignInResult: .failure(APIError.invalidCredentials)))

        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x")

        #expect(h.viewModel.errorMessage == "Correo o contraseña incorrectos")
        #expect(h.viewModel.state == .ready)
        #expect(h.store.load() == nil)
    }

    @Test func passwordRateLimitSaysToTryLater() async {
        let h = await passwordHarness(FakeMirachAPI(passwordSignInResult: .failure(APIError.rateLimited)))

        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x")

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.rateLimited)
    }

    @Test func passwordConnectionFailureShowsTheConnectionMessage() async {
        let h = await passwordHarness(FakeMirachAPI(passwordSignInResult: .failure(URLError(.timedOut))))

        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x")

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.connection)
        #expect(h.viewModel.state == .ready)
    }

    @Test func passwordSessionThatCannotBeSavedShowsAnError() async {
        let api = FakeMirachAPI(capabilitiesResult: .success(
            AuthCapabilities(appleLoginEnabled: true, passwordLoginEnabled: true)
        ))
        let h = makeHarness(api: api, store: FailingSessionStore())
        await h.viewModel.loadProviders()

        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x")

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.saveFailed)
        #expect(h.viewModel.state == .ready)
    }

    @Test func submittingDisablesTheFormUntilTheAnswerArrives() async {
        let gate = Gate()
        let api = FakeMirachAPI()
        api.holdPasswordSignIn(with: gate)
        let h = await passwordHarness(api)

        let attempt = Task { await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x") }
        while h.viewModel.state != .authenticating { await Task.yield() }
        // A second tap while the first is in flight must not send another request.
        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "x")
        await gate.open()
        await attempt.value

        #expect(h.api.passwordSignInCalls.count == 1)
        #expect(h.viewModel.state == .ready)
    }

    @Test func emptyFieldsNeverReachTheAPI() async {
        let h = await passwordHarness()

        await h.viewModel.signInWithPassword(email: "   ", password: "x")
        await h.viewModel.signInWithPassword(email: "a@b.cl", password: "")

        #expect(h.api.passwordSignInCalls.isEmpty)
    }

    // MARK: success

    @Test func successSendsTheRawNonceAndNameAndSavesTheSession() async throws {
        let h = makeHarness()
        await h.viewModel.loadProviders()

        let hashedForApple = h.viewModel.prepareAppleRequest()
        await h.viewModel.completeAppleSignIn(.success(credential))

        let call = try #require(h.api.signInCalls.first)
        #expect(call.identityToken == "apple-jwt")
        #expect(call.nombre == "Ana Pérez")
        // Apple received the SHA-256 of what the server receives raw (the server re-hashes it).
        #expect(AppleNonce.sha256Hex(call.nonce) == hashedForApple)
        #expect(h.store.load()?.token == "tok")
        #expect(h.session.phase == .signedIn(userId: "u-1"))
        #expect(h.viewModel.errorMessage == nil)
    }

    @Test func successSendsTheAuthorizationCodeFromTheCredential() async throws {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(
            AppleCredential(identityToken: "apple-jwt", fullName: nil, authorizationCode: "code-1")
        ))

        #expect(h.api.signInCalls.first?.authorizationCode == "code-1")
    }

    @Test func signInStillProceedsWithoutAnAuthorizationCode() async throws {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.api.signInCalls.first?.authorizationCode == nil)
        #expect(h.session.phase == .signedIn(userId: "u-1"))
    }

    @Test func authorizationCodeIsDecodedAsUTF8OrOmitted() {
        #expect(AppleCredential.authorizationCode(from: Data("c1.abc".utf8)) == "c1.abc")
        #expect(AppleCredential.authorizationCode(from: nil) == nil)
        #expect(AppleCredential.authorizationCode(from: Data()) == nil)
        #expect(AppleCredential.authorizationCode(from: Data([0xFF, 0xFE, 0xFD])) == nil)
    }

    @Test func eachAttemptUsesANewNonce() {
        let viewModel = makeHarness().viewModel
        #expect(viewModel.prepareAppleRequest() != viewModel.prepareAppleRequest())
    }

    @Test func nonceIsSha256InLowercaseHex() {
        // Known vector: SHA-256("abc")
        #expect(AppleNonce.sha256Hex("abc")
            == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad")
    }

    @Test func randomNonceIsLongHex() {
        let nonce = AppleNonce.random()
        #expect(nonce.count == 64)
        #expect(nonce.allSatisfy { $0.isHexDigit })
    }

    // MARK: cancel and failures

    @Test func cancellingTheAppleSheetIsNotAnError() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.canceled)))

        #expect(h.viewModel.state == .ready)
        #expect(h.viewModel.errorMessage == nil)
        #expect(h.api.signInCalls.isEmpty, "a cancelled sheet never reaches the API")
    }

    @Test func otherAppleFailuresShowAGenericMessageWithoutCallingTheAPI() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.failed)))

        #expect(h.viewModel.state == .ready)
        #expect(h.viewModel.errorMessage == SignInViewModel.Message.appleFailed)
        #expect(h.api.signInCalls.isEmpty)
    }

    @Test func rejectedCredentialsShowTheOpaqueMessageAndSaveNothing() async {
        let h = makeHarness(api: FakeMirachAPI(signInResult: .failure(APIError.invalidCredentials)))
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == "No se pudo iniciar sesión")
        #expect(h.viewModel.state == .ready, "the button is available again")
        #expect(h.store.load() == nil)
        #expect(h.session.phase == .validating)
    }

    @Test func tooManyAttemptsShowsItsOwnMessage() async {
        let h = makeHarness(api: FakeMirachAPI(signInResult: .failure(APIError.rateLimited)))
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == "Demasiados intentos, intenta más tarde")
    }

    @Test func connectionFailureShowsTheConnectionMessage() async {
        let h = makeHarness(api: FakeMirachAPI(signInResult: .failure(URLError(.timedOut))))
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.connection)
        #expect(h.viewModel.state == .ready)
    }

    @Test func appleSwitchedOffOnTheServerReloadsTheProviders() async {
        let api = FakeMirachAPI(signInResult: .failure(APIError.appleSignInUnavailable))
        let h = makeHarness(api: api)
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()
        api.setCapabilitiesResult(.success(AuthCapabilities(appleLoginEnabled: false)))

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(api.capabilitiesCalls == 2)
        #expect(h.viewModel.state == .noProviders)
    }

    @Test func sessionThatCannotBeSavedShowsAnErrorAndStaysSignedOut() async {
        let h = makeHarness(store: FailingSessionStore())
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.saveFailed)
        #expect(h.viewModel.state == .ready)
        #expect(h.session.phase != .signedIn(userId: "u-1"))
    }

    @Test func aSecondCompletionWithoutANewRequestIsRejected() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()
        await h.viewModel.completeAppleSignIn(.success(credential))

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.api.signInCalls.count == 1, "a nonce is single-use")
    }

    // MARK: Apple name

    @Test func displayNameJoinsGivenAndFamilyNameAndOmitsEmpties() {
        var name = PersonNameComponents()
        name.givenName = "Ana"
        name.familyName = "Pérez"
        #expect(AppleCredential.displayName(from: name) == "Ana Pérez")
        #expect(AppleCredential.displayName(from: nil) == nil)
        #expect(AppleCredential.displayName(from: PersonNameComponents()) == nil)
    }
}
