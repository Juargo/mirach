import SwiftUI
import UIKit

extension MirachTextStyle {
    /// Extra space per line that brings Inter's natural line height to the token's, at the base size
    /// (negative when the token is tighter than Inter, as in `numero-grande`).
    /// Dynamic Type scales it with the text (see `mirachText`).
    var baseLineSpacing: CGFloat {
        let natural = UIFont(name: face, size: size)?.lineHeight ?? lineHeight
        return lineHeight - natural
    }
}

private struct MirachTextStyleModifier: ViewModifier {
    let style: MirachTextStyle
    @ScaledMetric private var scale: CGFloat

    init(style: MirachTextStyle) {
        self.style = style
        _scale = ScaledMetric(wrappedValue: 1, relativeTo: style.relativeTo)
    }

    func body(content: Content) -> some View {
        content
            .font(.mirach(style))
            .lineSpacing(style.baseLineSpacing * scale)
    }
}

extension View {
    /// A token text style: its Inter face and size, plus the token line height.
    func mirachText(_ style: MirachTextStyle) -> some View {
        modifier(MirachTextStyleModifier(style: style))
    }
}
