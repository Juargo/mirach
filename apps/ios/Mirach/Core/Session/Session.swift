import Foundation

/// A signed-in session as the API returns it (`AuthLoginResponse`).
struct Session: Codable, Equatable, Sendable {
    let token: String
    let userId: String
    let expiresAt: Date
    /// An account with no Apple or Google identity yet (ADR-013). Persisted with the session so it
    /// survives a relaunch; a session stored by an older app version has no such key and decodes
    /// as `false`.
    let isAnonymous: Bool

    init(token: String, userId: String, expiresAt: Date, isAnonymous: Bool = false) {
        self.token = token
        self.userId = userId
        self.expiresAt = expiresAt
        self.isAnonymous = isAnonymous
    }

    init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        token = try container.decode(String.self, forKey: .token)
        userId = try container.decode(String.self, forKey: .userId)
        expiresAt = try container.decode(Date.self, forKey: .expiresAt)
        isAnonymous = try container.decodeIfPresent(Bool.self, forKey: .isAnonymous) ?? false
    }
}

/// Where the session lives between launches. A protocol so tests use an in-memory
/// fake while the app uses the Keychain.
protocol SessionStore: Sendable {
    /// `nil` when there is no session (or what was stored cannot be read).
    func load() -> Session?
    func save(_ session: Session) throws
    /// Throws if the stored session could not be deleted (it would come back next launch).
    func clear() throws
    /// Keeps the anonymous session in a SEPARATE item that `clear()` never touches, so the data
    /// of an anonymous account can be recovered after the person enters an existing account
    /// (ADR-013). Throws if it could not be written.
    func saveAnonymousBackup(_ session: Session) throws
    func loadAnonymousBackup() -> Session?
    /// Removes the parked session once its data was merged, or can no longer be (ADR-014).
    func clearAnonymousBackup() throws
}

/// Test and UI-test double. A class with a lock because `SessionStore` is `Sendable`
/// and the real store is read from the network layer's threads too.
final class InMemorySessionStore: SessionStore, @unchecked Sendable {
    private let lock = NSLock()
    private var session: Session?
    private var anonymousBackup: Session?

    init(session: Session? = nil) {
        self.session = session
    }

    func load() -> Session? { lock.withLock { session } }
    func save(_ session: Session) throws { lock.withLock { self.session = session } }
    func clear() { lock.withLock { session = nil } }
    func saveAnonymousBackup(_ session: Session) throws { lock.withLock { anonymousBackup = session } }
    func loadAnonymousBackup() -> Session? { lock.withLock { anonymousBackup } }
    func clearAnonymousBackup() throws { lock.withLock { anonymousBackup = nil } }
}
