import Foundation

/// App-owned models of "Resumen del mes". Screens use these, never the generated types;
/// `OpenAPIMirachAPI` is the only place that knows the wire shape.

/// Traffic-light state. "No state" is `nil` at every use site (never a case), so a
/// screen cannot forget to handle it.
enum EstadoSemaforo: Equatable, Sendable {
    case verde, amarillo, rojo
}

/// The three buckets of the 50/30/20 rule, in the order the catalog shows them.
enum Bucket: CaseIterable, Hashable, Sendable {
    case necesidades, deseos, ahorro

    /// The `bucket` value the API sends (the 30% bucket is `Deseos`).
    init?(apiName: String) {
        switch apiName {
        case "Necesidades": self = .necesidades
        case "Deseos": self = .deseos
        case "Ahorro": self = .ahorro
        default: return nil
        }
    }
}

/// A calendar month, `AAAA-MM` on the wire.
struct Periodo: Equatable, Hashable, Sendable {
    let year: Int
    let month: Int

    init?(_ text: String) {
        let parts = text.split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2, parts[0].count == 4, parts[1].count == 2,
              let year = Int(parts[0]), let month = Int(parts[1]), (1...12).contains(month)
        else { return nil }
        self.year = year
        self.month = month
    }

    /// `AAAA-MM`, as the API expects it in `?periodo=`.
    var apiValue: String {
        "\(year)-\(month < 10 ? "0" : "")\(month)"
    }
}

struct BucketResumen: Equatable, Sendable {
    let bucket: Bucket
    /// Spent in the bucket, whole pesos, as the API sends it.
    let total: Int
    /// Share of the income in basis points; `nil` when the month has no income.
    let porcentajeBp: Int?
    /// Reference target in basis points (5000 = 50%).
    let metaBp: Int
    let estado: EstadoSemaforo?
}

struct ResumenMes: Equatable, Sendable {
    let periodo: Periodo
    let sinIngreso: Bool
    let totalIngreso: Int
    let estadoGlobal: EstadoSemaforo?
    /// Always three, in catalog order.
    let buckets: [BucketResumen]
}
