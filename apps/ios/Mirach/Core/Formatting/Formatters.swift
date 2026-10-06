import Foundation

/// Display rules of the catalog (`docs/catalogo/README.md`, "Reglas globales"). The app only
/// formats; hand-rolled on purpose so the output never depends on the device's locale
/// (ICU omits the thousands separator on four-digit numbers in Spanish).
enum Format {
    /// `$1.234.567`, `-$1.234`. Exact integer arithmetic, never floating point.
    static func money(_ amount: Int) -> String {
        (amount < 0 ? "-" : "") + "$" + grouped(amount.magnitude)
    }

    /// Income with its sign: `+$1.000`; zero carries none.
    static func income(_ amount: Int) -> String {
        signed(amount, positiveSign: "+", negativeSign: "-")
    }

    /// Income as VoiceOver should say it, with the same sign logic as `income(_:)`: a negative
    /// amount is money going out, never "income".
    static func spokenIncome(_ amount: Int) -> String {
        if amount == 0 { return "Sin ingreso" }
        let text = "$" + grouped(amount.magnitude)
        return amount > 0 ? "Ingreso de \(text)" : "Ajuste negativo de \(text)"
    }

    /// A bucket's spend with its sign: `-$1.000` (the API sends spend as a positive number);
    /// a negative total (refunds exceed spend) reads as money coming in.
    static func expense(_ amount: Int) -> String {
        signed(amount, positiveSign: "-", negativeSign: "+")
    }

    /// Spend as VoiceOver should say it, with the same sign logic as `expense(_:)`:
    /// a negative total (refunds exceed spend) is money coming in, not spend.
    static func spokenExpense(_ amount: Int) -> String {
        if amount == 0 { return "Sin gasto" }
        let text = "$" + grouped(amount.magnitude)
        return amount > 0 ? "Gasto de \(text)" : "Reembolso neto de \(text)"
    }

    /// Basis points as a percentage with a decimal comma: `3050` is `30,5%`, `5000` is `50%`.
    static func percent(bp: Int) -> String {
        let magnitude = bp.magnitude
        let whole = magnitude / 100
        let cents = magnitude % 100
        var text = (bp < 0 ? "-" : "") + String(whole)
        if cents != 0 {
            text += "," + (cents < 10 ? "0" : "") + String(cents)
            if text.hasSuffix("0") { text.removeLast() }
        }
        return text + "%"
    }

    /// A missing percentage (month without income) is an em dash.
    static func percent(bp: Int?) -> String {
        bp.map { percent(bp: $0) } ?? "—"
    }

    private static let monthNames = [
        "enero", "febrero", "marzo", "abril", "mayo", "junio",
        "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
    ]

    /// `septiembre de 2026`.
    static func month(_ periodo: Periodo) -> String {
        "\(monthNames[periodo.month - 1]) de \(periodo.year)"
    }

    /// `Septiembre de 2026`, for a title.
    static func monthTitle(_ periodo: Periodo) -> String {
        let text = month(periodo)
        return text.prefix(1).uppercased() + text.dropFirst()
    }

    /// `3 oct`, read in UTC: the API sends the statement's day as midnight UTC, and a local
    /// calendar would move it to the previous evening west of Greenwich.
    static func shortDate(_ date: Date) -> String {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC")!
        let parts = calendar.dateComponents([.day, .month], from: date)
        return "\(parts.day!) \(shortMonthNames[parts.month! - 1])"
    }

    private static let shortMonthNames = [
        "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic",
    ]

    private static func signed(_ amount: Int, positiveSign: String, negativeSign: String) -> String {
        if amount == 0 { return "$0" }
        return (amount > 0 ? positiveSign : negativeSign) + "$" + grouped(amount.magnitude)
    }

    private static func grouped(_ value: UInt) -> String {
        var digits = Array(String(value))
        var index = digits.count - 3
        while index > 0 {
            digits.insert(".", at: index)
            index -= 3
        }
        return String(digits)
    }
}
