// GENERATED FILE. DO NOT EDIT.
// Source: design/tokens.json. Regenerate with: apps/ios/scripts/generate-tokens.sh
// CI fails when this file is out of date (see the `ios` job in .github/workflows/ci.yml).

import SwiftUI

// MARK: - Colors

/// Light/dark colors live in the `Tokens.xcassets` asset catalog; the system picks
/// the variant from the current appearance, so no view decides a color per theme.
/// Use: `Color.Mirach.Bucket.gustos`, `Color.Mirach.Base.foreground`.
extension Color {
    enum Mirach {
        enum Base {
            static let background = Color("Base/background", bundle: .main)
            static let foreground = Color("Base/foreground", bundle: .main)
            static let card = Color("Base/card", bundle: .main)
            static let cardForeground = Color("Base/card-foreground", bundle: .main)
            static let primary = Color("Base/primary", bundle: .main)
            static let primaryForeground = Color("Base/primary-foreground", bundle: .main)
            static let mutedForeground = Color("Base/muted-foreground", bundle: .main)
            static let accent = Color("Base/accent", bundle: .main)
            static let accentForeground = Color("Base/accent-foreground", bundle: .main)
            static let destructive = Color("Base/destructive", bundle: .main)
            static let border = Color("Base/border", bundle: .main)
            static let input = Color("Base/input", bundle: .main)
        }
        enum Bucket {
            static let necesidades = Color("Bucket/necesidades", bundle: .main)
            static let gustos = Color("Bucket/gustos", bundle: .main)
            static let ahorro = Color("Bucket/ahorro", bundle: .main)
            static let ahorroText = Color("Bucket/ahorro-text", bundle: .main)
        }
        enum Estado {
            static let bien = Color("Estado/bien", bundle: .main)
            static let cerca = Color("Estado/cerca", bundle: .main)
            static let sobre = Color("Estado/sobre", bundle: .main)
            static let bienText = Color("Estado/bien-text", bundle: .main)
            static let cercaText = Color("Estado/cerca-text", bundle: .main)
        }
        enum Feedback {
            static let errorText = Color("Feedback/error-text", bundle: .main)
            static let successText = Color("Feedback/success-text", bundle: .main)
            static let expenseText = Color("Feedback/expense-text", bundle: .main)
        }
        enum Ingreso {
            static let text = Color("Ingreso/text", bundle: .main)
        }
    }
}

/// Asset names, for runtime checks that every token resolves in the catalog.
enum MirachTokenCatalog {
    /// Every color asset name, as `Group/token`.
    static let colorAssetNames: [String] = [
        "Base/background",
        "Base/foreground",
        "Base/card",
        "Base/card-foreground",
        "Base/primary",
        "Base/primary-foreground",
        "Base/muted-foreground",
        "Base/accent",
        "Base/accent-foreground",
        "Base/destructive",
        "Base/border",
        "Base/input",
        "Bucket/necesidades",
        "Bucket/gustos",
        "Bucket/ahorro",
        "Bucket/ahorro-text",
        "Estado/bien",
        "Estado/cerca",
        "Estado/sobre",
        "Estado/bien-text",
        "Estado/cerca-text",
        "Feedback/error-text",
        "Feedback/success-text",
        "Feedback/expense-text",
        "Ingreso/text",
    ]

    /// Color assets whose light and dark values are intentionally identical.
    static let identicalInBothThemes: Set<String> = []
}

// MARK: - Copy

/// User-facing labels from `copy.*` in tokens.json. The 30% bucket is "Gustos".
enum MirachCopy {
    enum Bucket {
        static let necesidades = "Necesidades"
        static let gustos = "Gustos"
        static let ahorro = "Ahorro"
        static let ingreso = "Ingreso"
    }
    enum Estado {
        static let bien = "Bien"
        static let cerca = "Cerca"
        static let sobre = "Sobre"
        static let sinDatos = "Sin datos"
    }
}

// MARK: - Typography

/// Font family names from `typography.font-family`, in fallback order. Inter is bundled (see MirachTypography.swift).
enum MirachFont {
    static let sans: [String] = ["Inter", "system-ui"]
    /// OpenType feature required for figures (`typography.figure-features`).
    static let figureFeatures = "tnum"
}

extension View {
    /// Rule "figures use tabular digits": amounts, dates and counts align in columns.
    func mirachFigures() -> some View {
        monospacedDigit()
    }
}

// MARK: - Radius

/// Corner radii from `radius.*`. Corners are square.
enum MirachRadius {
    static let base: CGFloat = 0
}

// MARK: - Spacing

/// Spacing scale from `spacing.*`, in points.
enum MirachSpacing {
    static let xs: CGFloat = 4
    static let s: CGFloat = 8
    static let m: CGFloat = 16
    static let l: CGFloat = 24
    static let xl: CGFloat = 32
}
