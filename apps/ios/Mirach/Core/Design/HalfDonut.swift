import SwiftUI

/// One drawn segment of a ring. Angles are degrees from the top, through the leading side,
/// from 0 (top) to 180 (bottom).
struct HalfDonutSegment: Equatable {
    let bucket: Bucket
    let start: Double
    let end: Double
    /// The percentage printed on the segment.
    let label: String

    /// A label needs room: below this sweep the segment is drawn without its percentage.
    static let minimumLabelSweep = 16.0

    var middle: Double { (start + end) / 2 }
    var showsLabel: Bool { end - start >= Self.minimumLabelSweep }
}

/// The geometry and labels of the half donut. Pure, so angles are tested without a view.
/// The outer ring is the month (real share of the income), the inner ring the target.
struct HalfDonutPresentation {
    static let gapDegrees = 1.5
    static let visibleWidth: CGFloat = 150
    static let visibleHeight: CGFloat = 300
    static let outerDiameter: CGFloat = 300
    static let outerInnerRatio: CGFloat = 0.74
    static let innerDiameter: CGFloat = 208
    static let innerInnerRatio: CGFloat = 0.80
    static let innerOpacity = 0.4

    let outer: [HalfDonutSegment]
    let inner: [HalfDonutSegment]

    init(buckets: [BucketResumen]) {
        outer = Self.segments(buckets, weight: { $0.porcentajeBp ?? 0 }, label: { $0.porcentajeBp })
        inner = Self.segments(buckets, weight: { $0.metaBp }, label: { $0.metaBp })
    }

    /// White on jade is 3.51:1: the documented contrast exception puts Ahorro's outer label on `foreground`.
    static func outerLabelOnBackground(_ bucket: Bucket) -> Bool {
        bucket != .ahorro
    }

    /// A point on a circle: 0° is the top and the angle grows through the leading side to the bottom.
    static func point(degrees: Double, radius: Double, center: CGPoint) -> CGPoint {
        let radians = degrees * .pi / 180
        return CGPoint(x: center.x - radius * sin(radians), y: center.y - radius * cos(radians))
    }

    /// Splits the visible 180° in proportion to the weights (negatives count as zero), then each
    /// segment gives up half a gap on both sides. Nothing is drawn when the weights sum to zero, nor
    /// for a bucket whose share is too small to leave a segment after the gap.
    private static func segments(
        _ buckets: [BucketResumen], weight: (BucketResumen) -> Int, label: (BucketResumen) -> Int?
    ) -> [HalfDonutSegment] {
        let weights = buckets.map { Double(max(weight($0), 0)) }
        let total = weights.reduce(0, +)
        guard total > 0 else { return [] }
        var sweptSoFar = 0.0
        var result: [HalfDonutSegment] = []
        for (item, weight) in zip(buckets, weights) {
            let sweep = 180 * weight / total
            let start = sweptSoFar + gapDegrees / 2
            let end = sweptSoFar + sweep - gapDegrees / 2
            sweptSoFar += sweep
            if end > start {
                result.append(HalfDonutSegment(bucket: item.bucket, start: start, end: end, label: wholePercent(label(item))))
            }
        }
        return result
    }

    /// The ring has room for whole percentages only; the bar captions carry the exact figure.
    private static func wholePercent(_ bp: Int?) -> String {
        Format.percent(bp: bp.map { Int((Double($0) / 100).rounded()) * 100 })
    }
}

/// A ring segment between two radii, drawn as a polygon sampled every degree or less
/// (the error at these radii is a few thousandths of a point).
private struct RingSegment: Shape {
    let segment: HalfDonutSegment
    let diameter: CGFloat
    let innerRatio: CGFloat

    func path(in rect: CGRect) -> Path {
        // Centered on the trailing edge, so only the leading half is inside the frame.
        let center = CGPoint(x: rect.maxX, y: rect.midY)
        let outerRadius = Double(diameter / 2)
        let innerRadius = outerRadius * Double(innerRatio)
        let steps = max(1, Int(ceil(segment.end - segment.start)))
        let angles = (0...steps).map { segment.start + (segment.end - segment.start) * Double($0) / Double(steps) }
        // One closed outline: out along the outer arc and back along the inner one.
        var path = Path()
        path.addLines(
            angles.map { HalfDonutPresentation.point(degrees: $0, radius: outerRadius, center: center) }
                + angles.reversed().map { HalfDonutPresentation.point(degrees: $0, radius: innerRadius, center: center) }
        )
        path.closeSubpath()
        return path
    }
}

/// Two concentric rings centered on the trailing edge: the month outside, the target inside.
/// Hidden from screen readers: the bars carry the same data.
struct HalfDonut: View {
    let buckets: [BucketResumen]

    var body: some View {
        let presentation = HalfDonutPresentation(buckets: buckets)
        ZStack(alignment: .topLeading) {
            ring(presentation.outer, diameter: HalfDonutPresentation.outerDiameter,
                 innerRatio: HalfDonutPresentation.outerInnerRatio, opacity: 1, outerRing: true)
            ring(presentation.inner, diameter: HalfDonutPresentation.innerDiameter,
                 innerRatio: HalfDonutPresentation.innerInnerRatio, opacity: HalfDonutPresentation.innerOpacity, outerRing: false)
        }
        .frame(width: HalfDonutPresentation.visibleWidth, height: HalfDonutPresentation.visibleHeight)
        .accessibilityHidden(true)
    }

    private func ring(
        _ segments: [HalfDonutSegment], diameter: CGFloat, innerRatio: CGFloat, opacity: Double, outerRing: Bool
    ) -> some View {
        let center = CGPoint(x: HalfDonutPresentation.visibleWidth, y: HalfDonutPresentation.visibleHeight / 2)
        let middleRadius = Double(diameter / 2) * (1 + Double(innerRatio)) / 2
        return ZStack(alignment: .topLeading) {
            ForEach(segments, id: \.bucket) { segment in
                RingSegment(segment: segment, diameter: diameter, innerRatio: innerRatio)
                    .fill(segment.bucket.fill.opacity(opacity))
            }
            ForEach(segments.filter(\.showsLabel), id: \.bucket) { segment in
                let position = HalfDonutPresentation.point(degrees: segment.middle, radius: middleRadius, center: center)
                Text(segment.label)
                    .font(.custom("Inter-SemiBold", fixedSize: 13))
                    .mirachFigures()
                    .foregroundStyle(labelColor(segment.bucket, outerRing: outerRing))
                    .fixedSize()
                    .position(position)
            }
        }
    }

    private func labelColor(_ bucket: Bucket, outerRing: Bool) -> Color {
        if outerRing, HalfDonutPresentation.outerLabelOnBackground(bucket) { return Color.Mirach.Base.background }
        return Color.Mirach.Base.foreground
    }
}
