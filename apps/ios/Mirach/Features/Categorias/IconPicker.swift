import SwiftUI

/// The allowed icons as a grid of symbols. The chosen one carries a check and a border, so it
/// never rests on color alone, and every cell has its own spoken name.
struct IconPicker: View {
    let selection: String?
    /// «Sin ícono» is offered while the category has none: the API cannot clear an icon through
    /// the generated client, so replacing is possible and removing is not.
    let allowsNone: Bool
    let idPrefix: String
    let onSelect: (String?) -> Void

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 56), spacing: MirachSpacing.s)], spacing: MirachSpacing.s) {
            if allowsNone { cell(value: nil, symbol: CategoryIcon.generic, label: "Sin ícono") }
            ForEach(CategoryIcon.options) { option in
                cell(value: option.value, symbol: option.symbol, label: option.label)
            }
        }
        .padding(.vertical, 4)
    }

    /// Figma «Celda de categoría»: square, 1pt border; the chosen one gets a 2pt primary border and
    /// a check, so it never rests on color alone.
    private func cell(value: String?, symbol: String, label: String) -> some View {
        let isSelected = selection == value
        return Button { onSelect(value) } label: {
            Image(systemName: symbol)
                .font(.mirach(.title3))
                .frame(maxWidth: .infinity, minHeight: 48)
                .foregroundStyle(Color.Mirach.Base.foreground)
                .background(Color.Mirach.Base.background)
                .overlay(
                    Rectangle().strokeBorder(
                        isSelected ? Color.Mirach.Base.primary : Color.Mirach.Base.border, lineWidth: isSelected ? 2 : 1
                    )
                )
                .overlay(alignment: .topTrailing) {
                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.mirach(.caption))
                            .foregroundStyle(Color.Mirach.Base.primary)
                            .padding(MirachSpacing.xs)
                    }
                }
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityIdentifier("\(idPrefix).icon.\(value ?? "none")")
    }
}
