import SwiftUI

extension EstadoSemaforo {
    /// The state word, from the copy tokens (never color alone, VIS-02).
    var word: String {
        switch self {
        case .verde: MirachCopy.Estado.bien
        case .amarillo: MirachCopy.Estado.cerca
        case .rojo: MirachCopy.Estado.sobre
        }
    }

    /// Fill of the square mark: a graphic, not text.
    var markColor: Color {
        switch self {
        case .verde: Color.Mirach.Estado.bien
        case .amarillo: Color.Mirach.Estado.cerca
        case .rojo: Color.Mirach.Estado.sobre
        }
    }

    /// Color of the word. The design has no separate text token for "sobre".
    var textColor: Color {
        switch self {
        case .verde: Color.Mirach.Estado.bienText
        case .amarillo: Color.Mirach.Estado.cercaText
        case .rojo: Color.Mirach.Estado.sobre
        }
    }
}

/// A square mark in the state color. Decoration: the word next to it carries the meaning.
struct EstadoMark: View {
    let estado: EstadoSemaforo
    var side: CGFloat = 10

    var body: some View {
        Rectangle()
            .fill(estado.markColor)
            .frame(width: side, height: side)
            .accessibilityHidden(true)
    }
}

/// Estado: a 10pt mark and the state word in etiqueta. Screen readers get the word only.
struct EstadoLabel: View {
    let estado: EstadoSemaforo

    var body: some View {
        HStack(spacing: 6) {
            EstadoMark(estado: estado)
            Text(estado.word)
                .mirachText(.etiqueta)
                .foregroundStyle(estado.textColor)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(estado.word)
    }
}
