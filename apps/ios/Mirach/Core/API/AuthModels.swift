import Foundation

/// Which sign-in methods the server has switched on (`GET /api/auth/capabilities`).
/// Google joins when its iOS client exists.
struct AuthCapabilities: Equatable, Sendable {
    let appleLoginEnabled: Bool
}

/// The signed-in person as `GET /api/auth/me` reports it.
struct CurrentUser: Equatable, Sendable {
    let userId: String
    let nombre: String
}
