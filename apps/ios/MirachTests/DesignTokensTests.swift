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
        #expect(MirachTokenCatalog.colorAssetNames.count == 49)
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

    @Test func deseosBucketMatchesTokensJson() throws {
        // light #782c5c, dark #bb6c90 (design/tokens.json, color.*.bucket.deseos)
        let light = try #require(resolve("Bucket/deseos", .light))
        let dark = try #require(resolve("Bucket/deseos", .dark))
        #expect(isClose(components(light), [0x78 / 255.0, 0x2c / 255.0, 0x5c / 255.0, 1]))
        #expect(isClose(components(dark), [0xbb / 255.0, 0x6c / 255.0, 0x90 / 255.0, 1]))
    }

    @Test func bucketLabelsSayDeseos() {
        #expect(MirachCopy.Bucket.necesidades == "Necesidades")
        #expect(MirachCopy.Bucket.deseos == "Deseos")
        #expect(MirachCopy.Bucket.ahorro == "Ahorro")
        #expect(MirachCopy.Bucket.ingreso == "Ingreso")
        #expect(MirachCopy.Semaforo.sinDatos == "Sin datos")
    }

    @Test func radiusIsSquare() {
        #expect(MirachRadius.base == 0)
        #expect(MirachRadius.maxAllowed == 2)
    }
}
