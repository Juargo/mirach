import Foundation

/// Wire shape of `GET /api/ingresos/mes` to the app's models. Anything the app cannot trust
/// (non-integer money, a malformed date) throws `DecodingError` instead of showing a wrong figure.
enum IngresosMapper {
    typealias Wire = Components.Schemas.IngresosMesResponse

    static func map(_ wire: Wire, periodo: Periodo) throws -> IngresosMes {
        IngresosMes(
            periodo: periodo,
            total: try money(wire.total),
            conteo: wire.conteo,
            transacciones: try wire.transacciones.map { item in
                Ingreso(
                    id: item.id,
                    fecha: try IngestaMapper.date(item.fecha),
                    descripcion: item.descripcion,
                    origen: item.origen,
                    monto: try money(item.monto)
                )
            }
        )
    }

    private static func money(_ text: String) throws -> Int {
        do { return try Money.pesos(text) } catch { throw IngestaMapper.malformed("amount \(text)") }
    }
}
