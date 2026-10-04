import Foundation

/// What the first screen shows from the public `GET /version` endpoint.
struct VersionInfo: Equatable, Sendable {
    let version: String
    let commit: String
}
