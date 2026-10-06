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
    /// Debug builds only: `-uiTestFixturePath <file>` makes the Subir screen offer a button that
    /// picks that file, because XCUITest cannot drive the system document picker.
    static let fixturePathArgument = "-uiTestFixturePath"

    private static let logger = Logger(subsystem: "app.mirachbudget.ios", category: "configuration")

    /// Everything the root view needs.
    struct Dependencies {
        let api: any MirachAPI
        let store: any SessionStore
        let session: SessionController
        let expiryRelay: SessionExpiryRelay
        /// Private copies of the statement being uploaded.
        let staging: any CartolaStaging
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
                staging: TemporaryCartolaStaging(),
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
            api: api, store: store, session: session, expiryRelay: relay,
            staging: TemporaryCartolaStaging(), configurationProblem: problem
        )
    }

    /// The file named by `-uiTestFixturePath`, in Debug builds only (never in a release).
    static func uiTestFixtureURL(arguments: [String] = ProcessInfo.processInfo.arguments) -> URL? {
        #if DEBUG
        guard let index = arguments.firstIndex(of: fixturePathArgument), arguments.indices.contains(index + 1) else {
            return nil
        }
        return URL(fileURLWithPath: arguments[index + 1])
        #else
        return nil
        #endif
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

    /// Three months: a normal one (a bucket without state), a quieter one, and one with no income.
    func periodos() async throws -> [Periodo] {
        ["2026-09", "2026-08", "2026-07"].compactMap(Periodo.init)
    }

    /// A file whose name contains "protegida" behaves like a protected PDF whose password is
    /// `StubMirachAPI.pdfPassword`; any other file previews fine.
    static let pdfPassword = "correcta"

    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview {
        try checkPassword(file: file, password: password)
        return CartolaPreview(
            banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
            totalFilas: 42, duplicados: 5, nuevas: 37
        )
    }

    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult {
        try checkPassword(file: file, password: password)
        return CartolaCommitResult(totalTransacciones: 37, duplicadosOmitidos: 5)
    }

    private func checkPassword(file: CartolaFile, password: String?) throws {
        guard file.filename.contains("protegida") else { return }
        guard let password, !password.isEmpty else { throw IngestaError.passwordRequired }
        guard password == Self.pdfPassword else { throw IngestaError.passwordIncorrect }
    }

    func resumen(periodo: Periodo?) async throws -> ResumenMes {
        let periodo = periodo ?? Periodo("2026-09")!
        switch periodo.apiValue {
        case "2026-07":
            return ResumenMes(
                periodo: periodo, sinIngreso: true, totalIngreso: 0, estadoGlobal: nil,
                buckets: [
                    BucketResumen(bucket: .necesidades, total: 0, porcentajeBp: nil, metaBp: 5000, estado: nil),
                    BucketResumen(bucket: .deseos, total: 0, porcentajeBp: nil, metaBp: 3000, estado: nil),
                    BucketResumen(bucket: .ahorro, total: 0, porcentajeBp: nil, metaBp: 2000, estado: nil),
                ]
            )
        default:
            return ResumenMes(
                periodo: periodo, sinIngreso: false, totalIngreso: 1_850_000, estadoGlobal: .amarillo,
                buckets: [
                    BucketResumen(bucket: .necesidades, total: 912_500, porcentajeBp: 4932, metaBp: 5000, estado: .verde),
                    BucketResumen(bucket: .deseos, total: 610_400, porcentajeBp: 3300, metaBp: 3000, estado: .amarillo),
                    // No state yet: exercises the "label without state color" path.
                    BucketResumen(bucket: .ahorro, total: 120_000, porcentajeBp: 649, metaBp: 2000, estado: nil),
                ]
            )
        }
    }
}
