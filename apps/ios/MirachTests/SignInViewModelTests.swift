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
        nonce: @escaping @Sendable () -> String = AppleNonce.random,
        google: FakeGoogleSignIn? = nil
    ) -> Harness {
        let memory = InMemorySessionStore()
        let session = SessionController(api: api, store: store ?? memory)
        return Harness(
            viewModel: SignInViewModel(api: api, session: session, makeNonce: nonce, googleSignIn: google),
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

    // MARK: continue without an account

    private func anonymousHarness(
        _ api: FakeMirachAPI = FakeMirachAPI(), capabilities: AuthCapabilities? = nil
    ) async -> Harness {
        if let capabilities { api.setCapabilitiesResult(.success(capabilities)) }
        let h = makeHarness(api: api)
        await h.viewModel.loadProviders()
        return h
    }

    @Test func continuingWithoutAnAccountStoresAnAnonymousSessionAndEntersTheApp() async {
        let h = await anonymousHarness()

        await h.viewModel.continueWithoutAccount()

        #expect(h.api.anonymousSignInCalls == 1)
        #expect(h.store.load()?.token == "tok-anon")
        #expect(h.store.load()?.isAnonymous == true)
        #expect(h.session.isAnonymous)
        #expect(h.session.phase == .signedIn(userId: "u-anon"))
        #expect(h.viewModel.errorMessage == nil)
        #expect(h.viewModel.state == .ready)
    }

    @Test func continuingWithoutAnAccountWorksWhenEveryProviderIsOff() async {
        let h = await anonymousHarness(capabilities: AuthCapabilities(appleLoginEnabled: false))
        #expect(h.viewModel.state == .noProviders)

        await h.viewModel.continueWithoutAccount()

        #expect(h.session.phase == .signedIn(userId: "u-anon"))
    }

    @Test func continuingWithoutAnAccountIsIgnoredBeforeTheProvidersLoad() async {
        let h = makeHarness()

        await h.viewModel.continueWithoutAccount()

        #expect(h.api.anonymousSignInCalls == 0)
        #expect(h.store.load() == nil)
    }

    @Test func continuingWithoutAnAccountMapsFailuresToTheScreenMessages() async {
        let cases: [(any Error, String)] = [
            (URLError(.notConnectedToInternet), SignInViewModel.Message.connection),
            (APIError.rateLimited, SignInViewModel.Message.rateLimited),
            (APIError.apiKeyRejected, SignInViewModel.Message.misconfigured),
            (APIError.badStatus(503), SignInViewModel.Message.anonymousFailed),
        ]
        for (error, message) in cases {
            let api = FakeMirachAPI()
            api.setAnonymousSignInResult(.failure(error))
            let h = await anonymousHarness(api)

            await h.viewModel.continueWithoutAccount()

            #expect(h.viewModel.errorMessage == message)
            #expect(h.viewModel.state == .ready)
            #expect(h.store.load() == nil)
        }
    }

    @Test func anAnonymousSessionThatCannotBeSavedShowsTheSaveError() async {
        let h = makeHarness(store: FailingSessionStore())
        await h.viewModel.loadProviders()

        await h.viewModel.continueWithoutAccount()

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.saveFailed)
    }

    @Test func theCopyOfTheAnonymousEntryIsTheOneOfTheSpec() {
        #expect(SignInViewModel.Message.anonymousButton == "Continuar sin cuenta")
        #expect(SignInViewModel.Message.anonymousWarning
            == "Tus datos quedan solo en este dispositivo. Si borras la app o cambias de teléfono sin vincular una cuenta, los pierdes.")
    }

    @Test func appleSignInStillStoresAnOrdinarySession() async {
        let h = makeHarness(nonce: { "raw" })
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.store.load()?.isAnonymous == false)
        #expect(h.session.isAnonymous == false)
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
        #expect(h.viewModel.errorMessage == "No pudimos iniciar sesión con Apple")
        #expect(h.viewModel.errorDetail == "Revisa tu conexión a internet e inténtalo de nuevo.")
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

    @Test func connectionFailureShowsTheProviderFailure() async {
        let h = makeHarness(api: FakeMirachAPI(signInResult: .failure(URLError(.timedOut))))
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.appleFailed)
        #expect(h.viewModel.errorDetail == SignInViewModel.Message.checkConnection)
        #expect(h.viewModel.state == .ready)
    }

    @Test func aRejectedCredentialIsNotReportedAsAProviderFailure() async {
        let h = makeHarness(api: FakeMirachAPI(signInResult: .failure(APIError.invalidCredentials)))
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()

        await h.viewModel.completeAppleSignIn(.success(credential))

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.invalidCredentials)
        #expect(h.viewModel.errorDetail == nil)
    }

    @Test func aNewAttemptClearsTheProviderFailure() async {
        let h = makeHarness()
        await h.viewModel.loadProviders()
        _ = h.viewModel.prepareAppleRequest()
        await h.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.failed)))

        _ = h.viewModel.prepareAppleRequest()

        #expect(h.viewModel.errorMessage == nil)
        #expect(h.viewModel.errorDetail == nil)
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

    // MARK: Google

    private let bothProviders = AuthCapabilities(appleLoginEnabled: true, googleLoginMobileEnabled: true)

    private func googleHarness(
        _ google: FakeGoogleSignIn = FakeGoogleSignIn(),
        api: FakeMirachAPI = FakeMirachAPI()
    ) async -> Harness {
        api.setCapabilitiesResult(.success(bothProviders))
        let h = makeHarness(api: api, google: google)
        await h.viewModel.loadProviders()
        return h
    }

    @Test func googleNeedsTheServerFlagAndAClientConfiguredInTheApp() async {
        let offered = await googleHarness()
        #expect(offered.viewModel.googleLoginAvailable)

        let noClient = makeHarness(api: FakeMirachAPI(capabilitiesResult: .success(bothProviders)))
        await noClient.viewModel.loadProviders()
        #expect(!noClient.viewModel.googleLoginAvailable)

        let switchedOff = makeHarness(google: FakeGoogleSignIn())
        await switchedOff.viewModel.loadProviders()
        #expect(!switchedOff.viewModel.googleLoginAvailable)
    }

    @Test func googleOnlyIsNotTheEmptyState() async {
        let api = FakeMirachAPI(capabilitiesResult: .success(AuthCapabilities(appleLoginEnabled: false, googleLoginMobileEnabled: true)))
        let h = makeHarness(api: api, google: FakeGoogleSignIn())
        await h.viewModel.loadProviders()
        #expect(h.viewModel.state == .ready)
    }

    @Test func googleSuccessSendsTheIdTokenAndSavesTheSession() async {
        let h = await googleHarness(FakeGoogleSignIn(result: .success(idToken: "google-jwt")))

        await h.viewModel.signInWithGoogle()

        #expect(h.api.googleSignInCalls == ["google-jwt"])
        #expect(h.store.load()?.token == "tok")
        #expect(h.session.phase == .signedIn(userId: "u-1"))
        #expect(h.viewModel.errorMessage == nil)
    }

    @Test func cancellingGoogleIsNotAnError() async {
        let h = await googleHarness(FakeGoogleSignIn(result: .cancelled))

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.state == .ready)
        #expect(h.viewModel.errorMessage == nil)
        #expect(h.api.googleSignInCalls.isEmpty, "a cancelled sheet never reaches the API")
    }

    @Test func aGoogleSheetFailureShowsTheGoogleFailureWithoutCallingTheAPI() async {
        let h = await googleHarness(FakeGoogleSignIn(result: .failed))

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.state == .ready)
        #expect(h.viewModel.errorMessage == "No pudimos iniciar sesión con Google")
        #expect(h.viewModel.errorDetail == "Revisa tu conexión a internet e inténtalo de nuevo.")
        #expect(h.api.googleSignInCalls.isEmpty)
    }

    @Test func aGoogleConnectionFailureShowsTheGoogleFailure() async {
        let h = await googleHarness(api: FakeMirachAPI(googleSignInResult: .failure(URLError(.timedOut))))

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.googleFailed)
        #expect(h.viewModel.errorDetail == SignInViewModel.Message.checkConnection)
        #expect(h.viewModel.state == .ready)
    }

    @Test func aRejectedGoogleTokenShowsTheOpaqueMessageAndSavesNothing() async {
        let h = await googleHarness(api: FakeMirachAPI(googleSignInResult: .failure(APIError.invalidCredentials)))

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.errorMessage == SignInViewModel.Message.invalidCredentials)
        #expect(h.viewModel.errorDetail == nil)
        #expect(h.store.load() == nil)
    }

    @Test func googleSwitchedOffOnTheServerReloadsTheProviders() async {
        let api = FakeMirachAPI(googleSignInResult: .failure(APIError.googleSignInUnavailable))
        let h = await googleHarness(api: api)
        api.setCapabilitiesResult(.success(AuthCapabilities(appleLoginEnabled: true)))

        await h.viewModel.signInWithGoogle()

        #expect(api.capabilitiesCalls == 2)
        #expect(!h.viewModel.googleLoginAvailable)
        #expect(h.viewModel.state == .ready)
    }

    @Test func aSecondGoogleTapWhileTheFirstIsInFlightIsIgnored() async {
        let gate = Gate()
        let google = FakeGoogleSignIn(result: .success(idToken: "google-jwt"), gate: gate)
        let h = await googleHarness(google)

        let attempt = Task { await h.viewModel.signInWithGoogle() }
        while h.viewModel.state != .authenticating { await Task.yield() }
        await h.viewModel.signInWithGoogle()
        await gate.open()
        await attempt.value

        #expect(google.calls == 1)
        #expect(h.api.googleSignInCalls.count == 1)
    }

    @Test func anAppleFailureSuggestsGoogleOnlyWhenItIsOffered() async {
        let withGoogle = await googleHarness()
        _ = withGoogle.viewModel.prepareAppleRequest()
        await withGoogle.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.failed)))
        #expect(withGoogle.viewModel.errorHint == "Si sigue sin funcionar, prueba con Google.")

        let appleOnly = makeHarness()
        await appleOnly.viewModel.loadProviders()
        _ = appleOnly.viewModel.prepareAppleRequest()
        await appleOnly.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.failed)))
        #expect(appleOnly.viewModel.errorHint == nil)
    }

    @Test func aGoogleFailureDoesNotSuggestGoogle() async {
        let h = await googleHarness(FakeGoogleSignIn(result: .failed))

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.errorHint == nil)
    }

    @Test func aNewGoogleAttemptClearsThePreviousFailure() async {
        let google = FakeGoogleSignIn(result: .failed)
        let h = await googleHarness(google)
        await h.viewModel.signInWithGoogle()

        google.result = .cancelled
        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.errorMessage == nil)
        #expect(h.viewModel.errorDetail == nil)
    }

    @Test func aNewAttemptClearsTheHintLeftByAnAppleFailure() async {
        let google = FakeGoogleSignIn(result: .cancelled)
        let h = await googleHarness(google)
        _ = h.viewModel.prepareAppleRequest()
        await h.viewModel.completeAppleSignIn(.failure(ASAuthorizationError(.failed)))
        #expect(h.viewModel.errorHint != nil)

        await h.viewModel.signInWithGoogle()

        #expect(h.viewModel.errorHint == nil)
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

/// Stands in for Google's sheet: answers `result`, optionally after `gate` opens.
@MainActor
final class FakeGoogleSignIn: GoogleSignInLauncher {
    var result: GoogleSignInResult
    private let gate: Gate?
    private(set) var calls = 0

    init(result: GoogleSignInResult = .success(idToken: "google-jwt"), gate: Gate? = nil) {
        self.result = result
        self.gate = gate
    }

    func requestIdToken() async -> GoogleSignInResult {
        calls += 1
        if let gate { await gate.wait() }
        return result
    }
}
