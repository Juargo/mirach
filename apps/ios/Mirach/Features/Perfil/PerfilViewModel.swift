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
    /// An attempt ended without an answer (timeout, 5xx): the server may have deleted everything
    /// anyway. Kept until a deletion succeeds, even if the sheet is closed and reopened.
    private var deletionMayHaveHappened = false
    private let api: any MirachAPI
    private let session: SessionController

    init(api: any MirachAPI, session: SessionController) {
        self.api = api
        self.session = session
    }

    var hasNameChanges: Bool { Self.normalized(nombre) != Self.normalized(savedNombre) }

    /// One line: surrounding whitespace dropped, any run of spaces or newlines inside it
    /// collapsed to one space. What the person typed and what is sent differ only by this.
    static func normalized(_ name: String) -> String {
        name.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    var canSave: Bool {
        loadState == .loaded && hasNameChanges && saveState != .saving && !isBusyWithSession
    }

    var canDelete: Bool {
        deleteConfirmation == Self.confirmationWord && deleteState != .deleting && !isSigningOut
    }

    /// Signing out or deleting: the rest of the screen is locked.
    var isBusyWithSession: Bool { isSigningOut || deleteState == .deleting }

    // MARK: load

    /// Opening the screen, "Reintentar", and every time the tab comes back. Once loaded it
    /// refreshes quietly: no loading flash, a failure keeps what is on screen, an unsaved draft
    /// is never overwritten, and nothing runs while a save is in flight.
    func load() async {
        guard saveState != .saving else { return }
        let isRefresh = loadState == .loaded
        if !isRefresh { loadState = .loading }
        do {
            let user = try await api.currentUser()
            // A save may have started while this request was out: its answer wins.
            guard saveState != .saving else { return }
            if isRefresh, hasNameChanges {
                savedNombre = user.nombre
                email = user.email
            } else {
                apply(user)
            }
            loadState = .loaded
        } catch {
            if !isRefresh, let failure = Self.failure(for: error) { loadState = .failed(failure) }
        }
    }

    // MARK: name

    func save() async {
        guard canSave else { return }
        saveState = .saving
        do {
            // The answer replaces the local copy, including the name as the server normalised it.
            apply(try await api.updateNombre(Self.normalized(nombre)))
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
            case nil where Self.isExpiredSession(error) && deletionMayHaveHappened:
                // After a successful deletion the session no longer exists, so this 401 is the
                // proof that the lost attempt did go through. Say so instead of signing out silently.
                session.accountDeleted()
            // Any other 401 is left to the single relay and claims nothing about the account;
            // a cancellation just ends the attempt.
            case nil: deleteState = .idle
            case .connection?, .server?:
                deletionMayHaveHappened = true
                deleteState = .failed(.retry)
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

    private static func isExpiredSession(_ error: any Error) -> Bool {
        (error as? APIError) == .sessionExpired
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
