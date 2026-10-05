import SwiftUI

/// How the buckets look: labels from the design tokens (never hand-typed, so the
/// 30% bucket cannot drift from the official name) and token colors.
extension Bucket {
    var label: String {
        switch self {
        case .necesidades: MirachCopy.Bucket.necesidades
        case .deseos: MirachCopy.Bucket.deseos
        case .ahorro: MirachCopy.Bucket.ahorro
        }
    }

    /// A fill (the swatch and the chart slice), never a text color.
    var fill: Color {
        switch self {
        case .necesidades: Color.Mirach.Bucket.necesidades
        case .deseos: Color.Mirach.Bucket.deseos
        case .ahorro: Color.Mirach.Bucket.ahorro
        }
    }
}
