import Charts
import SwiftUI

/// Donut of how the month's spend split between the three buckets (catalog gap 4: the
/// slices are proportional to each bucket's `total`; nothing is computed or shown as a
/// percentage here). The legend rows next to it are the accessible way in, so the chart
/// is read as one summary.
struct DistribucionChart: View {
    let buckets: [BucketResumen]

    var body: some View {
        Chart(buckets, id: \.bucket) { item in
            // Drawing only: angles may use Double, no figure shown to the person does.
            SectorMark(
                angle: .value("Gasto", Double(max(item.total, 0))),
                innerRadius: .ratio(0.62),
                angularInset: 2
            )
            .foregroundStyle(item.bucket.fill)
        }
        .frame(height: 180)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Distribución del gasto")
        .accessibilityValue(
            buckets.map { "\($0.bucket.label) \(Format.money(max($0.total, 0)))" }.joined(separator: ", ")
        )
        .accessibilityIdentifier("resumen.chart")
    }
}
