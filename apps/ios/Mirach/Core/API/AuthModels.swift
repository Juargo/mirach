import Foundation

/// Which sign-in methods the server has switched on (`GET /api/auth/capabilities`).
/// Google joins when its iOS client exists.
struct AuthCapabilities: Equatable, Sendable {
    let appleLoginEnabled: Bool
    /// The App Review email and password form (ADR-051); off for everyone else.
    let passwordLoginEnabled: Bool

    init(appleLoginEnabled: Bool, passwordLoginEnabled: Bool = false) {
        self.appleLoginEnabled = appleLoginEnabled
        self.passwordLoginEnabled = passwordLoginEnabled
    }
}

/// The signed-in person as `GET /api/auth/me` reports it.
struct CurrentUser: Equatable, Sendable {
    let userId: String
    let nombre: String
    /// Hidden in the profile when `nil`. May be Apple's private relay address.
    let email: String?

    init(userId: String, nombre: String, email: String? = nil) {
        self.userId = userId
        self.nombre = nombre
        self.email = email
    }
}

/// `PATCH /api/perfil` refused the name (`NOMBRE_INVALIDO`: not 1 to 80 characters).
enum PerfilError: Error, Equatable {
    case invalidName
}

/// `DELETE /api/cuenta` answered 400 `CONFIRMACION_INVALIDA`: nothing was deleted.
enum CuentaError: Error, Equatable {
    case confirmationRejected
}
