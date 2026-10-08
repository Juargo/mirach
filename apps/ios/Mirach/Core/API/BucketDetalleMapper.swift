import Foundation

/// Wire shape of `GET /api/buckets/{bucket}/detalle` to the app's models. Anything the app
/// cannot trust (bad period, unknown bucket, non-integer money, a malformed date) throws
/// `DecodingError` instead of showing a wrong figure.
enum BucketDetalleMapper {
    typealias Wire = Components.Schemas.BucketDetalleMesResponse

    static func map(_ wire: Wire) throws -> BucketDetalle {
        guard let periodo = Periodo(wire.periodo) else { throw IngestaMapper.malformed("periodo \(wire.periodo)") }
        guard let bucket = Bucket(apiName: wire.bucket) else { throw IngestaMapper.malformed("bucket \(wire.bucket)") }
        return BucketDetalle(
            bucket: bucket,
            periodo: periodo,
            total: try money(wire.total),
            porcentajeBp: wire.porcentajeBp,
            metaBp: wire.metaBp,
            totalTransacciones: wire.totalTransacciones,
            totalCategorias: wire.totalCategorias,
            grupos: try wire.grupos.map(group)
        )
    }

    private static func group(_ wire: Wire.gruposPayloadPayload) throws -> GrupoCategoria {
        GrupoCategoria(
            categoriaId: wire.categoriaId,
            nombre: wire.nombre,
            icono: wire.icono,
            subtotal: try money(wire.subtotal),
            conteo: wire.conteo,
            transacciones: try wire.transacciones.map { item in
                MovimientoBucket(
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
