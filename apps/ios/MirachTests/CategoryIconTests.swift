import Testing
import UIKit
@testable import Mirach

struct CategoryIconTests {
    @Test func everyAllowedValueHasItsOwnSymbolThatExistsOnThisSystem() {
        #expect(CategoryIcon.allowedValues.count == 25)
        for value in CategoryIcon.allowedValues {
            let symbol = CategoryIcon.symbol(for: value)
            #expect(symbol != CategoryIcon.generic, "\(value) fell back to the generic symbol")
            #expect(UIImage(systemName: symbol) != nil, "\(value) maps to a missing symbol \(symbol)")
        }
    }

    @Test func aNullOrUnknownIconGetsTheGenericSymbolWithoutError() {
        #expect(CategoryIcon.symbol(for: nil) == CategoryIcon.generic)
        #expect(CategoryIcon.symbol(for: "rocket") == CategoryIcon.generic)
        #expect(UIImage(systemName: CategoryIcon.generic) != nil)
    }
}
