import Foundation

/// App-owned models of "Ingresos del mes" (`GET /api/ingresos/mes`). Screens use these, never
/// the generated types.

struct IngresosMes: Equatable, Sendable {
    /// The response does not carry its month: it is the one the app asked for.
    let periodo: Periodo
    /// Sum of the incomes, whole pesos.
    let total: Int
    let conteo: Int
    /// All of the month, in the order the API sends them (oldest first); never paged.
    let transacciones: [Ingreso]
}

struct Ingreso: Equatable, Sendable, Identifiable {
    let id: String
    let fecha: Date
    let descripcion: String
    /// The bank name as the API sends it, or «Manual».
    let origen: String
    /// Whole pesos, as the API sends it.
    let monto: Int
}
