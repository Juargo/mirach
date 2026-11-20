import Foundation
import Observation

/// State of "Perfil de porcentajes": the stored profile, the card the person picked and the save.
@MainActor
@Observable
final class PerfilPresupuestoViewModel {
    enum Failure: Equatable {
        /// No answer from the server (offline, timeout).
        case connection
        /// The server answered with something the app cannot use.
        case server
    }

    enum LoadState: Equatable {
        case loading
        case loaded
        case failed(Failure)
    }

    enum SaveState: Equatable {
        case idle
        case saving
        case saved
        case failed(Failure)
    }

    private(set) var loadState: LoadState = .loading
    private(set) var saveState: SaveState = .idle
    /// The selected card; `nil` while nothing is (also when the stored profile is `personalizado`).
    private(set) var selection: PerfilPredefinido?

    /// What the server has, to know whether there is anything to save.
    private var stored: PerfilPresupuesto?
    private let api: any MirachAPI
    /// Runs once after a successful save, so the Resumen reads its new targets.
    private let onSaved: @MainActor () -> Void

    init(api: any MirachAPI, onSaved: @escaping @MainActor () -> Void = {}) {
        self.api = api
        self.onSaved = onSaved
    }

    /// "Guardar": a loaded screen, a card picked that differs from the stored profile, no save in flight.
    var canSave: Bool {
        guard loadState == .loaded, saveState != .saving, let selection else { return false }
        return stored != .predefinido(selection)
    }

    var saveFailureMessage: String? {
        guard case .failed(let failure) = saveState else { return nil }
        switch failure {
        case .connection: return "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
        case .server: return "No pudimos guardar el perfil. Inténtalo de nuevo."
        }
    }

    var loadFailureMessage: String? {
        guard case .failed(let failure) = loadState else { return nil }
        return failure == .connection ? PerfilPresupuestoCopy.loadConnection : PerfilPresupuestoCopy.loadServer
    }

    func load() async {
        loadState = .loading
        do {
            let perfil = try await api.perfilPresupuesto()
            stored = perfil
            if case .predefinido(let predefinido) = perfil { selection = predefinido } else { selection = nil }
            loadState = .loaded
        } catch {
            // A 401 or a cancellation: no message, the root view is switching to sign-in.
            guard let failure = Self.failure(for: error) else { return }
            loadState = .failed(failure)
        }
    }

    func select(_ perfil: PerfilPredefinido) {
        guard loadState == .loaded, saveState != .saving else { return }
        selection = perfil
        if case .failed = saveState { saveState = .idle }
    }

    func save() async {
        guard canSave, let selection else { return }
        saveState = .saving
        do {
            stored = try await api.guardarPerfilPresupuesto(selection)
            saveState = .saved
            onSaved()
        } catch {
            // The selection stays for another try.
            if let failure = Self.failure(for: error) {
                saveState = .failed(failure)
            } else {
                saveState = .idle
            }
        }
    }

    /// `nil` means "show nothing": cancelled, or the session expired.
    private static func failure(for error: any Error) -> Failure? {
        switch error {
        case is CancellationError, APIError.sessionExpired: nil
        case let error as URLError where error.code == .cancelled: nil
        case is URLError: .connection
        default: .server
        }
    }
}
