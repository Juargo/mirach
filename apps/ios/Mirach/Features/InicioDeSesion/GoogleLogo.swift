import SwiftUI

/// Google's "G", drawn at its own colors and the 18 pt size the branding guidelines ask for.
/// The asset is the mark GoogleSignIn-iOS 10.1.0 ships for its own button
/// (`GoogleSignIn/Sources/Resources/google*.png`, Apache 2.0).
struct GoogleLogo: View {
    static let assetName = "GoogleLogo"

    var body: some View {
        Image(Self.assetName)
            .resizable()
            .frame(width: 18, height: 18)
            // The button's text names the provider; the mark adds nothing for VoiceOver.
            .accessibilityHidden(true)
    }
}
