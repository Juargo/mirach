import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// The three Perfil calls through the real generated client and a fake transport.
struct PerfilAPITests {
    private let serverURL = URL(string: "https://example.test")!
    private func error(_ code: String) -> String { #"{"message":"x","code":"\#(code)"}"# }

    /// Notified tokens, to check the single place that notices an expired session.
    private final class Expiry: @unchecked Sendable {
        private let lock = NSLock()
        private var _tokens: [String] = []
        func fire(_ token: String) { lock.withLock { _tokens.append(token) } }
        var tokens: [String] { lock.withLock { _tokens } }
    }

    private func makeAPI(_ transport: FakeTransport, expiry: Expiry = Expiry()) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok-sent" }, onSessionExpired: { expiry.fire($0) }
        )
    }

    private func sentJSON(_ transport: FakeTransport) throws -> [String: String] {
        let text = try #require(transport.bodies.first)
        return try #require(try JSONSerialization.jsonObject(with: Data(text.utf8)) as? [String: String])
    }

    // MARK: current user with email

    @Test func currentUserMapsTheEmailAndAllowsItToBeNull() async throws {
        let withEmail = FakeTransport.json(
            #"{"userId":"u-1","nombre":"Ana","email":"ana@example.com","googleVinculado":false}"#
        )
        let withoutEmail = FakeTransport.json(
            #"{"userId":"u-1","nombre":"Ana","email":null,"googleVinculado":false}"#
        )

        #expect(try await makeAPI(withEmail).currentUser().email == "ana@example.com")
        #expect(try await makeAPI(withoutEmail).currentUser().email == nil)
    }

    // MARK: PATCH /api/perfil

    @Test func updateNombreSendsOnlyTheNameAndMapsTheUpdatedIdentity() async throws {
        let transport = FakeTransport.json(
            #"{"userId":"u-1","nombre":"Ana María","email":"ana@example.com","googleVinculado":false}"#
        )

        let user = try await makeAPI(transport).updateNombre("Ana María")

        #expect(user == CurrentUser(userId: "u-1", nombre: "Ana María", email: "ana@example.com"))
        #expect(transport.requests.first?.method == .patch)
        #expect(transport.requests.first?.path == "/api/perfil")
        #expect(try sentJSON(transport) == ["nombre": "Ana María"], "never email nor passwordActual")
    }

    @Test func updateNombreMapsTheInvalidNameCode() async {
        let transport = FakeTransport.json(error("NOMBRE_INVALIDO"), status: .badRequest)

        await #expect(throws: PerfilError.invalidName) { _ = try await makeAPI(transport).updateNombre("") }
    }

    @Test func updateNombreTreatsOtherAnswersAsServerFailures() async {
        let cases: [(HTTPResponse.Status, String, APIError)] = [
            (.badRequest, error("OTRO"), .badStatus(400)),
            (.forbidden, error("PERFIL_RECHAZADO"), .badStatus(403)),
            (.serviceUnavailable, "{}", .badStatus(503)),
        ]
        for (status, body, expected) in cases {
            let transport = FakeTransport.json(body, status: status)
            await #expect(throws: expected) { _ = try await makeAPI(transport).updateNombre("Ana") }
        }
    }

    @Test func updateNombreRejectedSessionIsNotifiedOnce() async {
        let expiry = Expiry()
        let transport = FakeTransport.json(error("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expiry: expiry).updateNombre("Ana")
        }
        #expect(expiry.tokens == ["tok-sent"])
    }

    // MARK: POST /api/auth/logout

    @Test func logoutPostsAndAccepts204() async throws {
        let transport = FakeTransport.json("", status: .noContent)

        try await makeAPI(transport).logout()

        #expect(transport.requests.first?.method == .post)
        #expect(transport.requests.first?.path == "/api/auth/logout")
    }

    @Test func logoutReportsAFailedCall() async {
        await #expect(throws: APIError.apiKeyRejected) {
            try await makeAPI(FakeTransport.json(error("API_KEY_INVALIDA"), status: .unauthorized)).logout()
        }
        await #expect(throws: APIError.badStatus(503)) {
            try await makeAPI(FakeTransport.json("{}", status: .serviceUnavailable)).logout()
        }
    }

    // MARK: DELETE /api/cuenta

    @Test func deleteAccountSendsTheExactConfirmationBody() async throws {
        let transport = FakeTransport.json("", status: .noContent)

        try await makeAPI(transport).deleteAccount(confirmation: "ELIMINAR")

        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path == "/api/cuenta")
        #expect(try sentJSON(transport) == ["confirmacion": "ELIMINAR"])
    }

    @Test func deleteAccountMapsTheRejectedConfirmation() async {
        let transport = FakeTransport.json(error("CONFIRMACION_INVALIDA"), status: .badRequest)

        await #expect(throws: CuentaError.confirmationRejected) {
            try await makeAPI(transport).deleteAccount(confirmation: "eliminar")
        }
    }

    @Test func deleteAccountRejectedSessionIsNotifiedOnce() async {
        let expiry = Expiry()
        let transport = FakeTransport.json(error("SESION_INVALIDA"), status: .unauthorized)

        await #expect(throws: APIError.sessionExpired) {
            try await makeAPI(transport, expiry: expiry).deleteAccount(confirmation: "ELIMINAR")
        }
        #expect(expiry.tokens == ["tok-sent"])
    }

    @Test func deleteAccountTreatsOtherAnswersAsServerFailures() async {
        await #expect(throws: APIError.badStatus(500)) {
            try await makeAPI(FakeTransport.json("{}", status: .internalServerError))
                .deleteAccount(confirmation: "ELIMINAR")
        }
        await #expect(throws: APIError.badStatus(400)) {
            try await makeAPI(FakeTransport.json(error("OTRO"), status: .badRequest))
                .deleteAccount(confirmation: "ELIMINAR")
        }
    }
}
