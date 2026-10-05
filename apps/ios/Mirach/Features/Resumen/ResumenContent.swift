import SwiftUI

/// The month with data: global state, income, the distribution chart and one row per bucket.
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
                ForEach(mes.buckets, id: \.bucket) { BucketRow(item: $0) }
            }
        }
    }

    private var summary: some View {
        VStack(alignment: .leading, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text("Estado del mes")
                    .font(.footnote)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                EstadoBadge(estado: mes.estadoGlobal)
                    .accessibilityIdentifier("resumen.estadoGlobal")
            }
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
                    .accessibilityIdentifier("resumen.ingreso")
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Mirach.Base.card)
        .overlay(Rectangle().stroke(Color.Mirach.Base.border))
        .accessibilityElement(children: .combine)
    }
}
