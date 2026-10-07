import Foundation

/// The words of "Categorías" and "Detalle de categoría": counts and what VoiceOver reads.
enum CategoriasPresentation {
    static func patterns(_ count: Int) -> String {
        count == 1 ? "1 patrón" : "\(count) patrones"
    }

    /// «12 movimientos · 2 patrones»
    static func counts(_ category: CategoriaCatalogo) -> String {
        "\(DetalleBucketPresentation.movements(category.transaccionesCount)) · \(patterns(category.patrones.count))"
    }

    static func rowLabel(_ category: CategoriaCatalogo) -> String {
        var label = "\(category.nombre). \(DetalleBucketPresentation.movements(category.transaccionesCount)). \(patterns(category.patrones.count))"
        if category.esInterna { label += ". Categoría del sistema" }
        return label
    }
}
