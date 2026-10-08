import Foundation

/// Wire shape of `GET /api/ingestas` to the app's models. A malformed date throws
/// `DecodingError` instead of showing a wrong one.
enum CartolasSubidasMapper {
    typealias Wire = Components.Schemas.IngestasListResponse

    static func map(_ wire: Wire) throws -> [CartolaSubida] {
        try wire.ingestas.map { item in
            CartolaSubida(
                id: item.id,
                banco: item.banco,
                nombreArchivo: item.nombreArchivo,
                estado: item.estado == .PROCESADA ? .procesada : .fallida,
                motivoFallo: item.motivoFallo,
                fecha: try IngestaMapper.date(item.fecha),
                totalTransacciones: item.totalTransacciones
            )
        }
    }
}
