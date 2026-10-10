import Foundation
import Testing
@testable import Mirach

@MainActor
struct ResumenViewModelTests {
    private func periodos(_ texts: String...) -> [Periodo] { texts.compactMap(Periodo.init) }

    @Test func startsLoadingThenShowsTheMonthTheAPIResolved() async {
        let api = FakeMirachAPI(resumenResult: .success(SampleData.mes("2026-09")))
        let viewModel = ResumenViewModel(api: api)
        #expect(viewModel.state == .loading)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.mes("2026-09")))
        // First load never names a period: the API picks the latest month with movements.
        #expect(api.resumenCalls == [nil])
    }

    @Test func aMonthWithoutIncomeIsStillLoadedSoTheScreenCanShowItsEmptyState() async {
        let empty = SampleData.mes("2026-07", ingreso: 0, sinIngreso: true)
        let viewModel = ResumenViewModel(api: FakeMirachAPI(resumenResult: .success(empty)))

        await viewModel.load()

        #expect(viewModel.state == .loaded(empty))
    }

    @Test func aNetworkErrorShowsAConnectionFailureAndRetryRecoversWithoutLosingTheSession() async {
        let api = FakeMirachAPI(resumenResult: .failure(URLError(.notConnectedToInternet)))
        let store = InMemorySessionStore(session: StubMirachAPI.savedSession)
        let session = SessionController(api: api, store: store)
        await session.start()
        let viewModel = ResumenViewModel(api: api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))
        #expect(session.phase == .signedIn(userId: "u-1"))

        api.setResumenResult(.success(SampleData.mes("2026-09")))
        await viewModel.retry()

        #expect(viewModel.state == .loaded(SampleData.mes("2026-09")))
        #expect(session.phase == .signedIn(userId: "u-1"))
    }

    @Test func serverAndDecodingProblemsAreServerFailures() async {
        for error: any Error in [APIError.badStatus(503), DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: ""))] {
            let viewModel = ResumenViewModel(api: FakeMirachAPI(resumenResult: .failure(error)))
            await viewModel.load()
            #expect(viewModel.state == .failed(.server))
        }
    }

    @Test func cancellationLeavesTheStateAlone() async {
        for error: any Error in [CancellationError(), URLError(.cancelled)] {
            let viewModel = ResumenViewModel(api: FakeMirachAPI(resumenResult: .failure(error)))
            await viewModel.load()
            #expect(viewModel.state == .loading)
        }
    }

    @Test func retryAfterAFailureAsksForTheSameMonthAgain() async {
        let api = FakeMirachAPI(
            resumenResult: .success(SampleData.mes("2026-09")),
            periodosResult: .success(periodos("2026-09", "2026-08"))
        )
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()
        api.setResumenResult(.failure(APIError.badStatus(503)))
        await viewModel.select(Periodo("2026-08")!)
        #expect(viewModel.state == .failed(.server))

        api.setResumenResult(.success(SampleData.mes("2026-08")))
        await viewModel.retry()

        #expect(api.resumenCalls == [nil, Periodo("2026-08"), Periodo("2026-08")])
        #expect(viewModel.state == .loaded(SampleData.mes("2026-08")))
    }

    @Test func arrowsWalkThePeriodsListAndStopAtTheEnds() async throws {
        let api = FakeMirachAPI(
            resumenResult: .success(SampleData.mes("2026-08")),
            periodosResult: .success(periodos("2026-09", "2026-08", "2026-06"))
        )
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()

        // The list is most recent first: older = next in the list, and months without data are skipped.
        #expect(viewModel.siguiente == Periodo("2026-09"))
        #expect(viewModel.anterior == Periodo("2026-06"))

        api.setResumenResult(.success(SampleData.mes("2026-09")))
        await viewModel.select(try #require(viewModel.siguiente))
        #expect(viewModel.siguiente == nil)
        #expect(viewModel.anterior == Periodo("2026-08"))
    }

    @Test func switchingMonthHidesTheOldOneWhileTheNewOneLoads() async {
        let api = SlowAPI()
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()

        let switching = Task { await viewModel.select(Periodo("2026-08")!) }
        await api.waitUntilPending()

        #expect(viewModel.state == .loading)
        api.release(with: SampleData.mes("2026-08"))
        await switching.value
        #expect(viewModel.state == .loaded(SampleData.mes("2026-08")))
    }

    @Test func aLateAnswerForAnOlderChoiceDoesNotOverwriteTheNewerOne() async {
        let api = SlowAPI()
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()

        let first = Task { await viewModel.select(Periodo("2026-07")!) }
        await api.waitUntilPending()
        api.hold = false
        await viewModel.select(Periodo("2026-08")!)
        api.release(with: SampleData.mes("2026-07"))
        await first.value

        #expect(viewModel.state == .loaded(SampleData.mes("2026-08")))
    }

    @Test func refreshKeepsTheContentAndShowsFreshData() async {
        let api = FakeMirachAPI(resumenResult: .success(SampleData.mes("2026-09")))
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()
        api.setResumenResult(.success(SampleData.mes("2026-09", ingreso: 2_000_000)))

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.mes("2026-09", ingreso: 2_000_000)))
        #expect(api.resumenCalls == [nil, Periodo("2026-09")])
    }

    @Test func aFailedRefreshKeepsTheMonthOnScreen() async {
        let api = FakeMirachAPI(resumenResult: .success(SampleData.mes("2026-09")))
        let viewModel = ResumenViewModel(api: api)
        await viewModel.load()
        api.setResumenResult(.failure(URLError(.timedOut)))

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.mes("2026-09")))
    }

    @Test func aFailingPeriodsListDoesNotHideTheSummary() async {
        let api = FakeMirachAPI(periodosResult: .failure(URLError(.timedOut)))
        let viewModel = ResumenViewModel(api: api)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.septiembre))
        #expect(viewModel.periodos.isEmpty)
        #expect(viewModel.anterior == nil && viewModel.siguiente == nil)
    }

    @Test func aRejectedSessionSignsOutThroughTheSingle401PathAndShowsNoError() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let store = InMemorySessionStore(session: nil)
        let dependencies = AppEnvironment.make(arguments: [], apiKey: "k", store: store, transport: transport)
        try dependencies.session.signIn(
            Session(token: "tok-sent", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 4_000_000_000))
        )
        let viewModel = ResumenViewModel(api: dependencies.api)

        await viewModel.load()
        await dependencies.expiryRelay.waitForDelivery()

        #expect(dependencies.session.phase == .signedOut)
        #expect(store.load() == nil)
        if case .failed = viewModel.state { Issue.record("an expired session must not show an error") }
    }
}

/// An API whose `resumen` can be held until the test releases it, to control answer order.
private final class SlowAPI: MirachAPI, @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<ResumenMes, any Error>?
    private var _hold = false
    private var calls = 0

    var hold: Bool {
        get { lock.withLock { _hold } }
        set { lock.withLock { _hold = newValue } }
    }

    func resumen(periodo: Periodo?) async throws -> ResumenMes {
        let held = lock.withLock { () -> Bool in
            calls += 1
            // The first call (initial load) answers at once; later ones wait while `hold` is on.
            if calls == 1 { _hold = true; return false }
            return _hold
        }
        if !held { return SampleData.mes(periodo?.apiValue ?? "2026-09") }
        return try await withCheckedThrowingContinuation { continuation in
            lock.withLock { self.continuation = continuation }
        }
    }

    func waitUntilPending() async {
        // Bounded, so a broken view model fails the test instead of hanging the run.
        for _ in 0..<200 where lock.withLock({ continuation == nil }) {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    func release(with mes: ResumenMes) {
        let pending = lock.withLock { () -> CheckedContinuation<ResumenMes, any Error>? in
            defer { continuation = nil }
            return continuation
        }
        pending?.resume(returning: mes)
    }

    func periodos() async throws -> [Periodo] { [] }
    func previewIngesta(file: CartolaFile, password: String?) async throws -> CartolaPreview { SampleData.preview }
    func bucketDetalle(bucket: Bucket, periodo: Periodo) async throws -> BucketDetalle { throw APIError.badStatus(0) }
    func ingresosMes(periodo: Periodo) async throws -> IngresosMes { throw APIError.badStatus(0) }
    func cartolasSubidas() async throws -> [CartolaSubida] { throw APIError.badStatus(0) }
    func eliminarCartola(id: String) async throws { throw APIError.badStatus(0) }
    func reclasificar(transaccionId: String, categoriaId: String) async throws -> Reclasificacion {
        throw APIError.badStatus(0)
    }
    func categorias() async throws -> CatalogoCategorias { throw APIError.badStatus(0) }
    func crearCategoria(_ new: NuevaCategoria) async throws -> CategoriaCatalogo { throw APIError.badStatus(0) }
    func actualizarCategoria(id: String, cambios: CategoriaCambios) async throws -> CategoriaCatalogo {
        throw APIError.badStatus(0)
    }
    func eliminarCategoria(id: String) async throws { throw APIError.badStatus(0) }
    func crearPatron(categoriaId: String, patron: String, matchType: MatchType) async throws -> PatronCategoria {
        throw APIError.badStatus(0)
    }
    func actualizarPatron(id: String, cambios: PatronCambios) async throws -> PatronCategoria {
        throw APIError.badStatus(0)
    }
    func eliminarPatron(id: String) async throws { throw APIError.badStatus(0) }
    func commitIngesta(file: CartolaFile, password: String?, edits: [CartolaEdit]) async throws -> CartolaCommitResult {
        SampleData.commit
    }
    func version() async throws -> VersionInfo { VersionInfo(version: "0", commit: "0") }
    func authCapabilities() async throws -> AuthCapabilities { AuthCapabilities(appleLoginEnabled: true) }
    func signInWithApple(
        identityToken: String, nonce: String, nombre: String?, authorizationCode: String?
    ) async throws -> Session {
        throw APIError.invalidCredentials
    }
    func signInWithPassword(email: String, password: String) async throws -> Session {
        throw APIError.invalidCredentials
    }
    func currentUser() async throws -> CurrentUser { CurrentUser(userId: "u", nombre: "n") }
    func updateNombre(_ nombre: String) async throws -> CurrentUser { CurrentUser(userId: "u", nombre: nombre) }
    func logout() async throws {}
    func deleteAccount(confirmation: String) async throws {}
}
