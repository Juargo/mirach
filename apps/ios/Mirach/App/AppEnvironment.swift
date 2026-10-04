import Foundation

/// Composition root: decides which concrete dependencies the app uses.
enum AppEnvironment {
    /// UI tests launch the app with this argument to avoid the real network.
    /// Duplicated as a literal in MirachUITests.swift (separate bundle, cannot import this).
    static let stubbedClientArgument = "-uiTestStubbedClient"

    static func makeHTTPClient(
        arguments: [String] = ProcessInfo.processInfo.arguments
    ) -> any HTTPClient {
        arguments.contains(stubbedClientArgument)
            ? StubHTTPClient.version
            : URLSessionHTTPClient()
    }
}
