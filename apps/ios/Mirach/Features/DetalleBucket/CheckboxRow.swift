import SwiftUI

/// A checkbox with a title and the lines that explain it (Figma 09 and 28). VoiceOver reads it as
/// one element with `spokenLabel`, says whether it is marked, and a double tap toggles it.
struct CheckboxRow: View {
    let title: String
    let lines: [String]
    let spokenLabel: String
    let identifier: String
    @Binding var isOn: Bool

    var body: some View {
        Button { isOn.toggle() } label: {
            HStack(alignment: .top, spacing: 10) {
                box
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .mirachText(.cuerpo)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    ForEach(lines, id: \.self) { line in
                        Text(line)
                            .mirachText(.etiqueta)
                            .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    }
                }
                // Wrap at word boundaries instead of truncating.
                .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(spokenLabel)
        .accessibilityValue(isOn ? "Marcado" : "Sin marcar")
        .accessibilityAddTraits(isOn ? .isSelected : [])
        .accessibilityHint(isOn ? "Toca dos veces para desmarcar" : "Toca dos veces para marcar")
        .accessibilityIdentifier(identifier)
    }

    /// Figma «Casilla»: a 22pt square, filled with the primary colour and a check when marked (the
    /// state is also said by VoiceOver and by the check, never by colour alone).
    private var box: some View {
        ZStack {
            Rectangle().fill(isOn ? Color.Mirach.Base.primary : Color.clear)
            Rectangle().strokeBorder(isOn ? Color.Mirach.Base.primary : Color.Mirach.Base.input, lineWidth: 1)
            if isOn {
                Image(systemName: "checkmark")
                    .font(.system(size: 13, weight: .bold))
                    .foregroundStyle(Color.Mirach.Base.primaryForeground)
            }
        }
        .frame(width: 22, height: 22)
        .padding(.top, 1)
        .accessibilityHidden(true)
    }
}
