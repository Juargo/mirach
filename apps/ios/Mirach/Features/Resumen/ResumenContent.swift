import SwiftUI

/// Where a bucket row leads: that bucket's detail for the month on screen.
struct BucketRoute: Hashable {
    let bucket: Bucket
    let periodo: Periodo
}

/// The month with data: income, the distribution chart and one row per bucket.
struct ResumenContent: View {
    let mes: ResumenMes

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            summary
            if mes.buckets.contains(where: { $0.total > 0 }) {
                DistribucionChart(buckets: mes.buckets)
            } else {
                Text("Sin gastos este mes")
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .frame(maxWidth: .infinity)
            }
            VStack(spacing: 8) {
                ForEach(mes.buckets, id: \.bucket) { item in
                    NavigationLink(value: BucketRoute(bucket: item.bucket, periodo: mes.periodo)) {
                        BucketRow(item: item)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
    }

    /// The incomes of the month the Resumen is on.
    static func ingresosRoute(for mes: ResumenMes) -> IngresosRoute { IngresosRoute(periodo: mes.periodo) }

    /// The income card opens the month's incomes.
    private var summary: some View {
        NavigationLink(value: Self.ingresosRoute(for: mes)) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(MirachCopy.Bucket.ingreso)
                        .font(.footnote)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    Text(Format.income(mes.totalIngreso))
                        .font(.title2.bold())
                        .mirachFigures()
                        // A figure must not wrap or truncate: it shrinks first.
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(Color.Mirach.Ingreso.text)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.footnote.bold())
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .accessibilityHidden(true)
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.Mirach.Base.card)
            .overlay(Rectangle().stroke(Color.Mirach.Base.border))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(MirachCopy.Bucket.ingreso). \(Format.spokenIncome(mes.totalIngreso))")
        .accessibilityHint("Ver los ingresos")
        .accessibilityIdentifier("resumen.ingreso")
    }
}
