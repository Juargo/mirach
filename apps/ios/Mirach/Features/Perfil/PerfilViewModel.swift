import Foundation
import Observation

/// State of "Perfil": the name to edit, the email to show, and the two session actions.
@MainActor
@Observable
final class PerfilViewModel {
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

    enum SaveFailure: Equatable {
        case invalidName
        case connection
        case server
    }

    enum SaveState: Equatable {
        case idle
        case saving
        case saved
        case failed(SaveFailure)
    }

    enum DeleteFailure: Equatable {
        /// The server did not take the word (nothing was deleted).
        case confirmationRejected
        /// Network or server trouble: nothing is assumed deleted.
        case retry
    }

    enum DeleteState: Equatable {
        case idle
        case deleting
        case failed(DeleteFailure)
    }

    /// The word the person types to confirm; the same text goes to the API.
    static let confirmationWord = "ELIMINAR"

    private(set) var loadState: LoadState = .loading
    private(set) var email: String?
    /// The text field; the person edits it freely.
    var nombre = ""
    private(set) var saveState: SaveState = .idle
    private(set) var isSigningOut = false
    var deleteConfirmation = ""
    private(set) var deleteState: DeleteState = .idle

    /// The name as the server has it, to know whether there is anything to save.
    private var savedNombre = ""
    private let api: any MirachAPI
    private let session: SessionController

    init(api: any MirachAPI, session: SessionController) {
        self.api = api
        self.session = session
    }

    var hasNameChanges: Bool { nombre.trimmingCharacters(in: .whitespacesAndNewlines) != savedNombre }

    var canSave: Bool {
        loadState == .loaded && hasNameChanges && saveState != .saving && !isBusyWithSession
    }

    var canDelete: Bool {
        deleteConfirmation == Self.confirmationWord && deleteState != .deleting && !isSigningOut
    }

    /// Signing out or deleting: the rest of the screen is locked.
    var isBusyWithSession: Bool { isSigningOut || deleteState == .deleting }

    // MARK: load

    /// Opening the screen, and "Reintentar".
    func load() async {
        loadState = .loading
        do {
            apply(try await api.currentUser())
            loadState = .loaded
        } catch {
            if let failure = Self.failure(for: error) { loadState = .failed(failure) }
        }
    }

    // MARK: name

    func save() async {
        guard canSave else { return }
        saveState = .saving
        do {
            // The answer replaces the local copy, including the name as the server normalised it.
            apply(try await api.updateNombre(nombre.trimmingCharacters(in: .whitespacesAndNewlines)))
            saveState = .saved
        } catch {
            // What was typed stays in the field for another try.
            if error as? PerfilError == .invalidName {
                saveState = .failed(.invalidName)
                return
            }
            switch Self.failure(for: error) {
            case .connection?: saveState = .failed(.connection)
            case .server?: saveState = .failed(.server)
            // A 401 (the relay signs out) or a cancellation: no message of its own.
            case nil: saveState = .idle
            }
        }
    }

    // MARK: session

    func signOut() async {
        guard !isSigningOut else { return }
        isSigningOut = true
        await session.signOutRemotely()
    }

    /// Only a typed `ELIMINAR` reaches the API; a second tap while one request is out does nothing.
    func deleteAccount() async {
        guard canDelete else { return }
        deleteState = .deleting
        do {
            try await api.deleteAccount(confirmation: deleteConfirmation)
            session.accountDeleted()
        } catch CuentaError.confirmationRejected {
            deleteState = .failed(.confirmationRejected)
        } catch {
            switch Self.failure(for: error) {
            // 401 is left to the single relay and says nothing about the account.
            case nil: deleteState = .idle
            case .connection?, .server?: deleteState = .failed(.retry)
            }
        }
    }

    /// The confirmation screen was dismissed: forget the word and the error.
    func resetDeletion() {
        guard deleteState != .deleting else { return }
        deleteConfirmation = ""
        deleteState = .idle
    }

    // MARK: internals

    private func apply(_ user: CurrentUser) {
        nombre = user.nombre
        savedNombre = user.nombre
        email = user.email
    }

    /// `nil` for what needs no message here: an expired session (the relay already signs out)
    /// and a cancelled request.
    private static func failure(for error: any Error) -> Failure? {
        switch error {
        case is CancellationError, APIError.sessionExpired: nil
        case let error as URLError where error.code == .cancelled: nil
        case is URLError: .connection
        default: .server
        }
    }
}
