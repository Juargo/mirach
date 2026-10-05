import Foundation
import Security

/// Stores the session in the Keychain, the iOS place for secrets: encrypted by the
/// system, outside the app's files, and not included in unencrypted backups.
///
/// The item is a "generic password" (`kSecClassGenericPassword`) holding the session
/// as JSON. `AfterFirstUnlockThisDeviceOnly` means it can be read once the device has
/// been unlocked after a restart, and it never leaves this device (not even in a
/// backup restored on another one).
struct KeychainSessionStore: SessionStore {
    static let defaultService = "app.mirachbudget.ios.session"
    private static let account = "session"

    struct KeychainError: Error, Equatable {
        let status: OSStatus
    }

    private let service: String

    init(service: String = KeychainSessionStore.defaultService) {
        self.service = service
    }

    func load() -> Session? {
        var query = baseQuery
        query[kSecReturnData as String] = true
        query[kSecMatchLimit as String] = kSecMatchLimitOne

        var result: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &result) == errSecSuccess,
              let data = result as? Data else {
            return nil
        }
        return try? JSONDecoder().decode(Session.self, from: data)
    }

    func save(_ session: Session) throws {
        try saveRaw(try JSONEncoder().encode(session))
    }

    /// Writes raw bytes (tests use it to plant corrupt data).
    func saveRaw(_ data: Data) throws {
        // Update if the item exists, add it otherwise.
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(baseQuery as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = baseQuery
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func clear() {
        SecItemDelete(baseQuery as CFDictionary)
    }

    private var baseQuery: [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: Self.account,
        ]
    }
}
