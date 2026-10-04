import Foundation
import OpenAPIURLSession

/// Composition root: decides which concrete dependencies the app uses.
enum AppEnvironment {
    /// UI tests launch the app with this argument to avoid the real network.
    /// Duplicated as a literal in MirachUITests.swift (separate bundle, cannot import this).
    static let stubbedClientArgument = "-uiTestStubbedClient"

    static func makeAPI(
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> any MirachAPI {
        if arguments.contains(stubbedClientArgument) {
            return StubMirachAPI()
        }
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = AppConfiguration.requestTimeout
        return OpenAPIMirachAPI(
            serverURL: AppConfiguration.apiBaseURL,
            transport: URLSessionTransport(
                configuration: .init(session: URLSession(configuration: configuration))
            ),
            // No session yet: sign in with Apple (T4) will provide the token.
            middlewares: [APIAuthMiddleware(apiKey: AppConfiguration.apiKey)]
        )
    }
}

/// Canned API used by UI tests (see `stubbedClientArgument`). Lives in the app
/// target because XCUITest runs the app as a separate process and can only
/// influence it through launch arguments.
struct StubMirachAPI: MirachAPI {
    func version() async throws -> VersionInfo {
        VersionInfo(version: "0.0.0-stub", commit: "stub123")
    }
}
