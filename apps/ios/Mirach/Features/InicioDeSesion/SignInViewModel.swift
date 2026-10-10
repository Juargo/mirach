import AuthenticationServices
import Foundation
import Observation

/// Drives the sign-in screen (catalog: `inicio-de-sesion.md`): Apple, plus the App Review
/// email and password form when the server enables it (ADR-051).
@MainActor
@Observable
final class SignInViewModel {
    enum State: Equatable {
        case loadingProviders
        /// At least one provider (Apple, or the review password form) is available.
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
        static let appleFailed = "No se pudo completar el inicio de sesión con Apple. Inténtalo de nuevo."
        static let saveFailed = "No pudimos guardar tu sesión en este dispositivo. Inténtalo de nuevo."
    }

    private(set) var state: State = .loadingProviders
    /// The last attempt's error, shown under the button. `nil` when there is none.
    private(set) var errorMessage: String?
    /// What the server enabled; only meaningful once `state` is `.ready`.
    private(set) var appleLoginAvailable = false
    private(set) var passwordLoginAvailable = false

    private let api: any MirachAPI
    private let session: SessionController
    private let makeNonce: @Sendable () -> String
    /// The raw nonce of the attempt in progress. Single-use: cleared when the attempt ends.
    private var pendingNonce: String?

    init(
        api: any MirachAPI,
        session: SessionController,
        makeNonce: @escaping @Sendable () -> String = AppleNonce.random
    ) {
        self.api = api
        self.session = session
        self.makeNonce = makeNonce
    }

    func loadProviders() async {
        state = .loadingProviders
        do {
            let capabilities = try await api.authCapabilities()
            appleLoginAvailable = capabilities.appleLoginEnabled
            passwordLoginAvailable = capabilities.passwordLoginEnabled
            state = appleLoginAvailable || passwordLoginAvailable ? .ready : .noProviders
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
        errorMessage = nil
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
            errorMessage = Message.appleFailed
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
            await handleSignInFailure(error)
            return
        }
        store(newSession)
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

    /// Called by the review form. Both fields are required; the email is trimmed. On failure the
    /// view keeps what was typed. The password is never logged or stored here.
    func signInWithPassword(email: String, password: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        // One attempt at a time, and only when the server offers the form.
        guard state == .ready, passwordLoginAvailable, !email.isEmpty, !password.isEmpty else { return }
        errorMessage = nil
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

    private func handleSignInFailure(_ error: any Error, rejected: String = Message.invalidCredentials) async {
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
        case APIError.appleSignInUnavailable:
            // Apple was switched off on the server: ask again so the button disappears.
            await loadProviders()
        default:
            errorMessage = Message.connection
        }
    }
}
