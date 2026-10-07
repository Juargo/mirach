import Foundation

/// Wire (generated) shapes of the upload flow to app-owned models. The only place that knows
/// how amounts, dates and suggestions travel.
enum IngestaMapper {
    static func preview(_ wire: Components.Schemas.PreviewIngestaResponse) throws -> CartolaPreview {
        // `resumen` is optional in the contract, but without it there is nothing to decide on.
        guard let resumen = wire.resumen else { throw malformed("resumen") }
        return CartolaPreview(
            banco: wire.banco, tipoCuenta: wire.tipoCuenta, numeroCuenta: wire.numeroCuenta,
            totalFilas: resumen.totalFilas, duplicados: resumen.duplicadosDetectados, nuevas: resumen.nuevas,
            filas: try (wire.filas ?? []).map(row)
        )
    }

    static func catalog(_ wire: Components.Schemas.CatalogoResponse) -> CatalogoCategorias {
        // A category in a bucket the app does not know cannot be placed in a group: left out.
        CatalogoCategorias(categorias: wire.categorias.compactMap { category in
            Bucket(apiName: category.bucket).map { CategoriaCatalogo(id: category.id, nombre: category.nombre, bucket: $0) }
        })
    }

    private typealias Wire = Components.Schemas.PreviewIngestaResponse.filasPayloadPayload

    private static func row(_ wire: Wire) throws -> CartolaRow {
        CartolaRow(
            rowIndex: wire.rowIndex,
            fecha: try date(wire.fecha),
            descripcion: wire.descripcion,
            cargo: try Money.pesos(wire.cargo),
            abono: try Money.pesos(wire.abono),
            esDuplicado: wire.esDuplicado,
            // A bucket the app does not know cannot be shown: same as no suggestion.
            sugerido: wire.sugerido.flatMap { suggestion in
                Bucket(apiName: suggestion.bucket).map {
                    CartolaRow.Suggestion(bucket: $0, categoriaId: suggestion.categoriaId)
                }
            }
        )
    }

    /// ISO 8601 UTC, with or without fractional seconds.
    private static func date(_ text: String) throws -> Date {
        if let date = try? Date.ISO8601FormatStyle(includingFractionalSeconds: true).parse(text) { return date }
        if let date = try? Date.ISO8601FormatStyle().parse(text) { return date }
        throw malformed("date")
    }

    static func malformed(_ what: String) -> DecodingError {
        .dataCorrupted(.init(codingPath: [], debugDescription: "malformed \(what)"))
    }
}
