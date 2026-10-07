import SwiftUI

extension View {
    /// The filled button: tinted with the app's primary colour, label in the token made for text
    /// on it. The system's own white label fails contrast on the light dark-theme primary.
    func prominentButton() -> some View {
        buttonStyle(.borderedProminent).foregroundStyle(Color.Mirach.Base.primaryForeground)
    }
}

/// The quiet button: the accent surface with ink picked from the tokens. A system `.bordered`
/// button washes the tint over the page, and that wash fell under 4.5:1 for blue text in light.
struct SecondaryButtonStyle: ButtonStyle {
    let ink: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(ink)
            .padding(.vertical, 12).padding(.horizontal, 16)
            .frame(maxWidth: .infinity)
            .background(Color.Mirach.Base.accent, in: RoundedRectangle(cornerRadius: 12))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
