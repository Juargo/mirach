import Foundation
import GoogleSignIn
import os
import UIKit

/// `GoogleSignInLauncher` backed by Google Sign-In. The SDK reads the iOS client ID from
/// `GIDClientID` in Info.plist; the return URL scheme is its reversed form (project.yml).
@MainActor
final class GoogleSDKSignIn: GoogleSignInLauncher {
    private static let logger = Logger(subsystem: "app.mirachbudget.ios", category: "google-sign-in")

    /// `nil` when this build has no client ID: the app then hides "Continuar con Google".
    static func fromBundle(_ bundle: Bundle = .main) -> GoogleSDKSignIn? {
        guard let clientID = bundle.object(forInfoDictionaryKey: "GIDClientID") as? String,
              !clientID.isEmpty else { return nil }
        return GoogleSDKSignIn()
    }

    func requestIdToken() async -> GoogleSignInResult {
        guard let presenter = Self.topViewController() else {
            // Not a Google failure: the app had no visible screen to present the sheet over.
            Self.logger.error("No view controller to present Google Sign-In from")
            return .failed
        }
        do {
            let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenter)
            // Mirach keeps its own session; Google's tokens are not needed after this.
            defer { GIDSignIn.sharedInstance.signOut() }
            guard let idToken = result.user.idToken?.tokenString else {
                Self.logger.error("Google Sign-In returned no ID token")
                return .failed
            }
            return .success(idToken: idToken)
        } catch let error as GIDSignInError where error.code == .canceled {
            return .cancelled
        } catch {
            // Domain and code only: the description can carry account details.
            let nsError = error as NSError
            Self.logger.error(
                "Google Sign-In failed: \(nsError.domain, privacy: .public) \(nsError.code, privacy: .public)"
            )
            return .failed
        }
    }

    /// Google presents its sheet over a view controller; SwiftUI has none to hand over.
    private static func topViewController() -> UIViewController? {
        let window = UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)
        var top = window?.rootViewController
        while let presented = top?.presentedViewController { top = presented }
        return top
    }
}
