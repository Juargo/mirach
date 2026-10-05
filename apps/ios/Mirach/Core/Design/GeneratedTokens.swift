// GENERATED FILE. DO NOT EDIT.
// Source: design/tokens.json. Regenerate with: apps/ios/scripts/generate-tokens.sh
// CI fails when this file is out of date (see the `ios` job in .github/workflows/ci.yml).

import SwiftUI

// MARK: - Colors

/// Light/dark colors live in the `Tokens.xcassets` asset catalog; the system picks
/// the variant from the current appearance, so no view decides a color per theme.
/// Use: `Color.Mirach.Bucket.deseos`, `Color.Mirach.Base.foreground`.
extension Color {
    enum Mirach {
        enum Base {
            static let background = Color("Base/background", bundle: .main)
            static let foreground = Color("Base/foreground", bundle: .main)
            static let card = Color("Base/card", bundle: .main)
            static let cardForeground = Color("Base/card-foreground", bundle: .main)
            static let popover = Color("Base/popover", bundle: .main)
            static let popoverForeground = Color("Base/popover-foreground", bundle: .main)
            static let primary = Color("Base/primary", bundle: .main)
            static let primaryForeground = Color("Base/primary-foreground", bundle: .main)
            static let secondary = Color("Base/secondary", bundle: .main)
            static let secondaryForeground = Color("Base/secondary-foreground", bundle: .main)
            static let muted = Color("Base/muted", bundle: .main)
            static let mutedForeground = Color("Base/muted-foreground", bundle: .main)
            static let accent = Color("Base/accent", bundle: .main)
            static let accentForeground = Color("Base/accent-foreground", bundle: .main)
            static let destructive = Color("Base/destructive", bundle: .main)
            static let border = Color("Base/border", bundle: .main)
            static let input = Color("Base/input", bundle: .main)
            static let ring = Color("Base/ring", bundle: .main)
        }
        enum Bucket {
            static let necesidades = Color("Bucket/necesidades", bundle: .main)
            static let deseos = Color("Bucket/deseos", bundle: .main)
            static let ahorro = Color("Bucket/ahorro", bundle: .main)
            static let exceso = Color("Bucket/exceso", bundle: .main)
            static let sinCategoria = Color("Bucket/sin-categoria", bundle: .main)
        }
        enum Pie {
            static let labelNecesidades = Color("Pie/label-necesidades", bundle: .main)
            static let labelDeseos = Color("Pie/label-deseos", bundle: .main)
            static let labelAhorro = Color("Pie/label-ahorro", bundle: .main)
            static let labelSinCategoria = Color("Pie/label-sin-categoria", bundle: .main)
            static let separator = Color("Pie/separator", bundle: .main)
        }
        enum Ingreso {
            static let fill = Color("Ingreso/fill", bundle: .main)
            static let text = Color("Ingreso/text", bundle: .main)
        }
        enum Semaforo {
            static let verdeFill = Color("Semaforo/verde-fill", bundle: .main)
            static let verdeInk = Color("Semaforo/verde-ink", bundle: .main)
            static let verdeBand = Color("Semaforo/verde-band", bundle: .main)
            static let amarilloFill = Color("Semaforo/amarillo-fill", bundle: .main)
            static let amarilloInk = Color("Semaforo/amarillo-ink", bundle: .main)
            static let amarilloBand = Color("Semaforo/amarillo-band", bundle: .main)
            static let rojoFill = Color("Semaforo/rojo-fill", bundle: .main)
            static let rojoInk = Color("Semaforo/rojo-ink", bundle: .main)
            static let rojoBand = Color("Semaforo/rojo-band", bundle: .main)
            static let sinDatosInk = Color("Semaforo/sin-datos-ink", bundle: .main)
        }
        enum Feedback {
            static let warningFill = Color("Feedback/warning-fill", bundle: .main)
            static let warningBorder = Color("Feedback/warning-border", bundle: .main)
            static let warningInk = Color("Feedback/warning-ink", bundle: .main)
            static let warningAccent = Color("Feedback/warning-accent", bundle: .main)
            static let successText = Color("Feedback/success-text", bundle: .main)
            static let expenseText = Color("Feedback/expense-text", bundle: .main)
            static let errorText = Color("Feedback/error-text", bundle: .main)
            static let linkActiveFill = Color("Feedback/link-active-fill", bundle: .main)
            static let linkActiveInk = Color("Feedback/link-active-ink", bundle: .main)
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
        "Base/popover",
        "Base/popover-foreground",
        "Base/primary",
        "Base/primary-foreground",
        "Base/secondary",
        "Base/secondary-foreground",
        "Base/muted",
        "Base/muted-foreground",
        "Base/accent",
        "Base/accent-foreground",
        "Base/destructive",
        "Base/border",
        "Base/input",
        "Base/ring",
        "Bucket/necesidades",
        "Bucket/deseos",
        "Bucket/ahorro",
        "Bucket/exceso",
        "Bucket/sin-categoria",
        "Pie/label-necesidades",
        "Pie/label-deseos",
        "Pie/label-ahorro",
        "Pie/label-sin-categoria",
        "Pie/separator",
        "Ingreso/fill",
        "Ingreso/text",
        "Semaforo/verde-fill",
        "Semaforo/verde-ink",
        "Semaforo/verde-band",
        "Semaforo/amarillo-fill",
        "Semaforo/amarillo-ink",
        "Semaforo/amarillo-band",
        "Semaforo/rojo-fill",
        "Semaforo/rojo-ink",
        "Semaforo/rojo-band",
        "Semaforo/sin-datos-ink",
        "Feedback/warning-fill",
        "Feedback/warning-border",
        "Feedback/warning-ink",
        "Feedback/warning-accent",
        "Feedback/success-text",
        "Feedback/expense-text",
        "Feedback/error-text",
        "Feedback/link-active-fill",
        "Feedback/link-active-ink",
    ]

    /// Color assets whose light and dark values are intentionally identical.
    static let identicalInBothThemes: Set<String> = []
}

// MARK: - Copy

/// User-facing labels from `copy.*` in tokens.json. The 30% bucket is "Deseos".
enum MirachCopy {
    enum Bucket {
        static let necesidades = "Necesidades"
        static let deseos = "Deseos"
        static let ahorro = "Ahorro"
        static let ingreso = "Ingreso"
    }
    enum Semaforo {
        static let verde = "Muy Saludable"
        static let amarillo = "Saludable"
        static let rojo = "En peligro"
        static let sinDatos = "Sin datos"
    }
}

// MARK: - Typography

/// Font family names from `typography.font-family`, in fallback order. Fonts are not bundled yet.
enum MirachFont {
    static let sans: [String] = ["Inter Variable", "system-ui", "Segoe UI", "Roboto", "sans-serif"]
    static let mono: [String] = ["Geist Mono Variable", "JetBrains Mono", "ui-monospace", "SFMono-Regular", "SF Mono", "Menlo", "Consolas", "monospace"]
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

/// Corner radii from `radius.*`. The base is square; `maxAllowed` is a ceiling, not a default.
enum MirachRadius {
    static let base: CGFloat = 0
    static let maxAllowed: CGFloat = 2
}
