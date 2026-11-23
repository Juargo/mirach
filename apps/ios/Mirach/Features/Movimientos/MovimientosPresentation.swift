import Foundation

/// The words of the «Movimientos» tab. The sheet to move a movement keeps the words of the
/// bucket detail (`DetalleBucketPresentation`): it is the same sheet.
enum MovimientosPresentation {
    static let title = "Movimientos"
    static let loading = "Cargando movimientos…"
    static let emptyPane = "Sin movimientos"
    static let move = "Mover"
    static let undo = "Deshacer"

    /// «$569.400 · 52%»: the total and the share of the income exactly as the API sends them,
    /// «—» when the month has no income. Nothing else goes in the header.
    static func paneHeader(_ detalle: BucketDetalle) -> String {
        "\(Format.money(detalle.total)) · \(Format.percent(bp: detalle.porcentajeBp))"
    }

    /// What the header says to VoiceOver: «Necesidades. $569.400 · 52%».
    static func paneLabel(_ detalle: BucketDetalle) -> String {
        "\(detalle.bucket.label). \(paneHeader(detalle))"
    }

    /// «Movido a Gustos · Ropa».
    static func moved(_ result: Reclasificacion) -> String {
        "Movido a \(result.bucket.label) · \(result.categoriaNombre)"
    }

    static func undoFailed(connection: Bool) -> String {
        connection
            ? "No pudimos deshacer el movimiento. Revisa tu conexión e inténtalo de nuevo."
            : "No pudimos deshacer el movimiento. Inténtalo de nuevo."
    }

    /// A category row as VoiceOver reads it: «Restaurantes. 2 movimientos. $210.900».
    static func groupLabel(_ group: GrupoCategoria) -> String {
        "\(group.nombre). \(DetalleBucketPresentation.movements(group.conteo)). \(Format.money(group.subtotal))"
    }

    /// «RESTAURANT LA PUNTA. 3 oct. Gasto de $118.500»; the «Mover» button is its own element.
    static func rowLabel(_ movement: MovimientoBucket) -> String {
        "\(movement.descripcion). \(Format.shortDate(movement.fecha)). \(Format.spokenExpense(movement.monto))"
    }

    /// The «Mover» button names its movement, so a list of them is not a list of «Mover».
    static func moveHint(_ movement: MovimientoBucket) -> String {
        "Cambiar de categoría \(movement.descripcion)"
    }
}
