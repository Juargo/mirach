import Foundation
import Testing
@testable import Mirach

@MainActor
struct IngresosViewModelTests {
    private let sept = Periodo("2026-09")!

    private func periodos(_ texts: String...) -> [Periodo] { texts.compactMap(Periodo.init) }

    private func make(_ api: FakeMirachAPI = FakeMirachAPI()) -> IngresosViewModel {
        IngresosViewModel(api: api, periodo: Periodo("2026-09")!)
    }

    private func month(_ text: String, total: Int) -> IngresosMes {
        IngresosMes(periodo: Periodo(text)!, total: total, conteo: 0, transacciones: [])
    }

    @Test func startsLoadingThenShowsTheIncomesOfTheMonthItWasOpenedFor() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        #expect(viewModel.state == .loading)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
        #expect(api.ingresosCalls == [sept])
    }

    @Test func anEmptyMonthIsLoadedSoTheScreenCanShowItsEmptyState() async {
        let api = FakeMirachAPI()
        api.setIngresosResults([.success(SampleData.ingresosVacio)])
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.ingresosVacio))
    }

    @Test func aNetworkErrorIsAConnectionFailureAndRetryAsksForTheSameMonthAgain() async {
        let api = FakeMirachAPI()
        api.setIngresosResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.ingresosSeptiembre)])
        let viewModel = make(api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))

        await viewModel.retry()
        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
        #expect(api.ingresosCalls == [sept, sept])
    }

    @Test func serverAndDecodingProblemsAreServerFailures() async {
        for error: any Error in [APIError.badStatus(503), DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: ""))] {
            let api = FakeMirachAPI()
            api.setIngresosResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .failed(.server))
        }
    }

    @Test func cancellationLeavesTheStateAlone() async {
        for error: any Error in [CancellationError(), URLError(.cancelled)] {
            let api = FakeMirachAPI()
            api.setIngresosResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .loading)
        }
    }

    @Test func aRejectedSessionSignsOutThroughTheSingle401PathAndShowsNoError() async throws {
        let transport = FakeTransport.json(#"{"message":"x","code":"SESION_INVALIDA"}"#, status: .unauthorized)
        let store = InMemorySessionStore(session: nil)
        let dependencies = AppEnvironment.make(arguments: [], apiKey: "k", store: store, transport: transport)
        try dependencies.session.signIn(
            Session(token: "tok-sent", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 4_000_000_000))
        )
        let viewModel = IngresosViewModel(api: dependencies.api, periodo: sept)

        await viewModel.load()
        await dependencies.expiryRelay.waitForDelivery()

        #expect(dependencies.session.phase == .signedOut)
        #expect(store.load() == nil)
        if case .failed = viewModel.state { Issue.record("an expired session must not show an error") }
    }

    // MARK: months

    @Test func theArrowsStepThroughTheMonthsThatHaveData() async {
        let api = FakeMirachAPI(periodosResult: .success(periodos("2026-09", "2026-08", "2026-07")))
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.siguiente == nil)
        #expect(viewModel.anterior == Periodo("2026-08"))
        await viewModel.select(Periodo("2026-08")!)
        #expect(viewModel.periodo == Periodo("2026-08"))
        #expect(api.ingresosCalls.last == Periodo("2026-08"))
        #expect(viewModel.siguiente == sept)
        #expect(viewModel.anterior == Periodo("2026-07"))
    }

    @Test func aFailingPeriodsListDoesNotHideTheIncomes() async {
        let api = FakeMirachAPI(periodosResult: .failure(URLError(.timedOut)))
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
        #expect(viewModel.anterior == nil && viewModel.siguiente == nil)
    }

    @Test func aLateAnswerForAnOlderMonthDoesNotOverwriteTheNewerOne() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.ingresosGate = gate
        // The July request gets its own recognisable answer, fixed when it is made but delivered late.
        let july = month("2026-07", total: 1)
        api.setIngresosResults([.success(july)])

        let first = Task { await viewModel.select(Periodo("2026-07")!) }
        await gate.waitUntilWaiting()
        api.ingresosGate = nil
        api.setIngresosResults([.success(SampleData.ingresosSeptiembre)])
        await viewModel.select(Periodo("2026-08")!)
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
        #expect(viewModel.state != .loaded(july))
        #expect(viewModel.periodo == Periodo("2026-08"))
    }

    @Test func aLateFailureForAnOlderMonthDoesNotReplaceTheNewerList() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.ingresosGate = gate
        api.setIngresosResults([.failure(URLError(.timedOut))])

        let first = Task { await viewModel.select(Periodo("2026-07")!) }
        await gate.waitUntilWaiting()
        api.ingresosGate = nil
        api.setIngresosResults([.success(SampleData.ingresosSeptiembre)])
        await viewModel.select(Periodo("2026-08")!)
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
    }

    @Test func aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() async {
        let api = FakeMirachAPI()
        api.setIngresosResults([.failure(CancellationError()), .success(SampleData.ingresosSeptiembre)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loading)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
        // Once loaded, appearing again does not drop the month.
        await viewModel.loadIfNeeded()
        #expect(api.ingresosCalls.count == 2)
    }

    @Test func aFailedLoadStillCountsAsFinishedSoTheErrorIsNotRetriedOnReappearing() async {
        let api = FakeMirachAPI()
        api.setIngresosResults([.failure(APIError.badStatus(503)), .success(SampleData.ingresosSeptiembre)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        await viewModel.loadIfNeeded()

        #expect(viewModel.state == .failed(.server))
        #expect(api.ingresosCalls.count == 1)
    }

    @Test func aFailedRefreshKeepsTheIncomesOnScreen() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setIngresosResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.ingresosSeptiembre))
    }

    @Test func aRefreshAsksForTheMonthOnScreenAgain() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setIngresosResults([.success(SampleData.ingresosVacio)])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.ingresosVacio))
        #expect(api.ingresosCalls == [sept, sept])
    }
}
