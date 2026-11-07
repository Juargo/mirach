import Foundation

/// The words of "Detalle de bucket": counts and what VoiceOver reads, with the same sign logic
/// as the figures on screen (see `Format`).
enum DetalleBucketPresentation {
    static func movements(_ count: Int) -> String {
        count == 1 ? "1 movimiento" : "\(count) movimientos"
    }

    static func categories(_ count: Int) -> String {
        count == 1 ? "1 categoría" : "\(count) categorías"
    }

    static func headerLabel(_ detalle: BucketDetalle) -> String {
        let share = detalle.porcentajeBp.map { "\(Format.percent(bp: $0)) del ingreso" } ?? "sin porcentaje del ingreso"
        var parts = [
            detalle.bucket.label, Format.spokenExpense(detalle.total), share,
        ]
        if let meta = detalle.metaBp { parts.append("Meta \(Format.percent(bp: meta))") }
        parts.append(movements(detalle.totalTransacciones))
        parts.append(categories(detalle.totalCategorias))
        return parts.joined(separator: ". ")
    }

    static func groupLabel(_ group: GrupoCategoria) -> String {
        "\(group.nombre). \(movements(group.conteo)). \(Format.spokenExpense(group.subtotal))"
    }

    static func rowLabel(_ movement: MovimientoBucket) -> String {
        "\(movement.descripcion). \(Format.spokenExpense(movement.monto)). "
            + "\(Format.shortDate(movement.fecha)). \(movement.origen)"
    }

    /// «Este movimiento pasará de Deseos a Necesidades y cambiará el cálculo del mes».
    static func bucketChangeMessage(from: Bucket, to: Bucket) -> String {
        "Este movimiento pasará de \(from.label) a \(to.label) y cambiará el cálculo del mes."
    }

    /// What «Guardar» does, or why it cannot yet.
    static func saveHint(_ selection: CategoriaCatalogo?) -> String {
        selection.map { "Mueve el movimiento a \($0.nombre)" } ?? "Elige una categoría primero"
    }

    // MARK: apply to similar movements (CLA-03, Figma 09)

    /// «Aplicar a “netflix”».
    static func applyTitle(_ patron: String) -> String {
        "Aplicar a “\(patron)”"
    }

    /// How many OTHER movements of the month follow, and the next statements always do.
    static func applySubtitle(_ total: Int) -> String {
        switch total {
        case 0: "Los próximos que lleguen"
        case 1: "1 movimiento más y los próximos que lleguen"
        default: "\(total) movimientos más y los próximos que lleguen"
        }
    }

    /// The text already lives in another category: saving moves it here (CLA-17).
    static func applyElsewhere(_ existente: PatronExistente?, categoriaId: String) -> String? {
        guard let existente, existente.categoriaId != categoriaId else { return nil }
        return "Ya está en \(existente.categoria): se moverá aquí."
    }

    /// The checkbox as VoiceOver reads it: title, subtitle and the move, as one sentence.
    static func applyLabel(_ parecidos: Parecidos, categoriaId: String) -> String {
        var parts = [applyTitle(parecidos.patron ?? ""), applySubtitle(parecidos.total)]
        if let elsewhere = applyElsewhere(parecidos.existente, categoriaId: categoriaId) {
            parts.append(String(elsewhere.dropLast()))
        }
        return parts.joined(separator: ". ") + "."
    }

    /// «Movida a Gustos · Ropa», plus « · 3 movidos» when similar movements moved too.
    static func movedAnnouncement(_ result: Reclasificacion) -> String {
        let base = "Movida a \(result.bucket.label) · \(result.categoriaNombre)"
        return result.movidos > 0 ? "\(base) · \(result.movidos) movidos" : base
    }
}
