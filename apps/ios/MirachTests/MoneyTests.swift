import Testing
@testable import Mirach

struct MoneyTests {
    @Test(arguments: [
        ("0", 0), ("25990", 25_990), ("-5", -5), ("1200000", 1_200_000),
        ("12.00", 12), ("12.000", 12), ("-3.0", -3),
        ("9223372036854775807", Int.max), ("-9223372036854775808", Int.min),
    ])
    func wholePesosAreExact(text: String, expected: Int) throws {
        #expect(try Money.pesos(text) == expected)
    }

    @Test(arguments: [
        "12abc", "1e3", " 12", "12 ", "12.", ".5", "", "-", "+12", "12.50", "12.01", "0.5", "1,5", "12.5.1",
        "９", "١٢", "9223372036854775808", "-9223372036854775809", "99999999999999999999",
    ])
    func anythingElseIsRejectedNeverRoundedOrTruncated(text: String) {
        #expect(throws: DecodingError.self) { try Money.pesos(text) }
    }
}
