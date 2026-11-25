import Foundation

/// The words of "Categorías" and "Detalle de categoría": counts and what VoiceOver reads.
enum CategoriasPresentation {
    static func patterns(_ count: Int) -> String {
        count == 1 ? "1 patrón" : "\(count) patrones"
    }

    /// What VoiceOver hints on a closed bucket of the list.
    static let openHint = "Muestra las categorías de este bloque"

    /// The row says the same the screen shows: the name and how many patterns.
    static func rowLabel(_ category: CategoriaCatalogo) -> String {
        var label = "\(category.nombre). \(patterns(category.patrones.count))"
        if category.esInterna { label += ". Categoría del sistema" }
        return label
    }
}
