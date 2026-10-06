import SwiftUI

/// Where the Resumen's income card leads: that month's incomes.
struct IngresosRoute: Hashable {
    let periodo: Periodo
}

/// "Ingresos del mes": the month's incomes with their total and origin. Read-only.
struct IngresosView: View {
    @State private var viewModel: IngresosViewModel

    init(api: any MirachAPI, periodo: Periodo) {
        _viewModel = State(initialValue: IngresosViewModel(api: api, periodo: periodo))
    }

    var body: some View {
        ScrollView {
            // Lazy: the list is never paged, so only the visible rows are built.
            LazyVStack(alignment: .leading, spacing: 12) {
                content
            }
            .padding(16)
        }
        // Pull to refresh repeats the query for the month on screen.
        .refreshable { await viewModel.refresh() }
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .navigationTitle("Ingresos")
        .navigationBarTitleDisplayMode(.inline)
        // The task restarts whenever the view reappears: that must neither drop the month nor
        // leave a load that was cancelled midway as an endless spinner.
        .task { await viewModel.loadIfNeeded() }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando ingresos…")
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("ingresos.loading")
        case .failed(let failure):
            VStack(spacing: 12) {
                Text(failure == .connection
                    ? "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                    : "No pudimos cargar los ingresos. Inténtalo de nuevo en unos segundos.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("ingresos.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityIdentifier("ingresos.error")
        case .loaded(let ingresos):
            MonthSelector(
                periodo: ingresos.periodo,
                anterior: viewModel.anterior,
                siguiente: viewModel.siguiente,
                select: { periodo in Task { await viewModel.select(periodo) } },
                idPrefix: "ingresos"
            )
            if ingresos.transacciones.isEmpty {
                VStack(spacing: 8) {
                    Text("Sin ingresos en \(Format.month(ingresos.periodo))")
                        .font(.headline)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    Text("No hay ingresos registrados para este período.")
                        .foregroundStyle(Color.Mirach.Base.mutedForeground)
                }
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.top, 32)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("ingresos.empty")
            } else {
                IngresosHeader(ingresos: ingresos)
                ForEach(ingresos.transacciones) { IngresoRow(ingreso: $0) }
            }
        }
    }
}

private struct IngresosHeader: View {
    let ingresos: IngresosMes

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(MirachCopy.Bucket.ingreso)
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            Text(Format.income(ingresos.total))
                .font(.title2.bold())
                .mirachFigures()
                // A figure must not wrap or truncate: it shrinks first.
                .lineLimit(1)
                .minimumScaleFactor(0.5)
                .foregroundStyle(Color.Mirach.Ingreso.text)
            Text(IngresosPresentation.count(ingresos.conteo))
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color.Mirach.Base.card)
        .overlay(Rectangle().stroke(Color.Mirach.Base.border))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(IngresosPresentation.headerLabel(ingresos))
        .accessibilityIdentifier("ingresos.header")
    }
}

private struct IngresoRow: View {
    let ingreso: Ingreso
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        VStack(spacing: 0) {
            content
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(IngresosPresentation.rowLabel(ingreso))
                .accessibilityIdentifier("ingresos.row.\(ingreso.id)")
            Divider().overlay(Color.Mirach.Base.border)
        }
    }

    private var content: some View {
        Group {
            if typeSize.isAccessibilitySize {
                VStack(alignment: .leading, spacing: 4) {
                    description
                    amount
                    subtitle
                }
            } else {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .firstTextBaseline, spacing: 12) {
                        description
                        Spacer(minLength: 8)
                        amount
                    }
                    subtitle
                }
            }
        }
        .padding(.vertical, 10)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var description: some View {
        Text(ingreso.descripcion)
            .font(.body)
            // The description may take several lines (never cut), capped so a long word wraps
            // by word and not by syllable at the largest sizes.
            .dynamicTypeSize(...DynamicTypeSize.accessibility2)
            .foregroundStyle(Color.Mirach.Base.foreground)
    }

    private var amount: some View {
        Text(Format.income(ingreso.monto))
            .font(.body)
            .mirachFigures()
            .lineLimit(1)
            .minimumScaleFactor(0.6)
            .foregroundStyle(Color.Mirach.Ingreso.text)
    }

    private var subtitle: some View {
        Text("\(Format.shortDate(ingreso.fecha)) · \(ingreso.origen)")
            .font(.footnote)
            // Wrap at word boundaries instead of truncating.
            .fixedSize(horizontal: false, vertical: true)
            .foregroundStyle(Color.Mirach.Base.mutedForeground)
    }
}
