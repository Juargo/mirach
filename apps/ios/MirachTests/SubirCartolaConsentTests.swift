import Foundation
import Testing
@testable import Mirach

/// The statement-processing consent (PRI-02) of "Subir cartola": checked on entering the flow,
/// accepted or put off by the person, and asked again when the API answers 409
/// `CONSENTIMIENTO_CARTOLAS_REQUERIDO`.
@MainActor
struct SubirCartolaConsentTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let pdf = URL(fileURLWithPath: "/picked/cartola.pdf")

    private func make(
        consent: Result<Consentimientos, any Error> = .success(Consentimientos(cartolasVigente: false)),
        _ api: FakeMirachAPI = FakeMirachAPI(), _ staging: FakeCartolaStaging = FakeCartolaStaging()
    ) -> (SubirCartolaViewModel, FakeMirachAPI, FakeCartolaStaging) {
        api.setConsentimientosResults([consent])
        return (SubirCartolaViewModel(api: api, staging: staging), api, staging)
    }

    // MARK: entering the flow

    @Test func nothingShowsUntilTheConsentIsChecked() {
        let (viewModel, api, _) = make()

        #expect(viewModel.state == .preparando)
        #expect(api.consentimientosCalls == 0)
    }

    @Test func aConsentInForceGoesStraightToTheInitialScreen() async {
        let (viewModel, api, _) = make(consent: .success(Consentimientos(cartolasVigente: true)))

        await viewModel.start()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(api.consentimientosCalls == 1)
    }

    @Test func withoutAConsentInForceTheConsentScreenShows() async {
        let (viewModel, api, _) = make()

        await viewModel.start()

        #expect(viewModel.state == .consentimiento(failed: false))
        #expect(api.aceptarCalls == 0)
    }

    @Test func aFailedCheckLetsTheAPIDecide() async {
        let (viewModel, _, _) = make(consent: .failure(URLError(.notConnectedToInternet)))

        await viewModel.start()

        #expect(viewModel.state == .inicial(message: nil))
    }

    @Test func startingAgainWithAFileInProgressChecksNothing() async {
        let (viewModel, api, _) = make(consent: .success(Consentimientos(cartolasVigente: true)))
        await viewModel.start()
        await viewModel.chooseFile(xlsx)
        let before = viewModel.state

        await viewModel.start()

        #expect(api.consentimientosCalls == 1)
        #expect(viewModel.state == before)
    }

    // MARK: coming back to the flow (PRI-06)

    @Test func comingBackToTheInitialScreenKeepsItWhileTheConsentIsInForce() async {
        let (viewModel, api, _) = make(consent: .success(Consentimientos(cartolasVigente: true)))
        await viewModel.start()

        await viewModel.start()

        #expect(api.consentimientosCalls == 2)
        #expect(viewModel.state == .inicial(message: nil))
    }

    @Test func comingBackAfterARevocationShowsTheConsentAgain() async {
        let (viewModel, api, _) = make(consent: .success(Consentimientos(cartolasVigente: true)))
        await viewModel.start()
        api.setConsentimientosResults([.success(Consentimientos(cartolasVigente: false))])

        await viewModel.start()

        #expect(viewModel.state == .consentimiento(failed: false))
    }

    @Test func aFailedCheckOnComingBackKeepsTheInitialScreen() async {
        let (viewModel, api, _) = make(consent: .success(Consentimientos(cartolasVigente: true)))
        await viewModel.start()
        api.setConsentimientosResults([.failure(URLError(.notConnectedToInternet))])

        await viewModel.start()

        #expect(viewModel.state == .inicial(message: nil))
    }

    // MARK: «Acepto y continúo»

    @Test func acceptingSendsTheConsentAndOpensTheInitialScreen() async {
        let (viewModel, api, _) = make()
        await viewModel.start()

        await viewModel.acceptConsent()

        #expect(api.aceptarCalls == 1)
        #expect(viewModel.state == .inicial(message: nil))
        #expect(api.previewCalls.isEmpty)
    }

    @Test func whileAcceptingTheScreenWaitsAndIgnoresAnotherTap() async {
        let api = FakeMirachAPI()
        let gate = Gate()
        api.aceptarGate = gate
        let (viewModel, _, _) = make(api)
        await viewModel.start()

        let accepting = Task { await viewModel.acceptConsent() }
        await gate.waitUntilWaiting()
        #expect(viewModel.state == .aceptandoConsentimiento)
        await viewModel.acceptConsent()
        viewModel.declineConsent()
        await gate.open()
        await accepting.value

        #expect(api.aceptarCalls == 1)
        #expect(viewModel.state == .inicial(message: nil))
    }

    @Test func aFailedAcceptanceKeepsTheConsentScreenWithAMessage() async {
        let api = FakeMirachAPI()
        api.setAceptarResults([.failure(URLError(.timedOut))])
        let (viewModel, _, _) = make(api)
        await viewModel.start()

        await viewModel.acceptConsent()

        #expect(viewModel.state == .consentimiento(failed: true))
        #expect(SubirCartolaViewModel.consentAcceptFailedMessage == "No pudimos guardar tu aceptación. Inténtalo de nuevo.")
    }

    @Test func anExpiredSessionWhileAcceptingShowsNoFailureMessage() async {
        // The relay is already taking the person to sign-in.
        let api = FakeMirachAPI()
        api.setAceptarResults([.failure(APIError.sessionExpired)])
        let (viewModel, _, _) = make(api)
        await viewModel.start()

        await viewModel.acceptConsent()

        #expect(viewModel.state == .consentimiento(failed: false))
    }

    // MARK: «Ahora no»

    @Test func puttingItOffShowsWhyAndOffersToReopenIt() async {
        let (viewModel, api, _) = make()
        await viewModel.start()

        viewModel.declineConsent()

        #expect(viewModel.state == .consentimientoPospuesto)
        #expect(api.aceptarCalls == 0)

        viewModel.showConsent()

        #expect(viewModel.state == .consentimiento(failed: false))
    }

    // MARK: 409 CONSENTIMIENTO_CARTOLAS_REQUERIDO

    @Test func aConsentRequiredPreviewShowsTheConsentAndKeepsTheFile() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.consentRequired), .success(SampleData.preview)])
        let (viewModel, _, staging) = make(consent: .success(Consentimientos(cartolasVigente: true)), api)
        await viewModel.start()

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .consentimiento(failed: false))
        #expect(viewModel.stagedFile != nil)
        #expect(staging.discarded.isEmpty)
    }

    @Test func acceptingWithAWaitingFilePreviewsItAgainWithItsPassword() async throws {
        let api = FakeMirachAPI()
        api.setPreviewResults([
            .failure(IngestaError.passwordRequired), .failure(IngestaError.consentRequired), .success(SampleData.preview),
        ])
        let (viewModel, _, staging) = make(consent: .success(Consentimientos(cartolasVigente: true)), api)
        await viewModel.start()
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        #expect(viewModel.state == .consentimiento(failed: false))

        await viewModel.acceptConsent()

        #expect(api.aceptarCalls == 1)
        #expect(viewModel.state == .decidiendo(SampleData.preview))
        let last = try #require(api.previewCalls.last)
        #expect(api.previewCalls.count == 3)
        #expect(last.file == api.previewCalls[1].file)
        #expect(last.password == "buena")
        #expect(staging.discarded.isEmpty)
    }

    @Test func puttingItOffWithAWaitingFileDeletesTheCopy() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.consentRequired)])
        let (viewModel, _, staging) = make(consent: .success(Consentimientos(cartolasVigente: true)), api)
        await viewModel.start()
        await viewModel.chooseFile(xlsx)

        viewModel.declineConsent()

        #expect(viewModel.state == .consentimientoPospuesto)
        #expect(staging.discarded.map(\.filename) == ["cartola.xlsx"])
        #expect(viewModel.stagedFile == nil)

        viewModel.showConsent()
        await viewModel.acceptConsent()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(api.previewCalls.count == 1, "nothing waits any more")
    }

    @Test func aConsentRequiredCommitShowsTheConsentAndAcceptingPreviewsAgain() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.consentRequired)])
        let (viewModel, _, staging) = make(consent: .success(Consentimientos(cartolasVigente: true)), api)
        await viewModel.start()
        await viewModel.chooseFile(xlsx)

        await viewModel.uploadAsIs()

        #expect(viewModel.state == .consentimiento(failed: false))
        #expect(staging.discarded.isEmpty)

        await viewModel.acceptConsent()

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(api.previewCalls.count == 2)
        #expect(api.commitCalls.count == 1)
    }

    @Test func anIncompleteCatalogStillShowsTheAccountProblemCopy() async {
        // Shares the 409 mapping with the consent: it must keep its own meaning and copy.
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.catalogIncomplete)])
        let (viewModel, _, _) = make(consent: .success(Consentimientos(cartolasVigente: true)), api)
        await viewModel.start()

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .errorPrevia(.accountProblem))
        #expect(SubirCartolaViewModel.PreviewFailure.accountProblem.message == SubirCartolaViewModel.accountProblemMessage)
    }

    // MARK: session

    @Test func endingTheSessionDropsTheFileAndChecksTheNextPersonsConsent() async {
        let (viewModel, api, staging) = make(consent: .success(Consentimientos(cartolasVigente: true)))
        await viewModel.start()
        await viewModel.chooseFile(xlsx)

        viewModel.endSession()

        #expect(viewModel.state == .preparando)
        #expect(staging.discarded.count == 1)

        api.setConsentimientosResults([.success(Consentimientos(cartolasVigente: false))])
        await viewModel.start()

        #expect(viewModel.state == .consentimiento(failed: false))
    }

    // MARK: copy (identical to Android `SubirCartolaMessages`)

    @Test func theConsentCopyIsTheFigmaText() {
        typealias VM = SubirCartolaViewModel
        #expect(VM.consentTitle == "Antes de subir tu cartola")
        #expect(VM.consentBody
            == "Para mostrarte tu 50/30/20 necesitamos leer los movimientos de tu cartola. Esto es lo que hacemos con ella.")
        #expect(VM.consentListHeader == "Qué hacemos con tu archivo")
        #expect(VM.consentItems == [
            "1. Leemos la fecha, la descripción y el monto de cada movimiento.",
            "2. Borramos el archivo apenas terminamos de leerlo.",
            "3. Encriptamos los detalles de tus movimientos.",
            "4. No pedimos tu clave del banco ni nos conectamos a él.",
        ])
        #expect(VM.consentAccept == "Acepto y continúo")
        #expect(VM.consentDecline == "Ahora no")
        #expect(VM.consentDismissedMessage == "Para subir una cartola necesitas aceptar cómo tratamos tu archivo.")
        #expect(VM.consentReopen == "Ver el permiso")
        #expect(VM.initialPrivacyMessage
            == "No pedimos claves de tu banco. Borramos el archivo apenas terminamos de leerlo.")
    }
}

extension SubirCartolaViewModel {
    /// A view model the screen has opened with the consent in force (`FakeMirachAPI`'s default):
    /// where every test of the upload itself starts.
    static func opened(api: any MirachAPI, staging: any CartolaStaging) async -> SubirCartolaViewModel {
        let viewModel = SubirCartolaViewModel(api: api, staging: staging)
        await viewModel.start()
        return viewModel
    }
}
