import Foundation

/// The words of "Ingresos del mes": counts and what VoiceOver reads, with the same sign logic
/// as the figures on screen (see `Format`).
enum IngresosPresentation {
    static func count(_ count: Int) -> String {
        count == 1 ? "1 movimiento" : "\(count) movimientos"
    }

    static func headerLabel(_ ingresos: IngresosMes) -> String {
        "\(MirachCopy.Bucket.ingreso). \(Format.spokenIncome(ingresos.total)). \(count(ingresos.conteo))"
    }

    static func rowLabel(_ ingreso: Ingreso) -> String {
        "\(ingreso.descripcion). \(Format.spokenIncome(ingreso.monto)). "
            + "\(Format.shortDate(ingreso.fecha)). \(ingreso.origen)"
    }
}
