import Foundation

/// What the form of "Crear categoría" sends (`POST /api/categorias`). The app never sends an
/// icon in this slice (deferred) and at most one pattern, always «contains».
struct NuevaCategoria: Equatable, Sendable {
    let nombre: String
    let bucket: Bucket
    /// Text to look for in a movement's description; `nil` or empty means no pattern.
    let patron: String?
}

/// What `POST /api/categorias` can answer besides success (400 and 409 with a `code`). 401 goes
/// through the single session-expiry relay. `index` is the zero-based position of the offending
/// entry of `patrones` (the server sends it for nested pattern failures only).
enum CategoriaError: Error, Equatable {
    case invalidName
    case bucketNotAssignable
    case invalidIcon
    case invalidPattern(index: Int?)
    case invalidMatchType(index: Int?)
    case invalidRegex(index: Int?)
    case duplicateName
    case duplicatePattern(index: Int?)
    /// A 400 or 409 whose `code` the app does not know: the server's own message.
    case rejected(message: String)
}

extension Bucket {
    /// The `bucket` value the API expects (inverse of `init?(apiName:)`).
    var apiName: String {
        switch self {
        case .necesidades: "Necesidades"
        case .deseos: "Deseos"
        case .ahorro: "Ahorro"
        }
    }
}
