import Foundation

/// App-owned models of "Detalle de bucket" (`GET /api/buckets/{bucket}/detalle`). Screens use
/// these, never the generated types.

struct BucketDetalle: Equatable, Sendable {
    let bucket: Bucket
    let periodo: Periodo
    /// Spent in the bucket, whole pesos, positive as the API sends it.
    let total: Int
    /// Share of the income in basis points; `nil` when the month has no income.
    let porcentajeBp: Int?
    /// Target in basis points; `nil` when the API has none for the bucket.
    let metaBp: Int?
    let totalTransacciones: Int
    let totalCategorias: Int
    /// In the order the API sends them (it puts "Sin categoría" last).
    let grupos: [GrupoCategoria]
}

/// One category of the month inside the bucket, with all its movements.
struct GrupoCategoria: Equatable, Sendable, Identifiable {
    /// `nil` is the synthetic «Sin categoría» group.
    let categoriaId: String?
    let nombre: String
    /// A value of the allowed list, or `nil` (shown with a generic symbol).
    let icono: String?
    let subtotal: Int
    let conteo: Int
    let transacciones: [MovimientoBucket]

    var id: String { categoriaId ?? "sin-categoria" }
}

struct MovimientoBucket: Equatable, Sendable, Identifiable {
    let id: String
    let fecha: Date
    let descripcion: String
    /// The bank name as the API sends it, or «Manual».
    let origen: String
    /// Whole pesos; negative when it is a refund inside a spend bucket.
    let monto: Int
}

/// Result of `PATCH /api/transacciones/{id}/categoria`: where the movement landed.
struct Reclasificacion: Equatable, Sendable {
    let categoriaId: String
    let categoriaNombre: String
    let bucket: Bucket
}

/// What the reclassification can answer besides success. 401 goes through the single
/// session-expiry relay.
enum ReclasificarError: Error, Equatable {
    /// 400: the category does not exist (any more) or is not the user's.
    case categoryNotFound
    /// 404: the movement does not exist (any more).
    case movementNotFound
}
