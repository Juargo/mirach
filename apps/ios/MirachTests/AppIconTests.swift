import Foundation
import Testing

/// App Store Connect rejects an upload without an app icon. The asset catalog only writes
/// `CFBundleIcons` into the built Info.plist when the AppIcon set has an image, so its
/// presence proves the icon made it into the bundle.
struct AppIconTests {
    @Test
    func theBuiltAppDeclaresItsPrimaryIcon() throws {
        let icons = try #require(
            Bundle.main.object(forInfoDictionaryKey: "CFBundleIcons") as? [String: Any],
            "CFBundleIcons is missing: the AppIcon set has no image"
        )
        let primary = try #require(icons["CFBundlePrimaryIcon"] as? [String: Any])
        #expect(primary["CFBundleIconName"] as? String == "AppIcon")
    }
}
