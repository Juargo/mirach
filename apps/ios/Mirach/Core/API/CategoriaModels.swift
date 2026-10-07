import Foundation

/// What the form of "Crear categoría" sends (`POST /api/categorias`): at most one pattern,
/// always «contains», and an optional icon from the allowed list.
struct NuevaCategoria: Equatable, Sendable {
    let nombre: String
    let bucket: Bucket
    /// Text to look for in a movement's description; `nil` or empty means no pattern.
    let patron: String?
    /// A value of `CategoryIcon.allowedValues`; `nil` means no icon (the field is left out).
    let icono: String?

    init(nombre: String, bucket: Bucket, patron: String?, icono: String? = nil) {
        self.nombre = nombre
        self.bucket = bucket
        self.patron = patron
        self.icono = icono
    }
}

/// The fields of a category the person changed (`PATCH /api/categorias/{id}`). Only those go in
/// the body. The generated client cannot send `icono: null`, so an icon can be set or replaced
/// but not cleared (see the T10 notes).
struct CategoriaCambios: Equatable, Sendable {
    var nombre: String?
    var bucket: Bucket?
    var icono: String?

    var isEmpty: Bool { nombre == nil && bucket == nil && icono == nil }
}

/// How a pattern is compared with a movement's description (never ignoring accents).
enum MatchType: Equatable, Sendable {
    case contains, startsWith, regex
    /// A value the app does not know: shown as it came, never an error.
    case other(String)

    /// The three the person can choose, in the order the form lists them.
    static let selectable: [MatchType] = [.contains, .startsWith, .regex]

    init(apiName: String) {
        switch apiName {
        case "CONTAINS": self = .contains
        case "STARTS_WITH": self = .startsWith
        case "REGEX": self = .regex
        default: self = .other(apiName)
        }
    }

    var apiName: String {
        switch self {
        case .contains: "CONTAINS"
        case .startsWith: "STARTS_WITH"
        case .regex: "REGEX"
        case .other(let value): value
        }
    }

    var label: String {
        switch self {
        case .contains: "Contiene"
        case .startsWith: "Empieza con"
        case .regex: "Expresión regular"
        case .other(let value): value
        }
    }
}

/// A classification pattern of a category. The app never sends a priority (the API keeps its own).
struct PatronCategoria: Equatable, Sendable, Identifiable {
    let id: String
    let patron: String
    let matchType: MatchType
}

/// The fields of a pattern the person changed (`PATCH /api/patrones/{id}`).
struct PatronCambios: Equatable, Sendable {
    var patron: String?
    var matchType: MatchType?

    var isEmpty: Bool { patron == nil && matchType == nil }
}

/// What the pattern endpoints can answer besides success. 401 goes through the session relay.
enum PatronError: Error, Equatable {
    case invalidPattern
    case invalidMatchType
    case invalidRegex
    case invalidPriority
    case duplicate
    case categoryNotFound
    case patternNotFound
    /// A 400 or 409 whose `code` the app does not know: the server's own message.
    case rejected(message: String)
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
    /// 404 `CATEGORIA_NO_ENCONTRADA` on a change or deletion: it is gone already.
    case notFound
    /// 403 `CATEGORIA_INTERNA`: a system category («Desconocido») cannot be edited or deleted.
    case isInternal
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
