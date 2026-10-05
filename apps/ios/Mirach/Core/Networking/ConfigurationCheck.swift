import Foundation

/// Detects a build that cannot work, so it fails loudly instead of showing a login
/// loop (a missing key makes every `/api` call answer 401 `API_KEY_INVALIDA`).
enum ConfigurationCheck {
    enum Problem: Equatable {
        /// `MIRACH_API_KEY` is empty: `Config/Secrets.xcconfig` is missing or has no value.
        case missingAPIKey
    }

    static func problem(apiKey: String) -> Problem? {
        apiKey.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .missingAPIKey : nil
    }
}
