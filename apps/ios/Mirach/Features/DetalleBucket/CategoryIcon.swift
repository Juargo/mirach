/// The category icons of the API's allowed list (ADR-045, `icono-categoria.ts`) as SF Symbols.
/// A value the app does not know, or `nil`, gets the generic tag: never an error.
enum CategoryIcon {
    static let generic = "tag"

    private static let symbols: [String: String] = [
        "shopping-cart": "cart", "fuel": "fuelpump", "pill": "pills", "heart-pulse": "waveform.path.ecg",
        "bus": "bus", "house": "house", "zap": "bolt", "wifi": "wifi", "smartphone": "iphone",
        "graduation-cap": "graduationcap", "shield": "shield", "car": "car", "paw-print": "pawprint",
        "tv": "tv", "bike": "bicycle", "utensils": "fork.knife", "shirt": "tshirt", "plane": "airplane",
        "gamepad-2": "gamecontroller", "gift": "gift", "dumbbell": "dumbbell", "piggy-bank": "banknote",
        "trending-up": "chart.line.uptrend.xyaxis", "credit-card": "creditcard", "circle-help": "questionmark.circle",
    ]

    static var allowedValues: [String] { Array(symbols.keys) }

    static func symbol(for icono: String?) -> String {
        icono.flatMap { symbols[$0] } ?? generic
    }
}
