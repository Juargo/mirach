import SwiftUI
import Testing
import UIKit
@testable import Mirach

/// The generated text styles (S2): Inter at the token size, scaling with Dynamic Type.
struct TextStyleTests {
    @Test func everyStyleCarriesTheTokenSizeAndLineHeight() {
        let expected: [(MirachTextStyle, CGFloat, CGFloat)] = [
            (.titulo, 28, 34), (.numeroGrande, 40, 44), (.cuerpo, 16, 24), (.cuerpoDestacado, 16, 24),
            (.boton, 16, 20), (.etiqueta, 13, 16), (.mini, 11, 14),
        ]
        #expect(MirachTextStyle.allCases.count == expected.count)
        for (style, size, lineHeight) in expected {
            #expect(style.size == size)
            #expect(style.lineHeight == lineHeight)
        }
    }

    @Test func weightsMapToTheBundledInterFaces() {
        #expect(MirachTextStyle.cuerpo.face == "Inter-Regular")
        #expect(MirachTextStyle.etiqueta.face == "Inter-Medium")
        #expect(MirachTextStyle.titulo.face == "Inter-SemiBold")
        #expect(MirachTextStyle.cuerpoDestacado.face == "Inter-SemiBold")
    }

    @Test func everyFaceIsRegisteredAndScalesRelativeToASystemStyle() {
        for style in MirachTextStyle.allCases {
            #expect(UIFont(name: style.face, size: style.size) != nil, "\(style.face) is not registered")
        }
        #expect(MirachTextStyle.titulo.relativeTo == .title)
        #expect(MirachTextStyle.etiqueta.relativeTo == .footnote)
        #expect(MirachTextStyle.mini.relativeTo == .caption2)
    }

    @Test func theLineSpacingBringsInterUpToTheTokenLineHeight() throws {
        for style in MirachTextStyle.allCases {
            let natural = try #require(UIFont(name: style.face, size: style.size)).lineHeight
            // Inter's natural height plus the spacing lands on the token line height.
            #expect(abs(natural + style.baseLineSpacing - style.lineHeight) < 1, "\(style)")
        }
        #expect(MirachTextStyle.cuerpo.baseLineSpacing > 3)
        #expect(MirachTextStyle.numeroGrande.baseLineSpacing < 0, "40/44 is tighter than Inter's own 1.21")
    }

    @Test func theSystemStyleOverloadStillResolvesForTheOtherScreens() {
        // Existing behavior: Font.mirach(.footnote) keeps Inter at the system size (TypographyTests pins the table).
        let font: Font = .mirach(.footnote)
        #expect(font == Font.mirach(.footnote))
        #expect(MirachTypography.face(for: .footnote) == "Inter-Regular")
        #expect(MirachTypography.size(for: .footnote) == 13)
    }
}
