import AuthenticationServices
import Foundation

/// What we keep from Apple's authorization. The view model works with this plain value
/// instead of `ASAuthorization` (which tests cannot construct).
struct AppleCredential: Equatable, Sendable {
    let identityToken: String
    /// Apple gives the name only the FIRST time an Apple ID authorizes this app.
    let fullName: String?

    enum ConversionError: Error { case missingIdentityToken }

    init(identityToken: String, fullName: String?) {
        self.identityToken = identityToken
        self.fullName = fullName
    }

    init(authorization: ASAuthorization) throws {
        guard let apple = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = apple.identityToken,
              let token = String(data: tokenData, encoding: .utf8) else {
            throw ConversionError.missingIdentityToken
        }
        self.init(identityToken: token, fullName: Self.displayName(from: apple.fullName))
    }

    /// `nil` when Apple sent no name (every sign-in after the first) or it is empty.
    static func displayName(from components: PersonNameComponents?) -> String? {
        guard let components else { return nil }
        let name = components.formatted(.name(style: .long)).trimmingCharacters(in: .whitespaces)
        return name.isEmpty ? nil : name
    }
}
