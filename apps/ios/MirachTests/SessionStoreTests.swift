import Foundation
import Security
import Testing
@testable import Mirach

private let sample = Session(
    token: "tok-123",
    userId: "user-1",
    expiresAt: Date(timeIntervalSince1970: 1_800_000_000)
)

/// The same behaviour must hold for the fake used by other tests and for the real Keychain.
private func exercise(_ store: any SessionStore) throws {
    #expect(store.load() == nil)

    try store.save(sample)
    #expect(store.load() == sample)

    let newer = Session(token: "tok-456", userId: "user-1", expiresAt: sample.expiresAt)
    try store.save(newer)
    #expect(store.load() == newer, "saving again replaces the previous session")

    try store.clear()
    #expect(store.load() == nil)
    try store.clear() // clearing an empty store is not an error
}

struct SessionStoreTests {
    @Test func inMemoryStoreSavesLoadsAndClears() throws {
        try exercise(InMemorySessionStore())
    }

    /// Runs against the real Keychain of the simulator, under a service name unique
    /// to this test so it never touches the app's real session.
    @Test func keychainStoreRoundTrips() throws {
        let store = KeychainSessionStore(service: "app.mirachbudget.ios.tests.\(UUID().uuidString)")
        defer { try? store.clear() }

        try exercise(store)
    }

    @Test func keychainStoreIgnoresCorruptData() throws {
        let service = "app.mirachbudget.ios.tests.\(UUID().uuidString)"
        let store = KeychainSessionStore(service: service)
        defer { try? store.clear() }

        try store.saveRaw(Data("not json".utf8))

        #expect(store.load() == nil)
    }

    @Test func deleteStatusSuccessAndNotFoundAreOkAndAnythingElseIsReported() throws {
        try KeychainSessionStore.check(deleteStatus: errSecSuccess)
        try KeychainSessionStore.check(deleteStatus: errSecItemNotFound)
        #expect(throws: KeychainSessionStore.KeychainError(status: errSecInteractionNotAllowed)) {
            try KeychainSessionStore.check(deleteStatus: errSecInteractionNotAllowed)
        }
    }

    @Test func sessionServiceNameIsTheDocumentedOne() {
        #expect(KeychainSessionStore.defaultService == "app.mirachbudget.ios.session")
    }
}
