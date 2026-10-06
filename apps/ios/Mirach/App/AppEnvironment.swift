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
        /// The upload flow, built once here so SwiftUI re-creating views never rebuilds it
        /// (a rebuilt one would lose the file and password of a flow in progress).
        let subir: SubirCartolaViewModel
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
        transport: (any ClientTransport)? = nil,
        staging: (any CartolaStaging)? = nil
    ) -> Dependencies {
        let relay = SessionExpiryRelay()
        let staging = staging ?? TemporaryCartolaStaging()
        // Once per launch, before any flow exists: copies left by a run that was killed midway.
        staging.purgeAll()

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
                staging: staging,
                subir: SubirCartolaViewModel(api: api, staging: staging),
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
            staging: staging, subir: SubirCartolaViewModel(api: api, staging: staging),
            configurationProblem: problem
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

    /// The stub's catalog: two real categories per bucket plus the internal «Desconocido».
    static let catalog = CatalogoCategorias(categorias: [
        CategoriaCatalogo(id: "stub-nec-desc", nombre: "Desconocido", bucket: .necesidades),
        CategoriaCatalogo(id: "stub-nec-super", nombre: "Supermercado", bucket: .necesidades),
        CategoriaCatalogo(id: "stub-nec-transp", nombre: "Transporte", bucket: .necesidades),
        CategoriaCatalogo(id: "stub-des-desc", nombre: "Desconocido", bucket: .deseos),
        CategoriaCatalogo(id: "stub-des-rest", nombre: "Restaurantes", bucket: .deseos),
        CategoriaCatalogo(id: "stub-des-susc", nombre: "Suscripciones", bucket: .deseos),
        CategoriaCatalogo(id: "stub-aho-desc", nombre: "Desconocido", bucket: .ahorro),
        CategoriaCatalogo(id: "stub-aho-fondo", nombre: "Fondo de emergencia", bucket: .ahorro),
    ])

    /// Statement of the stub: row 1 has no suggestion, row 3 is an income, rows 5 and 6 were
    /// already loaded. Dates are the first days of October 2026 (UTC midnight, as the API sends).
    private static let rows: [CartolaRow] = {
        func row(
            _ index: Int, _ description: String, cargo: Int = 0, abono: Int = 0, duplicate: Bool = false,
            _ suggestion: CartolaRow.Suggestion?
        ) -> CartolaRow {
            CartolaRow(
                rowIndex: index, fecha: Date(timeIntervalSince1970: 1_790_985_600 + Double(index) * 86_400),
                descripcion: description, cargo: cargo, abono: abono, esDuplicado: duplicate, sugerido: suggestion
            )
        }
        return [
            row(0, "COMPRA LIDER EXPRESS PROVIDENCIA", cargo: 25_990, .init(bucket: .necesidades, categoriaId: "stub-nec-super")),
            row(1, "TRANSF A JUAN PEREZ", cargo: 40_000, nil),
            row(2, "RESTAURANT LA PUNTA", cargo: 18_500, .init(bucket: .deseos, categoriaId: "stub-des-rest")),
            row(3, "ABONO SUELDO", abono: 1_200_000, nil),
            row(4, "NETFLIX.COM", cargo: 9_990, .init(bucket: .deseos, categoriaId: "stub-des-susc")),
            row(5, "COPEC ESTACION 114", cargo: 30_000, duplicate: true, .init(bucket: .necesidades, categoriaId: "stub-nec-transp")),
            row(6, "METRO DE SANTIAGO", cargo: 1_650, duplicate: true, .init(bucket: .necesidades, categoriaId: "stub-nec-transp")),
            // Two more transfers to the same person: a pattern made from row 1 matches them.
            row(7, "TRANSF A JUAN PEREZ", cargo: 15_000, nil),
            row(8, "TRANSF A JUAN PEREZ", cargo: 22_000, nil),
        ]
    }()

    /// Categories created through the stub, with the pattern that reclassifies later previews.
    private let created = StubCreatedCategories()

    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview {
        try checkPassword(file: file, password: password)
        let rows = created.apply(to: Self.rows)
        return CartolaPreview(
            banco: "Banco de Chile", tipoCuenta: "Cuenta Corriente", numeroCuenta: "00-123-45678-09",
            totalFilas: rows.count, duplicados: 2, nuevas: rows.count - 2, filas: rows
        )
    }

    func categorias() async throws -> CatalogoCategorias {
        CatalogoCategorias(categorias: Self.catalog.categorias + created.categories)
    }

    /// An empty name or one that exists already is refused like the server does.
    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo {
        let name = new.nombre.trimmingCharacters(in: .whitespaces)
        guard !name.isEmpty, name.count <= 40 else { throw CategoriaError.invalidName }
        let all = Self.catalog.categorias + created.categories
        guard !all.contains(where: { $0.nombre.lowercased() == name.lowercased() }) else {
            throw CategoriaError.duplicateName
        }
        return created.add(name: name, bucket: new.bucket, pattern: new.patron)
    }

    /// With edits, the answer reports how many the stub received as `totalTransacciones`, so a
    /// UI test can assert the exact count; an edit that names a duplicate row or a category
    /// outside the catalog is refused like the real server does (400, nothing saved).
    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult {
        try checkPassword(file: file, password: password)
        if edits.isEmpty { return CartolaCommitResult(totalTransacciones: 37, duplicadosOmitidos: 5) }
        for edit in edits {
            let row = Self.rows.first { $0.rowIndex == edit.rowIndex }
            guard let row, !row.esDuplicado, (Self.catalog.categoria(id: edit.categoriaId) != nil || created.categories.contains { $0.id == edit.categoriaId }) else {
                throw IngestaError.rejected(message: "Ediciones inválidas")
            }
        }
        return CartolaCommitResult(totalTransacciones: edits.count, duplicadosOmitidos: 2)
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

/// State of the stub's created categories (the stub itself is a value type).
private final class StubCreatedCategories: @unchecked Sendable {
    private let lock = NSLock()
    private var entries: [(category: CategoriaCatalogo, pattern: String?)] = []

    var categories: [CategoriaCatalogo] { lock.withLock { entries.map(\.category) } }

    func add(name: String, bucket: Bucket, pattern: String?) -> CategoriaCatalogo {
        lock.withLock {
            let category = CategoriaCatalogo(id: "stub-new-\(entries.count + 1)", nombre: name, bucket: bucket)
            let text = pattern?.trimmingCharacters(in: .whitespaces)
            entries.append((category, text?.isEmpty == false ? text : nil))
            return category
        }
    }

    /// Rows with no suggestion whose description contains a created pattern take its category.
    func apply(to rows: [CartolaRow]) -> [CartolaRow] {
        let current = lock.withLock { entries }
        return rows.map { row in
            guard row.sugerido == nil,
                  let match = current.first(where: { entry in
                      entry.pattern.map { row.descripcion.lowercased().contains($0.lowercased()) } ?? false
                  })
            else { return row }
            return CartolaRow(
                rowIndex: row.rowIndex, fecha: row.fecha, descripcion: row.descripcion, cargo: row.cargo,
                abono: row.abono, esDuplicado: row.esDuplicado,
                sugerido: .init(bucket: match.category.bucket, categoriaId: match.category.id)
            )
        }
    }
}
