import Foundation

/// Single place for build-independent configuration. Views never hardcode URLs.
enum AppConfiguration {
    /// Production API (Render free tier: ~50 s cold start after idle).
    static let apiBaseURL = URL(string: "https://mirach-api.onrender.com")!

    /// Generous on purpose: a cold start of the free tier can take about a minute.
    static let requestTimeout: TimeInterval = 90
}
