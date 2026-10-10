import Foundation
@testable import Mirach

/// Programmable `MirachAPI` for view model and session tests. Records sign-in calls.
final class FakeMirachAPI: MirachAPI, @unchecked Sendable {
    struct PasswordSignInCall: Equatable {
        let email: String
        let password: String
    }

    struct SignInCall: Equatable {
        let identityToken: String
        let nonce: String
        let nombre: String?
        let authorizationCode: String?
    }

    /// What an upload call received: the file, the password and (commit only) the edits.
    struct UploadCall: Equatable {
        let file: CartolaFile
        let password: String?
        let edits: [CartolaEdit]?
    }

    struct DetalleCall: Equatable {
        let bucket: Bucket
        let periodo: Periodo
    }

    struct ReclasificarCall: Equatable {
        let transaccionId: String
        let categoriaId: String
    }

    struct ActualizarCategoriaCall: Equatable {
        let id: String
        let cambios: CategoriaCambios
    }

    struct CrearPatronCall: Equatable {
        let categoriaId: String
        let patron: String
        let matchType: MatchType
    }

    struct ActualizarPatronCall: Equatable {
        let id: String
        let cambios: PatronCambios
    }

    private let lock = NSLock()
    private var _signInCalls: [SignInCall] = []
    private var _passwordSignInCalls: [PasswordSignInCall] = []
    private var passwordSignInGate: Gate?
    private var _currentUserCalls = 0
    private var _capabilitiesCalls = 0

    private let versionResult: Result<VersionInfo, any Error>
    private var capabilitiesResult: Result<AuthCapabilities, any Error>
    private let signInResult: Result<Session, any Error>
    private let passwordSignInResult: Result<Session, any Error>
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
    private var _onLogout: (@Sendable () -> Void)?
    private var deleteResult: Result<Void, any Error> = .success(())
    private var _deleteCalls: [String] = []
    private var _deleteGate: Gate?
    private var _updateGate: Gate?
    private var detalleResults: [Result<BucketDetalle, any Error>] = [.success(SampleData.deseosDetalle)]
    private var _detalleCalls: [DetalleCall] = []
    private var _detalleGate: Gate?
    private var reclasificarResults: [Result<Reclasificacion, any Error>] = [
        .success(Reclasificacion(categoriaId: "cat-rest", categoriaNombre: "Restaurantes", bucket: .deseos))
    ]
    private var _reclasificarCalls: [ReclasificarCall] = []
    private var _reclasificarGate: Gate?
    private var ingresosResults: [Result<IngresosMes, any Error>] = [.success(SampleData.ingresosSeptiembre)]
    private var _ingresosCalls: [Periodo] = []
    private var _ingresosGate: Gate?
    private var ingestasResults: [Result<[CartolaSubida], any Error>] = [.success(SampleData.cartolas)]
    private var _ingestasCalls = 0
    private var _ingestasGate: Gate?
    private var eliminarResults: [Result<Void, any Error>] = [.success(())]
    private var _eliminarCalls: [String] = []
    private var _eliminarGate: Gate?
    private var actualizarCategoriaResults: [Result<CategoriaCatalogo, any Error>] = [
        .success(CategoriaCatalogo(id: "cat-edit", nombre: "Editada", bucket: .deseos))
    ]
    private var _actualizarCategoriaCalls: [ActualizarCategoriaCall] = []
    private var eliminarCategoriaResults: [Result<Void, any Error>] = [.success(())]
    private var _eliminarCategoriaCalls: [String] = []
    private var crearPatronResults: [Result<PatronCategoria, any Error>] = [
        .success(PatronCategoria(id: "pat-new", patron: "x", matchType: .contains))
    ]
    private var _crearPatronCalls: [CrearPatronCall] = []
    private var actualizarPatronResults: [Result<PatronCategoria, any Error>] = [
        .success(PatronCategoria(id: "pat-edit", patron: "x", matchType: .contains))
    ]
    private var _actualizarPatronCalls: [ActualizarPatronCall] = []
    private var eliminarPatronResults: [Result<Void, any Error>] = [.success(())]
    private var _eliminarPatronCalls: [String] = []
    private var _catalogWriteGate: Gate?
    private var _previewCalls: [UploadCall] = []
    private var _commitCalls: [UploadCall] = []

    init(
        versionResult: Result<VersionInfo, any Error> = .success(VersionInfo(version: "0", commit: "0")),
        capabilitiesResult: Result<AuthCapabilities, any Error> = .success(AuthCapabilities(appleLoginEnabled: true)),
        signInResult: Result<Session, any Error> = .success(
            Session(token: "tok", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
        ),
        passwordSignInResult: Result<Session, any Error> = .success(
            Session(token: "tok-pw", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000))
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
        self.passwordSignInResult = passwordSignInResult
        self.currentUserResult = currentUserResult
    }

    var signInCalls: [SignInCall] { lock.withLock { _signInCalls } }
    var passwordSignInCalls: [PasswordSignInCall] { lock.withLock { _passwordSignInCalls } }

    /// Holds `signInWithPassword` until the test opens the gate, to observe the in-flight state.
    func holdPasswordSignIn(with gate: Gate) {
        lock.withLock { passwordSignInGate = gate }
    }
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
        // The answer is fixed when the request is sent, like a server would: a gated (slow) request
        // keeps the answer of its own moment.
        let result = lock.withLock {
            _categoriasCalls += 1
            return categoriasResults.count > 1 ? categoriasResults.removeFirst() : categoriasResults[0]
        }
        await categoriasGate?.wait()
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

    // MARK: catalog writes (Categorías, Detalle de categoría)

    func setActualizarCategoriaResults(_ results: [Result<CategoriaCatalogo, any Error>]) {
        lock.withLock { actualizarCategoriaResults = results }
    }

    func setEliminarCategoriaResults(_ results: [Result<Void, any Error>]) {
        lock.withLock { eliminarCategoriaResults = results }
    }

    func setCrearPatronResults(_ results: [Result<PatronCategoria, any Error>]) {
        lock.withLock { crearPatronResults = results }
    }

    func setActualizarPatronResults(_ results: [Result<PatronCategoria, any Error>]) {
        lock.withLock { actualizarPatronResults = results }
    }

    func setEliminarPatronResults(_ results: [Result<Void, any Error>]) {
        lock.withLock { eliminarPatronResults = results }
    }

    var actualizarCategoriaCalls: [ActualizarCategoriaCall] { lock.withLock { _actualizarCategoriaCalls } }
    var eliminarCategoriaCalls: [String] { lock.withLock { _eliminarCategoriaCalls } }
    var crearPatronCalls: [CrearPatronCall] { lock.withLock { _crearPatronCalls } }
    var actualizarPatronCalls: [ActualizarPatronCall] { lock.withLock { _actualizarPatronCalls } }
    var eliminarPatronCalls: [String] { lock.withLock { _eliminarPatronCalls } }

    /// When set, every catalog write (category or pattern) waits at the gate before answering.
    var catalogWriteGate: Gate? {
        get { lock.withLock { _catalogWriteGate } }
        set { lock.withLock { _catalogWriteGate = newValue } }
    }

    func actualizarCategoria(id: String, cambios: CategoriaCambios) async throws -> CategoriaCatalogo {
        let (result, gate) = lock.withLock {
            _actualizarCategoriaCalls.append(ActualizarCategoriaCall(id: id, cambios: cambios))
            return (
                actualizarCategoriaResults.count > 1 ? actualizarCategoriaResults.removeFirst() : actualizarCategoriaResults[0],
                _catalogWriteGate
            )
        }
        await gate?.wait()
        return try result.get()
    }

    func eliminarCategoria(id: String) async throws {
        let (result, gate) = lock.withLock {
            _eliminarCategoriaCalls.append(id)
            return (
                eliminarCategoriaResults.count > 1 ? eliminarCategoriaResults.removeFirst() : eliminarCategoriaResults[0],
                _catalogWriteGate
            )
        }
        await gate?.wait()
        try result.get()
    }

    func crearPatron(categoriaId: String, patron: String, matchType: MatchType) async throws -> PatronCategoria {
        let (result, gate) = lock.withLock {
            _crearPatronCalls.append(CrearPatronCall(categoriaId: categoriaId, patron: patron, matchType: matchType))
            return (crearPatronResults.count > 1 ? crearPatronResults.removeFirst() : crearPatronResults[0], _catalogWriteGate)
        }
        await gate?.wait()
        return try result.get()
    }

    func actualizarPatron(id: String, cambios: PatronCambios) async throws -> PatronCategoria {
        let (result, gate) = lock.withLock {
            _actualizarPatronCalls.append(ActualizarPatronCall(id: id, cambios: cambios))
            return (
                actualizarPatronResults.count > 1 ? actualizarPatronResults.removeFirst() : actualizarPatronResults[0],
                _catalogWriteGate
            )
        }
        await gate?.wait()
        return try result.get()
    }

    func eliminarPatron(id: String) async throws {
        let (result, gate) = lock.withLock {
            _eliminarPatronCalls.append(id)
            return (
                eliminarPatronResults.count > 1 ? eliminarPatronResults.removeFirst() : eliminarPatronResults[0],
                _catalogWriteGate
            )
        }
        await gate?.wait()
        try result.get()
    }

    // MARK: detalle de bucket

    /// Answers for the next `bucketDetalle` calls, in order; the last one repeats.
    func setDetalleResults(_ results: [Result<BucketDetalle, any Error>]) {
        lock.withLock { detalleResults = results }
    }

    var detalleCalls: [DetalleCall] { lock.withLock { _detalleCalls } }

    /// When set, `bucketDetalle` waits at the gate before answering.
    var detalleGate: Gate? {
        get { lock.withLock { _detalleGate } }
        set { lock.withLock { _detalleGate = newValue } }
    }

    func bucketDetalle(bucket: Bucket, periodo: Periodo) async throws -> BucketDetalle {
        // The answer is fixed when the request arrives; the gate only delays delivering it.
        let (result, gate) = lock.withLock {
            _detalleCalls.append(DetalleCall(bucket: bucket, periodo: periodo))
            return (detalleResults.count > 1 ? detalleResults.removeFirst() : detalleResults[0], _detalleGate)
        }
        await gate?.wait()
        return try result.get()
    }

    // MARK: ingresos del mes

    /// Answers for the next `ingresosMes` calls, in order; the last one repeats.
    func setIngresosResults(_ results: [Result<IngresosMes, any Error>]) {
        lock.withLock { ingresosResults = results }
    }

    var ingresosCalls: [Periodo] { lock.withLock { _ingresosCalls } }

    /// When set, `ingresosMes` waits at the gate before answering.
    var ingresosGate: Gate? {
        get { lock.withLock { _ingresosGate } }
        set { lock.withLock { _ingresosGate = newValue } }
    }

    func ingresosMes(periodo: Periodo) async throws -> IngresosMes {
        // The answer is fixed when the request arrives; the gate only delays delivering it.
        let (result, gate) = lock.withLock {
            _ingresosCalls.append(periodo)
            return (ingresosResults.count > 1 ? ingresosResults.removeFirst() : ingresosResults[0], _ingresosGate)
        }
        await gate?.wait()
        return try result.get()
    }

    // MARK: cartolas subidas

    /// Answers for the next `cartolasSubidas` calls, in order; the last one repeats.
    func setIngestasResults(_ results: [Result<[CartolaSubida], any Error>]) {
        lock.withLock { ingestasResults = results }
    }

    var ingestasCalls: Int { lock.withLock { _ingestasCalls } }

    /// When set, `cartolasSubidas` waits at the gate before delivering its (already fixed) answer.
    var ingestasGate: Gate? {
        get { lock.withLock { _ingestasGate } }
        set { lock.withLock { _ingestasGate = newValue } }
    }

    func cartolasSubidas() async throws -> [CartolaSubida] {
        let (result, gate) = lock.withLock {
            _ingestasCalls += 1
            return (ingestasResults.count > 1 ? ingestasResults.removeFirst() : ingestasResults[0], _ingestasGate)
        }
        await gate?.wait()
        return try result.get()
    }

    func setEliminarResults(_ results: [Result<Void, any Error>]) {
        lock.withLock { eliminarResults = results }
    }

    var eliminarCalls: [String] { lock.withLock { _eliminarCalls } }

    /// When set, `eliminarCartola` waits at the gate before answering.
    var eliminarGate: Gate? {
        get { lock.withLock { _eliminarGate } }
        set { lock.withLock { _eliminarGate = newValue } }
    }

    func eliminarCartola(id: String) async throws {
        let (result, gate) = lock.withLock {
            _eliminarCalls.append(id)
            return (eliminarResults.count > 1 ? eliminarResults.removeFirst() : eliminarResults[0], _eliminarGate)
        }
        await gate?.wait()
        try result.get()
    }

    func setReclasificarResults(_ results: [Result<Reclasificacion, any Error>]) {
        lock.withLock { reclasificarResults = results }
    }

    var reclasificarCalls: [ReclasificarCall] { lock.withLock { _reclasificarCalls } }

    /// When set, `reclasificar` waits at the gate before answering.
    var reclasificarGate: Gate? {
        get { lock.withLock { _reclasificarGate } }
        set { lock.withLock { _reclasificarGate = newValue } }
    }

    func reclasificar(transaccionId: String, categoriaId: String) async throws -> Reclasificacion {
        await reclasificarGate?.wait()
        let result = lock.withLock {
            _reclasificarCalls.append(ReclasificarCall(transaccionId: transaccionId, categoriaId: categoriaId))
            return reclasificarResults.count > 1 ? reclasificarResults.removeFirst() : reclasificarResults[0]
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

    /// When set, `updateNombre` waits at the gate before answering.
    var updateGate: Gate? {
        get { lock.withLock { _updateGate } }
        set { lock.withLock { _updateGate = newValue } }
    }

    func updateNombre(_ nombre: String) async throws -> CurrentUser {
        await updateGate?.wait()
        let result = lock.withLock {
            _updateNombreCalls.append(nombre)
            return updateNombreResults.count > 1 ? updateNombreResults.removeFirst() : updateNombreResults[0]
        }
        return try result.get()
    }

    func setLogoutResult(_ result: Result<Void, any Error>) { lock.withLock { logoutResult = result } }

    /// Makes `logout()` take this long (cancellable), to test that sign-out does not wait forever.
    func setLogoutDelay(_ delay: Duration?) { lock.withLock { _logoutDelay = delay } }

    /// Runs when `logout()` is called, before it answers (to observe what the app had by then).
    func setOnLogout(_ observer: @escaping @Sendable () -> Void) { lock.withLock { _onLogout = observer } }

    var logoutCalls: Int { lock.withLock { _logoutCalls } }

    func logout() async throws {
        let (result, delay, observer) = lock.withLock {
            _logoutCalls += 1
            return (logoutResult, _logoutDelay, _onLogout)
        }
        observer?()
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

    func signInWithApple(
        identityToken: String, nonce: String, nombre: String?, authorizationCode: String?
    ) async throws -> Session {
        lock.withLock { _signInCalls.append(SignInCall(
                identityToken: identityToken, nonce: nonce, nombre: nombre, authorizationCode: authorizationCode
            )) }
        return try signInResult.get()
    }

    func signInWithPassword(email: String, password: String) async throws -> Session {
        let gate = lock.withLock {
            _passwordSignInCalls.append(PasswordSignInCall(email: email, password: password))
            return passwordSignInGate
        }
        await gate?.wait()
        return try passwordSignInResult.get()
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
