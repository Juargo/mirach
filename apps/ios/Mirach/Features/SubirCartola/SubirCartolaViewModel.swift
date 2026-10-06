import Foundation
import Observation

/// State machine of "Subir cartola" (`docs/catalogo/pantallas/subir-cartola.md`). T5a covers
/// everything up to "Subir tal cual"; the `revisando` state belongs to T5b.
///
/// The password and the staged file live in private properties, never in `state`, so they
/// cannot leak through a screen, a log line or a test failure message.
@MainActor
@Observable
final class SubirCartolaViewModel {
    enum State: Equatable {
        /// Nothing chosen. `message` explains a refused file or a rejected upload.
        case inicial(message: String?)
        case previsualizando
        /// A protected PDF: ask for the password (`incorrect` after a wrong attempt).
        case protegido(filename: String, incorrect: Bool)
        case errorPrevia(PreviewFailure)
        case decidiendo(CartolaPreview)
        case subiendo
        case errorImportacion(ImportFailure)
        case exito(ImportSummary)
    }

    enum PreviewFailure: Equatable {
        case noMovements
        /// The server's own message for a bad file, unknown bank or bad structure.
        case rejected(message: String)
        case temporarilyUnavailable
        case accountProblem
        case connection
        case server
    }

    enum ImportFailure: Equatable {
        case temporarilyUnavailable
        /// Permanent: retrying cannot help.
        case accountProblem
        case connection
        case server

        var isRetryable: Bool { self != .accountProblem }
    }

    struct ImportSummary: Equatable {
        let banco: String
        let totalTransacciones: Int
        let duplicadosOmitidos: Int
    }

    private(set) var state: State = .inicial(message: nil)
    /// Grows by one with every finished import: lets the signed-in shell reload the Resumen.
    private(set) var importsCompleted = 0

    /// The staged file, for the "Archivo elegido" line. `nil` when nothing is staged.
    var stagedFile: CartolaFile? { file }

    private let api: any MirachAPI
    private let staging: any CartolaStaging
    private var file: CartolaFile?
    private var password: String?
    private var preview: CartolaPreview?
    /// Bumped whenever the flow is reset so an answer to an old request is dropped.
    private var generation = 0

    init(api: any MirachAPI, staging: any CartolaStaging) {
        self.api = api
        self.staging = staging
        // A previous run may have been killed mid-flow, leaving a copy behind.
        staging.purgeAll()
    }

    // MARK: actions

    /// Picked from the document picker (or from the UI-test hook). Validates and stages the
    /// file, then asks for the preview. Allowed where the person can choose another file.
    func chooseFile(_ source: URL) async {
        switch state {
        case .inicial, .protegido, .errorPrevia: break
        default: return
        }
        clear()
        let mine = generation
        do {
            file = try staging.stage(source)
        } catch let problem as CartolaFileProblem {
            state = .inicial(message: Self.message(for: problem))
            return
        } catch {
            state = .inicial(message: Self.message(for: .unreadable))
            return
        }
        await runPreview(generation: mine)
    }

    /// "Reintentar" with a password from the `protegido` state.
    func submitPassword(_ text: String) async {
        guard case .protegido = state, !text.isEmpty else { return }
        password = text
        await runPreview(generation: generation)
    }

    /// "Reintentar" after a failed preview.
    func retryPreview() async {
        guard case .errorPrevia = state, file != nil else { return }
        await runPreview(generation: generation)
    }

    /// "Subir tal cual" (and "Reintentar" after a failed import): commit with no edits.
    func uploadAsIs() async {
        switch state {
        case .decidiendo: break
        case .errorImportacion(let failure) where failure.isRetryable: break
        default: return
        }
        guard let file, let preview else { return }
        state = .subiendo
        let mine = generation
        do {
            let result = try await api.commitIngesta(file: file, password: password, edits: [])
            guard mine == generation else { return }
            // Done: the copy and the password are not needed any more.
            let summary = ImportSummary(
                banco: preview.banco,
                totalTransacciones: result.totalTransacciones,
                duplicadosOmitidos: result.duplicadosOmitidos
            )
            clear()
            importsCompleted += 1
            state = .exito(summary)
        } catch {
            guard mine == generation else { return }
            failImport(error)
        }
    }

    /// Discard, "Subir otra cartola", "Empezar de nuevo" and sign-out all end here: back to
    /// the start with the file copy and the password gone. The confirmation dialog belongs to
    /// the view.
    func discard() {
        clear()
        state = .inicial(message: nil)
    }

    // MARK: internals

    private func runPreview(generation mine: Int) async {
        guard let file else { return }
        state = .previsualizando
        do {
            let result = try await api.previewIngesta(file: file, password: password)
            guard mine == generation else { return }
            preview = result
            state = .decidiendo(result)
        } catch {
            guard mine == generation else { return }
            failPreview(error, filename: file.filename)
        }
    }

    private func failPreview(_ error: any Error, filename: String) {
        switch error {
        case APIError.sessionExpired:
            // The root view is already moving to sign-in; leave nothing behind.
            discard()
        case IngestaError.passwordRequired:
            password = nil
            state = .protegido(filename: filename, incorrect: false)
        case IngestaError.passwordIncorrect:
            password = nil
            state = .protegido(filename: filename, incorrect: true)
        case IngestaError.noMovements: state = .errorPrevia(.noMovements)
        case IngestaError.rejected(let message): state = .errorPrevia(.rejected(message: message))
        case IngestaError.catalogUnavailable: state = .errorPrevia(.temporarilyUnavailable)
        case IngestaError.catalogIncomplete: state = .errorPrevia(.accountProblem)
        case is URLError, is CancellationError: state = .errorPrevia(.connection)
        default: state = .errorPrevia(.server)
        }
    }

    private func failImport(_ error: any Error) {
        switch error {
        case APIError.sessionExpired:
            discard()
        case IngestaError.rejected(let message):
            // Same family as the preview's 400 (file, bank, structure): back to the start.
            clear()
            state = .inicial(message: message)
        case IngestaError.noMovements:
            clear()
            state = .inicial(message: Self.noMovementsMessage)
        case IngestaError.catalogIncomplete: state = .errorImportacion(.accountProblem)
        case IngestaError.catalogUnavailable: state = .errorImportacion(.temporarilyUnavailable)
        // A cancelled request (the app went to the background) is safe to retry: a failed
        // commit saves nothing.
        case is URLError, is CancellationError: state = .errorImportacion(.connection)
        default: state = .errorImportacion(.server)
        }
    }

    /// Forgets the file, its copy on disk, the password and any pending answer.
    private func clear() {
        generation += 1
        if let file { staging.discard(file) }
        file = nil
        password = nil
        preview = nil
    }
}
