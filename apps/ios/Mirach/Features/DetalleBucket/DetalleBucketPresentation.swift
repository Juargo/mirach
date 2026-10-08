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
}
