import SwiftUI

/// One legend row: swatch, name, target, spend and share of the income. Always shown,
/// so the chart is never the only way to reach a bucket.
struct BucketRow: View {
    let item: BucketResumen
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        Group {
            if typeSize.isAccessibilitySize {
                // Large text: one column, so no figure is squeezed or truncated.
                VStack(alignment: .leading, spacing: 8) {
                    name
                    figures(alignment: .leading)
                }
            } else {
                HStack(alignment: .center, spacing: 12) {
                    name
                    Spacer(minLength: 8)
                    figures(alignment: .trailing)
                }
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Mirach.Base.card)
        .overlay(Rectangle().stroke(Color.Mirach.Base.border))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
        .accessibilityIdentifier("resumen.bucket.\(item.bucket.label)")
    }

    private var name: some View {
        HStack(spacing: 8) {
            // The bucket color is a fill, the name next to it is the real label.
            Rectangle().fill(item.bucket.fill).frame(width: 14, height: 14).accessibilityHidden(true)
            Text(item.bucket.label)
                .font(.headline)
                .foregroundStyle(Color.Mirach.Base.cardForeground)
        }
    }

    private func figures(alignment: HorizontalAlignment) -> some View {
        VStack(alignment: alignment, spacing: 4) {
            Text(Format.expense(item.total))
                .font(.headline)
                .mirachFigures()
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(Color.Mirach.Feedback.expenseText)
            Text("\(Format.percent(bp: item.porcentajeBp)) del ingreso")
                .font(.footnote)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            Text("Meta: \(Format.percent(bp: item.metaBp))")
                .font(.footnote)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
    }

    private var accessibilityText: String {
        let share = item.porcentajeBp.map { "\(Format.percent(bp: $0)) del ingreso" } ?? "sin porcentaje del ingreso"
        return "\(item.bucket.label). Gasto \(Format.money(abs(item.total))), \(share). "
            + "Meta \(Format.percent(bp: item.metaBp))"
    }
}
