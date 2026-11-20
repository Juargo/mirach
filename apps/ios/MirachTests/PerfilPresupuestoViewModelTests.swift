import Foundation
import Testing
@testable import Mirach

@MainActor
struct PerfilPresupuestoViewModelTests {
    private final class Counter: @unchecked Sendable {
        var saved = 0
    }

    private func makeRig(
        stored: Result<PerfilPresupuesto, any Error> = .success(.predefinido(.p50_30_20))
    ) -> (api: FakeMirachAPI, viewModel: PerfilPresupuestoViewModel, counter: Counter) {
        let api = FakeMirachAPI()
        api.setPerfilPresupuestoResults([stored])
        let counter = Counter()
        let viewModel = PerfilPresupuestoViewModel(api: api, onSaved: { counter.saved += 1 })
        return (api, viewModel, counter)
    }

    // MARK: S3 load

    @Test func startsLoadingThenSelectsTheStoredProfile() async {
        for perfil in PerfilPredefinido.allCases {
            let rig = makeRig(stored: .success(.predefinido(perfil)))
            #expect(rig.viewModel.loadState == .loading)
            #expect(rig.viewModel.selection == nil)

            await rig.viewModel.load()

            #expect(rig.viewModel.loadState == .loaded)
            #expect(rig.viewModel.selection == perfil)
            #expect(rig.api.perfilPresupuestoCalls == 1)
        }
    }

    @Test func aPersonalizadoProfileSelectsNothing() async {
        let rig = makeRig(stored: .success(.personalizado))

        await rig.viewModel.load()

        #expect(rig.viewModel.loadState == .loaded)
        #expect(rig.viewModel.selection == nil)
        #expect(rig.viewModel.canSave == false)
    }

    @Test func aFailedLoadShowsTheErrorAndRetryLoads() async {
        let rig = makeRig(stored: .failure(URLError(.notConnectedToInternet)))
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .failed(.connection))
        #expect(rig.viewModel.canSave == false)

        rig.api.setPerfilPresupuestoResults([.failure(APIError.badStatus(503))])
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .failed(.server))

        rig.api.setPerfilPresupuestoResults([.success(.predefinido(.p80_10_10))])
        await rig.viewModel.load()
        #expect(rig.viewModel.loadState == .loaded)
        #expect(rig.viewModel.selection == .p80_10_10)
    }

    @Test func anExpiredSessionLeavesTheScreenLoadingWithoutAMessage() async {
        let rig = makeRig(stored: .failure(APIError.sessionExpired))

        await rig.viewModel.load()

        #expect(rig.viewModel.loadState == .loading, "the root view is already switching to sign-in")
    }

    // MARK: S4 Guardar enablement

    @Test func guardarIsDisabledWhenTheSelectionEqualsTheStoredProfile() async {
        let rig = makeRig()
        await rig.viewModel.load()
        #expect(rig.viewModel.canSave == false)

        rig.viewModel.select(.p60_20_20)
        #expect(rig.viewModel.selection == .p60_20_20)
        #expect(rig.viewModel.canSave == true)

        rig.viewModel.select(.p50_30_20)
        #expect(rig.viewModel.canSave == false)
    }

    @Test func guardarIsDisabledWhileSavingAndSelectionIsLocked() async {
        let rig = makeRig()
        await rig.viewModel.load()
        rig.viewModel.select(.p70_15_15)
        let gate = Gate()
        rig.api.perfilPresupuestoGate = gate

        let saving = Task { await rig.viewModel.save() }
        await gate.waitUntilWaiting()

        #expect(rig.viewModel.saveState == .saving)
        #expect(rig.viewModel.canSave == false)
        rig.viewModel.select(.p80_10_10)
        #expect(rig.viewModel.selection == .p70_15_15)

        await gate.open()
        await saving.value
        #expect(rig.api.guardarPerfilPresupuestoCalls == [.p70_15_15], "a second tap cannot send a second request")
    }

    // MARK: S4/S5 save

    @Test func savingSendsTheSelectedProfileAndReportsSuccessOnce() async {
        let rig = makeRig()
        await rig.viewModel.load()
        rig.viewModel.select(.p60_20_20)
        rig.api.setGuardarPerfilPresupuestoResults([.success(.predefinido(.p60_20_20))])

        await rig.viewModel.save()

        #expect(rig.api.guardarPerfilPresupuestoCalls == [.p60_20_20])
        #expect(rig.viewModel.saveState == .saved)
        #expect(rig.counter.saved == 1, "the Resumen reload is requested exactly once")
        #expect(rig.viewModel.canSave == false, "the stored profile is now the selected one")
    }

    @Test func aFailedSaveKeepsTheSelectionShowsTheErrorAndEnablesGuardarAgain() async {
        let rig = makeRig()
        await rig.viewModel.load()
        rig.viewModel.select(.p80_10_10)
        rig.api.setGuardarPerfilPresupuestoResults([.failure(URLError(.timedOut))])

        await rig.viewModel.save()

        #expect(rig.viewModel.saveState == .failed(.connection))
        #expect(rig.viewModel.saveFailureMessage == "Problema de conexión. Revisa tu conexión e inténtalo de nuevo.")
        #expect(rig.viewModel.selection == .p80_10_10)
        #expect(rig.viewModel.canSave == true)
        #expect(rig.counter.saved == 0, "nothing reloads and the screen stays open")

        rig.api.setGuardarPerfilPresupuestoResults([.failure(APIError.badStatus(400))])
        await rig.viewModel.save()
        #expect(rig.viewModel.saveState == .failed(.server))
        #expect(rig.viewModel.saveFailureMessage == "No pudimos guardar el perfil. Inténtalo de nuevo.")
        #expect(rig.viewModel.selection == .p80_10_10)
        #expect(rig.viewModel.canSave == true)
    }

    @Test func anExpiredSessionOnSaveShowsNoMessageAndKeepsTheSelection() async {
        let rig = makeRig()
        await rig.viewModel.load()
        rig.viewModel.select(.p60_20_20)
        rig.api.setGuardarPerfilPresupuestoResults([.failure(APIError.sessionExpired)])

        await rig.viewModel.save()

        #expect(rig.viewModel.saveState == .idle)
        #expect(rig.viewModel.saveFailureMessage == nil)
        #expect(rig.viewModel.selection == .p60_20_20)
        #expect(rig.counter.saved == 0)
    }

    // MARK: S1/S7 copy

    @Test func theCardsCarryTheSpecCopyInOrder() {
        let cards = PerfilPredefinido.allCases
        #expect(cards.map(\.title) == ["50 / 30 / 20", "60 / 20 / 20", "70 / 15 / 15", "80 / 10 / 10"])
        #expect(cards.map(\.caption) == [
            "Equilibrado · Necesidades 50% · Gustos 30% · Ahorro 20%",
            "Si tus gastos fijos son altos · Necesidades 60% · Gustos 20% · Ahorro 20%",
            "Para un mes ajustado · Necesidades 70% · Gustos 15% · Ahorro 15%",
            "Salir de deudas. Tus cuotas cuentan como necesidad · Necesidades 80% · Gustos 10% · Ahorro 10%",
        ])
        #expect(cards.filter(\.isRecommended) == [.p50_30_20])
        #expect(cards.allSatisfy { $0.shares.reduce(0, +) == 100 })
        #expect(PerfilPredefinido.p60_20_20.accessibilityLabel
            == "60 / 20 / 20. Si tus gastos fijos son altos · Necesidades 60% · Gustos 20% · Ahorro 20%")
        #expect(PerfilPredefinido.p50_30_20.accessibilityLabel
            == "50 / 30 / 20. Recomendado. Equilibrado · Necesidades 50% · Gustos 30% · Ahorro 20%")
    }
}
