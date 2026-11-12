import SwiftUI

extension View {
    /// Figma «Campo»: the box of a text field, square, in the Cuerpo style. The border is the
    /// strong one (3:1 against the page, WCAG 1.4.11) and turns to the error colour on `isError`.
    func mirachField(isError: Bool = false) -> some View {
        mirachText(.cuerpo)
            .foregroundStyle(Color.Mirach.Base.foreground)
            .padding(.horizontal, MirachSpacing.m)
            .padding(.vertical, 12)
            .frame(minHeight: 44)
            .background(Color.Mirach.Base.background)
            .overlay(
                Rectangle().strokeBorder(isError ? Color.Mirach.Feedback.errorText : Color.Mirach.Base.input, lineWidth: 1)
            )
    }
}
