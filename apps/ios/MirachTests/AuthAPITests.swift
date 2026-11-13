import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// Callback counter for "the session expired" notifications.
private final class ExpiryCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _tokens: [String] = []
    func fire(_ token: String) { lock.withLock { _tokens.append(token) } }
    var count: Int { lock.withLock { _tokens.count } }
    var tokens: [String] { lock.withLock { _tokens } }
}

struct AuthAPITests {
    private let serverURL = URL(string: "https://example.test")!
    private let loginBody = #"{"token":"tok-abc","userId":"u-1","expiresAt":"2026-10-04T12:00:00.000Z"}"#
    private func unauthorized(_ code: String) -> String {
        #"{"message":"x","code":"\#(code)"}"#
    }

    private func makeAPI(
        _ transport: FakeTransport,
        expiry: ExpiryCounter = ExpiryCounter(),
        token: String? = "tok-sent"
    ) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { token }, onSessionExpired: { expiry.fire($0) }
        )
    }

    /// The JSON body of the first request, parsed (the encoder's spacing is not our contract).
    private func sentJSON(_ transport: FakeTransport) throws -> [String: Any] {
        let text = try #require(transport.bodies.first)
        return try #require(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
    }

    // MARK: anonymous account

    @Test func signInAnonymouslySendsTheLegalVersionsAndMapsAnAnonymousSession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).signInAnonymously()

        #expect(session.token == "tok-abc")
        #expect(session.userId == "u-1")
        #expect(session.expiresAt == Date(timeIntervalSince1970: 1_791_115_200))
        #expect(session.isAnonymous)
        #expect(transport.requests.first?.path == "/api/auth/anonimo")
        let sent = try sentJSON(transport)
        #expect(sent["versionTerminos"] as? String == LegalDocuments.version)
        #expect(sent["versionPrivacidad"] as? String == LegalDocuments.version)
    }

    @Test func signInAnonymouslyMapsEveryDocumentedFailure() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.unauthorized, unauthorized("API_KEY_INVALIDA"), .apiKeyRejected),
            (.tooManyRequests, "", .rateLimited),
            (.badRequest, #"{"code":"TERMINOS_NO_ACEPTADOS","message":"x"}"#, .badStatus(400)),
            (.badRequest, "{}", .badStatus(400)),
            (.serviceUnavailable, #"{"code":"SERVICIO_NO_DISPONIBLE","message":"x"}"#, .badStatus(503)),
            (.serviceUnavailable, "<html>Bad gateway</html>", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let transport = FakeTransport.json(body, status: status)
            await #expect(throws: expected) { _ = try await makeAPI(transport).signInAnonymously() }
        }
    }

    // MARK: link an anonymous account

    private func conflict(_ code: String) -> String { #"{"message":"x","code":"\#(code)"}"# }

    @Test func linkWithAppleSendsTheCredentialWithoutTheLegalVersionsAndMapsAOrdinarySession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).linkWithApple(
            identityToken: "jwt", nonce: "raw-nonce", nombre: "Ana Pérez", authorizationCode: "code-1"
        )

        #expect(session.token == "tok-abc")
        #expect(session.isAnonymous == false)
        #expect(transport.requests.first?.path == "/api/cuenta/vincular/apple")
        let sent = try sentJSON(transport)
        #expect(sent["identityToken"] as? String == "jwt")
        #expect(sent["nonce"] as? String == "raw-nonce")
        #expect(sent["nombre"] as? String == "Ana Pérez")
        #expect(sent["authorizationCode"] as? String == "code-1")
        #expect(sent["versionTerminos"] == nil)
    }

    @Test func linkWithGoogleSendsTheIdTokenAndMapsAOrdinarySession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).linkWithGoogle(idToken: "google-jwt")

        #expect(session.token == "tok-abc")
        #expect(session.isAnonymous == false)
        #expect(transport.requests.first?.path == "/api/cuenta/vincular/google")
        #expect(try sentJSON(transport)["idToken"] as? String == "google-jwt")
    }

    @Test func aLinkConflictReachesTheCallerAsATypedError() async {
        let cases: [(String, APIError)] = [
            ("CUENTA_YA_EXISTE", .accountAlreadyExists),
            ("CUENTA_NO_ANONIMA", .accountNotAnonymous),
        ]
        for (code, expected) in cases {
            let apple = FakeTransport.json(conflict(code), status: .conflict)
            await #expect(throws: expected) {
                _ = try await makeAPI(apple).linkWithApple(
                    identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: nil
                )
            }
            let google = FakeTransport.json(conflict(code), status: .conflict)
            await #expect(throws: expected) { _ = try await makeAPI(google).linkWithGoogle(idToken: "g") }
        }
    }

    @Test func linkMapsTheOtherDocumentedFailures() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.notFound, "", .linkProviderUnavailable),
            (.tooManyRequests, "", .rateLimited),
            (.badRequest, #"{"code":"IDENTIDAD_INVALIDA","message":"x"}"#, .badStatus(400)),
            (.serviceUnavailable, "<html>Bad gateway</html>", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let transport = FakeTransport.json(body, status: status)
            await #expect(throws: expected) { _ = try await makeAPI(transport).linkWithGoogle(idToken: "g") }
        }
    }

    @Test func aLinkRejectedWithSesionInvalidaNotifiesTheExpiryRelay() async {
        let counter = ExpiryCounter()
        let transport = FakeTransport.json(unauthorized("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expiry: counter).linkWithGoogle(idToken: "g")
        }
        #expect(counter.tokens == ["tok-sent"])
    }

    // MARK: merge an anonymous account (ADR-014)

    private let mergeBody = """
    {"cuentasMovidas":1,"cuentasUnidas":0,"movimientosMovidos":5,"duplicadosOmitidos":0,\
    "categoriasMovidas":0,"patronesMovidos":0}
    """

    @Test func mergeSendsTheOriginTokenToTheMergeRoute() async throws {
        let transport = FakeTransport.json(mergeBody)

        try await makeAPI(transport).mergeAnonymousAccount(originToken: "tok-origin")

        #expect(transport.requests.first?.path == "/api/cuenta/fusionar")
        #expect(try sentJSON(transport)["tokenOrigen"] as? String == "tok-origin")
    }

    @Test func aMergeConflictReachesTheCallerAsATypedError() async {
        let cases: [(String, APIError)] = [
            ("ORIGEN_INVALIDO", .mergeOriginInvalid),
            ("DESTINO_ANONIMO", .mergeDestinationAnonymous),
        ]
        for (code, expected) in cases {
            let transport = FakeTransport.json(conflict(code), status: .conflict)
            await #expect(throws: expected) { _ = try await makeAPI(transport).mergeAnonymousAccount(originToken: "t") }
        }
    }

    @Test func mergeMapsTheOtherDocumentedFailures() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.tooManyRequests, "", .rateLimited),
            (.badRequest, #"{"code":"BODY_INVALIDO","message":"x"}"#, .badStatus(400)),
            (.serviceUnavailable, "<html>Bad gateway</html>", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let transport = FakeTransport.json(body, status: status)
            await #expect(throws: expected) { _ = try await makeAPI(transport).mergeAnonymousAccount(originToken: "t") }
        }
    }

    @Test func aMergeRejectedWithSesionInvalidaNotifiesTheExpiryRelayWithTheCallersToken() async {
        let counter = ExpiryCounter()
        let transport = FakeTransport.json(unauthorized("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expiry: counter).mergeAnonymousAccount(originToken: "tok-origin")
        }
        #expect(counter.tokens == ["tok-sent"])
    }

    // MARK: sign in with Apple

    @Test func signInWithAppleSendsTokenNonceAndNameAndMapsTheSession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "raw-nonce", nombre: "Ana Pérez", authorizationCode: nil
        )

        #expect(session.token == "tok-abc")
        #expect(session.userId == "u-1")
        #expect(session.expiresAt == Date(timeIntervalSince1970: 1_791_115_200))
        #expect(transport.requests.first?.path == "/api/auth/apple/token")
        let sent = try sentJSON(transport)
        #expect(sent["identityToken"] as? String == "jwt")
        #expect(sent["nonce"] as? String == "raw-nonce")
        #expect(sent["nombre"] as? String == "Ana Pérez")
    }

    @Test func signInWithAppleOmitsTheNameWhenAppleDidNotProvideIt() async throws {
        let transport = FakeTransport.json(loginBody)

        _ = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: nil
        )

        #expect(try sentJSON(transport).keys.contains("nombre") == false)
    }

    @Test func signInWithAppleSendsTheAuthorizationCodeWhenPresent() async throws {
        let transport = FakeTransport.json(loginBody)

        _ = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: "one-time-code"
        )

        #expect(try sentJSON(transport)["authorizationCode"] as? String == "one-time-code")
    }

    @Test func signInWithAppleSendsTheAcceptedLegalVersions() async throws {
        let transport = FakeTransport.json(loginBody)

        _ = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: nil
        )

        let body = try sentJSON(transport)
        #expect(body["versionTerminos"] as? String == LegalDocuments.version)
        #expect(body["versionPrivacidad"] as? String == LegalDocuments.version)
    }

    @Test func signInWithAppleOmitsTheAuthorizationCodeWhenThereIsNone() async throws {
        let transport = FakeTransport.json(loginBody)

        _ = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: nil
        )

        #expect(try sentJSON(transport).keys.contains("authorizationCode") == false)
    }

    @Test func signInWithAppleMapsEveryDocumentedFailure() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.unauthorized, unauthorized("CREDENCIALES_INVALIDAS"), .invalidCredentials),
            (.unauthorized, unauthorized("API_KEY_INVALIDA"), .apiKeyRejected),
            (.notFound, "", .appleSignInUnavailable),
            (.tooManyRequests, "", .rateLimited),
            (.badRequest, #"{"code":"BODY_INVALIDO","message":"x"}"#, .badStatus(400)),
            (.badRequest, "{}", .badStatus(400)),
            (.serviceUnavailable, #"{"code":"SERVICIO_NO_DISPONIBLE","message":"x"}"#, .badStatus(503)),
            (.serviceUnavailable, "{}", .badStatus(503)),
            (.serviceUnavailable, "<html>Bad gateway</html>", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let counter = ExpiryCounter()
            let transport = FakeTransport.json(body, status: status)

            await #expect(throws: expected) {
                _ = try await makeAPI(transport, expiry: counter).signInWithApple(
                    identityToken: "jwt", nonce: "n", nombre: nil, authorizationCode: nil
                )
            }
            #expect(counter.count == 0, "a failed sign-in is not an expired session")
        }
    }

    // MARK: sign in with Google

    @Test func signInWithGoogleSendsTheIdTokenAndLegalVersionsAndMapsTheSession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).signInWithGoogle(idToken: "google-jwt")

        #expect(session.token == "tok-abc")
        #expect(session.userId == "u-1")
        #expect(transport.requests.first?.path == "/api/auth/google/token")
        let sent = try sentJSON(transport)
        #expect(sent["idToken"] as? String == "google-jwt")
        #expect(sent["versionTerminos"] as? String == LegalDocuments.version)
        #expect(sent["versionPrivacidad"] as? String == LegalDocuments.version)
    }

    @Test func signInWithGoogleMapsEveryDocumentedFailure() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.unauthorized, unauthorized("CREDENCIALES_INVALIDAS"), .invalidCredentials),
            (.unauthorized, unauthorized("API_KEY_INVALIDA"), .apiKeyRejected),
            (.notFound, "", .googleSignInUnavailable),
            (.tooManyRequests, "", .rateLimited),
            (.badRequest, #"{"code":"BODY_INVALIDO","message":"x"}"#, .badStatus(400)),
            (.badRequest, "{}", .badStatus(400)),
            (.serviceUnavailable, #"{"code":"SERVICIO_NO_DISPONIBLE","message":"x"}"#, .badStatus(503)),
            (.serviceUnavailable, "<html>Bad gateway</html>", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let counter = ExpiryCounter()
            let transport = FakeTransport.json(body, status: status)

            await #expect(throws: expected) {
                _ = try await makeAPI(transport, expiry: counter).signInWithGoogle(idToken: "google-jwt")
            }
            #expect(counter.count == 0, "a failed sign-in is not an expired session")
        }
    }

    // MARK: sign in with email and password

    @Test func signInWithPasswordSendsTheCredentialsAndMapsTheSession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).signInWithPassword(email: "rev@example.com", password: "s3cret")

        #expect(session == Session(
            token: "tok-abc", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_791_115_200)
        ))
        #expect(transport.requests.first?.path == "/api/auth/login")
        let sent = try sentJSON(transport)
        #expect(sent["email"] as? String == "rev@example.com")
        #expect(sent["password"] as? String == "s3cret")
    }

    @Test func signInWithPasswordMapsEveryDocumentedFailure() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.unauthorized, unauthorized("CREDENCIALES_INVALIDAS"), .invalidCredentials),
            (.unauthorized, unauthorized("API_KEY_INVALIDA"), .apiKeyRejected),
            (.tooManyRequests, "", .rateLimited),
            (.serviceUnavailable, "{}", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let counter = ExpiryCounter()
            let transport = FakeTransport.json(body, status: status)

            await #expect(throws: expected) {
                _ = try await makeAPI(transport, expiry: counter).signInWithPassword(email: "a@b.cl", password: "x")
            }
            #expect(counter.count == 0, "a failed sign-in is not an expired session")
        }
    }

    // MARK: current user

    @Test func currentUserMapsTheResponse() async throws {
        let transport = FakeTransport.json(
            #"{"userId":"u-1","nombre":"Ana","googleVinculado":false}"#
        )

        let user = try await makeAPI(transport).currentUser()

        #expect(user == CurrentUser(userId: "u-1", nombre: "Ana"))
        #expect(transport.requests.first?.path == "/api/auth/me")
    }

    @Test func rejectedSessionIsReportedAndNotifiedExactlyOnce() async {
        let counter = ExpiryCounter()
        let transport = FakeTransport.json(unauthorized("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expiry: counter).currentUser()
        }

        #expect(counter.tokens == ["tok-sent"], "the notification names the session that was rejected")
    }

    @Test func rejectionWithoutAnyTokenHasNoSessionToExpire() async {
        let counter = ExpiryCounter()
        let transport = FakeTransport.json(unauthorized("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expiry: counter, token: nil).currentUser()
        }

        #expect(counter.count == 0)
    }

    @Test func rejectedApiKeyIsNotASessionExpiry() async {
        let counter = ExpiryCounter()
        let transport = FakeTransport.json(unauthorized("API_KEY_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.apiKeyRejected) {
            _ = try await makeAPI(transport, expiry: counter).currentUser()
        }

        #expect(counter.count == 0, "signing in again would not fix a wrong client key")
    }

    // MARK: capabilities

    @Test func capabilitiesMapAppleFlag() async throws {
        let transport = FakeTransport.json(
            #"{"appleLoginEnabled":true,"googleLoginEnabled":false,"googleLoginMobileEnabled":false,"passwordLoginEnabled":false}"#
        )

        let capabilities = try await makeAPI(transport).authCapabilities()

        #expect(capabilities == AuthCapabilities(appleLoginEnabled: true))
        #expect(transport.requests.first?.path == "/api/auth/capabilities")
    }

    @Test func capabilitiesMapThePasswordFlag() async throws {
        let on = FakeTransport.json(
            #"{"appleLoginEnabled":false,"googleLoginEnabled":false,"googleLoginMobileEnabled":false,"passwordLoginEnabled":true}"#
        )
        let off = FakeTransport.json(
            #"{"appleLoginEnabled":true,"googleLoginEnabled":false,"googleLoginMobileEnabled":false,"passwordLoginEnabled":false}"#
        )

        let enabled = try await makeAPI(on).authCapabilities()
        let disabled = try await makeAPI(off).authCapabilities()

        #expect(enabled == AuthCapabilities(appleLoginEnabled: false, passwordLoginEnabled: true))
        #expect(disabled.passwordLoginEnabled == false)
    }

    @Test func capabilitiesMapTheGoogleMobileFlagAndIgnoreTheWebOne() async throws {
        let mobile = FakeTransport.json(
            #"{"appleLoginEnabled":true,"googleLoginEnabled":false,"googleLoginMobileEnabled":true,"passwordLoginEnabled":false}"#
        )
        let webOnly = FakeTransport.json(
            #"{"appleLoginEnabled":true,"googleLoginEnabled":true,"googleLoginMobileEnabled":false,"passwordLoginEnabled":false}"#
        )

        #expect(try await makeAPI(mobile).authCapabilities().googleLoginMobileEnabled)
        #expect(try await makeAPI(webOnly).authCapabilities().googleLoginMobileEnabled == false)
    }

    @Test func capabilitiesRejectedKeyIsReported() async {
        let transport = FakeTransport.json(unauthorized("API_KEY_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.apiKeyRejected) {
            _ = try await makeAPI(transport).authCapabilities()
        }
    }
}
