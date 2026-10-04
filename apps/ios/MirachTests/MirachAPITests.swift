import Foundation
import Testing
@testable import Mirach

struct MirachAPITests {
    private let serverURL = URL(string: "https://example.test")!

    private func makeAPI(_ transport: FakeTransport) -> OpenAPIMirachAPI {
        OpenAPIMirachAPI(serverURL: serverURL, transport: transport)
    }

    @Test func mapsVersionResponseToVersionInfo() async throws {
        let body = #"{"version":"1.2.3","commit":"abc1234","ref":"main","builtAt":"2026-10-04T00:00:00Z"}"#
        let transport = FakeTransport.json(body)

        let info = try await makeAPI(transport).version()

        #expect(info == VersionInfo(version: "1.2.3", commit: "abc1234"))
        #expect(transport.requests.first?.path == "/version")
    }

    @Test func mapsUndocumentedStatusToBadStatus() async {
        let transport = FakeTransport.json("{}", status: .serviceUnavailable)

        await #expect(throws: APIError.badStatus(503)) {
            _ = try await makeAPI(transport).version()
        }
    }

    @Test func rethrowsTransportErrorsUnwrapped() async {
        let transport = FakeTransport.failing(URLError(.notConnectedToInternet))

        await #expect(throws: URLError(.notConnectedToInternet)) {
            _ = try await makeAPI(transport).version()
        }
    }

    @Test func preservesURLErrorCancelled() async {
        let transport = FakeTransport.failing(URLError(.cancelled))

        await #expect(throws: URLError(.cancelled)) {
            _ = try await makeAPI(transport).version()
        }
    }

    @Test func reportsMalformedBodyAsDecodingError() async {
        let transport = FakeTransport.json(#"{"unexpected":1}"#)

        do {
            _ = try await makeAPI(transport).version()
            Issue.record("expected a decoding error")
        } catch {
            #expect(error is DecodingError)
        }
    }
}
