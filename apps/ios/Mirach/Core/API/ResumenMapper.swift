import Foundation

/// Wire shape of `GET /api/resumen` to the app's models. Anything the app cannot trust
/// (bad period, non-integer money, unknown or missing bucket) throws `DecodingError`
/// instead of showing a wrong figure.
enum ResumenMapper {
    typealias Wire = Components.Schemas.ResumenMesResponse

    static func map(_ wire: Wire) throws -> ResumenMes {
        guard let periodo = Periodo(wire.periodo) else { throw malformed("periodo \(wire.periodo)") }

        let metas: [Bucket: Int] = [
            .necesidades: basisPoints(wire.targets.Necesidades),
            .deseos: basisPoints(wire.targets.Deseos),
            .ahorro: basisPoints(wire.targets.Ahorro),
        ]
        var byBucket: [Bucket: BucketResumen] = [:]
        for item in wire.buckets {
            guard let bucket = Bucket(apiName: item.bucket), byBucket[bucket] == nil else {
                throw malformed("bucket \(item.bucket)")
            }
            byBucket[bucket] = BucketResumen(
                bucket: bucket,
                total: try money(item.total),
                porcentajeBp: item.porcentajeBp,
                metaBp: metas[bucket] ?? 0,
                estado: estado(item.estadoSemaforo)
            )
        }
        // The catalog fixes the order and says there are always three.
        let ordered = try Bucket.allCases.map { bucket in
            guard let item = byBucket[bucket] else { throw malformed("missing bucket") }
            return item
        }
        return ResumenMes(
            periodo: periodo,
            sinIngreso: wire.sinIngreso,
            totalIngreso: try money(wire.totalIngreso),
            estadoGlobal: estado(wire.estadoGlobal),
            buckets: ordered
        )
    }

    // The nullable enums list `null` among their values, which the generator renders as an
    // extra `_empty` case. It means the same as nil: no state. Never exposed past here.
    private static func estado(_ wire: Wire.estadoGlobalPayload?) -> EstadoSemaforo? {
        switch wire {
        case .verde: .verde
        case .amarillo: .amarillo
        case .rojo: .rojo
        case ._empty, nil: nil
        }
    }

    private static func estado(_ wire: Wire.bucketsPayloadPayload.estadoSemaforoPayload?) -> EstadoSemaforo? {
        switch wire {
        case .verde: .verde
        case .amarillo: .amarillo
        case .rojo: .rojo
        case ._empty, nil: nil
        }
    }

    /// Money arrives as a decimal string of whole pesos; `Int(_:)` is exact and rejects
    /// anything else ("12,5", "1e3", "").
    private static func money(_ text: String) throws -> Int {
        guard let value = Int(text) else { throw malformed("amount \(text)") }
        return value
    }

    /// Targets arrive as a JSON number (50, 30, 20): kept in basis points like every percentage.
    private static func basisPoints(_ percent: Double) -> Int {
        Int((percent * 100).rounded())
    }

    static func malformed(_ what: String) -> DecodingError {
        .dataCorrupted(.init(codingPath: [], debugDescription: "Unexpected \(what)"))
    }
}
