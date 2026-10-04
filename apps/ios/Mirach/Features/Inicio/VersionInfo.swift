import Foundation

/// Response of the public `GET /version` endpoint. Extra fields are ignored.
struct VersionInfo: Decodable, Equatable, Sendable {
    let version: String
    let commit: String
}
