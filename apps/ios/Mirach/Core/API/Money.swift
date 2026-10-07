import Foundation

/// Money on the wire: a decimal string (BigInt-safe, never a JSON number). The app keeps whole
/// pesos as `Int`. The API emits integers (a BigInt serialized as text); a fraction made only of
/// zeros ("12.00") is tolerated, but any other fraction is refused: money is never rounded or
/// truncated, a wrong figure is worse than an error.
enum Money {
    /// `^-?[0-9]+(\.0+)?$`, checked character by character (ASCII digits only), then converted
    /// exactly; a value that does not fit in `Int` is refused too.
    static func pesos(_ text: String) throws -> Int {
        var digits = Substring(text)
        var negative = false
        if digits.first == "-" {
            negative = true
            digits = digits.dropFirst()
        }
        let parts = digits.split(separator: ".", maxSplits: 1, omittingEmptySubsequences: false)
        let whole = parts[0]
        let fractionIsZeros = parts.count == 1 || (!parts[1].isEmpty && parts[1].allSatisfy { $0 == "0" })
        guard !whole.isEmpty, whole.allSatisfy({ $0 >= "0" && $0 <= "9" }), fractionIsZeros,
              let magnitude = Int(negative ? "-" + whole : String(whole))
        else {
            throw DecodingError.dataCorrupted(.init(codingPath: [], debugDescription: "malformed amount"))
        }
        return magnitude
    }
}
