import Foundation

/// App-owned models of the budget profile (`/api/perfil/presupuesto`). Screens use these, never
/// the generated types.

/// The profiles a person can pick. The raw value is the id the API uses.
enum PerfilPredefinido: String, CaseIterable, Sendable {
    case p50_30_20 = "50_30_20"
    case p60_20_20 = "60_20_20"
    case p70_15_15 = "70_15_15"
    case p80_10_10 = "80_10_10"
}

/// What the API has stored. `personalizado` can only be read: v1.0 does not edit it.
enum PerfilPresupuesto: Equatable, Sendable {
    case predefinido(PerfilPredefinido)
    case personalizado
}
