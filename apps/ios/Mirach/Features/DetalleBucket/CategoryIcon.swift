/// The category icons of the API's allowed list (ADR-045, `icono-categoria.ts`) as SF Symbols.
/// A value the app does not know, or `nil`, gets the generic tag: never an error. The list is
/// in the catalog's order, for the picker.
enum CategoryIcon {
    static let generic = "tag"

    struct Option: Identifiable, Equatable {
        let value: String
        let symbol: String
        /// What VoiceOver says for the picker cell.
        let label: String
        var id: String { value }
    }

    static let options: [Option] = [
        Option(value: "shopping-cart", symbol: "cart", label: "Carrito de compras"),
        Option(value: "fuel", symbol: "fuelpump", label: "Combustible"),
        Option(value: "pill", symbol: "pills", label: "Medicamentos"),
        Option(value: "heart-pulse", symbol: "waveform.path.ecg", label: "Salud"),
        Option(value: "bus", symbol: "bus", label: "Bus"),
        Option(value: "house", symbol: "house", label: "Casa"),
        Option(value: "zap", symbol: "bolt", label: "Electricidad"),
        Option(value: "wifi", symbol: "wifi", label: "Internet"),
        Option(value: "smartphone", symbol: "iphone", label: "Celular"),
        Option(value: "graduation-cap", symbol: "graduationcap", label: "Educación"),
        Option(value: "shield", symbol: "shield", label: "Seguro"),
        Option(value: "car", symbol: "car", label: "Auto"),
        Option(value: "paw-print", symbol: "pawprint", label: "Mascotas"),
        Option(value: "tv", symbol: "tv", label: "Televisión"),
        Option(value: "bike", symbol: "bicycle", label: "Bicicleta"),
        Option(value: "utensils", symbol: "fork.knife", label: "Comida"),
        Option(value: "shirt", symbol: "tshirt", label: "Ropa"),
        Option(value: "plane", symbol: "airplane", label: "Viajes"),
        Option(value: "gamepad-2", symbol: "gamecontroller", label: "Juegos"),
        Option(value: "gift", symbol: "gift", label: "Regalos"),
        Option(value: "dumbbell", symbol: "dumbbell", label: "Ejercicio"),
        Option(value: "piggy-bank", symbol: "banknote", label: "Ahorro"),
        Option(value: "trending-up", symbol: "chart.line.uptrend.xyaxis", label: "Inversión"),
        Option(value: "credit-card", symbol: "creditcard", label: "Tarjeta"),
        Option(value: "circle-help", symbol: "questionmark.circle", label: "Otro"),
    ]

    static var allowedValues: [String] { options.map(\.value) }

    static func symbol(for icono: String?) -> String {
        icono.flatMap { value in options.first { $0.value == value }?.symbol } ?? generic
    }

    /// The spoken name of the icon, `nil` for no icon or one the app does not know.
    static func label(for icono: String?) -> String? {
        icono.flatMap { value in options.first { $0.value == value }?.label }
    }
}
