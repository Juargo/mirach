import Foundation
@testable import Mirach

/// A store whose Keychain write fails, to prove sign-in does not pretend to succeed.
struct FailingSessionStore: SessionStore {
    func load() -> Session? { nil }
    func save(_ session: Session) throws { throw KeychainSessionStore.KeychainError(status: -25299) }
    func clear() throws {}
}

/// A store that cannot delete (Keychain delete failed) and one that counts deletes.
struct UndeletableSessionStore: SessionStore {
    let session: Session?
    func load() -> Session? { session }
    func save(_ session: Session) throws {}
    func clear() throws { throw KeychainSessionStore.KeychainError(status: -25308) }
}

final class CountingSessionStore: SessionStore, @unchecked Sendable {
    private let inner: InMemorySessionStore
    private let lock = NSLock()
    private var _clears = 0
    init(session: Session?) { inner = InMemorySessionStore(session: session) }
    var clears: Int { lock.withLock { _clears } }
    func load() -> Session? { inner.load() }
    func save(_ session: Session) throws { try inner.save(session) }
    func clear() throws {
        lock.withLock { _clears += 1 }
        inner.clear()
    }
}
