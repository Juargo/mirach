import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Adds the credentials every `/api` call needs (ADR-047): the public client key
/// in `x-api-key` and the user's session as a Bearer token. Public endpoints
/// such as `/version` live outside `/api` and are never touched.
struct APIAuthMiddleware: ClientMiddleware {
    private static let apiKeyName = HTTPField.Name("x-api-key")!

    private let apiKey: String
    private let sessionToken: @Sendable () -> String?

    init(apiKey: String, sessionToken: @escaping @Sendable () -> String? = { nil }) {
        self.apiKey = apiKey
        self.sessionToken = sessionToken
    }

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        guard Self.isAPIPath(request.path) else {
            return try await next(request, body, baseURL)
        }
        var request = request
        if !apiKey.isEmpty {
            request.headerFields[Self.apiKeyName] = apiKey
        }
        if let token = sessionToken(), !token.isEmpty {
            request.headerFields[.authorization] = "Bearer \(token)"
        }
        return try await next(request, body, baseURL)
    }

    /// `/api` or anything under `/api/`, ignoring the query string.
    private static func isAPIPath(_ path: String?) -> Bool {
        guard let path else { return false }
        let route = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)[0]
        return route == "/api" || route.hasPrefix("/api/")
    }
}
