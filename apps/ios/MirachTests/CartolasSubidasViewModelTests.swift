import Foundation
import Testing
@testable import Mirach

@MainActor
struct CartolasSubidasViewModelTests {
    private let processed = SampleData.cartolas[0]
    private let failed = SampleData.cartolas[1]

    private func make(_ api: FakeMirachAPI = FakeMirachAPI(), onChange: @escaping @MainActor () -> Void = {}) -> CartolasSubidasViewModel {
        CartolasSubidasViewModel(api: api, onChange: onChange)
    }

    // MARK: loading

    @Test func startsLoadingThenShowsTheImportsInTheServerOrder() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        #expect(viewModel.state == .loading)

        await viewModel.load()

        #expect(viewModel.state == .loaded(SampleData.cartolas))
        #expect(api.ingestasCalls == 1)
    }

    @Test func noImportsIsALoadedEmptyListSoTheScreenCanOfferToUpload() async {
        let api = FakeMirachAPI()
        api.setIngestasResults([.success([])])
        let viewModel = make(api)

        await viewModel.load()

        #expect(viewModel.state == .loaded([]))
    }

    @Test func aNetworkErrorIsAConnectionFailureAndRetryAsksAgain() async {
        let api = FakeMirachAPI()
        api.setIngestasResults([.failure(URLError(.notConnectedToInternet)), .success(SampleData.cartolas)])
        let viewModel = make(api)

        await viewModel.load()
        #expect(viewModel.state == .failed(.connection))

        await viewModel.retry()
        #expect(viewModel.state == .loaded(SampleData.cartolas))
    }

    @Test func serverAndDecodingProblemsAreServerFailures() async {
        for error: any Error in [APIError.badStatus(503), DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: ""))] {
            let api = FakeMirachAPI()
            api.setIngestasResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()
            #expect(viewModel.state == .failed(.server))
        }
    }

    @Test func cancellationLeavesTheStateAlone() async {
        for error: any Error in [CancellationError(), URLError(.cancelled)] {
            let api = FakeMirachAPI()
            api.setIngestasResults([.failure(error)])
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
        let viewModel = CartolasSubidasViewModel(api: dependencies.api)

        await viewModel.load()
        await dependencies.expiryRelay.waitForDelivery()

        #expect(dependencies.session.phase == .signedOut)
        #expect(store.load() == nil)
        if case .failed = viewModel.state { Issue.record("an expired session must not show an error") }
    }

    // MARK: stale answers and appearing again

    @Test func aLateAnswerFromAnOlderRequestDoesNotOverwriteTheNewerOne() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.ingestasGate = gate
        api.setIngestasResults([.success([])])

        let first = Task { await viewModel.refresh() }
        await gate.waitUntilWaiting()
        api.ingestasGate = nil
        api.setIngestasResults([.success(SampleData.cartolas)])
        await viewModel.refresh()
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.cartolas))
    }

    @Test func aLateFailureFromAnOlderRequestDoesNotReplaceTheNewerList() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.ingestasGate = gate
        api.setIngestasResults([.failure(URLError(.timedOut))])

        let first = Task { await viewModel.retry() }
        await gate.waitUntilWaiting()
        api.ingestasGate = nil
        api.setIngestasResults([.success(SampleData.cartolas)])
        await viewModel.refresh()
        await gate.open()
        await first.value

        #expect(viewModel.state == .loaded(SampleData.cartolas))
        #expect(viewModel.refreshNotice == nil)
    }

    @Test func aLoadCancelledBeforeItFinishedRunsAgainOnTheNextAppearance() async {
        let api = FakeMirachAPI()
        api.setIngestasResults([.failure(CancellationError()), .success(SampleData.cartolas)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loading)

        await viewModel.loadIfNeeded()
        #expect(viewModel.state == .loaded(SampleData.cartolas))
        await viewModel.loadIfNeeded()
        #expect(api.ingestasCalls == 2, "appearing again must not reload and blank the list")
    }

    @Test func aFailedLoadStillCountsAsFinishedSoTheErrorIsNotRetriedOnReappearing() async {
        let api = FakeMirachAPI()
        api.setIngestasResults([.failure(APIError.badStatus(503)), .success(SampleData.cartolas)])
        let viewModel = make(api)

        await viewModel.loadIfNeeded()
        await viewModel.loadIfNeeded()

        #expect(viewModel.state == .failed(.server))
        #expect(api.ingestasCalls == 1)
    }

    @Test func anInitialLoadSupersededByARefreshStillMarksTheListLoaded() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        let gate = Gate()
        api.ingestasGate = gate

        let initial = Task { await viewModel.loadIfNeeded() }
        await gate.waitUntilWaiting()
        api.ingestasGate = nil
        await viewModel.refresh()
        await gate.open()
        await initial.value
        await viewModel.loadIfNeeded()

        #expect(viewModel.state == .loaded(SampleData.cartolas))
        #expect(api.ingestasCalls == 2, "appearing again must not reload and blank the list")
    }

    // MARK: refresh

    @Test func aFailedRefreshKeepsTheListAndSaysSoUntilTheNextSuccess() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        api.setIngestasResults([.failure(URLError(.timedOut))])

        await viewModel.refresh()

        #expect(viewModel.state == .loaded(SampleData.cartolas))
        #expect(viewModel.refreshNotice == "No se pudo actualizar la lista.")

        api.setIngestasResults([.success(SampleData.cartolas)])
        await viewModel.refresh()
        #expect(viewModel.refreshNotice == nil)
    }

    // MARK: deleting

    @Test func askingToDeleteOnlyAsksAndCancellingChangesNothing() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()

        viewModel.requestDeletion(processed)
        #expect(viewModel.pendingDeletion == processed)
        #expect(api.eliminarCalls.isEmpty)

        viewModel.cancelDeletion()
        #expect(viewModel.pendingDeletion == nil)
        #expect(api.eliminarCalls.isEmpty)
    }

    @Test func confirmingDeletesThatImportDropsItAnnouncesAndReloadsTheList() async {
        let api = FakeMirachAPI()
        let rest = Array(SampleData.cartolas.dropFirst())
        api.setIngestasResults([.success(SampleData.cartolas), .success(rest)])
        var changes = 0
        let viewModel = make(api, onChange: { changes += 1 })
        await viewModel.load()

        viewModel.requestDeletion(processed)
        await viewModel.confirmDeletion(processed)

        #expect(api.eliminarCalls == ["g-3"])
        #expect(viewModel.state == .loaded(rest))
        #expect(viewModel.message == .deleted)
        #expect(viewModel.pendingDeletion == nil)
        #expect(viewModel.deleting.isEmpty)
        #expect(api.ingestasCalls == 2, "the list is reloaded after the deletion")
        #expect(changes == 1, "the Resumen is told to reload")
    }

    @Test func theRowIsDisabledWhileTheServerAnswersAndASecondConfirmIsIgnored() async {
        let api = FakeMirachAPI()
        let viewModel = make(api)
        await viewModel.load()
        let gate = Gate()
        api.eliminarGate = gate

        viewModel.requestDeletion(processed)
        let first = Task { await viewModel.confirmDeletion(processed) }
        await gate.waitUntilWaiting()
        #expect(viewModel.deleting == ["g-3"])

        viewModel.requestDeletion(processed)
        #expect(viewModel.pendingDeletion == nil, "a row being deleted cannot be asked about again")
        await viewModel.confirmDeletion(processed)
        await gate.open()
        await first.value

        #expect(api.eliminarCalls == ["g-3"])
    }

    @Test func anImportThatIsAlreadyGoneIsRemovedAndSaidSo() async {
        let api = FakeMirachAPI()
        api.setEliminarResults([.failure(EliminarCartolaError.notFound)])
        let rest = Array(SampleData.cartolas.dropFirst())
        api.setIngestasResults([.success(SampleData.cartolas), .success(rest)])
        var changes = 0
        let viewModel = make(api, onChange: { changes += 1 })
        await viewModel.load()

        viewModel.requestDeletion(processed)
        await viewModel.confirmDeletion(processed)

        #expect(viewModel.message == .alreadyGone)
        #expect(viewModel.state == .loaded(rest))
        // ADR-050 rule 3: the Resumen reloads and the list is fetched again, as after a 204.
        #expect(changes == 1)
        #expect(api.ingestasCalls == 2)
    }

    @Test func aFailedDeletionKeepsTheRowAvailableAndExplains() async {
        for error: any Error in [URLError(.timedOut), APIError.badStatus(500)] {
            let api = FakeMirachAPI()
            api.setEliminarResults([.failure(error)])
            let viewModel = make(api)
            await viewModel.load()

            viewModel.requestDeletion(processed)
            await viewModel.confirmDeletion(processed)

            #expect(viewModel.message == .failed)
            #expect(viewModel.state == .loaded(SampleData.cartolas))
            #expect(viewModel.deleting.isEmpty)
            #expect(api.ingestasCalls == 1, "nothing changed: no reload")
        }
    }

    @Test func aDeletionRejectedBySessionShowsNoMessage() async {
        let api = FakeMirachAPI()
        api.setEliminarResults([.failure(APIError.sessionExpired)])
        let viewModel = make(api)
        await viewModel.load()

        viewModel.requestDeletion(processed)
        await viewModel.confirmDeletion(processed)

        #expect(viewModel.message == nil)
        #expect(viewModel.deleting.isEmpty)
    }

    @Test func aListRequestedBeforeTheDeletionFinishedCannotBringTheRowBack() async {
        let api = FakeMirachAPI()
        let rest = Array(SampleData.cartolas.dropFirst())
        let viewModel = make(api)
        await viewModel.load()
        // A refresh starts now and will answer, late, with the old list (it still has the row).
        let gate = Gate()
        api.ingestasGate = gate
        let stale = Task { await viewModel.refresh() }
        await gate.waitUntilWaiting()
        api.ingestasGate = nil
        api.setIngestasResults([.success(rest)])

        viewModel.requestDeletion(processed)
        await viewModel.confirmDeletion(processed)
        await gate.open()
        await stale.value

        #expect(viewModel.state == .loaded(rest))
    }

    @Test func aFailedReloadAfterADeletionStillShowsTheRowGoneAndTheNotice() async {
        let api = FakeMirachAPI()
        api.setIngestasResults([.success(SampleData.cartolas), .failure(URLError(.timedOut))])
        let viewModel = make(api)
        await viewModel.load()

        viewModel.requestDeletion(processed)
        await viewModel.confirmDeletion(processed)

        #expect(viewModel.state == .loaded(Array(SampleData.cartolas.dropFirst())))
        #expect(viewModel.refreshNotice == "No se pudo actualizar la lista.")
        #expect(viewModel.message == .deleted)
    }

    @Test func dismissingTheMessageClearsIt() async {
        let api = FakeMirachAPI()
        api.setEliminarResults([.failure(URLError(.timedOut))])
        let viewModel = make(api)
        await viewModel.load()
        viewModel.requestDeletion(failed)
        await viewModel.confirmDeletion(failed)
        #expect(viewModel.message == .failed)

        viewModel.dismissMessage()

        #expect(viewModel.message == nil)
    }
}
