import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// Callback counter for "the session expired" notifications.
private final class ExpiryCounter: @unchecked Sendable {
    private let lock = NSLock()
    private var _count = 0
    func fire() { lock.withLock { _count += 1 } }
    var count: Int { lock.withLock { _count } }
}

struct AuthAPITests {
    private let serverURL = URL(string: "https://example.test")!
    private let loginBody = #"{"token":"tok-abc","userId":"u-1","expiresAt":"2026-10-04T12:00:00.000Z"}"#
    private func unauthorized(_ code: String) -> String {
        #"{"message":"x","code":"\#(code)"}"#
    }

    private func makeAPI(_ transport: FakeTransport, expiry: ExpiryCounter = ExpiryCounter()) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport, onSessionExpired: { expiry.fire() })
    }

    /// The JSON body of the first request, parsed (the encoder's spacing is not our contract).
    private func sentJSON(_ transport: FakeTransport) throws -> [String: Any] {
        let text = try #require(transport.bodies.first)
        return try #require(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: Any])
    }

    // MARK: sign in with Apple

    @Test func signInWithAppleSendsTokenNonceAndNameAndMapsTheSession() async throws {
        let transport = FakeTransport.json(loginBody)

        let session = try await makeAPI(transport).signInWithApple(
            identityToken: "jwt", nonce: "raw-nonce", nombre: "Ana Pérez"
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

        _ = try await makeAPI(transport).signInWithApple(identityToken: "jwt", nonce: "n", nombre: nil)

        #expect(try sentJSON(transport).keys.contains("nombre") == false)
    }

    @Test func signInWithAppleMapsEveryDocumentedFailure() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.unauthorized, unauthorized("CREDENCIALES_INVALIDAS"), .invalidCredentials),
            (.unauthorized, unauthorized("API_KEY_INVALIDA"), .apiKeyRejected),
            (.notFound, "", .appleSignInUnavailable),
            (.tooManyRequests, "", .rateLimited),
            (.serviceUnavailable, "{}", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let counter = ExpiryCounter()
            let transport = FakeTransport.json(body, status: status)

            await #expect(throws: expected) {
                _ = try await makeAPI(transport, expiry: counter).signInWithApple(
                    identityToken: "jwt", nonce: "n", nombre: nil
                )
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

        #expect(counter.count == 1)
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
            #"{"appleLoginEnabled":true,"googleLoginEnabled":false,"googleLoginMobileEnabled":false}"#
        )

        let capabilities = try await makeAPI(transport).authCapabilities()

        #expect(capabilities == AuthCapabilities(appleLoginEnabled: true))
        #expect(transport.requests.first?.path == "/api/auth/capabilities")
    }

    @Test func capabilitiesRejectedKeyIsReported() async {
        let transport = FakeTransport.json(unauthorized("API_KEY_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.apiKeyRejected) {
            _ = try await makeAPI(transport).authCapabilities()
        }
    }
}
