import SwiftUI

/// How the buckets look: labels from the design tokens (never hand-typed, so the
/// 30% bucket cannot drift from the official name) and token colors.
extension Bucket {
    var label: String {
        switch self {
        case .necesidades: MirachCopy.Bucket.necesidades
        case .deseos: MirachCopy.Bucket.gustos
        case .ahorro: MirachCopy.Bucket.ahorro
        }
    }

    /// A fill (the swatch and the chart slice), never a text color.
    var fill: Color {
        switch self {
        case .necesidades: Color.Mirach.Bucket.necesidades
        case .deseos: Color.Mirach.Bucket.gustos
        case .ahorro: Color.Mirach.Bucket.ahorro
        }
    }
}

/// Copy of the Inicio that is built from the month the API sent.
enum ResumenPresentation {
    /// The month's verdict, the headline of the screen; `nil` (no headline) when the month has no state.
    static func verdict(for estado: EstadoSemaforo?) -> String? {
        switch estado {
        case .verde: "Dentro de la meta"
        case .amarillo: "Cerca de la meta"
        case .rojo: "Sobre la meta"
        case nil: nil
        }
    }

    /// `$1.250.000 · declarado`: the income and where the percentage base comes from.
    static func incomeValue(_ amount: Int, fuente: FuenteIngreso) -> String {
        "\(Format.money(amount)) · \(fuente.word)"
    }

    /// What VoiceOver reads for the income row, with the sign logic of `Format.spokenIncome`.
    static func incomeSpoken(_ amount: Int, fuente: FuenteIngreso) -> String {
        "\(incomeLabel). \(Format.spokenIncome(amount)), \(fuente.word)"
    }

    static let incomeLabel = "Ingresos del mes"
}

private extension FuenteIngreso {
    var word: String {
        switch self {
        case .declarado: "declarado"
        case .detectado: "detectado"
        }
    }
}
