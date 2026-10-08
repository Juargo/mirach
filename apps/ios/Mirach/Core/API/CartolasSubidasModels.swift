import Foundation

/// App-owned models of "Cartolas subidas" (`GET /api/ingestas`). Screens use these, never the
/// generated types.

struct CartolaSubida: Equatable, Sendable, Identifiable {
    enum Estado: Equatable, Sendable { case procesada, fallida }

    let id: String
    /// `nil` when a failed import never resolved the bank.
    let banco: String?
    let nombreArchivo: String
    let estado: Estado
    /// The server's reason; only a failed import has one.
    let motivoFallo: String?
    /// The day of the import, read in UTC like every date the API sends.
    let fecha: Date
    let totalTransacciones: Int
}

/// What `DELETE /api/ingestas/{id}` answers that the screen treats differently from a failure.
enum EliminarCartolaError: Error, Equatable {
    /// 404: it does not exist or is not the user's (the API does not say which).
    case notFound
}
