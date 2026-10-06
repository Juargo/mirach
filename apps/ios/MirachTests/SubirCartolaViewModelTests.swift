import Foundation
import Testing
@testable import Mirach

@MainActor
struct SubirCartolaViewModelTests {
    private let xlsx = URL(fileURLWithPath: "/picked/cartola.xlsx")
    private let pdf = URL(fileURLWithPath: "/picked/cartola.pdf")

    private func make(
        _ api: FakeMirachAPI = FakeMirachAPI(), _ staging: FakeCartolaStaging = FakeCartolaStaging()
    ) -> (SubirCartolaViewModel, FakeMirachAPI, FakeCartolaStaging) {
        (SubirCartolaViewModel(api: api, staging: staging), api, staging)
    }

    // MARK: choosing a file

    @Test func startsEmpty() {
        let (viewModel, _, _) = make()

        #expect(viewModel.state == .inicial(message: nil))
    }

    @Test func creatingAnotherViewModelNeverTouchesTheStagedCopyOfALiveFlow() async {
        // SwiftUI can build a throwaway view model while the live one is mid-flow.
        let (live, api, staging) = make()
        await live.chooseFile(xlsx)

        _ = SubirCartolaViewModel(api: api, staging: staging)

        #expect(staging.purges == 0)
        #expect(staging.discarded.isEmpty)
        #expect(live.stagedFile != nil)
    }

    @Test func anUnreadableStagedCopyOnPreviewAsksForTheFileAgain() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.fileUnreadable)])
        let (viewModel, _, staging) = make(api)

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .inicial(message: SubirCartolaViewModel.unreadableCopyMessage))
        #expect(SubirCartolaViewModel.unreadableCopyMessage == "No pudimos leer el archivo. Elígelo de nuevo.")
        #expect(staging.discarded.count == 1)
        #expect(viewModel.stagedFile == nil)
    }

    @Test func anUnreadableStagedCopyOnCommitAsksForTheFileAgainAndDropsThePassword() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([
            .failure(IngestaError.passwordRequired), .success(SampleData.preview), .success(SampleData.preview),
        ])
        api.setCommitResults([.failure(IngestaError.fileUnreadable)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")

        await viewModel.uploadAsIs()

        #expect(viewModel.state == .inicial(message: SubirCartolaViewModel.unreadableCopyMessage))
        #expect(staging.discarded.count == 1)
        await viewModel.chooseFile(pdf)
        #expect(api.previewCalls.last?.password == nil)
    }

    @Test func aValidFileGoesToPreviewAndThenToDeciding() async {
        let (viewModel, api, staging) = make()

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(staging.staged == [xlsx])
        #expect(api.previewCalls.map(\.file.filename) == ["cartola.xlsx"])
        #expect(api.previewCalls.first?.password == nil)
    }

    @Test(arguments: [
        CartolaFileProblem.unsupportedExtension, .tooLarge, .unreadable,
    ])
    func aRefusedFileNeverReachesTheAPI(problem: CartolaFileProblem) async {
        let (viewModel, api, staging) = make()
        staging.failNextStage(with: problem)

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .inicial(message: SubirCartolaViewModel.message(for: problem)))
        #expect(api.previewCalls.isEmpty)
    }

    @Test func refusalMessagesAreTheCatalogsOwn() {
        #expect(SubirCartolaViewModel.message(for: .unsupportedExtension) == "Elige un archivo .xlsx o .pdf.")
        #expect(SubirCartolaViewModel.message(for: .tooLarge) == "El archivo pesa más de 10 MB. Elige uno más pequeño.")
    }

    @Test func choosingIsIgnoredWhileDecidingOrUploading() async {
        let (viewModel, api, _) = make()
        await viewModel.chooseFile(xlsx)

        await viewModel.chooseFile(pdf)

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(api.previewCalls.count == 1)
    }

    // MARK: preview errors

    @Test func eachPreviewErrorLandsInItsStateWithTheCatalogsCopy() async {
        let cases: [(any Error, SubirCartolaViewModel.PreviewFailure, String)] = [
            (IngestaError.noMovements, .noMovements, "No encontramos movimientos en el archivo"),
            (IngestaError.rejected(message: "Banco no reconocido"), .rejected(message: "Banco no reconocido"), "Banco no reconocido"),
            (IngestaError.catalogUnavailable, .temporarilyUnavailable, "No se pudo analizar ahora, intenta de nuevo."),
            (IngestaError.serverFailure, .server, "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos."),
            (URLError(.notConnectedToInternet), .connection, "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."),
            (URLError(.cancelled), .connection, "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."),
            (APIError.badStatus(502), .server, "No pudimos analizar la cartola. Inténtalo de nuevo en unos segundos."),
        ]
        for (error, failure, text) in cases {
            let api = FakeMirachAPI()
            api.setPreviewResults([.failure(error)])
            let (model, _, _) = make(api)

            await model.chooseFile(xlsx)

            #expect(model.state == .errorPrevia(failure), "for \(error)")
            #expect(failure.message == text)
        }
    }

    @Test func retryingAPreviewRepeatsTheCallWithTheSameFile() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.serverFailure), .success(SampleData.preview)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(xlsx)

        await viewModel.retryPreview()

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        #expect(api.previewCalls.count == 2)
        #expect(api.previewCalls.first?.file == api.previewCalls.last?.file)
    }

    @Test func aFailedPreviewAllowsChoosingAnotherFile() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.serverFailure), .success(SampleData.preview)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(xlsx)

        await viewModel.chooseFile(pdf)

        #expect(viewModel.state == .decidiendo(SampleData.preview))
        // The first copy is deleted when the person changes file.
        #expect(staging.discarded.map(\.filename) == ["cartola.xlsx"])
    }

    @Test func anExpiredSessionClearsTheFlowInsteadOfShowingAnError() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(APIError.sessionExpired)])
        let (viewModel, _, staging) = make(api)

        await viewModel.chooseFile(xlsx)

        #expect(viewModel.state == .inicial(message: nil))
        #expect(staging.discarded.count == 1)
    }

    // MARK: password

    @Test func aProtectedPdfAsksForThePasswordAndTheServerIsNeverToldTheFileName() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired)])
        let (viewModel, _, _) = make(api)

        await viewModel.chooseFile(pdf)

        #expect(viewModel.state == .protegido(filename: "cartola.pdf", incorrect: false))
    }

    @Test func aWrongPasswordAsksAgain() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .failure(IngestaError.passwordIncorrect)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)

        await viewModel.submitPassword("mala")

        #expect(viewModel.state == .protegido(filename: "cartola.pdf", incorrect: true))
        #expect(api.previewCalls.last?.password == "mala")
    }

    @Test func theCorrectPasswordIsResentOnTheCommit() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)

        await viewModel.submitPassword("buena")
        await viewModel.uploadAsIs()

        #expect(api.previewCalls.map(\.password) == [nil, "buena"])
        #expect(api.commitCalls.map(\.password) == ["buena"])
    }

    @Test func anEmptyPasswordIsNotSent() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)

        await viewModel.submitPassword("")

        #expect(api.previewCalls.count == 1)
        #expect(viewModel.state == .protegido(filename: "cartola.pdf", incorrect: false))
    }

    @Test func changingFileDropsThePassword() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([
            .failure(IngestaError.passwordRequired), .success(SampleData.preview), .success(SampleData.preview),
        ])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        viewModel.discard()

        await viewModel.chooseFile(pdf)
        await viewModel.uploadAsIs()

        #expect(api.previewCalls.last?.password == nil)
        #expect(api.commitCalls.last?.password == nil)
    }

    @Test func discardingDropsThePasswordAndTheFileCopy() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")

        viewModel.discard()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(viewModel.stagedFile == nil)
        #expect(staging.discarded.map(\.filename) == ["cartola.pdf"])
        await viewModel.uploadAsIs()
        #expect(api.commitCalls.isEmpty)
    }

    @Test func finishingDropsThePasswordAndDeletesTheCopy() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")

        await viewModel.uploadAsIs()

        #expect(staging.discarded.map(\.filename) == ["cartola.pdf"])
        #expect(viewModel.stagedFile == nil)
        // "Subir otra cartola" starts a new flow, which must not carry the old password.
        viewModel.discard()
        await viewModel.chooseFile(xlsx)
        #expect(api.previewCalls.last?.password == nil)
    }

    // MARK: upload

    @Test func uploadAsIsSendsEmptyEditsAndEndsInSuccess() async {
        let (viewModel, api, _) = make()
        await viewModel.chooseFile(xlsx)

        await viewModel.uploadAsIs()

        #expect(api.commitCalls.count == 1)
        #expect(api.commitCalls.first?.edits == [])
        #expect(api.commitCalls.first?.file.filename == "cartola.xlsx")
        #expect(viewModel.state == .exito(.init(banco: "Banco de Chile", totalTransacciones: 37, duplicadosOmitidos: 5)))
        #expect(viewModel.importsCompleted == 1)
    }

    @Test func successCopyHandlesSingularAndNoDuplicates() {
        let one = SubirCartolaViewModel.ImportSummary(banco: "BCI", totalTransacciones: 1, duplicadosOmitidos: 1)
        let many = SubirCartolaViewModel.ImportSummary(banco: "BCI", totalTransacciones: 37, duplicadosOmitidos: 0)

        #expect(one.headline == "1 movimiento importado de BCI")
        #expect(one.duplicatesLine == "1 duplicado omitido")
        #expect(many.headline == "37 movimientos importados de BCI")
        #expect(many.duplicatesLine == nil)
        #expect(SubirCartolaViewModel.ImportSummary(banco: "B", totalTransacciones: 2, duplicadosOmitidos: 3).duplicatesLine == "3 duplicados omitidos")
    }

    @Test func uploadAsIsOnlyWorksFromDeciding() async {
        let (viewModel, api, _) = make()

        await viewModel.uploadAsIs()

        #expect(api.commitCalls.isEmpty)
        #expect(viewModel.state == .inicial(message: nil))
    }

    @Test func eachImportErrorLandsInItsStateAndKeepsTheFileForARetry() async {
        let cases: [(any Error, SubirCartolaViewModel.ImportFailure, String)] = [
            (IngestaError.catalogUnavailable, .temporarilyUnavailable, "No se pudo importar ahora, intenta de nuevo. No se guardó nada."),
            (IngestaError.serverFailure, .server, "No pudimos importar la cartola. No se guardó nada; inténtalo de nuevo."),
            (URLError(.networkConnectionLost), .connection, "Problema de conexión. No se guardó nada; revisa tu conexión e inténtalo de nuevo."),
            (URLError(.cancelled), .connection, "Problema de conexión. No se guardó nada; revisa tu conexión e inténtalo de nuevo."),
        ]
        for (error, failure, text) in cases {
            let api = FakeMirachAPI()
            api.setCommitResults([.failure(error)])
            let (viewModel, _, staging) = make(api)
            await viewModel.chooseFile(xlsx)

            await viewModel.uploadAsIs()

            #expect(viewModel.state == .errorImportacion(failure), "for \(error)")
            #expect(failure.message == text)
            #expect(failure.isRetryable)
            #expect(staging.discarded.isEmpty, "the file must survive for the retry")
            #expect(viewModel.importsCompleted == 0)
        }
    }

    @Test func retryingAnImportRepeatsTheCommitWithTheSameFileAndPassword() async {
        let api = FakeMirachAPI()
        api.setPreviewResults([.failure(IngestaError.passwordRequired), .success(SampleData.preview)])
        api.setCommitResults([.failure(IngestaError.serverFailure), .success(SampleData.commit)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(pdf)
        await viewModel.submitPassword("buena")
        await viewModel.uploadAsIs()

        await viewModel.uploadAsIs()

        #expect(api.commitCalls.count == 2)
        #expect(api.commitCalls.first == api.commitCalls.last)
        #expect(api.commitCalls.last?.password == "buena")
        #expect(viewModel.state == .exito(.init(banco: "Banco de Chile", totalTransacciones: 37, duplicadosOmitidos: 5)))
    }

    @Test func aBrokenAccountCatalogIsPermanentAndNotRetried() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.catalogIncomplete)])
        let (viewModel, _, _) = make(api)
        await viewModel.chooseFile(xlsx)
        await viewModel.uploadAsIs()

        #expect(viewModel.state == .errorImportacion(.accountProblem))
        #expect(!SubirCartolaViewModel.ImportFailure.accountProblem.isRetryable)
        #expect(SubirCartolaViewModel.ImportFailure.accountProblem.message.hasPrefix("No pudimos importar tu cartola por un problema de tu cuenta."))
        await viewModel.uploadAsIs()
        #expect(api.commitCalls.count == 1)
    }

    @Test func aRejectedFileOnCommitGoesBackToTheStartWithTheServerMessage() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.rejected(message: "Archivo inválido"))])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(xlsx)

        await viewModel.uploadAsIs()

        #expect(viewModel.state == .inicial(message: "Archivo inválido"))
        #expect(staging.discarded.count == 1)
    }

    @Test func anExpiredSessionDuringTheCommitClearsTheFlow() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(APIError.sessionExpired)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(xlsx)

        await viewModel.uploadAsIs()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(staging.discarded.count == 1)
    }

    @Test func discardingFromAnImportErrorGoesBackToTheStart() async {
        let api = FakeMirachAPI()
        api.setCommitResults([.failure(IngestaError.catalogIncomplete)])
        let (viewModel, _, staging) = make(api)
        await viewModel.chooseFile(xlsx)
        await viewModel.uploadAsIs()

        viewModel.discard()

        #expect(viewModel.state == .inicial(message: nil))
        #expect(staging.discarded.count == 1)
    }

    // MARK: in flight

    @Test func aLateAnswerAfterDiscardingIsDropped() async {
        let api = FakeMirachAPI()
        let gate = Gate()
        api.previewGate = gate
        let (viewModel, _, _) = make(api)

        let choosing = Task { await viewModel.chooseFile(xlsx) }
        await gate.waitUntilWaiting()
        #expect(viewModel.state == .previsualizando)
        viewModel.discard()
        await gate.open()
        await choosing.value

        #expect(viewModel.state == .inicial(message: nil))
    }
}
