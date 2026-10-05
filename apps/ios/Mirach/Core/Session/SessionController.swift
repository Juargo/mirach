import Foundation
import Observation
import os

/// Owns "who is signed in" for the whole app. The root view only draws `phase`.
///
/// `@MainActor` because views read it; `@Observable` so SwiftUI redraws when `phase` changes.
@MainActor
@Observable
final class SessionController {
    enum Phase: Equatable {
        /// Checking a saved session with the server (or nothing decided yet).
        case validating
        case signedOut
        case signedIn(userId: String)
        /// A saved session exists but the server could not be reached: offer retry.
        case connectionFailed
        /// The server rejected the app's own client key: no sign-in can fix it.
        case misconfigured
    }

    private(set) var phase: Phase = .validating

    private let logger = Logger(subsystem: "app.mirachbudget.ios", category: "session")
    private let api: any MirachAPI
    private let store: any SessionStore

    init(api: any MirachAPI, store: any SessionStore) {
        self.api = api
        self.store = store
    }

    /// Startup (and retry): with a saved token ask `GET /api/auth/me`; without one go to sign-in.
    func start() async {
        guard store.load() != nil else {
            phase = .signedOut
            return
        }
        phase = .validating
        let validatedToken = store.load()?.token
        do {
            let user = try await api.currentUser()
            phase = .signedIn(userId: user.userId)
        } catch APIError.sessionExpired {
            // The API adapter also notifies the relay; whichever arrives second finds the
            // session already gone (or replaced) and does nothing.
            if let validatedToken { sessionExpired(token: validatedToken) }
        } catch APIError.apiKeyRejected {
            // The session is probably fine; the app's key is not. Keep the session.
            phase = .misconfigured
        } catch is CancellationError {
            // The screen went away mid-request: leave the state as it was.
        } catch let error as URLError where error.code == .cancelled {
            // URLSession reports a cancelled task as URLError(.cancelled).
        } catch {
            // No answer from the server (offline, timeout, 5xx): do NOT discard the session.
            phase = .connectionFailed
        }
    }

    /// Saves a fresh session (from a successful sign-in) and opens the signed-in area.
    /// Throws if the Keychain refuses the write: better an error than a session that
    /// vanishes on the next launch.
    func signIn(_ session: Session) throws {
        try store.save(session)
        phase = .signedIn(userId: session.userId)
    }

    func signOut() {
        do {
            try store.clear()
        } catch {
            // Still show signed-out; but the token is still stored and would be picked up
            // at the next launch. Log it (never the token itself).
            logger.error("Could not delete the saved session from the Keychain: \(String(describing: error), privacy: .public)")
        }
        phase = .signedOut
    }

    /// The server rejected the session identified by `token` (any authenticated call, or
    /// startup validation). Notifications arrive asynchronously, so one can be late: it only
    /// applies if that token is STILL the current session, otherwise a stale 401 would sign
    /// the person out of a newer sign-in. No retry.
    func sessionExpired(token: String) {
        guard store.load()?.token == token else { return }
        signOut()
    }
}

/// Lets the API adapter (built first, on any thread) tell the `SessionController`
/// (built second, on the main actor) that a 401 arrived, without either holding the other.
final class SessionExpiryRelay: @unchecked Sendable {
    private let lock = NSLock()
    private var receiver: (@Sendable (String) async -> Void)?
    private var pending: Task<Void, Never>?

    func connect(_ receiver: @escaping @Sendable (String) async -> Void) {
        lock.withLock { self.receiver = receiver }
    }

    /// Called from the network layer; hops to wherever the receiver wants to run.
    /// `token` identifies the session that was rejected.
    func fire(token: String) {
        lock.withLock {
            guard let receiver else { return }
            pending = Task { await receiver(token) }
        }
    }

    /// Lets tests wait for the hop to finish.
    func waitForDelivery() async {
        let task = lock.withLock { pending }
        await task?.value
    }
}
