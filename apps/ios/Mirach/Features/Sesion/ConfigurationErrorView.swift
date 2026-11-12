import SwiftUI

/// Shown instead of the app when the build has no (or a wrong) client key. A friendly
/// stop rather than a crash or a sign-in loop; there is nothing the person can retry.
struct ConfigurationErrorView: View {
    var body: some View {
        VStack(spacing: MirachSpacing.s) {
            Image(systemName: "exclamationmark.triangle")
                .font(.mirach(.largeTitle))
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityHidden(true)
            Text("La app no está configurada correctamente")
                .mirachText(.titulo)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Base.foreground)
            Text("Falta la clave de acceso a la API. Instala una versión actualizada de Mirach o contacta a quien te la entregó.")
                .mirachText(.cuerpo)
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .padding(MirachSpacing.l)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("configuration.error")
    }
}
