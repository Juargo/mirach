import SwiftUI

/// What a bucket bar draws and says. Pure, so the rules are tested without a view.
enum BucketBarPresentation {
    /// Real share of the income as a 0...1 fraction of the track; empty without a share.
    static func fillFraction(of item: BucketResumen) -> Double {
        clamped(bp: item.porcentajeBp ?? 0)
    }

    /// Target share as a 0...1 fraction of the track.
    static func tickFraction(of item: BucketResumen) -> Double {
        clamped(bp: item.metaBp)
    }

    /// `56% de 50% · $700.000`: real share, target share, amount spent.
    static func caption(for item: BucketResumen) -> String {
        "\(Format.percent(bp: item.porcentajeBp)) de \(Format.percent(bp: item.metaBp)) · \(Format.money(item.total))"
    }

    /// What VoiceOver reads: the name, the state word when there is one, the spend (same sign
    /// logic as the visible figure), the share and the target.
    nonisolated static func accessibilityLabel(for item: BucketResumen) -> String {
        let share = item.porcentajeBp.map { "\(Format.percent(bp: $0)) del ingreso" } ?? "sin porcentaje del ingreso"
        let state = item.estado.map { "\($0.word). " } ?? ""
        return "\(item.bucket.label). \(state)\(Format.spokenExpense(item.total)), \(share). "
            + "Meta \(Format.percent(bp: item.metaBp))"
    }

    private static func clamped(bp: Int) -> Double {
        min(max(Double(bp) / 10_000, 0), 1)
    }
}

/// A bucket's name and state, its share of the income against the target, and the figures.
struct BucketBar: View {
    let item: BucketResumen

    private static let trackHeight: CGFloat = 10
    private static let tickWidth: CGFloat = 2
    private static let tickHeight: CGFloat = 18

    var body: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.xs) {
            HStack(spacing: MirachSpacing.s) {
                Text(item.bucket.label)
                    .mirachText(.cuerpoDestacado)
                    .foregroundStyle(Color.Mirach.Base.foreground)
                Spacer(minLength: MirachSpacing.s)
                if let estado = item.estado { EstadoLabel(estado: estado) }
            }
            track
            Text(BucketBarPresentation.caption(for: item))
                .mirachText(.etiqueta)
                .mirachFigures()
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .contentShape(Rectangle())
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(BucketBarPresentation.accessibilityLabel(for: item))
    }

    /// The track, the fill in the bucket color and the target tick, centered on the track.
    private var track: some View {
        GeometryReader { proxy in
            let width = proxy.size.width
            ZStack(alignment: .leading) {
                Rectangle().fill(Color.Mirach.Base.card)
                    .frame(height: Self.trackHeight)
                Rectangle().fill(item.bucket.fill)
                    .frame(width: width * BucketBarPresentation.fillFraction(of: item), height: Self.trackHeight)
                Rectangle().fill(Color.Mirach.Base.foreground)
                    .frame(width: Self.tickWidth, height: Self.tickHeight)
                    .offset(x: width * BucketBarPresentation.tickFraction(of: item) - Self.tickWidth / 2)
            }
            .frame(height: Self.tickHeight)
        }
        .frame(height: Self.tickHeight)
        .accessibilityHidden(true)
    }
}
