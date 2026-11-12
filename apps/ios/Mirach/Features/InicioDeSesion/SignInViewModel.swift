import AuthenticationServices
import Foundation
import Observation

/// Drives the sign-in screen (catalog: `primer-uso.md`): Apple and Google, plus the App Review
/// email and password form when the server enables it (ADR-051).
@MainActor
@Observable
final class SignInViewModel {
    enum State: Equatable {
        case loadingProviders
        /// At least one provider (Apple, Google, or the review password form) is available.
        case ready
        /// The server has every provider switched off.
        case noProviders
        case providersFailed(String)
        /// The sign-in API call is in flight; the buttons are disabled.
        case authenticating
    }

    /// Copy shown to the person (neutral Spanish, catalog rules).
    enum Message {
        static let connection = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        static let misconfigured = "La app no está configurada correctamente."
        static let invalidCredentials = "No se pudo iniciar sesión"
        static let passwordRejected = "Correo o contraseña incorrectos"
        static let rateLimited = "Demasiados intentos, intenta más tarde"
        static let appleFailed = "No pudimos iniciar sesión con Apple"
        static let googleFailed = "No pudimos iniciar sesión con Google"
        /// Screen 31: after an Apple failure, when Google is offered too.
        static let tryGoogle = "Si sigue sin funcionar, prueba con Google."
        static let checkConnection = "Revisa tu conexión a internet e inténtalo de nuevo."
        /// ADR-013: the first action of the screen and the warning under it (S4, S7).
        static let anonymousButton = "Continuar sin cuenta"
        static let anonymousWarning =
            "Tus datos quedan solo en este dispositivo. Si borras la app o cambias de teléfono sin vincular una cuenta, los pierdes."
        static let anonymousFailed = "No pudimos crear tu cuenta. Inténtalo de nuevo."
        static let saveFailed = "No pudimos guardar tu sesión en este dispositivo. Inténtalo de nuevo."
    }

    private(set) var state: State = .loadingProviders
    /// The last attempt's error, shown above the button. `nil` when there is none.
    private(set) var errorMessage: String?
    /// Second line of a real provider failure (screen 31). `nil` for every other error.
    private(set) var errorDetail: String?
    /// Third line of an Apple failure when Google is offered (screen 31). `nil` otherwise.
    private(set) var errorHint: String?
    /// What the server enabled; only meaningful once `state` is `.ready`.
    private(set) var appleLoginAvailable = false
    /// The server offers Google to the apps AND this build has a Google client.
    private(set) var googleLoginAvailable = false
    private(set) var passwordLoginAvailable = false

    private let api: any MirachAPI
    private let session: SessionController
    private let makeNonce: @Sendable () -> String
    private let googleSignIn: (any GoogleSignInLauncher)?
    /// The raw nonce of the attempt in progress. Single-use: cleared when the attempt ends.
    private var pendingNonce: String?

    init(
        api: any MirachAPI,
        session: SessionController,
        makeNonce: @escaping @Sendable () -> String = AppleNonce.random,
        googleSignIn: (any GoogleSignInLauncher)? = nil
    ) {
        self.api = api
        self.session = session
        self.makeNonce = makeNonce
        self.googleSignIn = googleSignIn
    }

    func loadProviders() async {
        state = .loadingProviders
        do {
            let capabilities = try await api.authCapabilities()
            appleLoginAvailable = capabilities.appleLoginEnabled
            googleLoginAvailable = capabilities.googleLoginMobileEnabled && googleSignIn != nil
            passwordLoginAvailable = capabilities.passwordLoginEnabled
            let anyProvider = appleLoginAvailable || googleLoginAvailable || passwordLoginAvailable
            state = anyProvider ? .ready : .noProviders
        } catch is CancellationError {
        } catch let error as URLError where error.code == .cancelled {
        } catch APIError.apiKeyRejected {
            state = .providersFailed(Message.misconfigured)
        } catch {
            state = .providersFailed(Message.connection)
        }
    }

    /// Called when the person taps the button, before Apple's sheet opens.
    /// Returns what Apple must receive as `request.nonce`: the SHA-256 of a fresh raw nonce.
    func prepareAppleRequest() -> String {
        let raw = makeNonce()
        pendingNonce = raw
        clearError()
        return AppleNonce.sha256Hex(raw)
    }

    /// Called with the outcome of Apple's sheet.
    func completeAppleSignIn(_ result: Result<AppleCredential, any Error>) async {
        // One nonce, one attempt: ignore a completion that has no matching request.
        guard state == .ready, let nonce = pendingNonce else { return }
        pendingNonce = nil

        switch result {
        case .failure(let error):
            // Closing the sheet is not an error: no message, no API call.
            if (error as? ASAuthorizationError)?.code == .canceled { return }
            showProviderFailure(.apple)
        case .success(let credential):
            await signIn(with: credential, nonce: nonce)
        }
    }

    private func signIn(with credential: AppleCredential, nonce: String) async {
        state = .authenticating
        let newSession: Session
        do {
            newSession = try await api.signInWithApple(
                identityToken: credential.identityToken, nonce: nonce, nombre: credential.fullName,
                authorizationCode: credential.authorizationCode
            )
        } catch {
            await handleSignInFailure(error, provider: .apple)
            return
        }
        store(newSession)
    }

    /// Called when the person taps "Continuar con Google". The buttons stay disabled from the
    /// tap until the API answers, so a second tap cannot open a second sheet.
    func signInWithGoogle() async {
        guard state == .ready, googleLoginAvailable, let googleSignIn else { return }
        clearError()
        state = .authenticating
        switch await googleSignIn.requestIdToken() {
        case .cancelled:
            state = .ready
        case .failed:
            state = .ready
            showProviderFailure(.google)
        case .success(let idToken):
            let newSession: Session
            do {
                newSession = try await api.signInWithGoogle(idToken: idToken)
            } catch {
                await handleSignInFailure(error, provider: .google)
                return
            }
            store(newSession)
        }
    }

    /// The same path for both providers: Keychain through the session controller.
    private func store(_ newSession: Session) {
        do {
            try session.signIn(newSession)
        } catch {
            errorMessage = Message.saveFailed
        }
        state = .ready
    }

    /// "Continuar sin cuenta": creates an anonymous account and enters the app. It needs no provider,
    /// so it also works when the server has every provider off. One attempt at a time.
    func continueWithoutAccount() async {
        let previous = state
        guard previous == .ready || previous == .noProviders else { return }
        clearError()
        state = .authenticating
        let newSession: Session
        do {
            newSession = try await api.signInAnonymously()
        } catch {
            state = previous
            switch error {
            case is CancellationError:
                break
            case let error as URLError where error.code == .cancelled:
                break
            case is URLError:
                errorMessage = Message.connection
            case APIError.rateLimited:
                errorMessage = Message.rateLimited
            case APIError.apiKeyRejected:
                errorMessage = Message.misconfigured
            default:
                errorMessage = Message.anonymousFailed
            }
            return
        }
        store(newSession)
        if state == .ready, previous == .noProviders { state = .noProviders }
    }

    /// Called by the review form. Both fields are required; the email is trimmed. On failure the
    /// view keeps what was typed. The password is never logged or stored here.
    func signInWithPassword(email: String, password: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        // One attempt at a time, and only when the server offers the form.
        guard state == .ready, passwordLoginAvailable, !email.isEmpty, !password.isEmpty else { return }
        clearError()
        state = .authenticating
        let newSession: Session
        do {
            newSession = try await api.signInWithPassword(email: email, password: password)
        } catch {
            await handleSignInFailure(error, rejected: Message.passwordRejected)
            return
        }
        store(newSession)
    }

    private func handleSignInFailure(
        _ error: any Error,
        rejected: String = Message.invalidCredentials,
        provider: Provider? = nil
    ) async {
        state = .ready
        switch error {
        case is CancellationError:
            break
        case let error as URLError where error.code == .cancelled:
            break
        case APIError.invalidCredentials:
            errorMessage = rejected
        case APIError.rateLimited:
            errorMessage = Message.rateLimited
        case APIError.apiKeyRejected:
            errorMessage = Message.misconfigured
        case APIError.appleSignInUnavailable, APIError.googleSignInUnavailable:
            // The provider was switched off on the server: ask again so its button disappears.
            await loadProviders()
        default:
            if let provider {
                showProviderFailure(provider)
            } else {
                errorMessage = Message.connection
            }
        }
    }

    private enum Provider {
        case apple, google
    }

    private func showProviderFailure(_ provider: Provider) {
        switch provider {
        case .apple:
            errorMessage = Message.appleFailed
            errorHint = googleLoginAvailable ? Message.tryGoogle : nil
        case .google:
            errorMessage = Message.googleFailed
            errorHint = nil
        }
        errorDetail = Message.checkConnection
    }

    private func clearError() {
        errorMessage = nil
        errorDetail = nil
        errorHint = nil
    }
}
