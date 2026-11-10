import SwiftUI

/// Screen 04's accordion: how the server classified the new rows, bucket → category → movement,
/// with the counts and totals it sent. Read-only: editing goes through «Revisar y editar».
struct PreviewSummaryView: View {
    let preview: CartolaPreview
    /// `preview.clasificacion`, unwrapped by the caller: without it there is nothing to show.
    let clasificacion: ClasificacionPreview
    @State private var expandedBuckets: Set<Bucket> = []
    @State private var expandedCategories: Set<String> = []
    @State private var incomeExpanded = false
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(PreviewSummaryPresentation.unknownsMessage(clasificacion))
                .font(.mirach(.subheadline).weight(clasificacion.desconocidos > 0 ? .semibold : .regular))
                .foregroundStyle(clasificacion.desconocidos > 0 ? Color.Mirach.Base.foreground : Color.Mirach.Base.mutedForeground)
                .accessibilityIdentifier("subir.desconocidos")
            if clasificacion.ingresos.cantidad > 0 || !clasificacion.buckets.isEmpty {
                VStack(spacing: 0) {
                    if clasificacion.ingresos.cantidad > 0 {
                        incomeGroup
                        if !clasificacion.buckets.isEmpty { divider }
                    }
                    ForEach(clasificacion.buckets) { group in
                        bucketGroup(group)
                        if group.id != clasificacion.buckets.last?.id { divider }
                    }
                }
                .background(Color.Mirach.Base.card)
                .overlay(Rectangle().stroke(Color.Mirach.Base.border))
                // No identifier on the container: SwiftUI would hand it down to every row,
                // hiding the rows' own `subir.fila.N`.
            }
        }
    }

    // MARK: groups

    private var incomeGroup: some View {
        DisclosureGroup(isExpanded: $incomeExpanded) {
            ForEach(PreviewSummaryPresentation.incomeRows(in: preview)) { movement($0) }
        } label: {
            header(
                swatch: nil, title: PreviewSummaryPresentation.incomeTitle, count: clasificacion.ingresos.cantidad,
                amount: Format.income(clasificacion.ingresos.total), amountColor: Color.Mirach.Base.cardForeground
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PreviewSummaryPresentation.spokenSummary(of: clasificacion.ingresos))
            // The identifier goes on the label: `DisclosureGroup` does not expose its own.
            .accessibilityIdentifier("subir.ingresos")
        }
        .padding(12)
    }

    private func bucketGroup(_ group: ClasificacionPreview.BucketGroup) -> some View {
        DisclosureGroup(isExpanded: binding(for: group.bucket, in: $expandedBuckets)) {
            ForEach(group.categorias) { categoryGroup($0, in: group) }
        } label: {
            header(
                swatch: group.bucket.fill, title: PreviewSummaryPresentation.title(of: group), count: group.cantidad,
                amount: Format.expense(group.total), amountColor: Color.Mirach.Feedback.expenseText
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PreviewSummaryPresentation.spokenSummary(of: group))
            .accessibilityIdentifier("subir.bucket.\(group.bucket.apiName)")
        }
        .padding(12)
    }

    private func categoryGroup(_ categoria: ClasificacionPreview.Categoria, in group: ClasificacionPreview.BucketGroup) -> some View {
        DisclosureGroup(isExpanded: binding(for: "\(group.bucket.apiName)|\(categoria.id)", in: $expandedCategories)) {
            ForEach(PreviewSummaryPresentation.rows(of: categoria, in: preview)) { movement($0) }
        } label: {
            header(
                swatch: nil, title: categoria.nombre, count: categoria.cantidad,
                amount: Format.expense(categoria.total), amountColor: Color.Mirach.Feedback.expenseText
            )
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(PreviewSummaryPresentation.spokenSummary(of: categoria))
            .accessibilityIdentifier("subir.categoria.\(categoria.id)")
        }
        .padding(.top, 8)
        .padding(.leading, 12)
    }

    // MARK: parts

    /// Title, count and amount of a group; at accessibility sizes the amount drops under the title.
    private func header(swatch: Color?, title: String, count: Int, amount: String, amountColor: Color) -> some View {
        let layout = typeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 4))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 12))
        return layout {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                if let swatch {
                    Circle().fill(swatch).frame(width: 10, height: 10).accessibilityHidden(true)
                }
                VStack(alignment: .leading, spacing: 2) {
                    Text(title).font(.mirach(.headline)).foregroundStyle(Color.Mirach.Base.cardForeground)
                    Text(PreviewSummaryPresentation.countText(count))
                        .font(.mirach(.footnote)).foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
            }
            if !typeSize.isAccessibilitySize { Spacer(minLength: 8) }
            Text(amount).font(.mirach(.body)).mirachFigures().foregroundStyle(amountColor)
        }
    }

    private func movement(_ row: CartolaRow) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(row.descripcion).font(.mirach(.body)).foregroundStyle(Color.Mirach.Base.cardForeground).lineLimit(2)
                Text(Format.shortDate(row.fecha)).font(.mirach(.footnote)).foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            Spacer(minLength: 8)
            Text(row.amountText).font(.mirach(.body)).mirachFigures()
                .foregroundStyle(row.cargo != 0 ? Color.Mirach.Feedback.expenseText : Color.Mirach.Base.cardForeground)
        }
        .padding(.top, 8)
        .padding(.leading, 12)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("\(row.descripcion). \(row.spokenAmount). \(Format.shortDate(row.fecha))")
        .accessibilityIdentifier("subir.fila.\(row.rowIndex)")
    }

    private var divider: some View {
        Rectangle().fill(Color.Mirach.Base.border).frame(height: 1).accessibilityHidden(true)
    }

    private func binding<Key: Hashable>(for key: Key, in set: Binding<Set<Key>>) -> Binding<Bool> {
        Binding(
            get: { set.wrappedValue.contains(key) },
            set: { open in
                if open { set.wrappedValue.insert(key) } else { set.wrappedValue.remove(key) }
            }
        )
    }
}
