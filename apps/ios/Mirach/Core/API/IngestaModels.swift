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
    /// Every row of the statement, in file order (`rowIndex` ascending).
    let filas: [CartolaRow]
}

/// One row of the preview. Money is whole pesos: `cargo` is an expense, `abono` an income.
struct CartolaRow: Equatable, Sendable, Identifiable {
    /// What the server would classify the row as, before any manual edit.
    struct Suggestion: Equatable, Sendable {
        let bucket: Bucket
        /// `nil` when the server gave a bucket but no category.
        let categoriaId: String?
    }

    let rowIndex: Int
    let fecha: Date
    let descripcion: String
    let cargo: Int
    let abono: Int
    /// Already imported: shown marked, not editable, and skipped by the server on commit.
    let esDuplicado: Bool
    /// `nil`: no pattern matched; the row lands in «Deseos · Desconocido».
    let sugerido: Suggestion?

    var id: Int { rowIndex }
}

/// A category of the user's catalog (`GET /api/categorias`), reduced to what the review needs.
struct CategoriaCatalogo: Equatable, Sendable, Identifiable {
    let id: String
    let nombre: String
    let bucket: Bucket
}

/// The catalog as the API sends it (already ordered by name).
struct CatalogoCategorias: Equatable, Sendable {
    let categorias: [CategoriaCatalogo]

    func categoria(id: String) -> CategoriaCatalogo? { categorias.first { $0.id == id } }

    /// The three buckets, always all of them and in the catalog's order, each with its categories.
    var groups: [(bucket: Bucket, categorias: [CategoriaCatalogo])] {
        Bucket.allCases.map { bucket in (bucket, categorias.filter { $0.bucket == bucket }) }
    }
}

/// One manual reclassification (`{rowIndex, categoriaId}`). Only rows the person touched are
/// sent, and always with a real category: the app never sends `categoriaId: null`.
struct CartolaEdit: Equatable, Sendable {
    let rowIndex: Int
    let categoriaId: String

    /// The server rejects an `edits` text over 256 KB.
    static let maxJSONBytes = 256 * 1024

    /// The `edits` form field: `[{"rowIndex":3,"categoriaId":"..."}]`. Built by hand so the key
    /// order is stable; the id goes through `JSONEncoder` so it is escaped properly.
    static func json(_ edits: [CartolaEdit]) -> String {
        let items = edits.map { edit -> String in
            let id = (try? JSONEncoder().encode(edit.categoriaId)).map { String(decoding: $0, as: UTF8.self) } ?? "\"\""
            return #"{"rowIndex":\#(edit.rowIndex),"categoriaId":\#(id)}"#
        }
        return "[" + items.joined(separator: ",") + "]"
    }
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
    /// The staged copy cannot be read any more (deleted or unreadable): trying again cannot help,
    /// the person has to choose the file again.
    case fileUnreadable
    /// 500: unexpected, nothing was saved; trying again is safe.
    case serverFailure
}
