import Foundation
import HTTPTypes
import Testing
@testable import Mirach

/// The statement-processing consent (PRI-02) through the real generated client and a fake
/// transport: whether a `cartolas` consent is in force, and how it is accepted.
struct ConsentimientosAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private func makeAPI(_ transport: FakeTransport, expired: @escaping @Sendable (String) -> Void = { _ in }) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(
            serverURL: serverURL, transport: transport,
            currentToken: { "tok" }, onSessionExpired: expired
        )
    }

    private static func list(_ items: String) -> String { #"{"consentimientos":[\#(items)]}"# }

    private static let cartolasInForce =
        #"{"tipo":"cartolas","version":"2026-11-03","aceptadoEn":"2026-11-04T10:00:00.000Z","revocadoEn":null}"#
    private static let cartolasRevoked =
        #"{"tipo":"cartolas","version":"2026-11-03","aceptadoEn":"2026-11-04T10:00:00.000Z","revocadoEn":"2026-11-04T11:00:00.000Z"}"#
    private static let terminos =
        #"{"tipo":"terminos","version":"2026-11-03","aceptadoEn":"2026-11-04T10:00:00.000Z","revocadoEn":null}"#

    // MARK: GET /api/consentimientos

    @Test func aCartolasConsentWithoutRevocationIsInForce() async throws {
        let transport = FakeTransport.json(Self.list([Self.terminos, Self.cartolasInForce].joined(separator: ",")))

        let result = try await makeAPI(transport).consentimientos()

        #expect(result == Consentimientos(cartolasVigente: true))
        #expect(transport.requests.first?.method == .get)
        #expect(transport.requests.first?.path == "/api/consentimientos")
    }

    @Test func aRevokedCartolasConsentIsNotInForce() async throws {
        let transport = FakeTransport.json(Self.list([Self.terminos, Self.cartolasRevoked].joined(separator: ",")))

        let result = try await makeAPI(transport).consentimientos()

        #expect(result == Consentimientos(cartolasVigente: false))
    }

    @Test func withoutACartolasConsentNothingIsInForce() async throws {
        let transport = FakeTransport.json(Self.list(Self.terminos))

        let result = try await makeAPI(transport).consentimientos()

        #expect(result == Consentimientos(cartolasVigente: false))
    }

    @Test func consentimientosSendsAnExpiredSessionThroughTheSingleRelay() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])

        await #expect(throws: APIError.sessionExpired) {
            _ = try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } }).consentimientos()
        }
        #expect(expired.value == ["tok"])
    }

    // MARK: POST /api/consentimientos

    @Test func acceptingSendsTheCartolasTypeWithTheLegalVersion() async throws {
        let transport = FakeTransport.json(Self.cartolasInForce, status: .created)

        try await makeAPI(transport).aceptarConsentimientoCartolas()

        #expect(transport.requests.first?.method == .post)
        #expect(transport.requests.first?.path == "/api/consentimientos")
        let body = try #require(transport.bodies.first)
        let json = try #require(try JSONSerialization.jsonObject(with: Data(body.utf8)) as? [String: String])
        #expect(json == ["tipo": "cartolas", "version": "2026-11-03"])
        #expect(LegalDocuments.version == "2026-11-03")
    }

    @Test func acceptingSendsAnExpiredSessionThroughTheSingleRelay() async {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let expired = LockedBox<[String]>([])

        await #expect(throws: APIError.sessionExpired) {
            try await makeAPI(transport, expired: { token in expired.mutate { $0.append(token) } })
                .aceptarConsentimientoCartolas()
        }
        #expect(expired.value == ["tok"])
    }

    @Test func acceptingReportsAnUnexpectedStatus() async {
        let transport = FakeTransport.json(#"{"message":"x"}"#, status: .internalServerError)

        await #expect(throws: APIError.badStatus(500)) {
            try await makeAPI(transport).aceptarConsentimientoCartolas()
        }
    }
}
