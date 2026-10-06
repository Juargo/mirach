import Foundation
@testable import Mirach

/// Programmable `MirachAPI` for view model and session tests. Records sign-in calls.
final class FakeMirachAPI: MirachAPI, @unchecked Sendable {
    struct SignInCall: Equatable {
        let identityToken: String
        let nonce: String
        let nombre: String?
    }

    /// What an upload call received: the file, the password and (commit only) the edits.
    struct UploadCall: Equatable {
        let file: CartolaFile
        let password: String?
        let edits: [CartolaEdit]?
    }

    private let lock = NSLock()
    private var _signInCalls: [SignInCall] = []
    private var _currentUserCalls = 0
    private var _capabilitiesCalls = 0

    private let versionResult: Result<VersionInfo, any Error>
    private var capabilitiesResult: Result<AuthCapabilities, any Error>
    private let signInResult: Result<Session, any Error>
    private var currentUserResult: Result<CurrentUser, any Error>
    private var resumenResult: Result<ResumenMes, any Error>
    private var periodosResult: Result<[Periodo], any Error>
    private var _resumenCalls: [Periodo?] = []
    private var previewResults: [Result<CartolaPreview, any Error>] = [.success(SampleData.preview)]
    private var commitResults: [Result<CartolaCommitResult, any Error>] = [.success(SampleData.commit)]
    private var categoriasResults: [Result<CatalogoCategorias, any Error>] = [.success(SampleData.catalog)]
    private var _categoriasCalls = 0
    private var crearResults: [Result<CategoriaCatalogo, any Error>] = [
        .success(CategoriaCatalogo(id: "cat-new", nombre: "Nueva", bucket: .deseos))
    ]
    private var _crearCalls: [NuevaCategoria] = []
    private var _previewGate: Gate?
    private var _categoriasGate: Gate?
    private var _crearGate: Gate?
    private var updateNombreResults: [Result<CurrentUser, any Error>] = [
        .success(CurrentUser(userId: "u-1", nombre: "Nuevo", email: "ana@example.com"))
    ]
    private var _updateNombreCalls: [String] = []
    private var logoutResult: Result<Void, any Error> = .success(())
    private var _logoutCalls = 0
    private var _logoutDelay: Duration?
    private var deleteResult: Result<Void, any Error> = .success(())
    private var _deleteCalls: [String] = []
    private var _deleteGate: Gate?
    private var _previewCalls: [UploadCall] = []
    private var _commitCalls: [UploadCall] = []

    init(
        versionResult: Result<VersionInfo, any Error> = .success(VersionInfo(version: "0", commit: "0")),
        capabilitiesResult: Result<AuthCapabilities, any Error> = .success(AuthCapabilities(appleLoginEnabled: true)),
        signInResult: Result<Session, any Error> = .success(
            Session(token: "tok", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
        ),
        currentUserResult: Result<CurrentUser, any Error> = .success(CurrentUser(userId: "u-1", nombre: "Ana")),
        resumenResult: Result<ResumenMes, any Error> = .success(SampleData.septiembre),
        periodosResult: Result<[Periodo], any Error> = .success([])
    ) {
        self.resumenResult = resumenResult
        self.periodosResult = periodosResult
        self.versionResult = versionResult
        self.capabilitiesResult = capabilitiesResult
        self.signInResult = signInResult
        self.currentUserResult = currentUserResult
    }

    var signInCalls: [SignInCall] { lock.withLock { _signInCalls } }
    var currentUserCalls: Int { lock.withLock { _currentUserCalls } }
    var capabilitiesCalls: Int { lock.withLock { _capabilitiesCalls } }

    func setCapabilitiesResult(_ result: Result<AuthCapabilities, any Error>) {
        lock.withLock { capabilitiesResult = result }
    }

    /// Lets a test change what the next `currentUser()` returns (e.g. retry after a network failure).
    func setCurrentUserResult(_ result: Result<CurrentUser, any Error>) {
        lock.withLock { currentUserResult = result }
    }

    /// The periods each `resumen(periodo:)` call asked for, in order (`nil` = API default).
    var resumenCalls: [Periodo?] { lock.withLock { _resumenCalls } }

    func setResumenResult(_ result: Result<ResumenMes, any Error>) {
        lock.withLock { resumenResult = result }
    }

    func setPeriodosResult(_ result: Result<[Periodo], any Error>) {
        lock.withLock { periodosResult = result }
    }

    var previewCalls: [UploadCall] { lock.withLock { _previewCalls } }
    var commitCalls: [UploadCall] { lock.withLock { _commitCalls } }

    /// Answers for the next preview calls, in order; the last one repeats once the rest are used.
    func setPreviewResults(_ results: [Result<CartolaPreview, any Error>]) {
        lock.withLock { previewResults = results }
    }

    /// Answers for the next `categorias()` calls, in order; the last one repeats.
    func setCategoriasResults(_ results: [Result<CatalogoCategorias, any Error>]) {
        lock.withLock { categoriasResults = results }
    }

    func setCrearCategoriaResults(_ results: [Result<CategoriaCatalogo, any Error>]) {
        lock.withLock { crearResults = results }
    }

    var crearCategoriaCalls: [NuevaCategoria] { lock.withLock { _crearCalls } }

    var categoriasCalls: Int { lock.withLock { _categoriasCalls } }

    func setCommitResults(_ results: [Result<CartolaCommitResult, any Error>]) {
        lock.withLock { commitResults = results }
    }

    /// When set, `previewIngesta` waits at the gate before answering.
    var previewGate: Gate? {
        get { lock.withLock { _previewGate } }
        set { lock.withLock { _previewGate = newValue } }
    }

    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview {
        await previewGate?.wait()
        let result = lock.withLock {
            _previewCalls.append(UploadCall(file: file, password: password, edits: nil))
            return previewResults.count > 1 ? previewResults.removeFirst() : previewResults[0]
        }
        return try result.get()
    }

    /// When set, `categorias()` waits at the gate before answering.
    var categoriasGate: Gate? {
        get { lock.withLock { _categoriasGate } }
        set { lock.withLock { _categoriasGate = newValue } }
    }

    func categorias() async throws -> CatalogoCategorias {
        await categoriasGate?.wait()
        let result = lock.withLock {
            _categoriasCalls += 1
            return categoriasResults.count > 1 ? categoriasResults.removeFirst() : categoriasResults[0]
        }
        return try result.get()
    }

    /// When set, `crearCategoria` waits at the gate before answering.
    var crearGate: Gate? {
        get { lock.withLock { _crearGate } }
        set { lock.withLock { _crearGate = newValue } }
    }

    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo {
        await crearGate?.wait()
        let result = lock.withLock {
            _crearCalls.append(new)
            return crearResults.count > 1 ? crearResults.removeFirst() : crearResults[0]
        }
        return try result.get()
    }

    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult {
        let result = lock.withLock {
            _commitCalls.append(UploadCall(file: file, password: password, edits: edits))
            return commitResults.count > 1 ? commitResults.removeFirst() : commitResults[0]
        }
        return try result.get()
    }

    // MARK: perfil

    func setUpdateNombreResults(_ results: [Result<CurrentUser, any Error>]) {
        lock.withLock { updateNombreResults = results }
    }

    var updateNombreCalls: [String] { lock.withLock { _updateNombreCalls } }

    func updateNombre(_ nombre: String) async throws -> CurrentUser {
        let result = lock.withLock {
            _updateNombreCalls.append(nombre)
            return updateNombreResults.count > 1 ? updateNombreResults.removeFirst() : updateNombreResults[0]
        }
        return try result.get()
    }

    func setLogoutResult(_ result: Result<Void, any Error>) { lock.withLock { logoutResult = result } }

    /// Makes `logout()` take this long (cancellable), to test that sign-out does not wait forever.
    func setLogoutDelay(_ delay: Duration?) { lock.withLock { _logoutDelay = delay } }

    var logoutCalls: Int { lock.withLock { _logoutCalls } }

    func logout() async throws {
        let (result, delay) = lock.withLock {
            _logoutCalls += 1
            return (logoutResult, _logoutDelay)
        }
        if let delay { try await Task.sleep(for: delay) }
        try result.get()
    }

    func setDeleteResult(_ result: Result<Void, any Error>) { lock.withLock { deleteResult = result } }

    /// The confirmation text each `deleteAccount` call received.
    var deleteCalls: [String] { lock.withLock { _deleteCalls } }

    /// When set, `deleteAccount` waits at the gate before answering.
    var deleteGate: Gate? {
        get { lock.withLock { _deleteGate } }
        set { lock.withLock { _deleteGate = newValue } }
    }

    func deleteAccount(confirmation: String) async throws {
        await deleteGate?.wait()
        let result = lock.withLock {
            _deleteCalls.append(confirmation)
            return deleteResult
        }
        try result.get()
    }

    func resumen(periodo: Periodo?) async throws -> ResumenMes {
        let result = lock.withLock {
            _resumenCalls.append(periodo)
            return resumenResult
        }
        return try result.get()
    }

    func periodos() async throws -> [Periodo] {
        try lock.withLock { periodosResult }.get()
    }

    func version() async throws -> VersionInfo { try versionResult.get() }
    func authCapabilities() async throws -> AuthCapabilities {
        let result = lock.withLock {
            _capabilitiesCalls += 1
            return capabilitiesResult
        }
        return try result.get()
    }

    func signInWithApple(identityToken: String, nonce: String, nombre: String?) async throws -> Session {
        lock.withLock { _signInCalls.append(SignInCall(identityToken: identityToken, nonce: nonce, nombre: nombre)) }
        return try signInResult.get()
    }

    func currentUser() async throws -> CurrentUser {
        let result = lock.withLock {
            _currentUserCalls += 1
            return currentUserResult
        }
        return try result.get()
    }
}

/// Holds a fake call until the test lets it go, to observe the in-between state.
actor Gate {
    private var continuation: CheckedContinuation<Void, Never>?
    private var isOpen = false

    func wait() async {
        if isOpen { return }
        await withCheckedContinuation { continuation = $0 }
    }

    func open() {
        isOpen = true
        continuation?.resume()
        continuation = nil
    }

    func waitUntilWaiting() async {
        for _ in 0..<500 where continuation == nil {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }
}
