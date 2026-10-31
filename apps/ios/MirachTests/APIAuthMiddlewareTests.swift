import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import Mirach

struct APIAuthMiddlewareTests {
    private let baseURL = URL(string: "https://example.test")!
    private let apiKeyName = HTTPField.Name("x-api-key")!
    private let appVersionName = HTTPField.Name("X-App-Version")!
    private let appPlatformName = HTTPField.Name("X-App-Platform")!

    /// Runs the middleware against `path` and returns the request that reached the transport.
    private func send(
        path: String,
        apiKey: String,
        session: String?,
        appVersion: String = "1.10.0"
    ) async throws -> HTTPRequest {
        let middleware = APIAuthMiddleware(apiKey: apiKey, appVersion: appVersion, sessionToken: { session })
        let request = HTTPRequest(method: .get, scheme: nil, authority: nil, path: path)
        let captured = Captured()
        _ = try await middleware.intercept(
            request, body: nil, baseURL: baseURL, operationID: "test"
        ) { request, body, _ in
            captured.set(request)
            return (HTTPResponse(status: .ok), body)
        }
        return captured.value!
    }

    @Test func addsApiKeyAndBearerOnApiPaths() async throws {
        let request = try await send(path: "/api/resumen?mes=2026-09", apiKey: "k", session: "tok")

        #expect(request.headerFields[apiKeyName] == "k")
        #expect(request.headerFields[.authorization] == "Bearer tok")
    }

    @Test func skipsEmptyApiKey() async throws {
        let request = try await send(path: "/api/resumen", apiKey: "", session: "tok")

        #expect(request.headerFields[apiKeyName] == nil)
        #expect(request.headerFields[.authorization] == "Bearer tok")
    }

    @Test func skipsMissingOrEmptySession() async throws {
        for session in [nil, ""] as [String?] {
            let request = try await send(path: "/api/resumen", apiKey: "k", session: session)
            #expect(request.headerFields[apiKeyName] == "k")
            #expect(request.headerFields[.authorization] == nil)
        }
    }

    @Test func sendsAppVersionAndPlatformOnEveryRequest() async throws {
        for path in ["/api/config", "/api/resumen", "/version"] {
            let request = try await send(path: path, apiKey: "k", session: nil)
            #expect(request.headerFields[appVersionName] == "1.10.0")
            #expect(request.headerFields[appPlatformName] == "ios")
        }
    }

    @Test func skipsEmptyAppVersion() async throws {
        let request = try await send(path: "/api/config", apiKey: "k", session: nil, appVersion: "")

        #expect(request.headerFields[appVersionName] == nil)
        #expect(request.headerFields[appPlatformName] == "ios")
    }

    @Test func neverTouchesNonApiPaths() async throws {
        for path in ["/version", "/apiary", "/other/api/x"] {
            let request = try await send(path: path, apiKey: "k", session: "tok")
            #expect(request.headerFields[apiKeyName] == nil)
            #expect(request.headerFields[.authorization] == nil)
        }
    }
}

private final class Captured: @unchecked Sendable {
    private let lock = NSLock()
    private var request: HTTPRequest?
    func set(_ request: HTTPRequest) { lock.withLock { self.request = request } }
    var value: HTTPRequest? { lock.withLock { request } }
}
