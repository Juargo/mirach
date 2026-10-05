import Foundation
@testable import Mirach

/// A store whose Keychain write fails, to prove sign-in does not pretend to succeed.
struct FailingSessionStore: SessionStore {
    func load() -> Session? { nil }
    func save(_ session: Session) throws { throw KeychainSessionStore.KeychainError(status: -25299) }
    func clear() {}
}
