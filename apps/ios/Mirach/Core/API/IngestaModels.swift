import Foundation

/// App-owned models of "Subir cartola". Screens use these, never the generated types.

/// A statement staged in the app's own temporary folder (see `CartolaStaging`).
struct CartolaFile: Equatable, Sendable {
    /// Where the private copy lives; the picked file itself is never read again.
    let url: URL
    /// The original name: the API decides how to read the file from its extension.
    let filename: String
    /// Size of the copy in bytes, for display.
    let byteCount: Int
}

/// Result of `POST /api/ingestas/preview`: what the file contains, nothing saved yet.
struct CartolaPreview: Equatable, Sendable {
    let banco: String
    let tipoCuenta: String
    /// As it arrives (the catalog says not to reformat it).
    let numeroCuenta: String
    let totalFilas: Int
    let duplicados: Int
    let nuevas: Int
}

/// One manual reclassification (`{rowIndex, categoriaId}`). T5a always sends none; the type
/// exists so the contract of `commitIngesta` already has the shape T5b will need.
struct CartolaEdit: Equatable, Sendable {
    let rowIndex: Int
    let categoriaId: String
}

/// Result of `POST /api/ingestas/commit`.
struct CartolaCommitResult: Equatable, Sendable {
    let totalTransacciones: Int
    let duplicadosOmitidos: Int
}

/// What the upload endpoints can answer besides success. 401 is not here: it goes through
/// the single session-expiry relay (`APIError.sessionExpired`).
enum IngestaError: Error, Equatable {
    /// 400 `PDF_PROTEGIDO`: the PDF is encrypted and no password was sent.
    case passwordRequired
    /// 400 `PDF_PASSWORD_INCORRECTA`.
    case passwordIncorrect
    /// 400 `SIN_MOVIMIENTOS`: a valid file with zero movements.
    case noMovements
    /// Any other 400 (file, unknown bank, structure...): the server's own `message`.
    case rejected(message: String)
    /// 409 `CATALOGO_INCOMPLETO`: permanent, a problem of the account.
    case catalogIncomplete
    /// 503 `CATALOGO_NO_DISPONIBLE`: transient, nothing was saved.
    case catalogUnavailable
    /// 500: unexpected, nothing was saved; trying again is safe.
    case serverFailure
}
