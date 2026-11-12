import SwiftUI

/// Figma «Botón»: full width, square, 52pt high, label in the Botón text style. The height is a
/// minimum, so a label that wraps at a large Dynamic Type size grows the button.
enum MirachButtonMetrics {
    static let minHeight: CGFloat = 52
}

/// The filled button: the app's primary colour, label in the token made for text on it. A destructive
/// role (`Button(role: .destructive)`) is filled with the destructive colour instead.
struct PrimaryButtonStyle: ButtonStyle {
    static func fill(destructive: Bool) -> Color {
        destructive ? Color.Mirach.Base.destructive : Color.Mirach.Base.primary
    }

    func makeBody(configuration: Configuration) -> some View {
        Styled(configuration: configuration)
    }

    private struct Styled: View {
        let configuration: ButtonStyleConfiguration
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .mirachText(.boton)
                .foregroundStyle(Color.Mirach.Base.primaryForeground)
                .multilineTextAlignment(.center)
                .padding(MirachSpacing.m)
                .frame(maxWidth: .infinity, minHeight: MirachButtonMetrics.minHeight)
                .background(
                    PrimaryButtonStyle.fill(destructive: configuration.role == .destructive),
                    in: RoundedRectangle(cornerRadius: MirachRadius.base)
                )
                .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
                .contentShape(Rectangle())
        }
    }
}

/// The alternative button: same box with the strong border and no fill. A destructive role
/// (`Button(role: .destructive)`) takes the error text colour instead of `ink`.
struct SecondaryButtonStyle: ButtonStyle {
    var ink: Color = Color.Mirach.Base.foreground

    func makeBody(configuration: Configuration) -> some View {
        Styled(configuration: configuration, ink: ink)
    }

    private struct Styled: View {
        let configuration: ButtonStyleConfiguration
        let ink: Color
        @Environment(\.isEnabled) private var isEnabled

        var body: some View {
            configuration.label
                .mirachText(.boton)
                .foregroundStyle(configuration.role == .destructive ? Color.Mirach.Feedback.errorText : ink)
                .multilineTextAlignment(.center)
                .padding(MirachSpacing.m)
                .frame(maxWidth: .infinity, minHeight: MirachButtonMetrics.minHeight)
                .overlay(Rectangle().strokeBorder(Color.Mirach.Base.input, lineWidth: 1))
                .opacity(isEnabled ? (configuration.isPressed ? 0.7 : 1) : 0.4)
                .contentShape(Rectangle())
        }
    }
}

extension View {
    /// The filled button for the screen's main action.
    func prominentButton() -> some View { buttonStyle(PrimaryButtonStyle()) }

    /// The outlined button for the alternative action.
    func secondaryButton() -> some View { buttonStyle(SecondaryButtonStyle()) }
}
