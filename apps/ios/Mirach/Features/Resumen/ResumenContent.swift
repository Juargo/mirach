import SwiftUI

/// Where a bucket row leads: that bucket's detail for the month on screen.
struct BucketRoute: Hashable {
    let bucket: Bucket
    let periodo: Periodo
}

/// The month with data (Inicio): the verdict, the buckets against their targets, the half donut
/// and the income.
struct ResumenContent: View {
    let mes: ResumenMes
    @Environment(\.dynamicTypeSize) private var typeSize

    static let legend = "Anillo de afuera: tu mes. Anillo de adentro: tu meta."

    var body: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.m) {
            verdict
            if !mes.buckets.contains(where: { $0.total > 0 }) {
                Text("Sin gastos este mes")
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .frame(maxWidth: .infinity)
            }
            if typeSize.isAccessibilitySize {
                // Large text: the bars take the full width; the donut and its legend are left out.
                bars
            } else {
                VStack(alignment: .trailing, spacing: MirachSpacing.s) {
                    HStack(alignment: .top, spacing: MirachSpacing.s) {
                        bars
                        // The rings are centered on the screen's trailing edge: cancel the screen padding.
                        HalfDonut(buckets: mes.buckets).padding(.trailing, -MirachSpacing.m)
                    }
                    Text(Self.legend)
                        .mirachText(.etiqueta)
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                        .multilineTextAlignment(.trailing)
                        .accessibilityIdentifier("resumen.legend")
                }
            }
            income
        }
    }

    /// The incomes of the month the Inicio is on.
    static func ingresosRoute(for mes: ResumenMes) -> IngresosRoute { IngresosRoute(periodo: mes.periodo) }

    /// The month's verdict as the headline. Not shown when the month has no state.
    @ViewBuilder
    private var verdict: some View {
        if let estado = mes.estadoMes, let text = ResumenPresentation.verdict(for: estado) {
            HStack(spacing: MirachSpacing.s) {
                EstadoMark(estado: estado, side: 16)
                Text(text)
                    .mirachText(.titulo)
                    .foregroundStyle(Color.Mirach.Base.foreground)
            }
            .accessibilityElement(children: .combine)
            .accessibilityAddTraits(.isHeader)
            .accessibilityIdentifier("resumen.verdict")
        }
    }

    /// One bar per bucket; each opens that bucket's detail for the month on screen.
    private var bars: some View {
        VStack(spacing: 12) {
            ForEach(mes.buckets, id: \.bucket) { item in
                NavigationLink(value: BucketRoute(bucket: item.bucket, periodo: mes.periodo)) {
                    BucketBar(item: item)
                        .accessibilityHint("Ver los movimientos")
                        .accessibilityIdentifier("resumen.bucket.\(item.bucket.apiName)")
                }
                .buttonStyle(.plain)
            }
        }
    }

    /// The income row opens the month's incomes.
    private var income: some View {
        NavigationLink(value: Self.ingresosRoute(for: mes)) {
            Group {
                if typeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: MirachSpacing.xs) { incomeTexts }
                } else {
                    HStack(spacing: MirachSpacing.s) { incomeTexts }
                }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(ResumenPresentation.incomeSpoken(mes.totalIngreso, fuente: mes.fuenteIngreso))
        .accessibilityHint("Ver los ingresos")
        .accessibilityIdentifier("resumen.ingreso")
    }

    @ViewBuilder
    private var incomeTexts: some View {
        Text(ResumenPresentation.incomeLabel)
            .mirachText(.etiqueta)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
        if !typeSize.isAccessibilitySize { Spacer(minLength: MirachSpacing.s) }
        Text(ResumenPresentation.incomeValue(mes.totalIngreso, fuente: mes.fuenteIngreso))
            .mirachText(.etiqueta)
            .mirachFigures()
            .foregroundStyle(Color.Mirach.Base.foreground)
    }
}
