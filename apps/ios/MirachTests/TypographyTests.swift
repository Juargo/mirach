import SwiftUI
import Testing
import UIKit
@testable import Mirach

/// Inter is the only family (decision D2). These pin that it ships with the app and that
/// every system text style maps to an Inter face at the system's default size.
struct TypographyTests {
    @Test(arguments: ["Inter-Regular", "Inter-Medium", "Inter-SemiBold", "Inter-Bold"])
    func everyInterFaceIsBundled(postScriptName: String) {
        #expect(UIFont(name: postScriptName, size: 17) != nil, "\(postScriptName) is not registered")
    }

    @Test func theFontFilesAreDeclaredInInfoPlist() {
        let fonts = Bundle.main.object(forInfoDictionaryKey: "UIAppFonts") as? [String] ?? []
        #expect(Set(fonts) == ["Inter-Regular.ttf", "Inter-Medium.ttf", "Inter-SemiBold.ttf", "Inter-Bold.ttf"])
    }

    @Test func headlineIsSemiBoldAndTheRestRegular() {
        #expect(MirachTypography.face(for: .headline) == "Inter-SemiBold")
        #expect(MirachTypography.face(for: .body) == "Inter-Regular")
        #expect(MirachTypography.face(for: .footnote) == "Inter-Regular")
    }

    @Test func sizesMatchTheSystemDefaultsSoDynamicTypeScalesFromThem() {
        #expect(MirachTypography.size(for: .largeTitle) == 34)
        #expect(MirachTypography.size(for: .title) == 28)
        #expect(MirachTypography.size(for: .headline) == 17)
        #expect(MirachTypography.size(for: .body) == 17)
        #expect(MirachTypography.size(for: .subheadline) == 15)
        #expect(MirachTypography.size(for: .footnote) == 13)
        #expect(MirachTypography.size(for: .caption) == 12)
    }
}
