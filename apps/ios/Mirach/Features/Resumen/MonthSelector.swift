import SwiftUI

/// Month arrows over the months that have data; shared by the Resumen and the bucket detail.
struct MonthSelector: View {
    let periodo: Periodo
    let anterior: Periodo?
    let siguiente: Periodo?
    let select: (Periodo) -> Void
    /// Prefix of the title's accessibility identifier (`<prefix>.month`).
    var idPrefix = "resumen"

    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        if typeSize.isAccessibilitySize {
            // Large text: the title gets the full width, the arrows sit under it.
            VStack(spacing: 4) {
                title
                HStack {
                    arrow("chevron.left", label: "Mes anterior", target: anterior)
                    Spacer()
                    arrow("chevron.right", label: "Mes siguiente", target: siguiente)
                }
            }
        } else {
            HStack {
                arrow("chevron.left", label: "Mes anterior", target: anterior)
                Spacer()
                title
                Spacer()
                arrow("chevron.right", label: "Mes siguiente", target: siguiente)
            }
        }
    }

    private var title: some View {
        Text(Format.monthTitle(periodo))
            .font(.title3.bold())
            .foregroundStyle(Color.Mirach.Base.foreground)
            .multilineTextAlignment(.center)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("\(idPrefix).month")
    }

    private func arrow(_ symbol: String, label: String, target: Periodo?) -> some View {
        Button {
            if let target { select(target) }
        } label: {
            Image(systemName: symbol).frame(minWidth: 44, minHeight: 44)
        }
        .disabled(target == nil)
        .accessibilityLabel(label)
        .accessibilityValue(target.map(Format.month) ?? "")
    }
}
