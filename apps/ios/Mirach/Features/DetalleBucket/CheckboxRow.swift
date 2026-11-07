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
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Image(systemName: isOn ? "checkmark.square.fill" : "square")
                    .font(.mirach(.body))
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.mirach(.body))
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    ForEach(lines, id: \.self) { line in
                        Text(line)
                            .font(.mirach(.footnote))
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
}
