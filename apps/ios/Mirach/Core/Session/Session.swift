import Foundation

/// A signed-in session as the API returns it (`AuthLoginResponse`).
struct Session: Codable, Equatable, Sendable {
    let token: String
    let userId: String
    let expiresAt: Date
}

/// Where the session lives between launches. A protocol so tests use an in-memory
/// fake while the app uses the Keychain.
protocol SessionStore: Sendable {
    /// `nil` when there is no session (or what was stored cannot be read).
    func load() -> Session?
    func save(_ session: Session) throws
    func clear()
}

/// Test and UI-test double. A class with a lock because `SessionStore` is `Sendable`
/// and the real store is read from the network layer's threads too.
final class InMemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: Session?

    init(session: Session? = nil) {
        self.session = session
    }

    func load() -> Session? { lock.withLock { session } }
    func save(_ session: Session) throws { lock.withLock { self.session = session } }
    func clear() { lock.withLock { session = nil } }
}
