import Foundation

/// Single place for build-independent configuration. Views never hardcode URLs.
enum AppConfiguration {
    /// Production API (Render free tier: ~50 s cold start after idle).
    static let apiBaseURL = URL(string: "https://mirach-api.onrender.com")!

    /// Generous on purpose: a cold start of the free tier can take about a minute.
    static let requestTimeout: TimeInterval = 90

    /// Public client key (ADR-047), injected at build time from `MIRACH_API_KEY`
    /// (Config/Secrets.xcconfig → Info.plist). Empty when not configured.
    static var apiKey: String {
        Bundle.main.object(forInfoDictionaryKey: "MIRACH_API_KEY") as? String ?? ""
    }
}
