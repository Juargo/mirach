import Foundation
import HTTPTypes
import OpenAPIRuntime

/// Adds the credentials every `/api` call needs (ADR-047): the public client key
/// in `x-api-key` and the user's session as a Bearer token. Public endpoints
/// such as `/version` live outside `/api` and never get credentials.
///
/// Every request, `/api` or not, also says which app is calling (ADR-005 §4.4):
/// `X-App-Platform: ios` and `X-App-Version` (the bundle short version), so the
/// API can log it and `GET /api/config` can tell an outdated app to update.
struct APIAuthMiddleware: ClientMiddleware {
    private static let apiKeyName = HTTPField.Name("x-api-key")!
    private static let appVersionName = HTTPField.Name("X-App-Version")!
    private static let appPlatformName = HTTPField.Name("X-App-Platform")!
    static let platform = "ios"

    private let apiKey: String
    private let appVersion: String
    private let sessionToken: @Sendable () -> String?

    init(
        apiKey: String,
        appVersion: String = APIAuthMiddleware.bundleVersion(),
        sessionToken: @escaping @Sendable () -> String? = { nil }
    ) {
        self.apiKey = apiKey
        self.appVersion = appVersion
        self.sessionToken = sessionToken
    }

    /// `CFBundleShortVersionString` (`MARKETING_VERSION`), empty when absent.
    static func bundleVersion(_ bundle: Bundle = .main) -> String {
        bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? ""
    }

    func intercept(
        _ request: HTTPRequest,
        body: HTTPBody?,
        baseURL: URL,
        operationID: String,
        next: @Sendable (HTTPRequest, HTTPBody?, URL) async throws -> (HTTPResponse, HTTPBody?)
    ) async throws -> (HTTPResponse, HTTPBody?) {
        var request = request
        request.headerFields[Self.appPlatformName] = Self.platform
        if !appVersion.isEmpty {
            request.headerFields[Self.appVersionName] = appVersion
        }
        guard Self.isAPIPath(request.path) else {
            return try await next(request, body, baseURL)
        }
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
