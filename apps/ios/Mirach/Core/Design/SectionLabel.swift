import SwiftUI

/// The label above a group of rows or fields (Figma «Mini», uppercase, secondary text colour).
struct SectionLabel: View {
    let title: String

    init(_ title: String) { self.title = title }

    var body: some View {
        Text(title)
            .mirachText(.mini)
            .textCase(.uppercase)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
            .accessibilityAddTraits(.isHeader)
    }
}
