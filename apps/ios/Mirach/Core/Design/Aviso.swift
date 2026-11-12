import SwiftUI

/// Aviso: an action strip. The message takes the free width and wraps; the action sits at the
/// trailing edge; the whole strip is one button. No icon, no red.
struct Aviso: View {
    let message: String
    let action: String
    /// Adds a 1pt inside border (`base.input`).
    var bordered = false
    let perform: () -> Void

    var body: some View {
        Button(action: perform) {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(message)
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .multilineTextAlignment(.leading)
                    .frame(maxWidth: .infinity, alignment: .leading)
                Text(action)
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                    .fixedSize()
            }
            .padding(.horizontal, MirachSpacing.m)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .background(Color.Mirach.Base.card, in: RoundedRectangle(cornerRadius: MirachRadius.base))
            .overlay {
                if bordered {
                    RoundedRectangle(cornerRadius: MirachRadius.base)
                        .strokeBorder(Color.Mirach.Base.input, lineWidth: 1)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(message). \(action)")
        .accessibilityAddTraits(.isButton)
    }
}
