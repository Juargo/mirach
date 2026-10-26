import SwiftUI
import UIKit

/// Inter, the only family (decision D2, `typography.font-family.sans` in design/tokens.json).
/// Static faces from Inter 4.1 (SIL OFL 1.1, `Resources/Fonts/Inter-OFL.txt`), registered
/// through `UIAppFonts`. Each system text style keeps its default size and scales with
/// Dynamic Type through `relativeTo:`, so only the family changes.
enum MirachTypography {
    /// PostScript name of the Inter face for a system text style.
    static func face(for style: Font.TextStyle) -> String {
        style == .headline ? "Inter-SemiBold" : "Inter-Regular"
    }

    /// The system's default point size for a text style (the "Large" content size).
    static func size(for style: Font.TextStyle) -> CGFloat {
        switch style {
        case .largeTitle: 34
        case .title: 28
        case .title2: 22
        case .title3: 20
        case .headline, .body: 17
        case .callout: 16
        case .subheadline: 15
        case .footnote: 13
        case .caption: 12
        case .caption2: 11
        @unknown default: 17
        }
    }

    /// Inter in the navigation and tab bars, which UIKit draws. Call once at launch.
    @MainActor static func applyToSystemBars() {
        let scaled = { (style: UIFont.TextStyle, face: String, size: CGFloat) -> UIFont in
            let base = UIFont(name: face, size: size) ?? .preferredFont(forTextStyle: style)
            return UIFontMetrics(forTextStyle: style).scaledFont(for: base)
        }
        let navigation = UINavigationBar.appearance()
        navigation.titleTextAttributes = [.font: scaled(.headline, "Inter-SemiBold", 17)]
        navigation.largeTitleTextAttributes = [.font: scaled(.largeTitle, "Inter-SemiBold", 34)]
        UITabBarItem.appearance().setTitleTextAttributes([.font: scaled(.caption2, "Inter-Medium", 10)], for: .normal)
    }
}

extension Font {
    /// Inter at the size of a system text style, scaling with Dynamic Type.
    /// Use instead of `.font(.footnote)`: `.font(.mirach(.footnote))`.
    static func mirach(_ style: Font.TextStyle) -> Font {
        .custom(MirachTypography.face(for: style), size: MirachTypography.size(for: style), relativeTo: style)
    }
}
