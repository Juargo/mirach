import Foundation

/// The words and figures of each card of "Perfil de porcentajes". Static copy tied to the
/// profile id: the app calculates nothing, the API owns the targets.
extension PerfilPredefinido {
    var title: String {
        switch self {
        case .p50_30_20: "50 / 30 / 20"
        case .p60_20_20: "60 / 20 / 20"
        case .p70_15_15: "70 / 15 / 15"
        case .p80_10_10: "80 / 10 / 10"
        }
    }

    var caption: String {
        switch self {
        case .p50_30_20: "Equilibrado · Necesidades 50% · Gustos 30% · Ahorro 20%"
        case .p60_20_20: "Si tus gastos fijos son altos · Necesidades 60% · Gustos 20% · Ahorro 20%"
        case .p70_15_15: "Para un mes ajustado · Necesidades 70% · Gustos 15% · Ahorro 15%"
        case .p80_10_10: "Salir de deudas. Tus cuotas cuentan como necesidad · Necesidades 80% · Gustos 10% · Ahorro 10%"
        }
    }

    /// Necesidades, Gustos and Ahorro, in that order; they add up to 100.
    var shares: [Int] {
        switch self {
        case .p50_30_20: [50, 30, 20]
        case .p60_20_20: [60, 20, 20]
        case .p70_15_15: [70, 15, 15]
        case .p80_10_10: [80, 10, 10]
        }
    }

    /// The tag `Recomendado` is always shown on this card, selected or not.
    var isRecommended: Bool { self == .p50_30_20 }

    static let recommendedTag = "Recomendado"

    /// One element for VoiceOver: title, tag and caption. The selected state is a trait.
    var accessibilityLabel: String {
        isRecommended ? "\(title). \(Self.recommendedTag). \(caption)" : "\(title). \(caption)"
    }
}

enum PerfilPresupuestoCopy {
    static let note = "Al cambiarlo, recalculamos todos tus meses con el perfil nuevo."
    static let rowTitle = "Perfil de porcentajes"
    static let loading = "Cargando tu perfil de porcentajes…"
    static let loadConnection = "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
    static let loadServer = "No pudimos cargar tu perfil de porcentajes. Inténtalo de nuevo en unos segundos."
}
