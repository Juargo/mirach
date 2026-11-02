import Testing
import UIKit
@testable import Mirach

/// The Google button must carry Google's "G" (branding guidelines); a missing asset would
/// silently render the button without it.
struct GoogleLogoTests {
    @Test func theGoogleMarkShipsInTheAppBundle() throws {
        let image = try #require(UIImage(named: GoogleLogo.assetName, in: .main, compatibleWith: nil))
        #expect(image.size == CGSize(width: 18, height: 18))
    }
}
