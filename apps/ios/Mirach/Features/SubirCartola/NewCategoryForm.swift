import SwiftUI

/// "Crear categoría" from a review row: name, group and an optional pattern prefilled with the
/// row's description. Icon and advanced match types are not offered yet.
struct NewCategoryForm: View {
    let row: CartolaRow
    let viewModel: SubirCartolaViewModel

    @State private var name = ""
    @State private var bucket: Bucket?
    @State private var pattern: String

    init(row: CartolaRow, viewModel: SubirCartolaViewModel) {
        self.row = row
        self.viewModel = viewModel
        // The API takes 1 to 200 characters.
        _pattern = State(initialValue: String(row.descripcion.trimmingCharacters(in: .whitespaces).prefix(200)))
    }

    var body: some View {
        let errors = viewModel.categoryFormErrors
        Form {
            Section {
                TextField("Nombre", text: $name)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .accessibilityIdentifier("category.name")
                fieldError(errors.name, id: "category.error.name")
            } header: { Text("Nombre") }
                .listRowBackground(Color.Mirach.Base.card)

            Section {
                bucketPicker
                fieldError(errors.bucket, id: "category.error.bucket")
            } header: { Text("Grupo") } footer: {
                Text("Define cómo cuenta este gasto en tu 50/30/20; puedes cambiarlo después, pero afecta todos los meses.")
            }
            .listRowBackground(Color.Mirach.Base.card)

            Section {
                TextField("Texto a buscar", text: $pattern)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .accessibilityIdentifier("category.pattern")
                fieldError(errors.pattern, id: "category.error.pattern")
            } header: { Text("Patrón (opcional)") } footer: {
                Text("Si la descripción de un movimiento contiene este texto, queda en esta categoría. No ignora tildes. Déjalo vacío para asignarla solo a mano.")
            }
            .listRowBackground(Color.Mirach.Base.card)

            if let general = errors.general {
                Section {
                    Text(general)
                        .foregroundStyle(Color.Mirach.Feedback.errorText)
                        .accessibilityIdentifier("category.error.general")
                }
                .listRowBackground(Color.Mirach.Base.card)
            }
        }
        .scrollContentBackground(.hidden)
        .background(Color.Mirach.Base.background.ignoresSafeArea(.all))
        .navigationTitle("Nueva categoría")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                if viewModel.isCreatingCategory {
                    ProgressView().accessibilityLabel("Creando…")
                } else {
                    Button("Crear", action: save)
                        .disabled(!canSave)
                        .accessibilityIdentifier("category.save")
                }
            }
        }
        .onAppear { viewModel.resetCategoryForm() }
        .accessibilityIdentifier("category.form")
    }

    /// Three labeled options, one per row, with a check on the chosen one (not color alone). A row
    /// each, instead of a segmented control, so the labels never get squeezed at large text sizes.
    private var bucketPicker: some View {
        ForEach(Bucket.allCases, id: \.self) { option in
            Button { bucket = option } label: {
                HStack(spacing: 8) {
                    Rectangle().fill(option.fill).frame(width: 14, height: 14).accessibilityHidden(true)
                    Text(option.label).foregroundStyle(Color.Mirach.Base.foreground)
                    Spacer()
                    if bucket == option { Image(systemName: "checkmark").accessibilityHidden(true) }
                }
                .frame(minHeight: 44)
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityAddTraits(bucket == option ? .isSelected : [])
            .accessibilityIdentifier("category.bucket.\(option.apiName)")
        }
    }

    private var canSave: Bool {
        !name.trimmingCharacters(in: .whitespaces).isEmpty && bucket != nil && !viewModel.isCreatingCategory
    }

    private func save() {
        guard let bucket else { return }
        let new = NuevaCategoria(
            nombre: name.trimmingCharacters(in: .whitespaces), bucket: bucket, patron: pattern
        )
        Task { await viewModel.createCategory(new, forRow: row.rowIndex) }
    }

    @ViewBuilder
    private func fieldError(_ text: String?, id: String) -> some View {
        if let text {
            Text(text)
                .font(.footnote)
                .foregroundStyle(Color.Mirach.Feedback.errorText)
                .accessibilityIdentifier(id)
        }
    }
}
