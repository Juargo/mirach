import SwiftUI

/// Where the "Perfil de porcentajes" row of Perfil leads.
struct PerfilPresupuestoRoute: Hashable {}

/// "Perfil de porcentajes": pick one of the predefined 50/30/20-style profiles and save it.
struct PerfilPresupuestoView: View {
    @State private var viewModel: PerfilPresupuestoViewModel
    @Environment(\.dismiss) private var dismiss

    init(api: any MirachAPI, onSaved: @escaping @MainActor () -> Void) {
        _viewModel = State(initialValue: PerfilPresupuestoViewModel(api: api, onSaved: onSaved))
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: MirachSpacing.m) {
                content
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(MirachSpacing.l)
        }
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .navigationTitle("Perfil")
        .navigationBarTitleDisplayMode(.inline)
        .safeAreaInset(edge: .bottom) {
            if viewModel.loadState == .loaded { footer }
        }
        // Runs on appearing, cancelled when the screen goes away; a loaded screen is not reloaded.
        .task { if viewModel.loadState != .loaded { await viewModel.load() } }
        // Back to where it was opened from; the Resumen reload was requested by the view model.
        .onChange(of: viewModel.saveState) {
            if viewModel.saveState == .saved { dismiss() }
        }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.loadState {
        case .loading:
            VStack(spacing: MirachSpacing.m) {
                ProgressView()
                Text(PerfilPresupuestoCopy.loading)
                    .mirachText(.cuerpo)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("perfilPresupuesto.loading")
        case .failed:
            VStack(spacing: MirachSpacing.m) {
                Text(viewModel.loadFailureMessage ?? "")
                    .mirachText(.cuerpo)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.load() } }
                    .prominentButton()
                    .accessibilityIdentifier("perfilPresupuesto.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityIdentifier("perfilPresupuesto.error")
        case .loaded:
            Text(PerfilPresupuestoCopy.note)
                .mirachText(.cuerpo)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("perfilPresupuesto.note")
            ForEach(PerfilPredefinido.allCases, id: \.self) { perfil in
                PerfilCard(perfil: perfil, isSelected: viewModel.selection == perfil) {
                    viewModel.select(perfil)
                }
            }
        }
    }

    private var footer: some View {
        VStack(alignment: .leading, spacing: MirachSpacing.s) {
            if let message = viewModel.saveFailureMessage {
                Label(message, systemImage: "exclamationmark.circle")
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                    .accessibilityIdentifier("perfilPresupuesto.saveError")
            }
            Button {
                Task { await viewModel.save() }
            } label: {
                Group {
                    if viewModel.saveState == .saving { ProgressView() } else { Text("Guardar") }
                }
                .frame(maxWidth: .infinity)
            }
            .prominentButton()
            .disabled(!viewModel.canSave)
            .accessibilityLabel(viewModel.saveState == .saving ? "Guardando" : "Guardar")
            .accessibilityIdentifier("perfilPresupuesto.save")
        }
        .padding(MirachSpacing.l)
        .background(Color.Mirach.Base.background)
    }
}

/// One selectable profile: title, tag, caption and the decorative distribution bar.
private struct PerfilCard: View {
    let perfil: PerfilPredefinido
    let isSelected: Bool
    let select: () -> Void

    var body: some View {
        Button(action: select) {
            VStack(alignment: .leading, spacing: MirachSpacing.s) {
                HStack(alignment: .firstTextBaseline, spacing: MirachSpacing.s) {
                    Text(perfil.title)
                        .mirachText(.cuerpoDestacado)
                        .foregroundStyle(Color.Mirach.Base.foreground)
                    if perfil.isRecommended {
                        Text(PerfilPredefinido.recommendedTag)
                            .mirachText(.mini)
                            .foregroundStyle(Color.Mirach.Base.primary)
                    }
                    Spacer(minLength: 0)
                }
                Text(perfil.caption)
                    .mirachText(.etiqueta)
                    .foregroundStyle(Color.Mirach.Base.mutedForeground)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
                DistributionBar(shares: perfil.shares)
            }
            .padding(MirachSpacing.m)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.Mirach.Base.card)
            .overlay {
                Rectangle().strokeBorder(
                    isSelected ? Color.Mirach.Base.primary : Color.Mirach.Base.border,
                    lineWidth: isSelected ? 2 : 1
                )
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(perfil.accessibilityLabel)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
        .accessibilityIdentifier("perfilPresupuesto.card.\(perfil.rawValue)")
    }
}

/// Necesidades, Gustos and Ahorro side by side: widths proportional to the shares, 2 pt gap, 6 pt high.
private struct DistributionBar: View {
    let shares: [Int]
    private static let colors = [Color.Mirach.Bucket.necesidades, Color.Mirach.Bucket.gustos, Color.Mirach.Bucket.ahorro]
    private static let gap: CGFloat = 2

    var body: some View {
        GeometryReader { proxy in
            let usable = max(proxy.size.width - Self.gap * CGFloat(shares.count - 1), 0)
            let total = CGFloat(max(shares.reduce(0, +), 1))
            HStack(spacing: Self.gap) {
                ForEach(shares.indices, id: \.self) { index in
                    Rectangle()
                        .fill(Self.colors[index])
                        .frame(width: usable * CGFloat(shares[index]) / total)
                }
            }
        }
        .frame(height: 6)
        // Decorative: the caption already says the percentages.
        .accessibilityHidden(true)
    }
}
