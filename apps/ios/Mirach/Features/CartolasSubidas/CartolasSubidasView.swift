import SwiftUI

/// Where "Cartolas subidas" is pushed from (the Subir tab).
struct CartolasSubidasRoute: Hashable {}

/// "Cartolas subidas": the user's imports, newest first, and deleting one at a time.
struct CartolasSubidasView: View {
    @State private var viewModel: CartolasSubidasViewModel
    @Environment(\.dismiss) private var dismiss
    /// VoiceOver jumps to the result of a deletion when it appears.
    @AccessibilityFocusState private var messageFocused: Bool

    /// `onChange` runs after an import is deleted, so the Resumen reloads when the person gets back to it.
    init(api: any MirachAPI, onChange: @escaping @MainActor () -> Void = {}) {
        _viewModel = State(initialValue: CartolasSubidasViewModel(api: api, onChange: onChange))
    }

    var body: some View {
        List { content }
            .listStyle(.plain)
            // The list paints its own backdrop otherwise: the page colour must reach every edge.
            .scrollContentBackground(.hidden)
            .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
            .refreshable { await viewModel.refresh() }
            .navigationTitle("Cartolas subidas")
            .navigationBarTitleDisplayMode(.inline)
            // The task restarts whenever the view reappears: that must neither blank the list nor
            // leave a load that was cancelled midway as an endless spinner.
            .task { await viewModel.loadIfNeeded() }
            // An alert gives the two explicit options (on iPhone a confirmation dialog can show as a
            // popover with no visible cancel button).
            .alert(
                "¿Eliminar esta cartola?",
                isPresented: Binding(
                    get: { viewModel.pendingDeletion != nil },
                    set: { if !$0 { viewModel.cancelDeletion() } }
                ),
                presenting: viewModel.pendingDeletion
            ) { cartola in
                Button("Eliminar", role: .destructive) { Task { await viewModel.confirmDeletion(cartola) } }
                Button("Cancelar", role: .cancel) {}
            } message: { cartola in
                Text(CartolasPresentation.confirmation(cartola))
            }
            .onChange(of: viewModel.message) {
                guard let message = viewModel.message else { return }
                messageFocused = true
                AccessibilityNotification.Announcement(message.text).post()
            }
    }

    @ViewBuilder
    private var content: some View {
        switch viewModel.state {
        case .loading:
            VStack(spacing: 12) {
                ProgressView()
                Text("Cargando cartolas…").foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("cartolas.loading")
            .plainRow()
        case .failed(let failure):
            VStack(spacing: 12) {
                Text(failure == .connection
                    ? "Problema de conexión. Revisa tu conexión e inténtalo de nuevo."
                    : "No pudimos cargar las cartolas. Inténtalo de nuevo en unos segundos.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Color.Mirach.Feedback.errorText)
                Button("Reintentar") { Task { await viewModel.retry() } }
                    .prominentButton()
                    .accessibilityIdentifier("cartolas.retry")
            }
            .frame(maxWidth: .infinity)
            .padding(.top, 48)
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("cartolas.error")
            .plainRow()
        case .loaded(let cartolas):
            notices
            if cartolas.isEmpty {
                empty
            } else {
                ForEach(cartolas) { cartola in
                    CartolaSubidaRow(
                        cartola: cartola,
                        isDeleting: viewModel.deleting.contains(cartola.id),
                        delete: { viewModel.requestDeletion(cartola) }
                    )
                }
            }
        }
    }

    @ViewBuilder
    private var notices: some View {
        if let message = viewModel.message {
            Label(message.text, systemImage: message == .deleted ? "checkmark.circle" : "exclamationmark.triangle")
                .foregroundStyle(message == .deleted ? Color.Mirach.Feedback.successText : Color.Mirach.Feedback.errorText)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(message.text)
                .accessibilityFocused($messageFocused)
                .accessibilityIdentifier("cartolas.message")
                .plainRow()
        }
        if let text = viewModel.refreshNotice {
            Label(text, systemImage: "exclamationmark.triangle")
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(text)
                .accessibilityIdentifier("cartolas.notice")
                .plainRow()
        }
    }

    private var empty: some View {
        VStack(spacing: 16) {
            Text("No hay cartolas cargadas. Sube una cartola para poder gestionarla aquí.")
                .multilineTextAlignment(.center)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            // Subir cartola is where this screen was opened from: going back is going there.
            Button("Subir cartola") { dismiss() }
                .prominentButton()
                .accessibilityIdentifier("cartolas.upload")
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 32)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("cartolas.empty")
        .plainRow()
    }
}

private extension View {
    /// A row that is not a list item: no separator, no backdrop of its own.
    func plainRow() -> some View {
        listRowBackground(Color.clear).listRowSeparator(.hidden)
    }
}

private struct CartolaSubidaRow: View {
    let cartola: CartolaSubida
    let isDeleting: Bool
    let delete: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            details
                .accessibilityElement(children: .ignore)
                .accessibilityLabel(CartolasPresentation.rowLabel(cartola))
                .accessibilityIdentifier("cartolas.row.\(cartola.id)")
            action
        }
        .padding(.vertical, 8)
        .listRowBackground(Color.Mirach.Base.background)
        .listRowSeparatorTint(Color.Mirach.Base.border)
        .swipeActions(edge: .trailing, allowsFullSwipe: false) {
            if !isDeleting {
                Button("Eliminar", role: .destructive, action: delete)
            }
        }
    }

    private var details: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(CartolasPresentation.banco(cartola))
                .font(.headline)
                .foregroundStyle(Color.Mirach.Base.foreground)
            Text(cartola.nombreArchivo)
                .font(.subheadline)
                .lineLimit(1)
                .truncationMode(.middle)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            Text(dateAndCount)
                .font(.footnote)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(Color.Mirach.Base.mutedForeground)
            status
            if let reason = CartolasPresentation.motivo(cartola) {
                Text(reason)
                    .font(.footnote)
                    // Whole words at the largest sizes, never cut by syllable.
                    .dynamicTypeSize(...DynamicTypeSize.accessibility2)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(Color.Mirach.Base.foreground)
            }
        }
    }

    private var dateAndCount: String {
        let date = Format.shortDate(cartola.fecha)
        return CartolasPresentation.movimientos(cartola).map { "\(date) · \($0)" } ?? date
    }

    /// A word and a symbol, so the status never rests on colour alone.
    private var status: some View {
        let ok = cartola.estado == .procesada
        return Label(CartolasPresentation.estado(cartola), systemImage: ok ? "checkmark.circle" : "exclamationmark.triangle")
            .font(.footnote.weight(.semibold))
            .foregroundStyle(ok ? Color.Mirach.Feedback.successText : Color.Mirach.Feedback.errorText)
    }

    @ViewBuilder
    private var action: some View {
        if isDeleting {
            HStack(spacing: 8) {
                ProgressView()
                Text("Eliminando…").foregroundStyle(Color.Mirach.Base.mutedForeground)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("cartolas.deleting.\(cartola.id)")
        } else {
            // VoiceOver does not use the swipe: the same action is a button in the row.
            Button(role: .destructive, action: delete) {
                Label("Eliminar", systemImage: "trash")
            }
            .buttonStyle(.borderless)
            .foregroundStyle(Color.Mirach.Feedback.errorText)
            .frame(minHeight: 44, alignment: .leading)
            .accessibilityLabel("Eliminar cartola de \(CartolasPresentation.banco(cartola)), \(Format.shortDate(cartola.fecha))")
            .accessibilityIdentifier("cartolas.delete.\(cartola.id)")
        }
    }
}
