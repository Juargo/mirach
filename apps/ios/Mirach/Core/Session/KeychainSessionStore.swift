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
    /// A second item of the same service: `clear()` deletes only `account`, never this one.
    private static let anonymousBackupAccount = "anonymous-backup"

    struct KeychainError: Error, Equatable {
        let status: OSStatus
    }

    private let service: String

    init(service: String = KeychainSessionStore.defaultService) {
        self.service = service
    }

    func load() -> Session? {
        load(account: Self.account)
    }

    func loadAnonymousBackup() -> Session? {
        load(account: Self.anonymousBackupAccount)
    }

    func saveAnonymousBackup(_ session: Session) throws {
        try write(try JSONEncoder().encode(session), account: Self.anonymousBackupAccount)
    }

    /// Only for recovery code (delivery 2) and tests: nothing in the app deletes the backup yet.
    func clearAnonymousBackup() throws {
        try Self.check(deleteStatus: SecItemDelete(query(account: Self.anonymousBackupAccount) as CFDictionary))
    }

    private func load(account: String) -> Session? {
        var query = query(account: account)
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
        try write(data, account: Self.account)
    }

    private func write(_ data: Data, account: String) throws {
        // Update if the item exists, add it otherwise.
        let update = [kSecValueData as String: data]
        var status = SecItemUpdate(query(account: account) as CFDictionary, update as CFDictionary)
        if status == errSecItemNotFound {
            var add = query(account: account)
            add[kSecValueData as String] = data
            add[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
            status = SecItemAdd(add as CFDictionary, nil)
        }
        guard status == errSecSuccess else { throw KeychainError(status: status) }
    }

    func clear() throws {
        try Self.check(deleteStatus: SecItemDelete(query(account: Self.account) as CFDictionary))
    }

    /// Nothing to delete is fine; any other failure means the token is still stored.
    static func check(deleteStatus status: OSStatus) throws {
        guard status == errSecSuccess || status == errSecItemNotFound else {
            throw KeychainError(status: status)
        }
    }

    private func query(account: String) -> [String: Any] {
        [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
        ]
    }
}
