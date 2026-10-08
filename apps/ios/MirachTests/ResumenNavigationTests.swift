import Foundation
import Testing
@testable import Mirach

struct ResumenNavigationTests {
    @Test func theIncomeCardOpensTheIncomesOfTheMonthOnScreen() {
        for text in ["2026-09", "2026-08"] {
            let route = ResumenContent.ingresosRoute(for: SampleData.mes(text))

            #expect(route == IngresosRoute(periodo: Periodo(text)!))
        }
    }
}
