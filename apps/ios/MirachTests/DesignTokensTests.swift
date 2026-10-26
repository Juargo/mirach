import SwiftUI
import Testing
import UIKit
@testable import Mirach

/// Checks the generated design tokens against the real asset catalog at runtime.
struct DesignTokensTests {
    private func resolve(_ name: String, _ style: UIUserInterfaceStyle) -> UIColor? {
        let traits = UITraitCollection(userInterfaceStyle: style)
        return UIColor(named: name, in: .main, compatibleWith: traits)?.resolvedColor(with: traits)
    }

    private func components(_ color: UIColor) -> [CGFloat] {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        color.getRed(&r, green: &g, blue: &b, alpha: &a)
        return [r, g, b, a]
    }

    private func isClose(_ lhs: [CGFloat], _ rhs: [CGFloat]) -> Bool {
        zip(lhs, rhs).allSatisfy { abs($0 - $1) < 1.0 / 255.0 }
    }

    @Test func everyColorTokenResolvesInLightAndDark() {
        #expect(MirachTokenCatalog.colorAssetNames.count == 25)
        for name in MirachTokenCatalog.colorAssetNames {
            #expect(resolve(name, .light) != nil, "\(name) missing in light")
            #expect(resolve(name, .dark) != nil, "\(name) missing in dark")
        }
    }

    @Test func lightAndDarkDifferExceptWhereTokensAreIdentical() throws {
        for name in MirachTokenCatalog.colorAssetNames {
            let light = try #require(resolve(name, .light))
            let dark = try #require(resolve(name, .dark))
            let same = isClose(components(light), components(dark))
            #expect(same == MirachTokenCatalog.identicalInBothThemes.contains(name), "\(name)")
        }
    }

    @Test func gustosBucketMatchesTokensJson() throws {
        // light #7b61a8, dark #a891d6 (design/tokens.json, color.*.bucket.gustos, from Figma)
        let light = try #require(resolve("Bucket/gustos", .light))
        let dark = try #require(resolve("Bucket/gustos", .dark))
        #expect(isClose(components(light), [0x7b / 255.0, 0x61 / 255.0, 0xa8 / 255.0, 1]))
        #expect(isClose(components(dark), [0xa8 / 255.0, 0x91 / 255.0, 0xd6 / 255.0, 1]))
    }

    @Test func bucketLabelsSayGustos() {
        #expect(MirachCopy.Bucket.necesidades == "Necesidades")
        #expect(MirachCopy.Bucket.gustos == "Gustos")
        #expect(MirachCopy.Bucket.ahorro == "Ahorro")
        #expect(MirachCopy.Bucket.ingreso == "Ingreso")
        #expect(MirachCopy.Estado.sinDatos == "Sin datos")
    }

    @Test func radiusIsSquareAndSpacingFollowsFigma() {
        #expect(MirachRadius.base == 0)
        #expect(MirachSpacing.m == 16)
    }
}
