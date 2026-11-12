import SwiftUI

/// Figma «Selector segmentado» for the three groups: square, one strong 1pt frame, the chosen
/// option filled with the primary colour and a distinct text colour. At the accessibility text
/// sizes the options stack, so «Necesidades» never gets squeezed. `selection` is `nil` until chosen.
struct BucketSegmentedControl: View {
    @Binding var selection: Bucket?
    let idPrefix: String
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        let layout = typeSize.isAccessibilitySize ? AnyLayout(VStackLayout(spacing: 0)) : AnyLayout(HStackLayout(spacing: 0))
        layout {
            ForEach(Bucket.allCases, id: \.self) { option in
                let isSelected = selection == option
                Button { selection = option } label: {
                    Text(option.label)
                        .mirachText(.cuerpoDestacado)
                        .foregroundStyle(isSelected ? Color.Mirach.Base.primaryForeground : Color.Mirach.Base.foreground)
                        // One line shrunk to fit: «Necesidades» must never break by syllable.
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .padding(.horizontal, MirachSpacing.xs)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .background(isSelected ? Color.Mirach.Base.primary : Color.clear)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityIdentifier("\(idPrefix).bucket.\(option.apiName)")
            }
        }
        .overlay(Rectangle().strokeBorder(Color.Mirach.Base.input, lineWidth: 1))
    }
}
