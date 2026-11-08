import Foundation
import Testing
@testable import Mirach

private let saved = Session(
    token: "tok-123", userId: "u-1", expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)

/// The statement-processing consent (PRI-06) in "Perfil": its section, and revoking it.
@MainActor
struct PerfilConsentTests {
    private let inForce = Consentimientos(cartolasVigente: true)
    private let notInForce = Consentimientos(cartolasVigente: false)

    private func make(
        consent: [Result<Consentimientos, any Error>] = [.success(Consentimientos(cartolasVigente: true))]
    ) async -> (PerfilViewModel, FakeMirachAPI) {
        let api = FakeMirachAPI()
        api.setConsentimientosResults(consent)
        let session = SessionController(api: api, store: InMemorySessionStore(session: saved))
        await session.start()
        return (PerfilViewModel(api: api, session: session), api)
    }

    // MARK: the section

    @Test func aConsentInForceShowsItsTextAndTheRevokeButton() async {
        let (viewModel, _) = await make()

        await viewModel.load()

        #expect(viewModel.cartolasConsent == true)
        #expect(PerfilViewModel.consentTitle == "Procesamiento de cartolas")
        #expect(viewModel.consentText == "Aceptaste que leamos tus cartolas para calcular tu 50/30/20.")
        #expect(viewModel.showsRevokeButton)
        #expect(PerfilViewModel.revokeButtonTitle == "Revocar consentimiento")
    }

    @Test func withoutAConsentInForceTheSectionExplainsItAndHasNoButton() async {
        let (viewModel, _) = await make(consent: [.success(notInForce)])

        await viewModel.load()

        #expect(viewModel.cartolasConsent == false)
        #expect(viewModel.consentText == "No has dado tu consentimiento. Te lo pediremos cuando subas una cartola.")
        #expect(!viewModel.showsRevokeButton)
    }

    @Test func whileUnknownTheSectionIsHidden() async {
        let (viewModel, _) = await make()

        #expect(viewModel.cartolasConsent == nil)
        #expect(viewModel.consentText == nil)
        #expect(!viewModel.showsRevokeButton)
    }

    @Test func aFailedConsentCheckHidesTheSectionAndNeverBlocksPerfil() async {
        let (viewModel, _) = await make(consent: [.failure(URLError(.notConnectedToInternet))])

        await viewModel.load()

        #expect(viewModel.loadState == .loaded, "the rest of Perfil still loads")
        #expect(viewModel.nombre == "Ana")
        #expect(viewModel.cartolasConsent == nil)
        #expect(viewModel.consentText == nil)
    }

    @Test func aFailedRefreshOfTheConsentHidesTheSectionAgain() async {
        let (viewModel, _) = await make(consent: [.success(inForce), .failure(APIError.badStatus(503))])
        await viewModel.load()

        await viewModel.load()

        #expect(viewModel.loadState == .loaded)
        #expect(viewModel.cartolasConsent == nil)
    }

    @Test func everyRefreshAsksForTheConsentAgain() async {
        let (viewModel, api) = await make(consent: [.success(inForce), .success(notInForce)])
        await viewModel.load()

        await viewModel.load()

        #expect(api.consentimientosCalls == 2)
        #expect(viewModel.cartolasConsent == false)
    }

    // MARK: the confirmation

    @Test func askingToRevokeOnlyOpensTheConfirmation() async {
        let (viewModel, api) = await make()
        await viewModel.load()

        viewModel.askToRevoke()

        #expect(viewModel.isConfirmingRevocation)
        #expect(api.revocarCalls == 0)
        #expect(PerfilViewModel.revokeConfirmationTitle == "¿Revocar consentimiento?")
        #expect(PerfilViewModel.revokeConfirmationMessage
            == "No podrás subir nuevas cartolas hasta que vuelvas a aceptarlo. Tus movimientos ya importados no se borran.")
        #expect(PerfilViewModel.revokeConfirmButton == "Revocar")
        #expect(PerfilViewModel.revokeCancelButton == "Cancelar")
    }

    @Test func cancellingTheConfirmationCallsNothing() async {
        let (viewModel, api) = await make()
        await viewModel.load()
        viewModel.askToRevoke()

        viewModel.cancelRevocation()

        #expect(!viewModel.isConfirmingRevocation)
        #expect(api.revocarCalls == 0)
        #expect(viewModel.cartolasConsent == true)
    }

    @Test func aSecondTapWhileRevokingDoesNothing() async {
        let (viewModel, api) = await make()
        let gate = Gate()
        api.revocarGate = gate
        await viewModel.load()

        let first = Task { await viewModel.revokeConsent() }
        await gate.waitUntilWaiting()
        #expect(viewModel.revokeState == .revoking)
        #expect(!viewModel.showsRevokeButtonEnabled)
        await viewModel.revokeConsent()
        await gate.open()
        await first.value

        #expect(api.revocarCalls == 1, "one request, not two")
    }

    // MARK: the result

    @Test func aRevocationSwitchesTheSectionAndSaysSo() async {
        let (viewModel, api) = await make()
        await viewModel.load()

        await viewModel.revokeConsent()

        #expect(api.revocarCalls == 1)
        #expect(viewModel.cartolasConsent == false)
        #expect(!viewModel.showsRevokeButton)
        #expect(viewModel.revokeMessage == "Consentimiento revocado")
        #expect(viewModel.revokeFailureMessage == nil)
    }

    @Test func withoutAnAnswerTheConsentStaysInForceWithAConnectionMessage() async {
        let (viewModel, api) = await make()
        api.setRevocarResults([.failure(URLError(.timedOut))])
        await viewModel.load()

        await viewModel.revokeConsent()

        #expect(viewModel.cartolasConsent == true)
        #expect(viewModel.showsRevokeButton)
        #expect(viewModel.revokeFailureMessage == "Problema de conexión. Revisa tu conexión e inténtalo de nuevo.")
        #expect(viewModel.revokeMessage == nil)
    }

    @Test func anyOtherServerErrorKeepsTheConsentInForceWithItsMessage() async {
        let (viewModel, api) = await make()
        api.setRevocarResults([.failure(APIError.badStatus(500))])
        await viewModel.load()

        await viewModel.revokeConsent()

        #expect(viewModel.cartolasConsent == true)
        #expect(viewModel.revokeFailureMessage == "No pudimos revocar el consentimiento. Inténtalo de nuevo.")
    }

    @Test func aRefreshClearsTheLastResultMessage() async {
        let (viewModel, api) = await make(consent: [.success(inForce), .success(notInForce)])
        await viewModel.load()
        await viewModel.revokeConsent()
        #expect(viewModel.revokeMessage == "Consentimiento revocado")

        await viewModel.load()

        #expect(viewModel.revokeMessage == nil)
        #expect(viewModel.cartolasConsent == false)
    }

    @Test func aRefreshClearsAFailureMessage() async {
        let (viewModel, api) = await make()
        api.setRevocarResults([.failure(APIError.badStatus(500))])
        await viewModel.load()
        await viewModel.revokeConsent()
        #expect(viewModel.revokeFailureMessage != nil)

        await viewModel.load()

        #expect(viewModel.revokeFailureMessage == nil)
        #expect(viewModel.cartolasConsent == true)
    }

    @Test func aRefreshNeverOverridesARevocationInFlight() async {
        let (viewModel, api) = await make(consent: [.success(inForce)])
        let gate = Gate()
        api.revocarGate = gate
        await viewModel.load()

        let revoking = Task { await viewModel.revokeConsent() }
        await gate.waitUntilWaiting()
        await viewModel.load()
        #expect(viewModel.revokeState == .revoking)
        #expect(viewModel.cartolasConsent == true, "the refresh's answer does not replace the pending one")
        await gate.open()
        await revoking.value

        #expect(viewModel.cartolasConsent == false)
        #expect(viewModel.revokeMessage == "Consentimiento revocado")
    }

    @Test func confirmingClosesTheDialogRightAway() async {
        let (viewModel, api) = await make()
        let gate = Gate()
        api.revocarGate = gate
        await viewModel.load()
        viewModel.askToRevoke()

        let revoking = Task { await viewModel.revokeConsent() }
        await gate.waitUntilWaiting()
        #expect(!viewModel.isConfirmingRevocation)
        #expect(viewModel.showsRevokeButton, "the button stays, disabled")
        #expect(!viewModel.showsRevokeButtonEnabled)
        await gate.open()
        await revoking.value
    }

    @Test func anExpiredSessionWhileRevokingAddsNoMessageOfItsOwn() async {
        let (viewModel, api) = await make()
        api.setRevocarResults([.failure(APIError.sessionExpired)])
        await viewModel.load()

        await viewModel.revokeConsent()

        #expect(viewModel.revokeState == .idle, "the single relay signs out; the screen stays quiet")
        #expect(viewModel.revokeFailureMessage == nil)
        #expect(viewModel.revokeMessage == nil)
        #expect(viewModel.cartolasConsent == true)
    }
}
