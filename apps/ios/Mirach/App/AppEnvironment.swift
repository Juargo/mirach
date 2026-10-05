import Foundation
import OpenAPIRuntime
import OpenAPIURLSession
import os

/// Composition root: decides which concrete dependencies the app uses.
enum AppEnvironment {
    /// UI tests launch the app with these arguments to avoid the real network.
    /// Duplicated as literals in MirachUITests.swift (separate bundle, cannot import this).
    static let stubbedClientArgument = "-uiTestStubbedClient"
    /// With the stub: start with a saved session, as if the person had signed in before.
    static let savedSessionArgument = "-uiTestSavedSession"
    /// With the stub: pretend `MIRACH_API_KEY` is empty, to see the configuration error screen.
    static let missingAPIKeyArgument = "-uiTestMissingAPIKey"

    private static let logger = Logger(subsystem: "app.mirachbudget.ios", category: "configuration")

    /// Everything the root view needs.
    struct Dependencies {
        let api: any MirachAPI
        let store: any SessionStore
        let session: SessionController
        let expiryRelay: SessionExpiryRelay
        /// Non-nil when the build cannot work; the root view then shows an error screen.
        let configurationProblem: ConfigurationCheck.Problem?
    }

    /// `transport` and `store` exist so tests can wire the real middleware and adapter
    /// to fakes; the app passes neither.
    @MainActor
    static func make(
        arguments: [String] = ProcessInfo.processInfo.arguments,
        apiKey: String = AppConfiguration.apiKey,
        store: (any SessionStore)? = nil,
        transport: (any ClientTransport)? = nil
    ) -> Dependencies {
        let relay = SessionExpiryRelay()

        if arguments.contains(stubbedClientArgument) {
            let stubStore = InMemorySessionStore(
                session: arguments.contains(savedSessionArgument) ? StubMirachAPI.savedSession : nil
            )
            let api = StubMirachAPI()
            return Dependencies(
                api: api,
                store: stubStore,
                session: SessionController(api: api, store: stubStore),
                expiryRelay: relay,
                configurationProblem: arguments.contains(missingAPIKeyArgument) ? .missingAPIKey : nil
            )
        }

        let store = store ?? KeychainSessionStore()
        let problem = ConfigurationCheck.problem(apiKey: apiKey)
        if problem != nil { reportMissingAPIKey() }

        let api = OpenAPIMirachAPI(
            serverURL: AppConfiguration.apiBaseURL,
            transport: transport ?? defaultTransport(),
            // Reads the token from the store on every request, so sign-in and sign-out
            // take effect immediately without rebuilding the client.
            middlewares: [APIAuthMiddleware(apiKey: apiKey, sessionToken: { store.load()?.token })],
            currentToken: { store.load()?.token },
            // A 401 on an authenticated call lands here, in one place, naming the rejected token.
            onSessionExpired: { relay.fire(token: $0) }
        )
        let session = SessionController(api: api, store: store)
        relay.connect { token in await session.sessionExpired(token: token) }
        return Dependencies(
            api: api, store: store, session: session, expiryRelay: relay, configurationProblem: problem
        )
    }

    private static func defaultTransport() -> any ClientTransport {
        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForRequest = AppConfiguration.requestTimeout
        return URLSessionTransport(configuration: .init(session: URLSession(configuration: configuration)))
    }

    private static func reportMissingAPIKey() {
        logger.error("MIRACH_API_KEY is empty: copy Config/Secrets.example.xcconfig to Secrets.xcconfig and set it.")
        #if DEBUG
        // Crash early in development so it cannot go unnoticed; Release builds show an error
        // screen instead. Skipped while unit tests run (the test host has no key either).
        if ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] == nil {
            assertionFailure("MIRACH_API_KEY is empty. See apps/ios/README.md, \"Clave de la API y sesión\".")
        }
        #endif
    }
}

/// Canned API used by UI tests (see `stubbedClientArgument`). Lives in the app
/// target because XCUITest runs the app as a separate process and can only
/// influence it through launch arguments.
struct StubMirachAPI: MirachAPI {
    /// The session a UI test starts with when it passes `savedSessionArgument`.
    static let savedSession = Session(
        token: "stub-token", userId: "stub-user", expiresAt: Date(timeIntervalSince1970: 4_000_000_000)
    )

    func version() async throws -> VersionInfo {
        VersionInfo(version: "0.0.0-stub", commit: "stub123")
    }

    func authCapabilities() async throws -> AuthCapabilities {
        AuthCapabilities(appleLoginEnabled: true)
    }

    func signInWithApple(identityToken: String, nonce: String, nombre: String?) async throws -> Session {
        // Sign in with Apple cannot be automated, so UI tests never reach this.
        throw APIError.invalidCredentials
    }

    func currentUser() async throws -> CurrentUser {
        CurrentUser(userId: "stub-user", nombre: "Persona de prueba")
    }
}
