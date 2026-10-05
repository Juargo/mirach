import SwiftUI

/// How the catalog's concepts look: labels from the design tokens (never hand-typed, so the
/// 30% bucket cannot drift from the official name) and token colors.
extension Bucket {
    var label: String {
        switch self {
        case .necesidades: MirachCopy.Bucket.necesidades
        case .deseos: MirachCopy.Bucket.deseos
        case .ahorro: MirachCopy.Bucket.ahorro
        }
    }

    /// A fill (the swatch and the chart slice), never a text color.
    var fill: Color {
        switch self {
        case .necesidades: Color.Mirach.Bucket.necesidades
        case .deseos: Color.Mirach.Bucket.deseos
        case .ahorro: Color.Mirach.Bucket.ahorro
        }
    }
}

/// Presentation of a traffic-light state, `nil` meaning "no state".
struct EstadoStyle {
    let label: String
    /// An SF Symbol: the shape that carries the state when color cannot.
    let symbol: String
    let ink: Color
    let fill: Color?

    init(_ estado: EstadoSemaforo?) {
        switch estado {
        case .verde:
            self.init(MirachCopy.Semaforo.verde, "checkmark.circle", Color.Mirach.Semaforo.verdeInk, Color.Mirach.Semaforo.verdeFill)
        case .amarillo:
            self.init(MirachCopy.Semaforo.amarillo, "exclamationmark.triangle", Color.Mirach.Semaforo.amarilloInk, Color.Mirach.Semaforo.amarilloFill)
        case .rojo:
            self.init(MirachCopy.Semaforo.rojo, "xmark.octagon", Color.Mirach.Semaforo.rojoInk, Color.Mirach.Semaforo.rojoFill)
        case nil:
            // No state: the label alone, with no state color.
            self.init(MirachCopy.Semaforo.sinDatos, "minus.circle", Color.Mirach.Semaforo.sinDatosInk, nil)
        }
    }

    private init(_ label: String, _ symbol: String, _ ink: Color, _ fill: Color?) {
        self.label = label
        self.symbol = symbol
        self.ink = ink
        self.fill = fill
    }
}

/// Traffic-light state as symbol + text on a tinted chip.
struct EstadoBadge: View {
    let estado: EstadoSemaforo?

    var body: some View {
        let style = EstadoStyle(estado)
        Label(style.label, systemImage: style.symbol)
            .font(.footnote.weight(.semibold))
            .foregroundStyle(style.ink)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(style.fill ?? .clear)
            .overlay { if style.fill == nil { Rectangle().stroke(Color.Mirach.Base.border) } }
            .accessibilityElement(children: .combine)
    }
}
