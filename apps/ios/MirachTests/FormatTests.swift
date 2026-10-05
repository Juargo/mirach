import Testing
@testable import Mirach

struct FormatTests {
    @Test func moneyUsesDotsForThousandsAndLeadingMinus() {
        #expect(Format.money(0) == "$0")
        #expect(Format.money(999) == "$999")
        // Four digits keep their separator (ICU's Spanish rules would drop it).
        #expect(Format.money(1234) == "$1.234")
        #expect(Format.money(1_234_567) == "$1.234.567")
        #expect(Format.money(-1234) == "-$1.234")
        #expect(Format.money(Int.min) == "-$9.223.372.036.854.775.808")
    }

    @Test func incomeCarriesAPlusAndExpenseAMinus() {
        #expect(Format.income(1_500_000) == "+$1.500.000")
        #expect(Format.income(0) == "$0")
        #expect(Format.expense(305_000) == "-$305.000")
        #expect(Format.expense(0) == "$0")
        #expect(Format.expense(-2000) == "+$2.000")
    }

    @Test func percentagesComeFromBasisPointsWithADecimalComma() {
        #expect(Format.percent(bp: 3050) == "30,5%")
        #expect(Format.percent(bp: 5000) == "50%")
        #expect(Format.percent(bp: 3333) == "33,33%")
        #expect(Format.percent(bp: 505) == "5,05%")
        #expect(Format.percent(bp: 0) == "0%")
        #expect(Format.percent(bp: -250) == "-2,5%")
        #expect(Format.percent(bp: 12_000) == "120%")
    }

    @Test func aMissingPercentageIsAnEmDash() {
        let none: Int? = nil
        #expect(Format.percent(bp: none) == "—")
        #expect(Format.percent(bp: Optional(3050)) == "30,5%")
    }

    @Test func monthsAreSpanishAndPeriodsRoundTrip() throws {
        #expect(Format.month(try #require(Periodo("2026-09"))) == "septiembre de 2026")
        #expect(Format.month(try #require(Periodo("2025-01"))) == "enero de 2025")
        #expect(Periodo("2026-09")?.apiValue == "2026-09")
        #expect(Periodo("2026-1") == nil)
        #expect(Periodo("2026-00") == nil)
        #expect(Periodo("hola") == nil)
    }
}
