import Foundation

/// Screen 04's classification accordion (bucket → category → movement): the texts and the row
/// lookups over `CartolaPreview.clasificacion`. Pure, so it is tested without a view. The counts
/// and totals come from the server; nothing is summed here.
enum PreviewSummaryPresentation {
    static let allClassifiedMessage = "Todos los movimientos quedaron clasificados."
    static let incomeTitle = "Ingresos"
    static let unknownCategoryName = "Desconocido"

    /// «N movimientos quedaron en Desconocido», or that everything was classified.
    static func unknownsMessage(_ clasificacion: ClasificacionPreview) -> String {
        switch clasificacion.desconocidos {
        case 0: allClassifiedMessage
        case 1: "1 movimiento quedó en \(unknownCategoryName)"
        case let n: "\(n) movimientos quedaron en \(unknownCategoryName)"
        }
    }

    /// With unknown rows, reviewing is the recommended action, so its button goes first and prominent.
    static func reviewIsPrimary(_ clasificacion: ClasificacionPreview) -> Bool {
        clasificacion.desconocidos > 0
    }

    static func countText(_ count: Int) -> String {
        count == 1 ? "1 movimiento" : "\(count) movimientos"
    }

    static func title(of group: ClasificacionPreview.BucketGroup) -> String {
        group.bucket.label
    }

    /// VoiceOver reads a bucket header as one element.
    static func spokenSummary(of group: ClasificacionPreview.BucketGroup) -> String {
        "\(title(of: group)). \(countText(group.cantidad)). \(Format.spokenExpense(group.total))"
    }

    static func spokenSummary(of ingresos: ClasificacionPreview.Ingresos) -> String {
        "\(incomeTitle). \(countText(ingresos.cantidad)). \(Format.spokenIncome(ingresos.total))"
    }

    static func spokenSummary(of categoria: ClasificacionPreview.Categoria) -> String {
        "\(categoria.nombre). \(countText(categoria.cantidad)). \(Format.spokenExpense(categoria.total))"
    }

    /// The movements of a category, by `rowIndex` ascending. An index the preview does not have
    /// (the server and the rows disagree) is skipped rather than shown wrong.
    static func rows(of categoria: ClasificacionPreview.Categoria, in preview: CartolaPreview) -> [CartolaRow] {
        let byIndex = Dictionary(preview.filas.map { ($0.rowIndex, $0) }, uniquingKeysWith: { first, _ in first })
        return categoria.filas.sorted().compactMap { byIndex[$0] }
    }

    /// The income rows the server counted in `ingresos`: not duplicated, `abono` only.
    static func incomeRows(in preview: CartolaPreview) -> [CartolaRow] {
        preview.filas.filter { !$0.esDuplicado && $0.cargo == 0 && $0.abono > 0 }
    }
}
